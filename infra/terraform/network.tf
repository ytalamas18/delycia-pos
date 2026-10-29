# Security Group creado por el asistente de la consola ("launch-wizard-1"). El nombre no se cambia:
# renombrar un Security Group obliga a recrearlo.
resource "aws_security_group" "pos" {
  name        = "launch-wizard-1"
  description = "launch-wizard-1 created 2026-10-17T17:30:39.953Z"
  vpc_id      = "vpc-069faaec4d6b0e5e1" # VPC por defecto
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.pos.id
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  security_group_id = aws_security_group.pos.id
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.pos.id
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
