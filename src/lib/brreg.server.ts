/**
 * Brønnøysundregistrene Enhetsregisteret (open data).
 * https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/
 */

const BRREG_BASE = "https://data.brreg.no/enhetsregisteret/api";

const CITY_KOMMUNE: Record<string, string> = {
  oslo: "0301",
  bergen: "4601",
  trondheim: "5001",
  stavanger: "1103",
  drammen: "3301",
  tromsø: "5501",
  tromso: "5501",
};

export type BrregCompanyHit = {
  name: string;
  orgNr: string;
  orgForm: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  website: string | null;
  kind: "enhet" | "underenhet";
  parentOrgNr: string | null;
};

export type BrregRolePerson = {
  role: string;
  roleCode: string;
  fullName: string;
  birthDate: string | null;
};

function formatAddress(addr: unknown): {
  address: string | null;
  postalCode: string | null;
  city: string | null;
} {
  if (!addr || typeof addr !== "object") {
    return { address: null, postalCode: null, city: null };
  }
  const a = addr as Record<string, unknown>;
  const lines = Array.isArray(a.adresse)
    ? a.adresse.filter((x): x is string => typeof x === "string")
    : [];
  return {
    address: lines.join(", ") || null,
    postalCode: typeof a.postnummer === "string" ? a.postnummer : null,
    city: typeof a.poststed === "string" ? a.poststed : null,
  };
}

function personName(navn: unknown): string {
  if (!navn || typeof navn !== "object") return "";
  const n = navn as Record<string, unknown>;
  const parts = [n.fornavn, n.mellomnavn, n.etternavn]
    .filter((x): x is string => typeof x === "string" && !!x.trim())
    .map((x) => x.trim());
  return parts.join(" ");
}

