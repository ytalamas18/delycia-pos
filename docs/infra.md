# Infraestructura — Delycia POS

Estado al 17/10/2026. **Todavía no hay nada desplegado en AWS**: solo existe la infraestructura local (Docker).

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

## 2. Decisión de hosting (PROPUESTA, pendiente de confirmar por Yasser)

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

**Decisiones abiertas:**
1. EC2 vs Lightsail.
2. **Todo en la nube vs mixto** (app en una PC del local + AWS solo para respaldos). Riesgo de la nube: si se cae
   el internet del local, caja y cocina dejan de funcionar → plan B con hotspot 4G.
3. **Dominio** (necesario para HTTPS; costo no verificado). Ej.: `pos.<dominio>`.

## 3. Pendiente / sin probar

- Nada de AWS creado: ni cuenta configurada para el proyecto, ni Terraform, ni workflows de GitHub Actions.
- **Build ARM64** (Graviton) no probado (Prisma 7 + adapter pg en alpine arm64).
- Sin **respaldo** automático de la base (ni local ni en la nube).
- Sin **Caddy/HTTPS**; `COOKIE_SECURE` existe pero nunca se usó en `true`.
- Antes de exponer a internet (bloqueante): cambiar PIN de desarrollo (son públicos en el README), limitar
  intentos de login, `SESSION_SECRET` y `POSTGRES_PASSWORD` reales.

## 4. Próximos pasos (en orden)

1. Yasser confirma: EC2/Lightsail, nube/mixto, dominio.
2. Seguridad mínima en la app: pantalla para cambiar PIN (o PIN iniciales por variable de entorno), rate limit
   de login, `COOKIE_SECURE=true` detrás de HTTPS.
3. Script de respaldo `pg_dump` (local para Windows y para la EC2 → S3 con retención 30 días).
4. Terraform (`infra/`): VPC con subred pública, Security Group 80/443, EC2 + Elastic IP, rol IAM con SSM,
   ECR, bucket S3 de respaldos, AWS Budgets, alarma CloudWatch con auto-recovery. Estado remoto en S3.
5. GitHub Actions: `ci.yml` (lint, typecheck, test con Postgres service) y `deploy.yml` (OIDC → build arm64 →
   ECR → `docker compose pull && up -d` vía SSM).
6. `docker-compose.prod.yml` con Caddy y la imagen de ECR.
7. README de infra con diagrama y el porqué de cada decisión (portafolio).

## 5. Accesos necesarios (sin secretos)

- Cuenta AWS personal de Yasser (MFA en root, usuario IAM aparte, Budgets) — región `sa-east-1`.
- Rol IAM para GitHub OIDC con permisos acotados a ECR/SSM del proyecto.
- Repo: `github.com/ytalamas18/delycia-pos` (público). Secrets de producción en GitHub Actions / SSM Parameter
  Store, nunca en el repo.
- DNS del dominio (cuando exista) apuntando a la Elastic IP.
