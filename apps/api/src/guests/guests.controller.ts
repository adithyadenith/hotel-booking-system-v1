import { Body, Controller, Get, NotFoundException, Param, Patch, Query, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { db } from '../reservations/reservations.service'

@Controller('guests')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER', 'RECEPTIONIST')
export class GuestsController {
  @Get() list(@Req() r: any, @Query('q') q = '') {
    return db.guest.findMany({ where: { hotelId: r.hotelId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}) },
      include: { _count: { select: { reservations: true } } }, orderBy: { name: 'asc' }, take: 50 })
  }
  @Get(':id') async one(@Req() r: any, @Param('id') id: string) {
    const g = await db.guest.findFirst({ where: { id, hotelId: r.hotelId }, include: { reservations: { include: { items: true }, orderBy: { createdAt: 'desc' } } } })
    if (!g) throw new NotFoundException(); return g
  }
  @Patch(':id') async update(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    const d = z.object({ name: z.string().min(1).optional(), email: z.string().email().optional(), phone: z.string().optional() }).parse(b)
    const res = await db.guest.updateMany({ where: { id, hotelId: r.hotelId }, data: d })
    if (!res.count) throw new NotFoundException(); return db.guest.findUnique({ where: { id } })
  }
}
