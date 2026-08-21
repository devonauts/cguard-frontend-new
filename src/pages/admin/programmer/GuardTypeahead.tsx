import { useEffect, useRef, useState } from "react";
import { Search, X, Check } from "lucide-react";
import securityGuardService from "@/lib/api/securityGuardService";

export interface GuardPick { guardId: string; label: string }

/**
 * Selector de vigilante con búsqueda por nombre. Emite el `guardId` (la cuenta)
 * que la cobertura necesita. Mismo endpoint de autocompletar del resto del CRM.
 */
export default function GuardTypeahead({
  value, onSelect, placeholder = "Busca por nombre…", excludeGuardId,
}: {
  value: GuardPick | null;
  onSelect: (g: GuardPick | null) => void;
  placeholder?: string;
  excludeGuardId?: string | null;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (value || q.trim().length < 2) { setRows([]); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await securityGuardService.autocomplete(q.trim(), 8);
        const list = Array.isArray(r) ? r : r?.rows || r?.data || [];
        if (alive) setRows(list.filter((x: any) => x.guardId && String(x.guardId) !== String(excludeGuardId)));
      } catch { if (alive) setRows([]); }
      finally { if (alive) setLoading(false); }
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q, value, excludeGuardId]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-[var(--hairline)] bg-[var(--glass-raised)] px-3 py-2">
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
          <Check className="size-4 text-[var(--brand-text)]" /> {value.label}
        </span>
        <button
          type="button"
          onClick={() => { onSelect(null); setQ(""); }}
          className="cg-focus rounded p-1 text-[var(--ink-faint)] hover:text-[var(--ink)]"
          aria-label="Quitar"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-[var(--hairline)] bg-[var(--glass-sunken)] px-3">
        <Search className="size-4 shrink-0 text-[var(--ink-faint)]" />
        <input
          className="w-full bg-transparent py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          placeholder={placeholder}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (q.trim().length >= 2) && (
        <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[var(--hairline)] bg-[var(--float)] shadow-lg">
          {loading && <div className="px-3 py-2.5 text-sm text-[var(--ink-soft)]">Buscando…</div>}
          {!loading && !rows.length && <div className="px-3 py-2.5 text-sm text-[var(--ink-soft)]">Sin resultados.</div>}
          {rows.map((r) => (
            <button
              key={r.guardId}
              type="button"
              onClick={() => { onSelect({ guardId: String(r.guardId), label: r.label || r.fullName || "Vigilante" }); setOpen(false); setQ(""); }}
              className="cg-focus flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--glass-raised)]"
            >
              <span>{r.label || r.fullName}</span>
              {r.cuenta && (
                <span className="text-[11px] text-[var(--ink-faint)]">
                  {r.cuenta === "active" ? "en la app" : r.cuenta === "invited" ? "invitado" : ""}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
