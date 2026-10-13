import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { db } from '../reservations/reservations.service'

type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP'
const logger = new Logger('DeliveryService')
const configured = (channel: Channel) => channel === 'EMAIL' ? !!process.env.RESEND_API_KEY : channel === 'SMS' ? !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) : !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM)

export async function queueMessage(input: { hotelId: string; reservationId?: string; channel: Channel; messageType: string; recipient: string; subject?: string; body: string; idempotencyKey: string }) {
  try { return await db.messageDelivery.create({ data: { ...input, status: configured(input.channel) ? 'QUEUED' : 'NOT_CONFIGURED' } }) }
  catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null; throw e }
}

export async function queueReservationMessage(hotelId: string, reservationId: string, messageType: string, subject: string, body: string) {
  const r = await db.reservation.findFirst({ where: { id: reservationId, hotelId }, include: { guest: true } })
  if (!r) return
  const jobs: Promise<unknown>[] = []
  if (r.guest.email) jobs.push(queueMessage({ hotelId, reservationId, channel: 'EMAIL', messageType, recipient: r.guest.email, subject, body, idempotencyKey: `${reservationId}:${messageType}:EMAIL` }))
  if (r.guest.phone) {
    jobs.push(queueMessage({ hotelId, reservationId, channel: 'SMS', messageType, recipient: r.guest.phone, body, idempotencyKey: `${reservationId}:${messageType}:SMS` }))
    jobs.push(queueMessage({ hotelId, reservationId, channel: 'WHATSAPP', messageType, recipient: r.guest.phone, body, idempotencyKey: `${reservationId}:${messageType}:WHATSAPP` }))
  }
  await Promise.all(jobs)
}

async function sendEmail(job: any) {
  const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || 'Method89 Hotel <onboarding@resend.dev>', to: [job.recipient], subject: job.subject || job.messageType, text: job.body }) })
  if (!response.ok) throw new Error(`Resend ${response.status}`)
  return (await response.json() as any).id
}

async function sendTwilio(job: any) {
  const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!
  const from = job.channel === 'WHATSAPP' ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_FROM_NUMBER
  if (!from) throw new Error(`Missing Twilio sender for ${job.channel}`)
  const to = job.channel === 'WHATSAPP' && !job.recipient.startsWith('whatsapp:') ? `whatsapp:${job.recipient}` : job.recipient
  const form = new URLSearchParams({ From: from, To: to, Body: job.body })
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
  if (!response.ok) throw new Error(`Twilio ${response.status}`)
  return (await response.json() as any).sid
}

async function deliver(job: any) { return job.channel === 'EMAIL' ? sendEmail(job) : sendTwilio(job) }

@Injectable()
export class DeliveryService implements OnModuleInit {
  private timer?: NodeJS.Timeout
  onModuleInit() { this.timer = setInterval(() => this.tick().catch(e => logger.error(e)), 15_000); this.timer.unref() }

  async status(hotelId: string) {
    const [jobs, providers] = await Promise.all([
      db.messageDelivery.findMany({ where: { hotelId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      Promise.resolve({ email: !!process.env.RESEND_API_KEY, sms: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER), whatsapp: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM) })
    ])
    return { providers, jobs }
  }
  async retry(hotelId: string, id: string) { return db.messageDelivery.updateMany({ where: { id, hotelId, status: { in: ['FAILED', 'NOT_CONFIGURED'] } }, data: { status: 'QUEUED', error: null, nextAttemptAt: null } }) }

  private async tick() {
    const now = new Date()
    const due = await db.messageDelivery.findMany({ where: { status: 'QUEUED', OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, orderBy: { createdAt: 'asc' }, take: 25 })
    for (const job of due) {
      if (!configured(job.channel as Channel)) { await db.messageDelivery.update({ where: { id: job.id }, data: { status: 'NOT_CONFIGURED' } }); continue }
      const claimed = await db.messageDelivery.updateMany({ where: { id: job.id, status: 'QUEUED' }, data: { status: 'PROCESSING', attempts: { increment: 1 } } })
      if (!claimed.count) continue
      try { const ref = await deliver(job); await db.messageDelivery.update({ where: { id: job.id }, data: { status: 'SENT', providerRef: ref, sentAt: new Date(), error: null } }) }
      catch (e: any) { const attempts = job.attempts + 1; await db.messageDelivery.update({ where: { id: job.id }, data: { status: attempts >= 5 ? 'FAILED' : 'QUEUED', error: String(e.message || e).slice(0, 500), nextAttemptAt: new Date(Date.now() + Math.min(60 * 60_000, 2 ** attempts * 30_000)) } }) }
    }
    await this.scheduleReminders(now)
  }

  private async scheduleReminders(now: Date) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000)
    const candidates = await db.reservation.findMany({ where: { status: { in: ['PENDING', 'CONFIRMED'] }, items: { some: { checkIn: { gte: now, lt: tomorrow } } } }, include: { guest: true, items: { orderBy: { checkIn: 'asc' }, take: 1 }, hotel: true } })
    for (const r of candidates) {
      try {
        await db.scheduledReminder.create({ data: { hotelId: r.hotelId, reservationId: r.id, type: 'ARRIVAL_24H', scheduledFor: now, status: 'PROCESSING' } })
        await queueReservationMessage(r.hotelId, r.id, 'ARRIVAL_REMINDER', 'Arrival reminder · ' + r.ref, `Hello ${r.guest.name}, your stay at ${r.hotel.name} starts tomorrow. Booking ${r.ref}.`)
        await db.scheduledReminder.updateMany({ where: { reservationId: r.id, type: 'ARRIVAL_24H' }, data: { status: 'SENT', processedAt: new Date() } })
      } catch (e) { if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) logger.error(e) }
    }
  }
}
