# Core Surface v0 — Nexus × cores

**Status:** Working normative standard  
**Goal:** Lock what each core owns, how it appears in Nexus (widget / Desk / deep link), and how Nexus may act — without becoming a second system of record.  
**Related:** [MODULE_CONTRACT.v1.md](./MODULE_CONTRACT.v1.md), [DESK_SIGNAL_CONTRACT.v0.md](./DESK_SIGNAL_CONTRACT.v0.md), [LIVE_WIDGETS.md](./LIVE_WIDGETS.md), [ORG_PROVISION.v0.md](./ORG_PROVISION.v0.md), [MISSION_ACTIONS.v1.md](./MISSION_ACTIONS.v1.md), [RELATIONSHIP_WORKSPACE.v0.md](./RELATIONSHIP_WORKSPACE.v0.md), [IDENTITY_CORE.md](./IDENTITY_CORE.md)

> Breaking changes → `CORE_SURFACE.v1.md`. Clarifications and new optional fields stay in v0.  
> This document is **normative**. Sections marked *implemented* reflect current code; others are **target** until shipped.

---

## 1. Principle

> **Core = domenesannhet og fullverdig fag-UX. Nexus = glance, coordinate og act gjennom coren. Nexus kan eie kontekst, identitet, kø og read models – aldri duplisert faglig sannhet.**

```text
Core owns domain truth + full UX for that domain.
Nexus owns glance (widgets), coordinate (Desk/Mission/Fortell), identity/context,
queue metadata, and versioned read models / cache.
Nexus never becomes a second ledger, contract archive, or health record.
```

---

## 2. Subject scope vs view context

**Do not confuse data ownership with UI layout.**

### 2.1 `subject_scope` (data owner)

| `subject_scope` | Meaning |
|-----------------|---------|
| `person` | One natural person (stable person identity) |
| `household` | First-class household identity (`household_id`) — not an org |
| `organization` | Nexus / module business tenant (company) |

Every relevant object SHOULD carry a typed owner:

```text
subject_type: person | household | organization
subject_id:   <stable ID>
```

### 2.2 `view_context` (OS / UI filter)

| `view_context` | Meaning |
|----------------|---------|
| `whole_life` | Aggregate authorized scopes — **owns no domain data** |
| `private` | Person + household (membership) + consented shares |
| `business_portfolio` | Cross-org business pulse for the user |
| `organization` | Single company workspace |

`whole_life` and `private` are **views**, not tenants. Private life is **not** modelled as a Nexus organization.

### 2.3 Household (normative Identity v0)

```text
Household is a first-class identity subject with a stable household_id.

A household is not:
- an organization
- a business tenant
- an owner of person-scoped health data
- an implicit permission boundary

Household membership establishes association, not automatic access.
Access to person-scoped data requires an explicit, revocable consent grant.
```

**Consent groups ≠ household identity.** Consent changes and can be revoked; shared bills, home tasks, and history need a stable `household_id`.

#### Minimal v0 schema (target)

```text
households
- id, name, created_by_person_id, timezone, default_currency, status, timestamps

household_memberships
- household_id, person_id, role, status, joined_at, ended_at

consent_grants
- id, grantor_person_id, grantee_subject_type, grantee_subject_id,
  data_category, permission, purpose, granted_at, expires_at, revoked_at
```

Roles (relation only — not automatic ACL): `owner` | `adult_member` | `dependent`.

If a unified subject registry does not exist yet, `households` may be its own table in v0; the contract MUST allow a later unified subject register without rewriting owners.

**CRM boundary:** Nexus `entities` / `known_identities` are the contact graph (people/companies you know). Household membership links to **person identity**, not CRM entities.

#### Data scope examples

| Data | `subject_scope` |
|------|-----------------|
| Sleep, health, personal routines | `person` |
| Personal bank / private spend | `person` |
| Shared budget & household bills | `household` |
| Home tasks, shopping | `household` |
| Shared calendar event | `household` |
| Company finance & customers | `organization` |

