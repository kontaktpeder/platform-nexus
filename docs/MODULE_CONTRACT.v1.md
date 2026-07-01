# Core Module Contract v1

> **FROZEN — ikke endre dette dokumentet.**
>
> Breaking changes → opprett `docs/MODULE_CONTRACT.v2.md`.
>
> v1 forblir normativ for alle som implementerer `contract_version: "1.0"`.

| | |
|--|--|
| **Contract Version** | `1.0.0` |
| **Document** | `MODULE_CONTRACT.v1.md` |
| **Status** | **Stable** |
| **Breaking changes** | **Not allowed** in this document |
| **Future additions** | Backward compatible only (new optional fields, capabilities, deep_links) |
| **Deprecation policy** | Endpoints may be marked deprecated; removal only in next major contract version (`v2`) |
| **Eier** | Platform Core |
| **Referanseimplementasjon** | Finance Core (`finance-hub`) |
| **Gjelder for** | Finance Core, Work Core, Booking Core, fremtidige moduler |

**Endringsregler:**

- Typo/clarification uten semantikkendring → PR med label `docs: non-breaking`
- Nye valgfrie JSON-felt → tillatt i v1-implementasjoner
- Endret required-felt, path, auth, eller response-shape → **v2 dokument**
- Ingen modul implementerer «v1.1» — kun `1.0` eller `2.0`

---

**Versjon i API-respons:** `"contract_version": "1.0"` (kort form; tilsvarer dokument `1.0.0`)

Dette dokumentet definerer det **obligatoriske plattformgrensesnittet** som hver modul må implementere for å kunne kobles til Platform Core via `module_connections`.

Platform Core er **koordinator og kartlag**. Moduler eier sin egen data, database og forretningslogikk. Platform leser aldri modul-databaser direkte.

---

## 1. Prinsipper

1. **Samme kontrakt, ulike moduler** — Platform skal ikke ha modul-spesifikk kode (`if finance`, `if work`).

2. **Eksisterende organisasjoner** — Platform mapper til `external_org_id`; moduler oppretter ikke org på vegne av Platform uten eksplisitt API-kall.

3. **Ingen delt database** — kun HTTP over offentlig API.

4. **API-nøkler er modul-scoped** — én nøkkel = én organisasjon i modulen.

5. **Health og info er åpne** — organisation-endepunkter krever auth.

6. **Minimal eksponering** — verify returnerer kun det som trengs for å bekrefte kobling.

7. **Versjonering** — `contract_version` i alle responses; breaking changes → v2.

---

## 2. Standard base path

Alle moduler **MÅ** eksponere plattform-API under:

```text
{app_base_url}/api/public/v1/module/
```

| Del | Krav |
|-----|------|
| `app_base_url` | Modulens offentlige rot-URL uten trailing slash, f.eks. `https://finance.example.com` |
| Path-prefix | Alltid `/api/public/v1/module/` |
| Content-Type | `application/json` for alle JSON-responses |
| Tidsstempler | ISO 8601 UTC (`2026-07-02T12:00:00.000Z`) |
| ID-er | UUID v4 strenger |

**Merk:** Moduler kan ha **domene-spesifikke** endepunkter utenfor `/module/` (f.eks. Finance `/entries`). Disse er **ikke** del av plattformkontrakten, men kan listes under `capabilities`.

Platform lagrer `app_base_url` i `module_connections.external_base_url`.

---

## 3. Endepunkter (obligatorisk)

### Oversikt

| Metode | Path | Auth | Scope | Formål |
|--------|------|------|-------|--------|
| `GET` | `/module/health` | Nei | — | Modul oppe? |
| `GET` | `/module/info` | Nei | — | Metadata, deep links, widgets, capabilities |
| `GET` | `/module/organization` | Ja | `platform:read` | Org knyttet til API-nøkkel |
| `GET` | `/module/organization/:org_id` | Ja | `platform:verify` | Bekreft at org-id finnes og matcher nøkkel |

