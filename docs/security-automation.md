# Security automation (GHAS + Actions)

This repo uses **GitHub security features**, **Actions gates**, and optional **Cursor Automations** to triage dependency updates.

## In-repo tooling

| Piece | Purpose |
|-------|---------|
| [`.github/dependabot.yml`](../.github/dependabot.yml) | Weekly npm + Actions updates |
| GitHub CodeQL **default setup** | Code scanning on PRs and `main` (do not add a competing advanced CodeQL workflow) |
| [`.github/workflows/security-merge.yml`](../.github/workflows/security-merge.yml) | Auto-merge **Dependabot** PRs for **patch/minor** only |
| [`.github/workflows/security-notify.yml`](../.github/workflows/security-notify.yml) | Daily webhook to Cursor (optional secrets) |
| [Preview validate](./deployment.md#preview-environments) | Live health + Dredd against ephemeral PR API |

## Repository settings (verified)

In **Settings → Code security and analysis**, keep enabled:

- Dependabot alerts and security updates
- Secret scanning and push protection
- Code scanning with **default setup**

Optional extras (non-provider patterns, validity checks) may require GitHub Advanced Security and are not required for this public-repo baseline.

## Branch protection on `main`

Configured via GitHub branch protection (not rulesets):

- Require a pull request before merging
- **0** required approving reviews
- Require branches to be up to date
- Required status checks: **CI**, **Preview gate**, **Analyze (javascript-typescript)**
- Include administrators is **on** (admins must use PRs too)

## Merge policy

| Source | Auto-merge |
|--------|------------|
| Dependabot, patch or minor semver bump | Yes, when all PR checks pass ([`scripts/security-merge-gate.sh`](../scripts/security-merge-gate.sh)) |
| Dependabot, major bump | No — human review |
| Cursor/agent PR with label `security-fix` | No — human review |
| Secret scanning (credential exposure) | No auto-merge; rotate/revoke out of band |

## Optional Cursor webhook

Set repository secrets if you want daily GHAS alert POSTs:

- `CURSOR_AUTOMATION_WEBHOOK`
- `CURSOR_AUTOMATION_API_KEY`
