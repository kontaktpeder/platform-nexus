# Knowledge v0 — Platform Core

Layer 2 of the Sensors → Knowledge → Reasoning → Mission stack. See `docs/UNDERSTANDING.md` for context.

## Schema

### Enums
- `entity_type`: `person | company | project | goal | commitment`
- `entity_relationship_kind`: `works_on | customer_of | member_of | owns | blocked_by | related_to`

### Tables

**`entities`** — one row per thing the user cares about.
- Domain fields: `type`, `name`, `slug` (unique per user), `importance` (0–100), `summary` (short rolling text), `last_seen_at`, `metadata` (jsonb).
- `metadata` optional keys: `platform_org_id`, `platform_org_slug`, `platform_workspace_id`, `email_domain`, `external_ref`.

**`entity_relationships`** — directed edges between entities.
- Fields: `from_entity_id`, `to_entity_id`, `kind`, `metadata`.
- Unique on `(user_id, from_entity_id, to_entity_id, kind)`. Self-edges forbidden.

**`entity_signals`** — signals that were linked to an entity.
- Fields: `entity_id`, `source`, `signal_type`, `external_ref`, `occurred_at`, `snippet`.
- Unique on `(user_id, external_ref)` — re-linking updates the row.
- `snippet` capped at 160 chars via CHECK constraint.

### RLS
All three tables use the same policy: `auth.uid() = user_id` for `FOR ALL` (read + write). Enforced at the row level.

## API (ServerFns, `requireSupabaseAuth`)

Exposed from `src/lib/knowledge.functions.ts`:

- `listEntities({ type? })`
- `getEntity({ id?, slug? })`
- `createEntity({ type, name, importance?, summary?, metadata? })`
- `updateEntity({ id, name?, summary?, importance?, metadata?, lastSeenAt? })`
- `deleteEntity({ id })`
- `listRelationships({ entityId? })`
- `createRelationship({ fromEntityId, toEntityId, kind })`
- `deleteRelationship({ id })`
- `linkSignalToEntity({ entityId, source, signalType, externalRef, occurredAt?, snippet? })` — upsert on `external_ref`
- `unlinkSignal({ externalRef })`
- `listSignalsForEntity({ entityId, limit? })`
- `getEntityGraph({ rootEntityId? })` — BFS depth ≤ 2, ≤ 50 nodes, includes recent signals

Only `seedKnowledgeDemo` mutates data as a side-effect of a dev-only convenience; production migrations never seed entities.

## Limits

- `snippet` ≤ 160 chars (DB CHECK).
- `summary` intended ≤ 500 chars (enforced client-side; DB allows longer to avoid future migration).
- Graph fan-out capped at 50 nodes per `getEntityGraph`.
- No AI extraction in this package.

## Mission integration (light touch)

`getGlobalMissionData` enriches each `GlobalMissionAction` with `entityId`, `entityName`, `entitySlug` when the action's key matches a linked `entity_signals.external_ref`. `FeaturedActionCard` shows the entity name above the title when available. No layout redesign in v0.

## Out of scope

- AI conclusions / Reasoning layer
- Auto-linking from email `From:` domain
- Goals prioritization pipeline
- Finance `/module/insights`
- Neo4j / dedicated graph DB
- Entity-first Mission UI redesign
