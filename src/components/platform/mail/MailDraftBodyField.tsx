import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Compact contact compose vs full Fortell draft. */
  size?: "default" | "large";
};

/** Shared plain-text email draft body — large, comfortable writing surface. */
export function MailDraftBodyField({
  value,
  onChange,
  placeholder = "Melding… (signatur legges på ved lagre/send)",
  disabled,
  className,
  size = "large",
}: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-background focus-within:ring-2 focus-within:ring-ring/40",
        className,
      )}
    >
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "resize-y rounded-xl border-0 bg-transparent shadow-none focus-visible:ring-0",
          size === "large"
            ? "min-h-[280px] p-4 text-base leading-relaxed sm:min-h-[40vh]"
            : "min-h-[160px] p-3 text-base leading-relaxed",
        )}
      />
    </div>
  );
}
