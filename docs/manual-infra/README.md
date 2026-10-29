# Manual de infraestructura — Delycia POS

Manual práctico para pasar del despliegue a mano (`docs/deploy-manual.md`) a infraestructura como código
(Terraform) y despliegue automático (GitHub Actions). Cada etapa la ejecuta Yasser a mano; el código lo escribe
el agente y se explica bloque por bloque. Al cerrar una etapa se anota aquí lo que pasó de verdad.

## Cómo trabajamos

1. Leer la etapa completa antes de tocar nada.
2. Ejecutar paso a paso. Ante cualquier duda o error, preguntar con el número de paso (ej. "0.3 me da este error").
3. Verificar con la lista de la etapa. Si algo no cuadra, no avanzar.
4. Al terminar, se completa la sección **Bitácora** de la etapa (fecha, valores no secretos, problemas).

Reglas: nada de secretos en el repo (es público): ni claves, ni PIN, ni la IP. Revisar el precio antes de crear
recursos. Cambios en producción fuera del horario de atención (12:00-15:00).

## Etapas

| # | Etapa | Qué aprendes | Estado |
|---|---|---|---|
| 0 | [Preparación](00-preparacion.md) | Cuenta AWS segura, IAM, CLI con perfil, Budgets, instalar Terraform | ✅ 29/10 |
| 1 | Primer Terraform | `init` / `plan` / `apply` / `destroy`, estado remoto en S3, bucket de respaldos | ✅ estado · ⏳ respaldos |
| 2 | Importar la EC2 a Terraform | `terraform import`: traer la EC2, su Security Group y la Elastic IP actuales; luego agregar rol IAM con SSM y cerrar el puerto 22 | ✅ import · ⏳ rol y 22 |
| 3 | Respaldos automáticos | `pg_dump` diario a S3 con retención de 30 días; probar una restauración | ⏳ escrito |
| 4 | CI | GitHub Actions: lint, typecheck y tests en cada push | ✅ escrito |
| 5 | CD | OIDC (sin claves guardadas), imagen en ECR, deploy por SSM al hacer push a `main` | ⏳ escrito |
| 6 | Extras | Alarma CloudWatch con auto-recovery, HTTPS | ⏳ alarmas · ❌ HTTPS |

**Decidido por Yasser (27/10/2026):** se **importa la EC2 actual** (`t3.small`, x86, VPC por defecto) en vez de
crear una nueva. Consecuencias:
- Sin migración de datos ni cambio de IP; la base sigue en el mismo disco.
- Hay que escribir el `.tf` para que coincida con lo que ya existe; el éxito es que `terraform plan` diga
  **"No changes"**. Cuidado con atributos que obligan a **reemplazar** la instancia (AMI, subred,
  arquitectura): se fijan con `lifecycle { ignore_changes = [...] }` y se revisa cada `plan` buscando
  `must be replaced`. Pasar a `t4g` (ARM) no es posible sin reemplazarla.
- Antes de importar: respaldo `pg_dump` fuera de la EC2 y un snapshot del disco (EBS).

Lo hecho por el agente, paso a paso y con comandos: **[registro-terraform-ec2.md](registro-terraform-ec2.md)**.

## Mapa general (a dónde llegamos)

```
                         git push main
Yasser ──────────────▶ GitHub ──────────▶ GitHub Actions
                                            │ CI: lint, typecheck, test
                                            │ CD: build imagen ─▶ ECR
                                            │     (entra a AWS con OIDC, sin claves)
                                            ▼
                                     SSM Run Command ──▶ EC2 (importada a Terraform)
                                                          ├─ Caddy :80/:443
                                                          ├─ app (imagen de ECR)
                                                          └─ Postgres ──pg_dump diario──▶ S3
Caja / tablet ──HTTP(S)──▶ Elastic IP ─────────────────────┘
```

## Glosario rápido

| Término | Qué es |
|---|---|
| **IaC** (infraestructura como código) | Describir los recursos (red, servidor, permisos) en archivos versionados en vez de clics en la consola. Se puede revisar, repetir y deshacer. |
| **Terraform** | Herramienta de IaC. Lees `.tf`, comparas con lo que existe y aplicas la diferencia. |
| **Estado (state)** | Archivo donde Terraform anota qué recursos creó y sus IDs. Sin él no sabe qué administra. Va en S3, nunca en git. |
| **plan / apply** | `plan` muestra qué va a crear, cambiar o borrar, sin tocar nada. `apply` lo ejecuta. |
| **IAM** | Usuarios, roles y permisos de AWS. |
| **Rol IAM** | Permisos que "se ponen" temporalmente (una EC2, GitHub Actions). Sin claves fijas. |
| **SSM** (Systems Manager) | Servicio para correr comandos en la EC2 y entrar a una terminal sin abrir el puerto 22. |
| **ECR** | Registro de imágenes Docker privado de AWS. |
| **CI** (integración continua) | Probar automáticamente cada cambio (lint, tipos, tests). |
| **CD** (despliegue continuo) | Llevar automáticamente a producción lo que pasó el CI. |
| **OIDC** | Forma de que GitHub Actions entre a AWS con credenciales temporales, sin guardar claves en GitHub. |
