# Backups and restore (PostgreSQL)

**Back up** (run nightly from cron; keep at least 14 days, copy off the server):
```
scripts/backup.sh            # writes backups/hotel-YYYYmmdd-HHMMSS.dump
```
**Restore** into an empty database:
```
createdb hotel_restore
pg_restore --no-owner --dbname=hotel_restore backups/hotel-XXXX.dump
```
Point `DATABASE_URL` at it, start the API, and log in to check recent bookings. For the dockerised database: `docker compose exec -T postgres pg_restore -U hotel -d hotel_restore < backups/hotel-XXXX.dump`.

**Rehearse a restore every month.** A backup that has never been restored is not a backup.
Also set `JWT_SECRET`, `SANDBOX_WEBHOOK_SECRET` and gateway credentials in your secret manager, not in the repository, and run behind HTTPS.
