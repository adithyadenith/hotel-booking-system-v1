import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { z } from 'zod'
import { db, nightsBetween, ReservationsService } from '../reservations/reservations.service'
import { PaymentsService } from '../payments/payments.service'
import { nightlyRates, promoDiscount } from '../reservations/pricing'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Search = z.object({ from: day, to: day, adults: z.coerce.number().int().min(1).max(20).default(1), children: z.coerce.number().int().min(0).max(20).default(0) })
const Booking = z.object({
  roomTypeId: z.string().uuid(), checkIn: day, checkOut: day, adults: z.number().int().min(1), children: z.number().int().min(0).default(0), promoCode: z.string().optional(),
  packageId: z.string().uuid().optional(),
  addOns: z.array(z.object({ addOnId: z.string().uuid(), quantity: z.number().int().min(1).max(20) })).default([]),
  guest: z.object({ name: z.string().min(1).max(120), email: z.string().email(), phone: z.string().max(40).optional() }) })
const HOLD_MIN = 30

@Injectable()
export class PublicService implements OnModuleInit {
  constructor(private res: ReservationsService, private pay: PaymentsService) {}

  /** Unpaid widget bookings release their rooms when the hold expires. */
  onModuleInit() {
    setInterval(async () => {
      try {
        const exp = await db.reservation.findMany({ where: { status: 'PENDING', holdExpiresAt: { lt: new Date() } }, select: { id: true, hotelId: true } })
        for (const r of exp) await this.res.transition(r.hotelId, 'system', r.id, 'cancel').catch(() => {})
      } catch { /* retry next tick */ }
    }, 60_000).unref()
  }

