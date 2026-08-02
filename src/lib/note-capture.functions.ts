// Phone / meeting note capture — paste messy notes → AI proposes contacts,
// relations, follow-ups and facts → user accepts → persist in Nexus knowledge.
// Full text goes to raw_signals; timeline links via entity_signals.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai-gateway.server";
import { ANCHOR_SLUG_SET } from "@/lib/knowledge/types";
import { extractEmailDomain } from "@/lib/knowledge/entity-matcher";
import { addOsloDays, osloDateKey, osloNoonIso } from "@/lib/field/field-dates";

export type NoteContactProposal = {
  ref: string;
  name: string;
  entityType: "person" | "company";
  email: string | null;
  role: string | null;
  reason: string;
  existingEntityId: string | null;
  selected: boolean;
};

export type NoteRelationProposal = {
  fromRef: string;
  toRef: string;
  kind: "works_on" | "customer_of" | "member_of" | "owns" | "blocked_by" | "related_to";
  role: string | null;
  reason: string;
  selected: boolean;
};

export type NoteFollowUpProposal = {
  contactRef: string;
  action: string;
  duePreset: "today" | "tomorrow" | "in_3_days" | "next_week";
  reason: string;
  selected: boolean;
};

export type NoteFactProposal = {
  contactRef: string;
  fact: string;
  selected: boolean;
};

export type NoteParseResult = {
  summary: string;
  contacts: NoteContactProposal[];
  relations: NoteRelationProposal[];
  followUps: NoteFollowUpProposal[];
  facts: NoteFactProposal[];
  ideas: string[];
};

const AiContact = z.object({
  ref: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  entityType: z.enum(["person", "company"]),
  email: z.string().max(200).nullable().optional(),
  role: z.string().max(120).nullable().optional(),
  reason: z.string().max(240),
});

const AiRelation = z.object({
  fromRef: z.string().min(1).max(40),
  toRef: z.string().min(1).max(40),
  kind: z.enum(["works_on", "customer_of", "member_of", "owns", "blocked_by", "related_to"]),
  role: z.string().max(120).nullable().optional(),
  reason: z.string().max(240),
});

const AiFollowUp = z.object({
  contactRef: z.string().min(1).max(40),
  action: z.string().min(1).max(300),
  duePreset: z.enum(["today", "tomorrow", "in_3_days", "next_week"]),
  reason: z.string().max(240),
});

const AiFact = z.object({
  contactRef: z.string().min(1).max(40),
  fact: z.string().min(1).max(280),
});

const AiOutput = z.object({
  summary: z.string().max(500),
  contacts: z.array(AiContact).max(12),
  relations: z.array(AiRelation).max(12),
  followUps: z.array(AiFollowUp).max(8),
  facts: z.array(AiFact).max(16),
  ideas: z.array(z.string().max(280)).max(8),
});

function dueAtFromPreset(preset: NoteFollowUpProposal["duePreset"]): string {
  const today = osloDateKey();
  const offset =
    preset === "today" ? 0 : preset === "tomorrow" ? 1 : preset === "in_3_days" ? 3 : 7;
  return osloNoonIso(addOsloDays(today, offset));
}