Person health never moves to household scope. Household may receive a **consent-based projection** (e.g. “low capacity today”) without owning sleep records.

#### Private view composition

```text
view_context = private

Loads:
- person-scoped data for the signed-in user
- household-scoped data for memberships
- explicitly shared person data allowed by consent_grants
```

`whole_life` may then aggregate private + business + orgs, still inheriting access and presentation rules.

---

## 3. Ownership matrix (cores)

| Core / layer | System of record | Nexus may show | Nexus must not |
|--------------|------------------|----------------|----------------|
| **Finance** | Invoices, entries, payments, books | Widgets; Desk unpaid/purring; deep link | Own invoice lines / ledger |
| **Work** | Projects, time, work tasks | Widgets; session/signals; deep link | Replace Work board as SoR |
| **Control** | Agreements, signing, versions | Desk draft/waiting; Fortell propose→confirm | Store contract body as SoR |
| **Field** | Follow-up history, field status, place, next action | Desk follow-ups; contact sheet hooks | Become universal CRM |
| **Booking** (future) | Bookings, capacity | Widget + Desk next booking | Own calendar truth |
| **Health / Life** (future) | Sleep, movement (e.g. Polar) | Private widgets/signals; consented projections | Medical record / raw health SoR in Nexus |
| **Nexus** | Org map, person/household identity, consent, contact graph, queue metadata, personal context, SSO, read models | Portfolio Moduler, Desk, Fortell, OS views | Duplicate core domain truth |

### Contact responsibility

| Concern | Owner |
|---------|--------|
| Person identity, relationships across contexts, consent | **Nexus** |
| Universal contact graph (`entities` / identities) | **Nexus** |
| Follow-up history, field status, place, next field action | **Field** |
| Core-specific customer roles (debtor, project client, …) | **Relevant core** |

Anti-pattern: two competing CRMs (Nexus contacts vs Field as full contact SoR).

---

## 4. Three surfaces (how cores appear)

Every core that appears in Nexus MUST define these surfaces:

| Surface | Contract | Purpose |
|---------|----------|---------|
| **Widget** | [LIVE_WIDGETS.md](./LIVE_WIDGETS.md) + §6 provenance | Glance number / status |
| **Desk signal** | [DESK_SIGNAL_CONTRACT.v0.md](./DESK_SIGNAL_CONTRACT.v0.md) + §5 lifecycle | Act today |
| **Deep link** | `module/info` deep_links | Open full UX in core |

OS contexts (`whole_life`, `private`, `business_portfolio`, `organization`) only **layout and filter** these surfaces — they do not invent new owners.

---

## 5. Actions: glance vs command

«Nexus = act» means **send a command to the owning core**, not mutate domain truth locally.

```text
User acts in Nexus
→ Nexus sends command with idempotency key
→ Core validates and executes
→ Core stores domain result
→ Nexus stores only status, reference, and queue metadata
```

Example: Nexus may request «send purring»; Finance decides validity and records the reminder.

### 5.1 Surface action fields

Each actionable surface (widget CTA, Desk card action) MUST declare:

| Field | Meaning |
|-------|---------|
| `read_source` | Where display data comes from (`source_core` + mode) |
| `action_owner` | Core (or Nexus-metadata-only) that executes |
| `allowed_actions` | Closed list for this surface |
| `confirmation_required` | User must confirm before send |
| `deep_link` | Fallback / open in core |
| `fallback_behavior` | If core unavailable: hide / disable / open deep link / metadata-only |

### 5.2 Action protocol (target)

- Commands include stable `idempotency_key` (client- or Nexus-generated).
- Core is authoritative for success/failure and domain side effects.
- Nexus may write `mission_action_states` / Desk hide for UX; that is **not** domain resolution unless the core confirms (or the action is explicitly Nexus-metadata-only, e.g. snooze).

