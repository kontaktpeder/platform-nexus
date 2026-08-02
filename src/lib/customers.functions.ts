// Customer catalog — company entities with warmth + field + timeline.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { FIELD_RESULT_LABEL, type FieldResult } from "@/lib/field/field.types";
import { formatOsloActivityDate, formatOsloDayLabel, osloDateKey } from "@/lib/field/field-dates";
import { ANCHOR_SLUG_SET, OWNER_CONTEXT_LABEL, type OwnerContext } from "@/lib/knowledge/types";
import { extractEmailDomain } from "@/lib/knowledge/entity-matcher";
import { relationImageUrl } from "@/lib/relation/avatar-url";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(v: unknown): any {
  return JSON.parse(JSON.stringify(v ?? null));
}

export type CustomerWarmth = "cold" | "waiting" | "warm" | "unknown";

export const CUSTOMER_WARMTH_LABEL: Record<CustomerWarmth, string> = {
  cold: "Kald",
  waiting: "Ventende",
  warm: "Varm",
  unknown: "Ukjent",
};

export const CUSTOMER_ORG_FILTERS = [
  "all",
  "gold-of-sicily",
  "peder-enk",
  "personal",
  "unknown",
] as const;

export type CustomerOrgFilter = (typeof CUSTOMER_ORG_FILTERS)[number];

export const CUSTOMER_ORG_FILTER_LABEL: Record<CustomerOrgFilter, string> = {
  all: "Alle",
  "gold-of-sicily": OWNER_CONTEXT_LABEL["gold-of-sicily"],
  "peder-enk": OWNER_CONTEXT_LABEL["peder-enk"],
  personal: OWNER_CONTEXT_LABEL.personal,
  unknown: "Uten org",
};

/** Map Platform org slug → Knowledge owner_context. Conservative — no guessing. */
export function ownerContextFromOrgSlug(orgSlug: string | null | undefined): OwnerContext | null {
  if (!orgSlug) return null;
  const s = orgSlug.toLowerCase().trim();
  if (s === "gold-of-sicily" || s.includes("sicily") || s.includes("gold-of")) {
    return "gold-of-sicily";
  }
  if (s === "peder-enk" || s.includes("peder-enk") || s === "enk") {
    return "peder-enk";
  }
  if (s === "personal" || s === "personlig") {
    return "personal";
  }
  return null;
}

export function normalizeOwnerContext(value: unknown): OwnerContext {
  if (
    value === "personal" ||
    value === "peder-enk" ||
    value === "gold-of-sicily" ||
    value === "unknown"
  ) {
    return value;
  }
  return "unknown";
}

export type CustomerListItem = {
  entityId: string;
  name: string;
  slug: string;
  summary: string | null;
  entityType: "person" | "company";
  warmth: CustomerWarmth;
  ownerContext: OwnerContext;
  isFieldPlace: boolean;
  lastSeenAt: string | null;
  lastSeenLabel: string | null;
  followUp: {
    id: string;
    dueAt: string;
    action: string;
    dueLabel: string;
    overdue: boolean;
  } | null;
  peopleCount: number;
  signalCount: number;
  companyName: string | null;
  imageUrl: string | null;
};

export type CustomerPerson = {
  entityId: string;
  name: string;
  relationshipKind: string;
  summary: string | null;
};

/** One relation edge as seen from the viewed contact. */
export type ContactRelation = {
  relationshipId: string;
  kind: string;
  /** out = viewed contact is from_entity, in = viewed contact is to_entity. */
  direction: "out" | "in";
  role: string | null;
  source: string;
  otherEntityId: string;
  otherName: string;
  otherType: string;
};

export type CustomerTimelineItem = {
  id: string;
  kind: "field" | "signal";
  at: string;
  atLabel: string;
  title: string;
  detail: string | null;
  source: string;
};

