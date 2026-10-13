# Architecture

The system is a Next.js App Router web app and a NestJS REST API backed by PostgreSQL/Prisma. Reservations use `RoomNight` inventory rows plus a PostgreSQL exclusion constraint for `[checkIn, checkOut)` overlap protection. The API authorizes every staff request from the JWT membership and `X-Hotel-Id`; public bookings use a per-hotel widget key and optional exact Origin allow-list.

Payments use an adapter boundary: the existing sandbox remains available for local development, while PayHere uses its hosted form and server callback. Provider credentials are encrypted with `CREDENTIALS_ENCRYPTION_KEY`. Guest messaging is a durable database queue consumed by a lightweight worker; provider adapters are official Resend and Twilio HTTPS APIs.

`prisma/sql/rls.sql` is applied separately with a dedicated non-owner database role. It uses `app.hotel_id` and `app.platform_admin` session settings in addition to application-level authorization.
