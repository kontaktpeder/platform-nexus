export type HubPlatformId = "finance" | "work" | "gmail" | "slack";

export type HubStatus =
  | "connected"
  | "partial"
  | "error"
  | "not_configured"
  | "disabled"
  | "unavailable";

export type ConnectionHubItem = {
  platform: HubPlatformId;
  name: string;
  scope: "workspace" | "organization" | "deployment";
  status: HubStatus;
  statusLabel: string;
  detail: string | null;
  externalOrgName: string | null;
  externalOrgId: string | null;
  platformOrgName: string | null;
  lastVerifiedAt: string | null;
  errorMessage: string | null;
  configureHref: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceSlug: string | null;
};

export type ConnectionHubResponse = {
  org: { id: string; name: string; slug: string };
  summary: {
    connected: number;
    total: number;
    missing: number;
    errors: number;
  };
  deployment: ConnectionHubItem[];
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    items: ConnectionHubItem[];
  }>;
  externalOrgs: Array<{
    platform: HubPlatformId;
    externalOrgId: string;
    externalOrgName: string | null;
    linkedWorkspaces: string[];
  }>;
};

export const HUB_STATUS_LABELS: Record<HubStatus, string> = {
  connected: "Koblet",
  partial: "Delvis",
  error: "Feil",
  not_configured: "Mangler",
  disabled: "Av",
  unavailable: "Ikke tilgjengelig",
};

export const PLATFORM_META: Record<
  HubPlatformId,
  { name: string; description: string; icon: string }
> = {
  finance: {
    name: "Finance Core",
    description: "Fakturaer, rapporter og økonomi per arbeidsflate.",
    icon: "landmark",
  },
  work: {
    name: "Work Core",
    description: "Oppgaver og arbeidsflyt per arbeidsflate.",
    icon: "briefcase",
  },
  gmail: {
    name: "Gmail",
    description: "E-post for Mission, purringer og morgenbrief.",
    icon: "mail",
  },
  slack: {
    name: "Slack",
    description: "Mentions og DM-er for ukeplan og Mission.",
    icon: "message-square",
  },
};