export type CustomerDetail = {
  entityId: string;
  name: string;
  slug: string;
  summary: string | null;
  entityType: "person" | "company";
  warmth: CustomerWarmth;
  ownerContext: OwnerContext;
  isFieldPlace: boolean;
  metadata: Record<string, unknown>;
  lastSeenAt: string | null;
  followUp: CustomerListItem["followUp"];
  lastFieldResult: FieldResult | null;
  lastFieldNote: string | null;
  people: CustomerPerson[];
  timeline: CustomerTimelineItem[];
  relatedCompanies: { entityId: string; name: string; kind: string }[];
  relations: ContactRelation[];
  email: string | null;
  imageUrl: string | null;
};

function warmthFromMetaAndFollowUp(
  meta: Record<string, unknown>,
  followUp: CustomerListItem["followUp"],
  hasRecentActivity: boolean,
): CustomerWarmth {
  const explicit = meta.relationship_warmth ?? meta.warmth ?? meta.field_warmth;
  if (explicit === "cold" || explicit === "waiting" || explicit === "warm") {
    return explicit;
  }
  if (followUp?.overdue) return "warm";
  if (followUp) return "waiting";
  if (hasRecentActivity) return "warm";
  if (meta.field_place === true) return "cold";
  return "unknown";
}

export const listCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const todayKey = osloDateKey();

    const [entitiesRes, followRes, actRes, relRes, sigRes, identityRes] = await Promise.all([
      supabase
        .from("entities")
        .select("id, name, slug, summary, metadata, last_seen_at, type, owner_context")
        .eq("user_id", userId)
        .in("type", ["company", "person"])
        .order("name"),
      supabase
        .from("field_follow_ups")
        .select("id, entity_id, action, due_at, status")
        .eq("user_id", userId)
        .eq("status", "open"),
      supabase
        .from("field_activities")
        .select("entity_id, occurred_at")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false }),
      supabase
        .from("entity_relationships")
        .select("from_entity_id, to_entity_id, kind")
        .eq("user_id", userId),
      supabase.from("entity_signals").select("entity_id").eq("user_id", userId),
      supabase
        .from("known_identities")
        .select("entity_id, email, domain, identity_type, external_key")
        .eq("user_id", userId)
        .not("entity_id", "is", null),
    ]);

    if (entitiesRes.error) throw entitiesRes.error;

    const entities = (entitiesRes.data ?? []).filter((c) => !ANCHOR_SLUG_SET.has(c.slug));
    const companies = entities.filter((e) => e.type === "company");
    const persons = entities.filter((e) => e.type === "person");
    const companyIds = new Set(companies.map((c) => c.id));
    const personIdSet = new Set(persons.map((p) => p.id));
    const companyNameById = new Map(companies.map((c) => [c.id, c.name]));

    const followByEntity = new Map<string, { id: string; action: string; due_at: string }>();
    for (const row of followRes.data ?? []) {
      const existing = followByEntity.get(row.entity_id);
      if (existing && existing.due_at <= row.due_at) continue;
      followByEntity.set(row.entity_id, {
        id: row.id,
        action: row.action,
        due_at: row.due_at,
      });
    }

    const recentActivity = new Set<string>();
    const cutoff = Date.now() - 14 * 86_400_000;
    for (const row of actRes.data ?? []) {
      if (new Date(row.occurred_at).getTime() >= cutoff) {
        recentActivity.add(row.entity_id);
      }
    }

    const peopleCount = new Map<string, number>();
    const personCompany = new Map<string, string>();
    const edges = relRes.data ?? [];
    for (const e of edges) {
      if (companyIds.has(e.from_entity_id) && personIdSet.has(e.to_entity_id)) {
        peopleCount.set(e.from_entity_id, (peopleCount.get(e.from_entity_id) ?? 0) + 1);
        if (!personCompany.has(e.to_entity_id)) personCompany.set(e.to_entity_id, e.from_entity_id);
      }
      if (companyIds.has(e.to_entity_id) && personIdSet.has(e.from_entity_id)) {
        peopleCount.set(e.to_entity_id, (peopleCount.get(e.to_entity_id) ?? 0) + 1);
        if (!personCompany.has(e.from_entity_id))
          personCompany.set(e.from_entity_id, e.to_entity_id);
      }
    }

    const signalCount = new Map<string, number>();
    for (const s of sigRes.data ?? []) {
      signalCount.set(s.entity_id, (signalCount.get(s.entity_id) ?? 0) + 1);
    }

    const emailByEntity = new Map<string, string>();
    const domainByEntity = new Map<string, string>();
    for (const row of identityRes.data ?? []) {
      if (!row.entity_id) continue;
      if (row.email && !emailByEntity.has(row.entity_id)) {
        emailByEntity.set(row.entity_id, row.email.toLowerCase());
      }
      const domain =
        row.domain ||
        (row.identity_type === "email_domain" ? row.external_key : null) ||
        (row.email ? extractEmailDomain(row.email) : null);
      if (domain && !domainByEntity.has(row.entity_id)) {
        domainByEntity.set(row.entity_id, domain.toLowerCase());
      }
    }

    function toListItem(
      c: (typeof entities)[number],
      entityType: "person" | "company",
    ): CustomerListItem {
      const meta = (c.metadata ?? {}) as Record<string, unknown>;
      const fu = followByEntity.get(c.id) ?? null;
      const followUp = fu
        ? {
            id: fu.id,
            dueAt: fu.due_at,
            action: fu.action,
            dueLabel: formatOsloDayLabel(fu.due_at, todayKey),
            overdue: osloDateKey(new Date(fu.due_at)) <= todayKey,
          }
        : null;
      const warmth = warmthFromMetaAndFollowUp(meta, followUp, recentActivity.has(c.id));
      const fromMeta = ownerContextFromOrgSlug(
        typeof meta.platform_org_slug === "string" ? meta.platform_org_slug : null,
      );
      const ownerContext = normalizeOwnerContext(c.owner_context ?? fromMeta ?? "unknown");
      const linkedCompanyId = entityType === "person" ? personCompany.get(c.id) : undefined;
      const email =
        (typeof meta.email === "string" ? meta.email : null) || emailByEntity.get(c.id) || null;
      const domain =
        (typeof meta.email_domain === "string" ? meta.email_domain : null) ||
        domainByEntity.get(c.id) ||
        (email ? extractEmailDomain(email) : null);
      return {
        entityId: c.id,
        name: c.name,
        slug: c.slug,
        summary: c.summary,
        entityType,
        warmth,
        ownerContext,
        isFieldPlace: meta.field_place === true,
        lastSeenAt: c.last_seen_at,
        lastSeenLabel: c.last_seen_at ? formatOsloActivityDate(c.last_seen_at) : null,
        followUp,
        peopleCount: entityType === "company" ? (peopleCount.get(c.id) ?? 0) : 0,
        signalCount: signalCount.get(c.id) ?? 0,
        companyName: linkedCompanyId ? (companyNameById.get(linkedCompanyId) ?? null) : null,
        imageUrl: relationImageUrl({
          entityType,
          email,
          domain,
          explicitUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
        }),
      };
    }

    const items: CustomerListItem[] = [
      ...companies.map((c) => toListItem(c, "company")),
      ...persons.map((p) => toListItem(p, "person")),
    ];

    // Sort: overdue follow-ups first, then warm, waiting, cold, unknown; then name
    const warmthRank: Record<CustomerWarmth, number> = {
      warm: 0,
      waiting: 1,
      cold: 2,
      unknown: 3,
    };
    items.sort((a, b) => {
      const aOver = a.followUp?.overdue ? 0 : 1;
      const bOver = b.followUp?.overdue ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      if (warmthRank[a.warmth] !== warmthRank[b.warmth]) {
        return warmthRank[a.warmth] - warmthRank[b.warmth];
      }
      return a.name.localeCompare(b.name, "nb");
    });

    const countsByOrg: Record<CustomerOrgFilter, number> = {
      all: items.length,
      "gold-of-sicily": 0,
      "peder-enk": 0,
      personal: 0,
      unknown: 0,
    };
    for (const i of items) {
      countsByOrg[i.ownerContext] = (countsByOrg[i.ownerContext] ?? 0) + 1;
    }

    return normalize({ items, todayKey, countsByOrg });
  });

