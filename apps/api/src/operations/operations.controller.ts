import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { db } from '../reservations/reservations.service'

const dayTime = z.string().datetime().optional().nullable()
const checklist = z.array(z.object({ label: z.string().min(1).max(120), checked: z.boolean(), note: z.string().max(300).optional() })).max(30)
const ownRoom = async (hotelId: string, roomId: string) => {
  const room = await db.room.findFirst({ where: { id: roomId, hotelId, archivedAt: null }, include: { roomType: true } })
  if (!room) throw new NotFoundException('Room not found')
  return room
}
const audit = (hotelId: string, userId: string, action: string, entity: string, entityId: string) => db.auditLog.create({ data: { hotelId, userId, action, entity, entityId } })

@Controller('operations')
@UseGuards(AuthGuard)
export class OperationsController {
  @Get('overview') async overview(@Req() r: any) {
    const today = new Date(new Date().toISOString().slice(0, 10))
    const [rooms, reservations, tasks, workOrders, inspections, lostFound, logs, memberships] = await Promise.all([
      db.room.findMany({ where: { hotelId: r.hotelId, archivedAt: null }, include: { roomType: true }, orderBy: { number: 'asc' } }),
      r.role === 'HOUSEKEEPING' ? Promise.resolve([]) : db.reservation.findMany({ where: { hotelId: r.hotelId }, include: { guest: true, items: { include: { room: true } } }, orderBy: { createdAt: 'desc' }, take: 120 }),
      db.housekeepingTask.findMany({ where: { hotelId: r.hotelId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, include: { room: true, assignedTo: { select: { id: true, name: true } } }, orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }], take: 100 }),
      db.maintenanceWorkOrder.findMany({ where: { hotelId: r.hotelId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, include: { room: true, assignedTo: { select: { id: true, name: true } } }, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], take: 100 }),
      db.roomInspection.findMany({ where: { hotelId: r.hotelId, status: { in: ['PENDING', 'FAIL'] } }, include: { room: true, inspector: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.lostFoundItem.findMany({ where: { hotelId: r.hotelId, status: 'OPEN' }, include: { room: true }, orderBy: { foundAt: 'desc' }, take: 100 }),
      db.auditLog.findMany({ where: { hotelId: r.hotelId }, orderBy: { createdAt: 'desc' }, take: 16 }),
      db.membership.findMany({ where: { hotelId: r.hotelId }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { role: 'asc' } }),
    ])
    const userIds = [...new Set(logs.map(x => x.userId).filter(Boolean))] as string[]
    const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []
    const names = new Map(users.map(x => [x.id, x.name]))
    const arrivals = reservations.flatMap(x => x.items.map(item => ({ ...item, reservation: x }))).filter(x => x.checkIn.toISOString().slice(0, 10) === today.toISOString().slice(0, 10) && ['PENDING', 'CONFIRMED'].includes(x.reservation.status))
    const departures = reservations.flatMap(x => x.items.map(item => ({ ...item, reservation: x }))).filter(x => x.checkOut.toISOString().slice(0, 10) === today.toISOString().slice(0, 10) && x.reservation.status === 'CHECKED_IN')
    return { rooms, reservations, arrivals, departures, tasks, workOrders, inspections, lostFound,
      staff: r.role === 'HOUSEKEEPING' ? [] : memberships.map(x => ({ id: x.userId, name: x.user.name, email: x.user.email, role: x.role })),
      activity: logs.map(x => ({ ...x, userName: x.userId ? names.get(x.userId) || 'Staff member' : 'System' })) }
  }

  @Get('room-history/:roomId') async roomHistory(@Req() r: any, @Param('roomId') roomId: string) {
    await ownRoom(r.hotelId, roomId)
    return db.roomStatusHistory.findMany({ where: { hotelId: r.hotelId, roomId }, orderBy: { createdAt: 'desc' }, take: 100 })
  }

  @Get('inspections') listInspections(@Req() r: any) {
    return db.roomInspection.findMany({ where: { hotelId: r.hotelId }, include: { room: true, inspector: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 200 })
  }

  @Post('inspections') async createInspection(@Req() r: any, @Body() b: unknown) {
    const d = z.object({ roomId: z.string().uuid(), status: z.enum(['PENDING', 'PASS', 'FAIL']), checklist, notes: z.string().max(1000).default('') }).parse(b)
    const room = await ownRoom(r.hotelId, d.roomId)
    const result = await db.$transaction(async tx => {
      const item = await tx.roomInspection.create({ data: { hotelId: r.hotelId, roomId: d.roomId, inspectorId: r.user.id, status: d.status, checklist: d.checklist, notes: d.notes, inspectedAt: d.status === 'PENDING' ? null : new Date() } })
      if (d.status !== 'PENDING') {
        const next = d.status === 'PASS' ? 'CLEAN' : 'DIRTY'
        await tx.room.update({ where: { id: room.id }, data: { housekeeping: next } })
        await tx.roomStatusHistory.create({ data: { hotelId: r.hotelId, roomId: room.id, changedById: r.user.id, fromStatus: room.housekeeping, toStatus: next, note: `Room inspection ${d.status.toLowerCase()}` } })
      }
      await tx.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'ROOM_INSPECTION', entity: 'RoomInspection', entityId: item.id } })
      return item
    })
    return result
  }

