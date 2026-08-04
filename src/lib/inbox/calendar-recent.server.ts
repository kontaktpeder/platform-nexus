/**
 * Google Calendar → Desk / Mission signals via Lovable connector gateway.
 * Graceful no-op when GOOGLE_CALENDAR_API_KEY (or fallback) is missing.
 */

import type { MissionSignal } from "@/lib/morning-mission/signal-prefilter.server";
import { addOsloDays, formatOsloDayLabel, osloDateKey } from "@/lib/field/field-dates";

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

type CalEvent = {
  id?: string;
  summary?: string;
  description?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
  location?: string;
};

type EventsList = { items?: CalEvent[] };

function calendarKeys(): { apiKey: string; lovableKey: string } | null {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const apiKey =
    process.env.GOOGLE_CALENDAR_API_KEY ||
    // Same Google account often powers Gmail; allow reuse when Calendar key unset.
    process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !apiKey) return null;
  return { apiKey, lovableKey };
}

async function calFetch<T>(path: string, apiKey: string, lovableKey: string): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": apiKey,
    },
  });
  if (!res.ok) throw new Error(`calendar ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

function eventStartIso(ev: CalEvent): string | null {
  return ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T09:00:00` : null);
}

function formatEventTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("nb-NO", {
      timeZone: "Europe/Oslo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

export type CalendarEventHit = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  location: string | null;
  href: string | null;
  allDay: boolean;
};

/** Upcoming events for Fortell tool / forced evening check. */
export async function listUpcomingCalendarEvents(opts?: {
  days?: number;
  max?: number;
}): Promise<{ events: CalendarEventHit[]; error: string | null }> {
  const keys = calendarKeys();
  if (!keys) {
    return { events: [], error: "Google Calendar er ikke koblet (mangler API-nøkkel)." };
  }

  const days = opts?.days ?? 3;
  const max = opts?.max ?? 12;
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86_400_000).toISOString();
  const q = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(max),
  });

  try {
    const list = await calFetch<EventsList>(
      `/calendars/primary/events?${q}`,
      keys.apiKey,
      keys.lovableKey,
    );
    const events: CalendarEventHit[] = [];
    for (const ev of list.items ?? []) {
      if (ev.status === "cancelled") continue;
      const start = eventStartIso(ev);
      if (!start) continue;
      const id = ev.id ?? `${start}:${ev.summary ?? ""}`;
      events.push({
        id,
        title: (ev.summary ?? "(uten tittel)").slice(0, 200),
        start,
        end: ev.end?.dateTime ?? ev.end?.date ?? null,
        location: ev.location?.slice(0, 160) ?? null,
        href: ev.htmlLink ?? null,
        allDay: !ev.start?.dateTime && !!ev.start?.date,
      });
    }
    return { events, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Calendar-feil";
    console.warn("[calendar]", msg);
    return { events: [], error: msg };
  }
}

export async function fetchCalendarQueueSignals(opts?: {
  days?: number;
  max?: number;
}): Promise<MissionSignal[]> {
  const { events, error } = await listUpcomingCalendarEvents(opts);
  if (error && events.length === 0) return [];

  const todayKey = osloDateKey();
  const out: MissionSignal[] = [];

  for (const ev of events) {
    const dayKey = osloDateKey(new Date(ev.start));
    // Only today + tomorrow in the visible queue (near term)
    if (dayKey > addOsloDays(todayKey, 1)) continue;

    const dayLabel = formatOsloDayLabel(ev.start, todayKey);
    const time = ev.allDay ? "hele dagen" : formatEventTime(ev.start);
    const title =
      dayKey === todayKey
        ? `I dag · ${time}`
        : dayKey === addOsloDays(todayKey, 1)
          ? `I morgen · ${time}`
          : `${dayLabel} · ${time}`;

    out.push({
      id: `calendar:${ev.id}`,
      source: "calendar",
      subject: title,
      from: "Kalender",
      snippet: [ev.title, ev.location].filter(Boolean).join(" · ").slice(0, 200),
      occurred_at: ev.start,
      href: ev.href,
      tags: ["appointment", "calendar", dayKey === todayKey ? "today" : "soon"],
      meta: {
        event_id: ev.id,
        event_title: ev.title,
        all_day: ev.allDay,
      },
    });
  }

  return out;
}