export const getCustomerDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.entityId) throw new Error("entityId mangler");
    const todayKey = osloDateKey();

    const { data: company, error } = await supabase
      .from("entities")
      .select("id, name, slug, summary, metadata, last_seen_at, type, owner_context")
      .eq("user_id", userId)
      .eq("id", data.entityId)
      .maybeSingle();
    if (error) throw error;
    if (!company || (company.type !== "company" && company.type !== "person")) {
      throw new Error("Kontakt ikke funnet");
    }
    const entityType = company.type as "person" | "company";

    const [relsRes, signalsRes, actsRes, followRes] = await Promise.all([
      supabase
        .from("entity_relationships")
        .select("id, from_entity_id, to_entity_id, kind, metadata, source")
        .eq("user_id", userId)
        .or(`from_entity_id.eq.${data.entityId},to_entity_id.eq.${data.entityId}`),
      supabase
        .from("entity_signals")
        .select("id, source, signal_type, snippet, occurred_at, external_ref")
        .eq("user_id", userId)
        .eq("entity_id", data.entityId)
        .order("occurred_at", { ascending: false, nullsFirst: false })
        .limit(40),
      supabase
        .from("field_activities")
        .select("id, result, note, next_action, occurred_at")
        .eq("user_id", userId)
        .eq("entity_id", data.entityId)
        .order("occurred_at", { ascending: false })
        .limit(40),
      supabase
        .from("field_follow_ups")
        .select("id, action, due_at, condition_type, status")
        .eq("user_id", userId)
        .eq("entity_id", data.entityId)
        .eq("status", "open")
        .order("due_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const otherIds = new Set<string>();
    for (const r of relsRes.data ?? []) {
      otherIds.add(r.from_entity_id === data.entityId ? r.to_entity_id : r.from_entity_id);
    }

    let relatedEntities: {
      id: string;
      name: string;
      type: string;
      summary: string | null;
    }[] = [];
    if (otherIds.size) {
      const { data: ents } = await supabase
        .from("entities")
        .select("id, name, type, summary")
        .eq("user_id", userId)
        .in("id", Array.from(otherIds));
      relatedEntities = ents ?? [];
    }
    const byId = new Map(relatedEntities.map((e) => [e.id, e]));

    const people: CustomerPerson[] = [];
    const relatedCompanies: CustomerDetail["relatedCompanies"] = [];
    const relations: ContactRelation[] = [];
    for (const r of relsRes.data ?? []) {
      const direction: "out" | "in" = r.from_entity_id === data.entityId ? "out" : "in";
      const otherId = r.from_entity_id === data.entityId ? r.to_entity_id : r.from_entity_id;
      const other = byId.get(otherId);
      if (!other) continue;
      const relMeta = (r.metadata ?? {}) as Record<string, unknown>;
      relations.push({
        relationshipId: r.id,
        kind: r.kind,
        direction,
        role: typeof relMeta.role === "string" && relMeta.role.trim() ? relMeta.role.trim() : null,
        source: r.source ?? "auto",
        otherEntityId: other.id,
        otherName: other.name,
        otherType: other.type,
      });
      if (other.type === "person") {
        people.push({
          entityId: other.id,
          name: other.name,
          relationshipKind: r.kind,
          summary: other.summary,
        });
      } else if (other.type === "company" || other.type === "project") {
        relatedCompanies.push({
          entityId: other.id,
          name: other.name,
          kind: r.kind,
        });
      }
    }

    const timeline: CustomerTimelineItem[] = [];
    for (const a of actsRes.data ?? []) {
      const result = a.result as FieldResult;
      timeline.push({
        id: `field:${a.id}`,
        kind: "field",
        at: a.occurred_at,
        atLabel: formatOsloActivityDate(a.occurred_at),
        title: FIELD_RESULT_LABEL[result] ?? a.result,
        detail: [a.note, a.next_action].filter(Boolean).join(" · ") || null,
        source: "felt",
      });
    }
    for (const s of signalsRes.data ?? []) {
      if (s.source === "field") continue; // already covered by activities
      const at = s.occurred_at ?? "";
      timeline.push({
        id: `signal:${s.id}`,
        kind: "signal",
        at,
        atLabel: at ? formatOsloActivityDate(at) : "—",
        title: s.snippet || `${s.source} · ${s.signal_type}`,
        detail: null,
        source: s.source,
      });
    }
    timeline.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

    const meta = (company.metadata ?? {}) as Record<string, unknown>;
    const fuRow = followRes.data;
    const followUp = fuRow
      ? {
          id: fuRow.id,
          dueAt: fuRow.due_at,
          action: fuRow.action,
          dueLabel: formatOsloDayLabel(fuRow.due_at, todayKey),
          overdue: osloDateKey(new Date(fuRow.due_at)) <= todayKey,
        }
      : null;

    const latestAct = actsRes.data?.[0] ?? null;
    const fromMeta = ownerContextFromOrgSlug(
      typeof meta.platform_org_slug === "string" ? meta.platform_org_slug : null,
    );

    const { data: linkedIds } = await supabase
      .from("known_identities")
      .select("email, domain, identity_type, external_key")
      .eq("user_id", userId)
      .eq("entity_id", data.entityId)
      .limit(8);
    let email = typeof meta.email === "string" ? meta.email : null;
    let domain = typeof meta.email_domain === "string" ? meta.email_domain : null;
    for (const row of linkedIds ?? []) {
      if (!email && row.email) email = row.email;
      if (!domain && row.domain) domain = row.domain;
      if (!domain && row.identity_type === "email_domain") domain = row.external_key;
    }
    if (!domain && email) domain = extractEmailDomain(email);

    const detail: CustomerDetail = {
      entityId: company.id,
      name: company.name,
      slug: company.slug,
      summary: company.summary,
      entityType,
      warmth: warmthFromMetaAndFollowUp(meta, followUp, !!latestAct),
      ownerContext: normalizeOwnerContext(company.owner_context ?? fromMeta ?? "unknown"),
      isFieldPlace: meta.field_place === true,
      metadata: meta,
      lastSeenAt: company.last_seen_at,
      followUp,
      lastFieldResult: (latestAct?.result as FieldResult) ?? null,
      lastFieldNote: latestAct?.note ?? null,
      people,
      timeline: timeline.slice(0, 50),
      relatedCompanies,
      relations,
      email,
      imageUrl: relationImageUrl({
        entityType,
        email,
        domain,
        explicitUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
      }),
    };

    return normalize(detail);
  });

export const setCustomerWarmth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId: string; warmth: CustomerWarmth }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const warmth = data.warmth;
    if (!["cold", "waiting", "warm", "unknown"].includes(warmth)) {
      throw new Error("Ugyldig status");
    }
    const { data: row, error } = await supabase
      .from("entities")
      .select("metadata")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Ikke funnet");
    const meta = {
      ...((row.metadata ?? {}) as Record<string, unknown>),
      relationship_warmth: warmth,
      field_place: true,
    };
    const { error: upErr } = await supabase
      .from("entities")
      .update({ metadata: meta as never })
      .eq("id", data.entityId)
      .eq("user_id", userId);
    if (upErr) throw upErr;
    return { ok: true, warmth };
  });

