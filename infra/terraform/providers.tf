provider "aws" {
  region  = "sa-east-1"
  profile = "delycia"
  # Protección: si el perfil apuntara a otra cuenta (ej. la del trabajo), Terraform no sigue.
  allowed_account_ids = [var.account_id]
  default_tags { tags = { Project = "delycia-pos", ManagedBy = "terraform" } }
}
