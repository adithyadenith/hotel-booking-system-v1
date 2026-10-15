import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { db } from '../reservations/reservations.service'

const PackageInput = z.object({ name: z.string().min(1).max(100), description: z.string().max(300).optional().nullable(), discountPercent: z.number().int().min(0).max(100).default(0), fixedDiscount: z.number().int().min(0).default(0), active: z.boolean().optional() })

@Controller('packages')
@UseGuards(AuthGuard)
export class PackagesController {
  @Get() @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST') list(@Req() r: any) { return db.bookingPackage.findMany({ where: { hotelId: r.hotelId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }) }
  @Post() @Roles('ADMIN', 'MANAGER') async create(@Req() r: any, @Body() body: unknown) { const d = PackageInput.parse(body); const item = await db.bookingPackage.create({ data: { hotelId: r.hotelId, ...d } }); await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'PACKAGE_CREATED', entity: 'BookingPackage', entityId: item.id } }); return item }
  @Patch(':id') @Roles('ADMIN', 'MANAGER') async update(@Req() r: any, @Param('id') id: string, @Body() body: unknown) { const existing = await db.bookingPackage.findFirst({ where: { id, hotelId: r.hotelId } }); if (!existing) throw new NotFoundException('Package not found'); const d = PackageInput.partial().parse(body); return db.bookingPackage.update({ where: { id }, data: d }) }
  @Delete(':id') @Roles('ADMIN', 'MANAGER') async remove(@Req() r: any, @Param('id') id: string) { const existing = await db.bookingPackage.findFirst({ where: { id, hotelId: r.hotelId } }); if (!existing) throw new NotFoundException('Package not found'); return db.bookingPackage.update({ where: { id }, data: { active: false } }) }
}
