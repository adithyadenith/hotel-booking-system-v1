import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common'
import { z } from 'zod'
import { db, ReservationsService } from '../reservations/reservations.service'
import { PaymentsService } from '../payments/payments.service'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Search = z.object({ from: day, to: day, adults: z.coerce.number().int().min(1).max(20).default(1), children: z.coerce.number().int().min(0).max(20).default(0) })
const Booking = z.object({
  roomTypeId: z.string().uuid(), checkIn: day, checkOut: day, adults: z.number().int().min(1), children: z.number().int().min(0).default(0), promoCode: z.string().optional(),
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

  private async hotel(key: string) {
    const h = await db.hotel.findUnique({ where: { widgetKey: key } })
    if (!h || h.suspendedAt) throw new NotFoundException('Unknown booking widget')
    return h
  }
  private checkOrigin(h: { allowedWidgetDomains: string[] }, origin?: string) {
    if (origin && h.allowedWidgetDomains.length && !h.allowedWidgetDomains.includes(origin)) throw new NotFoundException('Unknown booking widget')
  }
  private checkDates(h: { timezone: string }, from: string, to: string) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: h.timezone })
    if (from < today) throw new BadRequestException('Check-in cannot be in the past')
    if (to <= from) throw new BadRequestException('Check-out must be after check-in')
  }

  async config(key: string, origin?: string) { const h = await this.hotel(key); this.checkOrigin(h, origin); return { name: h.name, currency: h.currency, brandColor: h.brandColor } }

  async availability(key: string, q: unknown, origin?: string) {
    const h = await this.hotel(key); this.checkOrigin(h, origin); const dto = Search.parse(q); this.checkDates(h, dto.from, dto.to)
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
    const cands = (await this.res.availability(h.id, dto.checkIn, dto.checkOut)).filter(r => r.roomTypeId === dto.roomTypeId)
    for (const room of cands) {
      try {
        const r = await this.res.create(h.id, 'public', { guest: dto.guest, promoCode: dto.promoCode, source: 'WIDGET',
          items: [{ roomId: room.id, checkIn: dto.checkIn, checkOut: dto.checkOut, adults: dto.adults, children: dto.children }] })
        await db.reservation.update({ where: { id: r.id }, data: { holdExpiresAt: new Date(Date.now() + HOLD_MIN * 60_000) } })
        const c = await this.pay.startCheckout(h.id, r.id, { amount: r.totalAmount })
        return { ref: r.ref, total: r.totalAmount, checkoutUrl: c.checkoutUrl, holdMinutes: HOLD_MIN }
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