export const ensureFieldPlace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("entities")
      .select("metadata")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Ikke funnet");
    const meta = {
      ...((row.metadata ?? {}) as Record<string, unknown>),
      field_place: true,
    };
    await supabase
      .from("entities")
      .update({ metadata: meta as never })
      .eq("id", data.entityId)
      .eq("user_id", userId);
    return { ok: true };
  });

export const setCustomerOwnerContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId: string; ownerContext: OwnerContext }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ownerContext = normalizeOwnerContext(data.ownerContext);
    const { data: row, error } = await supabase
      .from("entities")
      .select("metadata")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Ikke funnet");

    const meta = {
      ...((row.metadata ?? {}) as Record<string, unknown>),
    };
    if (ownerContext !== "unknown") {
      meta.platform_org_slug = ownerContext;
    }

    const { error: upErr } = await supabase
      .from("entities")
      .update({
        owner_context: ownerContext as never,
        metadata: meta as never,
      })
      .eq("id", data.entityId)
      .eq("user_id", userId);
    if (upErr) throw upErr;
    return { ok: true, ownerContext };
  });

/** Rename a customer company (simple correction when AI got the name wrong). */
export const renameCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId: string; name: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = String(data.name ?? "")
      .trim()
      .slice(0, 200);
    if (!name) throw new Error("Navn kan ikke være tomt");

    const { data: row, error } = await supabase
      .from("entities")
      .select("id, type, slug")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Ikke funnet");
    if (row.type !== "company") throw new Error("Bare selskaper kan endres her");
    if (ANCHOR_SLUG_SET.has(row.slug as string)) {
      throw new Error("Kontekst-anchor kan ikke endres her");
    }

    const { error: upErr } = await supabase
      .from("entities")
      .update({ name })
      .eq("id", data.entityId)
      .eq("user_id", userId);
    if (upErr) throw upErr;
    return { ok: true, name };
  });