  @Patch('inspections/:id') async updateInspection(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    const d = z.object({ status: z.enum(['PENDING', 'PASS', 'FAIL']).optional(), checklist: checklist.optional(), notes: z.string().max(1000).optional() }).parse(b)
    const existing = await db.roomInspection.findFirst({ where: { id, hotelId: r.hotelId }, include: { room: true } })
    if (!existing) throw new NotFoundException('Inspection not found')
    const status = d.status || existing.status
    const result = await db.$transaction(async tx => {
      const item = await tx.roomInspection.update({ where: { id }, data: { ...d, status, inspectedAt: status === 'PENDING' ? null : (existing.inspectedAt || new Date()) } })
      if (d.status && d.status !== 'PENDING' && d.status !== existing.status) {
        const next = d.status === 'PASS' ? 'CLEAN' : 'DIRTY'
        await tx.room.update({ where: { id: existing.roomId }, data: { housekeeping: next } })
        await tx.roomStatusHistory.create({ data: { hotelId: r.hotelId, roomId: existing.roomId, changedById: r.user.id, fromStatus: existing.room.housekeeping, toStatus: next, note: `Room inspection ${d.status.toLowerCase()}` } })
      }
      await tx.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'ROOM_INSPECTION_UPDATED', entity: 'RoomInspection', entityId: id } })
      return item
    })
    return result
  }

  @Get('lost-found') listLostFound(@Req() r: any) {
    return db.lostFoundItem.findMany({ where: { hotelId: r.hotelId }, include: { room: true }, orderBy: { foundAt: 'desc' }, take: 200 })
  }

  @Post('lost-found') async createLostFound(@Req() r: any, @Body() b: unknown) {
    const d = z.object({ itemName: z.string().min(1).max(120), description: z.string().max(500).default(''), location: z.string().max(120).default(''), roomId: z.string().uuid().nullable().optional(), guestName: z.string().max(120).default(''), guestContact: z.string().max(120).default(''), foundAt: dayTime, notes: z.string().max(500).default('') }).parse(b)
    if (d.roomId) await ownRoom(r.hotelId, d.roomId)
    const item = await db.lostFoundItem.create({ data: { hotelId: r.hotelId, createdById: r.user.id, ...d, foundAt: d.foundAt ? new Date(d.foundAt) : new Date() } })
    await audit(r.hotelId, r.user.id, 'LOST_FOUND_CREATED', 'LostFoundItem', item.id)
    return item
  }

  @Patch('lost-found/:id') async updateLostFound(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    const d = z.object({ status: z.enum(['OPEN', 'RETURNED', 'DISPOSED']).optional(), notes: z.string().max(500).optional(), guestContact: z.string().max(120).optional() }).parse(b)
    const existing = await db.lostFoundItem.findFirst({ where: { id, hotelId: r.hotelId } })
    if (!existing) throw new NotFoundException('Lost and found item not found')
    const item = await db.lostFoundItem.update({ where: { id }, data: d })
    await audit(r.hotelId, r.user.id, 'LOST_FOUND_UPDATED', 'LostFoundItem', item.id)
    return item
  }

  @Get('work-orders') listWorkOrders(@Req() r: any) {
    return db.maintenanceWorkOrder.findMany({ where: { hotelId: r.hotelId }, include: { room: true, assignedTo: { select: { id: true, name: true } } }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 })
  }

  @Post('work-orders') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST') async createWorkOrder(@Req() r: any, @Body() b: unknown) {
    const d = z.object({ roomId: z.string().uuid(), title: z.string().min(1).max(120), description: z.string().max(1000).default(''), category: z.string().max(50).default('GENERAL'), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'), assignedToId: z.string().uuid().nullable().optional(), dueAt: dayTime }).parse(b)
    await ownRoom(r.hotelId, d.roomId)
    if (d.assignedToId && !(await db.membership.findFirst({ where: { hotelId: r.hotelId, userId: d.assignedToId, role: { in: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] } } }))) throw new BadRequestException('Assigned staff member is not part of this hotel')
    const item = await db.maintenanceWorkOrder.create({ data: { hotelId: r.hotelId, createdById: r.user.id, ...d, dueAt: d.dueAt ? new Date(d.dueAt) : null } })
    await audit(r.hotelId, r.user.id, 'MAINTENANCE_WORK_ORDER_CREATED', 'MaintenanceWorkOrder', item.id)
    return item
  }

  @Patch('work-orders/:id') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST') async updateWorkOrder(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    const d = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(), priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(), assignedToId: z.string().uuid().nullable().optional(), notes: z.string().max(1000).optional() }).parse(b)
    const existing = await db.maintenanceWorkOrder.findFirst({ where: { id, hotelId: r.hotelId } })
    if (!existing) throw new NotFoundException('Work order not found')
    const { notes, ...changes } = d
    const item = await db.maintenanceWorkOrder.update({ where: { id }, data: { ...changes, ...(notes === undefined ? {} : { description: notes }), completedAt: d.status === 'COMPLETED' ? new Date() : d.status ? null : undefined } })
    await audit(r.hotelId, r.user.id, 'MAINTENANCE_WORK_ORDER_UPDATED', 'MaintenanceWorkOrder', item.id)
    return item
  }

  @Get('housekeeping-tasks') listHousekeepingTasks(@Req() r: any) {
    return db.housekeepingTask.findMany({ where: { hotelId: r.hotelId, ...(r.role === 'HOUSEKEEPING' ? { assignedToId: r.user.id } : {}) }, include: { room: true, assignedTo: { select: { id: true, name: true } } }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }], take: 200 })
  }

  @Post('housekeeping-tasks') @Roles('ADMIN', 'MANAGER', 'RECEPTIONIST') async createHousekeepingTask(@Req() r: any, @Body() b: unknown) {
    const d = z.object({ roomId: z.string().uuid(), assignedToId: z.string().uuid().nullable().optional(), taskType: z.string().max(50).default('TURNOVER'), notes: z.string().max(500).default(''), dueAt: dayTime }).parse(b)
    await ownRoom(r.hotelId, d.roomId)
    if (d.assignedToId && !(await db.membership.findFirst({ where: { hotelId: r.hotelId, userId: d.assignedToId, role: 'HOUSEKEEPING' } }))) throw new BadRequestException('Assigned staff member is not housekeeping staff')
    const item = await db.housekeepingTask.create({ data: { hotelId: r.hotelId, createdById: r.user.id, status: d.assignedToId ? 'ASSIGNED' : 'UNASSIGNED', ...d, dueAt: d.dueAt ? new Date(d.dueAt) : null } })
    await audit(r.hotelId, r.user.id, 'HOUSEKEEPING_TASK_CREATED', 'HousekeepingTask', item.id)
    return item
  }

  @Patch('housekeeping-tasks/:id') async updateHousekeepingTask(@Req() r: any, @Param('id') id: string, @Body() b: unknown) {
    const d = z.object({ status: z.enum(['UNASSIGNED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(), assignedToId: z.string().uuid().nullable().optional(), notes: z.string().max(500).optional() }).parse(b)
    const existing = await db.housekeepingTask.findFirst({ where: { id, hotelId: r.hotelId } })
    if (!existing) throw new NotFoundException('Housekeeping task not found')
    if (r.role === 'HOUSEKEEPING' && existing.assignedToId !== r.user.id) throw new BadRequestException('This task is assigned to another staff member')
    const item = await db.housekeepingTask.update({ where: { id }, data: { ...d, completedAt: d.status === 'COMPLETED' ? new Date() : d.status ? null : undefined } })
    await audit(r.hotelId, r.user.id, 'HOUSEKEEPING_TASK_UPDATED', 'HousekeepingTask', item.id)
    return item
  }
}
