import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { AuthGuard, Roles } from '../common/guards'
import { db } from '../reservations/reservations.service'
import { dispatchWebhookEvent, hashIntegrationKey } from './integrations.service'

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const events = ['booking.created', 'booking.updated', 'booking.cancelled', 'booking.checked_in', 'booking.checked_out'] as const
const templateChannels = ['EMAIL', 'SMS', 'WHATSAPP'] as const
const templateEvents = ['BOOKING_CONFIRMATION', 'BOOKING_CANCELLATION', 'CHECK_IN_REMINDER', 'CHECK_OUT_REMINDER'] as const

const cleanUrl = (value: string) => {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new BadRequestException('Use an HTTPS webhook URL')
  return url.toString()
}
const csv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
const icsText = (value: string) => value.replace(/[\\;,\n]/g, match => match === '\n' ? '\\n' : `\\${match}`)

async function ensureTemplates(hotelId: string) {
  const defaults = [
    ['EMAIL', 'BOOKING_CONFIRMATION', 'Booking confirmation', 'Your reservation {ref} is confirmed', 'Hello {guest}, your reservation {ref} is confirmed for {check_in}. Total: {total}.'],
    ['SMS', 'BOOKING_CONFIRMATION', 'Booking confirmation SMS', '', '{hotel}: booking {ref} confirmed. Check-in {check_in}.'],
    ['WHATSAPP', 'BOOKING_CONFIRMATION', 'Booking confirmation WhatsApp', '', 'Hello {guest}! Your booking {ref} at {hotel} is confirmed.'],
    ['EMAIL', 'CHECK_IN_REMINDER', 'Arrival reminder', 'Your stay at {hotel} starts tomorrow', 'Hello {guest}, we look forward to welcoming you tomorrow. Booking: {ref}.'],
    ['SMS', 'CHECK_IN_REMINDER', 'Arrival reminder SMS', '', 'Reminder: your stay at {hotel} starts tomorrow. Ref {ref}.'],
  ] as const
  await db.integrationTemplate.createMany({
    data: defaults.map(([channel, event, name, subject, body]) => ({ hotelId, channel, event, name, subject, body })),
    skipDuplicates: true,
  })
}

@Controller('integrations')
@UseGuards(AuthGuard)
@Roles('ADMIN', 'MANAGER')
export class IntegrationsController {
  private async audit(r: any, action: string, entity: string, entityId: string) {
    await db.auditLog.create({ data: { hotelId: r.hotelId, userId: r.user.id, action, entity, entityId } })
  }

