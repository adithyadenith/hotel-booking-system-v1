import { BadRequestException, Body, ConflictException, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { seal } from '../common/secrets'
import { db, nightsBetween, ReservationsService } from '../reservations/reservations.service'
import { nightlyRates } from '../reservations/pricing'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const providers = ['BOOKING_COM', 'AIRBNB', 'EXPEDIA', 'AGODA', 'CUSTOM'] as const
const syncTypes = ['availability', 'prices', 'reservations'] as const
const dateStart = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z')
const safeUrl = (value: string) => { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Connection URL must use HTTP or HTTPS'); return url.toString().replace(/\/$/, '') }

@Controller('channel-manager')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class ChannelManagerController {
  constructor(private reservations: ReservationsService) {
    const timer = setInterval(() => this.runAutomaticSync().catch(() => {}), 5 * 60 * 1000)
    timer.unref()
    void this.runAutomaticSync()
  }
  private async runAutomaticSync() {
    const connections = await db.channelConnection.findMany({ where: { active: true, OR: [{ syncAvailability: true }, { syncPrices: true }] } })
    for (const connection of connections) for (const type of ['availability', 'prices'] as const) {
      if (type === 'availability' && !connection.syncAvailability) continue
      if (type === 'prices' && !connection.syncPrices) continue
      try {
        const payload = await this.payload(connection, type, connection.hotelId)
        if (connection.endpointUrl) {
          const response = await fetch(`${connection.endpointUrl}/sync/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: connection.provider, payload }), signal: AbortSignal.timeout(10000) })
          if (!response.ok) throw new Error(`Channel returned HTTP ${response.status}`)
        }
        await db.channelConnection.update({ where: { id: connection.id }, data: { lastStatus: connection.endpointUrl ? 'SYNCED' : 'READY_LOCAL', lastError: '', ...(type === 'availability' ? { lastAvailabilityAt: new Date() } : { lastPricesAt: new Date() }) } })
        await db.channelSyncLog.create({ data: { connectionId: connection.id, syncType: type.toUpperCase(), status: connection.endpointUrl ? 'SYNCED' : 'READY_LOCAL', summary: `Automatic ${type} synchronization completed` } })
      } catch (error) {
        await db.channelConnection.update({ where: { id: connection.id }, data: { lastStatus: 'FAILED', lastError: String((error as Error)?.message || error).slice(0, 500) } }).catch(() => {})
      }
    }
  }
  private async audit(r: any, action: string, entity: string, entityId: string) { await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action, entity, entityId } }) }
  private async inventory(hotelId: string, roomTypeId?: string) {
    const today = dateStart()
    const types = await db.roomType.findMany({ where: { hotelId, ...(roomTypeId ? { id: roomTypeId } : {}) }, include: { rooms: { where: { archivedAt: null }, select: { id: true } } }, orderBy: { name: 'asc' } })
    return Promise.all(types.map(async type => { const booked = await db.roomNight.count({ where: { night: today, room: { hotelId, roomTypeId: type.id, archivedAt: null } } }); return { roomTypeId: type.id, name: type.name, total: type.rooms.length, booked, available: Math.max(type.rooms.length - booked, 0), baseRate: type.baseRate, maxOccupancy: type.maxOccupancy } }))
  }
  @Get('overview') async overview(@Req() r: any) {
    const [connections, roomTypes, imports, inventory] = await Promise.all([
      db.channelConnection.findMany({ where: { hotelId: r.hotelId }, include: { mappings: { include: { roomType: true } }, stopSells: { where: { active: true, dateTo: { gte: dateStart() } }, orderBy: { dateFrom: 'asc' } }, syncLogs: { orderBy: { createdAt: 'desc' }, take: 8 } }, orderBy: { createdAt: 'desc' } }),
      db.roomType.findMany({ where: { hotelId: r.hotelId }, orderBy: { name: 'asc' } }),
      db.channelReservationImport.findMany({ where: { hotelId: r.hotelId }, include: { connection: { select: { name: true, provider: true } } }, orderBy: { importedAt: 'desc' }, take: 30 }),
      this.inventory(r.hotelId),
    ])
    return { connections, roomTypes, imports, inventory }
  }
  @Post('connections') async createConnection(@Req() r: any, @Body() body: unknown) {
    const d = z.object({ name: z.string().trim().min(2).max(80), provider: z.enum(providers), endpointUrl: z.string().url().optional(), apiToken: z.string().max(500).optional(), active: z.boolean().default(true), syncAvailability: z.boolean().default(true), syncPrices: z.boolean().default(true), importReservations: z.boolean().default(true), stopSellProtection: z.boolean().default(true), overbookingProtection: z.boolean().default(true), overbookingBuffer: z.number().int().min(0).max(20).default(0) }).parse(body)
    const item = await db.channelConnection.create({ data: { hotelId: r.hotelId, name: d.name, provider: d.provider, endpointUrl: d.endpointUrl ? safeUrl(d.endpointUrl) : '', credentials: d.apiToken ? seal(JSON.stringify({ apiToken: d.apiToken })) : '', active: d.active, syncAvailability: d.syncAvailability, syncPrices: d.syncPrices, importReservations: d.importReservations, stopSellProtection: d.stopSellProtection, overbookingProtection: d.overbookingProtection, overbookingBuffer: d.overbookingBuffer } })
    await this.audit(r, 'CHANNEL_CONNECTION_CREATED', 'ChannelConnection', item.id); return { ...item, credentials: undefined }
  }
  @Patch('connections/:id') async updateConnection(@Req() r: any, @Param('id') id: string, @Body() body: unknown) {
    const d = z.object({ name: z.string().trim().min(2).max(80).optional(), endpointUrl: z.string().url().optional(), apiToken: z.string().max(500).optional(), active: z.boolean().optional(), syncAvailability: z.boolean().optional(), syncPrices: z.boolean().optional(), importReservations: z.boolean().optional(), stopSellProtection: z.boolean().optional(), overbookingProtection: z.boolean().optional(), overbookingBuffer: z.number().int().min(0).max(20).optional() }).parse(body); const { apiToken, endpointUrl, ...rest } = d
    const out = await db.channelConnection.updateMany({ where: { id, hotelId: r.hotelId }, data: { ...rest, ...(endpointUrl ? { endpointUrl: safeUrl(endpointUrl) } : {}), ...(apiToken ? { credentials: seal(JSON.stringify({ apiToken })) } : {}) } }); if (!out.count) throw new BadRequestException('Channel connection not found'); await this.audit(r, 'CHANNEL_CONNECTION_UPDATED', 'ChannelConnection', id); return { ok: true }
  }
  @Post('connections/:id/mappings') async createMapping(@Req() r: any, @Param('id') id: string, @Body() body: unknown) {
    const d = z.object({ roomTypeId: z.string().uuid(), externalRoomId: z.string().trim().min(1).max(100), externalRatePlanId: z.string().max(100).optional(), enabled: z.boolean().default(true) }).parse(body); const connection = await db.channelConnection.findFirst({ where: { id, hotelId: r.hotelId } })
    if (!connection || !(await db.roomType.findFirst({ where: { id: d.roomTypeId, hotelId: r.hotelId } }))) throw new BadRequestException('Connection or room type not found')
    try { const item = await db.channelRoomMapping.create({ data: { connectionId: id, roomTypeId: d.roomTypeId, externalRoomId: d.externalRoomId, externalRatePlanId: d.externalRatePlanId || '', enabled: d.enabled }, include: { roomType: true } }); await this.audit(r, 'CHANNEL_MAPPING_CREATED', 'ChannelRoomMapping', item.id); return item } catch { throw new ConflictException('That room type or external room is already mapped') }
  }
  @Delete('mappings/:id') async deleteMapping(@Req() r: any, @Param('id') id: string) { const item = await db.channelRoomMapping.findFirst({ where: { id, connection: { hotelId: r.hotelId } } }); if (!item) throw new BadRequestException('Room mapping not found'); await db.channelRoomMapping.delete({ where: { id } }); await this.audit(r, 'CHANNEL_MAPPING_DELETED', 'ChannelRoomMapping', id); return { ok: true } }
  private async payload(connection: any, type: string, hotelId: string) {
    const inventory = await this.inventory(hotelId)
    if (type === 'availability') return { generatedAt: new Date().toISOString(), rooms: inventory.map(x => ({ roomTypeId: x.roomTypeId, available: Math.max(x.available - connection.overbookingBuffer, 0), stopSell: connection.stopSellProtection && x.available <= connection.overbookingBuffer })) }
    if (type === 'prices') { const types = await db.roomType.findMany({ where: { hotelId }, orderBy: { name: 'asc' } }); return { generatedAt: new Date().toISOString(), currency: (await db.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { currency: true } })).currency, rates: await Promise.all(types.map(async x => ({ roomTypeId: x.id, price: (await nightlyRates(db as any, hotelId, x, [dateStart()]))[0] }))) } }
    const reservations = await db.reservation.findMany({ where: { hotelId, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } }, include: { guest: true, items: { include: { room: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }); return { generatedAt: new Date().toISOString(), reservations: reservations.map(x => ({ ref: x.ref, status: x.status, guest: x.guest.name, checkIn: x.items[0]?.checkIn, checkOut: x.items[0]?.checkOut, roomType: x.items[0]?.room.roomTypeId })) }
  }
  @Post('connections/:id/sync/:type') async sync(@Req() r: any, @Param('id') id: string, @Param('type') type: string) {
    if (!(syncTypes as readonly string[]).includes(type)) throw new BadRequestException('Unknown sync type'); const connection = await db.channelConnection.findFirst({ where: { id, hotelId: r.hotelId } }); if (!connection) throw new BadRequestException('Channel connection not found'); if (!connection.active) throw new BadRequestException('Enable this channel before syncing')
    const payload = await this.payload(connection, type, r.hotelId); let status = 'READY_LOCAL'; let summary = type === 'availability' ? `${(payload as any).rooms.length} room types checked` : type === 'prices' ? `${(payload as any).rates.length} rates checked` : `${(payload as any).reservations.length} reservations checked`
    try { if (connection.endpointUrl) { const response = await fetch(`${connection.endpointUrl}/sync/${type}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: connection.provider, payload }), signal: AbortSignal.timeout(10000) }); if (!response.ok) throw new Error(`Channel returned HTTP ${response.status}`); status = 'SYNCED'; summary += ' and sent to provider' }
      const data: any = { lastStatus: status, lastError: '', ...(type === 'availability' ? { lastAvailabilityAt: new Date() } : {}), ...(type === 'prices' ? { lastPricesAt: new Date() } : {}), ...(type === 'reservations' ? { lastReservationsAt: new Date() } : {}) }; await db.channelConnection.update({ where: { id }, data }); await db.channelSyncLog.create({ data: { connectionId: id, syncType: type.toUpperCase(), status, summary, details: payload as any } }); await this.audit(r, 'CHANNEL_SYNC_' + type.toUpperCase(), 'ChannelConnection', id); return { ok: true, status, summary, payload }
    } catch (error) { const message = String((error as Error)?.message || error).slice(0, 500); await db.channelConnection.update({ where: { id }, data: { lastStatus: 'FAILED', lastError: message } }); await db.channelSyncLog.create({ data: { connectionId: id, syncType: type.toUpperCase(), status: 'FAILED', summary: message } }); throw new BadRequestException('Channel sync failed. Check the endpoint and credentials.') }
  }
  @Post('connections/:id/import') async importReservation(@Req() r: any, @Param('id') id: string, @Body() body: unknown) {
    const d = z.object({ externalId: z.string().trim().min(1).max(100), roomTypeId: z.string().uuid(), guestName: z.string().trim().min(1).max(120), guestEmail: z.string().email().optional().or(z.literal('')), guestPhone: z.string().max(40).optional(), checkIn: day, checkOut: day, externalAmount: z.number().int().min(0).default(0) }).parse(body); const connection = await db.channelConnection.findFirst({ where: { id, hotelId: r.hotelId } }); const roomType = await db.roomType.findFirst({ where: { id: d.roomTypeId, hotelId: r.hotelId } }); if (!connection || !roomType) throw new BadRequestException('Connection or room type not found'); if (!connection.importReservations) throw new BadRequestException('Reservation import is disabled for this channel')
    const duplicate = await db.channelReservationImport.findUnique({ where: { connectionId_externalId: { connectionId: id, externalId: d.externalId } } }); if (duplicate) throw new ConflictException('This external reservation has already been imported'); const nights = nightsBetween(d.checkIn, d.checkOut); if (!nights.length) throw new BadRequestException('Check-out must be after check-in'); const room = await db.room.findFirst({ where: { hotelId: r.hotelId, roomTypeId: d.roomTypeId, archivedAt: null, nights: { none: { night: { in: nights } } } } })
    if (!room && connection.overbookingProtection) { const failed = await db.channelReservationImport.create({ data: { hotelId: r.hotelId, connectionId: id, externalId: d.externalId, guestName: d.guestName, guestEmail: d.guestEmail || '', guestPhone: d.guestPhone || '', roomTypeName: roomType.name, checkIn: new Date(d.checkIn), checkOut: new Date(d.checkOut), externalAmount: d.externalAmount, status: 'REJECTED_OVERBOOKING', errorMessage: 'No room is available for these dates' } }); await this.audit(r, 'CHANNEL_IMPORT_REJECTED', 'ChannelReservationImport', failed.id); throw new ConflictException('Import blocked: no room is available for these dates') }
    if (!room) throw new ConflictException('No room is available for this room type')
    const reservation = await this.reservations.create(r.hotelId, r.user.id, { items: [{ roomId: room.id, checkIn: d.checkIn, checkOut: d.checkOut, adults: 1, children: 0 }], guest: { name: d.guestName, email: d.guestEmail || undefined, phone: d.guestPhone || undefined }, source: connection.provider, notes: `Imported from ${connection.name}: ${d.externalId}` }); const imported = await db.channelReservationImport.create({ data: { hotelId: r.hotelId, connectionId: id, reservationId: reservation.id, externalId: d.externalId, guestName: d.guestName, guestEmail: d.guestEmail || '', guestPhone: d.guestPhone || '', roomTypeName: roomType.name, checkIn: new Date(d.checkIn), checkOut: new Date(d.checkOut), externalAmount: d.externalAmount, status: 'IMPORTED' } }); await this.audit(r, 'CHANNEL_RESERVATION_IMPORTED', 'ChannelReservationImport', imported.id); return imported
  }
  @Post('connections/:id/stop-sell') async stopSell(@Req() r: any, @Param('id') id: string, @Body() body: unknown) { const d = z.object({ roomTypeId: z.string().uuid(), dateFrom: day, dateTo: day, reason: z.string().max(200).default(''), active: z.boolean().default(true) }).refine(x => x.dateTo > x.dateFrom, { message: 'End date must be after start date' }).parse(body); const connection = await db.channelConnection.findFirst({ where: { id, hotelId: r.hotelId } }); if (!connection || !(await db.roomType.findFirst({ where: { id: d.roomTypeId, hotelId: r.hotelId } }))) throw new BadRequestException('Connection or room type not found'); const item = await db.channelStopSell.create({ data: { hotelId: r.hotelId, connectionId: id, roomTypeId: d.roomTypeId, dateFrom: new Date(d.dateFrom), dateTo: new Date(d.dateTo), reason: d.reason, active: d.active } }); await this.audit(r, 'CHANNEL_STOP_SELL_CREATED', 'ChannelStopSell', item.id); return item }
  @Delete('stop-sell/:id') async removeStopSell(@Req() r: any, @Param('id') id: string) { const out = await db.channelStopSell.updateMany({ where: { id, hotelId: r.hotelId }, data: { active: false } }); if (!out.count) throw new BadRequestException('Stop-sell rule not found'); await this.audit(r, 'CHANNEL_STOP_SELL_REMOVED', 'ChannelStopSell', id); return { ok: true } }
}
