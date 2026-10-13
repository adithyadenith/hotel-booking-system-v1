// 20 parallel bookings for one room/dates: exactly 1 must succeed.
import { ReservationsService, db } from '../src/reservations/reservations.service'
async function main() {
  const hotel = await db.hotel.findFirstOrThrow({ where: { slug: 'ceylon-palms' } })
  const room = await db.room.findFirstOrThrow({ where: { hotelId: hotel.id } })
  const s = new ReservationsService(); const from = '2031-01-10', to = '2031-01-13'
  const r = await Promise.allSettled(Array.from({ length: 20 }, (_, i) =>
    s.create(hotel.id, 'test', { guest: { name: 'Race ' + i }, items: [{ roomId: room.id, checkIn: from, checkOut: to, adults: 1 }] })))
  const ok = r.filter(x => x.status === 'fulfilled').length
  console.log(`succeeded=${ok} rejected=${20 - ok}`); process.exit(ok === 1 ? 0 : 1)
}
main()
