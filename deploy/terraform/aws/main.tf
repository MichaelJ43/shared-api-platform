locals {
  name = "${var.project}-${var.environment}"

  # Apex (michaelj43.dev) or full API host (api.michaelj43.dev) — do not set both styles at once; we never double-prefix api.
  custom_domain_host = var.custom_domain != null ? lower(trimspace(var.custom_domain)) : ""
  api_domain_name = (
    local.custom_domain_host == "" ? "" : (
      startswith(local.custom_domain_host, "api.") ? local.custom_domain_host : "api.${local.custom_domain_host}"
    )
  )
  use_custom_domain = local.custom_domain_host != "" && var.acm_certificate_arn != null && trimspace(var.acm_certificate_arn) != ""
  route53_zone_id   = var.route53_hosted_zone_id != null ? trimspace(var.route53_hosted_zone_id) : ""
  create_route53    = local.use_custom_domain && local.route53_zone_id != ""

  # SPA buckets + CloudFront (requires ACM in us-east-1; cert + domain for each)
  auth_spa_infrastructure = trimspace(var.auth_spa_domain) != "" && trimspace(var.auth_spa_acm_certificate_arn) != ""
  dashboard_spa_infrastructure = (
    trimspace(var.dashboard_spa_domain) != "" && trimspace(var.dashboard_spa_acm_certificate_arn) != ""
  )
  # DNS; zone must contain the SPA FQDN (use same or different secrets per app)
  auth_spa_create_route53      = local.auth_spa_infrastructure && trimspace(var.auth_spa_route53_hosted_zone_id) != ""
  dashboard_spa_create_route53 = local.dashboard_spa_infrastructure && trimspace(var.dashboard_spa_route53_hosted_zone_id) != ""

  common_tags = merge(
    { Project = var.project, Environment = var.environment, ManagedBy = "terraform" },
    var.tags,
  )
}

