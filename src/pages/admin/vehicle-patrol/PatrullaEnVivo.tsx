import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Clock,
  MapPin,
  User,
  Pause,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

import {
  RUN_STATUS_TONE,
  SCHEDULE_TONE,
  fmtHora,
  runStatusLabel,
  scheduleLabel,
  visitStatusLabel,
} from "./runLabels";

import {
  Section,
  StatusBadge,
  StatusDot,
  EmptyState,
  GlassPanel,
  SkeletonCards,
  Meter,
} from "@/components/kit";
import { getAuthToken } from "@/lib/api";
import { crearSocket, cerrarSocket } from "@/lib/socket";
import routeService from "@/lib/api/routeService";
import { localeActual } from "@/lib/localeActual";
import { useSondeoVisible } from "@/hooks/useSondeoVisible";

/**
 * LO QUE ESTÁ PASANDO AHORA: las ejecuciones abiertas de todas las rutas de
 * supervisión, con el supervisor, en qué parada va, cuántas lleva y si va a
 * tiempo. Se refresca con `route:progress` (el mismo canal por el que el
 * servidor anuncia cada llegada/cierre) y, por si el socket se cae, cada 45 s.
 */
export default function PatrullaEnVivo() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<any[] | null>(null);
  const [vivo, setVivo] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await routeService.activeRuns());
    } catch {
      setRows((r) => r ?? []);
    }
  }, []);

  useEffect(() => {
    load();
    const tid = localStorage.getItem("tenantId");
    const socket = tid ? crearSocket(getAuthToken() || "", tid) : null;
    /* AGRUPADO, como en Cobertura. `route:progress` no es «una ruta avanzó»:
       es CADA punto de GPS de CADA vehículo en marcha. Sin agrupar, una flota
       de veinte vehículos emitiendo cada diez segundos pedía la lista entera
       unas 7.000 veces por hora — y todas devuelven lo mismo, porque lo que
       cambió cabe en una fila. Con la ventana de 700 ms, una ráfaga de
       llegadas simultáneas se lee UNA vez. */
    let agrup: ReturnType<typeof setTimeout> | null = null;
    const onProgress = () => {
      if (agrup) clearTimeout(agrup);
      agrup = setTimeout(() => {
        void load();
      }, 700);
    };

    if (socket) {
      socket.on("route:progress", onProgress);
      socket.on("connect", () => setVivo(true));
      socket.on("disconnect", () => setVivo(false));
    }

    return () => {
      if (agrup) clearTimeout(agrup);
      if (socket) {
        socket.off("route:progress", onProgress);
        cerrarSocket(socket);
      }
    };
  }, [load]);

  // El reloj de respaldo por si el socket se cae, sólo con la pestaña a la vista.
  useSondeoVisible(load, 45_000);

  const locale = localeActual();

  return (
    <Section
      action={
        /* El punto que late es el del kit (`StatusDot pulse`): sólo late
           mientras el canal en vivo está conectado. Si se cae, se dice cada
           cuánto se refresca en vez de fingir que sigue en vivo. */
        <span
          className="inline-flex items-center gap-2 text-xs"
          style={{ color: "var(--ink-soft)" }}
        >
          <StatusDot
            label={
              vivo
                ? t("ui.PatrullaEnVivo.enVivo", "En vivo")
                : t("ui.PatrullaEnVivo.sondeo", "Actualizando cada 45 s")
            }
            pulse={vivo}
            tone={vivo ? "ok" : "neutral"}
          />
          {vivo
            ? t("ui.PatrullaEnVivo.enVivo", "En vivo")
            : t("ui.PatrullaEnVivo.sondeo", "Actualizando cada 45 s")}
        </span>
      }
      icon={<Activity />}
      title={t("ui.PatrullaEnVivo.titulo", "En curso ahora")}
    >
      {rows === null ? (
        <SkeletonCards className="lg:grid-cols-2" count={2} />
      ) : rows.length === 0 ? (
        <EmptyState
          description={t(
            "ui.PatrullaEnVivo.sinRutasSub",
            "Cuando un supervisor empiece una ruta desde su app aparecerá aquí con su avance.",
          )}
          icon={<Activity />}
          title={t(
            "ui.PatrullaEnVivo.sinRutas",
            "Ningún supervisor está en ruta en este momento",
          )}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((r) => {
            const pct = r.progress?.total
              ? Math.round((r.progress.completed / r.progress.total) * 100)
              : 0;
            const paused = r.status === "paused";

            return (
              /* `role="link"` + teclado: la tarjeta entera abre la ejecución,
                 y antes sólo respondía al ratón. */
              <GlassPanel
                key={r.id}
                flat
                hover
                className="cg-focus cursor-pointer p-4"
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/vehicle-patrol/runs/${r.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/vehicle-patrol/runs/${r.id}`);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {r.routeName || t("ui.PatrullaEnVivo.ruta", "Ruta")}
                      </p>
                      <StatusBadge
                        tone={RUN_STATUS_TONE[r.status] || "neutral"}
                      >
                        {runStatusLabel(r.status)}
                      </StatusBadge>
                      {!paused &&
                        r.scheduleState &&
                        r.scheduleState !== "on_time" && (
                          <StatusBadge
                            dot={false}
                            tone={SCHEDULE_TONE[r.scheduleState]}
                          >
                            {r.scheduleState === "at_risk" ? (
                              <AlertTriangle className="size-3" />
                            ) : (
                              <Clock className="size-3" />
                            )}
                            {scheduleLabel(r.scheduleState)}
                            {r.varianceMinutes
                              ? ` · +${r.varianceMinutes} min`
                              : ""}
                          </StatusBadge>
                        )}
                      {paused && (
                        <StatusBadge dot={false} tone="warn">
                          <Pause className="size-3" />
                          {t("ui.PatrullaEnVivo.pausada", "Pausada")}
                        </StatusBadge>
                      )}
                      {r.planVersion > 1 && (
                        <StatusBadge dot={false} tone="brand">
                          v{r.planVersion}
                        </StatusBadge>
                      )}
                    </div>
                    <div
                      className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {r.supervisorName && (
                        <span className="flex items-center gap-1">
                          <User className="size-3.5" />
                          {r.supervisorName}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" />
                        {t("ui.PatrullaEnVivo.desde", "Desde")}{" "}
                        {fmtHora(r.startedAt, locale)}
                      </span>
                      {r.currentStop && (
                        <span className="flex items-center gap-1">
                          <MapPin
                            className="size-3.5"
                            style={{ color: "var(--brand-text)" }}
                          />
                          {r.currentStop.name ||
                            t("ui.PatrullaEnVivo.parada", "Parada")}{" "}
                          ·{" "}
                          {visitStatusLabel(r.currentStop.status)}
                        </span>
                      )}
                    </div>
                    <div className="mt-3">
                      <Meter
                        showValue
                        label={`${r.progress?.completed ?? 0}/${r.progress?.total ?? 0} ${t("ui.PatrullaEnVivo.paradas", "paradas")}`}
                        tone={paused ? "warn" : "brand"}
                        value={pct}
                      />
                    </div>
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0"
                    style={{ color: "var(--ink-faint)" }}
                  />
                </div>
              </GlassPanel>
            );
          })}
        </div>
      )}
    </Section>
  );
}
