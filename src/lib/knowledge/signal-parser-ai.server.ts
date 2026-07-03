// Relationship Engine v0 — Pakke 3 (Parser)
// Server-only: turns ONE raw_signal into entity + relation suggestions using Lovable AI.
// Falls back to deterministic empty output on failure. Never writes to DB directly.

import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { ENTITY_TYPES, type Entity, type EntityType, type OwnerContext } from "./types";
import { RELATIONSHIP_KINDS, type EntityRelationshipKind } from "./types";
import { ANCHOR_DEFINITIONS } from "./anchors";

export type ParsedEntity = {
  ref: string; // local ref used to wire relations within one parse call
  suggestionKey: string;
  proposedName: string;
  proposedType: EntityType;
  ownerContext: OwnerContext;
  confidence: "low" | "medium" | "high";
  reason: string;
  metadata: Record<string, unknown>;
  matchesExistingEntityId: string | null; // resolved server-side, not by AI
};

export type ParsedRelation = {
  fromRef: string; // matches ParsedEntity.ref OR existing entity id (prefix "existing:")
  toRef: string;
  kind: EntityRelationshipKind;
  confidence: number; // 0..1
  reason: string;
};

export type ParseResult = {
  entities: ParsedEntity[];
  relations: ParsedRelation[];
  summary: string;
};

const EntitySchema = z.object({
  ref: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  type: z.enum(["person", "company", "project", "goal", "commitment"]),
  ownerContext: z.enum(["personal", "peder-enk", "gold-of-sicily", "unknown"]),
  confidence: z.enum(["low", "medium", "high"]),
  reason: z.string().max(300),
  email: z.string().max(200).optional(),
  emailDomain: z.string().max(200).optional(),
  slackHandle: z.string().max(200).optional(),
});

