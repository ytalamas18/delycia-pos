#!/bin/bash
# Export diario de CSVs para el agente de gestión → carpeta datos/ del repo privado delycia-cerebro.
# Lo corre SSM State Manager a las 16:00 La Paz (infra/terraform/ssm.tf). Se puede correr a mano:
#   bash infra/scripts/export-cerebro.sh
# Lee la base con delycia_reader (solo lectura) y empuja con un deploy key que solo sirve para ese repo.
# Cada corrida reescribe los CSVs con TODO el historial (así recoge anulaciones y abonos tardíos).
# Puesta en marcha: docs/infra-agente.md.
set -Eeuo pipefail

APP_DIR=/opt/delycia
CEREBRO_DIR=/opt/delycia-cerebro
PASS_FILE=/etc/delycia/reader.pass
KEY_FILE=/etc/delycia/cerebro_deploy_key
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --project-directory $APP_DIR"
export GIT_SSH_COMMAND="ssh -i $KEY_FILE -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

[ -d "$CEREBRO_DIR/.git" ] || { echo "Falta el clon en $CEREBRO_DIR (ver docs/infra-agente.md)"; exit 1; }
[ -r "$PASS_FILE" ] || { echo "Falta $PASS_FILE (ver docs/infra-agente.md)"; exit 1; }

# El clon de la EC2 solo escribe datos/: se alinea siempre con lo último de GitHub.
git -C "$CEREBRO_DIR" fetch -q origin main
git -C "$CEREBRO_DIR" checkout -q -B main origin/main

# Primero todo a una carpeta temporal: si una consulta falla, no queda un export a medias.
TMP=$(mktemp -d /tmp/delycia-export.XXXXXX)
trap 'rm -rf "$TMP"' EXIT
for sql in "$APP_DIR"/infra/db/export/*.sql; do
  name=$(basename "$sql" .sql)
  $COMPOSE exec -T -e PGPASSWORD="$(cat "$PASS_FILE")" db \
    psql -h 127.0.0.1 -U delycia_reader -d delycia -X -q -v ON_ERROR_STOP=1 < "$sql" > "$TMP/$name.csv"
done

STAMP=$(TZ=America/La_Paz date '+%F %H:%M')
POS_SHA=$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo "?")
mkdir -p "$CEREBRO_DIR/datos"
cp "$TMP"/*.csv "$CEREBRO_DIR/datos/"
printf 'export: %s (hora La Paz)\npos: %s\n' "$STAMP" "$POS_SHA" > "$CEREBRO_DIR/datos/ultimo_export.txt"

cd "$CEREBRO_DIR"
git add datos/
if git diff --cached --quiet; then echo "Export OK: sin cambios ($STAMP)"; exit 0; fi
git -c user.name="Delycia export" -c user.email="export@delycia.local" \
  commit -q -m "datos: export ${STAMP%% *}"
# Si alguien empujó memoria/ mientras tanto, se rebasa (no tocan los mismos archivos) y se reintenta una vez.
git push -q origin main || { git pull -q --rebase origin main && git push -q origin main; }
echo "Export OK: $STAMP ($(ls "$TMP" | wc -l) CSVs)"
