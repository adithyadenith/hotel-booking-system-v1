import { BadRequestException, Controller, Get, Header, NotFoundException, Param, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard, Roles } from '../common/guards'
import { db, nightsBetween } from '../reservations/reservations.service'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const money = (c: number) => (c / 100).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

@Controller()
@UseGuards(AuthGuard)
export class ReportsController {
  /** Room revenue = sum of nightly rates for occupied nights (before discount/tax). ADR = revenue / rooms sold. RevPAR = revenue / available room-nights. */
  private async build(hotelId: string, from: string, to: string) {
    const days = nightsBetween(from, to)
    if (!days.length || days.length > 366) throw new BadRequestException('Range must be 1 to 366 days')
    const [rooms, nights, created, pays, open] = await Promise.all([
      db.room.count({ where: { hotelId, archivedAt: null } }),
      db.roomNight.findMany({ where: { room: { hotelId }, itemId: { not: null }, night: { gte: days[0], lt: new Date(to + 'T00:00:00Z') } }, select: { night: true, item: { select: { nightlyRate: true } } } }),
      db.reservation.findMany({ where: { hotelId, createdAt: { gte: new Date(from), lt: new Date(to) } }, select: { status: true, source: true, totalAmount: true } }),
      db.payment.findMany({ where: { status: 'SUCCEEDED', reservation: { hotelId }, createdAt: { gte: new Date(from), lt: new Date(to) } }, select: { amount: true, provider: true } }),
      db.reservation.findMany({ where: { hotelId, status: { notIn: ['CANCELLED', 'NO_SHOW'] } }, select: { totalAmount: true, depositPaid: true } }),
    ])
    const byDay = new Map(days.map(d => [iso(d), { date: iso(d), sold: 0, revenue: 0 }]))
    for (const n of nights) { const x = byDay.get(iso(n.night)); if (x) { x.sold++; x.revenue += n.item!.nightlyRate } }
    const daily = [...byDay.values()].map(d => ({ ...d, occupancyPct: rooms ? +(d.sold / rooms * 100).toFixed(1) : 0 }))
    const sold = daily.reduce((a, d) => a + d.sold, 0), revenue = daily.reduce((a, d) => a + d.revenue, 0), avail = rooms * days.length
    const cancelled = created.filter(r => r.status === 'CANCELLED').length
    const sources: Record<string, { bookings: number; value: number }> = {}
    for (const r of created) { const s = (sources[r.source] ||= { bookings: 0, value: 0 }); s.bookings++; s.value += r.totalAmount }
    const methods: Record<string, number> = {}; for (const p of pays) methods[p.provider] = (methods[p.provider] || 0) + p.amount
    return { rooms, days: days.length, daily, roomRevenue: revenue, roomsSold: sold, occupancyPct: avail ? +(sold / avail * 100).toFixed(1) : 0,
      adr: sold ? Math.round(revenue / sold) : 0, revpar: avail ? Math.round(revenue / avail) : 0,
      bookings: created.length, cancellationRatePct: created.length ? +(cancelled / created.length * 100).toFixed(1) : 0,
      collected: pays.reduce((a, p) => a + p.amount, 0), collectedByMethod: methods, outstanding: open.reduce((a, r) => a + r.totalAmount - r.depositPaid, 0), sources }
  }

  @Get('reports/summary') @Roles('ADMIN', 'MANAGER') summary(@Req() r: any, @Query('from') f: string, @Query('to') t: string) { return this.build(r.hotelId, f, t) }

  @Get('reports/daily.csv') @Roles('ADMIN', 'MANAGER') @Header('Content-Type', 'text/csv')
  async csv(@Req() r: any, @Query('from') f: string, @Query('to') t: string) {
    const s = await this.build(r.hotelId, f, t)
    return ['date,rooms_sold,occupancy_pct,room_revenue_lkr', ...s.daily.map(d => `${d.date},${d.sold},${d.occupancyPct},${(d.revenue / 100).toFixed(2)}`)].join('\n')
  }

  @Get('reservations/:id/invoice') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST') @Header('Content-Type', 'text/html')
  async invoice(@Req() r: any, @Param('id') id: string) {
    const [res, hotel] = await Promise.all([
      db.reservation.findFirst({ where: { id, hotelId: r.hotelId }, include: { guest: true, payments: { where: { status: 'SUCCEEDED' } }, items: { include: { room: { include: { roomType: true } } } } } }),
      db.hotel.findUniqueOrThrow({ where: { id: r.hotelId } })])
    if (!res) throw new NotFoundException()
    const rows = res.items.map(i => { const n = nightsBetween(iso(i.checkIn), iso(i.checkOut)).length
      return `<tr><td>Room ${esc(i.room.number)} (${esc(i.room.roomType.name)})</td><td>${iso(i.checkIn)} → ${iso(i.checkOut)}</td><td>${n}</td><td align=right>${money(i.nightlyRate)}</td><td align=right>${money(i.nightlyRate * n)}</td></tr>` }).join('')
    const subtotal = res.totalAmount - res.taxAmount + res.discount
    const line = (l: string, v: number, b = false) => `<tr><td colspan=4 align=right>${b ? '<b>' + l + '</b>' : l}</td><td align=right>${b ? '<b>' : ''}${money(v)}${b ? '</b>' : ''}</td></tr>`
    return `<!doctype html><meta charset=utf-8><title>Invoice ${esc(res.ref)}</title><body style="font-family:sans-serif;max-width:760px;margin:30px auto;color:#0F172A">
      <h1>${esc(hotel.name)}</h1><h2>Invoice ${esc(res.ref)}</h2><p>Guest: <b>${esc(res.guest.name)}</b><br>Issued: ${iso(new Date())} · Currency: ${hotel.currency}</p>
      <table width=100% cellpadding=8 style="border-collapse:collapse" border=1><tr><th align=left>Room</th><th align=left>Stay</th><th>Nights</th><th align=right>Rate</th><th align=right>Amount</th></tr>${rows}
      ${line('Subtotal (approx. from average nightly rates)', subtotal)}${res.discount ? line('Discount' + (res.promoCode ? ' (' + esc(res.promoCode) + ')' : ''), -res.discount) : ''}${res.taxAmount ? line('Tax & fees', res.taxAmount) : ''}
      ${line('Total', res.totalAmount, true)}${line('Paid', res.depositPaid)}${line('Balance due', res.totalAmount - res.depositPaid, true)}</table>
      <p><button onclick="print()">Print / Save as PDF</button></p></body>`
  }
}
