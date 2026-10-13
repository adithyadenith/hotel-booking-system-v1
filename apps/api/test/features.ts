/** Integration checks for the post-concurrency features. Start the API on a reset database first. */
import 'dotenv/config'
import { randomUUID } from 'crypto'

const base = process.env.API_URL || 'http://localhost:4000'
let failed = 0
const check = (name: string, ok: boolean, detail?: unknown) => { if (!ok) { failed++; console.error('FAIL', name, detail || '') } else console.log('ok  ', name) }
async function call(method: string, path: string, opts: { token?: string; hotel?: string; body?: unknown; origin?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token
  if (opts.hotel) headers['X-Hotel-Id'] = opts.hotel
  if (opts.origin) headers.Origin = opts.origin
  const response = await fetch(base + path, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) })
  const json = await response.json().catch(() => ({}))
  return { status: response.status, json }
}
async function login(email: string, password: string) { const r = await call('POST', '/auth/login', { body: { email, password } }); check(email + ' login', r.status === 201, r.json); return r.json }
const day = (offset: number) => { const d = new Date(Date.now() + offset * 864e5); return d.toISOString().slice(0, 10) }

async function main() {
  const admin = await login('admin@demo.lk', 'Demo@12345'); const reception = await login('reception@demo.lk', 'Demo@12345'); const hotel = admin.memberships[0].hotelId
  const widget = await call('GET', '/widget-config', { token: admin.token, hotel }); const key = widget.json.widgetKey
  const allowed = 'https://booking.oceanpearl.example'
  await call('PATCH', '/widget-config', { token: admin.token, hotel, body: { brandColor: widget.json.brandColor, allowedWidgetDomains: [allowed] } })
  check('allowed widget origin can read config', (await call('GET', `/public/${key}/config`, { origin: allowed })).status === 200)
  check('unlisted widget origin is rejected', (await call('GET', `/public/${key}/config`, { origin: 'https://evil.example' })).status === 404)
  await call('PATCH', '/widget-config', { token: admin.token, hotel, body: { brandColor: widget.json.brandColor, allowedWidgetDomains: [] } })

  const booking = await call('POST', '/reservations', { token: reception.token, hotel, body: { guest: { name: 'Feature Test Guest', email: `feature-${randomUUID()}@example.com`, phone: '+94770000000' }, items: [{ roomId: (await call('GET', '/rooms', { token: admin.token, hotel })).json[0].id, checkIn: day(40), checkOut: day(41), adults: 1 }], source: 'TEST' } })
  check('feature booking created', booking.status === 201, booking.json)
  const reservation = booking.json
  const payment = await call('POST', `/reservations/${reservation.id}/payments`, { token: reception.token, hotel, body: { amount: reservation.totalAmount, method: 'CASH', idempotencyKey: 'feature-' + randomUUID() } })
  check('manual payment succeeds', payment.status === 201, payment.json)
  const refund = await call('POST', `/payments/${payment.json.id}/refund`, { token: admin.token, hotel, body: { amount: Math.floor(reservation.totalAmount / 2), reason: 'Feature test', idempotencyKey: 'refund-' + randomUUID() } })
  check('partial refund succeeds', refund.status === 201, refund.json)
  const over = await call('POST', `/payments/${payment.json.id}/refund`, { token: admin.token, hotel, body: { amount: reservation.totalAmount, reason: 'Should fail', idempotencyKey: 'refund-' + randomUUID() } })
  check('refund cannot exceed remaining paid amount', over.status === 400)
  const audit = await call('GET', '/audit-logs?entity=Payment', { token: admin.token, hotel })
  check('audit log records payment/refund actions', audit.status === 200 && audit.json.some((x: any) => x.action === 'REFUND'))
  const deliveries = await call('GET', '/deliveries', { token: admin.token, hotel })
  check('delivery queue is tenant-scoped and readable', deliveries.status === 200 && Array.isArray(deliveries.json.jobs))
  console.log(failed ? `${failed} feature check(s) failed` : 'All feature checks passed'); process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
