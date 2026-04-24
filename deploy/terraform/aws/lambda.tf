resource "aws_cloudwatch_log_group" "http" {
  name              = "/aws/lambda/${local.name}-http"
  retention_in_days = 14
  tags              = local.common_tags
}

resource "aws_lambda_function" "http" {
  function_name    = "${local.name}-http"
  role             = aws_iam_role.lambda.arn
  runtime          = "nodejs20.x"
  handler          = "handler.handler"
  filename         = var.http_lambda_zip
  source_code_hash = filebase64sha256(var.http_lambda_zip)

  memory_size = 512
  timeout     = 15

  environment {
    variables = {
      EVENTS_TABLE_NAME            = aws_dynamodb_table.analytics_events.name
      AUTH_USERS_TABLE_NAME        = aws_dynamodb_table.auth_users.name
      AUTH_SESSIONS_TABLE_NAME     = aws_dynamodb_table.auth_sessions.name
      PLATFORM_SETTINGS_TABLE_NAME = aws_dynamodb_table.platform_settings.name
      EVENTS_TTL_OFFSET_SECONDS    = tostring(var.analytics_item_ttl_offset_seconds)
      AUTH_SESSION_TTL_SECONDS     = tostring(var.auth_session_ttl_seconds)
      AUTH_ALLOW_REGISTER          = tostring(var.auth_allow_register)
      AUTH_DEFAULT_APP_URL         = var.auth_default_app_url
      CORS_ALLOWED_BASE_HOST       = var.cors_allowed_base_host
      CORS_ALLOW_LOCALHOST         = var.cors_allow_localhost
      IP_HASH_SECRET               = var.ip_hash_secret
      APP_VERSION                  = var.app_version
    }
  }

  # Tables must exist before Lambda is updated with new env (e.g. first apply adding platform_settings).
  depends_on = [
    aws_cloudwatch_log_group.http,
    aws_dynamodb_table.analytics_events,
    aws_dynamodb_table.auth_users,
    aws_dynamodb_table.auth_sessions,
    aws_dynamodb_table.platform_settings,
  ]
  tags = local.common_tags
}
