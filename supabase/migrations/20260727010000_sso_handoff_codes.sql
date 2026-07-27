-- Identity Core: one-time SSO handoff codes (Nexus → Finance/Work).
-- Service role only; no public RLS policies.

create table if not exists public.sso_handoff_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null references auth.users (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  return_origin text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sso_handoff_codes_expires_at_idx
  on public.sso_handoff_codes (expires_at);

alter table public.sso_handoff_codes enable row level security;

comment on table public.sso_handoff_codes is
  'Opaque one-time codes for cross-app SSO handoff. Tokens never go in the redirect URL.';
