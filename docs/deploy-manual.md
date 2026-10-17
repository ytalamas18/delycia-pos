# Despliegue manual en EC2 (prueba rápida)

Todo desde la consola web de AWS, región **sa-east-1 (São Paulo)**. Sin SSH desde la PC: el servidor se
configura solo con `infra/user-data.sh`. Versión de prueba: abierta a internet, sin HTTPS, secretos en el
disco de la EC2 (`/opt/delycia/.env`). La seguridad y la automatización (Terraform + CI/CD) van después.

```
Caja / tablet cocina ──HTTP:80──▶ Elastic IP ──▶ EC2 (Amazon Linux 2023)
                                                  └─ Docker Compose: caddy:80 ─▶ app:3000 ─▶ db (sin puertos)
```

## 1. Lanzar la instancia (EC2 → Launch instance)

| Campo | Valor |
|---|---|
| Name | `delycia-pos` |
| AMI | **Amazon Linux 2023**, arquitectura **64-bit (x86)** |
| Instance type | **t3.small** (2 GiB). `t4g.small` (ARM) debería funcionar pero el build ARM no está probado |
| Key pair | *Proceed without a key pair* |
| Network | VPC por defecto, **Auto-assign public IP: Enable** |
| Security group | Crear nuevo: **HTTP 80** desde `0.0.0.0/0` y **SSH 22** desde `0.0.0.0/0` (lo usa EC2 Instance Connect) |
| Storage | **20 GiB gp3** (8 GiB no alcanza para construir la imagen) |
| Advanced details → User data | Pegar el contenido completo de `infra/user-data.sh` |

## 2. Elastic IP

EC2 → Elastic IPs → *Allocate* → *Associate* a `delycia-pos`. La app queda en `http://<ELASTIC_IP>`.

## 3. Esperar y verificar (~15 min la primera vez)

EC2 → instancia → **Connect → EC2 Instance Connect → Connect**:

```bash
sudo tail -f /var/log/delycia-setup.log      # termina con "SETUP OK" o "SETUP FALLÓ en el paso: ..."
cat /var/lib/delycia-setup.status             # OK / EN CURSO / FALLO: <paso>
sudo grep PIN /opt/delycia/.env               # PIN iniciales de Admin, Caja y Cocina
```

Luego abrir `http://<ELASTIC_IP>` en la caja y en la tablet. En cocina, tocar **Activar sonido** (suena un tono de
prueba; si la tablet se apaga, el botón vuelve a aparecer).

## 4. Actualizar o reintentar

Después de un `git push` a `main`, o si el setup falló:

```bash
sudo /usr/local/sbin/delycia-setup
```

Es idempotente: trae el último `main`, conserva `.env` (contraseñas, PIN) y la base, reconstruye y reinicia.

## 5. Comandos útiles (Instance Connect)

```bash
cd /opt/delycia
sudo docker compose -f docker-compose.prod.yml ps
sudo docker compose -f docker-compose.prod.yml logs --tail 100 app
sudo docker compose -f docker-compose.prod.yml logs migrate   # migraciones + seed
```

## Pendiente antes de uso real

- HTTPS: dominio o `IP-CON-GUIONES.sslip.io` en `SITE_ADDRESS` + `APP_URL=https://...`, abrir 443 (ver `Caddyfile`).
- Cerrar SSH 22 al rango de EC2 Instance Connect de sa-east-1 (o usar SSM Session Manager).
- Secretos a SSM Parameter Store (rol IAM de la instancia) en vez de `.env` en disco.
- Respaldo de la base (descartado por ahora por decisión de Yasser).
- Terraform + GitHub Actions (build de la imagen fuera de la EC2, ECR).