/**
 * Update CRM-style profile fields on a person/company (proff.no / Gulesider style).
 * Empty strings clear the field. lastContactedAt is YYYY-MM-DD → last_seen_at.
 */
export const updateContactProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entityId: z.string().uuid(),
        role: z.string().max(120).nullable().optional(),
        phone: z.string().max(40).nullable().optional(),
        website: z.string().max(200).nullable().optional(),
        orgNr: z.string().max(20).nullable().optional(),
        address: z.string().max(200).nullable().optional(),
        industry: z.string().max(120).nullable().optional(),
        lastContactedAt: z.string().max(32).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("entities")
      .select("id, type, metadata")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Kontakt ikke funnet");
    if (row.type !== "person" && row.type !== "company") {
      throw new Error("Bare person/selskap kan oppdateres her");
    }

    const meta: Record<string, unknown> = {
      ...((row.metadata ?? {}) as Record<string, unknown>),
    };
    const setOrClear = (key: string, value: string | null | undefined) => {
      if (value === undefined) return;
      const t = (value ?? "").trim();
      if (!t) delete meta[key];
      else meta[key] = t;
    };

    setOrClear("role", data.role);
    if (data.phone !== undefined) {
      const phone = (data.phone ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!phone) delete meta.phone;
      else meta.phone = phone;
    }
    if (data.website !== undefined) {
      let website = (data.website ?? "").trim().slice(0, 200);
      if (!website) delete meta.website;
      else {
        if (!/^https?:\/\//i.test(website) && /^[\w.-]+\.[a-z]{2,}/i.test(website)) {
          website = `https://${website}`;
        }
        meta.website = website;
      }
    }
    if (data.orgNr !== undefined) {
      const digits = (data.orgNr ?? "").replace(/\D/g, "").slice(0, 9);
      if (!digits) delete meta.org_nr;
      else meta.org_nr = digits;
    }
    setOrClear("address", data.address);
    setOrClear("industry", data.industry);

    let lastSeenAt: string | undefined;
    if (data.lastContactedAt !== undefined) {
      const m = (data.lastContactedAt ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
      if (m?.[1]) {
        const { osloNoonIso } = await import("@/lib/field/field-dates");
        lastSeenAt = osloNoonIso(m[1]);
      }
    }

    const { error: upErr } = await supabase
      .from("entities")
      .update({
        metadata: meta as never,
        ...(lastSeenAt ? { last_seen_at: lastSeenAt } : {}),
      })
      .eq("id", data.entityId)
      .eq("user_id", userId);
    if (upErr) throw upErr;
    return { ok: true };
  });

