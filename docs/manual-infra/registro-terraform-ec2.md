# Registro: Terraform + CI/CD sobre la EC2 de Delycia (29/10/2026)

Lo que hizo el agente para pasar la EC2 creada a mano a infraestructura como código, con respaldos y despliegue
automático. Cada paso tiene el comando real y el porqué. Complementa a `README.md` (las etapas) y a
`docs/deploy-manual.md` (cómo se creó la EC2 a mano).

Valores que **no** van en el repo (es público): ID de cuenta, IP, correo. Viven en `infra/terraform/terraform.tfvars`
y `infra/terraform/backend.hcl` (ignorados por git; hay `*.example` de cada uno).

## Resumen

| Etapa | Qué quedó | Estado |
|---|---|---|
| 0 | Root con MFA y sin access keys; Identity Center (usuario `yasser`, `AdministratorAccess`); perfil CLI `delycia`; Budget US$30/mes; Terraform 1.17.1 | ✅ |
| 1 | Bucket de estado remoto `delycia-tfstate-<cuenta>` (versionado, cifrado, privado, bloqueo nativo S3) | ✅ |
| 2 | EC2, Security Group (3 reglas), Elastic IP y su asociación **importados** → `plan` = "No changes" | ✅ |
| 2b | Rol IAM con SSM, protección contra borrado, disco que sobrevive a la instancia | ⏳ escrito, falta `apply` |
| 3 | Bucket de respaldos (30 días), respaldo diario por SSM State Manager, prueba de restauración | ⏳ escrito, falta `apply` |
| 4 | GitHub Actions: lint, typecheck y tests con Postgres en cada push/PR | ✅ escrito (corre al hacer push) |
| 5 | OIDC + ECR + deploy por SSM en push a `main` | ⏳ escrito, falta `apply` + variables en GitHub |
| 6 | Alarmas: recuperación automática (host), reinicio (instancia), correo si falla un respaldo/deploy | ⏳ escrito, falta `apply` |
| — | Cerrar el puerto 22 | ⏳ después de comprobar SSM |
| — | HTTPS | ❌ no se hizo: cambia la URL de caja y cocina, decisión de Yasser (ver al final) |

## Archivos

```
infra/
├─ terraform/
│  ├─ bootstrap/main.tf        bucket del estado (estado local, se corre una vez)
│  ├─ versions.tf              versión de Terraform/provider + backend S3 (bucket en backend.hcl)
│  ├─ providers.tf             región sa-east-1, perfil delycia, allowed_account_ids, etiquetas comunes
│  ├─ variables.tf             account_id, alert_email, github_repo, backup_retention_days
│  ├─ imports.tf               los 7 import de lo creado a mano
│  ├─ ec2.tf                   instancia + Elastic IP (+ lifecycle para no reemplazarla)
│  ├─ network.tf               Security Group y sus reglas
│  ├─ iam.tf                   rol de la EC2 (SSM, subir respaldos, bajar imágenes)
│  ├─ backups.tf               bucket de respaldos con expiración
│  ├─ ecr.tf                   repositorio de imágenes (conserva 10)
│  ├─ github-oidc.tf           proveedor OIDC + rol de deploy (solo main de este repo)
│  ├─ ssm.tf                   respaldo diario 23:00 La Paz
│  ├─ alarms.tf                SNS por correo, alarmas de la EC2, regla de SSM fallido
│  ├─ outputs.tf
│  └─ *.example                plantillas de terraform.tfvars y backend.hcl
└─ scripts/
   ├─ backup.sh                pg_dump (formato custom) → S3
   ├─ deploy.sh                respaldo previo → pull de ECR → migrate → app → /api/health
   └─ restore-test.sh          restaura el último respaldo en un Postgres temporal y cuenta filas
.github/workflows/ci-cd.yml    CI + CD
```

## Etapa 0 — Preparación

1. Yasser, en la consola con root: MFA en root, activó IAM Identity Center **con AWS Organizations** (la
   instancia "de cuenta" no permite permission sets), creó el usuario `yasser` (sin grupo), el permission set
   `AdministratorAccess` (8 h) y lo asignó a la cuenta.
