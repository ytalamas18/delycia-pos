# Rol de la EC2: lo que la instancia puede hacer en AWS, sin claves guardadas en el disco.
data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "pos" {
  name               = "delycia-pos-ec2"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# SSM: Session Manager (consola sin SSH ni puerto 22) y Run Command (respaldos y despliegues).
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.pos.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "pos" {
  # Subir y bajar respaldos (restaurar / restore-test.sh). No puede borrarlos ni tocar otros buckets.
  statement {
    sid       = "Respaldos"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.backups.arn}/*"]
  }
  statement {
    sid       = "RespaldosListar"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.backups.arn]
  }
  # Bajar las imágenes de la app que construye GitHub Actions.
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid       = "EcrPull"
    actions   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
    resources = [aws_ecr_repository.app.arn]
  }
}

resource "aws_iam_role_policy" "pos" {
  name   = "delycia-pos-ec2"
  role   = aws_iam_role.pos.id
  policy = data.aws_iam_policy_document.pos.json
}

resource "aws_iam_instance_profile" "pos" {
  name = "delycia-pos-ec2"
  role = aws_iam_role.pos.name
}
