# Infraestructura — Delycia POS

Estado al 17/10/2026. **Despliegue manual de prueba listo para lanzar** (aún sin recursos creados): EC2 + User Data,
ver `docs/deploy-manual.md`. Archivos: `docker-compose.prod.yml` (db sin puertos, migrate, app, Caddy :80),
`Caddyfile` (SSE sin buffer; HTTPS cambiando `SITE_ADDRESS`), `infra/user-data.sh`, `.env.production.example`.
Probado en local con Docker (build, migraciones + seed, login por Caddy, SSE). No probado aún en AWS.

## 1. Qué está configurado y funcionando (local)

| Pieza | Detalle | Estado |
|---|---|---|
| `Dockerfile` | Multi-stage `node:22-alpine`: `deps` (npm ci + prisma generate) → `build` (next build) → `runner` (standalone, usuario no root, `HEALTHCHECK` a `/api/health`) | ✅ probado (build limpio + día completo de ventas) |
| `docker-compose.yml` | `db` (postgres:16-alpine, volumen `pgdata`, healthcheck) → `migrate` (target `build`: `prisma migrate deploy && prisma db seed`) → `app` (puerto 3000). `restart: unless-stopped` en db y app | ✅ probado |
| `docker/postgres-init/01-test-db.sql` | Crea `delycia_test` al crear el volumen | ✅ |
| `.dockerignore` | Excluye node_modules, .next, .env, src/generated | ✅ |
| `/api/health` | Chequeo de vida (Docker y, a futuro, AWS) | ✅ |
| Tiempo real en producción | SSE con `Content-Encoding: none` + `X-Accel-Buffering: no`; probado con build standalone y gzip | ✅ |
| Seed | Idempotente; menú real una vez + actualizaciones versionadas (v2) | ✅ |

Notas del entorno de desarrollo (sandbox de Claude, NO del proyecto): para construir la imagen ahí hizo falta
un Dockerfile/compose temporal con la CA del proxy y `network: host`; Docker Hub dio 429 y se usó
`mirror.gcr.io`. En la PC de Yasser no aplica.

## 2. Decisión de hosting

Recomendada: **una EC2 `t4g.small` (ARM/Graviton) en `sa-east-1` (São Paulo)** con Docker Compose.

```
Tablets/PC caja ──HTTPS──▶ Elastic IP ──▶ EC2 t4g.small
                                           ├─ Caddy (HTTPS automático, Let's Encrypt)
                                           ├─ app (imagen de ECR)
                                           └─ Postgres (EBS gp3 20 GB) ──pg_dump diario──▶ S3
GitHub Actions ──OIDC──▶ ECR ──SSM Run Command──▶ EC2   (sin SSH, sin claves largas)
```

Costos verificados en la **AWS Price List API** (sa-east-1, lista publicada 2026-10-15, 730 h/mes):

| Opción | US$/mes |
|---|---|
| EC2 t4g.small 19,56 + gp3 20 GB 3,04 + IPv4 3,65 | **≈ 26,25** (recomendada) |
| Igual con t4g.micro (1 GiB, justo) | ≈ 16,47 |
| Lightsail 2 GB (IPv4 incluida) | ≈ 11,77 (más simple, menos valor de portafolio) |
| + RDS db.t4g.micro + 20 GB (en vez de Postgres en Docker) | +29,20 (descartado: duplica el costo) |
| ECS Fargate + RDS + ALB | descartado (caro y sobredimensionado) |

Por qué: costo bajo, sin NAT Gateway ni ALB, una sola instancia (el hub SSE es en memoria), buen material de
portafolio (Terraform + CI/CD + backups + OIDC). Volver a verificar precios antes de crear recursos.

**Decidido por Yasser (17/10/2026):**
- **EC2** en la nube, **sin dominio**: se entra por `http://<Elastic IP>`. Sin HTTPS por ahora (acepta que el
  tráfico, incluidos los PIN, viaje en texto plano) → `COOKIE_SECURE=false`, Caddy queda para después.
- Opción futura sin comprar dominio: Let's Encrypt emite certificados para **IP** (GA desde 15/01/2026, vida de
  ~6 días, perfil `shortlived`, reto http-01/tls-alpn-01). Soporte en Caddy sin confirmar (ver caddy#7399).
- Pendiente: todo en la nube vs mixto (riesgo: sin internet en el local no hay caja ni cocina → hotspot 4G).

## 3. Pendiente / sin probar

- Nada de AWS creado: ni cuenta configurada para el proyecto, ni Terraform, ni workflows de GitHub Actions.
- **Build ARM64** (Graviton) no probado (Prisma 7 + adapter pg en alpine arm64).
- Sin **respaldo** automático de la base (ni local ni en la nube).
- Sin **HTTPS** (decisión: por ahora HTTP con la IP).
- ✅ Hecho: PIN fuera del repo (seed con variables `*_PIN` o aleatorios), cambio de PIN en Ajustes, bloqueo
  15 min tras 5 fallos, cabeceras de seguridad. Falta: `SESSION_SECRET` y `POSTGRES_PASSWORD` reales en la EC2
  (SSM Parameter Store) y que el Security Group no exponga el 5432.

## 4. Próximos pasos (en orden)

1. ✅ EC2 sin dominio. 2. ✅ Seguridad mínima de la app (PIN, bloqueo, cabeceras).
   Yasser en paralelo: cuenta AWS (MFA, usuario admin, Budgets, CLI con perfil `delycia`).
3. Script de respaldo `pg_dump` (local para Windows y para la EC2 → S3 con retención 30 días).
4. Terraform (`infra/`): VPC con subred pública, Security Group 80 (443 cuando haya HTTPS), EC2 + Elastic IP, rol IAM con SSM,
   ECR, bucket S3 de respaldos, AWS Budgets, alarma CloudWatch con auto-recovery. Estado remoto en S3.
5. GitHub Actions: `ci.yml` (lint, typecheck, test con Postgres service) y `deploy.yml` (OIDC → build arm64 →
   ECR → `docker compose pull && up -d` vía SSM).
6. `docker-compose.prod.yml` con la imagen de ECR (app en el puerto 80; Caddy cuando haya HTTPS).
7. README de infra con diagrama y el porqué de cada decisión (portafolio).

## 5. Accesos necesarios (sin secretos)

- Cuenta AWS personal de Yasser (MFA en root, usuario IAM aparte, Budgets) — región `sa-east-1`.
- Rol IAM para GitHub OIDC con permisos acotados a ECR/SSM del proyecto.
- Repo: `github.com/ytalamas18/delycia-pos` (público). Secrets de producción en GitHub Actions / SSM Parameter
  Store, nunca en el repo.
- DNS del dominio (cuando exista) apuntando a la Elastic IP.