async function matchExistingEntity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  name: string,
  entityType: "person" | "company",
  email: string | null,
): Promise<string | null> {
  if (email) {
    const { data: idRow } = await supabase
      .from("known_identities")
      .select("entity_id")
      .eq("user_id", userId)
      .eq("identity_type", "email_address")
      .eq("external_key", email.toLowerCase())
      .not("entity_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (idRow?.entity_id) return idRow.entity_id as string;
  }
  const { data: byName } = await supabase
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .eq("type", entityType)
    .ilike("name", name.trim())
    .limit(1)
    .maybeSingle();
  return (byName?.id as string) ?? null;
}

export const parsePhoneNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        note: z.string().min(10).max(20000),
        contextHint: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<NoteParseResult> => {
    const { supabase, userId } = context;
    if (!getGeminiApiKey()) {
      throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)");
    }

    const { data: existing } = await supabase
      .from("entities")
      .select("id, name, type, metadata")
      .eq("user_id", userId)
      .in("type", ["person", "company"])
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(80);

    const catalog = (existing ?? []).map((e) => ({
      name: e.name,
      type: e.type,
      email:
        typeof (e.metadata as Record<string, unknown>)?.email === "string"
          ? ((e.metadata as Record<string, unknown>).email as string)
          : null,
    }));

    const system = [
      "Du parser rå notater fra telefonsamtaler/møter for Nexus (Peder sitt nettverk).",
      "Notatet kan være rotete, med stavefeil og stikkord. Trekk ut struktur — ikke finn på fakta.",
      "Returner:",
      "- summary: 1–2 setninger på norsk om samtalen",
      "- contacts: personer og selskaper som nevnes (HMS Kontoret, Godmat, Thomas, Norgesgruppen, …)",
      "- relations: koblinger (member_of, related_to, customer_of, owns, works_on)",
      "- followUps: konkrete neste handlinger med contactRef og duePreset",
      "- facts: viktige fakta knyttet til en kontakt (vises på kontaktkortet)",
      "- ideas: strategiske ideer som ikke er harde oppfølginger",
      "Regler:",
      "- Bruk stabile refs (c1, c2…). Relasjoner og followUps/facts må peke på disse refs.",
      "- Preferer person for navngitte mennesker, company for bedrifter/kjeder.",
      "- Ikke opprett kontakt for generiske begreper (franchise, provisjon) uten egenaktør.",
      "- followUps skal være handlingsbare («Snakke med Godmat om det Thomas sa»).",
      "- Hvis eksisterende kontakter matcher, bruk samme navn slik at systemet kan koble dem.",
    ].join("\n");

    const prompt = JSON.stringify({
      note: data.note.slice(0, 12000),
      contextHint: data.contextHint ?? null,
      existingContacts: catalog,
    });

    let parsed: z.infer<typeof AiOutput>;
    try {
      const { output } = await generateText({
        model: getGeminiModel("flash"),
        system,
        prompt,
        output: Output.object({ schema: AiOutput }),
      });
      parsed = output;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        throw new Error("Klarte ikke å tolke notatet — prøv igjen");
      }
      throw err;
    }

    const contacts: NoteContactProposal[] = [];
    for (const c of parsed.contacts) {
      const email =
        typeof c.email === "string" && c.email.includes("@") ? c.email.trim().toLowerCase() : null;
      const existingId = await matchExistingEntity(supabase, userId, c.name, c.entityType, email);
      contacts.push({
        ref: c.ref,
        name: c.name.trim().slice(0, 120),
        entityType: c.entityType,
        email,
        role: c.role?.trim() || null,
        reason: c.reason.trim().slice(0, 240),
        existingEntityId: existingId,
        selected: true,
      });
    }

    const refs = new Set(contacts.map((c) => c.ref));
    const relations: NoteRelationProposal[] = parsed.relations
      .filter((r) => refs.has(r.fromRef) && refs.has(r.toRef) && r.fromRef !== r.toRef)
      .map((r) => ({
        fromRef: r.fromRef,
        toRef: r.toRef,
        kind: r.kind,
        role: r.role?.trim() || null,
        reason: r.reason.trim().slice(0, 240),
        selected: true,
      }));

    const followUps: NoteFollowUpProposal[] = parsed.followUps
      .filter((f) => refs.has(f.contactRef))
      .map((f) => ({
        contactRef: f.contactRef,
        action: f.action.trim().slice(0, 300),
        duePreset: f.duePreset,
        reason: f.reason.trim().slice(0, 240),
        selected: true,
      }));

    const facts: NoteFactProposal[] = parsed.facts
      .filter((f) => refs.has(f.contactRef))
      .map((f) => ({
        contactRef: f.contactRef,
        fact: f.fact.trim().slice(0, 280),
        selected: true,
      }));

    return {
      summary: (parsed.summary ?? "").trim().slice(0, 500),
      contacts,
      relations,
      followUps,
      facts,
      ideas: (parsed.ideas ?? []).map((i) => i.trim().slice(0, 280)).filter(Boolean),
    };
  });

const ApplyInput = z.object({
  note: z.string().min(10).max(20000),
  summary: z.string().max(500),
  contacts: z.array(
    z.object({
      ref: z.string(),
      name: z.string(),
      entityType: z.enum(["person", "company"]),
      email: z.string().nullable(),
      role: z.string().nullable(),
      existingEntityId: z.string().nullable(),
      selected: z.boolean(),
    }),
  ),
  relations: z.array(
    z.object({
      fromRef: z.string(),
      toRef: z.string(),
      kind: z.enum(["works_on", "customer_of", "member_of", "owns", "blocked_by", "related_to"]),
      role: z.string().nullable(),
      selected: z.boolean(),
    }),
  ),
  followUps: z.array(
    z.object({
      contactRef: z.string(),
      action: z.string(),
      duePreset: z.enum(["today", "tomorrow", "in_3_days", "next_week"]),
      selected: z.boolean(),
    }),
  ),
  facts: z.array(
    z.object({
      contactRef: z.string(),
      fact: z.string(),
      selected: z.boolean(),
    }),
  ),
  ideas: z.array(z.string()).default([]),
});