  private async hotel(key: string, requireEnabled = true) {
    const h = await db.hotel.findUnique({ where: { widgetKey: key } })
    if (!h || h.suspendedAt) throw new NotFoundException('Unknown booking widget')
    if (requireEnabled && !h.widgetEnabled) throw new BadRequestException('Online bookings are temporarily disabled')
    return h
  }
  private checkOrigin(h: { allowedWidgetDomains: string[] }, origin?: string) {
    if (process.env.NODE_ENV === 'production' && origin && !h.allowedWidgetDomains.includes(origin)) throw new NotFoundException('Unknown booking widget')
    if (origin && h.allowedWidgetDomains.length && !h.allowedWidgetDomains.includes(origin)) throw new NotFoundException('Unknown booking widget')
  }
  private checkDates(h: { timezone: string, widgetMinNights: number, widgetAdvanceDays: number }, from: string, to: string) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: h.timezone })
    if (from < today) throw new BadRequestException('Check-in cannot be in the past')
    if (to <= from) throw new BadRequestException('Check-out must be after check-in')
    const nights = Math.round((new Date(to + 'T00:00:00Z').getTime() - new Date(from + 'T00:00:00Z').getTime()) / 864e5)
    if (nights < h.widgetMinNights) throw new BadRequestException(`Minimum stay is ${h.widgetMinNights} night${h.widgetMinNights === 1 ? '' : 's'}`)
    if (h.widgetAdvanceDays > 0) {
      const latest = new Date(today + 'T00:00:00Z'); latest.setUTCDate(latest.getUTCDate() + h.widgetAdvanceDays)
      if (from > latest.toISOString().slice(0, 10)) throw new BadRequestException(`Bookings can be made up to ${h.widgetAdvanceDays} days in advance`)
    }
  }

  async config(key: string, origin?: string) {
    const h = await this.hotel(key, false); this.checkOrigin(h, origin)
    const [addOns, packages] = await Promise.all([
      db.addOn.findMany({ where: { hotelId: h.id, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true, category: true, pricingType: true, price: true, stockLimit: true } }),
      db.bookingPackage.findMany({ where: { hotelId: h.id, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true, discountPercent: true, fixedDiscount: true } }),
    ])
    return { name: h.name, currency: h.currency, brandColor: h.brandColor, enabled: h.widgetEnabled, logoUrl: h.widgetLogoUrl, layout: h.widgetLayout, addOns, packages,
      minNights: h.widgetMinNights, advanceDays: h.widgetAdvanceDays, maxGuests: h.widgetMaxGuests, paymentMode: h.widgetPaymentMode,
      depositPercent: h.widgetDepositPercent, confirmationMessage: h.widgetConfirmationMessage, languages: h.widgetLanguages, defaultLanguage: h.widgetDefaultLanguage,
      cancellationPolicy: h.widgetCancellationPolicy, cancellationHours: h.widgetCancellationHours, selfCancellationEnabled: h.widgetSelfCancellationEnabled, modificationEnabled: h.widgetModificationEnabled }
  }

  async availability(key: string, q: unknown, origin?: string) {
    const h = await this.hotel(key); this.checkOrigin(h, origin); const dto = Search.parse(q); this.checkDates(h, dto.from, dto.to)
    if (dto.adults + dto.children > h.widgetMaxGuests) throw new BadRequestException(`This booking accepts up to ${h.widgetMaxGuests} guests`)
    const free = (await this.res.availability(h.id, dto.from, dto.to)).filter(r => r.roomType.maxOccupancy >= dto.adults + dto.children)
    const groups = new Map<string, typeof free>()
    for (const r of free) groups.set(r.roomTypeId, [...(groups.get(r.roomTypeId) || []), r])
    return Promise.all([...groups.values()].map(async rooms => {
      const quote = await this.res.quote(h.id, { items: [{ roomId: rooms[0].id, checkIn: dto.from, checkOut: dto.to, adults: dto.adults, children: dto.children }] })
      return { roomTypeId: rooms[0].roomTypeId, name: rooms[0].roomType.name, maxOccupancy: rooms[0].roomType.maxOccupancy, available: rooms.length,
        nights: quote.rooms[0].nights, nightly: quote.rooms[0].nightly, total: quote.total }
    }))
  }

  async book(key: string, raw: unknown, origin?: string) {
    const h = await this.hotel(key); this.checkOrigin(h, origin); const dto = Booking.parse(raw); this.checkDates(h, dto.checkIn, dto.checkOut)
    if (dto.adults + dto.children > h.widgetMaxGuests) throw new BadRequestException(`This booking accepts up to ${h.widgetMaxGuests} guests`)
    const cands = (await this.res.availability(h.id, dto.checkIn, dto.checkOut)).filter(r => r.roomTypeId === dto.roomTypeId)
    for (const room of cands) {
      try {
        const r = await this.res.create(h.id, 'public', { guest: dto.guest, promoCode: dto.promoCode, packageId: dto.packageId, addOns: dto.addOns, source: 'WIDGET',
          items: [{ roomId: room.id, checkIn: dto.checkIn, checkOut: dto.checkOut, adults: dto.adults, children: dto.children }] })
        await db.reservation.update({ where: { id: r.id }, data: { holdExpiresAt: new Date(Date.now() + HOLD_MIN * 60_000) } })
        if (h.widgetPaymentMode === 'PAY_AT_HOTEL') {
          await db.reservation.update({ where: { id: r.id }, data: { status: 'CONFIRMED', holdExpiresAt: null } })
          await db.auditLog.create({ data: { hotelId: h.id, action: 'WIDGET_PAY_AT_HOTEL', entity: 'Reservation', entityId: r.id } })
          return { ref: r.ref, total: r.totalAmount, checkoutUrl: null, paymentMode: h.widgetPaymentMode, holdMinutes: 0, confirmationMessage: h.widgetConfirmationMessage }
        }
        const paymentAmount = h.widgetPaymentMode === 'DEPOSIT' ? Math.max(1, Math.ceil(r.totalAmount * h.widgetDepositPercent / 100)) : r.totalAmount
        const c = await this.pay.startCheckout(h.id, r.id, { amount: paymentAmount })
        return { ref: r.ref, total: r.totalAmount, paymentAmount, checkoutUrl: c.checkoutUrl, paymentMode: h.widgetPaymentMode, holdMinutes: HOLD_MIN, confirmationMessage: h.widgetConfirmationMessage }
      } catch (e) { if (e instanceof ConflictException) continue; throw e } // someone took that room first: try the next one
    }
    throw new ConflictException('No rooms of this type are available for those dates')
  }

  async status(key: string, ref: string, email: string, origin?: string) {
    const h = await this.hotel(key, false); this.checkOrigin(h, origin)
    const r = await db.reservation.findFirst({ where: { hotelId: h.id, ref, guest: { email: { equals: email || '', mode: 'insensitive' } } }, include: { items: { orderBy: { checkIn: 'asc' } } } })
    if (!r) throw new NotFoundException()
    return { ref: r.ref, status: r.status, total: r.totalAmount, paid: r.depositPaid, checkIn: r.items[0]?.checkIn, checkOut: r.items[0]?.checkOut, cancellationPolicy: h.widgetCancellationPolicy, cancellationAllowed: h.widgetSelfCancellationEnabled && this.canCancel(h as any, r.items[0]?.checkIn) }
  }

  private canCancel(h: { cancellationHours?: number }, checkIn?: Date) {
    if (!checkIn) return false
    return Date.now() <= new Date(checkIn).getTime() - (h.cancellationHours ?? 48) * 3600000
  }

  async cancel(key: string, ref: string, raw: unknown, origin?: string) {
    const h = await this.hotel(key, false); this.checkOrigin(h, origin)
    const d = z.object({ email: z.string().email() }).parse(raw)
    const r = await db.reservation.findFirst({ where: { hotelId: h.id, ref, guest: { email: { equals: d.email, mode: 'insensitive' } } }, include: { items: { orderBy: { checkIn: 'asc' } } } })
    if (!r) throw new NotFoundException('Booking not found')
    if (!h.widgetSelfCancellationEnabled || !this.canCancel(h as any, r.items[0]?.checkIn)) throw new BadRequestException(`This booking is outside the ${h.widgetCancellationHours}-hour cancellation window`)
    if (!['PENDING', 'CONFIRMED'].includes(r.status)) throw new BadRequestException('This booking cannot be cancelled')
    await this.res.transition(h.id, 'public', r.id, 'cancel')
    return { ref: r.ref, status: 'CANCELLED' }
  }

  async modify(key: string, ref: string, raw: unknown, origin?: string) {
    const h = await this.hotel(key, false); this.checkOrigin(h, origin)
    if (!h.widgetModificationEnabled) throw new BadRequestException('Online booking modifications are disabled')
    const d = z.object({ email: z.string().email(), checkIn: day, checkOut: day, adults: z.number().int().min(1), children: z.number().int().min(0).default(0) }).parse(raw)
    this.checkDates(h, d.checkIn, d.checkOut)
    const current = await db.reservation.findFirst({ where: { hotelId: h.id, ref, guest: { email: { equals: d.email, mode: 'insensitive' } } }, include: { items: { orderBy: { checkIn: 'asc' } }, addOns: true } })
    if (!current) throw new NotFoundException('Booking not found')
    if (!['PENDING', 'CONFIRMED'].includes(current.status)) throw new BadRequestException('This booking cannot be modified')
    const old = current.items[0]
    const nights = nightsBetween(d.checkIn, d.checkOut)
    const updated = await db.$transaction(async tx => {
      await tx.roomNight.deleteMany({ where: { itemId: old.id } })
      const room = await tx.room.findFirst({ where: { hotelId: h.id, roomTypeId: (await tx.room.findUniqueOrThrow({ where: { id: old.roomId } })).roomTypeId, archivedAt: null, nights: { none: { night: { in: nights } } } }, include: { roomType: true } })
      if (!room || room.roomType.maxOccupancy < d.adults + d.children) throw new ConflictException('No room of the same type is available for the new dates')
      const rates = await nightlyRates(tx, h.id, room.roomType, nights)
      const subtotal = rates.reduce((sum, rate) => sum + rate, 0)
      const couponDiscount = current.promoCode ? await promoDiscount(tx, h.id, current.promoCode, subtotal) : 0
      const pack = current.packageId ? await tx.bookingPackage.findFirst({ where: { id: current.packageId, hotelId: h.id, active: true } }) : null
      const packageDiscount = pack ? Math.min(subtotal - couponDiscount, pack.fixedDiscount + Math.round((subtotal - couponDiscount) * pack.discountPercent / 100)) : 0
      const tax = Math.round((subtotal - couponDiscount - packageDiscount) * h.taxBp / 10000)
      const extrasTotal = current.addOns.reduce((sum, extra) => sum + extra.unitPrice * extra.quantity * (extra.pricingType === 'PER_NIGHT' ? nights.length : 1), 0)
      const total = subtotal - couponDiscount - packageDiscount + tax + extrasTotal
      await tx.reservationItem.update({ where: { id: old.id }, data: { roomId: room.id, checkIn: new Date(d.checkIn), checkOut: new Date(d.checkOut), adults: d.adults, children: d.children } })
      await tx.roomNight.createMany({ data: nights.map(night => ({ roomId: room.id, night, itemId: old.id })) })
      for (const extra of current.addOns) {
        const extraNights = extra.pricingType === 'PER_NIGHT' ? nights.length : 1
        await tx.reservationAddOn.update({ where: { id: extra.id }, data: { nights: extraNights, totalAmount: extra.unitPrice * extra.quantity * extraNights } })
      }
      await tx.auditLog.create({ data: { hotelId: h.id, userId: null, action: 'PUBLIC_MODIFY', entity: 'Reservation', entityId: current.id } })
      return tx.reservation.update({ where: { id: current.id }, data: { totalAmount: total, taxAmount: tax, discount: couponDiscount + packageDiscount } })
    })
    return { ref: updated.ref, status: updated.status, total: updated.totalAmount, checkIn: d.checkIn, checkOut: d.checkOut }
  }
}