2. Agente: Terraform sin `sudo`, verificando el checksum oficial:
   ```bash
   V=1.17.1
   curl -fsSLO https://releases.hashicorp.com/terraform/$V/terraform_${V}_linux_amd64.zip
   curl -fsSLO https://releases.hashicorp.com/terraform/$V/terraform_${V}_SHA256SUMS
   grep linux_amd64.zip terraform_${V}_SHA256SUMS | sha256sum -c -
   unzip terraform_${V}_linux_amd64.zip terraform -d ~/.local/bin
   ```
3. Agente: perfil en `~/.aws/config` (equivale a `aws configure sso`):
   ```ini
   [sso-session delycia]
   sso_start_url = https://d-xxxxxxxxxx.awsapps.com/start
   sso_region = sa-east-1
   sso_registration_scopes = sso:account:access

   [profile delycia]
   sso_session = delycia
   sso_account_id = <cuenta>
   sso_role_name = AdministratorAccess
   region = sa-east-1
   ```
   Login: `aws sso login --profile delycia --use-device-code` (sin `--use-device-code` el navegador no
   devolvió la aprobación al puerto local y el comando quedó colgado).
   Verificación: `aws sts get-caller-identity --profile delycia` → la cuenta personal y el rol
   `AWSReservedSSO_AdministratorAccess_.../yasser`.
4. Agente: comprobó root con `aws iam get-account-summary` (`AccountMFAEnabled=1`, `AccountAccessKeysPresent=0`).
5. Agente: Budget `delycia-mensual` (US$30; avisos al 85 % y 100 % real y 100 % proyectado) con
   `aws budgets create-budget`. Primero fue US$23, pero Cost Explorer mostró que la base real es
   **≈ US$1,02/día ≈ US$31/mes** (EC2 cómputo ≈ 0,75/día, IPv4 pública, disco gp3). Con US$30 la alerta
   "proyectada" puede saltar en meses de 31 días: es la referencia, no un error.

## Etapa 1 — Estado remoto

```bash
cd infra/terraform/bootstrap
terraform init && terraform apply -var account_id=<cuenta>
```
Crea `delycia-tfstate-<cuenta>`: versionado (recuperar un estado anterior), cifrado AES256, acceso público
bloqueado, versiones viejas se borran a los 90 días, `prevent_destroy`. Su propio estado queda en
`bootstrap/terraform.tfstate` (local, fuera de git): solo describe este bucket.

En la raíz, el backend usa **bloqueo nativo de S3** (`use_lockfile = true`, Terraform ≥ 1.10), sin tabla DynamoDB.
El nombre del bucket va en `backend.hcl` para no publicar el ID de cuenta:
```bash
cd infra/terraform
cp backend.hcl.example backend.hcl        # y poner el ID
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
```

`providers.tf` tiene `allowed_account_ids = [var.account_id]`: si el perfil apuntara a la cuenta del trabajo,
Terraform corta antes de hacer nada.

## Etapa 2 — Importar la EC2

0. **Red de seguridad:** snapshot del disco antes de tocar nada:
   ```bash
   aws ec2 create-snapshot --volume-id vol-00a82fa3d8826c49e --description "antes de Terraform"
   ```
   → `snap-0aba4cb4fff7bcd51` (cuesta centavos al mes; borrarlo cuando haya respaldos diarios funcionando).
1. Inventario con la CLI (`describe-instances`, `describe-security-group-rules`, `describe-addresses`,
   `describe-volumes`): `t3.small`, AMI AL2023 `ami-0de7704dcfbf9a7ae`, `sa-east-1c`, IMDSv2, créditos
   `unlimited`, gp3 20 GiB sin cifrar, SG `launch-wizard-1` con 80 y 22 abiertos a internet, sin rol IAM.
2. Bloques `import { to = ..., id = ... }` en `imports.tf` y `terraform plan -generate-config-out=generated.tf`
   para ver qué atributos lee Terraform. El archivo generado se **borró** (traía la IP pública y ruido) y se
   escribió el HCL a mano.