*Implemented today (partial):* Gmail mark_read/archive/trash; Finance purring via compose sheet; Mission snooze/dismiss. Generic idempotent command bus = **target**.

---

## 6. Signal lifecycle

Beyond type and lane ([DESK_SIGNAL_CONTRACT.v0.md](./DESK_SIGNAL_CONTRACT.v0.md)), every Desk/Mission signal follows:

```text
created → presented → acknowledged | snoozed → resolved | expired
```

### 6.1 Rules (normative)

| Topic | Rule |
|-------|------|
| Priority / due | Signal MAY carry priority and due; ranking is presentation, not a second task DB |
| Dedup | Stable namespaced `id`; same underlying record MUST NOT create parallel open signals without explicit multi-context policy |
| TTL / expiry | Signals SHOULD expire or refresh from source; stale open items MUST be revalidated |
| Snooze / dismiss | Nexus queue metadata (`mission_action_states`) — does not resolve domain |
| Who resolves | Prefer **core** (paid invoice, signed agreement, completed field follow-up). Nexus «Ferdig» without core ack = acknowledged/hidden, not domain-resolved, unless action_owner is Nexus-metadata |
| Core → resolved | Core SHOULD notify or expose status so Nexus can drop/refresh the signal |
| Multi-context | Same signal MAY appear in Desk and Mission; one resolution/hide state per user+signal key |
| Audit | Executed commands SHOULD leave an audit trail (who, when, idempotency_key, result ref) |

Desk must not become a general-purpose task database. Follow-ups that are domain work belong in Field/Work/Control.

*Implemented today (partial):* snooze / dismiss / `handled_locally`. Core-driven resolve + audit = **target**.

---

## 7. Provenance: live, derived, mock

Every widget and signal payload SHOULD include:

```text
source_mode: live | derived | mock
source_core: finance | work | control | field | gmail | health | nexus | …
source_record_id: <optional stable id in core>
generated_at: ISO-8601
data_period: <optional interval the value covers>
freshness_status: fresh | stale | empty | loading | error | unauthorized
```

### 7.1 Rules

- Production MUST reject or **clearly mark** `mock` (never silent mock as live).
- Cards SHOULD show «sist oppdatert» from `generated_at`.
- UI states `stale` | `empty` | `loading` | `error` | `unauthorized` MUST be defined per surface.
- User SHOULD be able to see where a number comes from (`source_core` + deep link).

*Implemented today (partial):* live Finance/Work widgets; OS dashboards still use mock. Provenance fields = **target**.

---

## 8. Read models (not “no DB”)

Correct formulation:

> `whole_life` / portfolio views own **no domain data**, but Nexus MAY store versioned read models, cache, user preferences, and aggregation metadata.

Allowed Nexus storage:

- Queue / mission action states  
- Contact graph & identity (person, household, consent)  
- Personal context dossier  
- Widget/signal cache and derived aggregates (with provenance)  
- User layout preferences  

Forbidden: duplicate invoice bodies, agreement text as SoR, raw health time series as medical record.

---

## 9. Aggregation rules

Business portfolio and `whole_life` aggregates MUST define:

| Topic | Requirement |
|-------|-------------|
| Currency | Declared currency; FX source and as-of time when converting |
| Timezone / periods | Explicit TZ and period boundaries (`data_period`) |
| Actual vs forecast | Never mix without labelling |
| Intercompany | Exclude or mark internal transfers between orgs |
| Duplicate contacts/activities | Dedupe by identity graph, not by display name alone |
| Missing data | Aggregate MUST expose `completeness: complete \| partial` and which subjects are missing |
| Presentation | Partial totals MUST NOT look identical to complete totals |

A single revenue figure is dangerous if three of four orgs are fresh and one is missing.

---

## 10. Data classification & access

Every widget and signal MUST carry (or inherit) `data_classification`:

