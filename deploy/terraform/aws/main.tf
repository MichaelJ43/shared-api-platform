locals {
  name = "${var.project}-${var.environment}"

  custom_domain_host  = var.custom_domain != null ? trimspace(var.custom_domain) : ""
  use_custom_domain   = local.custom_domain_host != "" && var.acm_certificate_arn != null && trimspace(var.acm_certificate_arn) != ""
  route53_zone_id     = var.route53_hosted_zone_id != null ? trimspace(var.route53_hosted_zone_id) : ""
  create_route53 = local.use_custom_domain && local.route53_zone_id != ""

  common_tags = merge(
    { Project = var.project, Environment = var.environment, ManagedBy = "terraform" },
    var.tags,
  )
}