3. Decisiones para que **nunca** reemplace la instancia (reemplazar = disco nuevo = base vacía):
   - `lifecycle.ignore_changes = [ami, user_data, user_data_base64, associate_public_ip_address]`.
   - Reglas del SG como recursos separados (`aws_vpc_security_group_ingress_rule`), importadas por su `sgr-…`,
     para poder quitar la del 22 sin tocar el grupo. El nombre `launch-wizard-1` se conserva (renombrar un SG
     lo recrea).
   - `prevent_destroy` en la Elastic IP.
4. Resultado:
   ```
   Plan: 7 to import, 0 to add, 0 to change, 0 to destroy.
   Apply complete! Resources: 7 imported, 0 added, 0 changed, 0 destroyed.
   terraform plan → No changes. Your infrastructure matches the configuration.
   ```

### 2b — Mejoras sobre la EC2 (en caliente, sin reinicio)

`terraform plan` muestra en la instancia **solo** cambios in-place:
```
~ disable_api_termination = false -> true       # no se puede borrar por error
+ iam_instance_profile    = "delycia-pos-ec2"    # SSM, respaldos a S3, pull de ECR
~ root_block_device.delete_on_termination = true -> false   # si se borra la instancia, el disco queda
+ etiquetas Project / ManagedBy
```
El resto de cambios in-place (SG, reglas, Elastic IP) son solo las etiquetas comunes.

Rol de la EC2 (`iam.tf`), mínimo necesario:
- `AmazonSSMManagedInstanceCore` (Session Manager y Run Command; el agente SSM ya viene en Amazon Linux 2023).
- `s3:PutObject` solo en el bucket de respaldos (no puede borrar ni leer).
- Pull de ECR solo del repositorio `delycia-pos`.

## Etapa 3 — Respaldos

- Bucket `delycia-backups-<cuenta>`: privado, cifrado, **expira a los 30 días** (`backup_retention_days`).
- `infra/scripts/backup.sh <bucket> [etiqueta]`: `pg_dump --format=custom` dentro del contenedor `db`,
  comprueba que el archivo empiece con `PGDMP`, lo sube a `s3://<bucket>/postgres/AAAA-MM-DD-HHMM-<etiqueta>.dump`.
- `ssm.tf`: asociación de State Manager `delycia-backup-diario`, `cron(0 3 * * ? *)` = **23:00 La Paz**, con
  `apply_only_at_cron_interval = true` (si no, corre al crearse, antes de que el script exista en la EC2).
- `deploy.sh` además hace un respaldo `pre-deploy-<sha>` antes de cada migración.
- Si un respaldo falla, EventBridge → SNS → correo (`alarms.tf`).

Prueba de restauración (no toca producción; usa un contenedor temporal):
```bash
aws ssm send-command --profile delycia --instance-ids <id> --document-name AWS-RunShellScript \
  --parameters 'commands=["bash /opt/delycia/infra/scripts/restore-test.sh delycia-backups-<cuenta>"]'
```
Restaurar de verdad (emergencia): bajar el `.dump`, `docker compose ... stop app`, y
`pg_restore --clean --if-exists -U delycia -d delycia < archivo.dump` dentro del contenedor `db`.

## Etapa 4 — CI

`.github/workflows/ci-cd.yml`, job `ci`, en cada push y PR: Postgres 16 como *service* (base `delycia_test`),
`npm ci` → `npm run lint` → `npm run typecheck` → `npm test`. Verificado en local antes de subir: lint y
typecheck limpios, 161 tests OK.

## Etapa 5 — CD

