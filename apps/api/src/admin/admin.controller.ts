import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { db, nightsBetween } from '../reservations/reservations.service'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Type = z.object({ name: z.string().min(1).max(60), baseRate: z.number().int().min(0), maxOccupancy: z.number().int().min(1).max(20) })
const Room = z.object({ number: z.string().min(1).max(10), roomTypeId: z.string().uuid(), floor: z.number().int().min(0).max(100) })
const Rule = z.object({ name: z.string().min(1).max(80), type: z.enum(['SEASON', 'SPECIAL', 'WEEKEND']), roomTypeId: z.string().uuid().nullable().optional(),
  startDate: day.optional(), endDate: day.optional(), multiplierBp: z.number().int().min(1000).max(50000) })
  .refine(r => r.type === 'WEEKEND' || (r.startDate && r.endDate && r.endDate >= r.startDate), { message: 'Season/special rules need a valid start and end date' })
const Promo = z.object({ code: z.string().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/), percentOff: z.number().int().min(1).max(100) })
const HotelSettings = z.object({
  name: z.string().min(2).max(120),
  timezone: z.string().min(1).max(80),
  currency: z.string().regex(/^[A-Z]{3}$/),
  taxPercent: z.number().min(0).max(50)
})
const ROLES = ['ADMIN', 'MANAGER', 'RECEPTIONIST', 'HOUSEKEEPING'] as const
const dup = (e: unknown, msg: string) => { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(msg); throw e }
const found = (n: number) => { if (!n) throw new NotFoundException() }

