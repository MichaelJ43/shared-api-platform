# Regional WAF on the API Gateway (HTTP) stage. Disable with waf_enable = false.

resource "aws_wafv2_web_acl" "api" {
  count = var.waf_enable ? 1 : 0

  name  = "${local.name}-apigw"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "RateLimitPerIP"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                 = "RateLimitPerIP"
      sampled_requests_enabled    = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                 = "waf-${local.name}"
    sampled_requests_enabled     = true
  }

  tags = local.common_tags
}

resource "aws_wafv2_web_acl_association" "apigw" {
  count = var.waf_enable ? 1 : 0

  resource_arn = aws_apigatewayv2_stage.http.arn
  web_acl_arn  = aws_wafv2_web_acl.api[0].arn
}
