import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { z } from 'zod'
import { notify } from '../notifications/notifications.service'
import { queueReservationMessage } from '../notifications/delivery.service'
import { db } from '../reservations/reservations.service'
import { payHereCheckout, payHereNotifyHash } from './payhere'
import { seal, unseal } from '../common/secrets'

/** Replaceable gateway contract. A real Sri Lankan gateway adapter implements the same two methods. */
export interface PaymentProvider {
  name: string
  createCheckout(p: { amount: number; currency: string }): { providerRef: string; checkoutUrl: string }
  verifyWebhook(raw: Buffer, signature: string): boolean
}
const SECRET = () => {
  const value = process.env.SANDBOX_WEBHOOK_SECRET
  if (process.env.NODE_ENV === 'production' && !value) throw new UnauthorizedException('Sandbox payments are not configured')
  return value || 'dev-sandbox-secret'
}
const sign = (raw: Buffer | string) => createHmac('sha256', SECRET()).update(raw).digest('hex')
/** SANDBOX ONLY: fake gateway for development. Never use in production. */
export const sandbox: PaymentProvider = {
  name: 'SANDBOX',
  createCheckout() {
    const providerRef = 'sbx_' + randomUUID()
    return { providerRef, checkoutUrl: `${process.env.PUBLIC_API_URL || 'http://localhost:4000'}/sandbox/pay/${providerRef}` }
  },
  verifyWebhook(raw, sig) {
    const a = Buffer.from(sign(raw)), b = Buffer.from(sig || '')
    return a.length === b.length && timingSafeEqual(a, b)
  },
}
const Manual = z.object({ amount: z.number().int().positive(), method: z.enum(['CASH', 'BANK']).default('CASH'), idempotencyKey: z.string().min(8).optional() })

@Injectable()
export class PaymentsService {
  private async settle(tx: Prisma.TransactionClient, reservationId: string, amount: number, hotelId: string, userId?: string) {
    const r = await tx.reservation.update({ where: { id: reservationId }, data: { depositPaid: { increment: amount } } })
    if (r.status === 'PENDING') await tx.reservation.update({ where: { id: reservationId }, data: { status: 'CONFIRMED' } })
    await tx.auditLog.create({ data: { hotelId, userId, action: 'PAYMENT', entity: 'Reservation', entityId: reservationId } })
  }
  private async mine(hotelId: string, id: string) {
    const r = await db.reservation.findFirst({ where: { id, hotelId } })
    if (!r) throw new NotFoundException()
    if (['CANCELLED', 'NO_SHOW'].includes(r.status)) throw new BadRequestException('Reservation is not payable')
    return r
  }

