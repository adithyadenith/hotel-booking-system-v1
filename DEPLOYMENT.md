# Deployment

Run PostgreSQL and Redis, set the API environment variables from `apps/api/.env.example`, run Prisma migrations/seed as appropriate, then start the API on port 4000 and the Next.js app on port 3000 behind HTTPS.

Before enabling live payments, set `PUBLIC_API_URL` to a public HTTPS API, `PUBLIC_WEB_URL` to the web origin, configure PayHere, and verify the callback at `/webhooks/payhere`. Configure `CREDENTIALS_ENCRYPTION_KEY` as a stable secret. Never use the development fallback key in production.

Configure `RESEND_API_KEY`/`EMAIL_FROM` for email and Twilio sender credentials for SMS/WhatsApp. Run one delivery worker per deployment or move polling to BullMQ/Redis when horizontally scaling the API.
