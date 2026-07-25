import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncPlatformContacts } from "@/lib/contact-sync.functions";

const LAST_SYNC_KEY = "mission:lastContactSyncAt";
/** Don't re-sync on every navigation within this window. */
export const CONTACT_SYNC_STALE_MS = 10 * 60_000;

export function getLastContactSyncAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(LAST_SYNC_KEY) || 0);
  } catch {
    return 0;
  }
}

export function setLastContactSyncAt(ts: number = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_SYNC_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

/**
 * Fire-and-forget contact sync when Mission mounts, if last sync is stale.
 * Does not block the brief UI.
 */
export function useMissionContactSync(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const qc = useQueryClient();
  const runSync = useServerFn(syncPlatformContacts);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;

    const last = getLastContactSyncAt();
    if (Date.now() - last < CONTACT_SYNC_STALE_MS) return;

    void (async () => {
      try {
        await runSync({ data: { max: 400 } });
        setLastContactSyncAt();
        await qc.invalidateQueries({ queryKey: ["customers"] });
        await qc.invalidateQueries({ queryKey: ["knowledge"] });
      } catch (err) {
        console.warn("[mission] contact sync failed", err);
      }
    })();
  }, [enabled, runSync, qc]);
}
