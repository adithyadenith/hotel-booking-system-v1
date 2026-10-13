# Setup

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
