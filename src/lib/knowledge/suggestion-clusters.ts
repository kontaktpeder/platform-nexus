// Knowledge v2 — deterministic clustering of unlinked Mission signals.
// Pure/client-safe: no AI, no DB.
// See docs/KNOWLEDGE.v2.md.

import type { MissionSignalDescriptor } from "./auto-link.server";
import type { Entity } from "./types";
import {
  matchEntityForSignal,
  normalizeName,
  normalizeChannelName,
  extractEmailDomain,
} from "./entity-matcher";

export type ClusterKind =
  | "gmail_domain"
  | "gmail_sender"
  | "slack_person"
  | "slack_channel"
  | "workspace_org";

export type SuggestionCluster = {
  suggestionKey: string;
  clusterKind: ClusterKind;
  exampleRefs: string[]; // max 10
  exampleCount: number;
  hints: {
    sender?: string | null;
    senderEmail?: string | null;
    emailDomain?: string | null;
    channelName?: string | null;
    orgSlug?: string | null;
    orgName?: string | null;
    wsName?: string | null;
  };
};

// Consumer / free email providers we never treat as company clusters.
const DOMAIN_BLOCKLIST = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "me.com",
  "live.com",
  "msn.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

export type ClusterOptions = {
  minExampleCount?: number; // default 2
  linkedRefs?: Set<string>; // signals already in entity_signals — skip
  ignoredKeys?: Set<string>; // suggestion keys with status 'ignored'
  snoozedKeys?: Set<string>; // suggestion keys currently snoozed
};

export function clusterUnlinkedSignals(
  descriptors: MissionSignalDescriptor[],
  entities: Entity[],
  opts: ClusterOptions = {},
): SuggestionCluster[] {
  const minCount = opts.minExampleCount ?? 2;
  const linked = opts.linkedRefs ?? new Set<string>();
  const ignored = opts.ignoredKeys ?? new Set<string>();
  const snoozed = opts.snoozedKeys ?? new Set<string>();

  const buckets = new Map<string, SuggestionCluster>();

  function add(
    key: string,
    kind: ClusterKind,
    externalRef: string,
    hints: SuggestionCluster["hints"],
  ) {
    if (ignored.has(key) || snoozed.has(key)) return;
    let c = buckets.get(key);
    if (!c) {
      c = {
        suggestionKey: key,
        clusterKind: kind,
        exampleRefs: [],
        exampleCount: 0,
        hints,
      };
      buckets.set(key, c);
    }
    c.exampleCount += 1;
    if (c.exampleRefs.length < 10) c.exampleRefs.push(externalRef);
    // Merge non-null hints (first wins for identifiers).
    c.hints = {
      sender: c.hints.sender ?? hints.sender ?? null,
      senderEmail: c.hints.senderEmail ?? hints.senderEmail ?? null,
      emailDomain: c.hints.emailDomain ?? hints.emailDomain ?? null,
      channelName: c.hints.channelName ?? hints.channelName ?? null,
      orgSlug: c.hints.orgSlug ?? hints.orgSlug ?? null,
      orgName: c.hints.orgName ?? hints.orgName ?? null,
      wsName: c.hints.wsName ?? hints.wsName ?? null,
    };
  }

  for (const s of descriptors) {
    if (linked.has(s.externalRef)) continue;
    // Only propose when v1 could not resolve confidently. Ambiguous (2+ matches)
    // may still get a suggestion since the "create new" is a valid resolution.
    const match = matchEntityForSignal(s, entities);
    if (match.entity) continue;

    if (s.source === "gmail") {
      const email =
        (s.senderEmail && s.senderEmail.toLowerCase()) || null;
      const domain =
        email && email.includes("@")
          ? email.slice(email.indexOf("@") + 1)
          : extractEmailDomain(s.sender ?? null);

      if (domain && !DOMAIN_BLOCKLIST.has(domain)) {
        add(
          `gmail_domain:${domain}`,
          "gmail_domain",
          s.externalRef,
          { senderEmail: email, emailDomain: domain, sender: s.sender ?? null },
        );
      } else {
        // Consumer domain — cluster by sender name instead.
        const senderKey = normalizeName(s.sender);
        if (senderKey) {
          add(
            `gmail_sender:${senderKey}`,
            "gmail_sender",
            s.externalRef,
            { sender: s.sender ?? null, senderEmail: email },
          );
        }
      }
    } else if (s.source === "slack") {
      if (s.externalRef.startsWith("slack:channel:") || s.channelName) {
        const ch = normalizeChannelName(s.channelName);
        if (ch) {
          add(
            `slack_channel:${ch}`,
            "slack_channel",
            s.externalRef,
            { channelName: s.channelName ?? null },
          );
          continue;
        }
      }
      const senderKey = normalizeName(s.sender);
      if (senderKey) {
        add(
          `slack_person:${senderKey}`,
          "slack_person",
          s.externalRef,
          { sender: s.sender ?? null },
        );
      }
    } else if (s.source === "workspace") {
      if (s.orgSlug) {
        add(
          `workspace_org:${s.orgSlug.toLowerCase()}`,
          "workspace_org",
          s.externalRef,
          {
            orgSlug: s.orgSlug,
            orgName: s.orgName ?? null,
            wsName: s.wsName ?? null,
          },
        );
      }
    }
  }

  return Array.from(buckets.values())
    .filter((c) => c.exampleCount >= minCount)
    .sort((a, b) => b.exampleCount - a.exampleCount);
}

export const CLUSTER_KIND_LABEL: Record<ClusterKind, string> = {
  gmail_domain: "Gmail-domene",
  gmail_sender: "Gmail-avsender",
  slack_person: "Slack-person",
  slack_channel: "Slack-kanal",
  workspace_org: "Workspace-org",
};
