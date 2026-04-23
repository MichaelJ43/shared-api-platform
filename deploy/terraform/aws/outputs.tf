output "http_api_url" {
  description = "Base URL for clients (https://... when custom domain is set; see main.tf local.api_domain_name)."
  value       = local.use_custom_domain ? "https://${local.api_domain_name}" : aws_apigatewayv2_api.http.api_endpoint
}

output "http_api_execute_url" {
  description = "Default execute-api base URL (includes stage path when not using custom domain)."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "http_regional_domain_name" {
  value       = local.use_custom_domain ? aws_apigatewayv2_domain_name.http[0].domain_name_configuration[0].target_domain_name : null
  description = "Regional hostname for R53 A alias to API Gateway (when custom domain is set)."
}

output "events_table" {
  value = aws_dynamodb_table.analytics_events.name
}

output "lambda_function" {
  value = aws_lambda_function.http.arn
}

output "auth_spa_s3_bucket" {
  value       = var.auth_spa_domain != "" ? aws_s3_bucket.auth_spa[0].bucket : null
  description = "S3 bucket for auth-spa static build; sync auth-spa/dist/ here."
}

output "dashboard_spa_s3_bucket" {
  value       = var.dashboard_spa_domain != "" ? aws_s3_bucket.dashboard_spa[0].bucket : null
  description = "S3 bucket for dashboard; sync dashboard/dist/ here."
}
