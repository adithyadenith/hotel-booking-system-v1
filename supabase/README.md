# Supabase database setup

This folder contains the PostgreSQL setup for the hotel system.

## Create the tables

1. Create a Supabase project.
2. Open **SQL Editor** in the Supabase dashboard.
3. Run [`schema.sql`](./schema.sql) once against the empty project database.

The script creates the Prisma schema, indexes, foreign keys, booking date-overlap protection, and date-range validation.

If the database was created from an earlier version of this project, run [`migrations/20261020_active_reservation_items.sql`](./migrations/20261020_active_reservation_items.sql) after the original schema. It preserves cancelled reservation history without letting cancelled dates block new bookings.

## Connect the API

Copy the Supabase Prisma connection strings into `apps/api/.env`:

```env
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@POOLER_HOST:5432/postgres?sslmode=require
DIRECT_URL=postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres?sslmode=require
```

Use the Session pooler connection for this long-running API and the direct connection for Prisma migrations. Copy the exact values from **Supabase Dashboard → Connect → Prisma**; do not commit them. If the direct connection is unavailable on your network, use the Session pooler string for both values.

Use URL-encoded password characters (`@` becomes `%40`, `#` becomes `%23`) and keep `sslmode=require` enabled. If the Supabase direct hostname does not resolve locally, use the Session pooler URL for both variables during local development.

Then run:

```powershell
cd apps/api
npm install
npx prisma generate
npm run db:seed
npm run dev
```

For QA on a fresh local database, the login throttle can be raised temporarily with `AUTH_LOGIN_THROTTLE_LIMIT=20`. Keep the production value at 5 or another security-reviewed limit; this setting exists only to prevent a readiness probe from consuming the normal login budget during automated tests.

The seed creates the demo hotel, rooms, staff, add-ons, packages, and demo accounts. Do not use the demo passwords in production.

## Important security note

The API currently enforces hotel isolation in its NestJS authentication guard and every service query. Do not run `apps/api/prisma/sql/rls.sql` on Supabase yet: that optional script expects the API to set PostgreSQL session variables (`app.hotel_id` and `app.platform_admin`), and the current API does not set them. Enabling it before that API change would make authenticated queries return no rows or fail.

Supabase Auth is not required for this migration. The application continues to use its existing JWT login system.

## Local Docker services

After moving PostgreSQL to Supabase, the local PostgreSQL container is no longer needed. Redis can remain in Docker if notification/event features use it.
