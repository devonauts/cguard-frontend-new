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
} from "./runLabels";

import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
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
  ListRow,
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

  usePageTitle("Historial de rutas");
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
      <Breadcrumb
        items={[
          { label: "Patrulla vehicular", path: "/vehicle-patrol" },
          { label: "Historial" },
        ]}
      />
      <PageContainer width="wide">
        <PageHeader
          icon={<HistoryIcon />}
          subtitle={t(
            "ui.RouteRunsHistory.sub",
            "Cada recorrido de supervisión que se ejecutó, con su resultado y su evidencia.",
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
              {Object.entries(RUN_STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
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
            <div className="space-y-1">
              {rows.map((r) => {
                const paradas = r.summary
                  ? `${r.summary.stopsCompleted}/${r.summary.stopsPlanned}`
                  : `${r.progress?.completed ?? 0}/${r.progress?.total ?? 0}`;
                const meta = [
                  `${paradas} ${t("ui.RouteRunsHistory.paradas", "paradas")}`,
                  r.summary?.averageInspection != null
                    ? `${Math.round(r.summary.averageInspection)} %`
                    : null,
                  r.summary?.criticalFindings
                    ? t("ui.RouteRunsHistory.criticos", "{{n}} críticos", {
                        n: r.summary.criticalFindings,
                      })
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <ListRow
                    key={r.id}
                    actions={
                      <ChevronRight
                        className="size-4"
                        style={{ color: "var(--ink-faint)" }}
                      />
                    }
                    badges={
                      <StatusBadge
                        tone={RUN_STATUS_TONE[r.status] || "neutral"}
                      >
                        {RUN_STATUS_LABEL[r.status] || r.status}
                      </StatusBadge>
                    }
                    meta={meta}
                    subtitle={
                      <span className="flex flex-wrap gap-x-3">
                        <span>{fmtFecha(r.date, locale)}</span>
                        {r.supervisorName && (
                          <span>
                            <User className="mr-1 inline size-3" />
                            {r.supervisorName}
                          </span>
                        )}
                        {r.startedAt && (
                          <span>
                            <Clock className="mr-1 inline size-3" />
                            {fmtHora(r.startedAt, locale)}
                            {r.completedAt
                              ? ` – ${fmtHora(r.completedAt, locale)}`
                              : ""}
                          </span>
                        )}
                      </span>
                    }
                    title={r.routeName || t("ui.RouteRunsHistory.ruta", "Ruta")}
                    onClick={() => navigate(`/vehicle-patrol/runs/${r.id}`)}
                  />
                );
              })}
            </div>
          )}
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
