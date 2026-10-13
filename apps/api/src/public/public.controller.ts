import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { db } from '../reservations/reservations.service'
import { PublicService } from './public.service'

/** Unauthenticated, rate-limited, identified only by the hotel's public widget key. Exposes no private data. */
@Controller('public/:key')
export class PublicController {
  constructor(private s: PublicService) {}
  @Get('config') config(@Param('key') k: string, @Req() r: any) { return this.s.config(k, r.headers.origin) }
  @Get('availability') availability(@Param('key') k: string, @Query() q: unknown, @Req() r: any) { return this.s.availability(k, q, r.headers.origin) }
  @Post('booking') book(@Param('key') k: string, @Body() b: unknown, @Req() r: any) { return this.s.book(k, b, r.headers.origin) }
  @Get('booking/:ref') status(@Param('key') k: string, @Param('ref') ref: string, @Query('email') e: string, @Req() r: any) { return this.s.status(k, ref, e, r.headers.origin) }
}

@Controller('widget-config')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class WidgetAdminController {
  @Get() get(@Req() r: any) { return db.hotel.findUniqueOrThrow({ where: { id: r.hotelId }, select: { widgetKey: true, brandColor: true, name: true, allowedWidgetDomains: true } }) }
  @Patch() async set(@Req() r: any, @Body() b: unknown) {
    const d = z.object({ brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), allowedWidgetDomains: z.array(z.string().url()).max(20).optional() }).parse(b)
    const domains = d.allowedWidgetDomains?.map(x => new URL(x).origin)
    const out = await db.hotel.update({ where: { id: r.hotelId }, data: { ...(d.brandColor ? { brandColor: d.brandColor } : {}), ...(domains ? { allowedWidgetDomains: domains } : {}) }, select: { widgetKey: true, brandColor: true, allowedWidgetDomains: true } })
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'WIDGET_CONFIG_UPDATED', entity: 'Hotel', entityId: r.hotelId } })
    return out
  }
}
