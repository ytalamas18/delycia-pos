variable "account_id" {
  description = "ID de la cuenta AWS personal. Terraform se niega a trabajar en cualquier otra."
  type        = string
}

variable "alert_email" {
  description = "Correo para alarmas (instancia caída, respaldo fallido)."
  type        = string
}

variable "github_repo" {
  description = "Repositorio que puede desplegar con OIDC, con IDs inmutables (dueño@id/nombre@id)."
  type        = string
  # GitHub firma el "sub" con los IDs numéricos (públicos, api.github.com/repos/<dueño>/<repo>): si alguien
  # crea otra cuenta o repo con el mismo nombre, no coincide.
  default = "ytalamas18@196281236/delycia-pos@1422801668"
}

variable "backup_retention_days" {
  description = "Días que se guardan los respaldos de la base en S3."
  type        = number
  default     = 30
}
