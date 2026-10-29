#!/bin/bash
# Prueba de restauración: baja el último respaldo de S3 y lo carga en un Postgres TEMPORAL (otro contenedor,
# sin tocar la base de producción). Cuenta filas de tablas clave y borra el contenedor.
#   bash infra/scripts/restore-test.sh <bucket>
set -Eeuo pipefail

BUCKET="${1:?uso: restore-test.sh <bucket>}"
NAME=delycia-restore-test
LAST=$(aws s3 ls "s3://$BUCKET/postgres/" | sort | tail -1 | awk '{print $4}')
[ -n "$LAST" ] || { echo "No hay respaldos en s3://$BUCKET/postgres/"; exit 1; }
TMP=$(mktemp /tmp/delycia-restore.XXXXXX)
trap 'rm -f "$TMP"; docker rm -f "$NAME" > /dev/null 2>&1 || true' EXIT

echo "==> Restaurando $LAST"
aws s3 cp --only-show-errors "s3://$BUCKET/postgres/$LAST" "$TMP"
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=restore -e POSTGRES_USER=delycia -e POSTGRES_DB=delycia \
  postgres:16-alpine > /dev/null
for i in $(seq 1 30); do docker exec "$NAME" pg_isready -U delycia -d delycia > /dev/null 2>&1 && break; sleep 2; done
docker exec -i "$NAME" pg_restore -U delycia -d delycia --no-owner --exit-on-error < "$TMP"

docker exec "$NAME" psql -U delycia -d delycia -At -c "
  SELECT 'Order', count(*) FROM \"Order\" UNION ALL
  SELECT 'Product', count(*) FROM \"Product\" UNION ALL
  SELECT 'User', count(*) FROM \"User\" UNION ALL
  SELECT '_prisma_migrations', count(*) FROM _prisma_migrations;"
echo "Restauración OK"
