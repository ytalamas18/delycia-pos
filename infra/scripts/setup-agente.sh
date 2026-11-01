#!/bin/bash
# Puesta en marcha del export para el agente (idempotente: se puede correr las veces que haga falta).
# Lo lanza el workflow "Setup agente" (GitHub Actions → SSM) o, a mano en la EC2: sudo bash infra/scripts/setup-agente.sh
#   1) usuario de solo lectura delycia_reader     2) deploy key para delycia-cerebro
#   3) clon de delycia-cerebro (si el deploy key ya está en GitHub)   4) timer diario 16:00 La Paz   5) primer export
set -Eeuo pipefail
export HOME="${HOME:-/root}"

APP_DIR=/opt/delycia
CEREBRO_DIR=/opt/delycia-cerebro
CONF=/etc/delycia
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml --project-directory $APP_DIR"
export GIT_SSH_COMMAND="ssh -i $CONF/cerebro_deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=$CONF/known_hosts"

install -d -m 700 "$CONF"

echo "==> 1) Usuario de solo lectura"
[ -s "$CONF/reader.pass" ] || (umask 077; openssl rand -base64 24 | tr -d '/+=' > "$CONF/reader.pass")
$COMPOSE exec -T db psql -U delycia -d delycia -X -q -v ON_ERROR_STOP=1 -v reader_pw="$(cat "$CONF/reader.pass")" \
  < "$APP_DIR/infra/db/delycia-reader.sql" | tail -1

echo "==> 2) Deploy key"
[ -f "$CONF/cerebro_deploy_key" ] || ssh-keygen -q -t ed25519 -N "" -C "delycia-export" -f "$CONF/cerebro_deploy_key"

echo "==> 3) Clon de delycia-cerebro"
if [ ! -d "$CEREBRO_DIR/.git" ]; then
  if git ls-remote -q git@github.com:ytalamas18/delycia-cerebro.git HEAD > /dev/null 2>&1; then
    git clone -q git@github.com:ytalamas18/delycia-cerebro.git "$CEREBRO_DIR"
  else
    echo
    echo "############ FALTA UN PASO MANUAL ############"
    echo "GitHub → ytalamas18/delycia-cerebro → Settings → Deploy keys → Add deploy key"
    echo "Title: delycia-export · marcar 'Allow write access' · Key:"
    echo
    cat "$CONF/cerebro_deploy_key.pub"
    echo
    echo "Después, volver a correr este setup."
    echo "##############################################"
    exit 0
  fi
fi

echo "==> 4) Timer diario 16:00 La Paz"
cat > /etc/systemd/system/delycia-export.service <<'EOF'
[Unit]
Description=Export diario de CSVs para delycia-cerebro
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
Environment=HOME=/root
ExecStart=/bin/bash /opt/delycia/infra/scripts/export-cerebro.sh
EOF
cat > /etc/systemd/system/delycia-export.timer <<'EOF'
[Unit]
Description=Export diario 16:00 (America/La_Paz)

[Timer]
OnCalendar=*-*-* 16:00:00 America/La_Paz
# Si la EC2 estaba apagada a las 16:00, corre al volver.
Persistent=true

[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now delycia-export.timer
systemctl list-timers delycia-export.timer --no-pager || true

echo "==> 5) Primer export"
bash "$APP_DIR/infra/scripts/export-cerebro.sh"
echo "SETUP AGENTE OK"
