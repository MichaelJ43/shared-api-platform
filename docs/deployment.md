# Deployment

Pipelines: `.github/workflows/ci.yml` (pull requests and `main`) and `.github/workflows/deploy.yml` (only `main` pushes, skips commits with `[skip deploy]` in the message). CI optionally runs **Dredd** when the repository **variable** `DREDD_BASE_URL` is set (e.g. `https://api.michaelj43.dev`); set optional `DREDD_ORIGIN` to match an allow-listed CORS origin (defaults to `https://michaelj43.dev` for hooks).

**WAF and HTTP API:** AWS WAF can be associated (via Terraform or console) with **REST** API stages (`/restapis/...` ARNs) only, not with **HTTP** API (API Gateway v2) stage ARNs. This stack uses an HTTP API, so the Terraform module does not attach a web ACL. Use the stage’s **throttling** (rate/burst) and, if you need WAF, terminate TLS on **CloudFront** in front of the API, or use a **REST** API. Do not re-add a `aws_wafv2_web_acl_association` to the v2 stage; apply will fail with an invalid `RESOURCE_ARN`.

## GitHub

Configure **Actions** secrets and variables (see the plan / operators doc). The deploy workflow needs:

- **OIDC to AWS** — `AWS_ROLE_ARN` plus a role that can run Terraform in your account
- **Remote state** — `TF_STATE_BUCKET`, `TF_STATE_LOCK_TABLE` (DynamoDB lock table, partition key `LockID`)
- **Optional custom domain** — `TF_CUSTOM_DOMAIN` (variable): set to the **apex** (e.g. `michaelj43.dev`) or the full public API host (e.g. `api.michaelj43.dev`). Both map to a single `api.…` hostname; the apex form must not be prefixed twice. Also `TF_ACM_CERTIFICATE_ARN`, `TF_ROUTE53_HOSTED_ZONE_ID` (secrets, if Terraform should manage R53 and TLS). The Route53 record is the **FQDN** of that API host (e.g. `api.michaelj43.dev`) inside whatever zone id you pass; it is not a bare `api` label, so using a hosted zone for `api.michaelj43.dev` still creates the record at `api.michaelj43.dev`, not `api.api.…`.
- **CORS and hashing** — `CORS_ALLOWED_BASE_HOST` (variable, e.g. `michaelj43.dev`) and `IP_HASH_SECRET` (secret) passed through as `TF_VAR_*` to the Lambda
- **Auth and static SPAs (optional)** — set repository **variables** and **secrets** so Terraform receives `auth_*` / `dashboard_*` values (S3 bucket creation, Lambda env, and your new ACM cert ARNs for future CloudFront or external wiring):
  - **Variables (repository or `production` environment):** `AUTH_SPA_DOMAIN` (e.g. `auth.michaelj43.dev`), `DASHBOARD_SPA_DOMAIN` (e.g. `analytics.michaelj43.dev`), `AUTH_DEFAULT_APP_URL` (e.g. `https://analytics.michaelj43.dev/`), `AUTH_SESSION_TTL_SECONDS` (e.g. `604800`), `AUTH_ALLOW_REGISTER` (e.g. `false` or `true` for bootstrap only).
  - **Secrets:** `TF_AUTH_SPA_ACM_CERTIFICATE_ARN` and `TF_DASHBOARD_SPA_ACM_CERTIFICATE_ARN` — each ACM cert must be in **us-east-1** if you later attach CloudFront. The API’s custom domain still uses the existing `TF_ACM_CERTIFICATE_ARN` when `TF_CUSTOM_DOMAIN` is set; the SPA cert ARNs are separate per subdomain.

Set the `production` **environment** in the repo to match your process (e.g. protection rules). The workflow uses `environment: production` with a fixed **deployment URL** of `https://api.michaelj43.dev` (adjust the workflow or environment if your API URL differs).

## Pushes from workflows

The deploy job bumps `lambda/package.json` after a successful apply and commits with `[skip deploy]` so only the first commit on `main` runs Terraform; the version bump re-runs **CI** but not **Deploy**.

**Workflows must be allowed to push** to the default branch: **Settings → Actions → General → Workflow permissions → Read and write** (or use a PAT in a custom secret for `actions/checkout` + push).

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
