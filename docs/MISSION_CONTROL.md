# Mission Control

Workspace-indeksen (`/o/$orgSlug/w/$wsSlug`) er "Mission Control" — startsiden
for arbeidsdagen. Platform Core hjelper deg å komme i gang; modulene gjør selve
jobben.

## Layout

1. **MissionHeader** — hilsen etter Europe/Oslo-tid, dato, org + workspace.
2. **WorkspaceContextBar** — kompakt kontekstrad med antall koblede moduler.
3. **NextActions** — inntil 3 handlingskort utledet fra live widget-data.
4. **MissionWidgetsGrid** — full oversikt via `WidgetSlot` (uendret).

## Datakilde

Ingen ny datavei. `getWorkspaceWidgetData` er fortsatt eneste kilde.
`buildNextActions()` leser samme kart (`{moduleSlug}:{widgetId}`) og bygger
handlinger deklarativt.

## Handlingsregler

Regler ligger i `src/lib/mission-actions.ts` — ikke i verify-laget, ikke i
modul-kontrakten. Legg til nye ved å utvide `RULES`-arrayet med
`moduleSlug`, `widgetId`, prioritet og `build(display)`.

Standardregler:

- `finance:unpaid_invoices > 0` → "Review unpaid invoices" (prio 1)
- `work:today_hours > 0` → "Review today's logged hours" (prio 2)
- `work:active_projects > 0` → "Open active projects" (prio 3)
- `finance:month_revenue` → info-kort (droppes hvis 3 handlinger fyller slotene)

Href utledes via `resolveWidgetHref()` — samme som widgets.

## Siste arbeidsflate

`src/lib/last-workspace.ts` husker siste org+ws i `localStorage`
(`platform:lastOrgSlug`, `platform:lastWsSlug`). `/` og `/auth` sender
brukeren rett til Mission Control ved neste innlogging. Ny org ➜ Mission
Control for det nye workspace-et.
