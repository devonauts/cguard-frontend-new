import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { RefreshCw, BarChart3, AlertTriangle } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { analyticsService, OpsAnalytics } from "@/lib/api/analyticsService";
import {
  PageContainer,
  PageHeader,
  SkeletonCards,
  Segmented,
  IconTile,
  Section as KitSection,
  Stagger,
  StatCard,
} from "@/components/kit";
import { BarChart, MeterBar } from "@/components/charts";
import { CHART_VARS, alphaVar } from "@/lib/chartColors";
import { localeActual } from "@/lib/localeActual";

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
/* `py-2 -my-2` es el área que responde al dedo, no espacio: el relleno agranda
   la caja del enlace a 36-40 px y el margen negativo se lo devuelve a la línea,
   así la fila de la tabla mide lo mismo que antes. Un nombre de 20 px de alto
   en una tabla densa se falla con el pulgar; el texto no se mueve un pixel. */
const ENLACE =
  "-my-3 inline-block py-3 font-medium text-foreground hover:text-[var(--brand-text)] hover:underline";

/** Link a site name to its post-site detail page. */
export function SiteLink({ id, name }: { id?: string; name: string }) {
  if (!id) return <span className="font-medium text-foreground">{name}</span>;

  return (
    <Link className={ENLACE} to={`/post-sites/${id}`}>
      {name}
    </Link>
  );
}

/** Link a guard name to their performance/indicators page. */
export function GuardLink({ id, name }: { id?: string; name: string }) {
  if (!id) return <span className="font-medium text-foreground">{name}</span>;

  return (
    <Link className={ENLACE} to={`/guards/${id}/indicadores`}>
      {name}
    </Link>
  );
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

const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Constante de módulo: guarda la CLAVE, no el texto traducido. Llamar a `t()`
 *  aquí lo congelaría en el idioma de arranque. Se traduce en AnalyticsShell. */
const PRESETS: { label: string; labelKey: string; days: number }[] = [
  { label: "Hoy", labelKey: "analytics.range.today", days: 1 },
  { label: "7 días", labelKey: "analytics.range.d7", days: 7 },
  { label: "30 días", labelKey: "analytics.range.d30", days: 30 },
  { label: "90 días", labelKey: "analytics.range.d90", days: 90 },
];

export function useOpsAnalytics(initialDays = 30) {
  const { t } = useTranslation();
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
    setLoading(true);
    setError(null);
    try {
      setData(await analyticsService.operations(range));
    } catch (e) {
      setError(
        (e as Error)?.message ||
          t("analytics.loadError", "No se pudieron cargar las analíticas"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [days]);

  return { days, setDays, data, loading, error, reload: load };
}

/** Page chrome: CRM layout shell + header (title, range presets, refresh) + states. */
export function AnalyticsShell({
  title,
  subtitle,
  days,
  setDays,
  loading,
  error,
  reload,
  children,
}: {
  title: string;
  subtitle: string;
  days: number;
  setDays: (n: number) => void;
  loading: boolean;
  error: string | null;
  reload: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          actions={
            <>
              <Segmented
                options={PRESETS.map((p) => ({
                  value: String(p.days),
                  label: t(p.labelKey, p.label),
                }))}
                value={String(days)}
                onChange={(v) => setDays(Number(v))}
              />
              <Button
                aria-label={t("ui.shared.actualizar", "Actualizar")}
                size="icon"
                title={t("ui.shared.actualizar", "Actualizar")}
                variant="outline"
                onClick={reload}
              >
                <RefreshCw
                  className={loading ? "animate-spin" : ""}
                  size={15}
                />
              </Button>
            </>
          }
          icon={<BarChart3 />}
          subtitle={subtitle}
          title={title}
        />

        {loading ? (
          <SkeletonCards
            className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
            count={6}
          />
        ) : error ? (
          // Un fallo de carga es un ESTADO malo, no el acento de la página.
          <div className="glass flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
            <IconTile tone="bad">
              <AlertTriangle />
            </IconTile>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {t("ui.shared.noSePudieronCargarLos")}
              </p>
              <p
                className="mt-0.5 text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                {error}
              </p>
            </div>
            <Button
              className="gap-2 sm:shrink-0"
              size="sm"
              variant="outline"
              onClick={reload}
            >
              <RefreshCw size={14} /> {t("ui.shared.reintentar", "Reintentar")}
            </Button>
          </div>
        ) : (
          children
        )}
      </PageContainer>
    </AppLayout>
  );
}

export function MetricCard({
  icon,
  value,
  label,
  sub,
  accent,
  pct,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  sub?: string;
  accent: string;
  pct?: number;
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
          style={{
            background: alphaVar(accent, 14),
            borderColor: alphaVar(accent, 30),
            color: ink,
          }}
        >
          {icon}
        </span>
        {typeof pct === "number" && (
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: ink }}
          >
            {pct}%
          </span>
        )}
      </div>
      <p className="font-display mt-3 text-3xl font-bold leading-none tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 text-sm font-medium">{label}</p>
      {sub && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
          {sub}
        </p>
      )}
      {typeof pct === "number" && (
        <MeterBar
          ariaLabel={label}
          className="mt-2.5"
          color={accent}
          height={6}
          pct={pct}
        />
      )}
    </div>
  );
}

