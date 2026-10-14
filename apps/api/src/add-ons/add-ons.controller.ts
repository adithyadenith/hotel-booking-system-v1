import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { db } from '../reservations/reservations.service'

const AddOnInput = z.object({
  name: z.string().min(1).max(100), description: z.string().max(300).optional().nullable(), category: z.string().min(1).max(40).default('EXTRA'),
  pricingType: z.enum(['PER_NIGHT', 'PER_BOOKING']), price: z.number().int().min(0), stockLimit: z.number().int().min(0).nullable().optional(), active: z.boolean().optional(),
})

@Controller('add-ons')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class AddOnsController {
  @Get() @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST') list(@Req() r: any) { return db.addOn.findMany({ where: { hotelId: r.hotelId }, orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] }) }

  @Post() async create(@Req() r: any, @Body() body: unknown) {
    const d = AddOnInput.parse(body)
    const item = await db.addOn.create({ data: { hotelId: r.hotelId, ...d, stockLimit: d.stockLimit ?? null } })
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'ADD_ON_CREATED', entity: 'AddOn', entityId: item.id } })
    return item
  }

  @Patch(':id') async update(@Req() r: any, @Param('id') id: string, @Body() body: unknown) {
    const d = AddOnInput.partial().parse(body)
    const existing = await db.addOn.findFirst({ where: { id, hotelId: r.hotelId } })
    if (!existing) throw new NotFoundException('Add-on not found')
    const item = await db.addOn.update({ where: { id }, data: { ...d, ...(d.stockLimit !== undefined ? { stockLimit: d.stockLimit ?? null } : {}) } })
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'ADD_ON_UPDATED', entity: 'AddOn', entityId: item.id } })
    return item
  }

  @Delete(':id') async remove(@Req() r: any, @Param('id') id: string) {
    const existing = await db.addOn.findFirst({ where: { id, hotelId: r.hotelId } })
    if (!existing) throw new NotFoundException('Add-on not found')
    const item = await db.addOn.update({ where: { id }, data: { active: false } })
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'ADD_ON_DISABLED', entity: 'AddOn', entityId: item.id } })
    return item
  }
}