---

### 3.1 `GET /module/health`

**Formål:** Platform sjekker at modulen er tilgjengelig før/etter kobling. Ingen sensitiv data.

**Request:** Ingen body. Ingen auth.

**Response `200`:**

```json
{
  "contract_version": "1.0",
  "status": "ok",
  "module_slug": "finance",
  "module_name": "Finance Core",
  "app_version": "0.1.0",
  "timestamp": "2026-07-02T12:00:00.000Z"
}
```

| Felt | Type | Påkrevd | Beskrivelse |
|------|------|---------|-------------|
| `contract_version` | string | ja | `"1.0"` |
| `status` | string | ja | `"ok"` eller `"degraded"` |
| `module_slug` | string | ja | Matcher `modules.slug` i Platform, f.eks. `finance`, `work` |
| `module_name` | string | ja | Visningsnavn |
| `app_version` | string | ja | Semver modul-app |
| `timestamp` | string | ja | Server-tid |

**Feil:**

| Status | Betydning |
|--------|-----------|
| `503` | Modul utilgjengelig — Platform setter `module_connections.status = error` |

---

### 3.2 `GET /module/info`

**Formål:** Platform henter deep links, widget-register og capabilities uten å kjenne modulen på forhånd.

**Request:** Ingen body. Ingen auth.

**Response `200`:**

```json
{
  "contract_version": "1.0",
  "module_slug": "finance",
  "module_name": "Finance Core",
  "app_version": "0.1.0",
  "app_base_url": "https://finance.example.com",
  "capabilities": [
    "platform.health",
    "platform.organization.read",
    "entries.read",
    "entries.write",
    "invoices.read",
    "reports.read"
  ],
  "deep_links": {
    "org_home": "/orgs/{org_id}",
    "org_scan": "/orgs/{org_id}/scan",
    "org_invoices": "/orgs/{org_id}/invoices",
    "org_reports": "/orgs/{org_id}/reports"
  },
  "widgets": [
    {
      "id": "unpaid_entries",
      "title": "Ubetalte poster",
      "description": "Antall ubetalte regnskapsposter",
      "deep_link": "org_home",
      "capabilities_required": ["entries.read"],
      "placeholder": true
    },
    {
      "id": "month_result",
      "title": "Månedens resultat",
      "deep_link": "org_reports",
      "capabilities_required": ["reports.read"],
      "placeholder": true
    }
  ],
  "theme": {
    "supports_workspace_theme": false,
    "notes": "Modulen bruker eget tema inntil videre."
  }
}
```

#### Deep link templates

- Nøkler i `deep_links` er **stabile identifikatorer** (`org_home`, `org_timer`, …).
- Verdier er **path-templates** med nøyaktig placeholder `{org_id}`.
- Platform resolver:

```text
full_url = normalize(app_base_url) + template.replace("{org_id}", external_org_id)
```

- Moduler **MÅ** tilby minst `org_home`.
- Ekstra templates er valgfrie og modul-spesifikke.

#### Widgets registry

| Felt | Type | Påkrevd | Beskrivelse |
|------|------|---------|-------------|
| `id` | string | ja | Stabil widget-id, unik innen modul |
| `title` | string | ja | Kort tittel i Platform-dashboard |
| `description` | string | nei | Hjelpetekst |
| `deep_link` | string | ja | Nøkkel i `deep_links` (ikke full URL) |
| `capabilities_required` | string[] | nei | Platform skjuler widget hvis capability mangler |
| `placeholder` | boolean | nei | `true` = live data kommer senere; vis shell i Platform |

**Merk v1:** Widgets kan være placeholders. Live data krever egne domene-endepunkter og er **ikke** del av v1-kontrakten.

#### Theme

| Felt | Type | Beskrivelse |
|------|------|-------------|
| `supports_workspace_theme` | boolean | Om modulen kan motta tema fra Platform |
| `notes` | string | Fri tekst |

