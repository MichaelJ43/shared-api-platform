# shared-api-platform

A **shared AWS API layer** and **IaC home** for anything you run across **several** apps, sites, or small products. The idea is one place to define **HTTP APIs**, **Lambdas**, **auth/CORS/rate limits**, and **data access patterns** so each front end stays thin and never holds cloud DB credentials.

**Analytics / event ingestion** (pageviews, clicks, time-on-page, coarse location from IP, etc.) is a **concrete use case** that fits here, not the name of the whole platform.

## Problem

You maintain multiple UIs and small backends. You want:

- A **single** AWS-shaped stack for **cross-app** concerns (ingest, webhooks, shared reads, feature flags, whatever you add later)
- **Secrets and writes** to durable stores only in the **platform**, not in static sites or client bundles
- **Consistent** patterns: API Gateway, Lambda, private databases, WAF, logging, and naming so you are not re-solving the same problems per repo

## What belongs in this repository

- **Infrastructure as code** for shared API Gateway routes, stages, and integrations
- **Lambda** handlers and shared **libraries** (validation, logging, idempotency helpers, etc.) used by more than one “surface”
- **Optional** small client assets (e.g. a embeddable **tracker** script) that are **config-only** on the public side — no long-lived secrets

## Example surface: analytics ingest

A browser **embeds a versioned script**; events go to an **HTTPS** endpoint, are **validated and sanitized** server-side, then **persisted** (e.g. DynamoDB or RDS behind Lambda in a VPC). Coarse “location” should come from **server-side** IP handling, not a trusted client string.

## What does *not* need to be here

- Full app-specific UI or a single product’s only backend, unless you deliberately centralize that here.
- A commitment to one database engine forever — the platform can host multiple data stores and multiple logical APIs.

## Repository layout (to be filled in)

TBD: structure by **capability** (e.g. `ingest/`, `shared/`, `iac/`) once tooling is chosen. Keep **per-app** repos limited to their UI and a pointer to this platform’s base URLs and client settings.

## Status

**Scaffold** — `AGENTS.md` records goals and boundaries for implementers. Implementation is intentionally not started in this pass.

## License

TBD (align with your other public repos, e.g. MIT).
