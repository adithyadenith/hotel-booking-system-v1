# Project progress

## Completed in this continuation

- Added room maintenance audit entries and retained exclusive-night maintenance blocking.
- Added encrypted per-hotel PayHere gateway configuration, hosted Checkout form, verified callback, payment transaction history, partial/full refunds, and refund balance/status updates.
- Added Resend email and Twilio SMS/WhatsApp adapters with durable delivery records, retry handling, configuration status, and an admin delivery queue screen.
- Added idempotent 24-hour arrival reminders backed by `ScheduledReminder` records.
- Added exact per-hotel widget origin allow-lists and UI configuration.
- Added audit log API and `/audit` screen.
- Added RLS installation SQL and documented the required non-owner/session context model.
- Added `test:features` integration checks covering widget domains, refunds, audit records, and delivery isolation.

## Verification

- Prisma schema formatted, generated, and validated successfully.
- API TypeScript check passes.
- Next.js production build passes.
- Runtime integration tests are ready but require PostgreSQL/Redis and a running API; Docker is not installed in this workspace.

## External activation still required

Live PayHere merchant/API credentials, a public HTTPS callback URL, Resend/Twilio credentials, production database role/RLS session middleware, and operational backups/monitoring must be configured before go-live.
