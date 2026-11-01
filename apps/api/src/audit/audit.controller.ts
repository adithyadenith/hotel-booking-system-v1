import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard, Roles } from '../common/guards'
import { db } from '../reservations/reservations.service'

@Controller('audit-logs')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class AuditController {
  @Get()
  list(@Req() r: any, @Query('entity') entity?: string, @Query('action') action?: string) {
    return db.auditLog.findMany({ where: { hotelId: r.hotelId, ...(entity ? { entity } : {}), ...(action ? { action } : {}) }, include: { } as any, orderBy: { createdAt: 'desc' }, take: 200 })
  }

  @Get('export.csv') @Header('Content-Type', 'text/csv')
  async export(@Req() r: any, @Query('entity') entity?: string, @Query('action') action?: string) {
    const rows = await db.auditLog.findMany({ where: { hotelId: r.hotelId, ...(entity ? { entity } : {}), ...(action ? { action } : {}) }, orderBy: { createdAt: 'desc' }, take: 1000 })
    const cell = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`
    return ['time,action,item,record_id,staff_id', ...rows.map(x => [x.createdAt.toISOString(), x.action, x.entity, x.entityId, x.userId || 'System'].map(cell).join(','))].join('\n')
  }
}
