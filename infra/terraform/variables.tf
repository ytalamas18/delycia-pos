variable "account_id" {
  description = "ID de la cuenta AWS personal. Terraform se niega a trabajar en cualquier otra."
  type        = string
}

variable "alert_email" {
  description = "Correo para alarmas (instancia caída, respaldo fallido)."
  type        = string
}

variable "github_repo" {
  description = "Repositorio que puede desplegar con OIDC (dueño/nombre)."
  type        = string
  default     = "ytalamas18/delycia-pos"
}

variable "backup_retention_days" {
  description = "Días que se guardan los respaldos de la base en S3."
  type        = number
  default     = 30
}
