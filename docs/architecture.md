# Architecture (Phase 1)

## Flow

1. Browsers (or back ends) call **API Gateway HTTP API** in front of a **Node 20 Lambda**.
2. **Dynamic CORS** in Lambda: allowed origins are `https://<apex>` and `https://*.<base>` for `CORS_ALLOWED_BASE_HOST` (e.g. `michaelj43.dev`); no per-subdomain list in this repo.
3. **Ingest** — `POST /analytics/events?v=1` with a single `event` or a batched `events` array (same `appId` in a batch). Zod validation; no secrets in the client.
4. **Storage** — **DynamoDB** table with keys `APP#<appId>#DAY#<UTC-YYYY-MM-DD>` / `<serverTimeMs>#<ulid>`, plus attributes described in the plan.
5. **IP hashing** (optional) — HMAC of API Gateway `sourceIp` with `IP_HASH_SECRET` if set.
6. **Public contract** — `openapi/openapi.yaml` (generated from Zod-related definitions in the Lambda code via `npm run openapi:generate`).

## Versioning

Query parameter **`v=1`** on the ingest path; new API versions can add `v=2` later without changing the path.

## Tests

`lambda/` uses **Vitest** with a **~80%** line-coverage floor. **Spectral** lints the OpenAPI file in CI.
