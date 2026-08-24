import { useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Link } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { RefreshCw, BarChart3, AlertTriangle } from "lucide-react";
import { analyticsService, OpsAnalytics } from "@/lib/api/analyticsService";
import {
  PageContainer, PageHeader, SkeletonCards, Segmented, IconTile,
  Section as KitSection, Stagger, StatCard,
} from "@/components/kit";
import { BarChart, MeterBar } from "@/components/charts";
import { CHART_VARS, alphaVar } from "@/lib/chartColors";

/**
 * `hover:text-[var(--brand-text)]` y NO `hover:text-primary`.
 *
 * glass.css reapunta `.text-primary` a `--brand-text`, pero esa corrección sólo
 * alcanza a la clase base: `hover:text-primary` genera otra regla
 * (`.hover\:text-primary:hover`) que sigue apuntando a `--primary`, o sea al
 * RELLENO del acento. Sobre el lienzo claro eso da 2,25:1 — el nombre del sitio
 * se volvía ilegible justo al pasar el ratón por encima, que es cuando hay que
 * poder leerlo.
 */
const ENLACE = "font-medium text-foreground hover:text-[var(--brand-text)] hover:underline";

/** Link a site name to its post-site detail page. */
export function SiteLink({ id, name }: { id?: string; name: string }) {
  if (!id) return <span className="font-medium text-foreground">{name}</span>;
  return <Link to={`/post-sites/${id}`} className={ENLACE}>{name}</Link>;
}

/** Link a guard name to their performance/indicators page. */
export function GuardLink({ id, name }: { id?: string; name: string }) {
  if (!id) return <span className="font-medium text-foreground">{name}</span>;
  return <Link to={`/guards/${id}/indicadores`} className={ENLACE}>{name}</Link>;
}

/**
 * El acento del usuario, como cadena CSS.
 *
 * Antes era un dorado escrito a mano, hexadecimal, que dejaba de pertenecer al
 * sistema en cuanto alguien elegía otro acento. Ahora apunta a `--chart-1`, que
 * tokens.css deriva de `--brand-h`, así que el navegador lo repinta solo. El
 * nombre se conserva para no romper a quien ya lo importa.
 */
export const GOLD = CHART_VARS.series[0];

/** Los colores que puede llevar una métrica. Semánticos donde hay estado; escalones del acento donde no. */
export const TONES = {
  brand: CHART_VARS.series[0],
  serie2: CHART_VARS.series[1],
  serie3: CHART_VARS.series[2],
  ok: CHART_VARS.ok,
  warn: CHART_VARS.warn,
  bad: CHART_VARS.bad,
  info: CHART_VARS.info,
  neutral: CHART_VARS.inkFaint,
} as const;

/**
 * El MISMO tono, a la luminosidad que necesita una LETRA.
 *
 * `--ok`, `--warn`, `--brand`… están calculados para RELLENAR (una barra, una
 * píldora). Usados como color de texto sobre el lienzo claro se quedan en
 * ~2,5:1 y no se leen. Cada uno tiene su gemelo `-text`, que es el mismo tono
 * bajado de luminosidad hasta pasar contraste. Regla: relleno → `TONES`,
 * letra o icono → `toneInk(TONES.x)`.
 */
const INK_OF: Record<string, string> = {
  [CHART_VARS.series[0]]: CHART_VARS.brandText,
  [CHART_VARS.brand]: CHART_VARS.brandText,
  [CHART_VARS.ok]: "var(--ok-text)",
  [CHART_VARS.warn]: "var(--warn-text)",
  [CHART_VARS.bad]: "var(--bad-text)",
  [CHART_VARS.info]: "var(--info-text)",
};

/** Lo que no reconoce lo devuelve tal cual, así que un color heredado se
 *  comporta exactamente como antes. */
export const toneInk = (fill: string) => INK_OF[fill] ?? fill;

const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const PRESETS: { label: string; days: number }[] = [
  { label: "Hoy", days: 1 },
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
];

