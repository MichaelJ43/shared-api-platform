# analytics-logger

A small, reusable **analytics / event ingestion** service for a handful of static sites and web apps. The goal is to collect **pageviews, clickthroughs, dwell time, and coarse location** (see privacy notes below) without putting database credentials in the browser.

## Problem

You own multiple pages and apps. You want a **single** place to:

- Accept events from an **embedded client script** on each site
- **Validate and sanitize** payloads on the server
- **Persist** events to a database in AWS
- Keep secrets and write access **off the client** (no direct browser → RDS with DB user/password)

## Intended architecture (high level)

1. **Client** — a small script (or built bundle) included on each page, configured with a per-site id and the ingest API URL. It sends structured events (e.g. `pageview`, `click`, session id, path, optional metadata).
2. **API** — a public **HTTPS** endpoint (typically **API Gateway** in front of **Lambda**).
3. **Server** — Lambda (or similar) that **validates, normalizes, and sanitizes** input, then writes to the database. Optional: rate limiting, CORS allowed origins, lightweight site key, IP-based coarse geo.
4. **Data store** — **DynamoDB** or **RDS** (Lambda in VPC if using RDS), depending on query needs and cost.

“Location” should be **coarse** (e.g. country/region from request IP in the API path), not a trust-the-client string. Browser geolocation is optional and **requires user consent** if you use it at all.

## Repository layout (to be filled in)

This repository is a **dedicated** home for the ingest API, infrastructure-as-code, and the shared client asset. **Individual apps** (portfolio site, other GH Pages apps, etc.) only **embed the script** and point at this service — they do not duplicate the backend.

## Status

**Scaffold only** — `AGENTS.md` describes the product goal for implementers and agents. Implementation (code, IaC, CI) is intentionally not started here yet.

## License

TBD (align with your other public repos, e.g. MIT).
