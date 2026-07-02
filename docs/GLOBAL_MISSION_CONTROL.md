# Global Mission Control

Platform Core har to Mission-lag:

| Nivå | Rute | Spørsmål |
|------|------|----------|
| Global | `/mission` | Hva må Peder gjøre i dag — på tvers av alt? |
| Workspace | `/o/$orgSlug/w/$wsSlug` | Hva må gjøres for dette prosjektet? |

Login/`/`/`/auth` redirecter til `/mission`. `last-workspace.ts` beholdes for
context når du går inn i et prosjekt, ikke for login-redirect.

## Datavei

```text
/mission
  ↓
getGlobalMissionData (ServerFn, requireSupabaseAuth)
  ↓ memberships → orgs
  ↓ workspaces per org
  ↓ per workspace: fetchWorkspaceWidgetData (delt helper i widget-data.server.ts)
  ↓
GlobalMissionData → buildGlobalActions() → filter → GlobalActionList
```

`getWorkspaceWidgetData` (workspace-fn) og `getGlobalMissionData` bruker
samme `fetchWorkspaceWidgetData`-helper. Ingen dobbelt implementasjon,
ingen klient-side N-kall.

## Regler

`buildGlobalActions` gjenbruker `buildNextActions` + `RULES` fra
`mission-actions.ts`. Global tag hver action med `orgSlug`/`wsSlug`, prefix
key, og mapper priority → tier:

- 1–2 → urgent
- 3–5 → important
- 6+ → later

Sortering: tier → priority → orgName. Maks 7. Handlinger foretrekkes over
info-kort.

## Ingen fagdata i Platform

Platform har fortsatt ingen tabeller for fakturaer, timer eller bookinger.
Alt kommer fra modul-widgets over Module Contract v1. Nye moduler blir
automatisk synlige i global Mission så snart de deklarerer widgets med
kjente IDer i sitt `/module/info`.

## Fremtidige connectors (utenfor v1)

- Personlig lag: Gmail-inbox-triage, kalender, Todoist/Linear
- Team lag: chatteam-varsler, deadlines
- Regelmotor v2: brukerdefinerte terskler, snooze, skip

Disse ligger ikke i platform-nexus i dag; hvis de kommer, holder de seg til
samme kontrakt (widget-lignende `/module/*`-endepunkter).
