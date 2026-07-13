import { TopBar, type TopBarWorkspaceContext } from "@/components/platform/TopBar";
import { useResolvedLastWorkspace } from "@/lib/last-workspace.hooks";

export function GlobalTopBar({
  title,
  subtitle,
  back,
}: {
  title: string;
  subtitle?: string;
  back?: { to: string; params?: Record<string, string> };
}) {
  const lastWs = useResolvedLastWorkspace();
  const workspaceContext: TopBarWorkspaceContext | undefined = lastWs.data
    ? {
        orgSlug: lastWs.data.orgSlug,
        wsSlug: lastWs.data.wsSlug,
        orgName: lastWs.data.orgName,
        wsName: lastWs.data.wsName,
      }
    : undefined;

  return (
    <TopBar
      title={title}
      subtitle={subtitle}
      back={back}
      workspaceContext={workspaceContext}
    />
  );
}
