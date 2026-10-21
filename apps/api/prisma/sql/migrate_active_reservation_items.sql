-- Safe forward migration for an existing local or hosted database.
-- Keeps cancelled reservation history while releasing its room dates.
ALTER TABLE "ReservationItem" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

UPDATE "ReservationItem" item
SET "active" = false
FROM "Reservation" reservation
WHERE reservation."id" = item."reservationId"
  AND reservation."status" IN ('CANCELLED', 'NO_SHOW');

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "ReservationItem" DROP CONSTRAINT IF EXISTS no_overlap;
ALTER TABLE "ReservationItem" ADD CONSTRAINT no_overlap
  EXCLUDE USING gist ("roomId" WITH =, daterange("checkIn", "checkOut", '[)') WITH &&)
  WHERE ("active" = true);
ALTER TABLE "ReservationItem" DROP CONSTRAINT IF EXISTS valid_range;
ALTER TABLE "ReservationItem" ADD CONSTRAINT valid_range CHECK ("checkOut" > "checkIn");
