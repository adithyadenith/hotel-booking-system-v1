#!/usr/bin/env sh
# Usage: DATABASE_URL=postgresql://... scripts/backup.sh
set -e
mkdir -p backups
pg_dump --format=custom --file="backups/hotel-$(date +%Y%m%d-%H%M%S).dump" "$DATABASE_URL"
find backups -name 'hotel-*.dump' -mtime +30 -delete
