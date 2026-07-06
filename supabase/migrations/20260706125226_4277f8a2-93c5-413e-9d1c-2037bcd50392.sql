
CREATE TABLE public.slack_channel_ingest_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slack_channel_id text NOT NULL,
  slack_channel_name text,
  enabled boolean NOT NULL DEFAULT true,
  ingest_mode text NOT NULL DEFAULT 'new_messages',
  last_message_ts text,
  last_ingested_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slack_channel_id),
  CHECK (ingest_mode IN ('new_messages','mentions_only','thread_replies','manual_only'))
);

CREATE INDEX idx_slack_rules_org_enabled ON public.slack_channel_ingest_rules(organization_id, enabled);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.slack_channel_ingest_rules TO authenticated;
GRANT ALL ON public.slack_channel_ingest_rules TO service_role;

ALTER TABLE public.slack_channel_ingest_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view org slack rules"
  ON public.slack_channel_ingest_rules
  FOR SELECT
  TO authenticated
  USING (public.is_org_member(organization_id, auth.uid()));

CREATE POLICY "Admins can insert slack rules"
  ON public.slack_channel_ingest_rules
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Admins can update slack rules"
  ON public.slack_channel_ingest_rules
  FOR UPDATE
  TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()))
  WITH CHECK (public.is_org_admin(organization_id, auth.uid()));

CREATE POLICY "Admins can delete slack rules"
  ON public.slack_channel_ingest_rules
  FOR DELETE
  TO authenticated
  USING (public.is_org_admin(organization_id, auth.uid()));

CREATE TRIGGER trg_slack_rules_updated_at
  BEFORE UPDATE ON public.slack_channel_ingest_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
