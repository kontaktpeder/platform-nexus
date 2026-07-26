import { CUSTOMER_ORG_FILTER_LABEL, CUSTOMER_WARMTH_LABEL, type CustomerWarmth } from "@/lib/customers.functions";
import type { OwnerContext } from "@/lib/knowledge/types";
import { cn } from "@/lib/utils";

export function ContactAboutCard({
  name,
  entityType,
  warmth,
  ownerContext,
  companyName,
  email,
  domain,
  role,
  industry,
  className,
}: {
  name: string;
  entityType: "person" | "company";
  warmth: CustomerWarmth;
  ownerContext: OwnerContext;
  companyName?: string | null;
  email?: string | null;
  domain?: string | null;
  role?: string | null;
  industry?: string | null;
  className?: string;
}) {
  const rows: { label: string; value: string }[] = [];
  if (entityType === "person") {
    rows.push({ label: "Type", value: "Person" });
    if (role) rows.push({ label: "Rolle", value: role });
    if (companyName) rows.push({ label: "Selskap", value: companyName });
  } else {
    rows.push({ label: "Type", value: "Selskap" });
    if (industry) rows.push({ label: "Bransje", value: industry });
    if (domain) rows.push({ label: "Domene", value: domain });
  }
  if (email) rows.push({ label: "E-post", value: email });
  rows.push({ label: "Org", value: CUSTOMER_ORG_FILTER_LABEL[ownerContext] });
  rows.push({ label: "Status", value: CUSTOMER_WARMTH_LABEL[warmth] });

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm", className)}>
      <h2 className="text-sm font-semibold">Om {name.split(/\s+/)[0]}</h2>
      <dl className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="max-w-[60%] truncate text-right font-medium">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
