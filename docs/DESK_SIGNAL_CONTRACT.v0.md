# Desk Signal Contract v0 — Nexus × modul

**Status:** Working standard (Gmail + Finance Desk Kø are reference implementations)  
**Scope:** How a module/source cooperates with Nexus Desk, Kø, and Fortell — not SSO/verify  
**Related:** [MODULE_CONTRACT.v1.md](./MODULE_CONTRACT.v1.md) (kobling), [MISSION_ACTIONS.v1.md](./MISSION_ACTIONS.v1.md) (Mission triage), [CONTROL_HANDOFF.v0.md](./CONTROL_HANDOFF.v0.md) (Fortell → avtaler)

> Breaking changes → `DESK_SIGNAL_CONTRACT.v1.md`. Clarifications and new optional fields stay in v0.

---

## 1. Roles

| Layer | Owns | Does not own |
|-------|------|----------------|
| **Nexus** | Glance, kø, intensjon, kontakt, oppfølging, soft lane-hints for AI | Full modul-fagdata, sending/signing/archive i modulen |
| **Modul / kilde** | Sannhet for domenet (Gmail, Control-avtale, Field-oppfølging) | Nexus-kø-UI, kontaktgraf |

**Prinsipp:** Nexus er inngang og triage. Modulen er der arbeidet fullføres og lagres.

```text
Modul/kilde  →  signaler (fakta + lane + href)
             →  Desk-kort (like handlingslag)
             →  AI (intent/nextStep, myke hints)
             →  side effects / deep link tilbake til modul
```

---

## 2. Signal shape (konsept)

Hver kilde som skal inn i Desk/Kø leverer signaler som mapper til `DeskQueueItem`
(se `src/lib/desk-queue.types.ts`). Obligatorisk konseptuelt:

| Felt | Krav | Betydning |
|------|------|-----------|
| `id` | Ja | Stabil, namespaced (`gmail:…`, `control:…`, `field:…`) |
| `source` | Ja | `gmail` \| `finance` \| `work` \| `field` \| … |
| `kind` | Ja | `mail` \| `follow_up` \| `appointment` \| `signal` \| … |
| `title` | Ja | Rå fakta (emne, avtale-tittel) — ikke AI-påstand |
| `subtitle` | Valgfritt | Motpart, dato, statuslinje |
| `href` | Anbefalt | **Åpne i modul** (Gmail-tråd, Control-avtale, Field-case) |
| `occurredAt` | Anbefalt | Sortering / «når» |
| `lane` | Anbefalt | Mykt orienteringssignal for AI og UI (se §3) |
| `ctaUrl` / `ctaLabel` / `ctaKind` | Valgfritt | Neste steg **utenfor** eller ved siden av `href` |
| `intent` / `nextStep` | Valgfritt | Kort «hva» / «hva gjøre» — AI eller heuristikk |
| Kontakt-felter | Når relevant | `fromEmail`, `entityId`, osv. for Kontakt / Svar |

**Regel:** `href` og CTA er ulike knapper. CTA er ikke «åpne samme sted som modul» med annet label.

---

## 3. Lane (mykt signal)

Lane er **orientering**, ikke hard business-regel. AI og UI bruker den for å unngå
feiltolkning (f.eks. Sent-mail som «du må lese dette»).

| Domene | Eksempler på lane |
|--------|-------------------|
| Gmail | `inbox` \| `sent` \| `draft` \| `spam` \| `trash` \| `other` |
| Control (avtale) | f.eks. `draft` \| `waiting_signature` \| `signed` \| `archived` |
| Field / oppfølging | f.eks. `open` \| `waiting` \| `done` \| `snoozed` |

Implementasjon i v0 for Gmail: `gmailLane` (+ `toEmail` når lane er `sent`).
Andre kilder legger egne lane-felter eller generaliserer senere til `lane` + `laneDomain`.

---

## 4. Handlingslag (uniforme)

Hvert Desk-kort for en kilde skal tilby **samme lag**, ikke unike AI-knapper per kort.

### 4.1 Åpne

1. **I modul** → `href` (alltid når tilgjengelig)  
2. **Neste steg** → `ctaUrl` når relevant og ≠ unsubscribe / støy  
3. **Meld av** (kun mail/nyhetsbrev) → unsubscribe URL/mailto — aldri late som one-click POST = «avmeldt»

### 4.2 Nexus-handlinger (like for kilden)

Gmail-referanse:

| Handling | Effekt |
|----------|--------|
| Oppfølging | Nexus follow-up |
| Svar | Draft + how-to-answer (modul sender) |
| Ferdig | Mark read (modul-API) |
| Arkiver | Modul-API |
| Slett | Trash (modul-API) |
| Kontakt | Samme-side contact sheet |

For Control/Field: samme *idé* — oppfølging + kontakt + «ferdig»/status der API finnes;
ellers kun åpne i modul + Nexus-metadata (jf. Mission `handled_locally`).

### 4.3 AI

