// Server-only: org name alignment for connection hub gap detection.

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export function normalizeOrgName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9æøå]/gi, "")
    .trim();
}

/** True when display names match loosely (case, punctuation, AS suffix, etc.). */
export function namesRoughlyMatch(a: string, b: string): boolean {
  const na = normalizeOrgName(a);
  const nb = normalizeOrgName(b);
  if (!na || !nb) return true;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function orgNamesAlign(
  platform: { name: string; slug: string },
  externalName: string | null | undefined,
): boolean {
  if (!externalName?.trim()) return true;
  if (namesRoughlyMatch(platform.name, externalName)) return true;
  const slugNorm = normalizeOrgName(platform.slug.replace(/-/g, " "));
  const extNorm = normalizeOrgName(externalName);
  if (slugNorm && extNorm && (slugNorm === extNorm || slugNorm.includes(extNorm) || extNorm.includes(slugNorm))) {
    return true;
  }
  return false;
}

type ConnectionRow = {
  id: string;
  external_org_id: string;
  external_base_url: string;
  external_org_name: string | null;
  module_slug: string | null;
  status: string;
};

/** Fetch current org names from Finance/Work verify API (not stale DB cache). */
export async function fetchLiveExternalOrgNames(
  supabaseAdmin: AdminClient,
  connections: ConnectionRow[],
): Promise<Map<string, string>> {
  const live = new Map<string, string>();
  const connected = connections.filter(
    (c) =>
      c.status === "connected" &&
      (c.module_slug === "finance" || c.module_slug === "work"),
  );
  if (connected.length === 0) return live;

  const { getModuleConnectionSecrets } = await import("@/lib/module-connection-secrets.server");
  const { verifyModuleOrganization } = await import("@/lib/module-client.server");

  await Promise.all(
    connected.map(async (conn) => {
      const secrets = await getModuleConnectionSecrets(supabaseAdmin, conn.id);
      if (!secrets) return;
      try {
        const verified = await verifyModuleOrganization({
          baseUrl: conn.external_base_url,
          orgId: conn.external_org_id,
          apiKey: secrets.verifyApiKey,
        });
        live.set(conn.id, verified.organization.name);
      } catch {
        // Keep cached name when live fetch fails.
      }
    }),
  );

  return live;
}

/** Persist refreshed names so module panels and later hub loads stay in sync. */
export async function persistRefreshedOrgNames(
  supabaseAdmin: AdminClient,
  connections: ConnectionRow[],
  liveOrgNameByConnectionId: Map<string, string>,
): Promise<void> {
  await Promise.all(
    connections.map(async (conn) => {
      const live = liveOrgNameByConnectionId.get(conn.id);
      if (!live || live === conn.external_org_name) return;
      await supabaseAdmin
        .from("module_connections")
        .update({ external_org_name: live })
        .eq("id", conn.id);
    }),
  );
}
