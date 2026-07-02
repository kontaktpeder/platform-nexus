# Knowledge v1 — Automatic entity matching

Status: **Active** (additive on top of `KNOWLEDGE.v0.md`).

Knowledge v1 links Mission signals (Gmail, Slack, Workspace actions) to
existing Knowledge entities automatically, using deterministic rules only.
No AI, no fuzzy matching, no auto-creation of entities.

## Precedence

1. **Manual wins.** If an `entity_signals` row already exists for
   `(user_id, external_ref)`, it is never overwritten by auto-link.
   `linkSignalToEntity` server fn always sets `link_source = 'manual'`.
2. **Auto only fills gaps.** New Mission signals with no existing row are
   evaluated. On a single-entity match, we upsert with
   `link_source = 'auto'`.
3. **Ambiguity = no link.** If a rule matches 2+ entities, we return
   `null` and stop.

## Match rules

Rules run in order per source, stopping at the first rule that yields
**exactly one** match. Comparisons use `normalizeName()` — lowercase,
Unicode-fold, strip punctuation, collapse whitespace. Domains and slugs
are compared lowercased.

### Gmail

| Rule | Entity type | Match |
| --- | --- | --- |
| R1 | company     | `metadata.email_domain` == sender email domain |
| R2 | company     | Domain root (label before first dot) == `normalizeName(name)` or `slug` |
| R3 | person      | `normalizeName(sender display)` == `normalizeName(name)` |
| R4 | person      | `metadata.email` == sender email (exact) |

### Slack

| Rule | Entity type | Match |
| --- | --- | --- |
| R5 | person             | `normalizeName(sender)` == `normalizeName(name)` or `metadata.slack_display_name` |
| R6 | project or company | `normalizeChannelName(channel)` == `normalizeName(name)` or `slug` (mentions only) |

### Workspace actions

Action key format: `{orgSlug}:{wsSlug}:{module}:{widget}`.

| Rule | Entity type | Match |
| --- | --- | --- |
| R7 | project             | `metadata.platform_org_slug` == `orgSlug` (exact) |
| R8 | company or project  | `normalizeName(orgName)` == `normalizeName(name)` |

## Metadata conventions

No schema change. Add these keys to `entities.metadata` when you want a
match:

- **person**: `email`, `slack_display_name`
- **company**: `email_domain`
- **project**: `platform_org_slug`, `platform_workspace_id`

## Storage

`entity_signals.link_source` (`text NOT NULL DEFAULT 'manual'`) with a
`CHECK (link_source IN ('manual','auto'))`. Existing rows backfill to
`manual`.

Auto-linked rows are still user-visible in `/knowledge` and can be
unlinked manually. When a user unlinks an auto row, the next Mission
fetch may re-auto-link it unless the entity metadata changes. There is no
"do not auto-link" flag in v1.

## Not in v1

- Fuzzy matching (Levenshtein, token overlap).
- AI / LLM matching.
- Auto-creating new entities.
- Cross-signal aggregation (v2: "Nordahl trenger deg" summary).
- Rejection memory ("this signal is not Nordahl, don't ask again").