/** Daily bars from arbitrary points. */
export function DayBars({
  title,
  points,
  color,
}: {
  title: string;
  points: { k: string; v: number }[];
  color: string;
}) {
  const { t } = useTranslation();
  const total = points.reduce((s, p) => s + p.v, 0);

  return (
    <div className="glass p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          <span className="font-semibold tabular-nums text-foreground">
            {total}
          </span>{" "}
          {t("ui.shared.total", "total")}
        </p>
      </div>
      {/* La etiqueta del globo lleva la fecha COMPLETA; abajo sólo caben los extremos. */}
      <BarChart
        ariaLabel={title}
        className="mt-3"
        color={color}
        data={points.map((p) => ({ label: p.k, value: p.v }))}
        height={96}
      />
      <div
        className="mt-1.5 flex justify-between text-[10px]"
        style={{ color: "var(--ink-faint)" }}
      >
        <span>{points[0]?.k.slice(5)}</span>
        <span>{points[points.length - 1]?.k.slice(5)}</span>
      </div>
    </div>
  );
}

export function HBars({
  items,
  color,
  empty,
}: {
  items: { label: string; count: number }[];
  color: string;
  empty: string;
}) {
  if (!items.length)
    return (
      <p className="py-4 text-sm" style={{ color: "var(--ink-soft)" }}>
        {empty}
      </p>
    );
  const max = Math.max(1, ...items.map((i) => i.count));

  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-32 shrink-0 truncate text-xs"
            style={{ color: "var(--ink-soft)" }}
            title={it.label}
          >
            {it.label}
          </span>
          <MeterBar
            ariaLabel={it.label}
            className="flex-1"
            color={color}
            height={16}
            pct={(it.count / max) * 100}
          />
          <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums">
            {it.count}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Panel de cristal del kit. Se conservan el nombre y la firma porque lo importan
 *  estos paneles y el de alarmas. */
export function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <KitSection icon={icon} title={title}>
      {children}
    </KitSection>
  );
}

/**
 * Tinta de un porcentaje de cumplimiento. Es SEVERIDAD (bien / aviso / mal), no
 * el acento: sale de los semánticos, que el sistema deja fijos elija la empresa
 * el color que elija. Devuelve una variable CSS, no una clase, porque no existe
 * —ni debe existir— una utilidad de Tailwind que apunte a estos tokens.
 */
export const pctColor = (p: number) =>
  p >= 90 ? "var(--ok-text)" : p >= 70 ? "var(--warn-text)" : "var(--bad-text)";

/**
 * Resumen por sitio de servicio.
 *
 * Estaba escrita dos veces —Operaciones y Sitios de Servicio— con las MISMAS
 * seis columnas y una séptima («Turnos») sólo en una de ellas. Dos tablas que
 * dicen lo mismo tienen que alinearse igual, así que ahora es una con la
 * columna opcional.
 */
