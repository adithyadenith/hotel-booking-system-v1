-- Run this script only with a dedicated application database role (not the schema owner):
--   npm run db:rls
-- The API must set app.hotel_id and app.platform_admin on the same database session.
-- This is intentionally separate from the normal developer reset because Prisma's
-- schema owner bypasses PostgreSQL RLS and local development uses one pooled role.
CREATE SCHEMA IF NOT EXISTS app;
CREATE OR REPLACE FUNCTION app.current_hotel_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.hotel_id', true), '')::uuid
$$;
CREATE OR REPLACE FUNCTION app.is_platform_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.platform_admin', true), ''), 'false')::boolean
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Hotel','Membership','RoomType','Room','Guest','Reservation','AuditLog','RateRule','PromoCode','Notification','MaintenanceBlock','PaymentGatewayConfig','Refund','MessageDelivery','ScheduledReminder'] LOOP
    EXECUTE format('ALTER TABLE "%s" ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE "%s" FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON "%s"', t);
    IF t = 'Hotel' THEN
      EXECUTE format('CREATE POLICY tenant_isolation ON "%s" USING (id = app.current_hotel_id() OR app.is_platform_admin()) WITH CHECK (id = app.current_hotel_id() OR app.is_platform_admin())', t);
    ELSE
      EXECUTE format('CREATE POLICY tenant_isolation ON "%s" USING ("hotelId" = app.current_hotel_id() OR app.is_platform_admin()) WITH CHECK ("hotelId" = app.current_hotel_id() OR app.is_platform_admin())', t);
    END IF;
  END LOOP;
END $$;
