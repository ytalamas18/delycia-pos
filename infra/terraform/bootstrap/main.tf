# Bootstrap: crea UNA vez el bucket S3 donde vive el estado remoto del resto de la infra.
# Su propio estado queda local (bootstrap/terraform.tfstate, fuera de git): solo contiene este bucket.
#   terraform init && terraform apply -var account_id=<ID>

terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

variable "account_id" {
  description = "ID de la cuenta AWS (se usa en el nombre del bucket, que debe ser único en el mundo)."
  type        = string
}

provider "aws" {
  region  = "sa-east-1"
  profile = "delycia"
  # Si el perfil apuntara a otra cuenta (ej. la del trabajo), Terraform se niega a seguir.
  allowed_account_ids = [var.account_id]
  default_tags { tags = { Project = "delycia-pos", ManagedBy = "terraform" } }
}

resource "aws_s3_bucket" "tfstate" {
  bucket = "delycia-tfstate-${var.account_id}"
  lifecycle { prevent_destroy = true }
}

# Versionado: cada cambio de estado deja la versión anterior (para volver atrás si se corrompe).
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Las versiones viejas del estado se borran a los 90 días.
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    id     = "versiones-viejas"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
  }
}

output "state_bucket" { value = aws_s3_bucket.tfstate.bucket }