export function useOpsAnalytics(initialDays = 30) {
  const [days, setDays] = useState(initialDays);
  const [data, setData] = useState<OpsAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 86400000);
    return { startDate: fmtDate(start), endDate: fmtDate(end) };
  }, [days]);

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await analyticsService.operations(range)); }
    catch (e) { setError((e as Error)?.message || "No se pudieron cargar las analíticas"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);
  return { days, setDays, data, loading, error, reload: load };
}

/** Page chrome: CRM layout shell + header (title, range presets, refresh) + states. */
export function AnalyticsShell({
  title, subtitle, days, setDays, loading, error, reload, children,
}: {
  title: string; subtitle: string; days: number; setDays: (n: number) => void;
  loading: boolean; error: string | null; reload: () => void; children: React.ReactNode;
}) {
  return (
    <AppLayout>
      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<BarChart3 />}
          title={title}
          subtitle={subtitle}
          actions={
            <>
              <Segmented
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
                options={PRESETS.map((p) => ({ value: String(p.days), label: p.label }))}
              />
              <Button variant="outline" size="icon" onClick={reload} title="Actualizar" aria-label="Actualizar">
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </Button>
            </>
          }
        />

        {loading ? (
          <SkeletonCards count={6} className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" />
        ) : error ? (
          // Un fallo de carga es un ESTADO malo, no el acento de la página.
          <div className="glass flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
            <IconTile tone="bad"><AlertTriangle /></IconTile>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">No se pudieron cargar los indicadores</p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--ink-soft)" }}>{error}</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2 sm:shrink-0" onClick={reload}>
              <RefreshCw size={14} /> Reintentar
            </Button>
          </div>
        ) : (
          children
        )}
      </PageContainer>
    </AppLayout>
  );
}

export function MetricCard({ icon, value, label, sub, accent, pct }: {
  icon: React.ReactNode; value: string | number; label: string; sub?: string; accent: string; pct?: number;
}) {
  // El relleno pinta la baldosa y la barra; la TINTA pinta el icono y la cifra.
  const ink = toneInk(accent);
  return (
    <div className="glass glass-hover flex h-full flex-col p-4">
      <div className="flex items-center justify-between gap-2">
        {/* `color-mix` y no `${accent}1A`: concatenar alfa a la cadena sólo
            funciona con hexadecimales, y estos colores ya son `var(--…)`. */}
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl border"
          style={{ background: alphaVar(accent, 14), borderColor: alphaVar(accent, 30), color: ink }}
        >
          {icon}
        </span>
        {typeof pct === "number" && (
          <span className="text-xs font-semibold tabular-nums" style={{ color: ink }}>{pct}%</span>
        )}
      </div>
      <p className="font-display mt-3 text-3xl font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1.5 text-sm font-medium">{label}</p>
      {sub && <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>{sub}</p>}
      {typeof pct === "number" && (
        <MeterBar className="mt-2.5" height={6} pct={pct} color={accent} ariaLabel={label} />
      )}
    </div>
  );
}

/** Daily bars from arbitrary points. */
export function DayBars({ title, points, color }: { title: string; points: { k: string; v: number }[]; color: string }) {
  const total = points.reduce((s, p) => s + p.v, 0);
  return (
    <div className="glass p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          <span className="font-semibold tabular-nums text-foreground">{total}</span> total
        </p>
      </div>
      {/* La etiqueta del globo lleva la fecha COMPLETA; abajo sólo caben los extremos. */}
      <BarChart
        className="mt-3"
        height={96}
        color={color}
        ariaLabel={title}
        data={points.map((p) => ({ label: p.k, value: p.v }))}
      />
      <div className="mt-1.5 flex justify-between text-[10px]" style={{ color: "var(--ink-faint)" }}>
        <span>{points[0]?.k.slice(5)}</span>
        <span>{points[points.length - 1]?.k.slice(5)}</span>
      </div>
    </div>
  );
}

