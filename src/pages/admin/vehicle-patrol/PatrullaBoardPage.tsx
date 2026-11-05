import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Car,
  Plus,
  MapPin,
  Route as RouteIcon,
  CheckCircle2,
  Wand2,
  Clock,
  User,
  Loader2,
  Eye,
  ListChecks,
  History as HistoryIcon,
  ClipboardList,
} from "lucide-react";

import RouteDetailModal from "../routes/RouteDetailModal";
import { InsigniaOptimizada, LineaAhorro } from "../routes/OptimizacionPanel";
import {
  leerAhorro,
  km as fmtKm,
  minutos as fmtMin,
} from "../routes/routeOptimizacion";

import PatrullaEnVivo from "./PatrullaEnVivo";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  Section,
  Segmented,
  Stagger,
  StatCard,
  StatsStrip,
  StatusBadge,
  EmptyState,
  GlassPanel,
  SkeletonCards,
  Toolbar,
  FIELD_CLS,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import { usePageTitle } from "@/hooks/usePageTitle";
import { confirmDialog } from "@/components/ui/confirmDialog";
import routeService from "@/lib/api/routeService";
import { localeActual } from "@/lib/localeActual";
import { hoyEnLaEmpresa, zonaDeLaEmpresa} from "@/lib/horaDeLaEmpresa";
const DOW_NUM: Record<string, number> = {
  sun: 0,
  sunday: 0,
  dom: 0,
  domingo: 0,
  mon: 1,
  monday: 1,
  lun: 1,
  lunes: 1,
  tue: 2,
  tuesday: 2,
  mar: 2,
  martes: 2,
  wed: 3,
  wednesday: 3,
  mie: 3,
  mié: 3,
  miercoles: 3,
  miércoles: 3,
  thu: 4,
  thursday: 4,
  jue: 4,
  jueves: 4,
  fri: 5,
  friday: 5,
  vie: 5,
  viernes: 5,
  sat: 6,
  saturday: 6,
  sab: 6,
  sáb: 6,
  sabado: 6,
  sábado: 6,
};

function scheduledOn(route: any, weekday: number): boolean {
  let days = route.days;

  if (typeof days === "string") {
    try {
      days = JSON.parse(days);
    } catch {
      days = null;
    }
  }
  if (!Array.isArray(days) || days.length === 0) return true; // no schedule = every day

  return days.some((d: any) => {
    if (typeof d === "number") return d === weekday;
    const n = DOW_NUM[String(d).toLowerCase().trim()];

    return n === weekday;
  });
}

