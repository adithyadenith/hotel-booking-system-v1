import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common'
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
}
