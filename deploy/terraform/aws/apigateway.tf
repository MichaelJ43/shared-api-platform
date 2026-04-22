# HTTP API: single $default route; CORS is implemented in Lambda (dynamic Origin).
resource "aws_apigatewayv2_api" "http" {
  name          = "${local.name}-http"
  protocol_type = "HTTP"
  tags          = local.common_tags
}

resource "aws_apigatewayv2_integration" "http" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri         = aws_lambda_function.http.invoke_arn
  payload_format_version = "2.0"
  integration_method     = "POST"
}

resource "aws_apigatewayv2_route" "http_default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.http.id}"
}

resource "aws_apigatewayv2_stage" "http" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
  tags        = local.common_tags

  default_route_settings {
    throttling_burst_limit   = var.api_throttle_burst_limit
    throttling_rate_limit     = var.api_throttle_rate_limit
  }
}

resource "aws_lambda_permission" "http_invoke" {
  statement_id  = "AllowExecutionFromHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.http.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# Optional custom domain: https://api.<custom_domain>
resource "aws_apigatewayv2_domain_name" "http" {
  count = local.use_custom_domain ? 1 : 0

  domain_name = "api.${local.custom_domain_host}"

  domain_name_configuration {
    certificate_arn = trimspace(var.acm_certificate_arn)
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = local.common_tags
}

resource "aws_apigatewayv2_api_mapping" "http" {
  count = local.use_custom_domain ? 1 : 0

  api_id      = aws_apigatewayv2_api.http.id
  domain_name = aws_apigatewayv2_domain_name.http[0].domain_name
  stage       = aws_apigatewayv2_stage.http.name
}

resource "aws_route53_record" "http_api" {
  count = local.create_route53 ? 1 : 0

  zone_id = local.route53_zone_id
  name    = "api"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.http[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.http[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
