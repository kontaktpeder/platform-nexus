
-- Enums
create type public.app_role as enum ('owner','admin','editor','viewer');
create type public.workspace_type as enum ('drift','produksjon','nettside','catering','studio','garage','event','annet');
create type public.module_status as enum ('available','beta','coming_soon');

-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by all authenticated" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

-- memberships
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
grant select, insert, update, delete on public.memberships to authenticated;
grant all on public.memberships to service_role;
alter table public.memberships enable row level security;

-- security-definer helpers (avoid recursive RLS)
create or replace function public.is_org_member(_org uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = _org and user_id = _user);
$$;

create or replace function public.org_role(_org uuid, _user uuid)
returns app_role language sql stable security definer set search_path = public as $$
  select role from public.memberships where org_id = _org and user_id = _user;
$$;

create or replace function public.is_org_admin(_org uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = _org and user_id = _user and role in ('owner','admin'));
$$;

-- organization policies
create policy "members read org" on public.organizations for select to authenticated
  using (public.is_org_member(id, auth.uid()));
create policy "authenticated create org" on public.organizations for insert to authenticated
  with check (auth.uid() = created_by);
create policy "admins update org" on public.organizations for update to authenticated
  using (public.is_org_admin(id, auth.uid())) with check (public.is_org_admin(id, auth.uid()));
create policy "owners delete org" on public.organizations for delete to authenticated
  using (public.org_role(id, auth.uid()) = 'owner');

-- membership policies
create policy "members read memberships" on public.memberships for select to authenticated
  using (public.is_org_member(org_id, auth.uid()));
create policy "admins insert memberships" on public.memberships for insert to authenticated
  with check (public.is_org_admin(org_id, auth.uid()) or (user_id = auth.uid() and role = 'owner'));
create policy "admins update memberships" on public.memberships for update to authenticated
  using (public.is_org_admin(org_id, auth.uid())) with check (public.is_org_admin(org_id, auth.uid()));
create policy "admins delete memberships" on public.memberships for delete to authenticated
  using (public.is_org_admin(org_id, auth.uid()));

-- workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  icon text,
  workspace_type workspace_type not null default 'annet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, slug)
);
grant select, insert, update, delete on public.workspaces to authenticated;
grant all on public.workspaces to service_role;
alter table public.workspaces enable row level security;
create policy "members read workspaces" on public.workspaces for select to authenticated
  using (public.is_org_member(org_id, auth.uid()));
create policy "admins write workspaces" on public.workspaces for all to authenticated
  using (public.is_org_admin(org_id, auth.uid())) with check (public.is_org_admin(org_id, auth.uid()));

-- modules (global registry)
create table public.modules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon text,
  version text not null default '0.1.0',
  status module_status not null default 'coming_soon',
  default_url text,
  api_endpoint text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.modules to authenticated;
grant all on public.modules to service_role;
alter table public.modules enable row level security;
create policy "authenticated read modules" on public.modules for select to authenticated using (true);

-- workspace_modules
create table public.workspace_modules (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (workspace_id, module_id)
);
grant select, insert, update, delete on public.workspace_modules to authenticated;
grant all on public.workspace_modules to service_role;
alter table public.workspace_modules enable row level security;
create policy "members read workspace_modules" on public.workspace_modules for select to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_member(w.org_id, auth.uid())));
create policy "admins write workspace_modules" on public.workspace_modules for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_admin(w.org_id, auth.uid())))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_admin(w.org_id, auth.uid())));

-- themes
create table public.themes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  primary_color text not null default 'oklch(0.55 0.18 260)',
  secondary_color text not null default 'oklch(0.7 0.12 200)',
  background text not null default 'oklch(0.99 0.005 260)',
  card text not null default 'oklch(1 0 0)',
  radius text not null default '0.75rem',
  heading_font text not null default 'Inter',
  body_font text not null default 'Inter',
  logo_url text,
  favicon_url text,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.themes to authenticated;
grant all on public.themes to service_role;
alter table public.themes enable row level security;
create policy "members read theme" on public.themes for select to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_member(w.org_id, auth.uid())));
create policy "admins write theme" on public.themes for all to authenticated
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_admin(w.org_id, auth.uid())))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and public.is_org_admin(w.org_id, auth.uid())));

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger t_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger t_orgs_updated before update on public.organizations for each row execute function public.set_updated_at();
create trigger t_ws_updated before update on public.workspaces for each row execute function public.set_updated_at();
create trigger t_themes_updated before update on public.themes for each row execute function public.set_updated_at();

-- auto-create profile + auto-add owner membership on org insert
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_new_org() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.memberships (org_id, user_id, role) values (new.id, new.created_by, 'owner')
    on conflict do nothing;
  return new;
end; $$;

create trigger on_org_created after insert on public.organizations
  for each row execute function public.handle_new_org();

-- auto-create theme when workspace is created
create or replace function public.handle_new_workspace() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.themes (workspace_id) values (new.id) on conflict do nothing;
  return new;
end; $$;

create trigger on_workspace_created after insert on public.workspaces
  for each row execute function public.handle_new_workspace();
