import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, PrismaClient, ResStatus } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'
import { notify } from '../notifications/notifications.service'
import { queueReservationMessage } from '../notifications/delivery.service'
import { nightlyRates, promoDiscount } from './pricing'
import { dispatchWebhookEvent } from '../integrations/integrations.service'

// Use the Node PostgreSQL driver so Windows development does not depend on
// Prisma's native Schannel TLS engine. The same adapter works in production.
function secureConnectionString(url: string) {
  if (!/supabase\.(co|com)/i.test(url) || /[?&]sslmode=/.test(url)) return url
  // pg 8.16+ interprets sslmode=require as verify-full unless libpq
  // compatibility is explicitly enabled. Supabase's pooler uses encrypted
  // TLS, but its certificate chain is not trusted by every Windows runtime.
  return `${url}?uselibpqcompat=true&sslmode=require`
}
const pgAdapter = new PrismaPg({ connectionString: secureConnectionString(process.env.DATABASE_URL!) })
export const db = new PrismaClient({ adapter: pgAdapter })
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Item = z.object({ roomId: z.string().uuid(), checkIn: day, checkOut: day, adults: z.number().int().min(1), children: z.number().int().min(0).default(0) })
const AddReservationExtra = z.object({ addOnId: z.string().uuid(), quantity: z.number().int().min(1).max(20) })
export const Quote = z.object({ items: z.array(Item).min(1), promoCode: z.string().optional(), packageId: z.string().uuid().optional() })
export const CreateReservation = Quote.extend({
  guest: z.object({ name: z.string().min(1), email: z.string().email().optional(), phone: z.string().optional() }),
  source: z.string().default('DIRECT'), notes: z.string().optional(),
  addOns: z.array(z.object({ addOnId: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).default([]),
})

/** Nights occupied: check-in up to, excluding, check-out. */
export function nightsBetween(ci: string, co: string): Date[] {
  const out: Date[] = []; const end = new Date(co + 'T00:00:00Z')
  for (let d = new Date(ci + 'T00:00:00Z'); d < end; d = new Date(d.getTime() + 864e5)) out.push(new Date(d))
  return out
}
const TRANSITIONS: Record<string, { from: ResStatus[]; to: ResStatus }> = {
  confirm: { from: ['PENDING'], to: 'CONFIRMED' }, 'check-in': { from: ['CONFIRMED'], to: 'CHECKED_IN' },
  'check-out': { from: ['CHECKED_IN'], to: 'CHECKED_OUT' }, cancel: { from: ['PENDING', 'CONFIRMED'], to: 'CANCELLED' },
}

@Injectable()
export class ReservationsService {
  async availability(hotelId: string, from: string, to: string) {
    const nights = nightsBetween(from, to)
    if (!nights.length) throw new BadRequestException('Check-out must be after check-in')
    return db.room.findMany({ where: { hotelId, archivedAt: null, nights: { none: { night: { in: nights } } } },
      include: { roomType: true }, orderBy: { number: 'asc' } })
  }

  private async price(tx: Prisma.TransactionClient, hotelId: string, dto: z.infer<typeof Quote>) {
    const hotel = await tx.hotel.findUniqueOrThrow({ where: { id: hotelId } })
    let subtotal = 0; const lines = []
    for (const it of dto.items) {
      const nights = nightsBetween(it.checkIn, it.checkOut)
      if (!nights.length) throw new BadRequestException('Check-out must be after check-in')
      const room = await tx.room.findFirst({ where: { id: it.roomId, hotelId, archivedAt: null }, include: { roomType: true } })
      if (!room) throw new NotFoundException('Room not found')
      if (it.adults + it.children > room.roomType.maxOccupancy) throw new BadRequestException(`Room ${room.number} exceeds max occupancy`)
      const rates = await nightlyRates(tx, hotelId, room.roomType, nights)
      const sum = rates.reduce((a, b) => a + b, 0); subtotal += sum
      lines.push({ it, nights, room: room.number, rates, sum })
    }
    const couponDiscount = dto.promoCode ? await promoDiscount(tx, hotelId, dto.promoCode, subtotal) : 0
    const pack = dto.packageId ? await tx.bookingPackage.findFirst({ where: { id: dto.packageId, hotelId, active: true } }) : null
    if (dto.packageId && !pack) throw new BadRequestException('Invalid or inactive booking package')
    const packageDiscount = pack ? Math.min(subtotal - couponDiscount, pack.fixedDiscount + Math.round((subtotal - couponDiscount) * pack.discountPercent / 100)) : 0
    const discount = couponDiscount + packageDiscount
    const tax = Math.round((subtotal - discount) * hotel.taxBp / 10000)
    return { lines, subtotal, discount, couponDiscount, packageDiscount, tax, total: subtotal - discount + tax, packageId: pack?.id || null }
  }

  quote(hotelId: string, raw: unknown) {
    const dto = Quote.parse(raw)
    return db.$transaction(async tx => {
      const q = await this.price(tx, hotelId, dto)
      return { subtotal: q.subtotal, discount: q.discount, tax: q.tax, total: q.total,
        rooms: q.lines.map(l => ({ room: l.room, nights: l.nights.length, nightly: l.rates, subtotal: l.sum })) }
    })
  }

  private async addOnQuote(tx: Prisma.TransactionClient, hotelId: string, dto: z.infer<typeof CreateReservation>) {
    if (!dto.addOns.length) return { total: 0, lines: [] as { addOnId: string; name: string; pricingType: string; unitPrice: number; quantity: number; nights: number; totalAmount: number }[] }
    const first = dto.items[0]
    const nights = nightsBetween(first.checkIn, first.checkOut).length
    const requested = new Map<string, number>()
    for (const item of dto.addOns) requested.set(item.addOnId, (requested.get(item.addOnId) || 0) + item.quantity)
    const addOns = await tx.addOn.findMany({ where: { hotelId, id: { in: [...requested.keys()] }, active: true } })
    if (addOns.length !== requested.size) throw new BadRequestException('One or more selected extras are no longer available')
    const lines = [] as { addOnId: string; name: string; pricingType: string; unitPrice: number; quantity: number; nights: number; totalAmount: number }[]
    for (const addOn of addOns) {
      const quantity = requested.get(addOn.id)!
      if (addOn.stockLimit !== null) {
        const used = await tx.reservationAddOn.aggregate({ where: { addOnId: addOn.id, reservation: { hotelId, status: { notIn: ['CANCELLED', 'NO_SHOW'] }, items: { some: { checkIn: { lt: new Date(first.checkOut) }, checkOut: { gt: new Date(first.checkIn) } } } } }, _sum: { quantity: true } })
        if ((used._sum.quantity || 0) + quantity > addOn.stockLimit) throw new ConflictException(`${addOn.name} is no longer available in the requested quantity`)
      }
      const chargeNights = addOn.pricingType === 'PER_NIGHT' ? nights : 1
      lines.push({ addOnId: addOn.id, name: addOn.name, pricingType: addOn.pricingType, unitPrice: addOn.price, quantity, nights: chargeNights, totalAmount: addOn.price * quantity * chargeNights })
    }
    return { total: lines.reduce((sum, line) => sum + line.totalAmount, 0), lines }
  }

  async create(hotelId: string, userId: string, raw: unknown) {
    const dto = CreateReservation.parse(raw)
    try {
      const created = await db.$transaction(async tx => {
        const q = await this.price(tx, hotelId, dto)
        const extras = await this.addOnQuote(tx, hotelId, dto)
        const guest = await tx.guest.create({ data: { hotelId, ...dto.guest } })
        const res = await tx.reservation.create({ data: { hotelId, guestId: guest.id, source: dto.source, notes: dto.notes, packageId: q.packageId,
          totalAmount: q.total + extras.total, discount: q.discount, taxAmount: q.tax, promoCode: dto.promoCode?.toUpperCase(),
          ref: 'M89-' + Math.random().toString(36).slice(2, 8).toUpperCase() } })
        for (const l of q.lines) {
          const item = await tx.reservationItem.create({ data: { reservationId: res.id, roomId: l.it.roomId, adults: l.it.adults,
            children: l.it.children, nightlyRate: Math.round(l.sum / l.nights.length), checkIn: new Date(l.it.checkIn), checkOut: new Date(l.it.checkOut) } })
          await tx.roomNight.createMany({ data: l.nights.map(night => ({ roomId: l.it.roomId, night, itemId: item.id })) })
        }
        if (extras.lines.length) await tx.reservationAddOn.createMany({ data: extras.lines.map(line => ({ reservationId: res.id, addOnId: line.addOnId, name: line.name, pricingType: line.pricingType, unitPrice: line.unitPrice, quantity: line.quantity, nights: line.nights, totalAmount: line.totalAmount })) })
        await tx.auditLog.create({ data: { hotelId, userId, action: 'CREATE', entity: 'Reservation', entityId: res.id } })
        return res
      })
      await notify(db, hotelId, 'BOOKING_NEW', 'New reservation ' + created.ref, 'Total LKR ' + (created.totalAmount / 100).toLocaleString())
      const hotel = await db.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { widgetConfirmationEmail: true, widgetConfirmationMessage: true } })
      if (dto.source !== 'WIDGET' || hotel.widgetConfirmationEmail) {
        const message = dto.source === 'WIDGET' && hotel.widgetConfirmationMessage
          ? hotel.widgetConfirmationMessage.replaceAll('{ref}', created.ref).replaceAll('{total}', `LKR ${(created.totalAmount / 100).toLocaleString()}`)
          : `Your reservation ${created.ref} has been received. Total: LKR ${(created.totalAmount / 100).toLocaleString()}.`
        await queueReservationMessage(hotelId, created.id, 'BOOKING_CONFIRMATION', 'Booking confirmation · ' + created.ref, message)
      }
      void dispatchWebhookEvent(hotelId, 'booking.created', { id: created.id, ref: created.ref, status: created.status, totalAmount: created.totalAmount, source: created.source })
      return created
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Room no longer available for those dates')
      if (String((e as any)?.message).includes('no_overlap')) throw new ConflictException('Room no longer available for those dates')
      throw e
    }
  }

  async transition(hotelId: string, userId: string, id: string, action: string) {
    const t = TRANSITIONS[action]; if (!t) throw new BadRequestException('Unknown action')
    const res = await db.reservation.findFirst({ where: { id, hotelId } })
    if (!res) throw new NotFoundException()
    if (!t.from.includes(res.status)) throw new BadRequestException(`Cannot ${action} a ${res.status} reservation`)
    const out = await db.$transaction(async tx => {
      if (t.to === 'CANCELLED') {
        // Keep the reservation and room assignment for history, but remove it
        // from future availability and the active-date exclusion constraint.
        await tx.roomNight.deleteMany({ where: { item: { reservationId: id } } })
        await tx.reservationItem.updateMany({ where: { reservationId: id }, data: { active: false } })
      }
      if (t.to === 'CHECKED_OUT') {
        const rooms = await tx.room.findMany({ where: { hotelId, items: { some: { reservationId: id } } }, select: { id: true, housekeeping: true } })
        await tx.room.updateMany({ where: { id: { in: rooms.map(x => x.id) } }, data: { housekeeping: 'DIRTY' } })
        for (const room of rooms) {
          if (room.housekeeping !== 'DIRTY') {
            await tx.roomStatusHistory.create({ data: { hotelId, roomId: room.id, changedById: userId, fromStatus: room.housekeeping, toStatus: 'DIRTY', note: `Room turned over after ${action}` } })
          }
          const openTask = await tx.housekeepingTask.findFirst({ where: { hotelId, roomId: room.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } } })
          if (!openTask) await tx.housekeepingTask.create({ data: { hotelId, roomId: room.id, createdById: userId, taskType: 'TURNOVER', status: 'UNASSIGNED', notes: 'Check-out completed; room needs turnover' } })
        }
      }
      await tx.auditLog.create({ data: { hotelId, userId, action: action.toUpperCase(), entity: 'Reservation', entityId: id } })
      return tx.reservation.update({ where: { id }, data: { status: t.to } })
    })
    if (t.to === 'CANCELLED') await notify(db, hotelId, 'BOOKING_CANCELLED', 'Reservation ' + res.ref + ' cancelled')
    if (t.to === 'CANCELLED') await queueReservationMessage(hotelId, res.id, 'BOOKING_CANCELLATION', 'Booking cancelled · ' + res.ref, `Your reservation ${res.ref} has been cancelled.`)
    void dispatchWebhookEvent(hotelId, t.to === 'CANCELLED' ? 'booking.cancelled' : t.to === 'CHECKED_IN' ? 'booking.checked_in' : t.to === 'CHECKED_OUT' ? 'booking.checked_out' : 'booking.updated', { id: out.id, ref: out.ref, status: out.status })
    return out
  }

  async addOn(hotelId: string, userId: string, reservationId: string, raw: unknown) {
    const dto = AddReservationExtra.parse(raw)
    const result = await db.$transaction(async tx => {
      const reservation = await tx.reservation.findFirst({ where: { id: reservationId, hotelId }, include: { items: true } })
      if (!reservation) throw new NotFoundException('Reservation not found')
      if (['CANCELLED', 'NO_SHOW', 'CHECKED_OUT'].includes(reservation.status)) throw new BadRequestException('Extras cannot be added to this reservation')
      const addOn = await tx.addOn.findFirst({ where: { id: dto.addOnId, hotelId, active: true } })
      if (!addOn) throw new NotFoundException('Add-on not found or disabled')
      const first = reservation.items[0]
      const nights = nightsBetween(first.checkIn.toISOString().slice(0, 10), first.checkOut.toISOString().slice(0, 10)).length
      if (addOn.stockLimit !== null) {
        const used = await tx.reservationAddOn.aggregate({ where: { addOnId: addOn.id, reservation: { hotelId, status: { notIn: ['CANCELLED', 'NO_SHOW'] }, items: { some: { checkIn: { lt: first.checkOut }, checkOut: { gt: first.checkIn } } } } }, _sum: { quantity: true } })
        if ((used._sum.quantity || 0) + dto.quantity > addOn.stockLimit) throw new ConflictException(`${addOn.name} is no longer available in the requested quantity`)
      }
      const chargeNights = addOn.pricingType === 'PER_NIGHT' ? nights : 1
      const line = await tx.reservationAddOn.create({ data: { reservationId, addOnId: addOn.id, name: addOn.name, pricingType: addOn.pricingType, unitPrice: addOn.price, quantity: dto.quantity, nights: chargeNights, totalAmount: addOn.price * dto.quantity * chargeNights } })
      await tx.reservation.update({ where: { id: reservationId }, data: { totalAmount: { increment: line.totalAmount } } })
      await tx.auditLog.create({ data: { hotelId, userId, action: 'ADD_EXTRA', entity: 'Reservation', entityId: reservationId } })
      return line
    })
    return result
  }

  list(hotelId: string) {
    return db.reservation.findMany({ where: { hotelId }, include: { guest: true, payments: { include: { refunds: true } }, items: { include: { room: true } }, addOns: true }, orderBy: { createdAt: 'desc' }, take: 100 })
  }
  calendar(hotelId: string, from: string, to: string) {
    return db.room.findMany({ where: { hotelId, archivedAt: null }, orderBy: { number: 'asc' }, include: { roomType: true, blocks: { where: { startDate: { lt: new Date(to) }, endDate: { gt: new Date(from) } } },
      items: { where: { active: true, checkIn: { lt: new Date(to) }, checkOut: { gt: new Date(from) } }, include: { reservation: { include: { guest: true } } } } } })
  }
}
