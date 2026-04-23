# CloudFront + S3 OAC for auth and dashboard static sites. ACM cert ARNs must be
# in us-east-1. Route53: separate hosted zone ID per app (or the same ID if both
# hostnames are in one zone).

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# Do not cache HTML at the edge with CachingOptimized: stale index.html keeps pointing at old
# hashed JS/CSS after deploy. Vite emits /assets/* with content hashes; those can stay cached.
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "cors_s3" {
  name = "Managed-CORS-S3Origin"
}

# --- Auth SPA ---

resource "aws_cloudfront_origin_access_control" "auth_spa" {
  count = local.auth_spa_infrastructure ? 1 : 0

  name                              = "${local.name}-auth-spa-s3"
  description                       = "OAC for ${var.auth_spa_domain}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "auth_spa" {
  count = local.auth_spa_infrastructure ? 1 : 0

  enabled             = true
  comment             = "${local.name} auth SPA"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [trimspace(var.auth_spa_domain)]
  is_ipv6_enabled     = true
  wait_for_deployment = false
  tags                = local.common_tags

  origin {
    domain_name              = aws_s3_bucket.auth_spa[0].bucket_regional_domain_name
    origin_id                = "s3-auth-spa"
    origin_access_control_id = aws_cloudfront_origin_access_control.auth_spa[0].id
  }

  default_cache_behavior {
    target_origin_id         = "s3-auth-spa"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3.id
  }

  ordered_cache_behavior {
    path_pattern             = "assets/*"
    target_origin_id         = "s3-auth-spa"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3.id
  }

  # SPA: serve index for deep links / object-miss
  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
  }
  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = trimspace(var.auth_spa_acm_certificate_arn)
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
    cloudfront_default_certificate = false
  }
}

data "aws_iam_policy_document" "auth_spa_s3" {
  count = local.auth_spa_infrastructure ? 1 : 0

  statement {
    sid     = "AllowCloudFrontReadViaOAC"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.auth_spa[0].arn}/*",
    ]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.auth_spa[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "auth_spa" {
  count  = local.auth_spa_infrastructure ? 1 : 0
  bucket = aws_s3_bucket.auth_spa[0].id
  policy = data.aws_iam_policy_document.auth_spa_s3[0].json
}

# --- Dashboard SPA ---

resource "aws_cloudfront_origin_access_control" "dashboard_spa" {
  count = local.dashboard_spa_infrastructure ? 1 : 0

  name                              = "${local.name}-dashboard-s3"
  description                       = "OAC for ${var.dashboard_spa_domain}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "dashboard_spa" {
  count = local.dashboard_spa_infrastructure ? 1 : 0

  enabled             = true
  comment             = "${local.name} dashboard SPA"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  aliases             = [trimspace(var.dashboard_spa_domain)]
  is_ipv6_enabled     = true
  wait_for_deployment = false
  tags                = local.common_tags

  origin {
    domain_name              = aws_s3_bucket.dashboard_spa[0].bucket_regional_domain_name
    origin_id                = "s3-dashboard-spa"
    origin_access_control_id = aws_cloudfront_origin_access_control.dashboard_spa[0].id
  }

  default_cache_behavior {
    target_origin_id         = "s3-dashboard-spa"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3.id
  }

  ordered_cache_behavior {
    path_pattern             = "assets/*"
    target_origin_id         = "s3-dashboard-spa"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.cors_s3.id
  }

  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
  }
  custom_error_response {
    error_caching_min_ttl = 0
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = trimspace(var.dashboard_spa_acm_certificate_arn)
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
    cloudfront_default_certificate = false
  }
}

data "aws_iam_policy_document" "dashboard_spa_s3" {
  count = local.dashboard_spa_infrastructure ? 1 : 0

  statement {
    sid     = "AllowCloudFrontReadViaOAC"
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.dashboard_spa[0].arn}/*",
    ]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.dashboard_spa[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "dashboard_spa" {
  count  = local.dashboard_spa_infrastructure ? 1 : 0
  bucket = aws_s3_bucket.dashboard_spa[0].id
  policy = data.aws_iam_policy_document.dashboard_spa_s3[0].json
}

# --- Route53: A + AAAA alias to CloudFront (same duality as API) ---

resource "aws_route53_record" "auth_spa_a" {
  count = local.auth_spa_create_route53 ? 1 : 0

  zone_id = trimspace(var.auth_spa_route53_hosted_zone_id)
  name    = "${trimspace(var.auth_spa_domain)}."
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.auth_spa[0].domain_name
    zone_id                = aws_cloudfront_distribution.auth_spa[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "auth_spa_aaaa" {
  count = local.auth_spa_create_route53 ? 1 : 0

  zone_id = trimspace(var.auth_spa_route53_hosted_zone_id)
  name    = "${trimspace(var.auth_spa_domain)}."
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.auth_spa[0].domain_name
    zone_id                = aws_cloudfront_distribution.auth_spa[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "dashboard_spa_a" {
  count = local.dashboard_spa_create_route53 ? 1 : 0

  zone_id = trimspace(var.dashboard_spa_route53_hosted_zone_id)
  name    = "${trimspace(var.dashboard_spa_domain)}."
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.dashboard_spa[0].domain_name
    zone_id                = aws_cloudfront_distribution.dashboard_spa[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "dashboard_spa_aaaa" {
  count = local.dashboard_spa_create_route53 ? 1 : 0

  zone_id = trimspace(var.dashboard_spa_route53_hosted_zone_id)
  name    = "${trimspace(var.dashboard_spa_domain)}."
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.dashboard_spa[0].domain_name
    zone_id                = aws_cloudfront_distribution.dashboard_spa[0].hosted_zone_id
    evaluate_target_health = false
  }
}
