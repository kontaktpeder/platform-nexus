# Organization Create Flow

Platform Core creates organizations atomically via a server function using the
service-role client. This avoids RLS race conditions where a client-side
`insert().select()` can 403 before the ownership membership is visible.

## Server function

`src/lib/organization.functions.ts` → `createOrganization`

Input:

```ts
{ name: string; workspaceName?: string /* default "Operations" */ }
```

Steps (all via `supabaseAdmin`, gated by `requireSupabaseAuth`):

1. Slugify `name` and resolve to a unique slug (`-2`, `-3`, …).
2. Insert `organizations { name, slug, created_by: userId }`.
3. Upsert `memberships { org_id, user_id, role: 'owner' }` — explicit, so the
   flow works whether or not the `on_org_created` trigger exists in prod.
4. Insert default `workspaces { slug: 'operations', workspace_type: 'drift',
   name: workspaceName }`. The `on_workspace_created` trigger creates the
   default theme row.

Returns `{ org: { id, name, slug }, workspace: { id, name, slug } }`.

## UI

`/_authenticated/app` calls the server function via `useServerFn`, invalidates
the `["orgs"]` query, and navigates to
`/o/{orgSlug}/w/{workspaceSlug}` on success.

## Scope

Platform Core only creates the Platform-side org. It never creates or mutates
organizations inside Finance, Work, or any other module. Linking to external
module orgs happens through `module_connections` (see `PLATFORM_VERIFY.md`).