---

### 3.3 `GET /module/organization`

**Formål:** Returner organisasjonen API-nøkkelen er låst til. Tilsvarer «/me» for modul-org.

**Auth:** Påkrevd.

```http
Authorization: Bearer {api_key}
```

**Scope:** `platform:read`

**Response `200`:**

```json
{
  "contract_version": "1.0",
  "organization": {
    "id": "bbc194b3-3067-4eb9-9918-87bed9ab7670",
    "name": "Gold of Sicily",
    "slug": null,
    "org_number": null
  },
  "api_client": {
    "id": "a1b2c3d4-....",
    "name": "platform-verify"
  },
  "scopes": ["platform:read", "platform:verify", "entries:read"]
}
```

| Felt | Type | Påkrevd | Beskrivelse |
|------|------|---------|-------------|
| `organization.id` | uuid | ja | Modulens kanoniske org-id |
| `organization.name` | string | ja | Visningsnavn |
| `organization.slug` | string \| null | nei | Om modulen har slug |
| `organization.org_number` | string \| null | nei | Org.nr hvis relevant |
| `api_client.id` | uuid | ja | Klient som brukte nøkkelen |
| `api_client.name` | string | ja | Klientnavn |
| `scopes` | string[] | ja | Aktive scopes for nøkkelen |

**Feil:**

| Status | Body |
|--------|------|
| `401` | `{ "error": "Unauthorized" }` |
| `403` | `{ "error": "Forbidden", "required_scope": "platform:read" }` |

---

### 3.4 `GET /module/organization/:org_id`

**Formål:** Platform validerer at brukerens `external_org_id` i `module_connections` er korrekt — **uten** direkte databasetilgang.

**Auth:** Påkrevd.

**Scope:** `platform:verify`

**Path parameter:** `org_id` — UUID

**Regler:**

1. Hvis `org_id` **ikke** matcher organisasjonen API-nøkkelen tilhører → `404` (ikke `403`, for å unngå org-enumeration).
2. Response inneholder **kun** offentlig profil — ingen medlemmer, ingen økonomidata.

**Response `200`:**

```json
{
  "contract_version": "1.0",
  "verified": true,
  "organization": {
    "id": "bbc194b3-3067-4eb9-9918-87bed9ab7670",
    "name": "Gold of Sicily"
  }
}
```

**Feil:**

| Status | Betydning |
|--------|-----------|
| `400` | Ugyldig UUID-format |
| `401` | Manglende/ugyldig nøkkel |
| `403` | Nøkkel mangler `platform:verify` |
| `404` | Org finnes ikke **eller** matcher ikke nøkkelens org |

---

## 4. Capabilities

Capabilities er **streng-identifikatorer** som beskriver hva modulen kan. Platform bruker dem til å vise/skjule widgets og fremtidige handlinger.

### 4.1 Plattform-capabilities (alle moduler)

| Capability | Beskrivelse |
|------------|-------------|
| `platform.health` | Implementerer `/module/health` |
| `platform.organization.read` | Implementerer `/module/organization` |
| `platform.organization.verify` | Implementerer `/module/organization/:id` |

### 4.2 Domene-capabilities (modul-spesifikke, eksempler)

**Finance Core:**

| Capability | Beskrivelse |
|------------|-------------|
| `entries.read` | Les regnskapsposter |
| `entries.write` | Opprett/endre poster |
| `attachments.write` | Last opp bilag |
| `invoices.read` | Les fakturaer |
| `invoices.write` | Opprett/send faktura |
| `reports.read` | Les rapporter |

**Work Core:**

| Capability | Beskrivelse |
|------------|-------------|
| `time.read` | Les timer |
| `time.write` | Registrer timer |
| `projects.read` | Les prosjekter |
| `rates.read` | Les satser |
| `reports.read` | Timeliste/rapporter |

**Booking Core (fremtid):**

