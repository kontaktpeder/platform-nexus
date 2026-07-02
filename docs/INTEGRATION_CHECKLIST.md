# Module Integration Checklist

Use before marking a module `available` in Platform `modules`.

## Module repo

- [ ] `MODULE_CONTRACT.v1.md` implemented
- [ ] `GET /module/health` → `contract_version: "1.0"`, `status: "ok"`, correct `module_slug`
- [ ] `GET /module/info` → `module_slug`, `deep_links.org_home`, `widgets[]`
- [ ] `GET /module/organization` → requires `platform:read`
- [ ] `GET /module/organization/:id` → requires `platform:verify`; wrong org → `404`
- [ ] API keys use module-specific prefix (e.g. `fc_live_`, `wc_live_`)
- [ ] `docs/MODULE_COMPLIANCE.md` present

## Platform registry (SQL)

- [ ] Row in `public.modules` with `slug`, `name`, `status` (`available` or `beta`)
- [ ] `default_url` set to production base URL of the module
- [ ] `config` populated with `{ "key_prefix": "...", "contract_version": "1.0" }`

Example:

```sql
INSERT INTO public.modules (slug, name, description, icon, version, status, default_url, config, sort_order)
VALUES (
  'inventory', 'Inventory Core', 'Lager', 'package', '0.1.0', 'beta',
  'https://inventory.example.com',
  '{"key_prefix":"ic_live_","contract_version":"1.0"}'::jsonb,
  50
);
```

## Platform E2E

- [ ] Enable module on a workspace
- [ ] Test and save connection with a valid verify key
- [ ] Retest without re-entering key
- [ ] `module_connections.status = connected`
- [ ] `module_connections.module_info_snapshot` populated
- [ ] `resolved_org_home_url` opens the correct org in the module
- [ ] Dashboard shows widgets from `module_info_snapshot` (or generic fallback)
- [ ] No new `if (slug === "...")` in `platform-nexus/src/`

## Security

- [ ] Verify key stored **only** in `module_connection_secrets` (encrypted)
- [ ] Verify key never returned to the browser
- [ ] HTTPS in production
