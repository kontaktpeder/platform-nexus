# Relationship Engine v0 — Pakke 3 (Parser)

**Status**: Implementert. Bygger på Pakke 1 (skjema) og Pakke 2 (ingest).

## Pipeline

```
raw_signals(status='new')
        │
        ▼
  parseNewSignals()          ← src/lib/knowledge/parse-signals.server.ts
        │
        ▼
  parseSignal(signal, existing)   ← src/lib/knowledge/signal-parser-ai.server.ts
   (Lovable AI · gemini-3-flash-preview · Output.object)
        │
        ▼
  ┌── entity_suggestions (nye entiteter, koblet til raw_signal_id + owner_context)
  └── relation_suggestions (fra/til = eksisterende entity ELLER pending suggestion)
        │
        ▼
  raw_signals.status = 'parsed', parsed_at = now()
```

## Prinsipper

- **Kun review, aldri direkte skriv**: Parseren skriver kun til `entity_suggestions` og `relation_suggestions`. Ingen `entities`/`entity_relationships` blir opprettet uten godkjenning.
- **Anchor-kontekst**: AI foreslår `owner_context` (personal / peder-enk / gold-of-sicily / unknown). "unknown" lagres som `NULL` for å tvinge senere manuell zoning.
- **Reuse over duplication**: Eksisterende entiteter matches server-side på e-post → domene → `(navn, type)`. Match ⇒ ingen ny suggestion, men relasjonen peker på eksisterende entity.
- **Relasjons-refs**: AI returnerer `fromRef`/`toRef` som enten (a) `ref` på en entity den foreslår i samme kall, eller (b) `existing:<name>` som resolveres via `existingEntities`-navn. Andre refs droppes.
- **Best-effort batch**: Feil på én mail stopper aldri hele kjøringen — feilen legges i `errors[]` og neste signal parses.
- **Ingen fantasi**: `parseSignal` faller tilbake til `{entities:[], relations:[], summary:""}` ved manglende `LOVABLE_API_KEY`, tomt AI-svar eller malformed output. Vi lager aldri deterministiske "gjett" som suggestions.

## Kall

```ts
import { parseNewRawSignals } from "@/lib/parse-signals.functions";
const r = await parseNewRawSignals({ data: { limit: 20 } });
// { scanned, parsed, entitySuggestions, relationSuggestions, errors[] }
```

Kjøres etter `ingestRecentSignals`. Ingen UI-trigger enda; kan kobles til admin-knapp på `/knowledge` eller en cron-hook.

## Lagrede felter

`entity_suggestions` (utvidet i denne pakken):
- `raw_signal_id` — sporing tilbake til kilden
- `owner_context` — foreslått anker (nullable)
- `metadata.source_signal` — `{ id, source, summary }` for rask kontekst i review-UI
- `metadata.email` / `metadata.email_domain` / `metadata.slack_display_name` — brukes senere av entity-matcher (R1–R8)

`relation_suggestions`:
- `from_entity_id` / `to_entity_id` — fylles når begge sider finnes
- `from_suggestion_id` / `to_suggestion_id` — fylles når siden er en pending suggestion
- `confidence` (numeric 0..1), `reasoning`, `raw_signal_id`
- `status = 'pending'`

## Neste

Pakke 4 (Review UI på `/review`) godkjenner suggestions → oppgraderer til `entities` og setter `entity_relationships.status='confirmed'`.
