# AGENTS — shared-api-platform

This file is for **AI coding agents** and **human contributors** working in this repository. Read it before making changes.

## Product goal

This repository is the **home for shared AWS resources and API configuration** that serve **more than one** app or static site. It is a **platform** repo: one place to define public HTTPS APIs, server-side processing, and secure access to data stores, so individual product repos do not duplicate or leak infrastructure.

**Analytics / event ingestion** is a **valid first vertical** (client script → `POST` → validate → store), but the **scope of the repo is broader** — any small, well-scoped, multi-consumer backend can live here as long as it matches the shared-ownership model.

### Principles

- **No database credentials in browsers** — only this stack talks to DBs, queues, and secrets; clients use HTTPS and optional public identifiers (e.g. per-site or per-app id), not DB users.
- **Version public contracts** — path or header versioning for any route other apps will depend on for a long time.
- **CORS, rate limits, and abuse** — default to allow-listed origins and throttling for browser-callable routes; document exceptions.
- **Add surfaces deliberately** — new routes or services should be **named and bounded** (e.g. “ingest”, “webhooks”); avoid an unmaintainable “one Lambda does everything” unless that is a conscious interim step.

### Example: analytics-style ingest (non-exclusive)

- **Ingest** — `POST` (or batch) with event types, paths, client timestamps, a **per-browser session id** (e.g. `localStorage` UUID), and a **configurable app/site id**.
- **Server** — strict schema, max lengths, reject unknown fields, **UTC** on the server, redact or hash PII as policy dictates. Coarse **geo** from request IP (or skip), not from client-supplied “location” without consent and product intent.

### Non-goals (unless explicitly requested)

- Rebuilding a full third-party analytics product (dashboards, cohorts, attribution). Start with **reliable, documented** APIs and storage.
- Trusting unvalidated client data for **security- or policy-sensitive** decisions.

## Architecture expectations (AWS)

- **API Gateway** (or similar) in front of **Lambda**; shared **WAF** / **throttling** where public.
- **Data** — use the **simplest** store that matches query and cost needs (DynamoDB, SQS, RDS, etc.); keep connectivity **private** (VPC to RDS when required).
- **IaC** and CI live **here** for resources owned by this platform; do not scatter duplicate stacks per app.

## Relationship to other repositories

- **App repos** (portfolio, games, tools) **reference** this platform’s **base URLs and client config**; they do **not** check in a second copy of the same Lambda or DB layer unless there is a rare, documented reason.

## Conventions

- Match tooling once it exists (IaC language, runtimes, tests).
- Prefer **small, reviewable** changes: one capability or one vertical slice at a time.
- **Security and privacy** by default: no secrets in client artifacts; clear retention and data-shape notes in README or `docs/` when behavior is user-facing.

## When unsure

- Prefer **documenting** tradeoffs (README or `docs/`) over inventing product requirements.
- If choosing between a **quick monolith** and **clear modules**, document the debt and a likely split (e.g. per-route Lambdas, per-domain packages).
