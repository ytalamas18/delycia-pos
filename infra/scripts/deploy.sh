#!/bin/bash
# Despliegue desde GitHub Actions (vía SSM Run Command). El workflow ya dejó /opt/delycia en el commit <sha>.
#   bash infra/scripts/deploy.sh <sha> <registro-ecr> <bucket-respaldos>
# 1) respaldo antes de migrar  2) baja las imágenes de ECR  3) migra + seed  4) reinicia la app  5) espera /api/health
# No reconstruye nada en la EC2. El build local (sudo /usr/local/sbin/delycia-setup) queda como plan B.
set -Eeuo pipefail

SHA="${1:?uso: deploy.sh <sha> <registro> <bucket>}"
REGISTRY="${2:?falta el registro ECR}"
BUCKET="${3:?falta el bucket de respaldos}"
REPO="$REGISTRY/delycia-pos"
APP_DIR=/opt/delycia
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --project-directory $APP_DIR"
cd "$APP_DIR"

echo "==> Respaldo previo"
if $COMPOSE ps --status running --services 2>/dev/null | grep -qx db; then
  bash infra/scripts/backup.sh "$BUCKET" "pre-deploy-${SHA:0:7}"
else
  echo "(la base no está corriendo: sin respaldo previo)"
fi

echo "==> Imágenes $SHA"
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin "$REGISTRY" > /dev/null
docker pull -q "$REPO:app-$SHA"
docker pull -q "$REPO:migrate-$SHA"
# Se re-etiquetan con los nombres que usa docker-compose.prod.yml: así los comandos de siempre siguen sirviendo.
docker tag "$REPO:app-$SHA" delycia-pos-app:latest
docker tag "$REPO:migrate-$SHA" delycia-pos-build:latest

echo "==> Levantar (migrate corre antes que la app)"
$COMPOSE up -d --no-build --remove-orphans

for i in $(seq 1 60); do
  if curl -fsS http://localhost/api/health > /dev/null 2>&1; then break; fi
  if [ "$i" = 60 ]; then $COMPOSE ps; $COMPOSE logs --tail 80 migrate app; exit 1; fi
  sleep 5
done
$COMPOSE ps
echo "OK $(date '+%F %T') $SHA (deploy)" > /var/lib/delycia-setup.status
docker image prune -f > /dev/null
echo "Despliegue OK: ${SHA:0:7}"
