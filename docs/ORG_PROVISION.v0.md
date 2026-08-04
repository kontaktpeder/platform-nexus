# Org provision v0 — Nexus × cores

**Status:** Working product standard  
**Goal:** Customer types a name, checks cores, gets a working stack — without pasting UUIDs and API keys.  
**Related:** [ORG_CREATE.md](./ORG_CREATE.md), [PLATFORM_VERIFY.md](./PLATFORM_VERIFY.md), [MODULE_CONTRACT.v1.md](./MODULE_CONTRACT.v1.md), [DESK_SIGNAL_CONTRACT.v0.md](./DESK_SIGNAL_CONTRACT.v0.md)

> Breaking UX/API for provision → `ORG_PROVISION.v1.md`. Clarifications stay in v0.

---

## 1. Problem

Cores (Finance, Work, Control, …) each own their own organizations. Nexus maps
`module_connections` **per Nexus org + workspace → one external org**.

Without clear UI, “Finance is connected” can mean **one** of five Nexus orgs.
Desk/Mission then only see invoices for that one org.

Manual path today (still valid for power users):

```text
For each Nexus org × each core:
  enable module → paste external_org_id + base URL + API key → verify
```

That does not scale for customers with 3 companies × 5 cores.

---

## 2. Product rule

| Rule | Meaning |
|------|---------|
| **One Nexus org = one company identity** | Gold of Sicily, Holding, ENK, Privat are separate Nexus orgs |
| **Checkboxes = which cores that company gets** | Finance / Work / Control / … |
| **Happy path never asks for UUID/key** | Platform provisions or links server-side |
| **Advanced escape hatch** | “Link existing Finance org” for migration |

Under the hood there are still N×M connection rows. The user must not feel that.

---

## 3. Two tracks

### Track A — Cover existing orgs (now)

Orgs already exist in Finance/Work. Nexus must **show coverage** and make linking
per company one click away.

| Requirement | Behavior |
|-------------|----------|
| Coverage | Per core: `k av n organisasjoner koblet` |
| Status | `connected` only when **all** membership orgs that should use the core are linked; otherwise `partial` |
| Gaps | Name missing orgs with deep link to that org’s Moduler page |
| Desk | Still only pulls signals for orgs with `module_connections.status = connected` |

UI lives in Modules overview (`getUserModulesOverview` / `ModulesOverview`).

### Track B — Provision from Nexus (customers)

```text
Navn: Gold of Sicily
[x] Finance  [x] Work  [x] Control
→ Opprett
```

Platform (server):

1. Create Nexus org + default workspace ([ORG_CREATE.md](./ORG_CREATE.md))
2. For each checked core: call module **provision** API (new, not in contract v1 yet)
3. Store `module_connections` as `connected` with secrets — no paste step

**Blocked on:** optional module endpoint, e.g.

```http
POST /api/public/v1/module/organization
Authorization: Bearer <platform_provision_key>
{ "name": "Gold of Sicily", "external_ref": "nexus:org:…" }
→ { "id", "name", "api_keys": { "platform:read", "invoices:read", … } }
```

Until modules expose this, Track B is design-only. Contract change → document in
`MODULE_CONTRACT` optional section or v1.x addendum (non-breaking if optional).

---

## 4. What “connected” means

| Layer | Connected means |
|-------|-----------------|
| Overview badge (v0 Track A) | Coverage across **all** user membership orgs for that core |
| Single workspace Moduler page | That workspace’s `module_connections` row |
| Desk / Mission finance signals | Per-org resolve + `invoices:read` (or verify key that can list invoices) |

Never imply “platform-wide Finance OK” from a single org link.

---

## 5. Customer journey (target)

```text
New customer
  → Create company in Nexus (name + cores)
  → Track B provision
  → Desk already sees that company’s signals

Existing multi-company user (you)
  → Modules overview shows “2 av 5 orger koblet”
  → Click missing org → verify existing Finance org (Track A)
  → Repeat until coverage complete
```

---

## 6. Out of scope (v0)

- Auto-creating sibling orgs because names “look similar”
- Sharing one Finance API key across multiple Nexus orgs
- Replacing Identity / SSO ([IDENTITY_CORE.md](./IDENTITY_CORE.md))
- Changing frozen [MODULE_CONTRACT.v1.md](./MODULE_CONTRACT.v1.md) required endpoints in this doc

---

## 7. Implementation pointers

| Piece | Location |
|-------|----------|
| Nexus-only org create | `organization.functions.ts`, [ORG_CREATE.md](./ORG_CREATE.md) |
| Manual verify | [PLATFORM_VERIFY.md](./PLATFORM_VERIFY.md), `ModuleConnectionPanel` |
| Coverage UI | `modules-overview.functions.ts`, `ModulesOverview.tsx` |
| Desk finance per org | `signal-gather.server.ts` → `resolveFinanceConnection` |
| Future provision API | Module repos + contract addendum |
