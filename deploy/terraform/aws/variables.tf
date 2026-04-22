variable "project" {
  description = "Resource name prefix for this platform."
  type        = string
  default     = "shared-api-platform"
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "custom_domain" {
  description = "Apex (e.g. michaelj43.dev) for api.<apex> if certificate + R53 are set."
  type        = string
  default     = null
}

variable "acm_certificate_arn" {
  type    = string
  default = null
}

variable "route53_hosted_zone_id" {
  type    = string
  default = null
}

variable "cors_allowed_base_host" {
  description = "Allowed Origin suffix for Lambda CORS (e.g. michaelj43.dev)."
  type        = string
  default     = "michaelj43.dev"
}

variable "cors_allow_localhost" {
  type    = string
  default = ""
}

variable "ip_hash_secret" {
  type      = string
  sensitive = true
  default   = ""
}

variable "app_version" {
  type    = string
  default = "0.0.0"
}

variable "http_lambda_zip" {
  type    = string
  default = "../../../lambda/dist/http.zip"
}

variable "tags" {
  type    = map(string)
  default = {}
}
