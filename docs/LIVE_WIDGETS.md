# Live Widgets

Platform Core henter live widget-data fra hver koblet modul via Module Contract v1.

## Flyt

1. Dashboard laster workspace-kontekst (modules + connections).
2. `getWorkspaceWidgetData` ServerFn kalles med `{ orgId, workspaceId }`.
3. For hver `module_connections` med `status = 'connected'`:
   - Widget-IDer hentes fra cachet `module_info_snapshot.widgets` (ekskl. placeholders).
   - Verify-nøkkel dekrypteres server-side.
   - `GET {base}/api/public/v1/module/widgets?ids=a,b,c` med `Authorization: Bearer <key>`.
4. Resultatene mappes til `{moduleSlug}:{widgetId}` og returneres til klienten.
5. `WidgetSlot` viser `display` når tilgjengelig, ellers loader / hint / feilstatus.

## Modul-kontrakt (respons-eksempel)

```json
{
  "contract_version": "1.0",
  "widgets": [
    { "id": "outstanding_invoices", "display": "kr 42 800", "status": "ok" },
    { "id": "revenue_mtd", "display": "kr 128 400" }
  ]
}
```

Felt utover `id` er valgfrie. `display` er en kort streng Platform viser direkte.

## Ytelse og feiltoleranse

- `staleTime` = 60s, ingen refetch on focus.
- Kall per modul kjører parallelt.
- Verify-nøkkel forlater aldri serveren.
- Hvis en modul feiler: dens widgets får `error`-felt; øvrige moduler påvirkes ikke.
- Ved feil beholder `WidgetSlot` hint-teksten (graceful degrade).

## Ingen modul-spesifikk logikk

Platform har ingen `if (slug === "finance")`. Nye moduler får live widgets
automatisk ved å implementere `/module/widgets` og liste widget-IDer i
`/module/info`.
