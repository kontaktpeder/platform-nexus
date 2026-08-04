/**
 * Manual desk intake → raw_signals → Desk queue.
 * Used for oral / WhatsApp / non-API channels until native connectors exist.
 */

import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";

export const MANUAL_INTAKE_KIND = "manual_intake";

export async function fetchManualQueueSignals(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  days?: number;
}): Promise<MissionSignal[]> {
  const { supabase, userId } = input;
  const days = input.days ?? 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("raw_signals")
    .select("id, summary, raw_text, occurred_at, created_at, metadata, source")
    .eq("user_id", userId)
    .eq("source", "manual")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    console.warn("[manual-signals] fetch failed:", error.message);
    return [];
  }

  const out: MissionSignal[] = [];
  for (const row of data ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.kind !== MANUAL_INTAKE_KIND) continue;
    if (meta.queue === false) continue;

    const text = String(row.summary || row.raw_text || "").trim();
    if (!text) continue;

    out.push({
      id: `manual:${row.id}`,
      source: "manual",
      subject: text.slice(0, 120),
      from: typeof meta.channel === "string" ? String(meta.channel) : "Manuelt",
      snippet: String(row.raw_text ?? "").slice(0, 200),
      occurred_at: (row.occurred_at as string) ?? (row.created_at as string) ?? null,
      href: null,
      tags: ["manual", "intake"],
      meta: {
        raw_signal_id: row.id as string,
        channel: typeof meta.channel === "string" ? meta.channel : "manual",
      },
    });
  }
  return out;
}

export async function insertManualDeskSignal(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  text: string;
  channel?: string | null;
}): Promise<{ id: string }> {
  const text = input.text.trim().slice(0, 4000);
  if (!text) throw new Error("Tomt signal");
  const now = new Date().toISOString();
  const channel = (input.channel ?? "manual").trim().slice(0, 40) || "manual";
  const summary = text.split(/\n/)[0]!.trim().slice(0, 160);

  const { data, error } = await input.supabase
    .from("raw_signals")
    .insert({
      user_id: input.userId,
      source: "manual",
      external_id: `desk_manual:${Date.now()}`,
      raw_text: text,
      summary,
      status: "new",
      occurred_at: now,
      metadata: {
        kind: MANUAL_INTAKE_KIND,
        queue: true,
        channel,
      } as never,
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id as string };
}
