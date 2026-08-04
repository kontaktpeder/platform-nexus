import { Paperclip, X } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  MAIL_ATTACHMENT_MAX_BYTES_EACH,
  MAIL_ATTACHMENT_MAX_FILES,
  type MailAttachmentPayload,
  validateMailAttachments,
} from "@/lib/mail-attachments";
import { cn } from "@/lib/utils";

async function fileToPayload(file: File): Promise<MailAttachmentPayload> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return {
    filename: file.name.slice(0, 180) || "vedlegg",
    mimeType: file.type || "application/octet-stream",
    dataBase64: btoa(binary),
  };
}

function formatSize(approxBytes: number): string {
  if (approxBytes < 1024) return `${approxBytes} B`;
  if (approxBytes < 1024 * 1024) return `${Math.round(approxBytes / 1024)} KB`;
  return `${(approxBytes / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  value: MailAttachmentPayload[];
  onChange: (next: MailAttachmentPayload[]) => void;
  disabled?: boolean;
  className?: string;
  onError?: (message: string) => void;
};

export function MailAttachmentsField({
  value,
  onChange,
  disabled,
  className,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    const next = [...value];
    for (const file of Array.from(files)) {
      if (next.length >= MAIL_ATTACHMENT_MAX_FILES) {
        onError?.(`Maks ${MAIL_ATTACHMENT_MAX_FILES} vedlegg`);
        break;
      }
      if (file.size > MAIL_ATTACHMENT_MAX_BYTES_EACH) {
        onError?.(`${file.name} er for stor (maks 7 MB)`);
        continue;
      }
      next.push(await fileToPayload(file));
    }
    const err = validateMailAttachments(next);
    if (err) {
      onError?.(err);
      return;
    }
    onChange(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Vedlegg
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-lg text-xs"
          disabled={disabled || value.length >= MAIL_ATTACHMENT_MAX_FILES}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Fil / bilde
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          className="hidden"
          disabled={disabled}
          onChange={(e) => void onPick(e.target.files)}
        />
      </div>
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((f, i) => {
            const size = Math.floor((f.dataBase64.length * 3) / 4);
            return (
              <li
                key={`${f.filename}-${i}`}
                className="flex items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-2.5 py-1.5 text-xs"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{f.filename}</span>
                <span className="shrink-0 text-muted-foreground">{formatSize(size)}</span>
                <button
                  type="button"
                  disabled={disabled}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Fjern ${f.filename}`}
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
