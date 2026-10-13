# Method89 Hotel System: Phase 1-2 (API + web shell)
```
docker compose up -d
cd apps/api && cp .env.example .env && npm install
npx prisma generate && npm run db:migrate && npm run db:seed   # use npm run db:reset to start over
npm run dev     # http://localhost:4000
npm test        # 20 parallel bookings for one room; expect succeeded=1
```
Login: `POST /auth/login {email,password}` (seed: admin@ / manager@ / reception@ / clean@demo.lk, Demo@12345).
Then send `Authorization: Bearer <token>` and `X-Hotel-Id: <hotelId>` (printed by the seed and returned by login).
Endpoints: `GET /availability?from&to`, `GET /calendar?from&to`, `GET|POST /reservations`, `POST /reservations/:id/{confirm|check-in|check-out|cancel}`.
Web app (apps/web): login, dashboard, booking calendar (click a free cell to book), reservations with status actions.
```
cd apps/web && cp .env.example .env.local && npm install && npm run dev   # http://localhost:3000
```
Pricing: weekend/season/special rules, promo codes, tax, `POST /quote`. Payments: manual cash/bank, sandbox gateway (webhook-verified, idempotent).
After pulling this update run: `cd apps/api && npx prisma migrate reset` (re-seeds), then restart both apps.
Live notifications (SSE) with unread count, housekeeping board with assignment and per-role visibility, guest search/edit API (`/guests`).
Schema changed again: re-run `npm run db:reset` (reset + constraints + seed).
Reports (occupancy, ADR, RevPAR, revenue, collections, cancellations, sources, CSV export) and printable HTML invoices (use the browser's Save as PDF). Guests screen with search.
Schema changed: re-run `npm run db:reset` (reset + constraints + seed).
Booking widget: hosted page at `/book/<widgetKey>`, embed via `<script src="https://YOUR-WEB/widget.js" data-key="<widgetKey>">` (both on the Booking Widget screen). Public API: `GET /public/:key/config|availability`, `POST /public/:key/booking`, `GET /public/:key/booking/:ref?email=`. Unpaid widget bookings are held 30 minutes, then released.
Schema changed: re-run `npm run db:reset` (reset + constraints + seed).
Setup screen: room types, rooms (archive/restore), rate rules, promo codes, staff (admin only). Fixed: class-level role checks on guest/widget endpoints were not being enforced; now they are.
Platform admin at `/platform` (login: platform@method89.lk / Demo@12345 in dev; set PLATFORM_ADMIN_PASSWORD before seeding anywhere real): onboard hotels, suspend/activate (suspension blocks staff and the public widget), 1-hour audited support access. Login is limited to 5 attempts/minute per IP.
Schema changed: re-run `npm run db:reset` (reset + constraints + seed).
Maintenance blocks (Setup > Maintenance, shown on the calendar). Integration tests: start the API on a freshly reset database, then `npm run test:api` and `npm run test:features` in apps/api (roles, tenant isolation, double booking, webhook replay/signature, suspension, widget domains, refunds, audit, and delivery queue). Backups: docs/backup-restore.md + scripts/backup.sh.
Continuation features now implemented: exact per-hotel widget origins, scheduled 24-hour reminders, Resend email, Twilio SMS/WhatsApp delivery with retries/status, partial/full refunds, encrypted PayHere hosted checkout and verified callbacks, audit log screen, and PostgreSQL RLS policy installation. See `docs/integrations.md`, `PROJECT_PROGRESS.md`, and `TEST_RESULTS.md`.
Verified locally: API TypeScript, Prisma schema/client, and Next.js production build. Runtime tests require PostgreSQL/Redis and a running API.