const RelationSchema = z.object({
  fromRef: z.string().min(1).max(80),
  toRef: z.string().min(1).max(80),
  kind: z.enum(["works_on", "customer_of", "member_of", "owns", "blocked_by", "related_to"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300),
});

const OutputSchema = z.object({
  summary: z.string().max(400),
  entities: z.array(EntitySchema).max(10),
  relations: z.array(RelationSchema).max(10),
});

export type ParserSignalInput = {
  id: string;
  source: string;
  summary: string | null;
  raw_text: string;
  occurred_at: string | null;
  metadata: Record<string, unknown>;
};

function suggestionKeyFor(source: string, e: z.infer<typeof EntitySchema>): string {
  if (e.email) return `${source}:email:${e.email.toLowerCase()}`;
  if (e.emailDomain) return `${source}:domain:${e.emailDomain.toLowerCase()}`;
  if (e.slackHandle) return `${source}:slack:${e.slackHandle.toLowerCase()}`;
  return `${source}:name:${e.name.toLowerCase().slice(0, 80)}`;
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase();
}

function resolveExistingMatch(
  e: z.infer<typeof EntitySchema>,
  existing: Entity[],
): string | null {
  const email = e.email?.toLowerCase();
  const domain = e.emailDomain?.toLowerCase();
  const nameKey = normalizeName(e.name);
  for (const ent of existing) {
    const md = ent.metadata ?? {};
    if (email && typeof md.email === "string" && md.email.toLowerCase() === email) return ent.id;
    if (
      domain &&
      typeof md.email_domain === "string" &&
      md.email_domain.toLowerCase() === domain
    )
      return ent.id;
    if (normalizeName(ent.name) === nameKey && ent.type === e.type) return ent.id;
  }
  return null;
}

export async function parseSignal(
  signal: ParserSignalInput,
  existingEntities: Entity[],
): Promise<ParseResult> {
  const empty: ParseResult = { entities: [], relations: [], summary: "" };
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return empty;

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  // Sanitize existing entities we send to the model (no ids in output binding).
  const sanitizedExisting = existingEntities.slice(0, 60).map((e) => ({
    name: e.name,
    type: e.type,
    ownerContext: e.owner_context,
    email: (e.metadata as { email?: string })?.email ?? null,
    emailDomain: (e.metadata as { email_domain?: string })?.email_domain ?? null,
  }));

  const anchors = Object.values(ANCHOR_DEFINITIONS).map((a) => ({
    slug: a.slug,
    name: a.name,
    summary: a.summary,
  }));

  const system = [
    "You are a Relationship Engine parser for Platform Core.",
    "Input: ONE raw signal (email or chat message) plus the user's existing Knowledge entities and three fixed anchors.",
    "Output: proposed NEW entities and RELATIONS derived STRICTLY from the signal. Never invent facts.",
    "",
    "Rules:",
    "- Only propose entities you can justify from the signal's summary/raw_text/metadata.",
    "- Prefer reusing existing entities: if an entity already exists (by name/email/domain), do NOT propose a new one — reference it by its exact name in relations instead.",
    "- ownerContext must be one of: personal, peder-enk, gold-of-sicily, unknown. Pick 'unknown' when ambiguous — never guess.",
    "- Relations use fromRef/toRef. Each ref must EITHER match an entity you propose in this call (its 'ref' field) OR reference an existing entity via the prefix 'existing:<name>' (case-sensitive match against the name field of existingEntities).",
    "- Confidence: 'high' only if the signal explicitly names the entity; 'medium' if strongly implied; 'low' otherwise.",
    "- Summary: ≤400 chars, plain Norwegian, one sentence about what this signal is about.",
    "- If the signal contains nothing meaningful (spam, transactional noise, empty), return empty entities/relations and a short summary.",
    "- Relation kinds: works_on, customer_of, member_of, owns, blocked_by, related_to.",
    "- Entity types: person, company, project, goal, commitment.",
  ].join("\n");

  const prompt = JSON.stringify({
    signal: {
      source: signal.source,
      occurred_at: signal.occurred_at,
      summary: signal.summary,
      raw_text: signal.raw_text.slice(0, 4000),
      metadata: signal.metadata,
    },
    anchors,
    existingEntities: sanitizedExisting,
  });

  try {
    const { output } = await generateText({ model, system, prompt, output: Output.object({ schema: OutputSchema }) });

    const entities: ParsedEntity[] = [];
    const seenKeys = new Set<string>();
    const refToKey = new Map<string, string>();

    for (const e of output.entities) {
      if (!ENTITY_TYPES.includes(e.type)) continue;
      const key = suggestionKeyFor(signal.source, e);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      const match = resolveExistingMatch(e, existingEntities);
      const metadata: Record<string, unknown> = {};
      if (e.email) metadata.email = e.email;
      if (e.emailDomain) metadata.email_domain = e.emailDomain;
      if (e.slackHandle) metadata.slack_display_name = e.slackHandle;
      entities.push({
        ref: e.ref,
        suggestionKey: key,
        proposedName: e.name.trim().slice(0, 200),
        proposedType: e.type,
        ownerContext: e.ownerContext,
        confidence: e.confidence,
        reason: (e.reason ?? "").trim().slice(0, 300) || "Parseret fra signal.",
        metadata,
        matchesExistingEntityId: match,
      });
      refToKey.set(e.ref, key);
    }

    const relations: ParsedRelation[] = [];
    for (const r of output.relations) {
      if (!RELATIONSHIP_KINDS.includes(r.kind)) continue;
      // Both refs must resolve either to a proposed entity ref or to "existing:<name>"
      const validRef = (ref: string) =>
        refToKey.has(ref) || ref.startsWith("existing:");
      if (!validRef(r.fromRef) || !validRef(r.toRef)) continue;
      if (r.fromRef === r.toRef) continue;
      relations.push({
        fromRef: r.fromRef,
        toRef: r.toRef,
        kind: r.kind,
        confidence: Math.min(1, Math.max(0, r.confidence)),
        reason: (r.reason ?? "").trim().slice(0, 300),
      });
    }

    return { entities, relations, summary: (output.summary ?? "").trim().slice(0, 400) };
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      console.warn("[signal-parser] AI malformed output", err);
    } else {
      console.warn("[signal-parser] AI failed", err);
    }
    return empty;
  }
}
