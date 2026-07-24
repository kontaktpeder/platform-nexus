import { getAuthenticatedHomeTarget } from "@/lib/last-workspace";
import { clearPasswordRecoveryPending } from "@/lib/auth-recovery-early";

/** Hard navigation — reliable in Lovable preview / iframes where soft navigate can stall. */
export function assignAuthenticatedHome(): void {
  clearPasswordRecoveryPending();
  const target = getAuthenticatedHomeTarget();
  if (target.to === "/app") {
    window.location.assign("/app");
    return;
  }
  window.location.assign(`/o/${target.params.orgSlug}/w/${target.params.wsSlug}`);
}

/**
 * After login: always hard-redirect. Soft TanStack navigate was leaving users on /auth
 * in the Lovable preview.
 */
export async function redirectAfterLogin(
  _navigate?: (opts: {
    to: "/app" | "/o/$orgSlug/w/$wsSlug" | "/mission";
    params?: { orgSlug: string; wsSlug: string };
    replace?: boolean;
  }) => unknown,
): Promise<void> {
  assignAuthenticatedHome();
}