export function HBars({ items, color, empty }: { items: { label: string; count: number }[]; color: string; empty: string }) {
  if (!items.length) return <p className="py-4 text-sm" style={{ color: "var(--ink-soft)" }}>{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-32 shrink-0 truncate text-xs" style={{ color: "var(--ink-soft)" }} title={it.label}>{it.label}</span>
          <MeterBar className="flex-1" height={16} color={color} pct={(it.count / max) * 100} ariaLabel={it.label} />
          <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">{it.count}</span>
        </div>
      ))}
    </div>
  );
}

/** Panel de cristal del kit. Se conservan el nombre y la firma porque lo importan
 *  estos paneles y el de alarmas. */
export function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <KitSection title={title} icon={icon}>{children}</KitSection>;
}

/**
 * Tinta de un porcentaje de cumplimiento. Es SEVERIDAD (bien / aviso / mal), no
 * el acento: sale de los semánticos, que el sistema deja fijos elija la empresa
 * el color que elija. Devuelve una variable CSS, no una clase, porque no existe
 * —ni debe existir— una utilidad de Tailwind que apunte a estos tokens.
 */
export const pctColor = (p: number) => (p >= 90 ? "var(--ok-text)" : p >= 70 ? "var(--warn-text)" : "var(--bad-text)");

/**
 * Resumen por sitio de servicio.
 *
 * Estaba escrita dos veces —Operaciones y Sitios de Servicio— con las MISMAS
 * seis columnas y una séptima («Turnos») sólo en una de ellas. Dos tablas que
 * dicen lo mismo tienen que alinearse igual, así que ahora es una con la
 * columna opcional.
 */
export function PerSiteTable({ rows, showShifts = false, limit }: {
  rows: OpsAnalytics["perSite"];
  showShifts?: boolean;
  limit?: number;
}) {
  const { t } = useTranslation();
  const visibles = limit ? rows.slice(0, limit) : rows;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Sitio</th>
            <th className="px-3 py-2 text-right font-semibold">Vigilantes</th>
            {showShifts && <th className="px-3 py-2 text-right font-semibold">Turnos</th>}
            <th className="px-3 py-2 text-right font-semibold">Cobertura</th>
            <th className="px-3 py-2 text-right font-semibold">Rondas</th>
            <th className="px-3 py-2 text-right font-semibold">{t("ui.shared.ubicacion", "Ubicación")}</th>
            <th className="px-3 py-2 text-right font-semibold">Incidentes</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {visibles.map((s, i) => (
            <tr key={i} className="hover:bg-[var(--glass-sunken)]">
              <td className="px-3 py-2"><SiteLink id={s.id} name={s.site} /></td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.guards}</td>
              {showShifts && (
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.shiftsCovered}/{s.shiftsTotal}</td>
              )}
              <td className="px-3 py-2 text-right tabular-nums"><span style={{ color: pctColor(s.coveragePct) }}>{s.coveragePct}%</span></td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.rondasCompleted}</td>
              <td className="px-3 py-2 text-right tabular-nums"><span style={{ color: pctColor(s.locationCompliancePct) }}>{s.locationCompliancePct}%</span></td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">{s.incidents}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Las cuatro cifras de asistencia. Idénticas en Operaciones y en Vigilantes. */
export function AttendanceTiles({ attendance, className }: {
  attendance: OpsAnalytics["attendance"];
  className?: string;
}) {
  return (
    <Stagger className={className ?? "grid grid-cols-2 gap-3"}>
      {[
        { label: "Horas trabajadas", value: attendance.hoursWorked, accent: "info" },
        { label: "Tardanzas", value: attendance.late, accent: "warn" },
        { label: "Salidas tempranas", value: attendance.earlyDeparture, accent: "warn" },
        { label: "Fuera de geocerca", value: attendance.geofenceViolations, accent: "bad" },
      ].map((c) => (
        <StatCard key={c.label} accent={c.accent} label={c.label} value={c.value} />
      ))}
    </Stagger>
  );
}

export function RangeFooter({ data }: { data: OpsAnalytics }) {
  return (
    <p className="text-center text-xs" style={{ color: "var(--ink-faint)" }}>
      Período: {data.range.start.slice(0, 10)} → {data.range.end.slice(0, 10)} · {data.range.days} días
    </p>
  );
}
