// Relations section on the contact page — proff.no for your own network.
// Shows who works where, who owns what, and lets you link contacts manually.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Loader2, Plus, Users, X } from "lucide-react";
import { toast } from "sonner";
import { RelationAvatar } from "./RelationAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addContactRelation,
  listCustomers,
  removeContactRelation,
  type ContactRelation,
  type CustomerListItem,
} from "@/lib/customers.functions";
import { relationshipLabelNo } from "@/lib/knowledge/types";

/** Options phrased from the viewed contact's perspective. */
const REL_OPTIONS = [
  { id: "member_of:out", label: "Jobber i", kind: "member_of", direction: "out" },
  { id: "member_of:in", label: "Har ansatt", kind: "member_of", direction: "in" },
  { id: "owns:out", label: "Eier", kind: "owns", direction: "out" },
  { id: "owns:in", label: "Eies av", kind: "owns", direction: "in" },
  { id: "customer_of:out", label: "Kunde av", kind: "customer_of", direction: "out" },
  { id: "customer_of:in", label: "Har kunde", kind: "customer_of", direction: "in" },
  { id: "works_on:out", label: "Jobber med", kind: "works_on", direction: "out" },
  { id: "related_to:out", label: "Relatert til", kind: "related_to", direction: "out" },
] as const;

type RelOptionId = (typeof REL_OPTIONS)[number]["id"];

function EntityJump({
  entityId,
  onOpenEntity,
  className,
  children,
}: {
  entityId: string;
  onOpenEntity?: (id: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  if (onOpenEntity) {
    return (
      <button type="button" className={className} onClick={() => onOpenEntity(entityId)}>
        {children}
      </button>
    );
  }
  return (
    <Link to="/kontakter/$entityId" params={{ entityId }} className={className}>
      {children}
    </Link>
  );
}

function RelationRow({
  relation,
  onOpenEntity,
  onRemove,
  removing,
}: {
  relation: ContactRelation;
  onOpenEntity?: (id: string) => void;
  onRemove: (relationshipId: string) => void;
  removing: boolean;
}) {
  const label = relationshipLabelNo(relation.kind, relation.direction);
  const detail = relation.role ? `${label} · ${relation.role}` : label;
  return (
    <li className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
      <EntityJump
        entityId={relation.otherEntityId}
        onOpenEntity={onOpenEntity}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <RelationAvatar
          name={relation.otherName}
          entityType={relation.otherType === "person" ? "person" : "company"}
          size="sm"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{relation.otherName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {detail}
            {relation.source === "manual" ? "" : " · auto"}
          </p>
        </div>
      </EntityJump>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground"
        disabled={removing}
        aria-label={`Fjern kobling til ${relation.otherName}`}
        onClick={() => {
          if (window.confirm(`Fjerne koblingen til ${relation.otherName}?`)) {
            onRemove(relation.relationshipId);
          }
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}

export function ContactRelationsSection({
  entityId,
  contactName,
  relations,
  onOpenEntity,
}: {
  entityId: string;
  contactName: string;
  relations: ContactRelation[];
  onOpenEntity?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const runAdd = useServerFn(addContactRelation);
  const runRemove = useServerFn(removeContactRelation);
  const fetchCustomers = useServerFn(listCustomers);

  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [optionId, setOptionId] = useState<RelOptionId>("member_of:out");
  const [role, setRole] = useState("");

  const customersQ = useQuery({
    queryKey: ["customers"],
    queryFn: () => fetchCustomers() as Promise<{ items: CustomerListItem[] }>,
    staleTime: 5 * 60_000,
    enabled: addOpen,
  });

  const candidates = useMemo(() => {
    const items = customersQ.data?.items ?? [];
    const q = query.trim().toLowerCase();
    return items
      .filter((c) => c.entityId !== entityId)
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [customersQ.data?.items, entityId, query]);

  const picked = candidates.find((c) => c.entityId === pickedId) ?? null;

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: ["customer", entityId] });
    await qc.invalidateQueries({ queryKey: ["customers"] });
  }

  const addMut = useMutation({
    mutationFn: () => {
      const opt = REL_OPTIONS.find((o) => o.id === optionId)!;
      return runAdd({
        data: {
          entityId,
          otherEntityId: pickedId,
          kind: opt.kind,
          direction: opt.direction,
          role: role.trim() || null,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Relasjon lagt til");
      setAddOpen(false);
      setPickedId("");
      setQuery("");
      setRole("");
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (relationshipId: string) => runRemove({ data: { relationshipId } }),
    onSuccess: async () => {
      toast.success("Relasjon fjernet");
      await invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const persons = relations.filter((r) => r.otherType === "person");
  const orgs = relations.filter((r) => r.otherType !== "person");

  return (
    <section id="kontakt-relasjoner" className="mb-8 scroll-mt-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Relasjoner
          </h2>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 rounded-xl"
          onClick={() => setAddOpen((v) => !v)}
        >
          <Plus className="h-4 w-4" />
          Legg til
        </Button>
      </div>

      {addOpen && (
        <div className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-3">
          <p className="text-sm font-medium">{contactName} …</p>
          <div className="flex flex-wrap gap-1.5">
            {REL_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOptionId(o.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  optionId === o.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground"
                }`}
              >
                {o.label.toLowerCase()}
              </button>
            ))}
          </div>

          {picked ? (
            <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2">
              <RelationAvatar
                name={picked.name}
                entityType={picked.entityType}
                imageUrl={picked.imageUrl}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate font-medium">{picked.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={() => setPickedId("")}
                aria-label="Velg en annen kontakt"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Søk kontakt eller selskap…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 rounded-xl"
              />
              <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                {customersQ.isLoading && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Laster…</p>
                )}
                {candidates.map((c) => (
                  <button
                    key={c.entityId}
                    type="button"
                    onClick={() => setPickedId(c.entityId)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/60"
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
                {!customersQ.isLoading && candidates.length === 0 && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Ingen treff</p>
                )}
              </div>
            </>
          )}

          <Input
            placeholder="Rolle (valgfritt) — f.eks. Daglig leder"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={120}
            className="h-11 rounded-xl"
          />

          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-11 flex-1 rounded-xl"
              onClick={() => {
                setAddOpen(false);
                setPickedId("");
                setQuery("");
                setRole("");
              }}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              className="h-11 flex-1 rounded-xl"
              disabled={!pickedId || addMut.isPending}
              onClick={() => addMut.mutate()}
            >
              {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Koble"}
            </Button>
          </div>
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold">Personer ({persons.length})</h3>
      {persons.length === 0 ? (
        <p className="mb-4 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Ingen personer koblet ennå. Bruk «Legg til», eller la mail/Slack foreslå.
        </p>
      ) : (
        <ul className="mb-4 space-y-2">
          {persons.map((r) => (
            <RelationRow
              key={r.relationshipId}
              relation={r}
              onOpenEntity={onOpenEntity}
              onRemove={(id) => removeMut.mutate(id)}
              removing={removeMut.isPending}
            />
          ))}
        </ul>
      )}

      <h3 className="mb-2 text-sm font-semibold">Selskaper og prosjekter ({orgs.length})</h3>
      {orgs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Ingen selskapskobling ennå — koble f.eks. arbeidsgiver eller eier.
        </p>
      ) : (
        <ul className="space-y-2">
          {orgs.map((r) => (
            <RelationRow
              key={r.relationshipId}
              relation={r}
              onOpenEntity={onOpenEntity}
              onRemove={(id) => removeMut.mutate(id)}
              removing={removeMut.isPending}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
