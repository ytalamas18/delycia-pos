# Etapa 0 — Preparación

**Objetivo:** dejar la cuenta AWS segura y tu PC lista para que Terraform trabaje con ella.
**Costo:** sin recursos que cobren. **Tiempo:** ~45 min. **Riesgo para producción:** ninguno (no toca la EC2).

## Conceptos

- **Usuario root:** el correo con el que creaste la cuenta. Puede todo, incluso cerrarla. Solo se usa para
  facturación y emergencias; protegido con MFA y sin claves de acceso.
- **IAM Identity Center (SSO):** el usuario del día a día. Entras por un portal y la CLI recibe credenciales
  **temporales** (duran horas). Es lo que ya usas en el trabajo (`aws sso login`). Es mejor que un usuario IAM
  con access key fija: si una key se filtra, sirve hasta que la borres.
- **Perfil de la CLI:** cada cuenta tiene un nombre en `~/.aws/config`. En tu PC ya hay perfiles del trabajo
  (`AWSAdministratorAccess-…`, `fxr-copilot`, `default`). Crearemos `delycia` y **siempre** lo nombraremos,
  para no crear nada por error en una cuenta del trabajo.
- **Región:** todo en `sa-east-1` (São Paulo), la más cercana a Bolivia. Identity Center y Budgets son globales
  o de una región, no importa para el POS.
- **AWS Budgets:** alerta por correo cuando el gasto real o proyectado pasa un monto. No corta servicios; avisa.

## Pasos

### 0.1 MFA en root

Consola con root → menú de la cuenta (arriba a la derecha) → **Security credentials** → **Assign MFA device** →
app autenticadora. En esa misma página confirma que **Access keys** esté vacío (si hay alguna, bórrala).

### 0.2 Usuario administrador con Identity Center

1. Consola (en `sa-east-1`) → **IAM Identity Center** → **Enable**.
2. **Users → Add user**: tu usuario (ej. `yasser`) y un correo. Activa el usuario desde el correo y configura su MFA.
3. **Permission sets → Create** → *Predefined* → `AdministratorAccess`. Duración de sesión: 8 h está bien.
4. **AWS accounts** → marca tu cuenta → **Assign users or groups** → tu usuario + `AdministratorAccess`.
5. Anota la **AWS access portal URL** (en *Settings*, ej. `https://d-xxxx.awsapps.com/start`). No es secreta, pero no va al repo.

Desde aquí, el root se guarda y ya no se usa.

### 0.3 Perfil `delycia` en la CLI

```bash
aws configure sso --profile delycia
#   SSO session name: delycia
#   SSO start URL:    <la URL del portal de 0.2>
#   SSO region:       sa-east-1
#   (abre el navegador → apruebas → eliges la cuenta y AdministratorAccess)
#   CLI default client Region: sa-east-1
#   CLI default output format: json
```

Verificar (debe mostrar **tu cuenta personal**, no la del trabajo):

```bash
aws sts get-caller-identity --profile delycia
```

Cuando expire la sesión: `aws sso login --profile delycia`.

### 0.4 Budget

Consola → **Billing and Cost Management → Budgets → Create budget** → *Use a template* → **Monthly cost budget**.
Monto: tú decides (referencia: la arquitectura objetivo cuesta ≈ US$26/mes según `docs/infra.md`; la EC2 actual
`t3.small` algo más). Correo de alerta: el tuyo. La plantilla avisa al 85 % y 100 % real y al 100 % proyectado.

Opcional: en **Billing preferences** activa *Receive Free Tier usage alerts*.

### 0.5 Instalar Terraform (Kali)

El repositorio de HashiCorp no tiene `kali-rolling`; se usa el de Debian estable (Terraform es un binario único,
funciona igual):

```bash
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com bookworm main" \
  | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform
terraform -version
```

Opcional: extensión **HashiCorp Terraform** en VS Code (autocompletado y formato).

## Verificación

- [ ] Root con MFA y sin access keys.
- [ ] Puedes entrar al portal de Identity Center con tu usuario + MFA.
- [ ] `aws sts get-caller-identity --profile delycia` muestra tu cuenta personal.
- [ ] Budget creado y el correo de confirmación llegó.
- [ ] `terraform -version` responde.

## Deshacer

Nada de esta etapa cobra. Se puede quitar la asignación en Identity Center, borrar el budget, o
`sudo apt remove terraform`. No desactives el MFA del root.

## Para pensar antes de la etapa 1

- ¿Por qué el estado de Terraform no va en git? (pista: el repo es público y el estado guarda IDs y a veces secretos).
- ¿Qué pasaría si corres un `terraform apply` sin `--profile` y tu `default` es una cuenta del trabajo?

## Bitácora

_(se completa al terminar: fecha, cuenta verificada, problemas encontrados)_
