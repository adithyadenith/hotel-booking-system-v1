import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { z } from 'zod'
import { db, ReservationsService } from '../reservations/reservations.service'
import { PaymentsService } from '../payments/payments.service'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Search = z.object({ from: day, to: day, adults: z.coerce.number().int().min(1).max(20).default(1), children: z.coerce.number().int().min(0).max(20).default(0) })
const Booking = z.object({
  roomTypeId: z.string().uuid(), checkIn: day, checkOut: day, adults: z.number().int().min(1), children: z.number().int().min(0).default(0), promoCode: z.string().optional(),
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
    const addOns = await db.addOn.findMany({ where: { hotelId: h.id, active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, description: true, category: true, pricingType: true, price: true, stockLimit: true } })
    return { name: h.name, currency: h.currency, brandColor: h.brandColor, enabled: h.widgetEnabled, logoUrl: h.widgetLogoUrl, layout: h.widgetLayout, addOns,
      minNights: h.widgetMinNights, advanceDays: h.widgetAdvanceDays, maxGuests: h.widgetMaxGuests, paymentMode: h.widgetPaymentMode,
      depositPercent: h.widgetDepositPercent, confirmationMessage: h.widgetConfirmationMessage }
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
        const r = await this.res.create(h.id, 'public', { guest: dto.guest, promoCode: dto.promoCode, addOns: dto.addOns, source: 'WIDGET',
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
    const h = await this.hotel(key); this.checkOrigin(h, origin)
    const r = await db.reservation.findFirst({ where: { hotelId: h.id, ref, guest: { email: { equals: email || '', mode: 'insensitive' } } } })
    if (!r) throw new NotFoundException()
    return { ref: r.ref, status: r.status, total: r.totalAmount, paid: r.depositPaid }
  }
}
