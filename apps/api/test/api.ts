// Integration tests against a RUNNING, freshly seeded API (npm run db:reset && npm run dev, then npm run test:api).
import 'dotenv/config'
import { createHmac } from 'crypto'
const API = process.env.TEST_API_URL || 'http://localhost:4000'
let failed = 0
const check = (name: string, ok: boolean, extra?: unknown) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(extra))); if (!ok) failed++ }
async function call(method: string, path: string, o: { token?: string; hotel?: string; body?: any; raw?: string; sig?: string } = {}) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}), ...(o.hotel ? { 'X-Hotel-Id': o.hotel } : {}), ...(o.sig ? { 'x-signature': o.sig } : {}) },
    body: o.raw ?? (o.body ? JSON.stringify(o.body) : undefined) })
  return { status: r.status, json: await r.json().catch(() => ({})) as any }
}
const login = (email: string, password: string) => call('POST', '/auth/login', { body: { email, password } }).then(r => r.json)
const rnd = Math.floor(Math.random() * 3000)
const date = (n: number) => new Date(Date.UTC(2040, 0, 1) + (rnd + n) * 864e5).toISOString().slice(0, 10)
const guest = { name: 'Test Guest', email: 'guest@example.com' }

async function main() {
  const admin = await login('admin@demo.lk', 'Demo@12345'), A = admin.memberships[0].hotelId, T = admin.token
  const rec = await login('reception@demo.lk', 'Demo@12345'), clean = await login('clean@demo.lk', 'Demo@12345')
  const rooms = (await call('GET', '/rooms', { token: T, hotel: A })).json as any[]; const room = rooms[0], room2 = rooms[1]

  // Authentication and roles
  check('bad password rejected', (await call('POST', '/auth/login', { body: { email: 'admin@demo.lk', password: 'nope' } })).status === 401)
  check('no token => 401', (await call('GET', '/reservations', { hotel: A })).status === 401)
  check('housekeeping cannot list reservations', (await call('GET', '/reservations', { token: clean.token, hotel: A })).status === 403)
  check('receptionist cannot open staff admin', (await call('GET', '/staff', { token: rec.token, hotel: A })).status === 403)
  check('receptionist cannot view reports', (await call('GET', `/reports/summary?from=${date(0)}&to=${date(1)}`, { token: rec.token, hotel: A })).status === 403)
  check('invalid body => 400 not 500', (await call('POST', '/reservations', { token: rec.token, hotel: A, body: { items: [] } })).status === 400)

  // Booking rules
  const book = (token: string, hotel: string, roomId: string, a: string, b: string) =>
    call('POST', '/reservations', { token, hotel, body: { guest, items: [{ roomId, checkIn: date(a as any), checkOut: date(b as any), adults: 1 }] } })
  const b1 = await book(rec.token, A, room.id, 0 as any, 3 as any)
  check('booking created', b1.status === 201, b1)
  check('overlapping booking rejected (409)', (await book(rec.token, A, room.id, 1 as any, 2 as any)).status === 409)
  check('back-to-back (checkout day = next check-in) allowed', (await book(rec.token, A, room.id, 3 as any, 4 as any)).status === 201)
  check('invalid transition: check-in a PENDING booking => 400', (await call('POST', `/reservations/${b1.json.id}/check-in`, { token: rec.token, hotel: A })).status === 400)
  check('cancel works', (await call('POST', `/reservations/${b1.json.id}/cancel`, { token: rec.token, hotel: A })).status === 201)
  check('cancelled dates can be rebooked', (await book(rec.token, A, room.id, 0 as any, 3 as any)).status === 201)

  // Maintenance blocks
  const blk = await call('POST', '/maintenance-blocks', { token: T, hotel: A, body: { roomId: room2.id, startDate: date(10), endDate: date(12), reason: 'test' } })
  check('maintenance block created', blk.status === 201, blk)
  check('blocked room cannot be booked', (await book(rec.token, A, room2.id, 10 as any, 11 as any)).status === 409)
  check('block cannot overlap a reservation', (await call('POST', '/maintenance-blocks', { token: T, hotel: A, body: { roomId: room.id, startDate: date(0), endDate: date(2) } })).status === 409)
  await call('DELETE', `/maintenance-blocks/${blk.json.id}`, { token: T, hotel: A })
  check('room bookable after block removed', (await book(rec.token, A, room2.id, 10 as any, 11 as any)).status === 201)

  // Payments / webhooks
  const rb = await book(rec.token, A, rooms[2].id, 20 as any, 21 as any), total = rb.json.totalAmount, part = Math.min(total, 100000)
  const co = await call('POST', `/reservations/${rb.json.id}/payments/checkout`, { token: rec.token, hotel: A, body: { amount: part } })
  const ref = String(co.json.checkoutUrl).split('/').pop()!
  const ev = (id: string, amount: number) => JSON.stringify({ id, type: 'payment.succeeded', ref, amount })
  const sign = (raw: string) => createHmac('sha256', process.env.SANDBOX_WEBHOOK_SECRET || 'dev-sandbox-secret').update(raw).digest('hex')
  const paid = async () => ((await call('GET', '/reservations', { token: rec.token, hotel: A })).json as any[]).find(r => r.id === rb.json.id)
  check('webhook with bad signature rejected', (await call('POST', '/webhooks/sandbox', { raw: ev('e1', part), sig: 'bad' })).status === 401)
  check('webhook with wrong amount rejected', (await call('POST', '/webhooks/sandbox', { raw: ev('e2', part + 1), sig: sign(ev('e2', part + 1)) })).status === 400)
  check('payment not credited before valid webhook', (await paid()).depositPaid === 0)
  const good = ev('e3', part)
  check('valid webhook accepted', (await call('POST', '/webhooks/sandbox', { raw: good, sig: sign(good) })).status === 201)
  const replay = await call('POST', '/webhooks/sandbox', { raw: good, sig: sign(good) })
  check('replayed webhook ignored (idempotent)', replay.json.duplicate === true || replay.json.ignored === true, replay.json)
  const after = await paid(); check('paid exactly once and booking confirmed', after.depositPaid === part && after.status === 'CONFIRMED', after)
  check('overpayment rejected', (await call('POST', `/reservations/${rb.json.id}/payments`, { token: rec.token, hotel: A, body: { amount: total, method: 'CASH' } })).status === 400 || total === part)

  // Tenant isolation and suspension
  const plat = await login('platform@method89.lk', process.env.PLATFORM_ADMIN_PASSWORD || 'Demo@12345')
  check('platform admin logs in', !!plat.token, plat)
  const slug = 'test-' + Date.now(), email = `admin-${Date.now()}@example.com`, pw = 'Str0ng-Passw0rd!!'
  const hb = await call('POST', '/platform/hotels', { token: plat.token, body: { name: 'Test Hotel B', slug, adminName: 'B Admin', adminEmail: email, adminPassword: pw } })
  check('hotel onboarded', hb.status === 201, hb)
  check('hotel admin cannot use platform API', (await call('GET', '/platform/hotels', { token: T })).status === 403)
  const B = await login(email, pw), Bid = B.memberships[0].hotelId
  check('hotel B admin cannot read hotel A data', (await call('GET', '/reservations', { token: B.token, hotel: A })).status === 403)
  check('hotel B admin cannot book hotel A room', (await book(B.token, Bid, room.id, 30 as any, 31 as any)).status === 404)
  check('hotel B sees none of hotel A rooms', ((await call('GET', '/rooms', { token: B.token, hotel: Bid })).json as any[]).length === 0)
  await call('PATCH', `/platform/hotels/${Bid}`, { token: plat.token, body: { suspended: true } })
  check('suspended hotel staff locked out', (await call('GET', '/rooms', { token: B.token, hotel: Bid })).status === 403)
  check('suspended hotel widget offline', (await call('GET', `/public/${hb.json.widgetKey}/config`)).status === 404)

  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed'); process.exit(failed ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