- Skriver `intent` / `nextStep` (kopi), ikke egne handlingsknapper  
- Får lane + rå fakta som **hints**  
- Heuristikk kun for lenker/CTA-valg (hvilken URL), ikke generisk boilerplate-tekst

---

## 5. Eierskap og lagring

| Data | Hvor |
|------|------|
| Signal-snapshot i kø (tittel, lane, href, cache) | Nexus (kortlivet / cache OK) |
| Full body, avtaleversjoner, signering | Modul |
| Kontakt / entity | Nexus Relationship |
| Oppfølging brukeren oppretter | Nexus |
| Mission dismiss/snooze | Nexus `mission_action_states` — ikke fagdata |

**Forbudt:** Nexus som sekundær sannhet for modulens kjerneobjekter (avtaletekst, e-postbody som system of record).

Fortell **foreslår**; bruker **bekrefter**; modul **lagrer**. Se Control-handoff.

---

## 6. Referanse: Gmail

| Steg | Implementasjon (peker) |
|------|------------------------|
| Hent signaler | `gmail-recent.server.ts`, desk-queue serverfns |
| Intent / CTA / lane | `desk-mail-intent.server.ts`, `gmailLane` i types |
| Kort-UI | `DeskQueuePanel.tsx`, `DeskHome.tsx` |
| Mutasjoner | `morning-mission.functions.ts` (`mark_read` \| `archive` \| `trash`) |
| Compose / vedlegg | Fortell + Inbox + contact Mail → `MailAttachmentsField`, `gmail.server.ts` |
| Cache-bump | `desk-queue-cache.ts` ved shape-endring |

## 6b. Referanse: Finance (ubetalte fakturaer)

| Steg | Implementasjon (peker) |
|------|------------------------|
| Hent signaler | `signal-gather.server.ts` → `listUnpaidFinanceInvoices` |
| Lane / intent / CTA | `financeLane` + heuristikk i `desk-queue.functions.ts` (`financeToItem`) |
| Sakskontekst | `desk-finance-context.server.ts` + `invoice-storyline.server.ts` (Gmail + entity_signals) |
| Kort-UI | `DeskQueuePanel.tsx` — I Finance \| Send/Purre/Siste purring \| Oppfølging / Ferdig / Utsett / Kontakt |
| Neste steg | `ctaKind: "purring"` → `InvoiceComposeSheet` med `purringInstruction` (ikke stille send) |
| Kontakt | `customer_email` → known_identities / contact sheet |
| Deep link | `href` → Finance `/invoices/{id}` |

Lane: `overdue` \| `due_soon` \| `open` \| `needs_key` (widget uten `invoices:read`).  
Advice: `soft_purr` \| `follow_up` \| `escalate` — styrer nextStep + CTA-label.

---

## 7. Mal for neste modul (avtale / oppfølging)

```text
1. Kilde eksponerer liste/signal (API eller Nexus-adapter)
2. Map til DeskQueueItem: id, source, title, href, lane, occurredAt
3. Valgfri CTA hvis «neste steg» ≠ åpne i modul
4. Desk: Åpne i modul | Neste steg | Nexus-handlinger
5. AI: intent/nextStep med lane-hint — ingen unike knapper
6. Skriving: proposal → UI confirm → modul-API (aldri stille overskriv)
7. Deep link tilbake til riktig objekt i modulen
```

### Control (avtale) — forventet

| Signal | Eksempel |
|--------|----------|
| `id` | `control:agreement:{uuid}` |
| `source` | (ny eller `manual`/`signal` til slug finnes) |
| `kind` | `signal` eller dedikert `agreement` når types utvides |
| `lane` | `draft` / `waiting_signature` / … |
| `href` | Control deep link til avtalen |
| Handlinger | Åpne i Control; Fortell propose/update; Nexus oppfølging |

Detaljflyt Fortell → Control: [CONTROL_HANDOFF.v0.md](./CONTROL_HANDOFF.v0.md).

### Field / oppfølging — forventet

Samme mal: åpne sak i Field, lane for status, Nexus for kontakt/oppfølging;
mutasjoner kun via Field-API når de finnes.

---

## 8. Hva dette *ikke* er

- Ikke erstatning for [MODULE_CONTRACT.v1.md](./MODULE_CONTRACT.v1.md) (health, verify, widgets)  
- Ikke krav om at alle kilder har AI  
- Ikke hard filter som skjuler «støy» fra køen uten produktbeslutning (Gmail: newsletters vises fortsatt)  
- Ikke modul-spesifikk `if (finance)` i Platform for kobling — Desk kan ha **adapters** per kilde som mapper til samme signal-shape

---

## 9. Endringspolicy

| Endring | Handling |
|---------|----------|
| Nytt valgfritt felt på signal / kort | OK i v0 + cache-bump hvis klient cacher |
| Endret betydning av `href` vs CTA | v1 |
| Nye obligatoriske felt | v1 |
| Ny kilde som følger malen | Adapter + types `source`/`kind` — dokumenter i §6/§7 |
