terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  # El nombre del bucket va en backend.hcl (fuera de git): terraform init -backend-config=backend.hcl
  backend "s3" {
    key          = "delycia-pos/terraform.tfstate"
    region       = "sa-east-1"
    profile      = "delycia"
    encrypt      = true
    use_lockfile = true # bloqueo nativo de S3 (sin DynamoDB): evita dos apply a la vez
  }
}
