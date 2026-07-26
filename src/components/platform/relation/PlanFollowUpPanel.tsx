import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FOLLOW_UP_PRESET_LABEL,
  type FollowUpPreset,
} from "@/lib/field/field.types";
import { cn } from "@/lib/utils";

const QUICK: Exclude<FollowUpPreset, "none" | "pick_date" | "in_3_days">[] = [
  "today",
  "tomorrow",
  "in_2_days",
  "next_week",
];

export function PlanFollowUpPanel({
  defaultAction = "",
  existingLabel,
  busy = false,
  onSchedule,
  className,
}: {
  defaultAction?: string;
  existingLabel?: string | null;
  busy?: boolean;
  onSchedule: (input: { action: string; preset: FollowUpPreset; pickDate?: string }) => void;
  className?: string;
}) {
  const [preset, setPreset] = useState<FollowUpPreset>("in_2_days");
  const [pickDate, setPickDate] = useState("");
  const [action, setAction] = useState(defaultAction);

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm", className)}>
      <h2 className="text-sm font-semibold">Planlegg oppfølging</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Når skal du ta kontakt igjen — og hvorfor.
      </p>
      {existingLabel && (
        <p className="mt-2 text-xs text-muted-foreground">Nå: {existingLabel}</p>
      )}

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Når
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {QUICK.map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => setPreset(p)}
            className={cn(
              "min-h-10 rounded-full border px-3 text-sm font-medium",
              preset === p
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background",
            )}
          >
            {FOLLOW_UP_PRESET_LABEL[p]}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => setPreset("pick_date")}
          className={cn(
            "min-h-10 rounded-full border px-3 text-sm font-medium",
            preset === "pick_date"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background",
          )}
        >
          Velg dato
        </button>
      </div>
      {preset === "pick_date" && (
        <Input
          type="date"
          className="mt-2 h-11 rounded-xl"
          value={pickDate}
          onChange={(e) => setPickDate(e.target.value)}
          disabled={busy}
        />
      )}

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Formål
      </p>
      <Input
        className="mt-2 h-11 rounded-xl"
        placeholder="F.eks. foreslå testleveranse"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        disabled={busy}
      />

      <Button
        type="button"
        className="mt-4 h-11 w-full rounded-xl"
        disabled={busy || (preset === "pick_date" && !pickDate) || !action.trim()}
        onClick={() =>
          onSchedule({
            action: action.trim(),
            preset,
            pickDate: preset === "pick_date" ? pickDate : undefined,
          })
        }
      >
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Lagre oppfølging
      </Button>
    </section>
  );
}
