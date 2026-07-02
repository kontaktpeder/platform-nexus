# Mission Actions v1

**Status:** Implemented — Platform Core (`platform-nexus`)

Global Mission at `/mission` supports in-place triage without Platform Core
owning any module fagdata (business data).

## Boundary — Mission metadata vs fagdata

Platform Core owns only **mission metadata** in `mission_action_states`:

| Column          | Purpose                                              |
| --------------- | ---------------------------------------------------- |
| `action_key`    | Opaque key from `GlobalMissionAction.key`            |
| `status`        | `dismissed` \| `snoozed` \| `handled_locally`        |
| `snoozed_until` | Timestamp when snooze expires (nullable)             |

Platform Core **never** stores:

- Email body, subject text, or attachments
- Slack message text, thread contents
- Finance invoice amounts, Work task titles, or any other module payloads

Fagdata stays in the source system. Mission simply hides or surfaces the
action based on the user's own metadata.

## Sources

### Gmail (server-side only)

Real mutations against Gmail:

- **Mark read** → `POST /users/me/messages/:id/modify` with `removeLabelIds: ["UNREAD"]`
- **Archive** → `POST /users/me/messages/:id/modify` with `removeLabelIds: ["INBOX", "UNREAD"]`

Executed in `src/lib/inbox/gmail.server.ts` via the same connector gateway
used for reads. Tokens never reach the browser.

### Slack (v1 = local only)

Slack write-back APIs are **not** implemented in v1. "Mark handled" writes
`handled_locally` to `mission_action_states` — the Slack message itself is
untouched.

### Workspaces (Finance / Work / other modules)

Modules remain **open-only** in v1. No module write endpoints exist in
`MODULE_CONTRACT.v1`. Users can:

- Open the module (deep link)
- Snooze the action (Platform metadata)
- Dismiss the action (Platform metadata)

Mark-read and archive are rejected server-side for non-Gmail sources.

## Snooze presets (Europe/Oslo)

| Preset         | Resolves to                                    |
| -------------- | ---------------------------------------------- |
| `later_today` | Today 17:00 Oslo — or `now + 4h` if past 17:00 |
| `tomorrow`     | Next day 09:00 Oslo                            |
| `next_week`    | Next Monday 09:00 Oslo                         |

Computed in `src/lib/mission-snooze.ts` — pure helpers, no DB.

## Undo semantics

Every triage action shows a toast with an **Undo** button (~7s). Undo calls
`undoMissionAction` which removes the `mission_action_states` row, restoring
the card to the Mission list on the next refetch.

**Important:** Undo restores *Mission visibility only*. Gmail mark-read and
archive are permanent Gmail-side in v1 — undo cannot un-read or un-archive
the underlying Gmail message. Toast copy therefore says
"Restored to Mission list" rather than "Marked unread".

## Data flow

```
Mission UI
  → executeMissionAction (ServerFn, requireSupabaseAuth)
      ├─ gmail:*  → gmail.server.ts → Gmail API
      ├─ slack:*  → mission_action_states (handled_locally / snooze / dismiss)
      └─ workspace → mission_action_states (snooze / dismiss)
```

`getGlobalMissionData` bundles `actionStates` alongside `workspaces` and
`inbox` so the UI can filter in one round trip via `filterVisibleActions`.

## Not in v1

- Reply / compose / draft
- Slack reactions or mark-as-read
- Finance / Work write actions (waits on Module Contract action endpoints)
- Bulk triage
