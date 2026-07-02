# Knowledge v2 — AI-assisted entity suggestions

**Status:** Implemented. Additive on top of Knowledge v0/v1. Never auto-creates entities.

## Goal

Propose new Knowledge entities from repeated unlinked Mission signals so the
user can approve them with one click. Manual links (v0) and deterministic
auto-link (v1) always win — v2 only fills the gap when no entity exists yet.

## Pipeline

```
Unlinked signals  →  deterministic clusters  →  AI suggestion  →  user approves  →  auto-link (v1) runs
```

1. `buildMissionSignalDescriptors(userId)` collects current Gmail + Slack
   inbox actions and workspace `ws:{orgSlug}` descriptors. Shared helper —
   also used by `getGlobalMissionData` auto-link pass.
2. `clusterUnlinkedSignals(descriptors, entities, opts)` groups signals
   whose v1 match is `null`. Skips signals already in `entity_signals`,
   suggestions with `status = ignored`, and currently snoozed suggestions.
3. `generateSuggestionsForClusters(clusters, entities)` sends **only**
   sanitized cluster metadata (sender, domain, channel, org, counts) to
   `google/gemini-3-flash-preview`. Falls back to a deterministic proposal
   if AI errors or `LOVABLE_API_KEY` is missing.
4. Pending suggestions are upserted into `public.entity_suggestions` and
   listed in the Knowledge UI under **Forslag**.
5. On accept: `createEntity` runs with the proposed name/type/metadata,
   then `autoLinkMissionSignals` links the cluster's `example_refs` to the
   new entity (via v1 deterministic rules).

## Cluster keys

| Kind             | Key format                              | Notes                                                   |
| ---------------- | --------------------------------------- | ------------------------------------------------------- |
| `gmail_domain`   | `gmail_domain:{domain}`                 | Skipped for consumer domains (gmail.com, outlook.com…). |
| `gmail_sender`   | `gmail_sender:{normalized sender name}` | Used when the domain is consumer/blocked.               |
| `slack_person`   | `slack_person:{normalized name}`        | DMs / mentions without a channel.                       |
| `slack_channel`  | `slack_channel:{normalized channel}`    | Mentions / channel messages.                            |
| `workspace_org`  | `workspace_org:{orgSlug}`               | One per org the user is a member of.                    |

Default threshold: `exampleCount >= 2` in the current descriptor batch.

Consumer-email blocklist: `gmail.com`, `googlemail.com`, `outlook.com`,
`hotmail.com`, `yahoo.com`, `yahoo.co.uk`, `icloud.com`, `me.com`, `live.com`,
`msn.com`, `aol.com`, `proton.me`, `protonmail.com`.

## `entity_suggestions` row

| Column           | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `suggestion_key` | Stable per-cluster id — enables upsert without duplicates.              |
| `proposed_type`  | `entity_type` enum: person / company / project / goal / commitment.     |
| `reason`         | Short human-readable justification (max 500 chars).                     |
| `confidence`     | `low` / `medium` / `high` (from AI or fallback).                        |
| `example_count`  | Number of signals in the cluster at scan time.                          |
| `status`         | `pending` → `accepted` / `ignored` / `snoozed`.                         |
| `snoozed_until`  | Timestamp when a snoozed suggestion becomes eligible again.             |
| `metadata`       | `{ cluster_kind, example_refs[≤10], suggested_metadata, hints }`. **No message bodies.** |

RLS: `auth.uid() = user_id` for all operations.

## Server functions

- `suggestKnowledgeEntities()` — runs the full pipeline and returns pending suggestions.
- `listEntitySuggestions({ status? })` — read-only listing.
- `acceptEntitySuggestion({ suggestionId })` — creates entity + auto-links example refs.
- `ignoreEntitySuggestion({ suggestionId })` — permanent (until manually cleared in a future release).
- `snoozeEntitySuggestion({ suggestionId, preset })` — `week` (default) or `month`.

## UI

`/knowledge` shows a **Forslag** section above the entity list with a
"Skann etter forslag" button. Each card exposes:

- Proposed name + type + confidence badge
- Reason and cluster-kind label
- Buttons: **Opprett**, **Ikke nå** (snooze 1 uke), **Ignorer**

Global Mission does not surface suggestions inline (deferred to v3).

## Safety

- Never send message bodies, subjects, or snippets to the model.
- Never auto-create entities — user approval is required.
- Never overwrite manual `entity_signals` rows.
- `metadata` on `entity_suggestions` contains only counts + identifiers.
- AI failures degrade to deterministic suggestions using cluster hints.

## v3 preview

- Commitments (`"du lovte å sende X fredag"`) — needs its own capture layer.
- Reasoning / conclusions layer on top of entities + signals.
- Inline suggestions in Mission.
