/**
 * Persist Fortell thread locally so mobile/desktop keep ChatGPT-style history
 * across navigation and refresh. Not synced to server (v0).
 */

import type { FortellChatMessage } from "@/lib/fortell.functions";

const STORAGE_KEY = "nexus:fortell:thread:v1";
/** Match FortellChat / API window (server takes last 12–16). */
const MAX_MESSAGES = 32;

export type FortellThreadState = {
  history: FortellChatMessage[];
  updatedAt: string;
};

function isMessage(v: unknown): v is FortellChatMessage {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    (m.role === "user" || m.role === "assistant") &&
    typeof m.content === "string" &&
    m.content.length > 0
  );
}

export function readFortellThread(): FortellChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<FortellThreadState>;
    const history = Array.isArray(parsed.history)
      ? parsed.history.filter(isMessage).slice(-MAX_MESSAGES)
      : [];
    return history;
  } catch {
    return [];
  }
}

export function writeFortellThread(history: FortellChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = history.filter(isMessage).slice(-MAX_MESSAGES);
    if (trimmed.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: FortellThreadState = {
      history: trimmed,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode — ignore
  }
}

export function clearFortellThread(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
