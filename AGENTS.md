# AGENTS — analytics-logger

This file is for **AI coding agents** and **human contributors** working in this repository. Read it before making changes.

## Product goal

Build a **reusable analytics / event logger** for **multiple** static sites and small web apps under the same maintainer. Each site **embeds a client script**; events are sent to a **dedicated AWS-backed API** that **sanitizes and persists** data. Do **not** embed database credentials or direct DB access in the browser.

### Core flows

- **Ingest** — `POST` (or batch) to an HTTPS endpoint. Payloads describe events such as: `pageview`, `click`, time-on-page / session, path, optional referrer, client timestamps, a **per-browser session id** (e.g. `localStorage` UUID), and a **site** or **app id** in config.
- **Server** — validate schema per event type, cap string lengths, reject unknown fields, normalize URLs, store **UTC** time on the server, optionally hash or redact PII. Write to a database from **Lambda** (or equivalent), not from the client.
- **Client** — small, versioned script; each page includes it with **config** (ingest base URL, site id, optional feature flags). Keep the **public** surface minimal: no secrets in the script beyond an optional **non-cryptographic** “site key” for abuse reduction if you add one.

### Non-goals (unless explicitly requested)

- Full product analytics parity with commercial vendors (funnels, cohorts UI, etc.); start with **reliable ingest + storage + query path**.
- Trusting **client-supplied** “location” or any security-sensitive field without server-side checks.

## Architecture expectations

- **API Gateway** (or similar) → **Lambda** → **DynamoDB** or **RDS**; use a **private** DB and credentials only in the backend.
- **CORS** restricted to known origins if possible; **rate limiting** on the API.
- **Version** the ingest API (path or header) so old embedded scripts do not break silently when the contract evolves.
- **Coarse location**: derive from **request IP** on the server (or omit); document privacy in README when implemented.

## Repository role

This repo is the **single** place for the ingest service, IaC, and the shared **tracker** client asset. **Do not** copy the backend into every app repo; apps only reference the built script and endpoint(s).

## Conventions

- Match existing project tooling once introduced (IaC language, package manager, test runner).
- Prefer **small, focused** PRs: ingest path + one storage backend before adding extras (dashboards, Kinesis, etc.).
- **Security and privacy** are part of the design: no raw secrets in client bundles; minimal retention and fields until requirements say otherwise.

## When unsure

- Prefer **documenting tradeoffs** in README or a short `docs/` note over guessing compliance requirements.
- If two stacks are possible (DynamoDB vs RDS), default to the **simpler** path for a low-traffic, multi-site owner (often DynamoDB or even SQS + batch write) unless SQL reporting is a stated requirement.