export function PerSiteTable({
  rows,
  showShifts = false,
  limit,
}: {
  rows: OpsAnalytics["perSite"];
  showShifts?: boolean;
  limit?: number;
}) {
  const { t } = useTranslation();
  const visibles = limit ? rows.slice(0, limit) : rows;

  return (
    <div className="overflow-x-auto">
      <table className="cg-tabla-fichas min-w-full text-sm">
        <thead className="border-b text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">{t("ui.shared.sitio", "Sede")}</th>
            <th className="px-3 py-2 text-right font-semibold">
              {t("ui.shared.vigilantes", "Vigilantes")}
            </th>
            {showShifts && (
              <th className="px-3 py-2 text-right font-semibold">
                {t("ui.shared.turnos", "Turnos")}
              </th>
            )}
            <th className="px-3 py-2 text-right font-semibold">
              {t("ui.shared.cobertura", "Cobertura")}
            </th>
            <th className="px-3 py-2 text-right font-semibold">
              {t("ui.shared.rondas", "Rondas")}
            </th>
            <th className="px-3 py-2 text-right font-semibold">
              {t("ui.shared.ubicacion", "Ubicación")}
            </th>
            <th className="px-3 py-2 text-right font-semibold">
              {t("ui.shared.incidentes", "Incidentes")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {visibles.map((s, i) => (
            <tr key={i} className="hover:bg-[var(--glass-sunken)]">
              <td className="px-3 py-2" data-rotulo={t("ui.shared.sitio", "Sitio")}>
                <SiteLink id={s.id} name={s.site} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" data-rotulo={t("ui.shared.vigilantes", "Vigilantes")}>
                {s.guards}
              </td>
              {showShifts && (
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" data-rotulo={t("ui.shared.turnos", "Turnos")}>
                  {s.shiftsCovered}/{s.shiftsTotal}
                </td>
              )}
              <td className="px-3 py-2 text-right tabular-nums" data-rotulo={t("ui.shared.cobertura", "Cobertura")}>
                <span style={{ color: pctColor(s.coveragePct) }}>
                  {s.coveragePct}%
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground" data-rotulo={t("ui.shared.rondas", "Rondas")}>
                {s.rondasCompleted}
              </td>
              <td className="px-3 py-2 text-right tabular-nums" data-rotulo={t("ui.shared.ubicacion", "Ubicación")}>
                <span style={{ color: pctColor(s.locationCompliancePct) }}>
                  {s.locationCompliancePct}%
                </span>
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground" data-rotulo={t("ui.shared.incidentes", "Incidentes")}>
                {s.incidents}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Las cuatro cifras de asistencia. Idénticas en Operaciones y en Vigilantes. */
export function AttendanceTiles({
  attendance,
  className,
}: {
  attendance: OpsAnalytics["attendance"];
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <Stagger className={className ?? "grid grid-cols-2 gap-3"}>
      {[
        {
          label: t(
            "guards.summary.stats.metrics.hoursWorked",
            "Horas trabajadas",
          ),
          value: attendance.hoursWorked,
          accent: "info",
        },
        {
          label: t("analytics.attendance.late", "Tardanzas"),
          value: attendance.late,
          accent: "warn",
        },
        {
          label: t("analytics.attendance.earlyDeparture", "Salidas tempranas"),
          value: attendance.earlyDeparture,
          accent: "warn",
        },
        {
          label: t("nomina.excepcion.outside_geofence", "Fuera de geocerca"),
          value: attendance.geofenceViolations,
          accent: "bad",
        },
      ].map((c) => (
        <StatCard
          key={c.label}
          accent={c.accent}
          label={c.label}
          value={c.value}
        />
      ))}
    </Stagger>
  );
}

/** A company day (`YYYY-MM-DD`) in the reader's date format. */
const diaLegible = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);

  if (!y || !m || !d) return ymd;
  try {
    return new Intl.DateTimeFormat(localeActual(), {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return ymd;
  }
};

export function RangeFooter({ data }: { data: OpsAnalytics }) {
  const { t } = useTranslation();
  // The window's END instant is the next UTC day for a company west of UTC
  // («Hoy» read «11-01 → 11-02»): print the company days the server echoes.
  const inicio = data.range.startDay || data.range.start.slice(0, 10);
  const fin = data.range.endDay || data.range.end.slice(0, 10);

  return (
    <p className="text-center text-xs" style={{ color: "var(--ink-faint)" }}>
      {t("ui.shared.periodoRango", {
        defaultValue: "Período: {{start}} → {{end}} · {{count}} días",
        start: diaLegible(inicio),
        end: diaLegible(fin),
        count: data.range.days,
      })}
    </p>
  );
}
