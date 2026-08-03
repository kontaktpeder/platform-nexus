import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  GitMerge,
  Loader2,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Phone,
} from "lucide-react";
import { toast } from "sonner";
import {
  ContactAboutCard,
  ContactEmailSection,
  ContactRelationsSection,
  NextStepPanel,
  RelationAvatar,
  PlanFollowUpPanel,
  TimelineEvent,
} from "@/components/platform/relation";
import { CompanyBrregSearch } from "@/components/platform/relation/CompanyBrregSearch";
import { PlatformSheet } from "@/components/platform/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BrregCompanyHit } from "@/lib/brreg.server";
import { tryOpenSheet } from "@/lib/sheetGate";
import {
  CUSTOMER_ORG_FILTER_LABEL,
  CUSTOMER_WARMTH_LABEL,
  ensureFieldPlace,
  getCustomerDetail,
  listCustomers,
  mergeCustomers,
  renameCustomer,
  setCustomerOwnerContext,
  setCustomerWarmth,
  updateContactProfile,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerWarmth,
} from "@/lib/customers.functions";
import { scheduleEntityFollowUp } from "@/lib/field.functions";
import { FIELD_RESULT_LABEL, type FollowUpPreset } from "@/lib/field/field.types";
import { rejectWrongEntity } from "@/lib/known-identities.functions";
import type { OwnerContext } from "@/lib/knowledge/types";
import type { RelationSourceKind } from "@/lib/relation/types";
import { formatOsloActivityDate } from "@/lib/field/field-dates";
import { cn } from "@/lib/utils";

const OWNER_OPTIONS: OwnerContext[] = ["gold-of-sicily", "peder-enk", "personal", "unknown"];

