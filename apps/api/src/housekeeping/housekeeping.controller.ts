import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Req, UseGuards, BadRequestException } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { db } from '../reservations/reservations.service'
import { notify } from '../notifications/notifications.service'

const Update = z.object({
  status: z.enum(['CLEAN', 'DIRTY', 'CLEANING', 'INSPECTION', 'OUT_OF_SERVICE']).optional(),
  assigneeId: z.string().uuid().nullable().optional(), notes: z.string().max(500).optional(),
})

@Controller('housekeeping')
@UseGuards(AuthGuard)
export class HousekeepingController {
  /** Housekeeping staff only see rooms assigned to them, and no guest data is ever returned. */
  @Get() list(@Req() r: any) {
    return db.room.findMany({ where: { hotelId: r.hotelId, archivedAt: null, ...(r.role === 'HOUSEKEEPING' ? { hkAssigneeId: r.user.id } : {}) },
      select: { id: true, number: true, floor: true, housekeeping: true, hkAssigneeId: true, hkNotes: true, roomType: { select: { name: true } } }, orderBy: { number: 'asc' } })
  }
  @Get('staff') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST') async staff(@Req() r: any) {
    const m = await db.membership.findMany({ where: { hotelId: r.hotelId, role: 'HOUSEKEEPING' }, include: { user: true } })
    return m.map(x => ({ id: x.userId, name: x.user.name }))
  }
  @Patch(':roomId') async update(@Req() r: any, @Param('roomId') id: string, @Body() b: unknown) {
    const dto = Update.parse(b)
    const room = await db.room.findFirst({ where: { id, hotelId: r.hotelId } })
    if (!room) throw new NotFoundException()
    if (r.role === 'HOUSEKEEPING' && (room.hkAssigneeId !== r.user.id || dto.assigneeId !== undefined)) throw new ForbiddenException()
    if (dto.assigneeId && !(await db.membership.findFirst({ where: { hotelId: r.hotelId, userId: dto.assigneeId, role: 'HOUSEKEEPING' } })))
      throw new BadRequestException('Assignee is not housekeeping staff of this hotel')
    const out = await db.$transaction(async tx => {
      const updated = await tx.room.update({ where: { id }, data: { housekeeping: dto.status, hkAssigneeId: dto.assigneeId, hkNotes: dto.notes } })
      if (dto.status && dto.status !== room.housekeeping) {
        await tx.roomStatusHistory.create({ data: { hotelId: r.hotelId, roomId: room.id, changedById: r.user.id, fromStatus: room.housekeeping, toStatus: dto.status, note: dto.notes || '' } })
        if (dto.status === 'DIRTY') {
          const openTask = await tx.housekeepingTask.findFirst({ where: { hotelId: r.hotelId, roomId: room.id, status: { notIn: ['COMPLETED', 'CANCELLED'] } } })
          if (!openTask) await tx.housekeepingTask.create({ data: { hotelId: r.hotelId, roomId: room.id, createdById: r.user.id, assignedToId: dto.assigneeId ?? room.hkAssigneeId, taskType: 'TURNOVER', status: (dto.assigneeId ?? room.hkAssigneeId) ? 'ASSIGNED' : 'UNASSIGNED', notes: 'Room marked dirty and needs turnover' } })
        }
      }
      return updated
    })
    if (dto.status && dto.status !== room.housekeeping) await notify(db, r.hotelId, 'HOUSEKEEPING', `Room ${room.number}: ${dto.status.replace('_', ' ')}`)
    return out
  }
}
