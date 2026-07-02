# Platform Core — Understanding

Platform Core is being built in four layers. This document is the north star for how they compose. Only Layers 1–2 exist today.

## The four layers

```
Sensors  →  Knowledge  →  Reasoning  →  Mission
```

### 1. Sensors
Raw signals from the world. Modules (Finance, Work, Booking) plus inbox connectors (Gmail, Slack). Each signal is opaque metadata — never full fagdata copied into Platform.

### 2. Knowledge (this package)
Entity-centric model of the user's world: **Person, Company, Project, Goal, Commitment**. Signals get linked to entities so Platform understands *what* something is about, not just *where* it came from.

Rules:
- User-scoped. Every row belongs to `auth.uid()`.
- No fagdata: no email bodies, no invoice line items, no Slack threads.
- `snippet` capped at 160 chars.
- `external_ref` is an opaque pointer (`gmail:XXX`, `slack:dm:C123`, `orgSlug:wsSlug:finance:unpaid_invoices`).
- Manual linking in v0. Auto-extraction is v1+.

### 3. Reasoning (future)
Given Knowledge, derive conclusions: "Nordahl har ventet 3 dager på svar", "Gold of Sicily-prosjektet er blokkert av manglende faktura". This layer is **not** in this package.

### 4. Mission
The user surface. Today Mission shows raw sources ("1 Gmail unread"). Once Knowledge has a link, Mission can say "Nordahl trenger deg" instead. Full entity-first Mission redesign is v1 after Reasoning lands.

## Entities

| Type | Example | Purpose |
|---|---|---|
| Person | "Dennis" | Individual human |
| Company | "Nordahl Events" | Organization outside Platform |
| Project | "Gold of Sicily" | Something being worked on |
| Goal | "Ship v2" | Outcome the user wants |
| Commitment | "Respond to Nordahl by Friday" | Promise the user made |

## Non-goals

- Not a CRM. Platform is a coordinator; module data stays in modules.
- Not a graph DB. Postgres + `entity_relationships` table is enough for v0/v1.
- Not an AI package. AI belongs in Reasoning.
