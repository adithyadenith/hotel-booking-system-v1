CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "ReservationItem" DROP CONSTRAINT IF EXISTS no_overlap;
ALTER TABLE "ReservationItem" ADD CONSTRAINT no_overlap
  EXCLUDE USING gist ("roomId" WITH =, daterange("checkIn","checkOut",'[)') WITH &&)
  WHERE ("active" = true);
ALTER TABLE "ReservationItem" DROP CONSTRAINT IF EXISTS valid_range;
ALTER TABLE "ReservationItem" ADD CONSTRAINT valid_range CHECK ("checkOut" > "checkIn");
