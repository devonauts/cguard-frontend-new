import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  History as HistoryIcon,
  User,
  Clock,
  ChevronRight,
  Flag,
} from "lucide-react";

import {
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  fmtHora,
  fmtFecha,
  fmtDur,
  runStatusLabel,
} from "./runLabels";

import AppLayout from "@/layouts/app-layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageContainer,
  PageHeader,
  Section,
  StatusBadge,
  EmptyState,
  SkeletonCards,
  Toolbar,
  FIELD_CLS,
} from "@/components/kit";
import { usePageTitle } from "@/hooks/usePageTitle";
import routeService from "@/lib/api/routeService";
import { localeActual } from "@/lib/localeActual";
import { cn } from "@/lib/utils";

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* El `Select` de Radix no admite un elemento con valor vacío, así que «todos
   los estados» lleva un centinela que se traduce a `undefined` para la API. */
const TODOS = "__todos__";

/**
 * HISTORIAL DE EJECUCIONES: cada vez que un supervisor recorrió una ruta,
 * con su resultado. Filtra por fechas y estado; cada fila abre la
 * reconstrucción completa.
 */
export default function RouteRunsHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  usePageTitle(t("ui.RouteRunsHistory.titulo", "Historial de rutas"));
  const [from, setFrom] = useState(() =>
    ymd(new Date(Date.now() - 30 * 86400000)),
  );
  const [to, setTo] = useState(() => ymd(new Date()));
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<any[] | null>(null);
  const locale = localeActual();

  useEffect(() => {
    let vivo = true;

    setRows(null);
    routeService
      .runHistory({ from, to, status: status || undefined, limit: 200 })
      .then((r) => {
        if (vivo) setRows(r.rows);
      })
      .catch((e) => {
        toast.error(e?.message || "Error");
        if (vivo) setRows([]);
      });

    return () => {
      vivo = false;
    };
  }, [from, to, status]);

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<HistoryIcon />}
          subtitle={t(
            "ui.RouteRunsHistory.sub",
            "Una fila por ruta y por día: lo que se hizo, con su resultado y su evidencia, y los días en que no se hizo.",
          )}
          title={t("ui.RouteRunsHistory.titulo", "Historial de rutas")}
        />
        <Toolbar>
          <label
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("ui.RouteRunsHistory.desde", "Desde")}
            <input
              aria-label={t("ui.RouteRunsHistory.desde", "Desde")}
              className={cn(FIELD_CLS, "w-44")}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("ui.RouteRunsHistory.hasta", "Hasta")}
            <input
              aria-label={t("ui.RouteRunsHistory.hasta", "Hasta")}
              className={cn(FIELD_CLS, "w-44")}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <Select
            value={status || TODOS}
            onValueChange={(v) => setStatus(v === TODOS ? "" : v)}
          >
            <SelectTrigger
              aria-label={t("ui.RouteRunsHistory.estado", "Estado")}
              className="w-52"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>
                {t("ui.RouteRunsHistory.todos", "Todos los estados")}
              </SelectItem>
              {Object.keys(RUN_STATUS_LABEL).map((k) => (
                <SelectItem key={k} value={k}>
                  {runStatusLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Toolbar>
        <Section
          icon={<Flag />}
          title={t("ui.RouteRunsHistory.ejecuciones", "Ejecuciones")}
        >
          {rows === null ? (
            <SkeletonCards count={4} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon />}
              title={t(
                "ui.RouteRunsHistory.vacio",
                "Sin recorridos en este periodo",
              )}
            />
          ) : (
            /* Una fila por ruta y por día, también los días en que nadie la
               hizo (`not_done`, fila sin ejecución que no se abre). */
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead style={{ background: "var(--glass-sunken)" }}>
                  <tr className="border-b" style={{ borderColor: "var(--hairline)" }}>
                    {[
                      t("ui.RouteRunsHistory.colFecha", "Fecha"),
                      t("ui.RouteRunsHistory.ruta", "Ruta"),
                      t("ui.RouteRunsHistory.colQuien", "Puesto / supervisor"),
                      t("ui.RouteRunsHistory.colSalida", "Salida"),
                      t("ui.RouteRunsHistory.colParadas", "Paradas"),
                      t("ui.RouteRunsHistory.colDuracion", "Duración"),
                      t("ui.RouteRunsHistory.colNovedades", "Novedades"),
                      t("ui.RouteRunsHistory.estado", "Estado"),
                    ].map((h) => (
                      <th key={h} className="px-3 py-2.5 font-semibold">
                        {h}
                      </th>
                    ))}
                    <th aria-hidden className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const sinHacer = !!r.virtual;
                    const s = r.summary;
                    const paradas = sinHacer
                      ? "—"
                      : s
                        ? `${s.stopsCompleted}/${s.stopsPlanned}`
                        : `${r.progress?.completed ?? 0}/${r.progress?.total ?? 0}`;
                    const novedades = [
                      s?.observations
                        ? t("ui.RouteRunsHistory.nNovedades", {
                            defaultValue: "{{n}} novedades",
                            n: s.observations,
                          })
                        : null,
                      s?.criticalFindings
                        ? t("ui.RouteRunsHistory.criticos", "{{n}} críticos", {
                            n: s.criticalFindings,
                          })
                        : null,
                      s?.averageInspection != null
                        ? `${Math.round(s.averageInspection)} %`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const programada = r.scheduledStartAt
                      ? fmtHora(r.scheduledStartAt, locale)
                      : r.scheduledStartTime || null;
                    const abrir = sinHacer
                      ? undefined
                      : () => navigate(`/vehicle-patrol/runs/${r.id}`);

                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          "border-b align-top",
                          abrir && "cursor-pointer hover:bg-[var(--glass-sunken)]",
                        )}
                        style={{ borderColor: "var(--hairline)" }}
                        tabIndex={abrir ? 0 : undefined}
                        onClick={abrir}
                        onKeyDown={(e) => {
                          if (abrir && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            abrir();
                          }
                        }}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {fmtFecha(r.date, locale)}
                        </td>
                        <td className="px-3 py-2.5 font-medium">
                          {r.routeName || t("ui.RouteRunsHistory.ruta", "Ruta")}
                        </td>
                        <td className="px-3 py-2.5">
                          {r.supervisorName ? (
                            <span className="inline-flex items-center gap-1">
                              <User className="size-3" />
                              {r.supervisorName}
                            </span>
                          ) : (r.positionNames || []).length ? (
                            <span style={{ color: "var(--ink-soft)" }}>
                              {r.positionNames.join(", ")}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {r.startedAt ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="size-3" />
                              {fmtHora(r.startedAt, locale)}
                              {r.completedAt
                                ? ` – ${fmtHora(r.completedAt, locale)}`
                                : ""}
                            </span>
                          ) : (
                            "—"
                          )}
                          {programada ? (
                            <span
                              className="block text-xs"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {t("ui.RouteRunsHistory.programadaA", {
                                defaultValue: "Programada {{hora}}",
                                hora: programada,
                              })}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">{paradas}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          {s?.totalSeconds != null ? fmtDur(s.totalSeconds) : "—"}
                        </td>
                        <td className="px-3 py-2.5">{novedades || "—"}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge tone={RUN_STATUS_TONE[r.status] || "neutral"}>
                            {runStatusLabel(r.status)}
                          </StatusBadge>
                        </td>
                        <td className="px-1 py-2.5">
                          {abrir ? (
                            <ChevronRight
                              className="size-4"
                              style={{ color: "var(--ink-faint)" }}
                            />
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
