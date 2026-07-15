# Known Identities v0

**Status:** Implemented. Incremental layer between `raw_signals` and `entities`.

## Problem

`entity_suggestions` previously mixed two roles:

1. **Discovery** — "we saw an email address"
2. **Promotion** — "this contact is important enough to become knowledge"

That produced noisy suggestions and repeated AI proposals for the same sender.

## Model

```text
raw_signals
     ↓
known_identities   ← deterministic, persistent, auto-updated
     ↓
entity_suggestions ← promotion only (user review)
     ↓
entities           ← curated knowledge graph
```

### `known_identities`

One row = one stable external identity (`robin@restaurant.no`, Slack user `U07…`, domain `restaurant.no`).

- Upserted automatically during Gmail/Slack ingest
- `seen_count` / `last_seen_at` accumulate on every observation
- `entity_id` set only after user links or promotes — never by AI
- `ignored_at` suppresses promotion suggestions

### `signal_identities`

Many-to-many between `raw_signals` and `known_identities` with an `identity_role`:

`sender | recipient | cc | mentioned | channel | domain | participant`

One signal can reference multiple identities (from, to, domain, Slack user, channel).

## Ingest pipeline

After `raw_signals` upsert (Gmail/Slack ingest):

1. Extract deterministic identifiers from signal metadata
2. Upsert `known_identities` (increment `seen_count`)
3. Insert `signal_identities`
4. If `known_identities.entity_id` is set → link signal via `entity_signals` (`raw_signal_id`)

No entity is created during ingest.

## Promotion

`syncPromotionSuggestions()` creates/updates `entity_suggestions` for unlinked identities with `seen_count >= 2`:

- `suggestion_key`: `identity:{uuid}`
- `known_identity_id`: FK to identity
- `suggestion_reason`: `frequent_contact`
- `reason`: human-readable ("Sett N ganger — klar for vurdering.")

Legacy cluster keys (`gmail_domain:…`, etc.) are backfilled to identities in the migration.

## Server functions

| Function | Purpose |
| -------- | ------- |
| `listKnownIdentities({ linked?, limit? })` | List observed identities |
| `linkIdentityToEntity({ identityId, entityId })` | Link + backfill signal links |
| `promoteIdentityToEntity({ identityId, type, name? })` | Create entity + link |
| `ignoreKnownIdentity({ identityId })` | Ignore identity + pending suggestions |
| `syncIdentityPromotions()` | Refresh promotion suggestions from identities |

## Auto-link (Mission)

`autoLinkMissionSignals` order:

1. Existing `entity_signals` (manual wins)
2. **Confirmed identity** (`known_identities.entity_id` via sender email / Slack channel)
3. Legacy heuristic matcher (`entity-matcher.ts` R1–R8)

## Mission display (future)

```text
entity.name ?? identity.display_name ?? identity.email ?? signal.sender
```

Mission does not require entities. Identities enrich display when linked.

## Migration

`20260715180000_known_identities.sql`:

- Creates tables + RLS
- Adds `known_identity_id`, `suggestion_reason` to `entity_suggestions`
- Backfills identities from legacy `suggestion_key` patterns

## Non-goals (v0)

- No AI identity extraction
- No automatic entity creation
- No merging email + domain into one identity row (kept separate)
- Slack DM identity resolution in Mission auto-link (needs user id in descriptors — future)

See also: `KNOWLEDGE.v2.md`, `RELATIONSHIP_ENGINE.v0-parser.md`