  async recordManual(hotelId: string, userId: string, id: string, raw: unknown) {
    const dto = Manual.parse(raw); const res = await this.mine(hotelId, id)
    if (dto.amount > res.totalAmount - res.depositPaid) throw new BadRequestException('Amount exceeds balance due')
    const key = dto.idempotencyKey ?? randomUUID()
    try {
      const paid = await db.$transaction(async tx => {
        const p = await tx.payment.create({ data: { reservationId: id, provider: dto.method, idempotencyKey: key, amount: dto.amount, status: 'SUCCEEDED' } })
        await tx.paymentTransaction.create({ data: { paymentId: p.id, type: 'CHARGE', amount: dto.amount, status: 'SUCCEEDED' } })
        await this.settle(tx, id, dto.amount, hotelId, userId)
        return p
      })
      await notify(db, hotelId, 'PAYMENT_OK', 'Payment recorded', 'LKR ' + (dto.amount / 100).toLocaleString() + ' (' + dto.method + ')')
      await queueReservationMessage(hotelId, id, 'PAYMENT_CONFIRMATION', 'Payment received', `Payment received for reservation ${res.ref}: LKR ${(dto.amount / 100).toLocaleString()}.`)
      return paid
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await db.payment.findUnique({ where: { idempotencyKey: key }, include: { reservation: { select: { hotelId: true } } } })
        if (!existing || existing.reservation.hotelId !== hotelId) throw new BadRequestException('The idempotency key is already in use')
        return existing
      }
      throw e
    }
  }

  async startCheckout(hotelId: string, id: string, raw: unknown) {
    const { amount } = z.object({ amount: z.number().int().positive() }).parse(raw)
    const res = await this.mine(hotelId, id)
    if (amount > res.totalAmount - res.depositPaid) throw new BadRequestException('Amount exceeds balance due')
    const [config, full] = await Promise.all([
      db.paymentGatewayConfig.findFirst({ where: { hotelId, provider: 'PAYHERE', enabled: true } }),
      db.reservation.findFirstOrThrow({ where: { id, hotelId }, include: { guest: true, hotel: true } })
    ])
    if (config) {
      if (process.env.NODE_ENV === 'production' && config.environment !== 'LIVE') throw new BadRequestException('Only a LIVE PayHere gateway can be used in production')
      const orderId = `M89-${full.ref}-${randomUUID().slice(0, 8)}`
      const p = await db.payment.create({ data: { reservationId: id, provider: 'PAYHERE', providerRef: orderId, idempotencyKey: randomUUID(), amount, status: 'PENDING' } })
      const base = process.env.PUBLIC_API_URL || 'http://localhost:4000'
      const checkout = payHereCheckout(config, { orderId, amount, currency: full.hotel.currency, name: full.guest.name, email: full.guest.email || 'guest@example.com', phone: full.guest.phone || '', notifyUrl: `${base}/webhooks/payhere`, returnUrl: `${process.env.PUBLIC_WEB_URL || 'http://localhost:3000'}/book/${full.hotel.widgetKey}?payment=return&ref=${full.ref}`, cancelUrl: `${process.env.PUBLIC_WEB_URL || 'http://localhost:3000'}/book/${full.hotel.widgetKey}?payment=cancelled&ref=${full.ref}` })
      return { paymentId: p.id, provider: 'PAYHERE', checkoutUrl: `${base}/payhere/pay/${p.id}`, checkout }
    }
    if (process.env.NODE_ENV === 'production') throw new BadRequestException('A live PayHere gateway must be configured before accepting online payments')
    const c = sandbox.createCheckout({ amount, currency: 'LKR' })
    const p = await db.payment.create({ data: { reservationId: id, provider: sandbox.name, providerRef: c.providerRef, idempotencyKey: randomUUID(), amount, status: 'PENDING' } })
    return { paymentId: p.id, provider: 'SANDBOX', checkoutUrl: c.checkoutUrl }
  }

  async configureGateway(hotelId: string, userId: string, raw: unknown) {
    const d = z.object({ provider: z.literal('PAYHERE'), environment: z.enum(['SANDBOX', 'LIVE']), merchantId: z.string().min(1), merchantSecret: z.string().min(1), apiToken: z.string().optional(), enabled: z.boolean() }).parse(raw)
    if (process.env.NODE_ENV === 'production' && d.environment !== 'LIVE') throw new BadRequestException('Only the LIVE PayHere environment is allowed in production')
    const config = await db.paymentGatewayConfig.upsert({ where: { hotelId_provider: { hotelId, provider: d.provider } }, create: { hotelId, provider: d.provider, environment: d.environment, merchantId: d.merchantId, merchantSecretCiphertext: seal(d.merchantSecret), apiTokenCiphertext: d.apiToken ? seal(d.apiToken) : null, enabled: d.enabled }, update: { environment: d.environment, merchantId: d.merchantId, merchantSecretCiphertext: seal(d.merchantSecret), ...(d.apiToken ? { apiTokenCiphertext: seal(d.apiToken) } : {}), enabled: d.enabled } })
    await db.auditLog.create({ data: { hotelId, userId, action: 'GATEWAY_CONFIGURED', entity: 'PaymentGatewayConfig', entityId: config.id } })
    return { provider: config.provider, environment: config.environment, merchantId: config.merchantId, enabled: config.enabled }
  }
  async gatewayConfig(hotelId: string) { return db.paymentGatewayConfig.findMany({ where: { hotelId }, select: { provider: true, environment: true, merchantId: true, enabled: true, updatedAt: true } }) }

  async payHerePage(paymentId: string) {
    const p = await db.payment.findUnique({ where: { id: paymentId }, include: { reservation: { include: { guest: true, hotel: true } } } })
    if (!p || p.provider !== 'PAYHERE' || p.status !== 'PENDING') return '<p>Payment not found or already processed.</p>'
    const config = await db.paymentGatewayConfig.findUniqueOrThrow({ where: { hotelId_provider: { hotelId: p.reservation.hotelId, provider: 'PAYHERE' } } })
    const base = process.env.PUBLIC_API_URL || 'http://localhost:4000'
    const c = payHereCheckout(config, { orderId: p.providerRef!, amount: p.amount, currency: p.reservation.hotel.currency, name: p.reservation.guest.name, email: p.reservation.guest.email || 'guest@example.com', phone: p.reservation.guest.phone || '', notifyUrl: `${base}/webhooks/payhere`, returnUrl: `${process.env.PUBLIC_WEB_URL || 'http://localhost:3000'}`, cancelUrl: `${process.env.PUBLIC_WEB_URL || 'http://localhost:3000'}` })
    const inputs = Object.entries(c.fields).map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"/>`).join('')
    return `<body style="font-family:sans-serif;max-width:420px;margin:15vh auto"><h2>Secure PayHere checkout</h2><p>You are being redirected to PayHere. No card details are stored by Method89.</p><form id="f" method="post" action="${c.action}">${inputs}</form><script>document.getElementById('f').submit()</script></body>`
  }

  async applyPayHere(body: Record<string, string>) {
    const required = z.object({ merchant_id: z.string(), order_id: z.string(), payment_id: z.string(), payhere_amount: z.string(), payhere_currency: z.string(), status_code: z.string(), md5sig: z.string() }).parse(body)
    const p = await db.payment.findFirst({ where: { provider: 'PAYHERE', providerRef: required.order_id }, include: { reservation: true } })
    if (!p) throw new NotFoundException('Unknown PayHere order')
    const config = await db.paymentGatewayConfig.findUniqueOrThrow({ where: { hotelId_provider: { hotelId: p.reservation.hotelId, provider: 'PAYHERE' } } })
    const secret = unseal(config.merchantSecretCiphertext); const expected = secret ? payHereNotifyHash(required.merchant_id, required.order_id, required.payhere_amount, required.payhere_currency, required.status_code, secret) : ''
    const verified = required.md5sig.toUpperCase() === expected.toUpperCase() && required.merchant_id === config.merchantId && Math.round(parseFloat(required.payhere_amount) * 100) === p.amount
    if (!verified) throw new UnauthorizedException('Invalid PayHere notification signature')
    const eventId = `${required.payment_id}:${required.status_code}`
    try {
      return await db.$transaction(async tx => {
        await tx.webhookEvent.create({ data: { provider: 'PAYHERE', eventId } })
        const status = required.status_code === '2' ? 'SUCCEEDED' : required.status_code === '0' ? 'PENDING' : 'FAILED'
        if (p.status !== 'PENDING') return { ok: true, ignored: true }
        const updated = await tx.payment.update({ where: { id: p.id }, data: { status, providerTransactionRef: required.payment_id } })
        if (status === 'SUCCEEDED') { await tx.paymentTransaction.create({ data: { paymentId: p.id, type: 'CHARGE', providerRef: required.payment_id, amount: p.amount, status } }); await this.settle(tx, p.reservationId, p.amount, p.reservation.hotelId) }
        return { ok: true, status, paymentId: updated.id }
      })
    } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, duplicate: true }; throw e }
  }

  async refund(hotelId: string, userId: string, paymentId: string, raw: unknown) {
    const d = z.object({ amount: z.number().int().positive(), reason: z.string().max(200).default(''), idempotencyKey: z.string().min(8).optional() }).parse(raw)
    const payment = await db.payment.findFirst({ where: { id: paymentId, reservation: { hotelId } }, include: { reservation: true, refunds: { where: { status: { in: ['PENDING', 'SUCCEEDED'] } } } } })
    if (!payment || !['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) throw new BadRequestException('Only successful payments can be refunded')
    const already = payment.refunds.reduce((sum, r) => sum + r.amount, 0)
    if (d.amount > payment.amount - already) throw new BadRequestException('Refund exceeds the remaining payment amount')
    const key = d.idempotencyKey || randomUUID()
    const config = await db.paymentGatewayConfig.findUnique({ where: { hotelId_provider: { hotelId, provider: 'PAYHERE' } } })
    if (config && process.env.NODE_ENV === 'production' && config.environment !== 'LIVE') throw new BadRequestException('Only a LIVE PayHere gateway can be used in production')
    const token = config ? unseal(config.apiTokenCiphertext) : undefined
    if (config && !token) throw new BadRequestException('PayHere refund API token is not configured')
    try {
      const refund = await db.$transaction(async tx => tx.refund.create({ data: { hotelId, reservationId: payment.reservationId, paymentId, amount: d.amount, reason: d.reason, idempotencyKey: key, status: config ? 'PENDING' : 'SUCCEEDED', createdBy: userId } }))
      if (config) {
        const url = config.environment === 'LIVE' ? 'https://www.payhere.lk/merchant/v1/payment/refund' : 'https://sandbox.payhere.lk/merchant/v1/payment/refund'
        const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ payment_id: payment.providerTransactionRef || payment.providerRef, description: d.reason || 'Hotel booking refund' }) })
        if (!response.ok) { await db.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } }); throw new BadRequestException('PayHere rejected the refund') }
        await db.refund.update({ where: { id: refund.id }, data: { status: 'SUCCEEDED', providerRef: payment.providerTransactionRef || payment.providerRef } })
      }
      if (!config || (await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status === 'SUCCEEDED') {
        await db.$transaction(async tx => {
          await tx.paymentTransaction.create({ data: { paymentId, type: 'REFUND', providerRef: config ? (payment.providerTransactionRef || payment.providerRef) : undefined, amount: d.amount, status: 'SUCCEEDED' } })
          await tx.reservation.update({ where: { id: payment.reservationId }, data: { depositPaid: { decrement: d.amount } } })
          const refunded = already + d.amount
          await tx.payment.update({ where: { id: paymentId }, data: { status: refunded >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } })
        })
      }
      await db.auditLog.create({ data: { hotelId, userId, action: 'REFUND', entity: 'Payment', entityId: paymentId } })
      return db.refund.findUniqueOrThrow({ where: { id: refund.id } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await db.refund.findUnique({ where: { idempotencyKey: key }, select: { hotelId: true } })
        if (!existing || existing.hotelId !== hotelId) throw new BadRequestException('The idempotency key is already in use')
        return db.refund.findUniqueOrThrow({ where: { idempotencyKey: key } })
      }
      throw e
    }
  }

  /** The only path that marks a gateway payment successful: a verified, de-duplicated, amount-matched webhook. */
  async applyWebhook(raw: Buffer, signature: string) {
    if (process.env.NODE_ENV === 'production') throw new UnauthorizedException('Sandbox webhooks are disabled in production')
    if (!sandbox.verifyWebhook(raw, signature)) throw new UnauthorizedException('Bad signature')
    const ev = z.object({ id: z.string(), type: z.enum(['payment.succeeded', 'payment.failed']), ref: z.string(), amount: z.number().int() }).parse(JSON.parse(raw.toString()))
    try {
      let after: any = null
      const out = await db.$transaction(async tx => {
        await tx.webhookEvent.create({ data: { provider: sandbox.name, eventId: ev.id } }) // unique => replay-safe
        const p = await tx.payment.findFirst({ where: { providerRef: ev.ref }, include: { reservation: true } })
        if (!p || p.amount !== ev.amount) throw new BadRequestException('Unknown payment or amount mismatch')
        if (p.status !== 'PENDING') return { ok: true, ignored: true }
        if (ev.type === 'payment.failed') { await tx.payment.update({ where: { id: p.id }, data: { status: 'FAILED' } }); return { ok: true } }
        await tx.payment.update({ where: { id: p.id }, data: { status: 'SUCCEEDED' } })
        await this.settle(tx, p.reservationId, p.amount, p.reservation.hotelId)
        after = async () => { await notify(db, p.reservation.hotelId, 'PAYMENT_OK', 'Online payment received', 'LKR ' + (p.amount / 100).toLocaleString()); await queueReservationMessage(p.reservation.hotelId, p.reservationId, 'PAYMENT_CONFIRMATION', 'Payment received', `Online payment received for reservation ${p.reservationId}: LKR ${(p.amount / 100).toLocaleString()}.`) }
        return { ok: true }
      })
      if (after) await after()
      return out
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { ok: true, duplicate: true }
      throw e
    }
  }

  async sandboxPage(ref: string) {
    if (process.env.NODE_ENV === 'production') throw new UnauthorizedException()
    const p = await db.payment.findFirst({ where: { providerRef: ref } })
    if (!p || p.status !== 'PENDING') return '<p>Payment not found or already processed.</p>'
    return `<body style="font-family:sans-serif;max-width:360px;margin:15vh auto"><h2>SANDBOX checkout</h2><p>Test payment of LKR ${(p.amount / 100).toLocaleString()}. No real money moves.</p>
      <form method="post" action="/sandbox/complete/${ref}"><button style="padding:12px 18px">Pay (simulate success)</button></form></body>`
  }
  /** Simulates the gateway calling our webhook with a signed event. Disabled in production. */
  async sandboxComplete(ref: string) {
    if (process.env.NODE_ENV === 'production') throw new UnauthorizedException()
    const p = await db.payment.findFirst({ where: { providerRef: ref } })
    if (!p) throw new NotFoundException()
    const raw = Buffer.from(JSON.stringify({ id: 'evt_' + ref, type: 'payment.succeeded', ref, amount: p.amount }))
    await this.applyWebhook(raw, sign(raw))
    return '<body style="font-family:sans-serif;margin:15vh auto;max-width:360px"><h2>Payment received</h2><p>You can close this window.</p></body>'
  }
}