export const applyPhoneNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ApplyInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { slugifyEntityName } = await import("@/lib/knowledge/entity.server");
    const now = new Date().toISOString();
    const externalId = `phone_note:${Date.now()}`;

    const { data: rawRow, error: rawErr } = await supabase
      .from("raw_signals")
      .insert({
        user_id: userId,
        source: "phone_note",
        external_id: externalId,
        raw_text: data.note,
        summary: data.summary || null,
        status: "parsed",
        parsed_at: now,
        occurred_at: now,
        metadata: {
          kind: "phone_note",
          ideas: data.ideas.slice(0, 8),
        } as never,
      })
      .select("id")
      .single();
    if (rawErr) throw rawErr;
    const rawSignalId = rawRow.id as string;

    const refToEntityId = new Map<string, string>();
    let contactsCreated = 0;
    let contactsLinked = 0;

    for (const c of data.contacts.filter((x) => x.selected)) {
      let entityId = c.existingEntityId;
      if (entityId) {
        contactsLinked += 1;
      } else {
        const slug = await slugifyEntityName(supabase, userId, c.name);
        if (ANCHOR_SLUG_SET.has(slug)) continue;
        const metadata: Record<string, unknown> = {
          created_via: "phone_note",
        };
        if (c.email) {
          metadata.email = c.email;
          const domain = extractEmailDomain(c.email);
          if (domain) metadata.email_domain = domain;
        }
        if (c.role) metadata.role = c.role;
        const { data: ent, error } = await supabase
          .from("entities")
          .insert({
            user_id: userId,
            type: c.entityType,
            name: c.name.trim().slice(0, 120),
            slug,
            importance: 60,
            summary: data.summary.slice(0, 400) || null,
            owner_context: "unknown" as never,
            metadata: metadata as never,
            last_seen_at: now,
          })
          .select("id")
          .single();
        if (error) throw error;
        entityId = ent.id as string;
        contactsCreated += 1;

        if (c.email) {
          const domain = extractEmailDomain(c.email);
          const { data: existingKi } = await supabase
            .from("known_identities")
            .select("id")
            .eq("user_id", userId)
            .eq("identity_type", "email_address")
            .eq("external_key", c.email)
            .limit(1)
            .maybeSingle();
          if (existingKi?.id) {
            await supabase
              .from("known_identities")
              .update({
                entity_id: entityId,
                ignored_at: null,
                last_seen_at: now,
                display_name: c.name,
              })
              .eq("id", existingKi.id)
              .eq("user_id", userId);
          } else {
            await supabase.from("known_identities").insert({
              user_id: userId,
              provider: "manual",
              identity_type: "email_address",
              external_key: c.email,
              email: c.email,
              domain: domain ?? null,
              display_name: c.name,
              entity_id: entityId,
              first_seen_at: now,
              last_seen_at: now,
            });
          }
        }
      }
      if (entityId) refToEntityId.set(c.ref, entityId);

      // Link note onto contact timeline
      await supabase.from("entity_signals").upsert(
        {
          user_id: userId,
          entity_id: entityId!,
          source: "phone_note",
          signal_type: "phone_call",
          external_ref: `${externalId}:${entityId}`,
          occurred_at: now,
          snippet: (data.summary || data.note).slice(0, 160),
          raw_signal_id: rawSignalId,
          link_source: "manual",
        },
        { onConflict: "user_id,external_ref" },
      );
    }

    // Facts → append to entity metadata.notes_facts + bump summary if empty-ish
    let factsApplied = 0;
    for (const f of data.facts.filter((x) => x.selected)) {
      const entityId = refToEntityId.get(f.contactRef);
      if (!entityId) continue;
      const { data: row } = await supabase
        .from("entities")
        .select("metadata, summary")
        .eq("id", entityId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!row) continue;
      const meta = { ...((row.metadata ?? {}) as Record<string, unknown>) };
      const prev = Array.isArray(meta.notes_facts) ? meta.notes_facts : [];
      const factsList = [...prev.filter((x): x is string => typeof x === "string"), f.fact].slice(
        -20,
      );
      meta.notes_facts = factsList;
      const summary =
        typeof row.summary === "string" && row.summary.trim()
          ? row.summary
          : factsList.slice(0, 3).join(" · ").slice(0, 400);
      await supabase
        .from("entities")
        .update({
          metadata: meta as never,
          summary,
          last_seen_at: now,
        })
        .eq("id", entityId)
        .eq("user_id", userId);
      factsApplied += 1;
    }

    let relationsCreated = 0;
    for (const r of data.relations.filter((x) => x.selected)) {
      const fromId = refToEntityId.get(r.fromRef);
      const toId = refToEntityId.get(r.toRef);
      if (!fromId || !toId || fromId === toId) continue;
      const { error } = await supabase.from("entity_relationships").upsert(
        {
          user_id: userId,
          from_entity_id: fromId,
          to_entity_id: toId,
          kind: r.kind as never,
          source: "phone_note",
          metadata: (r.role ? { role: r.role } : {}) as never,
        },
        { onConflict: "user_id,from_entity_id,to_entity_id,kind" },
      );
      if (!error) relationsCreated += 1;
    }

    let followUpsCreated = 0;
    for (const fu of data.followUps.filter((x) => x.selected)) {
      const entityId = refToEntityId.get(fu.contactRef);
      if (!entityId) continue;
      await supabase
        .from("field_follow_ups")
        .update({ status: "cancelled" })
        .eq("user_id", userId)
        .eq("entity_id", entityId)
        .eq("status", "open");
      const { error } = await supabase.from("field_follow_ups").insert({
        user_id: userId,
        entity_id: entityId,
        action: fu.action.slice(0, 300),
        due_at: dueAtFromPreset(fu.duePreset),
        condition_type: "always",
        status: "open",
      });
      if (!error) followUpsCreated += 1;
    }

    const primaryEntityId =
      refToEntityId.get(data.contacts.find((c) => c.selected)?.ref ?? "") ?? null;

    return {
      ok: true,
      rawSignalId,
      primaryEntityId,
      contactsCreated,
      contactsLinked,
      relationsCreated,
      followUpsCreated,
      factsApplied,
    };
  });

