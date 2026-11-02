/**
 * Shared pieces of the Asistencia pages: the filters live in the URL, the
 * range is company days, the names come from the server (not from the rows a
 * page happened to load), and a batch answer is read out item by item.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { Segmented } from "@/components/kit";
import attendanceService, {
  type OpcionesDeFiltro,
  type ResultadoDeLote,
} from "@/lib/api/attendanceService";
import {
  conFiltro,
  escribirFiltros,
  leerFiltros,
  moverRango,
  periodoDe,
  rangoDe,
  type FiltrosDeAsistencia,
  type Periodo,
} from "@/lib/filtrosDeAsistencia";
import { hoyEnLaEmpresa, zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { localeActual } from "@/lib/localeActual";

/** Filters read from / written to the URL (replace, so Back leaves the page). */
export function useFiltrosDeAsistencia(
  porDefecto: Parameters<typeof leerFiltros>[1] = {},
  /** Dates only filter when the URL has them (an inbox: Novedades). */
  fechasOpcionales = false,
): [FiltrosDeAsistencia, (cambio: Partial<FiltrosDeAsistencia>) => void] {
  const [sp, setSp] = useSearchParams();
  const clave = sp.toString();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useMemo(() => leerFiltros(sp, porDefecto), [clave]);
  const cambiar = useCallback(
    (cambio: Partial<FiltrosDeAsistencia>) => {
      setSp((prev) => {
        const next = escribirFiltros(conFiltro(leerFiltros(prev, porDefecto), cambio), prev);
        // Paging or another filter must not switch the date filter on.
        if (fechasOpcionales && !prev.has("from") && !("from" in cambio)) {
          next.delete("from");
          next.delete("to");
        }

        return next;
      }, { replace: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSp],
  );

  return [f, cambiar];
}

let cacheDeOpciones: { at: number; v: OpcionesDeFiltro } | null = null;

/** Guards, stations and branches for the selects (one request, cached 60 s). */
export function useOpcionesDeFiltro(): OpcionesDeFiltro {
  const vacio: OpcionesDeFiltro = { guards: [], stations: [], branches: [] };
  const [v, setV] = useState<OpcionesDeFiltro>(cacheDeOpciones?.v || vacio);

  useEffect(() => {
    if (cacheDeOpciones && Date.now() - cacheDeOpciones.at < 60_000) return;
    attendanceService
      .filterOptions()
      .then((r) => {
        const limpio = {
          guards: r?.guards || [],
          stations: r?.stations || [],
          branches: r?.branches || [],
        };
        cacheDeOpciones = { at: Date.now(), v: limpio };
        setV(limpio);
      })
      .catch(() => {
        /* the selects stay empty; the list itself reports its own errors */
      });
  }, []);

  return v;
}

/**
 * «2 – 8 nov 2026» in the company zone, first letter in capitals («Dom, 26 oct
 * 2026»). The capital is put here, not with CSS `capitalize`: that one turned
 * the picker into «26-Oct – 01 Nov» while the table title read «26 oct – 01 nov».
 */
export function etiquetaDeRango(from: string, to: string): string {
  const fmt = (ymd: string, o: Intl.DateTimeFormatOptions) =>
    new Date(`${ymd}T12:00:00Z`).toLocaleDateString(localeActual(), { timeZone: "UTC", ...o });
  const mismoMes = from.slice(0, 7) === to.slice(0, 7);
  const texto =
    from === to
      ? fmt(from, { weekday: "short", day: "2-digit", month: "short", year: "numeric" })
      : `${fmt(from, { day: "2-digit", month: mismoMes ? undefined : "short" })} – ${fmt(to, { day: "2-digit", month: "short", year: "numeric" })}`;

  return texto.charAt(0).toLocaleUpperCase(localeActual()) + texto.slice(1);
}

/** Day / week / month switch, previous/next and «today», in company days. */
export function RangoDeAsistencia({
  f,
  onChange,
}: {
  f: FiltrosDeAsistencia;
  onChange: (cambio: Partial<FiltrosDeAsistencia>) => void;
}) {
  const { t } = useTranslation();
  const periodo = periodoDe(f.from, f.to);
  const hoy = hoyEnLaEmpresa(zonaDeLaEmpresa());

  return (
    <>
      <Segmented<Periodo>
        value={periodo}
        onChange={(p) => p !== "custom" && onChange(rangoDe(p, f.from))}
        options={[
          { value: "day", label: t("comun.periodo.dia", "Día") },
          { value: "week", label: t("ui.NominaRecords.semana", "Semana") },
          { value: "month", label: t("ui.NominaRecords.mes", "Mes") },
        ]}
      />
      <div className="glass-sunken inline-flex items-center gap-1 px-1.5 py-1">
        <button
          aria-label={t("kit.pagination.prev")}
          className="cg-focus cg-btn-ghost rounded-full p-1"
          type="button"
          onClick={() => onChange(moverRango(f.from, f.to, -1))}
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          className="cg-focus min-w-[9rem] rounded-full px-2 text-center text-sm font-medium"
          title={t("ui.NominaRecords.irAHoy", "Ir a hoy")}
          type="button"
          onClick={() => onChange(rangoDe(periodo === "custom" ? "week" : periodo, hoy))}
        >
          {etiquetaDeRango(f.from, f.to)}
        </button>
        <button
          aria-label={t("kit.pagination.next")}
          className="cg-focus cg-btn-ghost rounded-full p-1"
          type="button"
          onClick={() => onChange(moverRango(f.from, f.to, 1))}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </>
  );
}

/** A plain select over server-provided names, with «all» first. */
export function SelectorDeFiltro({
  value,
  onChange,
  options,
  todos,
  icono,
  ariaLabel,
  seleccionado,
}: {
  /** Label for a value that isn't among the options. */
  seleccionado?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string }>;
  todos: string;
  icono?: ReactNode;
  ariaLabel: string;
}) {
  return (
    <label className="glass-sunken flex min-w-0 items-center gap-2 px-3 py-1.5">
      {icono}
      <select
        aria-label={ariaLabel}
        className="cg-focus min-w-0 max-w-[14rem] bg-transparent text-sm outline-none"
        style={{ color: "var(--ink)" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{todos}</option>
        {/* A value that came in the link (e.g. a supervisor from Atrasos) but
            isn't in this list still shows as chosen, not as «Todos». */}
        {value && !options.some((o) => o.id === value) && (
          <option value={value}>{seleccionado || value}</option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Why one item of a batch did not go through, in words. */
export function motivoDelLote(t: (k: string, d?: any) => string, code?: string): string {
  switch (code) {
    case "dayClosed":
      return t("ui.Asistencia.lote.diaCerrado", "día de pago cerrado");
    case "notFound":
      return t("ui.Asistencia.lote.noEncontrado", "ya no existe o no es de tus sedes");
    case "alreadyDecided":
      return t("ui.Asistencia.lote.yaDecidida", "otra persona ya la decidió");
    case "alreadyPaid":
      return t("ui.Asistencia.lote.yaPagada", "ya está pagada");
    case "locked":
      return t("ui.Asistencia.lote.bloqueada", "periodo cerrado");
    case "notesRequired":
      return t("ui.Asistencia.lote.faltaNota", "la empresa pide una nota");
    default:
      return t("ui.Asistencia.lote.error", "error");
  }
}

/** Toast for a batch answer: how many went through, and why the rest did not. */
export function avisarLote(t: (k: string, d?: any) => string, r: ResultadoDeLote): void {
  if (!r.failed) {
    toast.success(t("ui.Asistencia.lote.listo", { count: r.ok, defaultValue: "{{count}} decidida(s)" }));

    return;
  }
  const motivos = new Map<string, number>();
  for (const x of r.results) {
    if (x.ok) continue;
    const m = motivoDelLote(t, x.error?.code);
    motivos.set(m, (motivos.get(m) || 0) + 1);
  }
  const detalle = [...motivos.entries()].map(([m, n]) => `${n} · ${m}`).join(" — ");
  const titulo = t("ui.Asistencia.lote.parcial", {
    ok: r.ok,
    failed: r.failed,
    defaultValue: "{{ok}} decidida(s), {{failed}} sin cambiar",
  });

  if (r.ok) toast.warning(titulo, { description: detalle });
  else toast.error(titulo, { description: detalle });
}
