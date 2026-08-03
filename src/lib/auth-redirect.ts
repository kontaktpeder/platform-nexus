import { getAuthenticatedHomeTarget } from "@/lib/last-workspace";
import { clearPasswordRecoveryPending } from "@/lib/auth-recovery-early";
import { getLoginSurfaceTarget } from "@/lib/surface";

type NavigateFn = (opts: {
  to: "/app" | "/hjem" | "/desk" | "/mission" | "/o/$orgSlug/w/$wsSlug";
  params?: { orgSlug: string; wsSlug: string };
  replace?: boolean;
}) => unknown | Promise<unknown>;

/**
 * After login: desktop → /desk (work zone), mobile → /hjem (capture CTAs).
 * Mission / Felt / Innboks remain under Profil.
 */
export async function redirectAfterLogin(navigate?: NavigateFn): Promise<void> {
  clearPasswordRecoveryPending();

  const to = getLoginSurfaceTarget();

  if (navigate) {
    try {
      await Promise.resolve(navigate({ to, replace: true }));
      return;
    } catch {
      /* fall through */
    }
  }

  window.location.assign(to);
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