async function rewireEntityId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  table: string,
  column: string,
  fromId: string,
  toId: string,
) {
  const { error } = await supabase
    .from(table)
    .update({ [column]: toId })
    .eq("user_id", userId)
    .eq(column, fromId);
  if (error) {
    // Table may not exist in older DBs — don't abort the whole merge.
    console.warn(`[mergeCustomers] ${table}.${column}`, error.message);
  }
}

/** Shared merge body — used by mergeCustomers and assistant applySuggestedMerge. */
export async function performCompanyMerge(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  keepId: string,
  absorbId: string,
) {
  if (keepId === absorbId) throw new Error("Kan ikke slå sammen en kunde med seg selv");

  const { data: rows, error } = await supabase
    .from("entities")
    .select("id, name, type, slug, metadata, owner_context")
    .eq("user_id", userId)
    .in("id", [keepId, absorbId]);
  if (error) throw error;

  const keep = (rows ?? []).find((r: { id: string }) => r.id === keepId);
  const absorb = (rows ?? []).find((r: { id: string }) => r.id === absorbId);
  if (!keep || !absorb) throw new Error("Kunde ikke funnet");
  if (keep.type !== "company" || absorb.type !== "company") {
    throw new Error("Bare selskaper kan slås sammen her");
  }
  if (ANCHOR_SLUG_SET.has(keep.slug as string) || ANCHOR_SLUG_SET.has(absorb.slug as string)) {
    throw new Error("Kontekst-anchor kan ikke slås sammen");
  }

  await rewireEntityId(supabase, userId, "known_identities", "entity_id", absorbId, keepId);
  await rewireEntityId(supabase, userId, "entity_signals", "entity_id", absorbId, keepId);
  await rewireEntityId(supabase, userId, "field_activities", "entity_id", absorbId, keepId);
  await rewireEntityId(supabase, userId, "field_follow_ups", "entity_id", absorbId, keepId);
  await rewireEntityId(supabase, userId, "user_commitments", "entity_id", absorbId, keepId);
  await rewireEntityId(supabase, userId, "context_summaries", "entity_id", absorbId, keepId);

  await supabase
    .from("entity_relationships")
    .update({ from_entity_id: keepId })
    .eq("user_id", userId)
    .eq("from_entity_id", absorbId);
  await supabase
    .from("entity_relationships")
    .update({ to_entity_id: keepId })
    .eq("user_id", userId)
    .eq("to_entity_id", absorbId);

  await supabase
    .from("entity_relationships")
    .delete()
    .eq("user_id", userId)
    .eq("from_entity_id", keepId)
    .eq("to_entity_id", keepId);

  await supabase
    .from("relation_suggestions")
    .update({ from_entity_id: keepId })
    .eq("user_id", userId)
    .eq("from_entity_id", absorbId);
  await supabase
    .from("relation_suggestions")
    .update({ to_entity_id: keepId })
    .eq("user_id", userId)
    .eq("to_entity_id", absorbId);

  const keepMeta = { ...((keep.metadata ?? {}) as Record<string, unknown>) };
  const absorbMeta = (absorb.metadata ?? {}) as Record<string, unknown>;
  if (absorbMeta.field_place === true) keepMeta.field_place = true;
  for (const key of [
    "email",
    "email_domain",
    "phone",
    "website",
    "org_nr",
    "address",
    "relationship_warmth",
  ] as const) {
    if (!keepMeta[key] && absorbMeta[key]) keepMeta[key] = absorbMeta[key];
  }
  const mergedAliases = new Set<string>();
  for (const a of [
    ...(Array.isArray(keepMeta.merged_names) ? keepMeta.merged_names : []),
    absorb.name,
  ]) {
    if (typeof a === "string" && a.trim()) mergedAliases.add(a.trim());
  }
  keepMeta.merged_names = [...mergedAliases];

  let ownerContext = keep.owner_context as string | null;
  if (
    (!ownerContext || ownerContext === "unknown") &&
    absorb.owner_context &&
    absorb.owner_context !== "unknown"
  ) {
    ownerContext = absorb.owner_context as string;
  }

  await supabase
    .from("entities")
    .update({
      metadata: keepMeta as never,
      owner_context: (ownerContext ?? "unknown") as never,
    })
    .eq("id", keepId)
    .eq("user_id", userId);

  const { error: delErr } = await supabase
    .from("entities")
    .delete()
    .eq("id", absorbId)
    .eq("user_id", userId);
  if (delErr) throw delErr;

  return {
    ok: true as const,
    keepEntityId: keepId,
    keepName: keep.name as string,
    absorbedName: absorb.name as string,
  };
}

