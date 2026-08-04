/**
 * Persist desk queue across new tabs so opening /desk does not refetch every time.
 * Manual refresh / invalidate still pulls fresh data.
 */

import type { DeskQueueResponse } from "@/lib/desk-queue.types";

const CACHE_KEY = "nexus:desk-queue:v4";
export const DESK_QUEUE_STALE_MS = 5 * 60_000;

export type DeskQueueCacheEntry = {
  data: DeskQueueResponse;
  updatedAt: number;
};

export function readDeskQueueCache(): DeskQueueCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeskQueueCacheEntry;
    if (!parsed?.data || typeof parsed.updatedAt !== "number") return null;
    if (!Array.isArray(parsed.data.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDeskQueueCache(data: DeskQueueResponse): void {
  if (typeof window === "undefined") return;
  try {
    const entry: DeskQueueCacheEntry = { data, updatedAt: Date.now() };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}

export function clearDeskQueueCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