/** Search Nexus knowledge for the inbox assistant (contacts, facts, follow-ups, notes). */
export const searchNexusKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const q = data.query.trim();

    const { data: ents } = await supabase
      .from("entities")
      .select("id, name, type, summary, metadata, last_seen_at")
      .eq("user_id", userId)
      .in("type", ["person", "company"])
      .or(`name.ilike.%${q}%,summary.ilike.%${q}%`)
      .limit(8);

    const results = [];
    for (const e of ents ?? []) {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const facts = Array.isArray(meta.notes_facts)
        ? meta.notes_facts.filter((x): x is string => typeof x === "string").slice(0, 6)
        : [];
      const [{ data: fus }, { data: sigs }, { data: rels }] = await Promise.all([
        supabase
          .from("field_follow_ups")
          .select("action, due_at, status")
          .eq("user_id", userId)
          .eq("entity_id", e.id)
          .eq("status", "open")
          .limit(3),
        supabase
          .from("entity_signals")
          .select("source, signal_type, snippet, occurred_at")
          .eq("user_id", userId)
          .eq("entity_id", e.id)
          .order("occurred_at", { ascending: false, nullsFirst: false })
          .limit(5),
        supabase
          .from("entity_relationships")
          .select("from_entity_id, to_entity_id, kind, metadata")
          .eq("user_id", userId)
          .or(`from_entity_id.eq.${e.id},to_entity_id.eq.${e.id}`)
          .limit(8),
      ]);

      const otherIds = new Set<string>();
      for (const r of rels ?? []) {
        otherIds.add(r.from_entity_id === e.id ? r.to_entity_id : r.from_entity_id);
      }
      let relatedNames: { name: string; kind: string }[] = [];
      if (otherIds.size) {
        const { data: others } = await supabase
          .from("entities")
          .select("id, name")
          .eq("user_id", userId)
          .in("id", [...otherIds]);
        const byId = new Map((others ?? []).map((o) => [o.id, o.name]));
        relatedNames = (rels ?? []).map((r) => {
          const oid = r.from_entity_id === e.id ? r.to_entity_id : r.from_entity_id;
          return { name: byId.get(oid) ?? "?", kind: r.kind };
        });
      }

      results.push({
        entityId: e.id,
        name: e.name,
        type: e.type,
        summary: e.summary,
        email: typeof meta.email === "string" ? meta.email : null,
        role: typeof meta.role === "string" ? meta.role : null,
        facts,
        openFollowUps: (fus ?? []).map((f) => ({
          action: f.action,
          dueAt: f.due_at,
        })),
        recentSignals: (sigs ?? []).map((s) => ({
          source: s.source,
          type: s.signal_type,
          snippet: s.snippet,
          at: s.occurred_at,
        })),
        relations: relatedNames,
      });
    }

    // Also surface recent phone notes matching query in summary
    const { data: notes } = await supabase
      .from("raw_signals")
      .select("id, summary, raw_text, occurred_at")
      .eq("user_id", userId)
      .eq("source", "phone_note")
      .or(`summary.ilike.%${q}%,raw_text.ilike.%${q}%`)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(5);

    return {
      contacts: results,
      phoneNotes: (notes ?? []).map((n) => ({
        id: n.id,
        summary: n.summary,
        excerpt: (n.raw_text ?? "").slice(0, 500),
        at: n.occurred_at,
      })),
    };
  });