/**
 * Merge absorb company into keep company.
 * Identities, field, signals, relationships move to keep; absorb is deleted.
 */
export const mergeCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { keepEntityId: string; absorbEntityId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    return performCompanyMerge(supabase, userId, data.keepEntityId, data.absorbEntityId);
  });

const RELATION_KINDS = [
  "works_on",
  "customer_of",
  "member_of",
  "owns",
  "blocked_by",
  "related_to",
] as const;

/**
 * Manually link two contacts, e.g. «Fredrik jobber i Oslo Bowling og Bar
 * (Daglig leder)» or «Holding AS eier Oslo Bowling og Bar».
 * Role is free text stored in metadata.role.
 */
export const addContactRelation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      entityId: string;
      otherEntityId: string;
      kind: string;
      direction: "out" | "in";
      role?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(RELATION_KINDS as readonly string[]).includes(data.kind)) {
      throw new Error("Ugyldig relasjonstype");
    }
    if (!data.entityId || !data.otherEntityId) throw new Error("Kontakt mangler");
    if (data.entityId === data.otherEntityId) {
      throw new Error("Kan ikke koble en kontakt til seg selv");
    }

    const { data: ents, error } = await supabase
      .from("entities")
      .select("id")
      .eq("user_id", userId)
      .in("id", [data.entityId, data.otherEntityId]);
    if (error) throw error;
    if ((ents ?? []).length !== 2) throw new Error("Kontakt ikke funnet");

    const fromId = data.direction === "in" ? data.otherEntityId : data.entityId;
    const toId = data.direction === "in" ? data.entityId : data.otherEntityId;
    const role = typeof data.role === "string" ? data.role.trim().slice(0, 120) : "";

    const { data: row, error: upErr } = await supabase
      .from("entity_relationships")
      .upsert(
        {
          user_id: userId,
          from_entity_id: fromId,
          to_entity_id: toId,
          kind: data.kind as never,
          source: "manual",
          metadata: (role ? { role } : {}) as never,
        },
        { onConflict: "user_id,from_entity_id,to_entity_id,kind" },
      )
      .select("id")
      .single();
    if (upErr) throw upErr;
    return { ok: true, relationshipId: row.id as string };
  });

