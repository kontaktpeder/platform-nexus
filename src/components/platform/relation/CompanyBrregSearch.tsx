import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { searchBrregCompaniesFn } from "@/lib/brreg.functions";
import type { BrregCompanyHit } from "@/lib/brreg.server";

type Props = {
  onSelect: (company: BrregCompanyHit) => void;
  disabled?: boolean;
  placeholder?: string;
};

/** Finance-style Brreg typeahead for company enrichment. */
export function CompanyBrregSearch({ onSelect, disabled, placeholder }: Props) {
  const search = useServerFn(searchBrregCompaniesFn);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BrregCompanyHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      const myId = ++reqIdRef.current;
      try {
        const res = await search({ data: { q } });
        if (myId !== reqIdRef.current) return;
        if (res.ok) {
          setResults(res.companies);
          setOpen(res.companies.length > 0);
        } else {
          toast.error(res.message || "Kunne ikke hente fra Brønnøysund");
          setResults([]);
        }
      } catch {
        if (myId !== reqIdRef.current) return;
        toast.error("Kunne ikke hente fra Brønnøysund. Fyll inn manuelt.");
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, search]);

  function pick(c: BrregCompanyHit) {
    onSelect(c);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder={placeholder ?? "Søk Brreg — firmanavn eller org.nr"}
            disabled={disabled}
            className="h-11 rounded-xl pl-8"
          />
          {loading && (
            <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-80 w-[var(--radix-popover-trigger-width)] overflow-auto p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <ul className="py-1">
          {results.map((c) => (
            <li key={`${c.kind}:${c.orgNr}`}>
              <button
                type="button"
                onClick={() => pick(c)}
                className="w-full px-3 py-2 text-left hover:bg-accent focus:bg-accent focus:outline-none"
              >
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.orgNr}
                  {c.address ? ` · ${c.address}` : ""}
                  {c.postalCode ? `, ${c.postalCode} ${c.city ?? ""}` : ""}
                  {c.kind === "underenhet" ? " · underenhet" : ""}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
