# shared-api-platform

A **shared AWS API layer** and **IaC** home for cross-app **HTTPS** services: one place for **API Gateway + Lambda + DynamoDB**, CORS, and documented contracts, so app repos stay thin and never hold database credentials.

## Status

**Phase 1** implements **analytics-style ingest** (`POST /analytics/events?v=1`), **DynamoDB** storage, **OpenAPI 3** (`openapi/openapi.yaml`, generated from Zod), **CI** (tests + coverage + Spectral + OpenAPI drift check), and **Deploy** to AWS on `main` (Terraform + version bump, GitHub `production` environment).

## Layout

| Path | Role |
|------|------|
| `lambda/` | TypeScript **Node 20** Lambda: validation, CORS, ingest, DynamoDB writes |
| `client/` | Optional **embeddable browser** build (`npm run build` in `client/`; see [docs/embed.md](docs/embed.md)) |
| `contract/` | **Dredd** + hooks against the OpenAPI (set `DREDD_BASE_URL` to run) |
| `deploy/terraform/aws/` | **Terraform**: HTTP API, Lambda, DDB, optional `api.<domain>` + R53, throttling, WAF, CloudWatch |
| `openapi/openapi.yaml` | **Public contract** (run `cd lambda && npm run openapi:generate` after schema changes) |
| `docs/` | [Architecture](docs/architecture.md), [Deployment / GitHub & AWS](docs/deployment.md), [Embed](docs/embed.md) |

## Quick local

```bash
cd lambda && npm ci
npm run openapi:generate
npm run test:cov
npm run build
# optional: browser client
# cd client && npm ci && npm run build
```

## Client usage (sketch)

- **GET** `https://api.<your-domain>/health` — liveness; optional `Origin` for browser calls.
- **POST** `https://api.<your-domain>/analytics/events?v=1` — JSON body `{ "event": { ... } }` or `{ "events": [ ... ] }` (see OpenAPI for fields).

CORS: origins must be `https://<apex>` or `https://*.<CORS_ALLOWED_BASE_HOST>`; configure the base host in GitHub + Terraform (see [docs/deployment.md](docs/deployment.md)).

## Conventions

See [AGENTS.md](AGENTS.md) for product boundaries, privacy, and shared-ownership rules.

## License

TBD (align with your other public repos, e.g. MIT).
