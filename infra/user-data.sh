#!/bin/bash
# =====================================================================================
# Delycia POS — User Data para EC2 (Amazon Linux 2023, x86_64 o arm64).
# Se pega en "Advanced details → User data" al lanzar la instancia. Sin intervención:
# sistema al día, zona horaria, swap 2 GB, Docker + compose, clona el repo, genera .env
# y levanta docker-compose.prod.yml. Log: /var/log/delycia-setup.log
#
# VERSIÓN DE PRUEBA RÁPIDA: los secretos se generan y quedan en /opt/delycia/.env (en el
# disco de la EC2), sin SSM ni IAM. Revisar seguridad antes de usarlo en serio.
#
# Idempotente: para actualizar o reintentar, desde EC2 Instance Connect:
#   sudo /usr/local/sbin/delycia-setup
# =====================================================================================
set -Eeuo pipefail

REPO_URL="https://github.com/ytalamas18/delycia-pos.git"
BRANCH="main"
APP_DIR="/opt/delycia"
TIMEZONE="America/La_Paz"
SEED_MENU="true"          # carga el menú real de Delycia la primera vez
COMPOSE_VERSION="v2.29.7"
BUILDX_VERSION="v0.17.1"

LOG=/var/log/delycia-setup.log
exec > >(tee -a "$LOG") 2>&1
STEP="inicio"
step() { STEP="$1"; echo; echo "==> [$(date '+%F %T')] $1"; }
trap 'echo "### SETUP FALLÓ en el paso: $STEP (línea $LINENO). Revisa $LOG"; echo "FALLO: $STEP" > /var/lib/delycia-setup.status' ERR

echo "===== Delycia setup $(date '+%F %T') ====="
mkdir -p /var/lib && echo "EN CURSO" > /var/lib/delycia-setup.status

# Guarda una copia de este script para poder re-ejecutarlo después.
if [ "$(readlink -f "$0")" != /usr/local/sbin/delycia-setup ]; then
  install -m 700 "$0" /usr/local/sbin/delycia-setup
fi

step "Actualizar el sistema"
dnf -y upgrade --refresh
dnf -y install docker git

step "Zona horaria $TIMEZONE"
timedatectl set-timezone "$TIMEZONE"

step "Swap de 2 GB"
if ! swapon --show | grep -q /swapfile; then
  [ -f /swapfile ] || { dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; chmod 600 /swapfile; mkswap /swapfile; }
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab

step "Docker + compose + buildx"
systemctl enable --now docker
ARCH=$(uname -m); case "$ARCH" in x86_64) BX=amd64 ;; aarch64) BX=arm64 ;; *) echo "Arquitectura no soportada: $ARCH"; exit 1 ;; esac
PLUGINS=/usr/local/lib/docker/cli-plugins
mkdir -p "$PLUGINS"
if ! docker compose version 2>/dev/null | grep -q "${COMPOSE_VERSION#v}"; then
  curl -fsSL -o "$PLUGINS/docker-compose" \
    "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${ARCH}"
  chmod +x "$PLUGINS/docker-compose"
fi
if ! docker buildx version 2>/dev/null | grep -q "${BUILDX_VERSION}"; then
  curl -fsSL -o "$PLUGINS/docker-buildx" \
    "https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-${BX}"
  chmod +x "$PLUGINS/docker-buildx"
fi
docker compose version
docker buildx version

step "Clonar / actualizar el repo ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
git -C "$APP_DIR" log -1 --oneline

step "Generar .env (los secretos se crean una sola vez y se conservan)"
ENV_FILE="$APP_DIR/.env"
touch "$ENV_FILE"; chmod 600 "$ENV_FILE"
get() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
rand_hex() { od -An -N"$1" -tx1 /dev/urandom | tr -d " \n"; }
rand_pin() {  # 4 dígitos, sin PIN débiles (iguales, escaleras, años 19xx/20xx)
  local p
  while :; do
    p=$(printf '%04d' $(( $(od -An -N2 -tu2 /dev/urandom) % 10000 )))
    [[ $p =~ ^(.)\1\1\1$ || $p =~ ^(19|20) || 0123456789 == *"$p"* || 9876543210 == *"$p"* ]] || { echo "$p"; return; }
  done
}
TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')
PUBLIC_IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || echo localhost)

POSTGRES_PASSWORD=$(get POSTGRES_PASSWORD); : "${POSTGRES_PASSWORD:=$(rand_hex 24)}"
SESSION_SECRET=$(get SESSION_SECRET);       : "${SESSION_SECRET:=$(rand_hex 32)}"
ADMIN_PIN=$(get ADMIN_PIN);   : "${ADMIN_PIN:=$(rand_pin)}"
CAJA_PIN=$(get CAJA_PIN);     : "${CAJA_PIN:=$(rand_pin)}"
COCINA_PIN=$(get COCINA_PIN); : "${COCINA_PIN:=$(rand_pin)}"
APP_URL="http://$PUBLIC_IP"

cat > "$ENV_FILE" <<EOF
# Generado por delycia-setup el $(date '+%F %T'). Ver .env.production.example
APP_URL=$APP_URL
SITE_ADDRESS=:80
COOKIE_SECURE=false
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
SESSION_SECRET=$SESSION_SECRET
SEED_MENU=$SEED_MENU
ADMIN_PIN=$ADMIN_PIN
CAJA_PIN=$CAJA_PIN
COCINA_PIN=$COCINA_PIN
EOF

step "Construir y levantar docker-compose.prod.yml (la primera vez tarda ~10-15 min)"
cd "$APP_DIR"
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

step "Esperar a que la app responda en http://localhost/api/health"
for i in $(seq 1 60); do
  if curl -fsS http://localhost/api/health > /dev/null 2>&1; then break; fi
  [ "$i" = 60 ] && { docker compose -f docker-compose.prod.yml ps; docker compose -f docker-compose.prod.yml logs --tail 50; false; }
  sleep 5
done
docker compose -f docker-compose.prod.yml ps
docker image prune -f > /dev/null

echo "OK $(date '+%F %T')" > /var/lib/delycia-setup.status
echo
echo "###############################################################"
echo "### SETUP OK — abre http://$PUBLIC_IP (o tu Elastic IP)"
echo "### PIN iniciales (solo valen si la base es nueva): sudo grep PIN $ENV_FILE"
echo "###############################################################"
