# Setup

## Supabase

For a hosted database, create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL Editor. Copy `apps/api/.env.supabase.example` to `apps/api/.env`, replace the connection placeholders with the values from Supabase Dashboard → Connect → Prisma, and then run:

```text
cd apps/api
npm install
npx prisma generate
npm run db:seed
npm run dev
```

Do not run `npm run db:reset` against Supabase. It deletes and recreates the database and is intended only for local Docker PostgreSQL. See [`supabase/README.md`](supabase/README.md) for the complete setup and RLS warning.

## Local Docker PostgreSQL

```text
docker compose up -d
cd apps/api
copy .env.example .env
npm install
npx prisma generate
npm run db:reset
npm run dev
```

In another terminal:

```text
cd apps/web
copy .env.example .env.local
npm install
npm run dev
```

Demo development users use `Demo@12345`; change these credentials before any shared environment. The PayHere, delivery, reminder, refund, widget-domain, and audit screens are available from the existing authenticated app shell.
