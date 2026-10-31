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

## 4. Export diario → `delycia-cerebro/datos/`

- Consultas: `infra/db/export/*.sql` (una por CSV, `COPY ... TO STDOUT`). Script: `infra/scripts/export-cerebro.sh`.
- Programado por **SSM State Manager** (`ssm.tf`, `delycia-export-cerebro`): `cron(0 20 * * ? *)` = **16:00 La Paz**.
  Si falla, llega correo (misma regla de `alarms.tf` que el respaldo). Sin cron en el servidor ni servicios nuevos.
- Cada corrida reescribe los CSVs con todo el historial (recoge anulaciones y abonos tardíos), escribe
  `datos/ultimo_export.txt` y hace commit + push. Solo toca `datos/`; si hubo cambios en `memoria/` se rebasa.
- Probado en local contra un repo de prueba: CSVs correctos, sin cambios → no hace commit, no pisa `memoria/`.

| CSV | Columnas | Notas |
|---|---|---|
| `ventas_por_dia` | fecha, tickets, platos, items, total_bs, descuentos_bs, efectivo/qr/tarjeta/peya/fiado_bs, ordenes_anuladas, anulado_bs | Solo PAGADA/CERRADA; platos = tipo Preparado |
| `ventas_por_plato` | fecha, plato, categoria, tipo, canal, cantidad, precio_promedio_bs, total_bs | Antes del descuento de la orden |
| `gastos` | fecha, nro_compra, proveedor, concepto, categoria, tipo, cantidad, unidad, monto_bs, nota | tipo = `gasto_operativo` (categoría "Gastos operativos") o `insumo` |
| `pagos_deuda` | fecha, nro_compra, fecha_compra, proveedor, tipo, monto_bs, medio, nota | tipo = `contado` (mismo día) o `abono` |
| `cuentas_por_pagar` | proveedor, nro_compra, fecha_compra, total_bs, pagado_bs, saldo_bs, vencimiento, nota | Foto del día |
| `cuentas_por_cobrar` | cliente, fecha, nro_orden, monto_bs, cobrado_bs, saldo_bs | Fiados pendientes |
| `cierres_caja` | fecha, fondo, efectivo esperado/contado, diferencia, QR y tarjeta esperado/contado, notas | |

Por qué git y no S3: el agente lee GitHub directamente; con S3 haría falta darle credenciales de AWS. El deploy key
solo sirve para `delycia-cerebro` (si se filtra, no toca el POS ni AWS) y el historial de git guarda cada export.

### Puesta en marcha (una vez, en la EC2 como root)

1. Llave para el repo (sin contraseña, solo la lee root):
   ```bash
   ssh-keygen -t ed25519 -N "" -C "delycia-export" -f /etc/delycia/cerebro_deploy_key
   cat /etc/delycia/cerebro_deploy_key.pub
   ```
2. GitHub → `delycia-cerebro` → Settings → **Deploy keys** → Add: pegar la `.pub`, marcar **Allow write access**.
3. Clonar:
   ```bash
   GIT_SSH_COMMAND="ssh -i /etc/delycia/cerebro_deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new" \
     git clone git@github.com:ytalamas18/delycia-cerebro.git /opt/delycia-cerebro
   ```
4. Probar a mano: `bash /opt/delycia/infra/scripts/export-cerebro.sh` → `Export OK: ... (7 CSVs)`.
5. Desde tu PC: `terraform plan` (debe crear solo `aws_ssm_association.export_cerebro`) y `terraform apply`.

## 5. Gastos operativos y deudas en el POS (mientras no haya módulo propio)

Se registran como **compras** de ítems de una categoría especial. El export los separa del food cost.

1. **Catálogo → categoría `Gastos operativos`** (nombre exacto: el export la busca por nombre).
2. Ítems ahí, tipo **Insumo**, unidad **unidad**, **sin** "suma al inventario": Alquiler, Luz, Agua, Gas,
   Sueldo, Sistema (Siesam)... Así no generan stock.
3. **Proveedor** = a quién se le paga (dueño del local, Samuel, Yaque, Siesam...).
4. Compra con cantidad 1 y el monto. Si se debe: **crédito**; cada pago después es un **abono** → `pagos_deuda`.
5. **Deudas anteriores al sistema** (carne, papas, cerveza...): compra a crédito con la **fecha real** de la deuda
   y nota "deuda anterior", para no inflar el gasto de hoy.
6. **El préstamo de Yasser (5.000 Bs) NO va en el POS**: no es gasto ni venta. Se lleva en `memoria/deudas.md`.
7. **Ojo con el cierre de caja:** un pago a proveedor en **Efectivo** se resta del efectivo esperado del día. Si el
   dinero no salió del cajón (ej. lo pagaste con el préstamo o de tu bolsillo), regístralo como **Transferencia**
   con nota ("pagado con préstamo Yasser"); si no, el arqueo dará un sobrante falso.
