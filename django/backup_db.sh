#!/usr/bin/env bash
# Sauvegarde de la base PostgreSQL RSConnect
set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"
BACKUP_DIR="${BACKUP_DIR:-/root/backups/rsconnect}"
KEEP="${KEEP:-14}"
DEPLOY_DIR="${DEPLOY_DIR:-/root/deskrs/django}"
mkdir -p "$BACKUP_DIR"
cd "$DEPLOY_DIR"
set -a; [ -f .env ] && . ./.env; set +a
TS="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/rsconnect_${TS}.sql.gz"
docker compose exec -T db pg_dump -U "${DATABASE_USER:-rsconnector}" "${DATABASE_NAME:-rsconnector}" | gzip > "$FILE"
if [ ! -s "$FILE" ]; then
  echo "$(date '+%F %T') ERREUR: dump vide, suppression $FILE" >&2
  rm -f "$FILE"
  exit 1
fi
find "$BACKUP_DIR" -name "*.sql.gz" -type f -printf '%T@ %p\n' | sort -rn | tail -n +$((KEEP+1)) | cut -d' ' -f2- | xargs -r rm -f
echo "$(date '+%F %T') OK $FILE ($(du -h "$FILE" | cut -f1)) — $(ls "$BACKUP_DIR"/*.sql.gz 2>/dev/null | wc -l) sauvegarde(s)"