/** Hotel setup: room types, rooms, rate rules, promos, staff. Every query is scoped to the caller's hotel. */
@Controller()
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class AdminController {
  private async ownType(hotelId: string, id?: string | null) { if (id && !(await db.roomType.findFirst({ where: { id, hotelId } }))) throw new BadRequestException('Unknown room type') }

  @Get('hotel-settings') settings(@Req() r: any) {
    return db.hotel.findUniqueOrThrow({ where: { id: r.hotelId }, select: { name: true, slug: true, timezone: true, currency: true, taxBp: true, brandColor: true, widgetKey: true } })
  }
  @Patch('hotel-settings') @Roles('ADMIN') async updateSettings(@Req() r: any, @Body() b: unknown) {
    const d = HotelSettings.parse(b)
    const out = await db.hotel.update({ where: { id: r.hotelId }, data: { name: d.name, timezone: d.timezone, currency: d.currency, taxBp: Math.round(d.taxPercent * 100) }, select: { name: true, slug: true, timezone: true, currency: true, taxBp: true, brandColor: true, widgetKey: true } })
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'HOTEL_SETTINGS_UPDATED', entity: 'Hotel', entityId: r.hotelId } })
    return out
  }

  @Get('room-types') types(@Req() r: any) { return db.roomType.findMany({ where: { hotelId: r.hotelId }, orderBy: { name: 'asc' } }) }
  @Post('room-types') createType(@Req() r: any, @Body() b: unknown) { return db.roomType.create({ data: { hotelId: r.hotelId, ...Type.parse(b) } }) }
  @Patch('room-types/:id') async patchType(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    found((await db.roomType.updateMany({ where: { id, hotelId: r.hotelId }, data: Type.partial().parse(b) })).count); return { ok: true }
  }

  @Get('rooms') rooms(@Req() r: any) { return db.room.findMany({ where: { hotelId: r.hotelId }, include: { roomType: true }, orderBy: { number: 'asc' } }) }
  @Post('rooms') async createRoom(@Req() r: any, @Body() b: unknown) {
    const d = Room.parse(b); await this.ownType(r.hotelId, d.roomTypeId)
    try { return await db.room.create({ data: { hotelId: r.hotelId, ...d } }) } catch (e) { return dup(e, 'Room number already exists') }
  }
  @Patch('rooms/:id') async patchRoom(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    const d = Room.omit({ number: true }).partial().extend({ archived: z.boolean().optional() }).parse(b); await this.ownType(r.hotelId, d.roomTypeId)
    const { archived, ...rest } = d
    if (archived) {
      const today = new Date(new Date().toISOString().slice(0, 10))
      if (await db.roomNight.count({ where: { roomId: id, room: { hotelId: r.hotelId }, night: { gte: today } } })) throw new BadRequestException('Room has upcoming reservations; move or cancel them first')
    }
    found((await db.room.updateMany({ where: { id, hotelId: r.hotelId }, data: { ...rest, ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }) } })).count); return { ok: true }
  }

  @Get('rate-rules') rules(@Req() r: any) { return db.rateRule.findMany({ where: { hotelId: r.hotelId }, orderBy: { name: 'asc' } }) }
  @Post('rate-rules') async createRule(@Req() r: any, @Body() b: unknown) {
    const d = Rule.parse(b); await this.ownType(r.hotelId, d.roomTypeId)
    return db.rateRule.create({ data: { hotelId: r.hotelId, name: d.name, type: d.type, roomTypeId: d.roomTypeId ?? null, multiplierBp: d.multiplierBp,
      startDate: d.startDate ? new Date(d.startDate) : null, endDate: d.endDate ? new Date(d.endDate) : null } })
  }
  @Patch('rate-rules/:id') async patchRule(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    found((await db.rateRule.updateMany({ where: { id, hotelId: r.hotelId }, data: z.object({ active: z.boolean() }).parse(b) })).count); return { ok: true }
  }
  @Delete('rate-rules/:id') async delRule(@Req() r: any, @Param('id') id: string) { found((await db.rateRule.deleteMany({ where: { id, hotelId: r.hotelId } })).count); return { ok: true } }

  @Get('promo-codes') promos(@Req() r: any) { return db.promoCode.findMany({ where: { hotelId: r.hotelId }, orderBy: { code: 'asc' } }) }
  @Post('promo-codes') async createPromo(@Req() r: any, @Body() b: unknown) {
    const d = Promo.parse(b)
    try { return await db.promoCode.create({ data: { hotelId: r.hotelId, code: d.code.toUpperCase(), percentOff: d.percentOff } }) } catch (e) { return dup(e, 'Promo code already exists') }
  }
  @Patch('promo-codes/:id') async patchPromo(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    found((await db.promoCode.updateMany({ where: { id, hotelId: r.hotelId }, data: z.object({ active: z.boolean() }).parse(b) })).count); return { ok: true }
  }

  @Get('maintenance-blocks') blocks(@Req() r: any) {
    return db.maintenanceBlock.findMany({ where: { hotelId: r.hotelId, endDate: { gte: new Date(new Date().toISOString().slice(0, 10)) } }, include: { room: true }, orderBy: { startDate: 'asc' } })
  }
  @Post('maintenance-blocks') async block(@Req() r: any, @Body() b: unknown) {
    const d = z.object({ roomId: z.string().uuid(), startDate: day, endDate: day, reason: z.string().max(200).default('') })
      .refine(x => x.endDate > x.startDate, { message: 'End must be after start' }).parse(b)
    if (!(await db.room.findFirst({ where: { id: d.roomId, hotelId: r.hotelId } }))) throw new BadRequestException('Unknown room')
    try {
      return await db.$transaction(async tx => {
        const overlappingReservation = await tx.reservationItem.findFirst({
          where: { roomId: d.roomId, active: true, checkIn: { lt: new Date(d.endDate) }, checkOut: { gt: new Date(d.startDate) }, reservation: { hotelId: r.hotelId, status: { notIn: ['CANCELLED', 'NO_SHOW'] } } },
          select: { id: true },
        })
        if (overlappingReservation) throw new ConflictException('Those dates overlap an existing reservation')
        const blk = await tx.maintenanceBlock.create({ data: { hotelId: r.hotelId, roomId: d.roomId, startDate: new Date(d.startDate), endDate: new Date(d.endDate), reason: d.reason } })
        await tx.roomNight.createMany({ data: nightsBetween(d.startDate, d.endDate).map(night => ({ roomId: d.roomId, night, blockId: blk.id })) })
        await tx.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'MAINTENANCE_BLOCK', entity: 'MaintenanceBlock', entityId: blk.id } })
        return blk
      })
    } catch (e) { return dup(e, 'Those dates overlap an existing reservation or block') }
  }
  @Delete('maintenance-blocks/:id') async unblock(@Req() r: any, @Param('id') id: string) { found((await db.maintenanceBlock.deleteMany({ where: { id, hotelId: r.hotelId } })).count); await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'MAINTENANCE_UNBLOCK', entity: 'MaintenanceBlock', entityId: id } }); return { ok: true } }

  @Get('staff') @Roles('ADMIN') async staff(@Req() r: any) {
    const m = await db.membership.findMany({ where: { hotelId: r.hotelId }, include: { user: true }, orderBy: { role: 'asc' } })
    return m.map(x => ({ userId: x.userId, name: x.user.name, email: x.user.email, role: x.role }))
  }
  @Post('staff') @Roles('ADMIN') async addStaff(@Req() r: any, @Body() b: unknown) {
    const d = z.object({ name: z.string().min(1), email: z.string().email().transform(s => s.toLowerCase()), password: z.string().min(10).optional(), role: z.enum(ROLES) }).parse(b)
    let u = await db.user.findUnique({ where: { email: d.email } })
    if (!u) { if (!d.password) throw new BadRequestException('A password (min 10 characters) is required for new users'); u = await db.user.create({ data: { email: d.email, name: d.name, passwordHash: await bcrypt.hash(d.password, 10) } }) }
    try { await db.membership.create({ data: { userId: u.id, hotelId: r.hotelId, role: d.role } }) } catch (e) { return dup(e, 'Already a member of this hotel') }
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'STAFF_ADD', entity: 'User', entityId: u.id } })
    return { userId: u.id, email: u.email, role: d.role }
  }
  @Patch('staff/:userId') @Roles('ADMIN') async setRole(@Req() r: any, @Param('userId') id: string, @Body() b: unknown) {
    if (id === r.user.id) throw new BadRequestException('You cannot change your own role')
    found((await db.membership.updateMany({ where: { userId: id, hotelId: r.hotelId }, data: { role: z.object({ role: z.enum(ROLES) }).parse(b).role } })).count)
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'STAFF_ROLE', entity: 'User', entityId: id } }); return { ok: true }
  }
  @Delete('staff/:userId') @Roles('ADMIN') async removeStaff(@Req() r: any, @Param('userId') id: string) {
    if (id === r.user.id) throw new BadRequestException('You cannot remove yourself')
    found((await db.membership.deleteMany({ where: { userId: id, hotelId: r.hotelId } })).count)
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'STAFF_REMOVE', entity: 'User', entityId: id } }); return { ok: true }
  }
}
