output "instance_id" { value = aws_instance.pos.id }
output "ecr_repository_url" { value = aws_ecr_repository.app.repository_url }
output "backups_bucket" { value = aws_s3_bucket.backups.bucket }
output "github_deploy_role_arn" {
  description = "Va en GitHub → Settings → Secrets and variables → Actions → Variables: AWS_DEPLOY_ROLE_ARN."
  value       = aws_iam_role.github_deploy.arn
}
