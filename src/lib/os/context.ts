/** Life / portfolio context for NEXUS OS dashboards. */

export const OS_CONTEXTS = ["hele", "privat", "business", "core"] as const;

export type OsContext = (typeof OS_CONTEXTS)[number];

export const OS_CONTEXT_LABELS: Record<OsContext, string> = {
  hele: "Hele livet",
  privat: "Privat",
  business: "Business",
  core: "CORE",
};

export function parseOsContext(value: unknown): OsContext {
  if (typeof value === "string" && (OS_CONTEXTS as readonly string[]).includes(value)) {
    return value as OsContext;
  }
  return "hele";
}

export type OsNavId =
  | "i-dag"
  | "innboks"
  | "kalender"
  | "oppgaver"
  | "mal"
  | "omrader"
  | "innsikt";

export const OS_NAV_ITEMS: {
  id: OsNavId;
  label: string;
  to: "/desk" | "/desk/fortell";
  badge?: number;
}[] = [
  { id: "i-dag", label: "I dag", to: "/desk" },
  { id: "innboks", label: "Fortell", to: "/desk/fortell" },
  { id: "kalender", label: "Kalender", to: "/desk" },
  { id: "oppgaver", label: "Oppgaver", to: "/desk" },
  { id: "mal", label: "Mål", to: "/desk" },
  { id: "omrader", label: "Områder", to: "/desk" },
  { id: "innsikt", label: "Innsikt", to: "/desk" },
];