export const removeContactRelation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { relationshipId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("entity_relationships")
      .delete()
      .eq("id", data.relationshipId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });

/**
 * Set a contact's email address manually. Writes both entity metadata and a
 * known_identities row so future inbound mail auto-links to this contact.
 */
export const setContactEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { entityId: string; email: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const email = String(data.email ?? "")
      .trim()
      .toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Ugyldig e-postadresse");
    }
    const domain = extractEmailDomain(email);

    const { data: row, error } = await supabase
      .from("entities")
      .select("id, metadata")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Kontakt ikke funnet");

    const meta: Record<string, unknown> = {
      ...((row.metadata ?? {}) as Record<string, unknown>),
      email,
    };
    if (domain) meta.email_domain = domain;
    const { error: upErr } = await supabase
      .from("entities")
      .update({ metadata: meta as never })
      .eq("id", data.entityId)
      .eq("user_id", userId);
    if (upErr) throw upErr;

    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from("known_identities")
      .select("id")
      .eq("user_id", userId)
      .eq("identity_type", "email_address")
      .eq("external_key", email)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      await supabase
        .from("known_identities")
        .update({ entity_id: data.entityId, ignored_at: null, last_seen_at: now })
        .eq("id", existing.id)
        .eq("user_id", userId);
    } else {
      await supabase.from("known_identities").insert({
        user_id: userId,
        provider: "manual",
        identity_type: "email_address",
        external_key: email,
        email,
        domain: domain ?? null,
        entity_id: data.entityId,
        first_seen_at: now,
        last_seen_at: now,
      });
    }

    return { ok: true, email };
  });