  @Get('overview') async overview(@Req() r: any) {
    await ensureTemplates(r.hotelId)
    const [keys, webhooks, calendars, templates] = await Promise.all([
      db.integrationApiKey.findMany({ where: { hotelId: r.hotelId }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, revokedAt: true, createdAt: true } }),
      db.webhookEndpoint.findMany({ where: { hotelId: r.hotelId }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, url: true, events: true, active: true, lastStatus: true, lastError: true, lastDeliveryAt: true, createdAt: true } }),
      db.calendarIntegration.findMany({ where: { hotelId: r.hotelId }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, provider: true, direction: true, url: true, token: true, active: true, lastSyncedAt: true, lastStatus: true, lastError: true, createdAt: true } }),
      db.integrationTemplate.findMany({ where: { hotelId: r.hotelId }, orderBy: [{ channel: 'asc' }, { event: 'asc' }] }),
    ])
    return { apiBaseUrl: `${process.env.PUBLIC_API_URL || 'http://localhost:4000'}/public-api`, keys, webhooks, calendars, templates }
  }

  @Post('api-keys') async createKey(@Req() r: any, @Body() body: unknown) {
    const name = z.object({ name: z.string().trim().min(2).max(60) }).parse(body).name
    const key = `m89_live_${randomBytes(24).toString('base64url')}`
    const item = await db.integrationApiKey.create({ data: { hotelId: r.hotelId, name, keyPrefix: key.slice(0, 18), keyHash: hashIntegrationKey(key) } })
    await this.audit(r, 'INTEGRATION_API_KEY_CREATED', 'IntegrationApiKey', item.id)
    return { id: item.id, name: item.name, key, keyPrefix: item.keyPrefix, createdAt: item.createdAt }
  }

  @Delete('api-keys/:id') async revokeKey(@Req() r: any, @Param('id') id: string) {
    const out = await db.integrationApiKey.updateMany({ where: { id, hotelId: r.hotelId, revokedAt: null }, data: { revokedAt: new Date() } })
    if (!out.count) throw new BadRequestException('API key was not found or is already revoked')
    await this.audit(r, 'INTEGRATION_API_KEY_REVOKED', 'IntegrationApiKey', id)
    return { ok: true }
  }

  @Post('webhooks') async createWebhook(@Req() r: any, @Body() body: unknown) {
    const d = z.object({ name: z.string().trim().min(2).max(60), url: z.string().url(), events: z.array(z.enum(events)).min(1), active: z.boolean().default(true) }).parse(body)
    const item = await db.webhookEndpoint.create({ data: { hotelId: r.hotelId, name: d.name, url: cleanUrl(d.url), events: d.events as any, active: d.active, secret: `whsec_${randomBytes(24).toString('hex')}` } })
    await this.audit(r, 'WEBHOOK_CREATED', 'WebhookEndpoint', item.id)
    return { ...item, secret: `${item.secret.slice(0, 12)}…` }
  }

  @Patch('webhooks/:id') async updateWebhook(@Req() r: any, @Param('id') id: string, @Body() body: unknown) {
    const d = z.object({ name: z.string().trim().min(2).max(60).optional(), url: z.string().url().optional(), events: z.array(z.enum(events)).min(1).optional(), active: z.boolean().optional() }).parse(body)
    const item = await db.webhookEndpoint.updateMany({ where: { id, hotelId: r.hotelId }, data: { ...d, ...(d.url ? { url: cleanUrl(d.url) } : {}), events: d.events as any } })
    if (!item.count) throw new BadRequestException('Webhook endpoint not found')
    await this.audit(r, 'WEBHOOK_UPDATED', 'WebhookEndpoint', id)
    return { ok: true }
  }

  @Post('webhooks/:id/test') async testWebhook(@Req() r: any, @Param('id') id: string) {
    const endpoint = await db.webhookEndpoint.findFirst({ where: { id, hotelId: r.hotelId } })
    if (!endpoint) throw new BadRequestException('Webhook endpoint not found')
    await dispatchWebhookEvent(r.hotelId, 'booking.created', { test: true, message: 'Method 89 webhook test', hotelId: r.hotelId })
    await this.audit(r, 'WEBHOOK_TESTED', 'WebhookEndpoint', id)
    return { ok: true, message: 'A test event was sent to enabled endpoints.' }
  }

  @Post('calendars') async createCalendar(@Req() r: any, @Body() body: unknown) {
    const d = z.object({ name: z.string().trim().min(2).max(60), provider: z.enum(['ICS', 'GOOGLE', 'CALDAV']).default('ICS'), direction: z.enum(['EXPORT', 'IMPORT']).default('EXPORT'), url: z.string().url().optional(), active: z.boolean().default(true) }).parse(body)
    if (d.direction === 'IMPORT' && !d.url) throw new BadRequestException('An import calendar URL is required')
    const item = await db.calendarIntegration.create({ data: { hotelId: r.hotelId, name: d.name, provider: d.provider, direction: d.direction, url: d.url || '', token: randomBytes(24).toString('hex'), active: d.active } })
    await this.audit(r, 'CALENDAR_CREATED', 'CalendarIntegration', item.id)
    return item
  }

  @Patch('calendars/:id') async updateCalendar(@Req() r: any, @Param('id') id: string, @Body() body: unknown) {
    const d = z.object({ name: z.string().trim().min(2).max(60).optional(), url: z.string().url().optional(), active: z.boolean().optional() }).parse(body)
    const out = await db.calendarIntegration.updateMany({ where: { id, hotelId: r.hotelId }, data: d })
    if (!out.count) throw new BadRequestException('Calendar integration not found')
    await this.audit(r, 'CALENDAR_UPDATED', 'CalendarIntegration', id)
    return { ok: true }
  }

  @Post('calendars/:id/sync') async syncCalendar(@Req() r: any, @Param('id') id: string) {
    const item = await db.calendarIntegration.findFirst({ where: { id, hotelId: r.hotelId } })
    if (!item) throw new BadRequestException('Calendar integration not found')
    if (item.direction === 'EXPORT') return db.calendarIntegration.update({ where: { id }, data: { lastSyncedAt: new Date(), lastStatus: 'READY', lastError: '' } })
    try {
      const response = await fetch(item.url, { signal: AbortSignal.timeout(10000) })
      const text = await response.text()
      if (!response.ok || !text.includes('BEGIN:VCALENDAR')) throw new Error('The URL did not return a valid calendar feed')
      const out = await db.calendarIntegration.update({ where: { id }, data: { lastSyncedAt: new Date(), lastStatus: 'SYNCED', lastError: '' } })
      await this.audit(r, 'CALENDAR_SYNCED', 'CalendarIntegration', id)
      return out
    } catch (error) {
      await db.calendarIntegration.update({ where: { id }, data: { lastSyncedAt: new Date(), lastStatus: 'FAILED', lastError: String((error as Error)?.message || error).slice(0, 500) } })
      throw new BadRequestException('Calendar sync failed. Check the feed URL and try again.')
    }
  }

  @Patch('templates/:id') async updateTemplate(@Req() r: any, @Param('id') id: string, @Body() body: unknown) {
    const d = z.object({ name: z.string().trim().min(2).max(80), subject: z.string().max(160).optional(), body: z.string().min(1).max(4000), active: z.boolean() }).parse(body)
    const out = await db.integrationTemplate.updateMany({ where: { id, hotelId: r.hotelId }, data: d })
    if (!out.count) throw new BadRequestException('Template not found')
    await this.audit(r, 'INTEGRATION_TEMPLATE_UPDATED', 'IntegrationTemplate', id)
    return { ok: true }
  }

  @Get('accounting-export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="method89-accounting-export.csv"')
  async accountingExport(@Req() r: any, @Query('from') from?: string, @Query('to') to?: string) {
    const d = z.object({ from: isoDay.optional(), to: isoDay.optional() }).parse({ from, to })
    const reservations = await db.reservation.findMany({ where: { hotelId: r.hotelId, ...(d.from || d.to ? { createdAt: { ...(d.from ? { gte: new Date(`${d.from}T00:00:00Z`) } : {}), ...(d.to ? { lt: new Date(`${d.to}T23:59:59Z`) } : {}) } } : {}) }, include: { guest: true, payments: true }, orderBy: { createdAt: 'asc' } })
    const rows = ['booking_reference,created_at,guest,status,source,total_lkr,deposit_paid_lkr,balance_due_lkr,payment_status']
    for (const x of reservations) rows.push([x.ref, x.createdAt.toISOString(), x.guest.name, x.status, x.source, (x.totalAmount / 100).toFixed(2), (x.depositPaid / 100).toFixed(2), ((x.totalAmount - x.depositPaid) / 100).toFixed(2), x.depositPaid >= x.totalAmount ? 'PAID' : x.depositPaid > 0 ? 'PART_PAID' : 'UNPAID'].map(csv).join(','))
    await this.audit(r, 'ACCOUNTING_EXPORT', 'Reservation', r.hotelId)
    return rows.join('\n') + '\n'
  }
}

