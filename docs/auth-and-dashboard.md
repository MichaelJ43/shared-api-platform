# Auth, login SPA, and analytics dashboard

## API routes (Lambda, behind API Gateway)

- **`POST /v1/auth/register`** — when `AUTH_ALLOW_REGISTER=true` in the Lambda environment. JSON body: `email`, `password`. Creates a user in DynamoDB (`auth_users`).
- **`POST /v1/auth/login`** — JSON body: `email`, `password`, optional `returnUrl` (https only, same-site). Sets **`sap_session` HttpOnly** cookie; JSON response includes `user` and optional `returnUrl` echo.
- **`POST /v1/auth/logout`** — clears the session cookie and deletes the row in `auth_sessions`.
- **`GET /v1/auth/me`** — returns `{ user, session }` if the session cookie is valid, else 401.
- **`GET /v1/admin/analytics/events?appId=…&day=YYYY-MM-DD`** — same auth as `me` (valid session + role `admin` on the user). Returns items for that app and UTC calendar day.
- Ingest and health remain on existing paths: **`/analytics/events?v=1`**, **`/health`**.

## Environment variables (Lambda)

| Variable | Notes |
|----------|--------|
| `AUTH_USERS_TABLE_NAME` / `AUTH_SESSIONS_TABLE_NAME` | DynamoDB table names (Terraform sets these). |
| `AUTH_SESSION_TTL_SECONDS` | Session max age; rows get `ttl` for DynamoDB TTL. |
| `AUTH_ALLOW_REGISTER` | `true` to allow `POST /v1/auth/register` (e.g. bootstrap only, then set `false`). |
| `AUTH_DEFAULT_APP_URL` | Used when `returnUrl` is missing on login. |
| `CORS_V1_ALLOWED_ORIGIN_REGEX` (optional) | Regex for `Origin` on `/v1/*` credentialed CORS. |

## Bootstrap a user (production)

1. With Terraform applied, get the `auth_users` table name (or from AWS console).
2. From `lambda/`, with `AUTH_USERS_TABLE_NAME` set:

   ```bash
   export AUTH_USERS_TABLE_NAME=…
   npm run auth:create-user -- you@example.com 'YourStr0ng!Pass'
   ```

3. In DynamoDB, set **`role` = `admin`** on the user item if you need dashboard access.

## Static sites (S3)

Terraform can create private buckets when `auth_spa_domain` and `dashboard_spa_domain` are set; outputs: `auth_spa_s3_bucket`, `dashboard_spa_s3_bucket`. Build SPAs, then sync `dist/` (use your org’s org-wide website hosting runbook if applicable).

```bash
cd auth-spa && npm ci && npm run build
aws s3 sync dist/ s3://<auth-spa-bucket> --delete
cd ../dashboard && npm ci && npm run build
aws s3 sync dist/ s3://<dashboard-bucket> --delete
```

Terraform can create **CloudFront** (S3 origin access) and **Route 53** `A`/`AAAA` aliases when you set the SPA domains, **us-east-1** ACM ARNs, and hosted zone secrets (see [Deployment](deployment.md)). After each apply, **sync** new web builds to the buckets. SPAs use `VITE_API_BASE` (or defaults) at build time for the API base URL.

**Stale UI right after a deploy** usually means the browser or CloudFront is still using an old **`index.html`**, which references previous hashed files under `assets/`. The Terraform for these distributions disables caching for the default (HTML) behavior and allows long cache only for `assets/*`. If you still see a mismatch before that applies, run an invalidation (outputs: `auth_spa_cloudfront_id`, `dashboard_spa_cloudfront_id`):

```bash
aws cloudfront create-invalidation --distribution-id "$ID" --paths "/index.html" "/*"
```

## Session cookie

- Name: `sap_session`.
- **HttpOnly, Secure, SameSite=Lax**, path `/`, domain: apex `host` of `CORS_ALLOWED_BASE_HOST` (e.g. `michaelj43.dev` so subdomains share the session).

## Related

- [Deployment](deployment.md) — GitHub, Terraform, secrets.
- [AGENTS.md](../AGENTS.md) — platform scope and CORS.