| Capability | Beskrivelse |
|------------|-------------|
| `bookings.read` | Les bookinger |
| `bookings.write` | Opprett/endre booking |

Moduler **MÅ** liste alle capabilities de støtter i `/module/info`. Platform **MÅ IKKE** anta at en modul har domene-capabilities uten at de er listet.

---

## 5. Auth og scopes

### 5.1 API-nøkkelformat

Hver modul definerer eget prefiks:

| Modul | Anbefalt prefiks | Eksempel |
|-------|------------------|----------|
| Finance Core | `fc_live_` | `fc_live_ab12cd34_xxxxxxxx` |
| Work Core | `wc_live_` | `wc_live_ab12cd34_xxxxxxxx` |
| Booking Core | `bc_live_` | `bc_live_ab12cd34_xxxxxxxx` |

Felles regler:

- Header: `Authorization: Bearer {full_token}`
- Kun hash lagres i database
- Én `api_client` → én `organization_id` i modulen
- Nøkkel vises én gang ved opprettelse

### 5.2 Plattform-scopes (obligatoriske i v1)

| Scope | Bruk |
|-------|------|
| `platform:read` | `GET /module/organization` |
| `platform:verify` | `GET /module/organization/:org_id` |

### 5.3 Anbefalt nøkkel for Platform-kobling

Ved kobling av workspace til modul oppretter admin en **verify-nøkkel** i modulen med **kun**:

```text
platform:read
platform:verify
```

Domene-scopes (`entries:write`, osv.) legges på **egne** integrasjonsnøkler — ikke bland med verify-nøkkel med mindre nødvendig.

### 5.4 Lagring i Platform Core

| Lagres i `module_connections` | Lagres IKKE her |
|-------------------------------|-----------------|
| `external_org_id` | API-nøkkel |
| `external_base_url` | Hemmeligheter |
| `status`, `connected_at` | |

API-nøkler for verify **MÅ** lagres server-side (f.eks. fremtidig `module_connection_secrets`) — aldri i frontend, aldri i `module_connections`.

---

## 6. Sikkerhetsregler

### 6.1 Generelt

1. **HTTPS only** i produksjon.
2. **Ingen service role** i frontend eller browser.
3. **Rate limiting** anbefales på `/module/*` (minst verify).
4. **CORS:** Modul-API kalles fra **Platform server** (ServerFn), ikke direkte fra browser ved verify — unngår CORS og eksponering av nøkkel.
5. **Org enumeration:** Ved verify, returner `404` når org ikke matcher — aldri `403` med «feil org».

### 6.2 Platform Core

1. Kun `owner`/`admin` kan opprette/endre `module_connections`.
2. Verify kjøres server-side med lagret verify-nøkkel.
3. Platform oppretter **aldri** organisasjoner i moduler automatisk ved kobling.
4. `external_org_id` valideres som UUID før lagring.

### 6.3 Moduler

1. `platform:verify` gir kun lesetilgang til `{ id, name }` for egen org.
2. `/module/info` eksponerer ikke brukerdata, hemmeligheter eller PII.
3. Domene-endepunkter (entries, timer, …) følger modulens egne scope-regler.
4. `api_events` / audit log anbefales for platform-kall.

### 6.4 RLS (modul-internt)

Platform-kontrakten endrer **ikke** modulens interne RLS. Den legger kun et **tynt offentlig lag** over eksisterende `api_clients`-modell.

---

## 7. Platform-koblingsflyt (referanse)

Dette er **ikke** implementasjonskrav for moduler, men viser hvordan kontrakten brukes:

```text
1. Admin aktiverer modul på workspace (workspace_modules)

2. Admin limer inn external_org_id + app_base_url

3. Platform ServerFn:
   a. GET {base}/api/public/v1/module/health
   b. GET {base}/api/public/v1/module/info
   c. GET {base}/api/public/v1/module/organization/{id}
      med verify-nøkkel (platform:verify)

4. Ved success:
   - module_connections.status = connected
   - deep links fra /module/info (ikke hardkodet)

5. Dashboard:
   - widgets fra /module/info
   - «Åpne modul» via deep_links.org_home
```