@Controller('public-api')
export class IntegrationsPublicController {
  @Get('bookings') async bookings(@Req() r: any, @Query('from') from?: string, @Query('to') to?: string) {
    const key = String(r.headers['x-api-key'] || '')
    if (!key) throw new BadRequestException('x-api-key is required')
    const auth = await db.integrationApiKey.findFirst({ where: { keyHash: hashIntegrationKey(key), revokedAt: null } })
    if (!auth) throw new BadRequestException('Invalid API key')
    const d = z.object({ from: isoDay.optional(), to: isoDay.optional() }).parse({ from, to })
    const data = await db.reservation.findMany({ where: { hotelId: auth.hotelId, ...(d.from || d.to ? { createdAt: { ...(d.from ? { gte: new Date(`${d.from}T00:00:00Z`) } : {}), ...(d.to ? { lt: new Date(`${d.to}T23:59:59Z`) } : {}) } } : {}) }, include: { guest: true, items: { include: { room: true } } }, orderBy: { createdAt: 'desc' }, take: 100 })
    await db.integrationApiKey.update({ where: { id: auth.id }, data: { lastUsedAt: new Date() } })
    return { data, count: data.length, limit: 100 }
  }
}

@Controller('calendar-feed')
export class CalendarFeedController {
  @Get(':token.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'inline; filename="hotel-bookings.ics"')
  async feed(@Param('token') token: string) {
    const calendar = await db.calendarIntegration.findFirst({ where: { token, active: true, direction: 'EXPORT' } })
    if (!calendar) throw new BadRequestException('Calendar feed not found')
    const today = new Date(new Date().toISOString().slice(0, 10))
    const reservations = await db.reservation.findMany({ where: { hotelId: calendar.hotelId, status: { notIn: ['CANCELLED', 'NO_SHOW'] }, items: { some: { checkOut: { gte: today } } } }, include: { guest: true, items: { include: { room: true } } }, take: 500 })
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Method89//Hotel Bookings//EN', 'CALSCALE:GREGORIAN']
    for (const reservation of reservations) for (const item of reservation.items) {
      const start = item.checkIn.toISOString().slice(0, 10).replaceAll('-', '')
      const end = item.checkOut.toISOString().slice(0, 10).replaceAll('-', '')
      lines.push('BEGIN:VEVENT', `UID:${reservation.id}-${item.id}@method89`, `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${icsText(`Booking ${reservation.ref} · Room ${item.room.number}`)}`, `DESCRIPTION:${icsText(`Guest: ${reservation.guest.name}`)}`, 'END:VEVENT')
    }
    lines.push('END:VCALENDAR')
    return lines.join('\r\n') + '\r\n'
  }
}
