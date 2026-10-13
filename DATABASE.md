# Database notes

New records are in `prisma/schema.prisma`: `Refund`, `PaymentGatewayConfig`, `PaymentTransaction`, `MessageDelivery`, and `ScheduledReminder`. `Hotel.allowedWidgetDomains` stores normalized exact origins. Refund and delivery idempotency keys are unique, and reminders are unique by reservation/type.

For a fresh local database:

```text
cd apps/api
npm run db:reset
```

For production RLS, use a separate non-owner role and apply `npm run db:rls` after migrations. Do not apply that policy script using the Prisma schema-owner role.