const TABS = [
  { id: "aktivitet", label: "Aktivitet" },
  { id: "oppfolging", label: "Oppfølging" },
  { id: "om", label: "Om" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function warmthClass(w: CustomerWarmth): string {
  switch (w) {
    case "warm":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
    case "waiting":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-300";
    case "cold":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function timelineSourceKind(source: string): RelationSourceKind | null {
  const raw = source.toLowerCase();
  if (raw.includes("gmail") || raw.includes("mail") || raw.includes("email")) return "gmail";
  if (raw.includes("slack")) return "slack";
  if (raw.includes("felt") || raw.includes("field")) return "felt";
  if (raw.includes("finance") || raw.includes("faktura")) return "finance";
  if (raw.includes("work")) return "work";
  return "manual";
}

export function ContactDetailPanel({
  entityId,
  variant = "page",
  onClose,
  onOpenEntity,
  className,
}: {
  entityId: string;
  variant?: "page" | "panel";
  onClose?: () => void;
  onOpenEntity?: (id: string) => void;
  className?: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchDetail = useServerFn(getCustomerDetail);
  const fetchCustomers = useServerFn(listCustomers);
  const runWarmth = useServerFn(setCustomerWarmth);
  const runOwner = useServerFn(setCustomerOwnerContext);
  const runRename = useServerFn(renameCustomer);
  const runProfile = useServerFn(updateContactProfile);
  const runMerge = useServerFn(mergeCustomers);
  const runReject = useServerFn(rejectWrongEntity);
  const runEnsureField = useServerFn(ensureFieldPlace);
  const runScheduleFollowUp = useServerFn(scheduleEntityFollowUp);

  const [tab, setTab] = useState<TabId>("aktivitet");
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({
    role: "",
    phone: "",
    website: "",
    orgNr: "",
    address: "",
    industry: "",
    lastContactedAt: "",
  });
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeQuery, setMergeQuery] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [relationsOpen, setRelationsOpen] = useState(false);

  const isPanel = variant === "panel";

  const detailQ = useQuery({
    queryKey: ["customer", entityId],
    queryFn: () => fetchDetail({ data: { entityId } }) as Promise<CustomerDetail>,
  });

  const customersQ = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchCustomers() as Promise<{ items: CustomerListItem[] }>,
    staleTime: 5 * 60_000,
    enabled: mergeOpen,
  });

  const mergeCandidates = useMemo(() => {
    const items = customersQ.data?.items ?? [];
    const q = mergeQuery.trim().toLowerCase();
    return items
      .filter((c) => c.entityId !== entityId)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 40);
  }, [customersQ.data?.items, entityId, mergeQuery]);

  const warmthMut = useMutation({
    mutationFn: (warmth: CustomerWarmth) => runWarmth({ data: { entityId, warmth } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ownerMut = useMutation({
    mutationFn: (ownerContext: OwnerContext) => runOwner({ data: { entityId, ownerContext } }),
    onSuccess: async () => {
      toast.success("Org oppdatert");
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMut = useMutation({
    mutationFn: (name: string) => runRename({ data: { entityId, name } }),
    onSuccess: async (res) => {
      toast.success("Navn oppdatert");
      setEditingName(false);
      setNameDraft(res.name);
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const profileMut = useMutation({
    mutationFn: () =>
      runProfile({
        data: {
          entityId,
          role: profileDraft.role || null,
          phone: profileDraft.phone || null,
          website: profileDraft.website || null,
          orgNr: profileDraft.orgNr || null,
          address: profileDraft.address || null,
          industry: profileDraft.industry || null,
          lastContactedAt: profileDraft.lastContactedAt || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Profil oppdatert");
      setEditingProfile(false);
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mergeMut = useMutation({
    mutationFn: (absorbEntityId: string) =>
      runMerge({ data: { keepEntityId: entityId, absorbEntityId } }),
    onSuccess: async (res) => {
      toast.success(`Slo sammen «${res.absorbedName}» inn i denne`);
      setMergeOpen(false);
      setMergeTargetId("");
      setMergeQuery("");
      setMoreOpen(false);
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["field-board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => runReject({ data: { entityId } }),
    onSuccess: async () => {
      toast.success("Fjernet — kommer ikke tilbake");
      await qc.invalidateQueries({ queryKey: ["customers"] });
      if (onClose) onClose();
      else void navigate({ to: "/kontakter" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fieldMut = useMutation({
    mutationFn: () => runEnsureField({ data: { entityId } }),
    onSuccess: async () => {
      toast.success("Lagt til i Felt");
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["field-board"] });
    },
  });

  const scheduleMut = useMutation({
    mutationFn: (input: { action: string; preset: FollowUpPreset; pickDate?: string }) =>
      runScheduleFollowUp({
        data: {
          entityId,
          action: input.action,
          preset: input.preset,
          followUpDate: input.pickDate ?? null,
        },
      }),
    onSuccess: async (res) => {
      toast.success(`Oppfølging planlagt ${res.dueLabel}`);
      setTab("oppfolging");
      await qc.invalidateQueries({ queryKey: ["customer", entityId] });
      await qc.invalidateQueries({ queryKey: ["customers"] });
      await qc.invalidateQueries({ queryKey: ["field-board"] });
      await qc.invalidateQueries({ queryKey: ["morning-mission"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d = detailQ.data;
  const metaEmail = typeof d?.metadata.email === "string" ? d.metadata.email : null;
  const metaDomain = typeof d?.metadata.email_domain === "string" ? d.metadata.email_domain : null;
  const metaRole =
    typeof d?.metadata.role === "string"
      ? d.metadata.role
      : typeof d?.metadata.title === "string"
        ? d.metadata.title
        : null;
  const metaIndustry = typeof d?.metadata.industry === "string" ? d.metadata.industry : null;
  const metaPhone = typeof d?.metadata.phone === "string" ? d.metadata.phone : null;
  const metaWebsite = typeof d?.metadata.website === "string" ? d.metadata.website : null;
  const metaOrgNr = typeof d?.metadata.org_nr === "string" ? d.metadata.org_nr : null;
  const metaAddress = typeof d?.metadata.address === "string" ? d.metadata.address : null;
  const lastContactedDate = typeof d?.lastSeenAt === "string" ? d.lastSeenAt.slice(0, 10) : "";
  const notesFacts =
    Array.isArray(d?.metadata.notes_facts) &&
    (d.metadata.notes_facts as unknown[]).filter((x): x is string => typeof x === "string");

  function openProfileEdit() {
    if (!d) return;
    setProfileDraft({
      role: metaRole ?? "",
      phone: metaPhone ?? "",
      website: metaWebsite ?? "",
      orgNr: metaOrgNr ?? "",
      address: metaAddress ?? "",
      industry: metaIndustry ?? "",
      lastContactedAt: lastContactedDate,
    });
    tryOpenSheet(() => setEditingProfile(true));
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-background",
        isPanel ? "h-full" : "min-h-screen",
        className,
      )}
    >
      <div
        data-sheet-scroll={isPanel ? true : undefined}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          isPanel ? "px-4 pb-6 pt-1" : "mx-auto w-full max-w-lg flex-1 px-4 pb-8 pt-3",
        )}
      >
        {!isPanel && (
          <Link
            to="/kontakter"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Alle kontakter
          </Link>
        )}

        {detailQ.isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {detailQ.isError && (
          <p className="text-sm text-destructive">
            {detailQ.error instanceof Error ? detailQ.error.message : "Kunne ikke hente kontakt"}
          </p>
        )}

        {d && (
          <>
            {/* Hero */}
            <header className="mb-4">
              <div className="flex items-start gap-3">
                <RelationAvatar
                  name={d.name}
                  entityType={d.entityType}
                  imageUrl={d.imageUrl}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">{d.name}</h1>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 rounded-xl"
                      onClick={() => tryOpenSheet(() => setMoreOpen(true))}
                      aria-label="Mer"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${warmthClass(d.warmth)}`}
                    >
                      {CUSTOMER_WARMTH_LABEL[d.warmth]}
                    </span>
                    {d.relatedCompanies[0] && (
                      <span className="text-sm text-muted-foreground">
                        {d.relatedCompanies[0].name}
                      </span>
                    )}
                    {metaRole && !d.relatedCompanies[0] && (
                      <span className="text-sm text-muted-foreground">{metaRole}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {metaPhone && (
                  <Button asChild variant="outline" className="h-11 flex-1 gap-1.5 rounded-xl">
                    <a href={`tel:${metaPhone.replace(/\s+/g, "")}`}>
                      <Phone className="h-4 w-4" />
                      Ring
                    </a>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 gap-1.5 rounded-xl"
                  onClick={() => {
                    if (metaEmail) {
                      window.location.href = `mailto:${metaEmail}`;
                      return;
                    }
                    tryOpenSheet(() => setEmailOpen(true));
                  }}
                >
                  <Mail className="h-4 w-4" />
                  Mail
                </Button>
                {metaWebsite && (
                  <Button asChild variant="outline" className="h-11 flex-1 gap-1.5 rounded-xl">
                    <a href={metaWebsite} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Web
                    </a>
                  </Button>
                )}
              </div>

              <div className="mt-4">
                {d.followUp ? (
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setTab("oppfolging")}
                  >
                    <NextStepPanel
                      action={`${d.followUp.overdue ? "Følg opp " : ""}${d.followUp.dueLabel}${d.followUp.action ? ` · ${d.followUp.action}` : ""}`}
                    />
                  </button>
                ) : (
                  <Button
                    type="button"
                    className="h-11 w-full rounded-xl"
                    onClick={() => setTab("oppfolging")}
                  >
                    Planlegg oppfølging
                  </Button>
                )}
              </div>
            </header>

            {/* Tabs */}
            <div className="mb-4 flex gap-1 rounded-xl bg-muted/50 p-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition-colors",
                    tab === t.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "aktivitet" && (
              <section className="space-y-3">
                {d.timeline.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                    {d.lastFieldResult
                      ? `${FIELD_RESULT_LABEL[d.lastFieldResult]}${d.lastFieldNote ? ` — ${d.lastFieldNote}` : ""}`
                      : "Ingen aktivitet ennå. Mail, Slack og Felt lander her."}
                  </p>
                ) : (
                  <ol className="relative ml-2 space-y-0 border-l border-border">
                    {d.timeline.map((t) => (
                      <TimelineEvent
                        key={t.id}
                        atLabel={t.atLabel}
                        title={t.title}
                        detail={t.detail}
                        sourceKind={timelineSourceKind(t.source)}
                      />
                    ))}
                  </ol>
                )}
                {notesFacts && notesFacts.length > 0 && (
                  <section className="rounded-2xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold">Fra notater</h3>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">
                      {notesFacts.slice(0, 8).map((fact, i) => (
                        <li key={i}>{fact}</li>
                      ))}
                    </ul>
                  </section>
                )}
              </section>
            )}

            {tab === "oppfolging" && (
              <section className="space-y-3">
                <PlanFollowUpPanel
                  defaultAction={d.followUp?.action ?? ""}
                  existingLabel={
                    d.followUp
                      ? `${d.followUp.overdue ? "Forsinket · " : ""}${d.followUp.dueLabel}`
                      : null
                  }
                  busy={scheduleMut.isPending}
                  onSchedule={(input) => scheduleMut.mutate(input)}
                />
                {!d.isFieldPlace && (
                  <Button
                    variant="outline"
                    className="h-12 w-full gap-2 rounded-xl"
                    disabled={fieldMut.isPending}
                    onClick={() => fieldMut.mutate()}
                  >
                    <MapPin className="h-4 w-4" />
                    Vis i Felt-tavlen
                  </Button>
                )}
              </section>
            )}

            {tab === "om" && (
              <section className="space-y-3">
                <ContactAboutCard
                  name={d.name}
                  entityType={d.entityType}
                  warmth={d.warmth}
                  ownerContext={d.ownerContext}
                  companyName={d.relatedCompanies[0]?.name ?? null}
                  email={metaEmail}
                  domain={metaDomain}
                  role={metaRole}
                  industry={metaIndustry}
                  phone={metaPhone}
                  website={metaWebsite}
                  orgNr={metaOrgNr}
                  address={metaAddress}
                  lastSeenAtLabel={d.lastSeenAt ? formatOsloActivityDate(d.lastSeenAt) : null}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full gap-1.5 rounded-xl"
                  onClick={openProfileEdit}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rediger profil
                </Button>
              </section>
            )}
          </>
        )}
      </div>

      {/* Mer */}
      {moreOpen && d && (
        <PlatformSheet
          onClose={() => setMoreOpen(false)}
          size="sheet"
          detents={["full"]}
          zClassName="z-[70]"
          nest
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-8" data-sheet-scroll>
            <h2 className="text-lg font-semibold">Mer</h2>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Relasjonsstatus
              </p>
              <div className="flex flex-wrap gap-2">
                {(["cold", "waiting", "warm"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    disabled={warmthMut.isPending}
                    onClick={() => warmthMut.mutate(w)}
                    className={`min-h-10 rounded-full border px-3 text-sm font-medium ${
                      d.warmth === w
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {CUSTOMER_WARMTH_LABEL[w]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Org
              </p>
              <div className="flex flex-wrap gap-2">
                {OWNER_OPTIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    disabled={ownerMut.isPending}
                    onClick={() => ownerMut.mutate(o)}
                    className={`min-h-10 rounded-full border px-3 text-sm font-medium ${
                      d.ownerContext === o
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {CUSTOMER_ORG_FILTER_LABEL[o]}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-between rounded-xl"
                onClick={() => {
                  setNameDraft(d.name);
                  setEditingName(true);
                }}
              >
                Endre navn
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-between rounded-xl"
                onClick={() => tryOpenSheet(() => setEmailOpen(true))}
              >
                E-post
                <Mail className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full justify-between rounded-xl"
                onClick={() => tryOpenSheet(() => setRelationsOpen(true))}
              >
                Relasjoner
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>

            {editingName && (
              <form
                className="space-y-2 rounded-2xl border border-border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  renameMut.mutate(nameDraft);
                }}
              >
                <Input
                  value={nameDraft}
                  autoFocus
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-11 rounded-xl"
                  maxLength={200}
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    className="h-11 flex-1 rounded-xl"
                    disabled={renameMut.isPending || !nameDraft.trim()}
                  >
                    {renameMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Lagre"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 rounded-xl"
                    onClick={() => setEditingName(false)}
                  >
                    Avbryt
                  </Button>
                </div>
              </form>
            )}

            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Slå sammen</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Behold denne. Den andre slettes.
                  </p>
                </div>
                <GitMerge className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
              </div>
              {!mergeOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-11 w-full rounded-xl"
                  onClick={() => setMergeOpen(true)}
                >
                  Velg kontakt
                </Button>
              ) : (
                <div className="mt-3 space-y-3">
                  <Input
                    placeholder="Søk kontakt…"
                    value={mergeQuery}
                    onChange={(e) => setMergeQuery(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                    {customersQ.isLoading && (
                      <p className="px-2 py-3 text-sm text-muted-foreground">Laster…</p>
                    )}
                    {mergeCandidates.map((c) => (
                      <button
                        key={c.entityId}
                        type="button"
                        onClick={() => setMergeTargetId(c.entityId)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm ${
                          mergeTargetId === c.entityId
                            ? "bg-primary/10 text-foreground"
                            : "hover:bg-muted/60"
                        }`}
                      >
                        <RelationAvatar
                          name={c.name}
                          entityType={c.entityType}
                          imageUrl={c.imageUrl}
                          size="sm"
                        />
                        <span className="min-w-0 truncate font-medium">{c.name}</span>
                      </button>
                    ))}
                    {!customersQ.isLoading && mergeCandidates.length === 0 && (
                      <p className="px-2 py-3 text-sm text-muted-foreground">Ingen treff</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 flex-1 rounded-xl"
                      onClick={() => {
                        setMergeOpen(false);
                        setMergeTargetId("");
                        setMergeQuery("");
                      }}
                    >
                      Avbryt
                    </Button>
                    <Button
                      type="button"
                      className="h-11 flex-1 rounded-xl"
                      disabled={!mergeTargetId || mergeMut.isPending}
                      onClick={() => {
                        const target = mergeCandidates.find((c) => c.entityId === mergeTargetId);
                        if (
                          !window.confirm(
                            `Slå «${target?.name ?? "kontakten"}» inn i «${d.name}»?\n\n«${target?.name ?? "Den andre"}» slettes.`,
                          )
                        ) {
                          return;
                        }
                        mergeMut.mutate(mergeTargetId);
                      }}
                    >
                      {mergeMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Slå sammen"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <Button
              variant="ghost"
              className="h-10 w-full text-sm text-muted-foreground"
              disabled={rejectMut.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Fjern denne kontakten og ignorer tilknyttede e-poster/domener? Den opprettes ikke på nytt automatisk.",
                  )
                ) {
                  rejectMut.mutate();
                }
              }}
            >
              {rejectMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Dette stemmer ikke"
              )}
            </Button>

            <details className="rounded-xl bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
              <summary className="cursor-pointer font-medium">Teknisk</summary>
              <pre className="mt-2 whitespace-pre-wrap font-mono">
                {`entity_id: ${d.entityId}
slug: ${d.slug}
owner_context: ${d.ownerContext}${metaDomain ? `\nemail_domain: ${metaDomain}` : ""}`}
              </pre>
            </details>
          </div>
        </PlatformSheet>
      )}

      {editingProfile && d && (
        <PlatformSheet
          onClose={() => setEditingProfile(false)}
          size="sheet"
          detents={["full"]}
          zClassName="z-[70]"
          nest
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-8" data-sheet-scroll>
            <h2 className="text-lg font-semibold">Rediger profil</h2>
            <Input
              value={profileDraft.role}
              onChange={(e) =>
                setProfileDraft((p) => ({ ...p, role: e.target.value.slice(0, 120) }))
              }
              placeholder="Rolle / tittel"
              className="h-11 rounded-xl"
            />
            <Input
              value={profileDraft.phone}
              onChange={(e) =>
                setProfileDraft((p) => ({ ...p, phone: e.target.value.slice(0, 40) }))
              }
              placeholder="Telefon"
              className="h-11 rounded-xl"
            />
            <Input
              value={profileDraft.website}
              onChange={(e) =>
                setProfileDraft((p) => ({ ...p, website: e.target.value.slice(0, 200) }))
              }
              placeholder="Nettside"
              className="h-11 rounded-xl"
            />
            {d.entityType === "company" && (
              <>
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Hent fra Brønnøysund
                  </p>
                  <CompanyBrregSearch
                    disabled={profileMut.isPending || renameMut.isPending}
                    onSelect={(c: BrregCompanyHit) => {
                      const addr = [c.address, [c.postalCode, c.city].filter(Boolean).join(" ")]
                        .filter(Boolean)
                        .join(", ")
                        .slice(0, 200);
                      setProfileDraft((p) => ({
                        ...p,
                        orgNr: c.orgNr,
                        address: addr || p.address,
                        website: c.website?.slice(0, 200) || p.website,
                        industry: c.orgForm?.slice(0, 120) || p.industry,
                      }));
                      if (c.name && c.name !== d.name) {
                        renameMut.mutate(c.name);
                      }
                      toast.success(`Fylt fra Brreg · ${c.name}`);
                    }}
                  />
                </div>
                <Input
                  value={profileDraft.orgNr}
                  onChange={(e) =>
                    setProfileDraft((p) => ({
                      ...p,
                      orgNr: e.target.value.replace(/\D/g, "").slice(0, 9),
                    }))
                  }
                  placeholder="Org.nr"
                  inputMode="numeric"
                  className="h-11 rounded-xl"
                />
              </>
            )}
            <Input
              value={profileDraft.industry}
              onChange={(e) =>
                setProfileDraft((p) => ({ ...p, industry: e.target.value.slice(0, 120) }))
              }
              placeholder="Bransje"
              className="h-11 rounded-xl"
            />
            <Input
              value={profileDraft.address}
              onChange={(e) =>
                setProfileDraft((p) => ({ ...p, address: e.target.value.slice(0, 200) }))
              }
              placeholder="Adresse"
              className="h-11 rounded-xl"
            />
            <Input
              type="date"
              value={profileDraft.lastContactedAt}
              onChange={(e) =>
                setProfileDraft((p) => ({ ...p, lastContactedAt: e.target.value }))
              }
              className="h-11 rounded-xl"
              aria-label="Kontaktet sist"
            />
            <Button
              type="button"
              className="mt-2 h-12 w-full rounded-xl"
              disabled={profileMut.isPending}
              onClick={() => profileMut.mutate()}
            >
              {profileMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
            </Button>
          </div>
        </PlatformSheet>
      )}

      {emailOpen && d && (
        <PlatformSheet
          onClose={() => setEmailOpen(false)}
          size="sheet"
          detents={["full"]}
          zClassName="z-[70]"
          nest
        >
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-6" data-sheet-scroll>
            <ContactEmailSection
              entityId={entityId}
              contactName={d.name}
              email={d.email ?? metaEmail}
            />
          </div>
        </PlatformSheet>
      )}

      {relationsOpen && d && (
        <PlatformSheet
          onClose={() => setRelationsOpen(false)}
          size="sheet"
          detents={["full"]}
          zClassName="z-[70]"
          nest
        >
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-6" data-sheet-scroll>
            <ContactRelationsSection
              entityId={entityId}
              contactName={d.name}
              relations={d.relations ?? []}
              onOpenEntity={(id) => {
                setRelationsOpen(false);
                setMoreOpen(false);
                if (onOpenEntity) onOpenEntity(id);
                else void navigate({ to: "/kontakter/$entityId", params: { entityId: id } });
              }}
            />
          </div>
        </PlatformSheet>
      )}
    </div>
  );
}
