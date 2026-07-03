# Relationship Engine v0

**Status:** Planned. Only the anchor seed (Knowledge Anchors v0) is implemented.

## Anchors — Knowledge Anchors v0 (implemented)

Three fixed Knowledge entities per user, seeded idempotently so downstream
layers have concrete classification targets.

| Slug             | Type    | `owner_context`  | Rolle                          |
| ---------------- | ------- | ---------------- | ------------------------------ |
| `personal`       | project | `personal`       | Privat liv, personlig økonomi  |
| `peder-enk`      | company | `peder-enk`      | ENK — juridisk enhet           |
| `gold-of-sicily` | project | `gold-of-sicily` | Drift, catering, events        |

Rules:

- Slugs er reservert per bruker via `ANCHOR_SLUG_SET` — `createEntity`
  avviser reserverte slugs, `deleteEntity` avviser anker-rader.
- `entities.owner_context` er en enum (`personal | peder-enk | gold-of-sicily |
  unknown`, default `unknown`). Bare ankere har `owner_context ≠ 'unknown'` i v0.
- `metadata.is_anchor = true` merker anker-rader og hindres fra sletting selv
  om slug endres senere.
- `gold-of-sicily.metadata.platform_org_slug` fylles ved lookup mot
  `memberships` + `organizations`. Platform-organisasjoner opprettes
  **aldri** automatisk.
- Seeden kalles best-effort fra `loadMissionSnapshot` og eksplisitt via
  `ensureKnowledgeAnchors` ServerFn (UI-knapp «Oppdater koblinger»).

Kode:

- `src/lib/knowledge/anchors.ts` — definisjoner (client-safe).
- `src/lib/knowledge/anchor-entities.server.ts` — `ensureAnchorEntities`,
  `listAnchorEntitiesWithCounts`, org-lookup.
- `src/lib/knowledge-anchors.functions.ts` — ServerFns.
- `src/components/platform/knowledge/ContextAnchorsSection.tsx` — «Kontekster»-
  seksjonen øverst på `/knowledge`.

## Pipeline (TODO)

- `processSignal(signal)` — hent minne, matche/opprett aktør, klassifiser
  `owner_context` + `relationship_role`, oppdater signal/relasjoner.
- Deterministisk pre-pass (R1–R8 fra `entity-matcher.ts`) før AI-fallback.
- Batch-hook i `loadMissionSnapshot` med cap på nye signaler per request.

## Classification (TODO)

- `relationship_role` enum: `customer | lead | supplier | authority |
  colleague | partner | internal | personal | unknown`.
- `lifecycle_stage` enum: `new | active | waiting | dormant | archived`.
- AI (gemini-3-flash) med structured output, memory-snapshot som input,
  aldri rå Gmail-body over `snippet ≤ 160`.

## Mission integration (TODO)

- `GlobalMissionAction.relationshipLabel` — «Ny kundeforespørsel · Gold of
  Sicily».
- Context Scan grupperer aktive entiteter per `owner_context`.
