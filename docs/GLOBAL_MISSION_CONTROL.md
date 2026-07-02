# Global Mission Control

Platform Core har to Mission-lag:

| Nivå | Rute | Spørsmål |
|------|------|----------|
| Global | `/mission` | Hva må Peder gjøre i dag — på tvers av alt? |
| Workspace | `/o/$orgSlug/w/$wsSlug` | Hva må gjøres for dette prosjektet? |

Login/`/`/`/auth` redirecter til `/mission`.

## Datavei

```text
/mission
  ↓
getGlobalMissionData (ServerFn, requireSupabaseAuth)
  ↓ memberships → orgs → workspaces
  ↓ per workspace: fetchWorkspaceWidgetData
  ↓ + fetchGmailActions()   ── connector gateway (server-only)
  ↓ + fetchSlackActions()   ── connector gateway (server-only)
  ↓
GlobalMissionData → buildGlobalActions({workspaces, inbox}) → filter → GlobalActionList
```

Alle fetch skjer server-side. Ingen tokens til klient.

## Kilder (v2)

- **Workspace**: modul-widgets via Module Contract v1 (uendret).
- **Gmail**: uleste + starred/important (siste 7 dager). Deep link til
  `https://mail.google.com/mail/u/0/#inbox/{id}`.
- **Slack**: DM-er med uleste + `<@me>`-omtaler. Deep link til
  `<team>/messages/{channel}` og `<team>/archives/{channel}/p{ts}`.

Ingen e-post- eller Slack-innhold lagres i Platform DB. Snippet vises kun i
minne per forespørsel og forsvinner ved refetch.

## Regler

Priority → tier:

- 1–2 → urgent
- 3–5 → important
- 6+ → later

Sortering: tier → priority. Maks 7 kort.

Kilde-priority:

| Kilde | Utløser | Priority |
|-------|---------|----------|
| Gmail | unread + IMPORTANT | 1 (urgent) |
| Slack | DM med uleste | 1 (urgent) |
| Slack | mention | 2 (urgent) |
| Workspace | modul-regel | 1–10 (arves) |
| Gmail | unread | 4 (important) |
| Gmail | starred | 5 (important) |

## Graceful degrade

- Uten Gmail-connector: `fetchGmailActions()` returnerer `[]`. Filter-chip
  viser tom-tilstand "Gmail is not connected."
- Uten Slack-connector: samme mønster.
- Gateway-feil per forespørsel svelges og logges bort; Mission viser
  resten uansett.

## Sikkerhet

- `GOOGLE_MAIL_API_KEY` og `SLACK_API_KEY` er server-only env vars
  (connector-gateway hemmeligheter). Aldri returnert til klient.
- Ingen tabeller i Platform for e-post/Slack-innhold.
- Alle inbox-fetch skjer i `getGlobalMissionData` med
  `requireSupabaseAuth` — kun autentiserte brukere kan trigge kall.

## Filterchips

`All`, `Gmail`, `Slack`, `Workspaces`. Hver chip viser antall aktive kort
i sin kategori.
