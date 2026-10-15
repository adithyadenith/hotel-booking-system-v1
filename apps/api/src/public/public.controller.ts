import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common'
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
  @Post('booking/:ref/cancel') cancel(@Param('key') k: string, @Param('ref') ref: string, @Body() b: unknown, @Req() r: any) { return this.s.cancel(k, ref, b, r.headers.origin) }
  @Put('booking/:ref') modify(@Param('key') k: string, @Param('ref') ref: string, @Body() b: unknown, @Req() r: any) { return this.s.modify(k, ref, b, r.headers.origin) }
}

@Controller('widget-config')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class WidgetAdminController {
  @Get() get(@Req() r: any) {
    return db.hotel.findUniqueOrThrow({ where: { id: r.hotelId }, select: {
      widgetKey: true, name: true, brandColor: true, allowedWidgetDomains: true, widgetEnabled: true, widgetLogoUrl: true,
      widgetLayout: true, widgetMinNights: true, widgetAdvanceDays: true, widgetMaxGuests: true, widgetPaymentMode: true,
      widgetDepositPercent: true, widgetConfirmationMessage: true, widgetConfirmationEmail: true, widgetLanguages: true, widgetDefaultLanguage: true,
      widgetCancellationPolicy: true, widgetCancellationHours: true, widgetSelfCancellationEnabled: true, widgetModificationEnabled: true,
    } })
  }
  @Patch() async set(@Req() r: any, @Body() b: unknown) {
    const d = z.object({
      brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      allowedWidgetDomains: z.array(z.string().url()).max(20).optional(),
      widgetEnabled: z.boolean().optional(), widgetLogoUrl: z.string().url().or(z.literal('')).optional(),
      widgetLayout: z.enum(['STANDARD', 'COMPACT', 'SINGLE_PAGE']).optional(), widgetMinNights: z.number().int().min(1).max(30).optional(),
      widgetAdvanceDays: z.number().int().min(0).max(730).optional(), widgetMaxGuests: z.number().int().min(1).max(40).optional(),
      widgetPaymentMode: z.enum(['FULL_PAYMENT', 'DEPOSIT', 'PAY_AT_HOTEL']).optional(), widgetDepositPercent: z.number().int().min(1).max(100).optional(),
      widgetConfirmationMessage: z.string().max(1000).nullable().optional(), widgetConfirmationEmail: z.boolean().optional(),
      widgetLanguages: z.array(z.enum(['en', 'si', 'ta'])).min(1).max(3).optional(), widgetDefaultLanguage: z.enum(['en', 'si', 'ta']).optional(),
      widgetCancellationPolicy: z.string().max(500).optional(), widgetCancellationHours: z.number().int().min(0).max(720).optional(),
      widgetSelfCancellationEnabled: z.boolean().optional(), widgetModificationEnabled: z.boolean().optional(),
    }).parse(b)
    const domains = d.allowedWidgetDomains?.map(x => new URL(x).origin)
    const out = await db.hotel.update({ where: { id: r.hotelId }, data: {
      ...(d.brandColor !== undefined ? { brandColor: d.brandColor } : {}), ...(domains ? { allowedWidgetDomains: domains } : {}),
      ...(d.widgetEnabled !== undefined ? { widgetEnabled: d.widgetEnabled } : {}), ...(d.widgetLogoUrl !== undefined ? { widgetLogoUrl: d.widgetLogoUrl || null } : {}),
      ...(d.widgetLayout !== undefined ? { widgetLayout: d.widgetLayout } : {}), ...(d.widgetMinNights !== undefined ? { widgetMinNights: d.widgetMinNights } : {}),
      ...(d.widgetAdvanceDays !== undefined ? { widgetAdvanceDays: d.widgetAdvanceDays } : {}), ...(d.widgetMaxGuests !== undefined ? { widgetMaxGuests: d.widgetMaxGuests } : {}),
      ...(d.widgetPaymentMode !== undefined ? { widgetPaymentMode: d.widgetPaymentMode } : {}), ...(d.widgetDepositPercent !== undefined ? { widgetDepositPercent: d.widgetDepositPercent } : {}),
      ...(d.widgetConfirmationMessage !== undefined ? { widgetConfirmationMessage: d.widgetConfirmationMessage || null } : {}),
      ...(d.widgetConfirmationEmail !== undefined ? { widgetConfirmationEmail: d.widgetConfirmationEmail } : {}),
      ...(d.widgetLanguages !== undefined ? { widgetLanguages: d.widgetLanguages } : {}), ...(d.widgetDefaultLanguage !== undefined ? { widgetDefaultLanguage: d.widgetDefaultLanguage } : {}),
      ...(d.widgetCancellationPolicy !== undefined ? { widgetCancellationPolicy: d.widgetCancellationPolicy } : {}), ...(d.widgetCancellationHours !== undefined ? { widgetCancellationHours: d.widgetCancellationHours } : {}),
      ...(d.widgetSelfCancellationEnabled !== undefined ? { widgetSelfCancellationEnabled: d.widgetSelfCancellationEnabled } : {}), ...(d.widgetModificationEnabled !== undefined ? { widgetModificationEnabled: d.widgetModificationEnabled } : {}),
    }, select: {
      widgetKey: true, name: true, brandColor: true, allowedWidgetDomains: true, widgetEnabled: true, widgetLogoUrl: true, widgetLayout: true,
      widgetMinNights: true, widgetAdvanceDays: true, widgetMaxGuests: true, widgetPaymentMode: true, widgetDepositPercent: true,
      widgetConfirmationMessage: true, widgetConfirmationEmail: true, widgetLanguages: true, widgetDefaultLanguage: true, widgetCancellationPolicy: true,
      widgetCancellationHours: true, widgetSelfCancellationEnabled: true, widgetModificationEnabled: true,
    } })
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'WIDGET_CONFIG_UPDATED', entity: 'Hotel', entityId: r.hotelId } })
    return out
  }

  @Get('status') async status(@Req() r: any) {
    const h = await db.hotel.findUniqueOrThrow({ where: { id: r.hotelId }, select: { widgetKey: true, widgetEnabled: true, suspendedAt: true } })
    const [roomTypes, rooms] = await Promise.all([
      db.roomType.count({ where: { hotelId: r.hotelId } }), db.room.count({ where: { hotelId: r.hotelId, archivedAt: null } }),
    ])
    const checks = [
      { key: 'key', label: 'Widget key generated', ok: Boolean(h.widgetKey) },
      { key: 'enabled', label: 'Online bookings enabled', ok: h.widgetEnabled && !h.suspendedAt },
      { key: 'inventory', label: 'Room inventory configured', ok: roomTypes > 0 && rooms > 0 },
    ]
    return { status: checks.every(x => x.ok) ? 'READY' : checks.some(x => x.ok) ? 'ATTENTION' : 'OFFLINE', checks, hostedPath: `/book/${h.widgetKey}` }
  }

  @Post('test') async test(@Req() r: any) {
    const h = await db.hotel.findUniqueOrThrow({ where: { id: r.hotelId }, select: { widgetKey: true, widgetEnabled: true, suspendedAt: true } })
    const rooms = await db.room.count({ where: { hotelId: r.hotelId, archivedAt: null } })
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action: 'WIDGET_TEST_STARTED', entity: 'Hotel', entityId: r.hotelId } })
    return { ok: Boolean(h.widgetKey && h.widgetEnabled && !h.suspendedAt && rooms), widgetKey: h.widgetKey, message: rooms ? 'The public booking flow is ready for a test booking.' : 'Add at least one active room before testing.' }
  }
}
