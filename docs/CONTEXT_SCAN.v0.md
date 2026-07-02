# Context Scan v0

> **Status:** Active — added on top of Knowledge v0–v3.
> **Goal:** Turn the signals we already have into a short, calm understanding
> the AI briefing (and the user) can lean on. No new module crawling.

## What it is

A user-triggered scan that produces small **context cards** — one global
overview and one per Knowledge entity — stored in `public.context_summaries`.

Each card holds:
- `summary` (2–6 sentences, ≤1200 chars)
- `key_facts[]` (≤12 bullets)
- `open_questions[]` (honest gaps)
- `suggested_next_focus` (optional, ≤300 chars)
- `source_counts` (metadata only — counts of signals/commitments/widgets/…)

## What goes in

Everything is **sanitized before AI sees it**. The scan reads only Platform
tables and existing HTTP widget endpoints; it never touches Finance/Work/etc.
databases.

Sources per bundle:
- `entities`, `entity_relationships`, `entity_signals`
- `user_commitments` (open + suggested)
- `mission_action_states` (dismissed/snoozed counts, last 7d)
- `workspace_widgets` display strings via `fetchWorkspaceWidgetData` (HTTP, existing)

Entity bundles include up to 10 recent signals (with snippets ≤160 chars only
when the total signal count is ≤10), up to 5 open commitments, up to 10
relationships, and widget displays for `metadata.platform_org_slug` matches.

Global bundle includes entity counts by type, top 5 open commitments, 7-day
signal count, action-state rollups, and workspace widget rollup.

Bundles with fewer than 2 facts and no signals/relationships are marked
`insufficient` → the AI is skipped and a deterministic "Not enough history
yet" summary is stored.

## What stays out

- Raw Gmail/Slack bodies (beyond short snippets already in `entity_signals`)
- Any module SQL — Finance/Work/Booking/Content are never queried directly
- IDs beyond entity names/slugs
- Full message content, URLs, secrets, PII beyond what is already in inputs

## How it runs

- **On demand.** User clicks "Kjør context scan" on `/knowledge`, or "Oppdater
  kontekst" in the Mission ContextPanel.
- **Never on every request.** `getGlobalMissionData` does not trigger a scan.
- **Model:** `google/gemini-3-flash-preview` via `createLovableAiGatewayProvider`.
- **Fallback:** if AI fails or `LOVABLE_API_KEY` is missing, a deterministic
  template summary from the bundle is stored instead.
- **Upsert key:** `(user_id, scope_type, scope_ref, entity_id)`.

## Mission integration

`mission.tsx` loads the latest global summary + the featured action's entity
summary (if any) via `getLatestGlobalSummary` / `getContextForEntity`, and:

1. Passes an optional `context` object to `generateMissionBriefing` so the AI
   can weave in **one sentence** of prior understanding.
2. Renders `ContextPanel` above the featured action when at least one summary
   exists. The panel is collapsed by default on mobile and offers "Oppdater
   kontekst" (runs `runContextScan`).

The briefing prompt is hard-constrained: context enriches, it never replaces
or contradicts action cards.

## Server functions

- `runContextScan` — builds bundles, synthesizes summaries, upserts rows.
- `listContextSummaries({ scopeType?, entityId?, limit? })`
- `getLatestGlobalSummary()`
- `getContextForEntity({ entityId | slug })`

All require `requireSupabaseAuth`; RLS scopes to `auth.uid()`.

## Not in v0 / roadmap

| Later | What it adds |
|-------|--------------|
| **Reasoning v0** | Turns context + actions into conclusions rendered as Mission cards. |
| **`/module/context`** | Modules expose their own history facts via HTTP so context includes real Finance/Work data. |
| **Auto-scan** | Scheduled scans (e.g. weekly) instead of on-demand only. |

## Safety rules

- No cross-module SQL.
- No raw Gmail/Slack bodies in `context_summaries`; snippets only exist inside
  the AI input at scan time and are dropped from the row.
- `key_facts` and `summary` are derived text only.
- The AI must not invent module data not present in the bundle — see the
  system prompt in `src/lib/context/context-scan-ai.server.ts`.
