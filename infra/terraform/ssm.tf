# Respaldo diario: State Manager corre infra/scripts/backup.sh en la EC2 (pg_dump → S3). Sin cron en el servidor.
resource "aws_ssm_association" "backup" {
  name             = "AWS-RunShellScript"
  association_name = "delycia-backup-diario"
  # 03:00 UTC = 23:00 en La Paz (local cerrado).
  schedule_expression = "cron(0 3 * * ? *)"
  # Sin esto corre apenas se crea (antes de que el script llegue a la EC2 con el primer deploy).
  apply_only_at_cron_interval = true

  targets {
    key    = "InstanceIds"
    values = [aws_instance.pos.id]
  }

  parameters = {
    commands         = "bash /opt/delycia/infra/scripts/backup.sh ${aws_s3_bucket.backups.bucket}"
    executionTimeout = "1800"
  }
}

# Export diario de CSVs para el agente (repo delycia-cerebro). Si falla, avisa por correo (alarms.tf).
resource "aws_ssm_association" "export_cerebro" {
  name             = "AWS-RunShellScript"
  association_name = "delycia-export-cerebro"
  # 20:00 UTC = 16:00 en La Paz (después del cierre de las 15:00).
  schedule_expression         = "cron(0 20 * * ? *)"
  apply_only_at_cron_interval = true

  targets {
    key    = "InstanceIds"
    values = [aws_instance.pos.id]
  }

  parameters = {
    commands         = "bash /opt/delycia/infra/scripts/export-cerebro.sh"
    executionTimeout = "600"
  }
}