---

## 8. Feilformat (felles)

Alle feilresponses **BØR** bruke:

```json
{
  "error": "Human readable message",
  "code": "OPTIONAL_MACHINE_CODE",
  "contract_version": "1.0"
}
```

---

## 9. Versjonering og kompatibilitet

| `contract_version` | Endring |
|--------------------|---------|
| `1.0` | Initial |
| `2.0` | Breaking (krever ny implementasjon) |

Moduler **MÅ** returnere `contract_version` i alle `/module/*`-responses.

Platform **MÅ** avvise kobling hvis `contract_version` ikke støttes.

Non-breaking tillegg (nye capabilities, nye deep_links) krever ikke versjonsbump.

---

## 10. Referanseimplementasjoner (planlagt)

| Modul | `module_slug` | Status kontrakt v1 |
|-------|---------------|-------------------|
| Finance Core | `finance` | Planlagt |
| Work Core | `work` | Planlagt |
| Booking Core | `booking` | Fremtid |

---

## 11. Sjekkliste for nye moduler

En modul er **Platform-klar v1** når alle punkter er oppfylt:

### Dokumentasjon
- [ ] `docs/MODULE_COMPLIANCE.md` i modul-repo refererer til dette dokumentet
- [ ] `module_slug` er registrert i Platform `modules`-seed
- [ ] `app_base_url` for produksjon er dokumentert

### Obligatoriske endepunkter
- [ ] `GET /api/public/v1/module/health` — uten auth, returnerer `status: ok`
- [ ] `GET /api/public/v1/module/info` — uten auth, inkluderer `deep_links.org_home`
- [ ] `GET /api/public/v1/module/organization` — med `platform:read`
- [ ] `GET /api/public/v1/module/organization/:org_id` — med `platform:verify`

### Scopes og auth
- [ ] `platform:read` og `platform:verify` finnes i modulens scope-enum
- [ ] API-nøkkel er org-scoped (én nøkkel = én org)
- [ ] Verify-nøkkel kan opprettes med kun platform-scopes

### Deep links og widgets
- [ ] Minst `deep_links.org_home` med `{org_id}`
- [ ] `widgets[]` listet i `/module/info` (kan være placeholders)
- [ ] `capabilities[]` listet og korrekte

### Sikkerhet
- [ ] Ingen hemmeligheter i `/module/info` eller `/module/health`
- [ ] Verify returnerer `404` for feil org (ikke `403`)
- [ ] Service role brukes kun server-side
- [ ] Platform kan kalle verify uten browser CORS-problemer

### Platform-integrasjon
- [ ] `module_connections.external_org_id` matcher `organization.id` fra verify
- [ ] `module_connections.external_base_url` matcher `app_base_url` i `/module/info`
- [ ] Kobling testet via Platform «Test kobling» (når implementert)

### Ikke i scope v1
- [ ] SSO / felles innlogging
- [ ] Live widget-data i Platform
- [ ] Workspace-tema injisert i modul
- [ ] Automatisk org-opprettelse fra Platform

---

## 12. Relaterte Platform Core-tabeller

| Tabell | Rolle |
|--------|-------|
| `modules` | Global katalog (`slug` = `module_slug`) |
| `workspace_modules` | Modul på/av per workspace |
| `module_connections` | Mapping `external_org_id` + `external_base_url` |
| `module_connection_secrets` | *(fremtid)* Verify-nøkkel, server-only |

---

## 13. Endringslogg

| Dato | Versjon | Endring |
|------|---------|---------|
| 2026-07-02 | 1.0 | Initial fasit |

---

*Dette dokumentet er normativt. Ved konflikt mellom modul-implementasjon og dette dokumentet, vinner dokumentet.*
