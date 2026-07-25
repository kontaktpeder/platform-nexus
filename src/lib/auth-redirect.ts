import { getAuthenticatedHomeTarget } from "@/lib/last-workspace";
import { clearPasswordRecoveryPending } from "@/lib/auth-recovery-early";

type NavigateFn = (opts: {
  to: "/app" | "/mission" | "/o/$orgSlug/w/$wsSlug";
  params?: { orgSlug: string; wsSlug: string };
  replace?: boolean;
}) => unknown | Promise<unknown>;

/**
 * After login always land on Mission (/mission).
 * Mission is the personal control layer; organization management remains under Mer.
 */
export async function redirectAfterLogin(navigate?: NavigateFn): Promise<void> {
  clearPasswordRecoveryPending();

  if (navigate) {
    try {
      await Promise.resolve(navigate({ to: "/mission", replace: true }));
      return;
    } catch {
      /* fall through */
    }
  }

  window.location.assign("/mission");
}

/** Optional: resume last workspace only when caller has validated it. */
export function assignLastWorkspaceOrApp(): void {
  clearPasswordRecoveryPending();
  const target = getAuthenticatedHomeTarget();
  if (target.to === "/app") {
    window.location.assign("/app");
    return;
  }
  window.location.assign(`/o/${target.params.orgSlug}/w/${target.params.wsSlug}`);
}
