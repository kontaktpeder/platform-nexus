import { useEffect, useState } from "react";
import {
  getDayAtmosphere,
  type DayAtmosphere,
} from "@/lib/os/day-atmosphere";

/** Refresh atmosphere every minute so the canvas follows the clock. */
export function useDayAtmosphere(): DayAtmosphere {
  const [atmosphere, setAtmosphere] = useState(() => getDayAtmosphere());

  useEffect(() => {
    const tick = () => setAtmosphere(getDayAtmosphere());
    tick();
    const id = window.setInterval(tick, 60_000);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return atmosphere;
}
