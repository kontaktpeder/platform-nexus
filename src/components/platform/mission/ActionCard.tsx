import { ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ActionCard({
  title,
  description,
  moduleName,
  href,
  kind = "action",
}: {
  title: string;
  description: string;
  moduleName: string;
  href?: string | null;
  kind?: "action" | "info";
}) {
  return (
    <Card className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
          {moduleName}
          {kind === "info" && <span className="text-muted-foreground">· info</span>}
        </div>
        <div className="font-heading text-base font-semibold">{title}</div>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {href && (
        <Button asChild size="sm" variant={kind === "action" ? "default" : "outline"}>
          <a href={href} target="_blank" rel="noreferrer" className="gap-1">
            Open <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
    </Card>
  );
}
