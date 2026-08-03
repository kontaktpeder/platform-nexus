# Control Core handoff v0 — Fortell → Agreements

**Principle:** When Control is connected, Nexus/Fortell **prepares** (draft + metadata).
Control Core **owns** process (signing, version, archive). Fortell must not become the
contract system — it is the entry that feeds Control.

## Flow

```text
User → Fortell «lag NDA-utkast…»
     → proposeControlAgreement (proposal only)
     → UI confirm «Send utkast til Control»
     → POST Control /api/public/v1/agreements
     → Control stores agreements.status = draft
```

## Prerequisites

1. Control module connected (`module_connections.status = connected`, slug `control`)
2. Verify key can create drafts (`agreements:write` preferred; `platform:read` accepted in v0)
3. Control migration for `agreements` table applied

## Ownership

| Concern | Owner |
|---------|--------|
| Draft text + metadata from conversation | Fortell (ephemeral until confirm) |
| Persisted agreement record | Control |
| Signing / versioning / archive | Control (future) |
| Nexus DB storage of contract body | **Forbidden** |

## API

See Control `docs/MODULE_COMPLIANCE.md` — `POST /api/public/v1/agreements`.
