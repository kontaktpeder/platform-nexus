import type { HubStatus } from "@/lib/connection-hub.types";

export type ModulesOverviewKind = "core_module" | "integration" | "planned";

export type ModulesOverviewOrgLink = {
  platformOrgName: string;
  platformOrgSlug: string;
  workspaceName: string | null;
  workspaceSlug: string | null;
  externalOrgName: string | null;
  configureHref: string;
};

export type ModulesOverviewRow = {
  id: string;
  name: string;
  description: string;
  kind: ModulesOverviewKind;
  /** Registry module id when toggleable on active workspace */
  moduleId: string | null;
  moduleSlug: string | null;
  status: HubStatus;
  statusLabel: string;
  detail: string | null;
  /** Missing / next-step copy */
  gaps: string[];
  enabledOnActiveWorkspace: boolean | null;
  canToggle: boolean;
  connectedOrgs: ModulesOverviewOrgLink[];
  configureHref: string | null;
};

export type ModulesOverviewResponse = {
  activeWorkspace: {
    orgSlug: string;
    orgName: string;
    wsSlug: string;
    wsName: string;
    workspaceId: string;
    canEdit: boolean;
  } | null;
  summary: {
    connected: number;
    partial: number;
    missing: number;
    planned: number;
  };
  rows: ModulesOverviewRow[];
};
