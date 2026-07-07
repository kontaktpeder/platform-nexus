# Module Contract v1.1 — Alerts (additive)

**Status:** Additive, non-breaking. `MODULE_CONTRACT.v1.md` is frozen and
remains authoritative for all v1 endpoints. v1.1 documents optional new
endpoints Platform Core consumes but never requires.

## Motivation

Platform Core must not hardcode module-specific rules (e.g. "unpaid_invoices
> 0 → Review invoices"). Modules know their own domain — Finance knows what
counts as urgent, Work knows what "needs review" means. Platform only needs a
generic action feed it can render in Mission.

## Endpoints

### `GET /api/public/v1/module/alerts` — optional

Returns actionable items the module wants surfaced in Mission. A module that
does not implement this endpoint returns **404**; Platform treats that as an
empty alert list (no crash, no error toast).

**Auth:** `Authorization: Bearer <api_key>` with `platform:read` scope
(same key already used for `/module/widgets`).

**Response**

```json
{
  "contract_version": "1.0",
  "alerts": [
    {
      "id": "invoice-1234-missing-attachment",
      "severity": "warning",
      "title": "Faktura #1234 mangler bilag",
      "description": "Bokføring krever bilag før månedsavslutning.",
      "action_url": "https://finance.example.com/orgs/…/invoices/1234",
      "priority": 2,
      "source_module": "finance"
    }
  ]
}
```

`contract_version` stays at `"1.0"` — the alerts endpoint is additive to
v1, not a new contract version.

### Field semantics

| Field           | Required | Notes                                                            |
| --------------- | -------- | ---------------------------------------------------------------- |
| `id`            | yes      | Stable per alert. Used as dedupe key `{module_slug}:{id}`.       |
| `severity`      | yes      | `critical` \| `warning` \| `info`.                               |
| `title`         | yes      | Short, human-readable. Platform renders verbatim.                |
| `description`   | no       | One-liner. Platform renders verbatim.                            |
| `action_url`    | no       | Absolute URL. Platform opens in a new tab.                       |
| `priority`      | yes      | Integer. **Lower = higher priority.**                            |
| `source_module` | yes      | Module slug (e.g. `"finance"`). Must equal the module's own slug.|

Platform does not translate, reword, or aggregate alerts — the module owns
the wording. Platform Core stores no alert data server-side; alerts are
fetched live per Mission render.

## Platform consumption rules

1. **Sorting**: `critical` before `warning` before `info`; then `priority`
   ascending; then `title` alphabetical.
2. **Deep link**: prefer `alert.action_url`; fall back to the connection's
   resolved org-home URL if absent.
3. **Failure**: if `/module/alerts` fails (5xx, timeout, TLS), Platform
   surfaces **nothing** for that module and logs the error. It does **not**
   render a false "all clear" state.
4. **Missing endpoint (404)**: treated as "no alerts right now".
5. **Contract version mismatch**: alert list ignored, error logged.

## Removed hardcoded rules

With v1.1 alerts in place, Platform's `mission-actions.ts` no longer contains
finance/work-specific action rules (`unpaid_invoices`, `today_hours`,
`active_projects`). Those actionable cards must now come from the module's
own `/module/alerts` response. Info-only widget cards (e.g. `month_revenue`)
remain as a transitional fallback until each module publishes alerts.

## Related — `/module/confidence` (module-specific)

Finance currently exposes `GET /api/public/v1/module/confidence` for its own
internal use. This is **not** a Platform-consumed endpoint in v1.1; Platform
only reads `/module/alerts`. If a future generic health/confidence signal is
needed across modules, it will be specified as a separate additive endpoint
in a later revision.
