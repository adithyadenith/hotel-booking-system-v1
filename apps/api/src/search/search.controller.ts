import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { db } from '../reservations/reservations.service'

const SearchQuery = z.object({ q: z.string().trim().min(2).max(80) })

@Controller('search')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
export class SearchController {
  @Get()
  async search(@Req() r: any, @Query() query: unknown) {
    const { q } = SearchQuery.parse(query)
    const contains = { contains: q, mode: 'insensitive' as const }
    const [guests, bookings] = await Promise.all([
      db.guest.findMany({
        where: { hotelId: r.hotelId, OR: [{ name: contains }, { email: contains }, { phone: { contains: q } }] },
        select: { id: true, name: true, email: true, phone: true, _count: { select: { reservations: true } } },
        orderBy: { name: 'asc' }, take: 6
      }),
      db.reservation.findMany({
        where: { hotelId: r.hotelId, OR: [{ ref: contains }, { guest: { name: contains } }, { guest: { email: contains } }, { guest: { phone: { contains: q } } }] },
        select: { id: true, ref: true, status: true, totalAmount: true, depositPaid: true, createdAt: true, guest: { select: { name: true, email: true } }, items: { select: { checkIn: true, checkOut: true, room: { select: { number: true } } }, take: 1 } },
        orderBy: { createdAt: 'desc' }, take: 8
      })
    ])
    return { guests, bookings }
  }
}
