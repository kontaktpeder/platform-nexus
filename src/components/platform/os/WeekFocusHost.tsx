import { useEffect, useState } from "react";
import { WeekFocusSheet } from "@/components/platform/os/WeekFocusSheet";
import { WEEK_PLAN_OPEN_EVENT } from "@/lib/os/week-plan-ui";

/** Hosts WeekFocusSheet so Ukesmal works when side nav is CSS-hidden on mobile. */
export function WeekFocusHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(WEEK_PLAN_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(WEEK_PLAN_OPEN_EVENT, onOpen);
  }, []);

  return <WeekFocusSheet open={open} onOpenChange={setOpen} />;
}
