# Core Platform — Architecture (Frozen)

> **Status:** Frozen as of 2026-07-02  
> **Audience:** Platform, Finance, Work, Booking, future modules  
> **Normative API spec:** [MODULE_CONTRACT.v1.md](./MODULE_CONTRACT.v1.md)  
> **Operational guides:** [PLATFORM_VERIFY.md](./PLATFORM_VERIFY.md), [LIVE_WIDGETS.md](./LIVE_WIDGETS.md), [INTEGRATION_CHECKLIST.md](./INTEGRATION_CHECKLIST.md)

---

## 1. What we are building

A **modular platform** where each product (Finance, Work, Booking, …) is an independent app with its own Supabase project, deployable alone or connected via Platform Core.

```text
                 Platform Core
                 (coordinator)
                       │
       ┌───────────────┼───────────────┐
       │               │               │
  Finance Core    Work Core     Booking Core
  (own Supabase)  (own Supabase) (own Supabase)
       │               │               │
       └───────────────┴───────────────┘
              HTTP + Module Contract v1
              Direct module-to-module where needed
```

Platform is **not** a monolith. It does not merge databases or own domain data.

---

## 2. Frozen principles

### 2.1 Platform stores coordination data only

**Platform MAY store:**

| Data | Tables / location |
|------|-------------------|
| Orgs, workspaces, memberships | `organizations`, `workspaces`, `memberships` |
| Module catalog | `modules`, `workspace_modules` |
| Connections to external module orgs | `module_connections` |
| Encrypted verify keys | `module_connection_secrets` |
| Cached module metadata | `module_info_snapshot` on `module_connections` |

**Platform MUST NOT store:**

- Time entries, bookings, customers
- Accounting entries, invoices, attachments
- Any domain object owned by a module

Platform **never** queries module databases directly. Only HTTP to public module APIs.

---

### 2.2 Modules own their data

Each module:

- Has its own Supabase project
- Owns schema, RLS, migrations, business rules
- Exposes a public API (domain endpoints + Module Contract)
- Can run standalone without Platform

Creating an org in Platform **does not** create an org in Finance, Work, or Booking. Linking is explicit via `module_connections.external_org_id`.

---

### 2.3 Module-to-module integration is direct

**Correct:**

```text
Work Core ──POST /entries──► Finance Core
```

**Incorrect:**

```text
Work → Platform → Finance   (for domain data)
```

Platform is used for:

- Setup (org, workspace, enable modules)
- Verify (prove `external_org_id` + base URL)
- Dashboard (widgets, deep links)
- Navigation (open module at org home)

Cross-module flows use **module API keys** stored in the **source module** (e.g. Work `org_integration_secrets`), not Platform secrets.

---

### 2.4 Module Contract v1 is the platform boundary

Every connectable module implements under:

```text
{app_base_url}/api/public/v1/module/
```

**Required (frozen):**

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /module/health` | No | Liveness, `module_slug` |
| `GET /module/info` | No | Capabilities, deep_links, widgets registry |
| `GET /module/organization` | Yes (`platform:read`) | Org for API key |
| `GET /module/organization/:org_id` | Yes (`platform:verify`) | Verify connection |

**Additive (implemented, backward-compatible):**

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /module/widgets?ids=…` | Yes (`platform:read`) | Live dashboard values |

See [LIVE_WIDGETS.md](./LIVE_WIDGETS.md). Widget **registry** remains in `/module/info`; live **values** come from `/module/widgets`.

**Rules:**

- All JSON responses include `"contract_version": "1.0"`.
- Platform has **no** `if (finance)` / `if (work)` in verify or widget layers.
- Breaking API changes → `MODULE_CONTRACT.v2.md`, not edits to v1.

---

### 2.5 Verify semantics

- Verify keys are **server-only** (`module_connection_secrets`, encrypted with `MODULE_SECRETS_KEY`).
- Wrong `external_org_id` for the key → module returns **404**, not 403.
- Platform maps to **existing** module orgs; it does not provision them.

---

### 2.6 Widgets via HTTP only

Platform dashboard:

1. Reads widget definitions from `module_info_snapshot` (cached at verify/retest).
2. Skips widgets with `placeholder: true`.
3. Fetches values via `GET /module/widgets` using the stored verify key.
4. Displays `display` string from the response.

Platform **never** runs SQL against module databases for widgets.

After module deploy, admins should **«Test på nytt»** so snapshots pick up `placeholder: false`.

---

### 2.7 Idempotency for cross-module writes

Domain writes that can be retried MUST use stable keys:

