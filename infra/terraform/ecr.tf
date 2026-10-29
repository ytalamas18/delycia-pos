# Imágenes Docker que construye GitHub Actions: "app" (runner) y "migrate" (etapa build, trae Prisma CLI).
resource "aws_ecr_repository" "app" {
  name                 = "delycia-pos"
  image_tag_mutability = "MUTABLE" # la etiqueta "latest" / "migrate-latest" se mueve en cada deploy
  image_scanning_configuration { scan_on_push = true }
}

# Guarda las 10 imágenes más nuevas (para volver atrás) y borra el resto: el almacenamiento se cobra.
resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Conservar las ultimas 10"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 10 }
      action       = { type = "expire" }
    }]
  })
}
