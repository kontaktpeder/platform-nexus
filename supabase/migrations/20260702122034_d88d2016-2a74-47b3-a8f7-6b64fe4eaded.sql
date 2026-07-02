
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.memberships TO authenticated;
GRANT ALL ON public.memberships TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_modules TO authenticated;
GRANT ALL ON public.workspace_modules TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.themes TO authenticated;
GRANT ALL ON public.themes TO service_role;

GRANT SELECT ON public.modules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.modules TO authenticated;
GRANT ALL ON public.modules TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.module_connections TO authenticated;
GRANT ALL ON public.module_connections TO service_role;

GRANT ALL ON public.module_connection_secrets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
