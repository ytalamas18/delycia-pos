# Avisos por correo. AWS manda un correo para confirmar la suscripción: hay que aceptarlo una vez.
resource "aws_sns_topic" "alerts" {
  name = "delycia-alertas"
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Falla del hardware de AWS → la instancia se "recupera" sola en otro host (misma IP, mismo disco).
resource "aws_cloudwatch_metric_alarm" "system_check" {
  alarm_name          = "delycia-pos-falla-sistema"
  alarm_description   = "Falla del host de AWS: recuperación automática de la EC2."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  dimensions          = { InstanceId = aws_instance.pos.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = ["arn:aws:automate:sa-east-1:ec2:recover", aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Falla dentro de la instancia (sistema operativo colgado, sin memoria) → reinicio automático.
resource "aws_cloudwatch_metric_alarm" "instance_check" {
  alarm_name          = "delycia-pos-falla-instancia"
  alarm_description   = "La EC2 no responde: reinicio automático."
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  dimensions          = { InstanceId = aws_instance.pos.id }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  alarm_actions       = ["arn:aws:automate:sa-east-1:ec2:reboot", aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Un comando de SSM que falla (respaldo diario o despliegue) → correo.
resource "aws_cloudwatch_event_rule" "ssm_failed" {
  name        = "delycia-ssm-fallido"
  description = "Respaldo o despliegue por SSM que terminó con error."
  event_pattern = jsonencode({
    source        = ["aws.ssm"]
    "detail-type" = ["EC2 Command Invocation Status-change Notification"]
    detail = {
      "instance-id" = [aws_instance.pos.id]
      status        = ["Failed", "TimedOut"]
    }
  })
}

resource "aws_cloudwatch_event_target" "ssm_failed" {
  rule = aws_cloudwatch_event_rule.ssm_failed.name
  arn  = aws_sns_topic.alerts.arn
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid       = "EventBridge"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.ssm_failed.arn]
    }
  }
  statement {
    sid       = "CloudWatch"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}
