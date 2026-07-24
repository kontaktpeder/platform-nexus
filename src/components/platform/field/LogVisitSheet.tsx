import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  FIELD_RESULTS,
  FIELD_RESULT_LABEL,
  FOLLOW_UP_PRESETS,
  FOLLOW_UP_PRESET_LABEL,
  defaultConditionForResult,
  defaultPresetForResult,
  type FieldPlaceCard,
  type FieldResult,
  type FollowUpPreset,
} from "@/lib/field/field.types";

type PlaceOption = { entityId: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  places: PlaceOption[];
  initialPlace?: FieldPlaceCard | null;
  busy?: boolean;
  onSubmit: (payload: {
    entityId: string;
    result: FieldResult;
    note: string;
    nextAction: string;
    followUpPreset: FollowUpPreset;
    followUpDate: string | null;
  }) => Promise<void>;
};

export function LogVisitSheet({
  open,
  onOpenChange,
  places,
  initialPlace,
  busy,
  onSubmit,
}: Props) {
  const [entityId, setEntityId] = useState(initialPlace?.entityId ?? "");
  const [result, setResult] = useState<FieldResult | null>(null);
  const [note, setNote] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [preset, setPreset] = useState<FollowUpPreset>("in_2_days");
  const [pickDate, setPickDate] = useState("");
  const [step, setStep] = useState<"place" | "result" | "details">("place");

  useEffect(() => {
    if (!open) return;
    setEntityId(initialPlace?.entityId ?? "");
    setResult(null);
    setNote("");
    setNextAction(initialPlace?.nextAction ?? "");
    setPreset("in_2_days");
    setPickDate("");
    setStep(initialPlace ? "result" : "place");
  }, [open, initialPlace?.entityId, initialPlace?.nextAction]);

  const selectedPlace = places.find((p) => p.entityId === entityId);

  function pickResult(r: FieldResult) {
    setResult(r);
    setPreset(defaultPresetForResult(r));
    if (!nextAction) {
      if (r === "mail_sent" || r === "waiting_reply") setNextAction("Følg opp hvis ingen svar");
      else if (r === "demo_booked") setNextAction("Gjennomfør demo");
      else if (r === "interested_demo") setNextAction("Book demo / smaksprøve");
      else if (r === "no_not_relevant") setNextAction("");
      else setNextAction("Følg opp");
    }
    setStep("details");
  }

  async function handleSave() {
    if (!entityId || !result) return;
    if (preset === "pick_date" && !pickDate) return;
    await onSubmit({
      entityId,
      result,
      note: note.trim(),
      nextAction: nextAction.trim(),
      followUpPreset: preset,
      followUpDate: preset === "pick_date" ? pickDate : null,
    });
  }

  const conditionHint =
    result && (defaultConditionForResult(result) === "if_no_reply")
      ? "Oppfølging kun hvis ingen svar (klar for Gmail senere)."
      : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] overflow-y-auto rounded-t-2xl px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <SheetHeader className="mb-4 text-left">
          <SheetTitle className="text-lg">
            {step === "place" && "Hvilket sted?"}
            {step === "result" && (selectedPlace?.name ?? initialPlace?.name ?? "Resultat")}
            {step === "details" && "Neste steg"}
          </SheetTitle>
        </SheetHeader>

        {step === "place" && (
          <div className="space-y-2 pb-4">
            {places.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Legg til et sted først (plus-knappen).
              </p>
            ) : (
              places.map((p) => (
                <button
                  key={p.entityId}
                  type="button"
                  onClick={() => {
                    setEntityId(p.entityId);
                    setStep("result");
                  }}
                  className="flex min-h-12 w-full items-center rounded-xl border border-border bg-card px-4 text-left text-base font-medium active:bg-muted"
                >
                  {p.name}
                </button>
              ))
            )}
          </div>
        )}

        {step === "result" && (
          <div className="space-y-2 pb-4">
            <button
              type="button"
              className="mb-2 text-sm text-muted-foreground underline"
              onClick={() => setStep("place")}
            >
              Bytt sted
            </button>
            <div className="grid grid-cols-1 gap-2">
              {FIELD_RESULTS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => pickResult(r)}
                  className={`min-h-12 rounded-xl border px-4 text-left text-base font-medium active:scale-[0.99] ${
                    result === r
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card"
                  }`}
                >
                  {FIELD_RESULT_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "details" && result && (
          <div className="space-y-5 pb-4">
            <button
              type="button"
              className="text-sm text-muted-foreground underline"
              onClick={() => setStep("result")}
            >
              {FIELD_RESULT_LABEL[result]} · endre
            </button>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Kort notat
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="F.eks. bank på før 15 · snakker med sjef"
                className="min-h-[72px] text-base"
                maxLength={500}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Neste handling
              </label>
              <Input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="Hva skal du gjøre?"
                className="h-12 text-base"
                maxLength={300}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Når skal du følge opp?
              </label>
              <div className="flex flex-wrap gap-2">
                {FOLLOW_UP_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    className={`min-h-11 rounded-full border px-3.5 text-sm font-medium ${
                      preset === p
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {FOLLOW_UP_PRESET_LABEL[p]}
                  </button>
                ))}
              </div>
              {preset === "pick_date" && (
                <Input
                  type="date"
                  value={pickDate}
                  onChange={(e) => setPickDate(e.target.value)}
                  className="mt-2 h-12 text-base"
                />
              )}
              {conditionHint && preset !== "none" && (
                <p className="text-xs text-muted-foreground">{conditionHint}</p>
              )}
            </div>

            <Button
              className="h-14 w-full text-base font-semibold"
              disabled={busy || (preset === "pick_date" && !pickDate)}
              onClick={() => void handleSave()}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Lagre"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