async function brregGet(path: string): Promise<unknown> {
  const res = await fetch(`${BRREG_BASE}${path}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) {
    throw new Error(`Brreg ${res.status}: ${path}`);
  }
  return res.json();
}

function mapEnhet(e: Record<string, unknown>, kind: "enhet" | "underenhet"): BrregCompanyHit {
  const addr = formatAddress(e.forretningsadresse ?? e.beliggenhetsadresse ?? e.postadresse);
  return {
    name: String(e.navn ?? "").trim(),
    orgNr: String(e.organisasjonsnummer ?? "").replace(/\D/g, ""),
    orgForm:
      typeof (e.organisasjonsform as { beskrivelse?: string } | undefined)?.beskrivelse === "string"
        ? (e.organisasjonsform as { beskrivelse: string }).beskrivelse
        : null,
    address: addr.address,
    postalCode: addr.postalCode,
    city: addr.city,
    website: typeof e.hjemmeside === "string" ? e.hjemmeside : null,
    kind,
    parentOrgNr:
      kind === "underenhet" && e.overordnetEnhet
        ? String(e.overordnetEnhet).replace(/\D/g, "")
        : null,
  };
}

function matchesHints(
  hit: BrregCompanyHit,
  city?: string | null,
  addressHint?: string | null,
): boolean {
  if (city) {
    const c = city.trim().toLowerCase();
    if (hit.city && !hit.city.toLowerCase().includes(c) && c !== "oslo") {
      // soft: if kommune filter already applied, city check is secondary
    }
    if (hit.city && c && !hit.city.toLowerCase().includes(c)) return false;
  }
  if (addressHint) {
    const h = addressHint.trim().toLowerCase();
    const hay = `${hit.address ?? ""} ${hit.name}`.toLowerCase();
    if (h && !hay.includes(h)) return false;
  }
  return true;
}

/** Lookup a single company by 9-digit org.nr. */
export async function getBrregCompany(orgNr: string): Promise<BrregCompanyHit | null> {
  const digits = orgNr.replace(/\D/g, "");
  if (digits.length !== 9) return null;
  try {
    const json = (await brregGet(`/enheter/${digits}`)) as Record<string, unknown>;
    const hit = mapEnhet(json, "enhet");
    return hit.orgNr && hit.name ? hit : null;
  } catch {
    try {
      const json = (await brregGet(`/underenheter/${digits}`)) as Record<string, unknown>;
      const hit = mapEnhet(json, "underenhet");
      return hit.orgNr && hit.name ? hit : null;
    } catch {
      return null;
    }
  }
}

/** Search Enhetsregisteret (+ underenheter) by name or org.nr, optional city/address filter. */
export async function searchBrregCompanies(input: {
  name: string;
  city?: string | null;
  addressHint?: string | null;
  limit?: number;
}): Promise<BrregCompanyHit[]> {
  const name = input.name.trim();
  if (name.length < 2) return [];
  const digits = name.replace(/\D/g, "");
  if (digits.length === 9 && digits === name.replace(/\s/g, "")) {
    const one = await getBrregCompany(digits);
    return one ? [one] : [];
  }
  const limit = Math.min(input.limit ?? 8, 15);
  const cityKey = (input.city ?? "").trim().toLowerCase();
  const kommune = CITY_KOMMUNE[cityKey] ?? null;

  const qs = new URLSearchParams({ navn: name, size: "20" });
  if (kommune) qs.set("kommunenummer", kommune);

  const [enheterJson, underJson] = await Promise.all([
    brregGet(`/enheter?${qs.toString()}`).catch(() => null),
    brregGet(`/underenheter?${qs.toString()}`).catch(() => null),
  ]);

  const hits: BrregCompanyHit[] = [];
  const enheter =
    (enheterJson as { _embedded?: { enheter?: Record<string, unknown>[] } } | null)?._embedded
      ?.enheter ?? [];
  for (const e of enheter) hits.push(mapEnhet(e, "enhet"));

  const under =
    (underJson as { _embedded?: { underenheter?: Record<string, unknown>[] } } | null)?._embedded
      ?.underenheter ?? [];
  for (const e of under) hits.push(mapEnhet(e, "underenhet"));

  // If kommune filter was too strict / empty, retry without kommune then filter client-side.
  if (hits.length === 0 && kommune) {
    const qs2 = new URLSearchParams({ navn: name, size: "30" });
    const retry = await brregGet(`/enheter?${qs2.toString()}`).catch(() => null);
    const more =
      (retry as { _embedded?: { enheter?: Record<string, unknown>[] } } | null)?._embedded
        ?.enheter ?? [];
    for (const e of more) hits.push(mapEnhet(e, "enhet"));
  }

  const filtered = hits.filter((h) => h.orgNr && h.name);
  const withHints = filtered.filter((h) =>
    matchesHints(h, input.city ?? null, input.addressHint ?? null),
  );
  const ranked = (withHints.length ? withHints : filtered).slice(0, limit);
  return ranked;
}

/** Roles (daglig leder, styre, …) for an organisation number. */
export async function getBrregRoles(orgNr: string): Promise<{
  orgNr: string;
  roles: BrregRolePerson[];
  dagligLeder: BrregRolePerson | null;
}> {
  const digits = orgNr.replace(/\D/g, "");
  if (digits.length !== 9) throw new Error("Org.nr må være 9 siffer");

  const json = (await brregGet(`/enheter/${digits}/roller`)) as {
    rollegrupper?: Array<{
      type?: { kode?: string; beskrivelse?: string };
      roller?: Array<{
        type?: { kode?: string; beskrivelse?: string };
        person?: { navn?: unknown; fodselsdato?: string };
        avregistrert?: boolean;
      }>;
    }>;
  };

  const roles: BrregRolePerson[] = [];
  for (const group of json.rollegrupper ?? []) {
    for (const r of group.roller ?? []) {
      if (r.avregistrert) continue;
      const fullName = personName(r.person?.navn);
      if (!fullName) continue;
      roles.push({
        role: r.type?.beskrivelse || group.type?.beskrivelse || "Rolle",
        roleCode: r.type?.kode || group.type?.kode || "",
        fullName,
        birthDate: r.person?.fodselsdato ?? null,
      });
    }
  }

  const dagligLeder =
    roles.find((r) => r.roleCode === "DAGL" || /daglig leder/i.test(r.role)) ?? null;

  return { orgNr: digits, roles: roles.slice(0, 24), dagligLeder };
}
