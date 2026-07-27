# Identity Core (SSO) — Nexus as auth authority

Shared login for **Nexus → Finance → Work**. Module databases stay separate; only the **user UUID** (`auth.uid()` / JWT `sub`) is shared. Module Contract API keys are unchanged.

Control Compass is out of scope for this pilot.

## Architecture

1. User signs in on **Nexus** (Google / email).
2. If `?return_to=` points at an allowlisted Finance/Work origin, Nexus mints a one-time handoff code and redirects to `{origin}/auth/callback?code=…`.
3. The module exchanges the code via `POST {NEXUS_APP_URL}/api/sso/exchange`, stores the Nexus session locally, and calls `ensureModuleIdentity` (shadow `auth.users` row + membership remap by email).
4. Module data clients send the **Nexus access token** to the module Supabase project. PostgREST RLS sees `auth.uid() = Nexus user id`.

```text
Nexus Auth (issuer) ──JWT──► Finance/Work PostgREST (JWT secret aligned)
                └──session──► module localStorage (core-nexus-auth)
```

## Ops: Lovable Cloud (no JWT secret edit)

Lovable Cloud **locks JWT secrets**. Do **not** try to copy JWT secrets between projects.

Instead, SSO works like this:

1. User logs in on Nexus.
2. Nexus hands off a one-time code to Finance/Work.
3. The module verifies the Nexus token, creates a **shadow user with the same UUID**, remaps memberships by email, then mints a **local module session** (`generateLink` + `verifyOtp`).
4. The browser stores the **module** session. RLS uses the module JWT; `auth.uid()` equals the Nexus user id.

### Legacy note

Older drafts mentioned aligning JWT secrets in the Supabase Dashboard. That path does not apply on Lovable Cloud.

## Env vars

### Nexus (server / Lovable Secrets)

| Variable | Purpose |
|----------|---------|
| `SSO_RETURN_ALLOWLIST` | Comma-separated origins, e.g. `http://localhost:3001,https://finance….lovable.app,https://work….lovable.app` |
| `SSO_CODE_SECRET` | Optional; hash salt for handoff codes (falls back to `MODULE_SECRETS_KEY` / service role) |
| `PUBLIC_APP_URL` | Nexus public origin (invites) |

Apply migration: `supabase/migrations/20260727010000_sso_handoff_codes.sql`.

### Finance / Work (`.env.local` after JWT align)

| Variable | Purpose |
|----------|---------|
| `AUTH_SUPABASE_URL` / `VITE_AUTH_SUPABASE_URL` | Nexus Supabase URL |
| `AUTH_SUPABASE_PUBLISHABLE_KEY` / `VITE_AUTH_SUPABASE_PUBLISHABLE_KEY` | Nexus anon/publishable key |
| `NEXUS_APP_URL` / `VITE_NEXUS_APP_URL` | Nexus app origin (no trailing slash) |
| `PUBLIC_APP_URL` | This module’s public origin (invites + return_to) |
| `SUPABASE_*` | Unchanged — **this module’s data project** |

Until `VITE_AUTH_SUPABASE_URL` is set, modules keep local Auth (legacy). Setting AUTH_* activates dual clients + «Logg inn via Nexus».

## Dogfood checklist

1. Apply `sso_handoff_codes` migration on Nexus (done).
2. Set `SSO_RETURN_ALLOWLIST` on Nexus; set AUTH_* + `NEXUS_APP_URL` on Finance/Work (Secrets + `.env` `VITE_*`).
3. **Push/publish** Finance + Work + Nexus so the session-exchange code is live.
4. Fresh browser: Nexus Google login → Finance «Logg inn via Nexus» → home.
5. Same for Work. `user.id` should match Nexus.
6. RLS smoke + Platform module verify still works.

### Optional one-time SQL (service role)

If you know old local UUID → Nexus UUID for a dogfood email:

```sql
-- After shadow user exists with Nexus id:
UPDATE organization_members
SET user_id = '<nexus_uuid>'
WHERE user_id = '<old_local_uuid>';
```

Prefer `ensureModuleIdentity` (runs on SSO callback) over manual SQL.

## Rollback

1. Remove `VITE_AUTH_SUPABASE_*` / `AUTH_*` from Finance/Work (and `NEXUS_APP_URL`).
2. Users sign in with local module Auth again (new sessions). Membership rows may still point at Nexus UUIDs — remap or re-invite if needed.
3. Optionally restore previous JWT secrets on modules (breaks any remaining Nexus JWTs).

## Related

- Module linking / verify keys: [PLATFORM_VERIFY.md](./PLATFORM_VERIFY.md) (user SSO ≠ module verify).
- Architecture roadmap: [ARCHITECTURE.md](./ARCHITECTURE.md).
