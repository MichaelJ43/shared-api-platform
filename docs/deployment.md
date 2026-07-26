# Deployment

Pipelines:

| Workflow | When |
|----------|------|
| `.github/workflows/ci.yml` | Pull requests and `main` |
| `.github/workflows/preview.yml` | PR open/sync → ephemeral stack; PR close → destroy; **Validate preview** (health + SPAs + Dredd) |
| `.github/workflows/deploy.yml` | `main` pushes and manual dispatch |
| `.github/workflows/cleanup-preview-environments.yml` | Manual cleanup of stale GitHub `preview-pr-*` environments |

CI optionally runs **Dredd** against production when the repository **variable** `DREDD_BASE_URL` is set (e.g. `https://api.michaelj43.dev`); set optional `DREDD_ORIGIN` to match an allow-listed CORS origin (defaults to `https://michaelj43.dev` for hooks). PR previews always run Dredd against the ephemeral API.

**Runtime version:** Deploy sets Lambda `APP_VERSION` from the short git SHA (previews use `pr-<n>-<sha>`). `lambda/package.json` stays at `0.0.0` and is not bumped in git.

## Preview environments

Each non-Dependabot PR gets an isolated Terraform workspace (state key `shared-api-platform/previews/pr-<n>/terraform.tfstate`) with:

| Resource | Hostname pattern |
|----------|------------------|
| HTTP API | `https://pr-<n>.<TF_CUSTOM_DOMAIN>` e.g. `pr-12.api.michaelj43.dev` |
| Auth SPA | `https://pr-<n>.<AUTH_SPA_DOMAIN>` e.g. `pr-12.auth.michaelj43.dev` |
| Dashboard | `https://pr-<n>.<DASHBOARD_SPA_DOMAIN>` e.g. `pr-12.analytics.michaelj43.dev` |

Requires the same OIDC role, state backend, and Route 53 zone secrets as production. ACM certificates must cover the preview names (typically wildcards `*.api.…`, `*.auth.…`, `*.analytics.…` on the same certs used for prod, or SANs that include those patterns). SPA S3 buckets use `spa_bucket_force_destroy=true` so teardown can delete non-empty buckets.

**Validate preview** waits for `/health` and SPA HTTP 200, then runs Dredd. **Preview gate** is the branch-protection check (passes for Dependabot without deploying).

Closing or merging the PR runs **Teardown preview** (`terraform destroy` + state object delete).

**WAF and HTTP API:** AWS WAF can be associated (via Terraform or console) with **REST** API stages (`/restapis/...` ARNs) only, not with **HTTP** API (API Gateway v2) stage ARNs. This stack uses an HTTP API, so the Terraform module does not attach a web ACL. Use the stage’s **throttling** (rate/burst) and, if you need WAF, terminate TLS on **CloudFront** in front of the API, or use a **REST** API. Do not re-add a `aws_wafv2_web_acl_association` to the v2 stage; apply will fail with an invalid `RESOURCE_ARN`.

## GitHub

Configure **Actions** secrets and variables (see the plan / operators doc). The deploy workflow needs:

- **OIDC to AWS** — `AWS_ROLE_ARN` plus a role that can run Terraform in your account
- **Remote state** — `TF_STATE_BUCKET`, `TF_STATE_LOCK_TABLE` (DynamoDB lock table, partition key `LockID`)
- **Optional custom domain** — `TF_CUSTOM_DOMAIN` (variable): set to the **apex** (e.g. `michaelj43.dev`) or the full public API host (e.g. `api.michaelj43.dev`). Both map to a single `api.…` hostname; the apex form must not be prefixed twice. Also `TF_ACM_CERTIFICATE_ARN`, `TF_ROUTE53_HOSTED_ZONE_ID` (secrets, if Terraform should manage R53 and TLS). The Route53 record is the **FQDN** of that API host (e.g. `api.michaelj43.dev`) inside whatever zone id you pass; it is not a bare `api` label, so using a hosted zone for `api.michaelj43.dev` still creates the record at `api.michaelj43.dev`, not `api.api.…`.
- **CORS and hashing** — `CORS_ALLOWED_BASE_HOST` (variable, e.g. `michaelj43.dev`) and `IP_HASH_SECRET` (secret) passed through as `TF_VAR_*` to the Lambda
- **Auth and static SPAs (optional)** — set repository **variables** and **secrets** so Terraform can create S3, **CloudFront** (with S3 origin access), **A/AAAA** aliases in **Route 53**, and pass Lambda env:
  - **Variables (repository or `production` environment):** `AUTH_SPA_DOMAIN` (e.g. `auth.michaelj43.dev`), `DASHBOARD_SPA_DOMAIN` (e.g. `analytics.michaelj43.dev`), `AUTH_DEFAULT_APP_URL` (e.g. `https://analytics.michaelj43.dev/`), `AUTH_SESSION_TTL_SECONDS` (e.g. `604800`), `AUTH_ALLOW_REGISTER` (e.g. `false` or `true` for bootstrap only).
  - **Secrets:** `TF_AUTH_SPA_ACM_CERTIFICATE_ARN` and `TF_DASHBOARD_SPA_ACM_CERTIFICATE_ARN` — each must be a validated ACM cert in **us-east-1** (required for CloudFront custom hostnames). **Secrets (Route 53):** `TF_AUTH_SPA_ROUTE53_HOSTED_ZONE_ID` and `TF_DASHBOARD_SPA_ROUTE53_HOSTED_ZONE_ID` — public hosted zone IDs that are **authoritative for the SPA FQDNs** (use the same zone ID for both if `auth.…` and `analytics.…` live in one zone, e.g. `michaelj43.dev`). If a zone is omitted, Terraform still creates the distribution; you add DNS by hand. The **API** TLS and optional API `A` record still use `TF_ACM_CERTIFICATE_ARN` and `TF_ROUTE53_HOSTED_ZONE_ID` when set for `api.…` — those are separate from the two SPA zone secrets.
- **Apply IAM:** the GitHub **OIDC** role for Terraform must be allowed to manage CloudFront, S3 bucket policies, and (for Route 53) `route53:ChangeResourceRecordSets` in the target zones. After the first apply, **sync** built assets: `aws s3 sync` of `auth-spa/dist` and `dashboard/dist` to the printed buckets (see [Auth + dashboard](auth-and-dashboard.md)).

Set the `production` **environment** in the repo to match your process (e.g. protection rules). The workflow uses `environment: production` with a fixed **deployment URL** of `https://api.michaelj43.dev` (adjust the workflow or environment if your API URL differs).

## First-time Terraform

Bootstrap **S3** state bucket and **DynamoDB** lock table in AWS before the first `terraform init` from Actions (or locally with the same backend config).

## Local

```bash
cd lambda
npm ci
npm run openapi:generate
npm run test:cov
npm run build   # OpenAPI + esbuild + zip
```

Terraform: `cd deploy/terraform/aws` and `terraform init` (with your backend) before `apply`.