export default function PatrullaBoardPage() {
  const { t } = useTranslation();

  usePageTitle(t("sidebar.patrulla.patrulla-board", "Ruta de Supervisión"));
  const navigate = useNavigate();
  const [date, setDate] = useState(() => hoyEnLaEmpresa());
  const [routes, setRoutes] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const weekday = useMemo(() => new Date(`${date}T12:00:00`).getDay(), [date]);

  const load = async () => {
    setLoading(true);
    try {
      const [r, runRes] = await Promise.all([
        routeService.list({ limit: 300 }),
        routeService.runs(date).catch(() => []),
      ]);

      setRoutes(r?.rows ?? []);
      setRuns(runRes || []);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("routes.live.loadError", "No se pudieron cargar las rutas"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date]);

  const isDone = (routeId: string) =>
    runs.some((x) => x.routeId === routeId && x.status === "completed");
  const todays = routes.filter((r) => scheduledOn(r, weekday));
  const shown = showAll ? routes : todays;
  const doneCount = todays.filter((r) => isDone(r.id)).length;

  const toggleDone = async (route: any) => {
    setBusyId(route.id);
    try {
      if (isDone(route.id)) {
        await routeService.unmarkRun(route.id, date);
      } else {
        await routeService.markRun(route.id, date);
      }
      const runRes = await routeService.runs(date).catch(() => []);

      setRuns(runRes || []);
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Reordenar las paradas para gastar menos.
   *
   * El cálculo lo hace el servidor y devuelve el AHORRO: es la cifra que
   * justifica el botón, así que se enseña entera («-8,4 km · -22 min») en vez de
   * un «listo» que no dice si mereció la pena. Antes esto se resolvía aquí
   * llamando a la API de rutas de Google desde el navegador —una consulta
   * facturada por pulsación, sin avisar a nadie— y encima el resultado no se
   * guardaba en ningún sitio del que se pudiera volver a leer.
   */
  const optimize = async (route: any) => {
    if (
      !(await confirmDialog({
        title: t("ui.PatrullaBoard.optimizarTitulo", {
          defaultValue: "Optimizar «{{name}}»",
          name: route.name,
        }),
        message: t(
          "ui.PatrullaBoard.optimizarMsg",
          "Se reordenarán las paradas para recortar kilómetros y minutos. El orden manual actual se reemplaza; puedes volver a cambiarlo a mano cuando quieras.",
        ),
        confirmText: t("ui.PatrullaBoard.optimizar", "Optimizar"),
      }))
    ) {
      return;
    }

    setBusyId(route.id);
    try {
      const resp: any = await routeService.optimize(route.id);
      const r = resp?.data ?? resp ?? {};
      const ahorro = leerAhorro(r.meta ?? r.optimizedMeta ?? r);

      // `changed: false` es un buen resultado, no un fallo: el orden manual ya
      // era el mejor. «Has ahorrado 0 km» ahí suena a que el botón no funcionó.
      if (r.changed === false) {
        toast.success(t("comun.laRutaYaEstabaEn"));
      } else if (ahorro?.hayAhorro) {
        const trozos: string[] = [];

        if (ahorro.km != null && ahorro.km >= 0.05)
          trozos.push(`-${fmtKm(ahorro.km)}`);
        if (ahorro.min != null && ahorro.min >= 0.5)
          trozos.push(`-${fmtMin(ahorro.min)}`);
        toast.success(
          t("ui.PatrullaBoard.rutaOptimizadaAhorro", {
            defaultValue: "Ruta optimizada: {{ahorro}} frente al orden manual.",
            ahorro: trozos.join(" · "),
          }),
        );
      } else {
        toast.success(t("ui.PatrullaBoard.rutaOptimizada", "Ruta optimizada."));
      }

      const sinCoords = ahorro?.sinCoordenadas ?? 0;

      if (sinCoords > 0) {
        toast.info(
          t("ui.PatrullaBoard.paradasSinUbicacion", {
            defaultValue:
              "{{count}} paradas no tienen ubicación: se quedaron en su sitio y las demás se repartieron alrededor.",
            count: sinCoords,
          }),
        );
      }
      await load();
    } catch (e) {
      // Los 400 del servidor (`runInProgress`, `notEnoughStops`, `noCoordinates`)
      // llegan YA TRADUCIDOS y el interceptor de `api` los enseña tal cual.
      // Escribir aquí otro texto sólo taparía el que explica el motivo.
      console.error("Error optimizando ruta", e);
    } finally {
      setBusyId(null);
    }
  };

  const goCreate = () => {
    const tid = localStorage.getItem("tenantId");

    navigate(
      tid
        ? `/tenant/${tid}/vehicle-patrol/routes/add-new`
        : "/vehicle-patrol/routes",
    );
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<Car />}
          title={t("sidebar.patrulla.patrulla-board", "Ruta de Supervisión")}
          subtitle={t('ui.PatrullaBoardPage.rutasQueElSupervisorDebe')}
          /* UNA acción primaria en la cabecera. Las demás (historial, plantillas,
             gestionar rutas) van en la barra de abajo: cinco botones aquí
             aplastaban el título a una letra por línea en un portátil. */
          actions={(
            <Button variant="brand" onClick={goCreate}>
              <Plus className="size-4" />{" "}
              {t("ui.PatrullaBoard.crearPatrullaVehicular", "Crear patrulla vehicular")}
            </Button>
          )}
        />
        {/* Sin `mb-4`: `PageContainer` ya separa a sus hijos con `space-y-6`.
            Sin `cg-focus` en el campo: `.cg-input` ya pinta su aro y con los
            dos quedaban dos anillos de radios distintos. */}
        <Toolbar>
          <label
            className="flex items-center gap-2 text-sm"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("comun.fecha")}
            <input
              aria-label={t("comun.fecha")}
              className={cn(FIELD_CLS, "w-44")}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/vehicle-patrol/history")}
          >
            <HistoryIcon className="size-4" />{" "}
            {t("ui.PatrullaBoard.historial", "Historial")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/vehicle-patrol/templates")}
          >
            <ClipboardList className="size-4" />{" "}
            {t("ui.PatrullaBoard.plantillas", "Plantillas")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate("/vehicle-patrol/routes")}
          >
            <RouteIcon className="size-4" />{" "}
            {t("ui.PatrullaBoard.gestionarRutas", "Gestionar rutas")}
          </Button>
        </Toolbar>

        <StatsStrip className="grid gap-4 sm:grid-cols-2">
          <StatCard
            accent="brand"
            icon={<ListChecks />}
            label={t("ui.PatrullaBoard.programadasHoy", "Programadas hoy")}
            value={todays.length}
          />
          <StatCard
            accent="ok"
            icon={<CheckCircle2 />}
            label={t("ui.PatrullaBoard.completadas", "Completadas")}
            value={doneCount}
          />
        </StatsStrip>

        {/* Lo que está pasando AHORA: las ejecuciones abiertas, con su avance.
            Se alimenta del socket `route:progress` — el mismo canal por el que
            el servidor anuncia cada llegada y cada cierre de parada. */}
        <PatrullaEnVivo />

        <Section
          action={
            <Segmented
              options={[
                {
                  value: "dia",
                  label: t("ui.PatrullaBoard.filtroDelDia", "Del día"),
                },
                {
                  value: "todas",
                  label: t("ui.PatrullaBoard.filtroTodas", "Todas"),
                },
              ]}
              value={showAll ? "todas" : "dia"}
              onChange={(v) => setShowAll(v === "todas")}
            />
          }
          icon={<RouteIcon />}
          title={t("ui.PatrullaBoard.rutasDelDia", "Rutas del día")}
        >
          {loading ? (
            <SkeletonCards className="lg:grid-cols-2" count={4} />
          ) : shown.length === 0 ? (
            <EmptyState
              description={t(
                "ui.PatrullaBoardPage.creaUnaPatrullaVehicularCon",
              )}
              icon={<RouteIcon />}
              title={
                showAll
                  ? t(
                      "ui.PatrullaBoard.sinRutasCreadas",
                      "No hay rutas creadas",
                    )
                  : t(
                      "ui.PatrullaBoard.sinRutasEsteDia",
                      "No hay rutas programadas para este día",
                    )
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {shown.map((route) => {
                const done = isDone(route.id);
                const stops = (route.points || []).length;
                const ahorro = leerAhorro(route.optimizedMeta);

                return (
                  /* `flat` obligatorio: son tarjetas que se repiten en una rejilla,
                   y el desenfoque de `.glass` por fila hunde el desplazamiento
                   (ver la nota de coste en glass.css). */
                  <GlassPanel
                    key={route.id}
                    flat
                    hover
                    className={`p-4 ${done ? "opacity-80" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {route.name}
                          </p>
                          {done ? (
                            <StatusBadge tone="ok">
                              {t("ui.LiveTracking.completada", "Completada")}
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="warn">
                              {t("comun.pendiente")}
                            </StatusBadge>
                          )}
                          {/* Compacta: en una tarjeta de rejilla no cabe la fecha,
                            y en la ficha de la ruta sí se enseña entera. */}
                          <InsigniaOptimizada
                            compacta
                            optimizada={route.optimized}
                          />
                        </div>
                        <div
                          className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          <span className="flex items-center gap-1">
                            <MapPin
                              className="size-3.5"
                              style={{ color: "var(--brand-text)" }}
                            />
                            {t("ui.LiveTracking.nParadas", {
                              defaultValue: "{{count}} paradas",
                              count: stops,
                            })}
                          </span>
                          {route.vehicleName || route.vehicle?.name ? (
                            <span className="flex items-center gap-1">
                              <Car className="size-3.5" />
                              {route.vehicleName || route.vehicle?.name}
                            </span>
                          ) : null}
                          {route.assignedGuardName || route.guardName ? (
                            <span className="flex items-center gap-1">
                              <User className="size-3.5" />
                              {route.assignedGuardName || route.guardName}
                            </span>
                          ) : null}
                          {route.windowStart && (
                            <span className="flex items-center gap-1">
                              <Clock className="size-3.5" />
                              {new Date(route.windowStart).toLocaleTimeString(
                                localeActual(),
                                { timeZone: zonaDeLaEmpresa(), hour: "2-digit", minute: "2-digit" },
                              )}
                            </span>
                          )}
                        </div>
                        {/* El ahorro no se esconde: es lo que convierte «optimizar»
                          en una decisión y no en un botón de adorno. */}
                        {route.optimized && ahorro ? (
                          <LineaAhorro ahorro={ahorro} className="mt-2" />
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {/* La tinta del botón lleno la pone `cg-btn-brand`
                        (`--brand-ink`), calculada para contrastar con cualquier
                        acento. Antes era `text-foreground` sobre el relleno de
                        marca: ilegible en cuanto el acento se aclaraba. */}
                      <Button
                        disabled={busyId === route.id}
                        size="sm"
                        variant={done ? "outline" : "brand"}
                        onClick={() => toggleDone(route)}
                      >
                        {busyId === route.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        {done
                          ? t("revision.deshacer", "Deshacer")
                          : t("ui.PatrullaBoard.marcarCompletada", "Marcar completada")}
                      </Button>
                      {/* Reordering needs two stops at least: with one the
                          server could only answer 400. */}
                      <Button
                        disabled={busyId === route.id || stops < 2}
                        size="sm"
                        variant="outline"
                        onClick={() => optimize(route)}
                      >
                        <Wand2 className="size-3.5" />{" "}
                        {t("ui.PatrullaBoard.optimizar", "Optimizar")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailId(route.id)}
                      >
                        <Eye className="size-3.5" />{" "}
                        {t("ui.PatrullaBoard.verRuta", "Ver ruta")}
                      </Button>
                    </div>
                  </GlassPanel>
                );
              })}
            </div>
          )}
        </Section>

        <RouteDetailModal
          open={!!detailId}
          routeId={detailId}
          onOpenChange={(v) => {
            if (!v) setDetailId(null);
          }}
        />
      </PageContainer>
    </AppLayout>
  );
}
