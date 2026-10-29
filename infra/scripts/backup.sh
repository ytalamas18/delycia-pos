#!/bin/bash
# Respaldo de Postgres → S3. Lo corre SSM State Manager cada noche (infra/terraform/ssm.tf) y deploy.sh antes
# de migrar. Formato custom de pg_dump (comprimido; se restaura con pg_restore, ver restore-test.sh).
#   bash infra/scripts/backup.sh <bucket> [etiqueta]
set -Eeuo pipefail

BUCKET="${1:?uso: backup.sh <bucket> [etiqueta]}"
LABEL="${2:-diario}"
APP_DIR=/opt/delycia
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --project-directory $APP_DIR"
STAMP=$(TZ=America/La_Paz date +%F-%H%M)
KEY="postgres/${STAMP}-${LABEL}.dump"
TMP=$(mktemp /tmp/delycia-backup.XXXXXX)
trap 'rm -f "$TMP"' EXIT

$COMPOSE exec -T db pg_dump -U delycia -d delycia --format=custom --compress=6 > "$TMP"

# Un dump válido empieza con "PGDMP"; si no, algo salió mal aunque pg_dump no haya fallado.
[ "$(head -c 5 "$TMP")" = "PGDMP" ] || { echo "Respaldo inválido (no es un dump de pg_dump)"; exit 1; }

aws s3 cp --only-show-errors "$TMP" "s3://$BUCKET/$KEY"
echo "Respaldo OK: s3://$BUCKET/$KEY ($(du -h "$TMP" | cut -f1))"
