resource "aws_cloudwatch_log_group" "http" {
  name              = "/aws/lambda/${local.name}-http"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_lambda_function" "http" {
  function_name = "${local.name}-http"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs20.x"
  handler       = "handler.handler"
  filename      = var.http_lambda_zip
  source_code_hash = filebase64sha256(var.http_lambda_zip)

  memory_size = 256
  timeout     = 15

  environment {
    variables = {
      EVENTS_TABLE_NAME        = aws_dynamodb_table.analytics_events.name
      CORS_ALLOWED_BASE_HOST  = var.cors_allowed_base_host
      CORS_ALLOW_LOCALHOST    = var.cors_allow_localhost
      IP_HASH_SECRET          = var.ip_hash_secret
      APP_VERSION             = var.app_version
    }
  }

  depends_on = [aws_cloudwatch_log_group.http]
  tags       = local.common_tags
}
