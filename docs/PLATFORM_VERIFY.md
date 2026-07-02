# Platform Verify

Platform Core kobler et workspace til en ekstern modul-organisasjon i henhold til
[MODULE_CONTRACT.v1.md](./MODULE_CONTRACT.v1.md).

## Flyt

1. Admin (owner/admin) åpner workspace → **Moduler** og aktiverer modulen.
2. Admin fyller inn:
   - **Ekstern organisasjon-ID** (UUID i modulen)
   - **Base URL** (f.eks. `https://financecore.lovable.app`)
   - **Verify-nøkkel** (`fc_live_...` / `wc_live_...`), scope: `platform:read` + `platform:verify`
3. **«Test og lagre kobling»** kaller `verifyAndSaveModuleConnection` (ServerFn):
   - `GET /api/public/v1/module/health` — sjekker `status: ok` og `module_slug`
   - `GET /api/public/v1/module/info` — henter deep links
   - `GET /api/public/v1/module/organization/:id` med `Authorization: Bearer <key>`
4. Ved suksess:
   - `module_connections.status = connected`
   - `external_org_name` og `resolved_org_home_url` lagres
   - Verify-nøkkel krypteres og lagres i `module_connection_secrets`
5. **«Test på nytt»** (`retestModuleConnection`) bruker lagret nøkkel — ingen input trengs.

## Sikkerhet

- Verify-nøkkelen sendes **kun** til ServerFn, aldri lagret i `module_connections`, aldri returnert til klient.
- `module_connection_secrets` har RLS på, men **ingen policies** — kun `service_role` (via `supabaseAdmin`) kan lese/skrive.
- ServerFn krever `owner` eller `admin` i organisasjonen (`assertOrgAdmin`).
- Feil-flyt lagrer `status = error` + `error_message` uten å lekke rå API-respons.
- Modul-API kalles server-side via TanStack ServerFn — ingen browser-CORS, ingen nøkkelutlekk.

## Miljøvariabler

| Variabel | Formål |
|----------|--------|
| `MODULE_SECRETS_KEY` | Krypter verify-nøkler i `module_connection_secrets` (min. 32 tegn, gjerne 64). |
| `SUPABASE_SERVICE_ROLE_KEY` | Kreves for `supabaseAdmin` (admin-lesing av secrets + upsert). |

Uten `MODULE_SECRETS_KEY` faller kryptering tilbake til base64 og logger en advarsel — kun akseptabelt i dev.

## Feilsøking

| Symptom | Årsak |
|---------|-------|
| `Ustøttet contract_version` | Modul returnerer annet enn `"1.0"` — oppgrader modul eller Platform. |
| `Forventet modul "finance", fikk "..."` | Base URL peker på feil modul. |
| `Organisasjon ikke funnet eller matcher ikke nøkkelen` | `external_org_id` matcher ikke nøkkelens org (kontrakt returnerer 404). |
| `Ugyldig eller manglende verify-nøkkel` | 401/403 — sjekk scope og at nøkkelen ikke er utløpt. |
| `Ingen lagret verify-nøkkel — koble på nytt med nøkkel` | Retest uten tidligere lagret nøkkel — kjør Test og lagre først. |

## Relatert

- Live widget-data: se [LIVE_WIDGETS.md](./LIVE_WIDGETS.md).

## Ikke i scope

- SSO
- Automatisk opprettelse av org i modulen
