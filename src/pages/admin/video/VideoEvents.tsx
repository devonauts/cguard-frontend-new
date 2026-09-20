import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Check,
  Radio,
  RefreshCw,
  Loader2,
  Video,
  Bell,
  ShieldAlert,
  WifiOff,
  Hand,
  Filter,
} from "lucide-react";

import { FaultRail } from "./deviceStatus";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  EmptyState,
  SkeletonCards,
  FadeIn,
  Stagger,
  GlassPanel,
  StatusBadge,
  Segmented,
  Toolbar,
} from "@/components/kit";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import {
  CreateIncidentModal,
  DispatchModal,
} from "@/components/video/VideoActionModals";
import {
  videoService,
  type VideoEvent,
  type Camera,
} from "@/lib/api/videoService";

/* ------------------------------------------------------------------ */
/* Status / type / severity metadata (Spanish labels)                  */
/* ------------------------------------------------------------------ */

type StatusFilter = "all" | "new" | "ack" | "resolved";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "new", label: "Nuevos" },
  { value: "ack", label: "Reconocidos" },
  { value: "resolved", label: "Resueltos" },
];

/** Tonos SEMÁNTICOS fijos: el estado y la gravedad de un evento no cambian de
 *  color porque la empresa cambie su color de marca. */
const STATUS_META: Record<string, { label: string; tone: string }> = {
  new: { label: "Nuevo", tone: "warn" }, // sin atender: pide acción, no informa
  ack: { label: "Reconocido", tone: "warn" },
  resolved: { label: "Resuelto", tone: "ok" },
};

/**
 * El tipo de evento. `grave` marca los que SON una emergencia por sí mismos:
 * una alarma o un sabotaje se pintan en rojo aunque el equipo no les haya
 * puesto severidad, que por defecto cae en «media».
 */
const TYPE_META: Record<
  string,
  { label: string; icon: React.ReactNode; grave: boolean }
> = {
  motion: {
    label: "Movimiento",
    icon: <Activity className="size-3.5" />,
    grave: false,
  },
  alarm: { label: "Alarma", icon: <Bell className="size-3.5" />, grave: true },
  manual: {
    label: "Manual",
    icon: <Hand className="size-3.5" />,
    grave: false,
  },
  offline: {
    label: "Sin conexión",
    icon: <WifiOff className="size-3.5" />,
    grave: true,
  },
  tamper: {
    label: "Sabotaje",
    icon: <ShieldAlert className="size-3.5" />,
    grave: true,
  },
};

// `labelKey` viaja en la constante y se traduce al pintar: llamar a t() aquí lo
// congelaría en el idioma de arranque.
const SEVERITY_META: Record<
  string,
  { label: string; labelKey: string; tone: string }
