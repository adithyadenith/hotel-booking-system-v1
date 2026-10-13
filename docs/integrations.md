# Delivery, payments, and tenant security

## PayHere

The API implements PayHere's hosted Checkout API and verified server callback. Configure it from Setup → Payments after setting `CREDENTIALS_ENCRYPTION_KEY`, `PUBLIC_API_URL`, and `PUBLIC_WEB_URL`. Merchant credentials are encrypted before they are persisted. The API only settles a payment after validating `md5sig`, merchant ID, amount, currency, and the unique payment callback. The refund endpoint uses PayHere's official Merchant Refund API when an API token is supplied.

PayHere must be given a publicly reachable `notify_url`; localhost cannot receive provider callbacks. Keep the hotel gateway in SANDBOX until the merchant account, allowed domain, IP allow-list, and live callback URL are approved.

## Email, SMS, and WhatsApp

Email delivery uses the official Resend HTTPS API with `RESEND_API_KEY` and `EMAIL_FROM`. SMS and WhatsApp delivery use the official Twilio Messaging API with `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and `TWILIO_WHATSAPP_FROM`. Missing credentials are shown as Not configured and are never treated as sent. The durable delivery queue retries transient failures up to five times. For multiple API instances, move the polling worker to BullMQ/Redis or run one worker process.

## Reminders

The worker creates one durable `ARRIVAL_24H` reminder per reservation and queues the configured guest channels. The unique reservation/type constraint makes the job idempotent. The delivery status is visible under Notifications & delivery.

## Widget domains

Setup → Booking Widget accepts exact HTTPS origins. When the list is non-empty, public widget requests with another browser Origin are rejected. Leave it empty only for an intentionally unrestricted widget during development.

## PostgreSQL RLS

`prisma/sql/rls.sql` installs policies for direct hotel-owned tables. Apply it with a dedicated non-owner database role and set `app.hotel_id` plus `app.platform_admin` on every request transaction. It is not included in `db:reset` because Prisma's schema-owner connection bypasses RLS and would make local development misleading. The normal API authorization remains active in all environments.
