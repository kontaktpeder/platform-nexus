# Context Scan v1 — Source of Truth

**Supersedes** v0's `context-gather.server.ts` data source.

## Problem v0 had

1. **Widget numbers diverged from Mission.** v0 parsed widget map keys with `"."` while Mission uses `"work:today_hours"` (colon). Result: `0,0 timer` in a scan even when Mission showed `4 t`.
2. **Only entities with rows in `entities` got bundles.** People/projects visible only through Gmail/Slack `entityLinks` were ignored.
3. **No workspace-scoped summaries** even though the schema supports `scope_type = 'workspace'`.
4. **Reports read like DB dumps.** Prompt encouraged listing counters.

## v1 architecture

```text
loadMissionSnapshot(supabase, userId)          ← single source of truth
  ├─ workspaces (orgSlug, wsSlug, widgetData, modules)
  ├─ inbox (Gmail + Slack) + inboxMeta
  ├─ actionStates
  ├─ entityLinks (auto + manual)
  ├─ openCommitments
  ├─ globalActions (buildGlobalActions + buildCommitmentActions)
  └─ workspaceActions[`${orgSlug}/${wsSlug}`] (buildNextActions)

buildContextBundlesFromSnapshot(snapshot, supabase, userId)
  ├─ normalizeWidgetFactsFromSnapshot()        ← verbatim widget facts
  ├─ resolveActiveEntityIds()                  ← 30d occurred_at + links + commitments + actions
  ├─ Global bundle
  ├─ Workspace bundle per GlobalWorkspaceEntry
  └─ Entity bundle per active entity (dormant entities skipped)

synthesizeContextSummary(bundle)               ← nb-NO narrative, "ukjent" rule

upsert context_summaries { included_sources, fact_provenance, ... }
```

`getGlobalMissionData` now calls `loadMissionSnapshot` internally. Wire payload is unchanged for `/mission` (derived `globalActions`/`workspaceActions` are stripped before serialization).

## Hard rule: never invent a number

Both the AI prompt and the deterministic fallback obey this:

- Widget with `status = "ok"` and `displayValue` → use the exact string.
- Widget with `status = "error"` → say `"ukjent"` and cite the error note.
- Widget missing or empty → say `"ikke nok data"` — never `"0"`.

## Widget fact shape

```ts
ContextWidgetFact = {
  source: "widget";
  sourceRef: "gold-of-sicily:default:work:today_hours";
  orgSlug; orgName; wsSlug; wsName;
  moduleSlug: "work";
  widgetId: "today_hours";
  displayValue: "4.0 t" | null;
  extractedValue: 4 | null;
  status: "ok" | "error" | "unknown";
  note?: string | null;
  missionActionTitle?: string | null;
}
```

## Included sources / provenance

`context_summaries` gains two columns:

- `included_sources jsonb` — chips like `["gmail","work","commitments","mission"]`.
- `fact_provenance jsonb` — per-widget `{ sourceRef, displayValue, extractedValue, status }` used by the UI's dev toggle and by future Reasoning.

Only the AI/fallback fills `summary` and `key_facts`. Provenance is populated deterministically at upsert time.

## Active entity coverage

An entity is "active" if any of the following in the last 30 days:

- `entity_signals.occurred_at >= now() - 30d`
- open/suggested `user_commitments` reference it
- appears in current `entityLinks`
- appears in `snapshot.globalActions[*].entityId`

Dormant entities are silently skipped in v1 (no "ikke nok historikk" spam).

## Acceptance

1. `/mission` shows `4 t` Work → Context Scan reports the same string, never `0`.
2. Missing Work widget → `"ukjent"` / `"ikke nok data"`.
3. Workspace and entity coverage extends to Gmail/Slack-linked contacts.
4. `included_sources` chips render per card.
5. `/mission` behavior unchanged.

## Out of scope

- HTTP `/module/context` endpoints
- Reasoning v0 (turning conclusions into Mission cards)
- Auto-scan cron
- Persisting raw Gmail/Slack bodies