| Field | Usage |
|-------|--------|
| `source_app` | e.g. `work-core`, `gold-of-sicily` |
| `source_type` | e.g. `time_entry`, `invoice` |
| `source_ref` | Stable external id (e.g. time entry UUID, invoice number) |

Receivers SHOULD return existing row on duplicate `(organization_id, source_app, source_ref)` (Finance `POST /entries`).

Source modules SHOULD store back-links (e.g. `time_entries.finance_entry_id`) to avoid duplicate exports.

---

## 3. What Platform never does

| Never | Why |
|-------|-----|
| Create orgs inside modules | Modules own org lifecycle |
| Merge or replicate module DBs | Boundaries stay clear |
| Route domain data through Platform | Scale and security |
| Store verify keys in client or `module_connections` | Secrets stay server-only |
| Hardcode module-specific widget logic | Use Contract + snapshots |
| Return 403 on verify mismatch | 404 avoids org enumeration |

---

## 4. Reference implementations

| Module | Repo | Contract | Live widgets | Cross-module |
|--------|------|----------|--------------|--------------|
| Finance | `finance-hub` | ✅ | ✅ | Receives Work exports |
| Work | `work-heart-engine-1` | ✅ | ✅ | Exports to Finance |
| Platform | `platform-nexus` | N/A | ✅ | Verify + dashboard only |
| GoS app | `arancini-popup-dispatch` | Consumer | N/A | Finance API client |

**GoS org IDs (example):**

- Platform slug: `gold-of-sicily-as`
- Finance: `bbc194b3-3067-4eb9-9918-87bed9ab7670`
- Work: `f6e49d72-96a6-4444-a513-327202443cf1`

---

## 5. Org migration checklist

When moving data between orgs **inside a module** (e.g. pre-company → GoS):

1. Move `finance_entries` / domain rows **and** update `organization_id`.
2. Move **`finance_attachments.organization_id`** (and any file metadata) — not only `entry_id`.
3. Move `invoices`, `invoice_lines`, and `pdf_attachment_id` links consistently.
4. Re-run Platform **«Test på nytt»** on affected module connections.
5. Verify: `GET /entries` `has_attachment`, `GET /module/widgets`, UI paperclip.
6. Document one-off SQL in module repo migrations; do not add Platform logic for migrations.

**Lesson learned:** Entry linked to attachment with correct `entry_id` but wrong `organization_id` on attachment → API returns empty attachments.

---

## 6. Contract maintenance

| Document | Role | Change policy |
|----------|------|---------------|
| `MODULE_CONTRACT.v1.md` | API norm | **Frozen** — typos/clarifications only; new optional fields OK |
| `ARCHITECTURE.md` | Architecture principles | Update only for new principles, not API details |
| `LIVE_WIDGETS.md` | Widget fetch behavior | Operational |
| `PLATFORM_VERIFY.md` | Verify flow | Operational |

**To add `/module/widgets` to the contract table:** one PR, label `docs: non-breaking`, add row to §3 endpoint overview in `MODULE_CONTRACT.v1.md`.

---

## 7. Roadmap (architecture level)

```text
✅ Platform + Finance + Work + Contract v1 + Verify + Widgets + Work→Finance export
→ ARCHITECTURE.md freeze (this document)
→ MODULE_CONTRACT.v1.md — add /module/widgets row (non-breaking)
→ Booking Core pakke 1 (first module built only against frozen standard)
→ @platform/module-sdk (after Booking proves reuse)
→ Identity Core / SSO (last — does not block modules today)
```

**Booking Core pakke 1** = Supabase + booking domain + full Module Contract v1 (including `/module/widgets` when ready). Optional Finance/Work links later; not in pakke 1.

---

## 8. Adding a new module (summary)

1. New Supabase project + domain schema.
2. Implement Module Contract v1 endpoints.
3. Register in Platform `modules` seed (`slug`, `status`).
4. Document domain API separately from `/module/*`.
5. Platform: enable module on workspace → verify → dashboard widgets appear without Platform code changes.
6. Cross-module integration: direct API keys + `source_ref`, not Platform.

---

## 9. Glossary

| Term | Meaning |
|------|---------|
| `external_org_id` | Module's canonical org UUID in `module_connections` |
| `module_info_snapshot` | Cached `/module/info` (+ verify metadata) on connection |
| Verify key | API key with `platform:read` + `platform:verify`; Platform-only |
| Integration key | Module-owned key for domain APIs (e.g. `entries:write`) |
| Coordinator | Platform's role — map, verify, display, navigate |

---

*End of frozen architecture document.*
