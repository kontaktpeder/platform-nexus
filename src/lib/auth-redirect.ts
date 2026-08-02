import { getAuthenticatedHomeTarget } from "@/lib/last-workspace";
import { clearPasswordRecoveryPending } from "@/lib/auth-recovery-early";

type NavigateFn = (opts: {
  to: "/app" | "/hjem" | "/mission" | "/o/$orgSlug/w/$wsSlug";
  params?: { orgSlug: string; wsSlug: string };
  replace?: boolean;
}) => unknown | Promise<unknown>;

/**
 * After login land on Hjem — capture-first mobile shell.
 * Mission / Felt / Innboks remain under Profil.
 */
export async function redirectAfterLogin(navigate?: NavigateFn): Promise<void> {
  clearPasswordRecoveryPending();

  if (navigate) {
    try {
      await Promise.resolve(navigate({ to: "/hjem", replace: true }));
      return;
    } catch {
      /* fall through */
    }
  }

  window.location.assign("/hjem");
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