Flujo en push a `main` (solo si el CI pasa):
```
GitHub Actions ──OIDC──▶ rol delycia-github-deploy
   ├─ build target runner ─▶ ECR delycia-pos:app-<sha>
   ├─ build target build  ─▶ ECR delycia-pos:migrate-<sha>   (trae Prisma CLI para migrar)
   └─ ssm send-command ─▶ EC2: git reset al <sha> (compose, Caddyfile, scripts)
                               └─ infra/scripts/deploy.sh: respaldo → pull → re-tag → compose up → /api/health
```
- **Sin claves en GitHub:** el rol confía en `token.actions.githubusercontent.com` solo para
  `repo:ytalamas18/delycia-pos:ref:refs/heads/main`. Un fork, una rama o un PR no pueden desplegar.
  Por eso el job no usa `environment:` (cambiaría el `sub` del token).
- Permisos del rol: push a ese repositorio de ECR y `ssm:SendCommand` solo sobre esa instancia.
- `deploy.sh` re-etiqueta las imágenes como `delycia-pos-app:latest` / `delycia-pos-build:latest`, los
  nombres que ya usa `docker-compose.prod.yml`: el compose no cambió y los comandos de siempre sirven.
- La EC2 ya **no compila** (antes: 10-15 min de CPU al 100 % en el servidor). `sudo /usr/local/sbin/delycia-setup`
  sigue como plan B (construye local desde `main`).
- El job `deploy` se salta solo mientras no exista la variable `AWS_DEPLOY_ROLE_ARN`.
- Volver atrás: re-ejecutar el workflow de un commit anterior (Actions → la corrida → *Re-run*), o en la EC2
  `bash infra/scripts/deploy.sh <sha-anterior> <registro> <bucket>` (ECR guarda las 10 últimas imágenes).

## Etapa 6 — Alarmas

- `delycia-pos-falla-sistema`: `StatusCheckFailed_System` 2 min → **recover** (otro host, misma IP y disco) + correo.
- `delycia-pos-falla-instancia`: `StatusCheckFailed_Instance` 3 min → **reboot** + correo.
- `delycia-ssm-fallido`: cualquier comando SSM en la EC2 con estado Failed/TimedOut (respaldo o deploy) → correo.
- Tema SNS `delycia-alertas` → correo de alertas. **AWS manda un correo "Subscription Confirmation": hay que
  aceptarlo** o no llega nada.
- Costo: 2 alarmas estándar ≈ US$0,20/mes; SNS por correo y EventBridge, gratis a este volumen.

## Pendiente

### Lo que hace Yasser

1. **Aplicar** (el modo automático de Claude Code bloquea `terraform apply` en la cuenta):
   ```bash
   cd ~/delycia-pos/infra/terraform && terraform apply
   ```
   Revisar que diga `21 to add, 6 to change, 0 to destroy` y que **no** aparezca `must be replaced`.
2. Aceptar el correo de suscripción de SNS.
3. GitHub → repo → Settings → Secrets and variables → Actions → **Variables** → crear (valores de
   `terraform output`): `AWS_DEPLOY_ROLE_ARN`, `EC2_INSTANCE_ID`, `BACKUPS_BUCKET`.

### Lo que hace el agente después del apply

1. Comprobar que la EC2 aparece en SSM (`aws ssm describe-instance-information`).
2. Push → CI → primer deploy por CD (lleva a producción compras, inventario y recetas, con respaldo previo).
3. Respaldo manual + `restore-test.sh`.
4. Cerrar el 22: borrar `aws_vpc_security_group_ingress_rule.ssh` (y su `import`) y aplicar. Desde ahí se
   entra con **Session Manager** (consola → EC2 → Connect → Session Manager, o
   `aws ssm start-session --target <id> --profile delycia`).
5. Borrar el snapshot previo cuando haya una semana de respaldos.

### Decisiones abiertas

- **HTTPS:** sin comprar dominio se puede usar `<IP-con-guiones>.sslip.io` (Caddy saca el certificado solo).
  Implica cambiar la dirección en la caja y la tablet y abrir el 443. Decisión de Yasser del 17/10: por ahora HTTP.
- Secretos de `/opt/delycia/.env` → SSM Parameter Store (hoy siguen en el disco de la EC2, permisos 600).
- Disco sin cifrar: cifrarlo exige snapshot → volumen nuevo cifrado → cambio de disco con la instancia apagada
  (~10 min sin servicio).
