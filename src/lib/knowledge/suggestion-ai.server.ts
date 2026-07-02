// Knowledge v2 — AI suggestion generator (server-only).
// Sends ONLY sanitized cluster metadata (sender/domain/channel/org names + counts)
// to the model. Never message bodies, never links.
// Falls back to deterministic suggestions if AI fails.

import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { SuggestionCluster, ClusterKind } from "./suggestion-clusters";
import type { Entity, EntityType } from "./types";
import { ENTITY_TYPES } from "./types";

export type AiSuggestion = {
  suggestionKey: string;
  proposedName: string;
  proposedType: EntityType;
  reason: string;
  confidence: "low" | "medium" | "high";
  suggestedMetadata: Record<string, unknown>;
};

const SuggestionSchema = z.object({
  suggestionKey: z.string(),
  proposedName: z.string().min(1).max(200),
  proposedType: z.enum(["person", "company", "project", "goal", "commitment"]),
  reason: z.string().max(300),
  confidence: z.enum(["low", "medium", "high"]),
  suggestedMetadata: z
    .object({
      email_domain: z.string().optional(),
      email: z.string().optional(),
      slack_display_name: z.string().optional(),
      platform_org_slug: z.string().optional(),
    })
    .passthrough()
    .optional(),
});

const OutputSchema = z.object({
  suggestions: z.array(SuggestionSchema).max(30),
});

function defaultTypeFor(kind: ClusterKind): EntityType {
  switch (kind) {
    case "gmail_domain":
      return "company";
    case "gmail_sender":
    case "slack_person":
      return "person";
    case "slack_channel":
      return "project";
    case "workspace_org":
      return "project";
    default:
      return "company";
  }
}

function defaultNameFor(c: SuggestionCluster): string {
  const h = c.hints;
  if (c.clusterKind === "gmail_domain" && h.emailDomain) {
    const root = h.emailDomain.split(".")[0] ?? h.emailDomain;
    return root.charAt(0).toUpperCase() + root.slice(1);
  }
  if (h.sender) return h.sender;
  if (h.channelName) return h.channelName.replace(/^#+/, "");
  if (h.orgName) return h.orgName;
  if (h.orgSlug) return h.orgSlug;
  return c.suggestionKey.split(":").slice(1).join(":") || "Ny entitet";
}

function fallbackFor(c: SuggestionCluster): AiSuggestion {
  const proposedType = defaultTypeFor(c.clusterKind);
  const name = defaultNameFor(c);
  const suggestedMetadata: Record<string, unknown> = {};
  if (c.hints.emailDomain) suggestedMetadata.email_domain = c.hints.emailDomain;
  if (c.hints.senderEmail) suggestedMetadata.email = c.hints.senderEmail;
  if (c.clusterKind === "slack_person" && c.hints.sender)
    suggestedMetadata.slack_display_name = c.hints.sender;
  if (c.hints.orgSlug) suggestedMetadata.platform_org_slug = c.hints.orgSlug;
  const confidence: AiSuggestion["confidence"] =
    c.exampleCount >= 5 ? "high" : c.exampleCount >= 3 ? "medium" : "low";
  return {
    suggestionKey: c.suggestionKey,
    proposedName: name,
    proposedType,
    reason: `${c.exampleCount} signaler fra samme ${c.clusterKind.replace("_", " ")}.`,
    confidence,
    suggestedMetadata,
  };
}

export async function generateSuggestionsForClusters(
  clusters: SuggestionCluster[],
  existingEntities: Entity[],
): Promise<AiSuggestion[]> {
  if (clusters.length === 0) return [];

  const key = process.env.LOVABLE_API_KEY;
  if (!key) return clusters.map(fallbackFor);

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway("google/gemini-3-flash-preview");

  const sanitizedClusters = clusters.map((c) => ({
    suggestionKey: c.suggestionKey,
    clusterKind: c.clusterKind,
    exampleCount: c.exampleCount,
    hints: c.hints,
  }));
  const sanitizedEntities = existingEntities.map((e) => ({
    name: e.name,
    type: e.type,
    slug: e.slug,
  }));

  const system = [
    "You propose new Knowledge entities the user should add to Platform Core.",
    "You receive clusters of unlinked signals (Gmail domain, Gmail sender, Slack person, Slack channel, workspace org) and the user's existing entities.",
    "Rules:",
    "- Propose one suggestion per cluster, and only if justified by the hints.",
    "- gmail_domain -> usually company.",
    "- gmail_sender / slack_person -> usually person.",
    "- slack_channel -> project (or company if the channel name clearly maps to a company).",
    "- workspace_org -> project.",
    "- Never invent facts. Only use fields present in hints.",
    "- Do not duplicate existing entities (match by name/slug case-insensitively).",
    "- Confidence: high if exampleCount>=5 and the name is unambiguous; medium if exampleCount>=3; else low.",
    "- proposedName should be human-readable (title case for domains, no # for Slack channels).",
    "- Return the same suggestionKey you were given.",
    "- suggestedMetadata may contain email_domain, email, slack_display_name, platform_org_slug when present in hints.",
  ].join("\n");

  try {
    const { output } = await generateText({
      model,
      system,
      prompt: JSON.stringify({
        clusters: sanitizedClusters,
        existingEntities: sanitizedEntities,
      }),
      output: Output.object({ schema: OutputSchema }),
    });

    const byKey = new Map<string, AiSuggestion>();
    for (const s of output.suggestions) {
      if (!ENTITY_TYPES.includes(s.proposedType)) continue;
      byKey.set(s.suggestionKey, {
        suggestionKey: s.suggestionKey,
        proposedName: s.proposedName.trim().slice(0, 200),
        proposedType: s.proposedType,
        reason: (s.reason ?? "").trim().slice(0, 300) || "AI-forslag basert på gjentatte signaler.",
        confidence: s.confidence,
        suggestedMetadata: (s.suggestedMetadata ?? {}) as Record<string, unknown>,
      });
    }
    // Ensure every cluster gets a suggestion; fill gaps with fallback.
    return clusters.map((c) => byKey.get(c.suggestionKey) ?? fallbackFor(c));
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      console.warn("[knowledge-suggestions] AI malformed output, falling back", err);
    } else {
      console.warn("[knowledge-suggestions] AI failed, falling back", err);
    }
    return clusters.map(fallbackFor);
  }
}
