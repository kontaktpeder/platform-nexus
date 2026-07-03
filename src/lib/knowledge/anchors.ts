// Client-safe anchor definitions for Knowledge Anchors v0.
// Three fixed context anchors seeded per user. Do NOT edit slugs — they
// are reserved via ANCHOR_SLUG_SET (see ./types.ts).

import type { AnchorSlug, EntityType, OwnerContext } from "./types";

export type AnchorDefinition = {
  slug: AnchorSlug;
  name: string;
  type: EntityType;
  owner_context: OwnerContext;
  importance: number;
  summary: string;
  metadata: { is_anchor: true; [k: string]: unknown };
};

export const ANCHOR_DEFINITIONS: Record<AnchorSlug, AnchorDefinition> = {
  personal: {
    slug: "personal",
    name: "Personlig",
    type: "project",
    owner_context: "personal",
    importance: 90,
    summary: "Privat liv, personlig økonomi og hverdag.",
    metadata: { is_anchor: true },
  },
  "peder-enk": {
    slug: "peder-enk",
    name: "Peder August Halvorsen ENK",
    type: "company",
    owner_context: "peder-enk",
    importance: 85,
    summary: "ENK — kunder, faktura, studio og utvikling.",
    metadata: { is_anchor: true },
  },
  "gold-of-sicily": {
    slug: "gold-of-sicily",
    name: "Gold of Sicily",
    type: "project",
    owner_context: "gold-of-sicily",
    importance: 80,
    summary: "Arancini, catering, events og drift.",
    metadata: { is_anchor: true, platform_org_slug: null },
  },
};
