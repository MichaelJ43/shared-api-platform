# S3 buckets for static auth + dashboard UIs. Sync built assets with:
#   aws s3 sync auth-spa/dist/ s3://<bucket> --delete
#   aws s3 sync dashboard/dist/ s3://<bucket> --delete
# CloudFront + ACM: either attach manually in console or extend this file with
# `aws_cloudfront_distribution` and OAC (cert must be in us-east-1 for CF).

resource "aws_s3_bucket" "auth_spa" {
  count  = var.auth_spa_domain != "" ? 1 : 0
  bucket = "${local.name}-auth-spa"
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "auth_spa" {
  count  = var.auth_spa_domain != "" ? 1 : 0
  bucket = aws_s3_bucket.auth_spa[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket" "dashboard_spa" {
  count  = var.dashboard_spa_domain != "" ? 1 : 0
  bucket = "${local.name}-dashboard"
  tags   = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "dashboard_spa" {
  count  = var.dashboard_spa_domain != "" ? 1 : 0
  bucket = aws_s3_bucket.dashboard_spa[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
