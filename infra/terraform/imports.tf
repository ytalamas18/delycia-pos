# Recursos creados a mano el 17/10/2026 (docs/deploy-manual.md) y traídos a Terraform el 29/10/2026.
# Los import son idempotentes: una vez en el estado, Terraform los ignora.
import {
  to = aws_instance.pos
  id = "i-052f4f04defecd274"
}
import {
  to = aws_security_group.pos
  id = "sg-065d36a7e5dd6ea93"
}
import {
  to = aws_vpc_security_group_ingress_rule.http
  id = "sgr-010384324c67ecccc"
}
import {
  to = aws_vpc_security_group_ingress_rule.ssh
  id = "sgr-003aa6f7b6587ff6d"
}
import {
  to = aws_vpc_security_group_egress_rule.all
  id = "sgr-0252e0a325b84c8ce"
}
import {
  to = aws_eip.pos
  id = "eipalloc-05d70a86de0a92384"
}
import {
  to = aws_eip_association.pos
  id = "eipassoc-078592692c3360af8"
}
