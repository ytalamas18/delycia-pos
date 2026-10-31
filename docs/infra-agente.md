# Datos para el agente de gestión (`delycia-cerebro`)

El agente **nunca** se conecta a la base: lee CSVs que exporta la EC2. Todo lo de abajo lo corre Yasser
(Session Manager: `aws ssm start-session --target <instance_id> --profile delycia`, luego `sudo -i`).

## 1. Usuario de solo lectura `delycia_reader`

Script: `infra/db/delycia-reader.sql` (idempotente). Lee solo 18 tablas: ventas, pagos, caja, catálogo,
compras e inventario. No ve `User`, `AccessRole`, `DomainEvent` ni `Setting`. Además:
`default_transaction_read_only = on`, `statement_timeout = 30s`, máximo 3 conexiones.

```bash
cd /opt/delycia
install -d -m 700 /etc/delycia
# Contraseña aleatoria, solo la lee root. No se escribe en ningún comando ni en el historial.
[ -f /etc/delycia/reader.pass ] || (umask 077; openssl rand -base64 24 | tr -d '/+=' > /etc/delycia/reader.pass)
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U delycia -d delycia -v ON_ERROR_STOP=1 -v reader_pw="$(cat /etc/delycia/reader.pass)" \
  < infra/db/delycia-reader.sql
```
Debe terminar listando **18 rows**. Probado en local: lee `Order`; `User` → *permission denied*;
`DELETE`/`CREATE` → *read-only transaction*.

Si se agrega una tabla al análisis: sumarla al `GRANT` del script y volver a correrlo.

## 2. Respaldo diario (ya existe)

Ya está en producción (`docs/manual-infra/registro-terraform-ec2.md`, etapa 3, restauración probada el 30/10):
- `infra/scripts/backup.sh`: `pg_dump --format=custom` comprimido → `s3://delycia-backups-<cuenta>/postgres/`.
- Programado por **SSM State Manager** (`infra/terraform/ssm.tf`), 23:00 La Paz. Sin cron en el servidor.
- Rotación: regla de ciclo de vida del bucket, **expira a los 30 días** (`backup_retention_days`).
- Si falla: EventBridge → SNS → correo (`alarms.tf`). También corre antes de cada deploy.
- Permiso IAM de la EC2 para respaldos (`iam.tf`): `s3:PutObject` + `s3:GetObject` en `bucket/*` y
  `s3:ListBucket` en el bucket. **No puede borrar** respaldos. El mínimo estricto para solo subir sería
  `s3:PutObject`; Get/List quedan para poder restaurar (`restore-test.sh`).

Comprobar que siguen llegando:
```bash
aws s3 ls s3://delycia-backups-<cuenta>/postgres/ --profile delycia | tail -3
```

## 3. Puerto 5432 no expuesto

Tres capas: el servicio `db` de `docker-compose.prod.yml` no tiene `ports` (solo red interna de Docker), el
Security Group solo abre el 80 (`network.tf`; el 22 se cerró el 30/10) y Postgres no escucha en el host.

```bash
# 1) En la EC2: nada escucha en 5432 del host (salida vacía = bien)
ss -tlnp | grep 5432
# 2) En la EC2: la columna PORTS de db no debe mostrar "0.0.0.0:5432->"
docker compose -f /opt/delycia/docker-compose.prod.yml ps db
# 3) Desde tu PC: reglas de entrada del Security Group (solo debe salir 80)
aws ec2 describe-security-groups --group-names launch-wizard-1 --profile delycia \
  --query "SecurityGroups[].IpPermissions[].[FromPort,ToPort,IpRanges[].CidrIp]" --output text
# 4) Desde tu PC (PowerShell): debe decir TcpTestSucceeded : False
Test-NetConnection <IP-elastica> -Port 5432
```
