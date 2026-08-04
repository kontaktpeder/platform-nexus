# Control Core handoff v0 — Fortell → Agreements

**Principle:** When Control is connected, Nexus/Fortell **prepares** (draft + metadata).
Control Core **owns** process (signing, version UI, archive). Fortell must not become the
contract system — it is the entry that feeds Control.

**Desk / kø:** Same glance→act pattern as Gmail — signals with lane + `href` into Control,
uniform actions, AI only for intent copy. See [DESK_SIGNAL_CONTRACT.v0.md](./DESK_SIGNAL_CONTRACT.v0.md).

## Flows

### Create new draft

```text
User → Fortell «lag NDA-utkast…»
     → proposeControlAgreement (proposal only)
     → UI confirm «Send nytt utkast til Control»
     → POST Control /api/public/v1/agreements
     → Control stores agreements.status = draft
```

### Continue existing draft

```text
User → Fortell «jobb videre på utkastet til Oslo Bar…»
     → listControlAgreements (q / status=draft)
     → readControlAgreement (id)
     → proposeControlAgreementUpdate (proposal only)
     → UI confirm «Lagre oppdatering i Control»
     → PATCH Control /api/public/v1/agreements/{id}
     → Control bumps version on draft only
```

## Prerequisites

1. Control module connected (`module_connections.status = connected`, slug `control`)
2. Verify key can create/update drafts (`agreements:write` preferred; `platform:read` accepted in v0)
3. Control migration for `agreements` table applied
4. Control deploy includes GET list + PATCH draft endpoints

## Ownership

| Concern | Owner |
|---------|--------|
| Draft text + metadata from conversation | Fortell (ephemeral until confirm) |
| Persisted agreement record | Control |
| Signing / archive | Control |
| Patching draft body via Fortell | Allowed (draft only) |
| Nexus DB storage of contract body | **Forbidden** |

## API

See Control `docs/MODULE_COMPLIANCE.md` — agreements GET/POST/PATCH.
