# Knowledge v3 — Commitments

Detect, store and surface *promises* from Mission signals. Turns
"Jeg sender menyen på fredag" into a Mission reminder on Friday.

## Storage

Table: `public.user_commitments`

| Column | Purpose |
|---|---|
| `user_id` | Owner (RLS: `auth.uid() = user_id`) |
| `entity_id` | Optional Knowledge link |
| `source` | `gmail` \| `slack` \| `workspace` \| `manual` |
| `source_ref` | Opaque origin ref (`gmail:{id}`, `slack:...`). `UNIQUE (user_id, source_ref)` |
| `title` | Extracted summary (max 300). **Never raw message body.** |
| `due_date` | `date` (Europe/Oslo). Null = no specific day |
| `status` | `suggested` \| `open` \| `done` \| `dismissed` |
| `confidence` | `low` \| `medium` \| `high` |
| `reason` | Short AI explanation (max 500) |
| `metadata` | `{ detected_phrase?, timezone: 'Europe/Oslo' }` — no full body |

## Lifecycle

```
Signal (snippet) → AI detect → suggested
                    ↓ Godta / high+klar → open
                    ↓ due today/overdue → Mission
                    ↓ Ferdig → done
                    ↓ Avvis → dismissed (låst for source_ref)
```

## Auto-open rule

`status = 'open'` on detection only when:
- `confidence === 'high'`, AND
- `due_date` is set OR the detected phrase matches a clear first-person promise
  pattern (`I'll`, `will send`, `jeg sender`, `skal sende`, …).

All other detections stay `suggested` and require user approval.

## Mission visibility

`getGlobalMissionData` loads open commitments where
`due_date IS NULL OR due_date <= today (Europe/Oslo)`.

Priorities (`buildCommitmentActions`):

| State | Tier | Priority |
|---|---|---|
| Overdue (`due_date < today`) | `urgent` | 1 |
| Due today (`due_date = today`) | `important` | 2 |
| No date, status open | `later` | 4 |
| Future (`due_date > today`) | hidden | — |

## Safety

- Snippet is sent to AI at detect-time only; **never** persisted to DB.
- Low confidence → always `suggested`. Never auto-open.
- Re-scan never overwrites `open`/`done`/`dismissed` (upsert `ignoreDuplicates`).
- No auto-reply, no auto-send.

## APIs (`src/lib/knowledge-commitments.functions.ts`)

- `detectAndStoreCommitments` / `scanCommitments` — full detect + upsert pipeline
- `listCommitments({ status?[] })`
- `approveCommitment({ id, title?, dueDate?, entityId? })` — suggested → open
- `updateCommitment` / `linkCommitmentEntity`
- `markCommitmentDone` / `dismissCommitment`
- `commitmentMissionAction({ actionKey, action })` — helper for Mission triage

`executeMissionAction` intercepts keys `commitment:{id}` and routes
`handled_locally → done`, `dismiss → dismissed`.

## Next: Reasoning v0

Commitments feed the reasoning layer as entity context:

```json
{
  "entity": "Nordahl Events",
  "commitments": [{ "title": "Send menu", "due": "2026-07-04", "status": "open" }]
}
```
