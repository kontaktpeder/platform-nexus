# Relationship Workspace v0

**Beslutning:** Platform Core følger **C — Relasjonsdrevet arbeidsflate**, med **A** som prioritering på Mission-forsiden.

## Produktspørsmål

Mission spør ikke først «hvilke oppgaver har du?».

Den spør:

> Hvem trenger noe fra deg nå, hvorfor, og hva er neste gode handling?

## Informasjonsarkitektur

```
Person | Selskap  →  relasjon  →  historikk  →  signaler  →  neste handling  →  systemdata
```

| Lag | Eier | Regel |
|---|---|---|
| IA (C) | Entity (person/company) | Relasjonen eier kortet |
| Prioritet (A) | Mission «Start her» | Én hovedhandling først |
| Kilde | Metadata | «fra Gmail» — aldri seksjonstittel |

### Mission-seksjoner (v0)

1. **Start her** — én anbefalt relasjon + konkret handling  
2. **Trenger oppfølging** — relasjoner som venter på deg  
3. **Kommende** — planlagt oppfølging / avtaler  
4. **Uavklart** — ukjent avsender, AI-forslag uten entity  
5. **System** — integrasjonsfeil, avvik uten kontakt  

Ikke: Gmail / Slack / AI / Finance som hovedseksjoner.

### Identitet uten duplikat

- Én person = én `entities` rad (`type: person`)
- Flere roller = `entity_relationships` (`member_of`, `customer_of`, `works_on`, …)
- Org = `owner_context` (`personal` | `peder-enk` | `gold-of-sicily` | `unknown`)
- Ny e-post/Slack-ID → `known_identities` → link til eksisterende entity, aldri ny «Maria»

## Anti-CRM

Relasjonssiden skal hjelpe deg å huske mennesker, ikke bare selge:

- hva dere snakket om sist  
- hva personen bryr seg om  
- hva du har lovet  
- hvem som venter på hvem  
- hvordan dere kjenner hverandre  

Ikke primært: pipeline %, deal value, sannsynlighet.

## Designsystem (komponenter)

| Komponent | Formål |
|---|---|
| `RelationAvatar` | Ansikt / selskapsmerke — initialer + soft hue som fallback |
| `OwnerContextChip` | Gold of Sicily · Peder ENK · Personlig |
| `RelationStatusBadge` | Venter på meg / dem · Neste snart · Stille · Ny |
| `RelationCard` | Liste- og Mission-kort (relasjonen eier) |
| `StartHereBlock` | Stor featured RelationCard |
| `TimelineEvent` | Historikk-rad med diskret kilde |
| `NextStepPanel` | Anbefalt handling + planlegg |
| `AiHint` / `ConfirmedFact` | Foreslått vs bekreftet |
| `RelationQuickActions` | Svar · Logg · Planlegg · Åpne |

## Relasjonsside (Kontakter)

Mobil-first stacked sections (tabs senere):

1. Oversikt — neste steg, om, status, org  
2. Historikk — samlet tidslinje  
3. Oppfølging — planlegg + Felt  
4. Relasjoner — personer/selskaper uten duplikat  
5. Notater (v0.1)

## Payload-retning

`MorningMissionItem` får valgfrie relasjonsfelt (`entity_id`, `entity_type`, `relation_status`, …).  
Ny valgfri `payload.relations` kan etter hvert erstatte kilde-gruppering.  
UI projiserer legacy `today`/`waiting` til relasjonskort til AI-briefen returnerer entity-lenker.

## Filplassering

- Typer: `src/lib/relation/`
- UI: `src/components/platform/relation/`
- Dette dokumentet: `docs/RELATIONSHIP_WORKSPACE.v0.md`
