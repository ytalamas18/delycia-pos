# La EC2 de producción. Creada a mano, importada: el objetivo es que Terraform la describa sin reemplazarla.
resource "aws_instance" "pos" {
  ami                    = "ami-0de7704dcfbf9a7ae" # Amazon Linux 2023 x86_64 del 17/10/2026
  instance_type          = "t3.small"
  subnet_id              = "subnet-05898d33e4a242728" # subred por defecto de sa-east-1c
  vpc_security_group_ids = [aws_security_group.pos.id]
  iam_instance_profile   = aws_iam_instance_profile.pos.name

  # Evita borrarla por error (consola o terraform destroy). Hay que quitarlo a propósito para eliminarla.
  disable_api_termination = true

  credit_specification { cpu_credits = "unlimited" }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2
    http_put_response_hop_limit = 2          # 2 = los contenedores Docker también llegan al metadata
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = 20
    iops                  = 3000
    throughput            = 125
    delete_on_termination = false # si la instancia se borra, el disco (y la base) se conserva
  }

  tags = { Name = "Delycia-pos" }

  lifecycle {
    # Cambiar cualquiera de estos REEMPLAZA la instancia (disco nuevo = base vacía). Se ignoran a propósito:
    # - ami: AWS publica AMIs nuevas; la instancia se actualiza con dnf, no recreándola.
    # - user_data: solo corre en el primer arranque; el script vive en infra/user-data.sh.
    ignore_changes = [ami, user_data, user_data_base64, associate_public_ip_address]
  }
}

resource "aws_eip" "pos" {
  domain = "vpc"
  lifecycle { prevent_destroy = true } # perderla cambia la IP que usan caja y cocina
}

resource "aws_eip_association" "pos" {
  allocation_id = aws_eip.pos.id
  instance_id   = aws_instance.pos.id
}
