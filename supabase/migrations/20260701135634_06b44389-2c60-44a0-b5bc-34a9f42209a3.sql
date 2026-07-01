CREATE TYPE public.module_connection_status AS ENUM ('pending','connected','error','disconnected');

CREATE TABLE public.module_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  external_org_id UUID NOT NULL,
  external_base_url TEXT NOT NULL,
  status public.module_connection_status NOT NULL DEFAULT 'pending',
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, module_id)
);

CREATE INDEX idx_module_connections_org ON public.module_connections(org_id);
CREATE INDEX idx_module_connections_workspace ON public.module_connections(workspace_id);
CREATE INDEX idx_module_connections_module_external ON public.module_connections(module_id, external_org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_connections TO authenticated;
GRANT ALL ON public.module_connections TO service_role;

ALTER TABLE public.module_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read module_connections" ON public.module_connections FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND public.is_org_member(w.org_id, auth.uid())));

CREATE POLICY "admins insert module_connections" ON public.module_connections FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.org_id = org_id AND public.is_org_admin(w.org_id, auth.uid())));

CREATE POLICY "admins update module_connections" ON public.module_connections FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND public.is_org_admin(w.org_id, auth.uid())))
WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND w.org_id = org_id AND public.is_org_admin(w.org_id, auth.uid())));

CREATE POLICY "admins delete module_connections" ON public.module_connections FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_id AND public.is_org_admin(w.org_id, auth.uid())));

CREATE TRIGGER t_module_connections_updated BEFORE UPDATE ON public.module_connections
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.modules (slug, name, description, icon, version, status, default_url, api_endpoint, sort_order) VALUES
  ('finance','Finance Core','Regnskap, faktura, bilag og rapporter.','wallet','0.1.0','available',NULL,NULL,10),
  ('work','Work Core','Timer, prosjekter, satser og timelister.','clock','0.1.0','available',NULL,NULL,20),
  ('booking','Booking Core','Kalender og bookinger.','calendar','0.1.0','coming_soon',NULL,NULL,30),
  ('content','Content Core','Innhold og publisering.','file-text','0.1.0','coming_soon',NULL,NULL,40)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order;