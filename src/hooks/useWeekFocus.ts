import { useCallback, useEffect, useState } from "react";
import {
  emptyWeekFocus,
  isoWeekKey,
  readWeekFocus,
  writeWeekFocus,
  type WeekFocus,
} from "@/lib/os/week-focus";

export function useWeekFocus() {
  const [focus, setFocus] = useState<WeekFocus>(() => emptyWeekFocus());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFocus(readWeekFocus());
    setReady(true);
  }, []);

  const save = useCallback((next: WeekFocus) => {
    const withWeek = { ...next, weekKey: isoWeekKey() };
    writeWeekFocus(withWeek);
    setFocus(withWeek);
  }, []);

  const patch = useCallback(
    (partial: Partial<WeekFocus>) => {
      setFocus((prev) => {
        const next = { ...prev, ...partial, weekKey: isoWeekKey() };
        writeWeekFocus(next);
        return next;
      });
    },
    [],
  );

  return { focus, ready, save, patch };
}
