/**
 * Un solo panel para las tres series del panel, con un conmutador de píldoras
 * en vez de tres tarjetas iguales en fila. Tres gráficos idénticos uno al lado
 * del otro obligan a comparar cosas que no se comparan (incidentes contra
 * minutos contra clientes); uno grande deja LEER la serie que interesa.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Building2, Timer } from "lucide-react";
import { Segmented } from "@/components/kit";
import { AreaChart } from "@/components/charts";
import type { MonthPoint } from "../types";
import { fmtValue, toneFill, toneInk, toneWash, type Tone } from "../tone";
import { Panel, PanelLink } from "./Panel";

type SerieKey = "incidentes" | "respuesta" | "clientes";

export function TrendPanel({ incidents, response, acquisition, className }: {
  incidents: MonthPoint[]; response: MonthPoint[]; acquisition: MonthPoint[]; className?: string;
}) {
  const [serie, setSerie] = useState<SerieKey>("incidentes");

  const SERIES: Record<SerieKey, {
    label: string; icon: React.ReactNode; tone: Tone; data: MonthPoint[];
    subtitle: string; suffix: string; to: string; mejorSi: "menor" | "mayor";
  }> = {
    incidentes: {
      label: "Incidentes", icon: <AlertTriangle />, tone: "bad", data: incidents,
      subtitle: "Incidentes reportados por mes", suffix: "", to: "/activities", mejorSi: "menor",
    },
    respuesta: {
      label: "Respuesta", icon: <Timer />, tone: "info", data: response,
      subtitle: "Minutos promedio hasta la primera respuesta", suffix: " min", to: "/analytics/reporting", mejorSi: "menor",
    },
    clientes: {
      label: "Clientes", icon: <Building2 />, tone: "brand", data: acquisition,
      subtitle: "Clientes nuevos incorporados por mes", suffix: "", to: "/clients", mejorSi: "mayor",
    },
  };

  const s = SERIES[serie];
  const vals = s.data.map((d) => d.value);
  const ultimo = vals.length ? vals[vals.length - 1] : null;
  const previo = vals.length > 1 ? vals[vals.length - 2] : null;
  const cambio = previo != null && previo !== 0 && ultimo != null ? (ultimo - previo) / Math.abs(previo) : null;
  const promedio = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const maximo = vals.length ? Math.max(...vals) : null;

  // El gráfico del sistema habla en `{label, value}`; el panel guarda `{month,
  // value}`. La traducción va aquí y no en el hook: los datos no cambian de
  // forma por un cambio de gráfico.
  const serieChart = useMemo(() => s.data.map((d) => ({ label: d.month, value: d.value })), [s.data]);

  return (
    <Panel
      className={className}
      icon={s.icon}
      tone={s.tone}
      title="Tendencia operativa"
      subtitle={s.subtitle}
      action={<PanelLink to={s.to} />}
      bodyClassName="px-5 pb-5 pt-4"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <span className="font-display text-4xl font-bold leading-none tracking-tight tabular-nums">
            {ultimo == null ? "—" : fmtValue(ultimo)}
          </span>
          {s.suffix && <span className="mb-0.5 text-sm font-semibold" style={{ color: "var(--ink-faint)" }}>{s.suffix.trim()}</span>}
          {cambio != null && <MovePill cambio={cambio} mejorSi={s.mejorSi} />}
          <span className="mb-1 text-[11px]" style={{ color: "var(--ink-faint)" }}>vs. mes anterior</span>
        </div>
        <Segmented
          value={serie}
          onChange={setSerie}
          options={(Object.keys(SERIES) as SerieKey[]).map((k) => ({ value: k, label: SERIES[k].label }))}
        />
      </div>

      {serieChart.length ? (
        <AreaChart
          data={serieChart}
          tone={s.tone}
          height={190}
          formatValue={(v) => `${fmtValue(v)}${s.suffix}`}
          ariaLabel={`${s.label}: ${s.subtitle}`}
        />
      ) : (
        <div className="grid place-items-center text-xs" style={{ height: 190, color: "var(--ink-faint)" }}>
          Sin datos para el periodo
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Resumen label="Promedio" value={promedio == null ? "—" : `${fmtValue(Math.round(promedio * 10) / 10)}${s.suffix}`} />
        <Resumen label="Máximo" value={maximo == null ? "—" : `${fmtValue(maximo)}${s.suffix}`} />
        <Resumen label="Meses" value={String(vals.length)} />
      </div>
    </Panel>
  );
}

/**
 * La flecha dice hacia DÓNDE se movió; el color dice si eso es bueno. En
 * seguridad no coinciden: menos incidentes es una bajada Y una buena noticia, y
 * pintarla de rojo por ir hacia abajo sería mentir.
 */
function MovePill({ cambio, mejorSi }: { cambio: number; mejorSi: "menor" | "mayor" }) {
  const plano = Math.abs(cambio) <= 0.02;
  const sube = cambio > 0;
  const bueno = plano ? null : mejorSi === "menor" ? !sube : sube;
  const tone: Tone = bueno == null ? "neutral" : bueno ? "ok" : "bad";
  return (
    <span
      className="mb-0.5 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums"
      style={{ background: toneWash(tone, 14), color: toneInk(tone) }}
    >
      <span aria-hidden style={{ color: toneFill(tone) }}>{plano ? "—" : sube ? "▲" : "▼"}</span>
      {new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 }).format(Math.abs(cambio) * 100)} %
    </span>
  );
}

function Resumen({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-sunken px-3 py-2">
      <div className="cg-eyebrow truncate">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