> = {
  low: { label: "Baja", labelKey: "nomina.severidad.low", tone: "neutral" },
  medium: { label: "Media", labelKey: "nomina.severidad.medium", tone: "info" },
  high: { label: "Alta", labelKey: "nomina.severidad.high", tone: "warn" },
  critical: {
    label: "Crítica",
    labelKey: "nomina.severidad.critical",
    tone: "bad",
  },
};

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return "—";

  return d.toLocaleString(localeActual(), {
    timeZone: zonaDeLaEmpresa(),
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function VideoEvents() {
  const { t } = useTranslation();
  const [events, setEvents] = React.useState<VideoEvent[]>([]);
  const [cameras, setCameras] = React.useState<Record<string, Camera>>({});
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  // Modal state
  const [incidentEvent, setIncidentEvent] = React.useState<VideoEvent | null>(
    null,
  );
  const [dispatchEvent, setDispatchEvent] = React.useState<VideoEvent | null>(
    null,
  );

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const [evs, cams] = await Promise.all([
          videoService.events(status === "all" ? undefined : { status }),
          videoService.cameras(),
        ]);

        setEvents(Array.isArray(evs) ? evs : []);
        const map: Record<string, Camera> = {};

        for (const c of Array.isArray(cams) ? cams : []) {
          if (c?.id) map[c.id] = c;
        }
        setCameras(map);
      } catch (e) {
        const err = e as { data?: { message?: string }; message?: string };

        toast.error(
          err?.data?.message ||
            err?.message ||
            "No se pudieron cargar los eventos",
        );
      } finally {
        setLoading(false);
      }
    },
    [status],
  );

  React.useEffect(() => {
    load();
  }, [load]);

  const cameraName = (ev: VideoEvent): string => {
    const cam = ev.videoCameraId ? cameras[ev.videoCameraId] : undefined;

    return cam?.name || t("video.events.unknownCamera", "Cámara desconocida");
  };

  const cameraFor = (ev: VideoEvent): Camera | null =>
    (ev.videoCameraId ? cameras[ev.videoCameraId] : undefined) || null;

  const setEventStatus = async (ev: VideoEvent, next: "ack" | "resolved") => {
    setBusyId(ev.id);
    try {
      const updated = await videoService.updateEvent(ev.id, { status: next });

      setEvents((prev) =>
        prev.map((e) =>
          e.id === ev.id
            ? { ...e, ...updated, status: updated?.status ?? next }
            : e,
        ),
      );
      toast.success(next === "ack" ? "Evento reconocido" : "Evento resuelto");
    } catch (e) {
      const err = e as { data?: { message?: string }; message?: string };

      toast.error(
        err?.data?.message || err?.message || "No se pudo actualizar el evento",
      );
    } finally {
      setBusyId(null);
    }
  };

  const counts = React.useMemo(() => {
    const c = { new: 0, ack: 0, resolved: 0 };

    for (const e of events) {
      const s = (e.status || "new") as keyof typeof c;

      if (s in c) c[s] += 1;
    }

    return c;
  }, [events]);

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          actions={
            <Button disabled={loading} variant="outline" onClick={() => load()}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Actualizar
            </Button>
          }
          icon={<Activity />}
          subtitle="Alertas de movimiento, alarmas y sabotaje de sus cámaras"
          title={t("ui.VideoEvents.eventosDeVideo", "Eventos de video")}
        />

        {/* Filtros */}
        <FadeIn>
          <Toolbar>
            <span
              className="ml-1 mr-1 flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: "var(--ink-soft)" }}
            >
              <Filter className="size-3.5" />
              Estado
            </span>
            <Segmented
              options={STATUS_FILTERS.map((f) => ({
                value: f.value,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {f.label}
                    <span className="tabular-nums opacity-70">
                      {f.value === "all"
                        ? events.length
                        : counts[f.value as keyof typeof counts]}
                    </span>
                  </span>
                ),
              }))}
              value={status}
              onChange={setStatus}
            />
          </Toolbar>
        </FadeIn>

        {/* List */}
        {loading ? (
          <SkeletonCards className="sm:grid-cols-1" count={4} />
        ) : events.length === 0 ? (
          <EmptyState
            description={
              status === "all"
                ? t(
                    "video.events.empty.allDescription",
                    "Aún no se han registrado eventos de video.",
                  )
                : t(
                    "video.events.empty.filteredDescription",
                    "No hay eventos con este estado.",
                  )
            }
            icon={<Video />}
            title={t("ui.VideoEvents.noHayEventos", "No hay eventos")}
          />
        ) : (
          <Stagger className="space-y-3">
            {events.map((ev) => {
              const type = TYPE_META[ev.type || "manual"] || TYPE_META.manual;
              const sev =
                SEVERITY_META[ev.severity || "medium"] || SEVERITY_META.medium;
              const st = STATUS_META[ev.status || "new"] || STATUS_META.new;
              const rowBusy = busyId === ev.id;
              const isResolved = ev.status === "resolved";
              const isAck = ev.status === "ack" || isResolved;

              /* Una crítica sin resolver lleva el canto de peligro. NO es el
                 acento: la severidad no se configura. */
              const urgente = ev.severity === "critical" && !isResolved;

              return (
                <GlassPanel
                  key={ev.id}
                  flat
                  hover
                  className="relative overflow-hidden p-4"
                >
                  {urgente && <FaultRail />}
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    {/* Left: info */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        {/* La píldora de tipo era siempre neutra: una «Alarma»
                            y un «Movimiento» salían idénticos. Los tipos que
                            SON la emergencia van en `--bad`. */}
                        <StatusBadge
                          dot={false}
                          tone={type.grave ? "bad" : "neutral"}
                        >
                          {type.icon}
                          {type.label}
                        </StatusBadge>
                        <StatusBadge tone={sev.tone}>
                          {t(sev.labelKey, sev.label)}
                        </StatusBadge>
                        <StatusBadge
                          dot={ev.status !== "resolved"}
                          tone={st.tone}
                        >
                          {st.label}
                        </StatusBadge>
                        {ev.incidentId ? (
                          /* Escalado a incidente: agravación, no realce de marca. */
                          <StatusBadge dot={false} tone="bad">
                            <AlertTriangle className="size-3.5" />
                            Incidente
                          </StatusBadge>
                        ) : null}
                      </div>

                      <p className="truncate font-medium">
                        {ev.title || type.label}
                      </p>
                      {ev.description ? (
                        <p
                          className="mt-0.5 line-clamp-2 text-sm"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {ev.description}
                        </p>
                      ) : null}

                      <div
                        className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Video className="size-3.5" />
                          {cameraName(ev)}
                        </span>
                        <span>{formatWhen(ev.at)}</span>
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                      <Button
                        disabled={rowBusy || isAck}
                        size="sm"
                        variant="outline"
                        onClick={() => setEventStatus(ev, "ack")}
                      >
                        {rowBusy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                        Reconocer
                      </Button>
                      <Button
                        disabled={rowBusy || isResolved}
                        size="sm"
                        variant="outline"
                        onClick={() => setEventStatus(ev, "resolved")}
                      >
                        <CheckCircle2 className="size-4" />
                        Resolver
                      </Button>
                      <Button
                        disabled={rowBusy || Boolean(ev.incidentId)}
                        size="sm"
                        variant="outline"
                        onClick={() => setIncidentEvent(ev)}
                      >
                        <AlertTriangle className="size-4" />
                        Crear incidente
                      </Button>
                      <Button
                        disabled={rowBusy}
                        size="sm"
                        variant="brand"
                        onClick={() => setDispatchEvent(ev)}
                      >
                        <Radio className="size-4" />
                        Despachar
                      </Button>
                    </div>
                  </div>
                </GlassPanel>
              );
            })}
          </Stagger>
        )}
      </PageContainer>

      {/* Modals */}
      <CreateIncidentModal
        camera={incidentEvent ? cameraFor(incidentEvent) : null}
        eventId={incidentEvent?.id}
        open={Boolean(incidentEvent)}
        onClose={() => setIncidentEvent(null)}
        onCreated={() => {
          load({ silent: true });
        }}
      />

      <DispatchModal
        camera={dispatchEvent ? cameraFor(dispatchEvent) : null}
        eventId={dispatchEvent?.id}
        open={Boolean(dispatchEvent)}
        onClose={() => setDispatchEvent(null)}
        onDispatched={() => {
          load({ silent: true });
        }}
      />
    </AppLayout>
  );
}