| Class | Examples |
|-------|----------|
| `public` | Marketing site stats (rare in Desk) |
| `internal` | Operational non-sensitive |
| `confidential` | Customer negotiations, drafts |
| `financial` | Invoices, balances, revenue |
| `health_sensitive` | Sleep, recovery, medical-adjacent |

Nexus MUST enforce access at **fetch and presentation**.  
`whole_life` / shared screens MUST NEVER leak person-scoped health or private financial data into business or shared contexts without consent.

Household membership alone does not grant person health access.

---

## 11. Per-core surface checklist (examples)

### Finance (reference — partially implemented)

| Field | Example |
|-------|---------|
| `read_source` | Finance invoices API / widgets |
| `action_owner` | `finance` (purring); Nexus metadata for snooze |
| `allowed_actions` | open_in_finance, send_purring, follow_up, done/snooze |
| `confirmation_required` | send_purring = yes |
| `deep_link` | `/invoices/{id}` |
| `fallback_behavior` | needs_key → prompt invoices:read; else deep link list |
| Lanes | `overdue` \| `due_soon` \| `open` \| `needs_key` |
| Classification | `financial` |
| Subject | `organization` |

### Control (target)

| Field | Example |
|-------|---------|
| SoR | Control agreements |
| Actions | open_in_control; Fortell propose/update with confirm |
| Lanes | `draft` \| `waiting_signature` \| `signed` \| `archived` |
| Classification | `confidential` |
| Subject | `organization` |

### Field (partial)

| Field | Example |
|-------|---------|
| SoR | Field follow-ups |
| Nexus | Contact graph + schedule follow-up UI |
| Classification | `internal` / `confidential` by content |
| Subject | usually `person` or `organization` via entity link |

### Health (target)

| Field | Example |
|-------|---------|
| SoR | Device/vendor or Health core |
| Nexus | Private widgets/signals; consented projections only |
| Classification | `health_sensitive` |
| Subject | `person` (never household SoR) |

---

## 12. Definition of Done — new core in Nexus

A core MUST NOT appear in Nexus production surfaces until it has:

1. Named data owner (SoR) and explicit “Nexus must not”  
2. Defined `subject_scope` usage (`person` / `household` / `organization`)  
3. Widget contract with empty / error / stale / unauthorized states + provenance  
4. Signal types, lanes, and full lifecycle (§6)  
5. `allowed_actions`, `action_owner`, confirmation rules, idempotency  
6. Deep links in module info  
7. `data_classification` and presentation rules  
8. Aggregation rules if included in portfolio / whole_life  
9. Live test fixtures and contract tests (no silent mock in prod)  
10. Dashboard slot mapping + versioned migration plan for read models  

---

## 13. Normative vs implemented (v0 snapshot)

| Area | State |
|------|-------|
| Principle + ownership matrix | **Normative** (this doc) |
| Desk Gmail + Finance cards | **Implemented** (partial action protocol) |
| Live widgets Finance/Work | **Implemented** (minimal provenance) |
| Mission snooze/dismiss | **Implemented** |
| Generic command + idempotency | **Target** |
| Signal lifecycle + core resolve + audit | **Target** (extend DESK_SIGNAL) |
| Provenance on all payloads | **Target** (extend LIVE_WIDGETS / Desk) |
| Household + consent_grants | **Target** (Identity) |
| Aggregation completeness | **Target** |
| OS dashboards | **Mock** — must adopt provenance before prod |

---

## 14. Document map

| Need | Document |
|------|----------|
| HTTP module API | MODULE_CONTRACT.v1 |
| Desk glance→act shape | DESK_SIGNAL_CONTRACT.v0 (extend for lifecycle) |
| Widget fetch | LIVE_WIDGETS.md (extend for provenance) |
| Org×core linking UX | ORG_PROVISION.v0 (**orgs only** — not private life) |
| SSO | IDENTITY_CORE.md |
| Contact graph anti-CRM | RELATIONSHIP_WORKSPACE.v0 |
| **Ownership, surfaces, actions, scope, DoD** | **This file** |
