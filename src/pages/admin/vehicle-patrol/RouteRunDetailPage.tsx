import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Route as RouteIcon,
  Clock,
  MapPin,
  Camera,
  MessageSquareText,
  Siren,
  AlertTriangle,
  CheckCircle2,
  SkipForward,
  Ban,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  ListChecks,
  Users2,
  History as HistoryIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

import RouteMap from "../routes/RouteMap";

import {
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  VISIT_STATUS_LABEL,
  VISIT_STATUS_TONE,
  SCHEDULE_LABEL,
  SCHEDULE_TONE,
  EVENT_LABEL,
  SKIP_REASON_LABEL,
  SEVERITY_LABEL,
  SEVERITY_TONE,
  fmtHora,
  fmtDur,
  fmtFecha,
} from "./runLabels";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  StatCard,
  StatsStrip,
  StatusBadge,
  StatusDot,
  EmptyState,
  GlassPanel,
  SkeletonCards,
  Stagger,
  Modal,
  FormField,
  Field,
  IconTile,
  TabNav,
} from "@/components/kit";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { promptDialog } from "@/components/ui/promptDialog";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getAuthToken } from "@/lib/api";
import { crearSocket, cerrarSocket } from "@/lib/socket";
import routeService from "@/lib/api/routeService";
import { localeActual } from "@/lib/localeActual";
import { useSondeoVisible } from "@/hooks/useSondeoVisible";

/**
 * UNA EJECUCIÓN DE RUTA, ENTERA. Si está abierta, es el puesto de mando de la
 * central: se ve dónde va el supervisor, qué parada toca, y se puede cambiar
 * el PLAN (añadir, quitar, reordenar, omitir, abortar) — nunca las visitas,
 * que las registra quien está en el sitio. Si está cerrada, es la
 * reconstrucción de sólo lectura: llegadas, inspección con las preguntas de
 * entonces, fotos, novedades y la línea de tiempo completa.
 */
const OPEN = new Set(["in_progress", "paused"]);
const TERMINAL = new Set(["completed", "skipped", "missed"]);

const PRIORIDAD_LABEL: Record<string, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  critical: "Crítica",
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LO QUE SE GUARDA NO ES LO QUE SE LEE
 *
 * La app del supervisor GUARDA el valor crudo de cada respuesta —`yes`, `no`,
 * `na`— y lo enseña traducido en su propia pantalla. Aquí se estaba pintando
 * tal cual salía de la base, así que la ficha de una inspección le decía «yes»
 * y «no» a un administrador que tiene todo el CRM en español. Lo mismo con el
 * estado de la verificación del personal (`late`, `not_present`…).
 *
 * Se traduce al pintar, NO al guardar: el valor almacenado es el contrato con
 * la app y con el cálculo de la nota (`scoreItem` compara contra `yes`/`no`),
 * y tocarlo dejaría las inspecciones viejas fuera de ese cálculo.
 * ════════════════════════════════════════════════════════════════════════════
 */
const RESPUESTA_SI = new Set(["yes", "si", "sí", "true", "pass", "ok", "present", "1"]);
const RESPUESTA_NO = new Set(["no", "false", "fail", "absent", "0"]);
const RESPUESTA_MEDIA: Record<string, string> = {
  na: "N/A",
  "n/a": "N/A",
  warning: "Con reparos",
  partial: "Parcial",
};

function etiquetaRespuesta(valor: unknown): string {
  if (Array.isArray(valor)) return valor.map(etiquetaRespuesta).join(", ");
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  const s = String(valor).trim().toLowerCase();

  if (RESPUESTA_SI.has(s)) return "Sí";
  if (RESPUESTA_NO.has(s)) return "No";

  return RESPUESTA_MEDIA[s] || String(valor);
}

/** Estados de `guardVerifications` — valores de columna del servidor. */
const VERIFICACION: Record<string, string> = {
  present: "Presente",
  not_present: "Ausente",
  replacement: "Relevo",
  late: "Llegó tarde",
  left_early: "Salió antes",
  other: "Otro",
};

export default function RouteRunDetailPage() {
  const { t } = useTranslation();
  const { runId = "" } = useParams<{ runId: string }>();

  usePageTitle("Ejecución de ruta");
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [tab, setTab] = useState<"visitas" | "eventos">("visitas");
  const locale = localeActual();

  const load = useCallback(async () => {
    try {
      setData(await routeService.runDetail(runId));
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("ui.RouteRunDetail.errorCarga", "No se pudo cargar la ejecución"),
      );
    } finally {
      setLoading(false);
    }
  }, [runId, t]);

  /**
   * RECUPERACIÓN DE ESTADO DE UNA RUTA EN CURSO.
   *
   * Un websocket entrega lo que pasa MIENTRAS escuchas. Si el socket se cae
   * treinta segundos y en ese hueco el supervisor llega a dos puntos, contesta
   * una inspección y sube una foto, socket.io NO guarda ni reenvía nada: esos
   * avisos se pierden para siempre. Esta pantalla no tenía manejador de
   * `connect`, así que se quedaba congelada en el estado de antes de la caída
   * —sin marcar nada raro— hasta que por casualidad llegara el siguiente aviso.
   * En una ruta que estaba acabando, eso es «para siempre».
   *
   * Lo que arregla el hueco es volver a pedir el detalle UNA vez al reconectar.
   * `runDetail` es una lectura completa (visitas, llegadas, inspecciones,
   * fotos, observaciones y el histórico de eventos), así que reconstruye todo
   * lo que se perdiera. Esa petición NO es un duplicado: es la recuperación.
   */
  const [enVivo, setEnVivo] = useState(true);

  useEffect(() => {
    load();
    const tid = localStorage.getItem("tenantId");
    const socket = tid ? crearSocket(getAuthToken() || "", tid) : null;
    /* Agrupado: un solo punto de control dispara llegada + inspección +
       cierre, y cada uno emite su propio `route:progress`. Sin agrupar son
       tres lecturas completas seguidas para pintar un cambio. */
    let agrup: ReturnType<typeof setTimeout> | null = null;
    const recargarAgrupado = () => {
      if (agrup) clearTimeout(agrup);
      agrup = setTimeout(() => void load(), 700);
    };
    const onProgress = (e: any) => {
      // Se filtra por ruta: en un piso de supervisión hay varias a la vez y
      // esta pantalla sólo mira una.
      if (!e?.runId || String(e.runId) === runId) recargarAgrupado();
    };
    const alConectar = () => {
      setEnVivo(true);
      recargarAgrupado();
    };
    const alCaerse = () => setEnVivo(false);

    if (socket) {
      socket.on("route:progress", onProgress);
      socket.on("connect", alConectar);
      socket.on("disconnect", alCaerse);
    }

    return () => {
      if (agrup) clearTimeout(agrup);
      if (socket) {
        socket.off("route:progress", onProgress);
        socket.off("connect", alConectar);
        socket.off("disconnect", alCaerse);
        cerrarSocket(socket);
      }
    };
  }, [load, runId]);

  const ex = data?.execution;
  const stops: any[] = ex?.stops || [];
  const abierta = ex ? OPEN.has(ex.status) : false;

  /* RED DE SEGURIDAD, y sólo cuando hace falta de verdad: la ruta sigue
     ABIERTA, el socket está CAÍDO y la pestaña está A LA VISTA. Con el socket
     sano no corre nada — un websocket sano más un reloj permanente es
     justamente lo que no queremos. En cuanto `connect` vuelve, `enVivo` pasa a
     true, `activo` a false y el hook desarma el temporizador. 20 s y no 45
     porque aquí se mira UNA ruta en marcha, no una lista de flota. */
  useSondeoVisible(load, 20_000, abierta && !enVivo);
  const sum = ex?.summary;
  const mapStops = useMemo(
    () =>
      stops
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({
          id: String(s.routePointId),
          nombre: s.name || "",
          direccion: s.address || "",
          lat: Number(s.lat),
          lng: Number(s.lng),
          duracion: s.duration ?? null,
        })),
    [stops],
  );

  const accion = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };
  const omitir = async (s: any) => {
    const notes = await promptDialog({
      title: t("ui.RouteRunDetail.omitirTitulo", "Omitir «{{name}}»", {
        name: s.name,
      }),
      message: t(
        "ui.RouteRunDetail.omitirMsg",
        "El supervisor verá la parada como omitida por instrucción de operaciones. Indica el motivo.",
      ),
      placeholder: "Motivo",
      confirmText: "Omitir",
    });

    if (notes === null) return;
    await accion(
      () =>
        routeService.dispatchSkipStop(runId, s.routePointId, {
          reason: "operations_instruction",
          notes,
        }),
      t("ui.RouteRunDetail.omitida", "Parada omitida"),
    );
  };
  const quitar = async (s: any) => {
    const reason = await promptDialog({
      title: t("ui.RouteRunDetail.quitarTitulo", "Quitar «{{name}}» del plan", {
        name: s.name,
      }),
      message: t(
        "ui.RouteRunDetail.quitarMsg",
        "Sale del recorrido de hoy (queda registrada como omitida por operaciones). La ruta base no cambia.",
      ),
      placeholder: "Motivo",
      confirmText: "Quitar",
    });

    if (reason === null) return;
    await accion(
      () => routeService.dispatchRemoveStop(runId, s.routePointId, reason),
      t("ui.RouteRunDetail.quitada", "Parada quitada del plan"),
    );
  };
  const mover = async (idx: number, dir: -1 | 1) => {
    const pendientes = stops.filter(
      (s) => !TERMINAL.has(s.visit?.status || "pending"),
    );
    const i = pendientes.findIndex(
      (s) => s.routePointId === stops[idx].routePointId,
    );
    const j = i + dir;

    if (i < 0 || j < 0 || j >= pendientes.length) return;
    const ids = pendientes.map((s) => String(s.routePointId));

    [ids[i], ids[j]] = [ids[j], ids[i]];
    await accion(
      () =>
        routeService.dispatchReorder(runId, ids, "Reordenado por operaciones"),
      t("ui.RouteRunDetail.reordenada", "Plan reordenado"),
    );
  };
  const abortar = async () => {
    const reason = await promptDialog({
      title: t("ui.RouteRunDetail.abortarTitulo", "Abortar la ruta"),
      message: t(
        "ui.RouteRunDetail.abortarMsg",
        "Las paradas sin visitar quedan como no visitadas y el supervisor recibe el aviso. Esto no se deshace.",
      ),
      placeholder: "Motivo (obligatorio)",
      confirmText: "Abortar",
    });

    if (!reason) return;
    if (
      !(await confirmDialog({
        title: t(
          "ui.RouteRunDetail.abortarConfirm",
          "¿Abortar definitivamente?",
        ),
        message: reason,
        confirmText: "Sí, abortar",
      }))
    )
      return;
    await accion(
      () => routeService.dispatchAbort(runId, reason),
      t("ui.RouteRunDetail.abortada", "Ruta abortada"),
    );
  };

  const titulo =
    data?.routeName ||
    data?.route?.name ||
    t("ui.RouteRunDetail.titulo", "Ejecución de ruta");
  const eventos: any[] = data?.events || [];

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          actions={abierta ? (
            <>
              <Button variant="danger-ghost" onClick={abortar} disabled={busy}><Ban className="size-4" />{t('ui.RouteRunDetail.abortar', 'Abortar ruta')}</Button>
              <Button variant="brand" onClick={() => setAddOpen(true)} disabled={busy}><Plus className="size-4" />{t('ui.RouteRunDetail.agregarParada', 'Añadir parada')}</Button>
            </>
          ) : undefined}
          icon={<RouteIcon />}
          subtitle={data ? [fmtFecha(data.date, locale), data.supervisorName].filter(Boolean).join(' · ') : undefined}
          badges={ex ? (
            <>
              <StatusBadge tone={RUN_STATUS_TONE[ex.status] || 'neutral'}>{RUN_STATUS_LABEL[ex.status] || ex.status}</StatusBadge>
              {abierta && ex.scheduleState && ex.scheduleState !== 'on_time' && <StatusBadge tone={SCHEDULE_TONE[ex.scheduleState]}>{SCHEDULE_LABEL[ex.scheduleState]} · +{ex.varianceMinutes} min</StatusBadge>}
              {ex.planVersion > 1 && <StatusBadge tone="brand" dot={false}>{t('ui.RouteRunDetail.planV', 'Plan v{{v}}', { v: ex.planVersion })}</StatusBadge>}
            </>
          ) : undefined}
          /* UNA acción primaria: añadir una parada es lo que la central hace a
             diario. Abortar es la excepción y va en tinta de peligro sin
             relleno — dos botones llenos en la cabecera se pelean. Tiene
             doble confirmación, así que no necesita gritar. */
          title={titulo}
        />

        {loading ? (
          <SkeletonCards count={4} />
        ) : !ex ? (
          <EmptyState
            icon={<AlertTriangle />}
            title={t(
              "ui.RouteRunDetail.noExiste",
              "La ejecución no existe o no está disponible.",
            )}
          />
        ) : (
          <>
            {/* Cuatro en fila sólo con sitio de sobra (xl); en un portátil, 2×2 —
                si no, las etiquetas se cortan («INSPECCIÓN M…»). */}
            <StatsStrip className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                accent="brand"
                icon={<ListChecks />}
                label={t("ui.RouteRunDetail.paradas", "Paradas")}
                value={`${ex.progress?.completed ?? 0}/${ex.progress?.total ?? stops.length}`}
              />
              <StatCard
                accent="neutral"
                hint={
                  ex.completedAt
                    ? `${t("ui.RouteRunDetail.fin", "Fin")} ${fmtHora(ex.completedAt, locale)}`
                    : ex.pausedAt
                      ? t(
                          "ui.RouteRunDetail.enPausaDesde",
                          "En pausa desde {{h}}",
                          { h: fmtHora(ex.pausedAt, locale) },
                        )
                      : undefined
                }
                icon={<Clock />}
                label={t("ui.RouteRunDetail.inicio", "Inicio")}
                value={fmtHora(ex.startedAt, locale)}
              />
              <StatCard
                accent="ok"
                icon={<CheckCircle2 />}
                label={t("ui.RouteRunDetail.inspeccion", "Inspección")}
                value={
                  sum?.averageInspection != null
                    ? `${Math.round(sum.averageInspection)} %`
                    : "—"
                }
              />
              <StatCard
                accent="bad"
                icon={<AlertTriangle />}
                label={t("ui.RouteRunDetail.hallazgos", "Críticos")}
                value={
                  sum?.criticalFindings ??
                  stops.reduce(
                    (n, s) =>
                      n +
                      (s.observations || []).filter(
                        (o: any) => o.severity === "critical",
                      ).length,
                    0,
                  )
                }
              />
            </StatsStrip>

            {/* El resumen de tiempos y evidencia: pares etiqueta/dato de sólo
                lectura (`Field`), como en cualquier ficha del CRM. */}
            {sum && (
              <GlassPanel
                flat
                className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 lg:grid-cols-4"
              >
                <Field
                  numeric
                  label={t("ui.RouteRunDetail.duracion", "Duración")}
                  value={fmtDur(sum.totalSeconds)}
                />
                <Field
                  numeric
                  label={t("ui.RouteRunDetail.enVisitas", "En visitas")}
                  value={fmtDur(sum.visitSeconds)}
                />
                <Field
                  numeric
                  label={t("ui.RouteRunDetail.enTransito", "En tránsito")}
                  value={fmtDur(sum.travelSeconds)}
                />
                <Field
                  numeric
                  label={t("ui.RouteRunDetail.enPausa", "En pausa")}
                  value={fmtDur(sum.pausedSeconds)}
                />
                <Field
                  numeric
                  label={t("ui.RouteRunDetail.fotos", "Fotos")}
                  value={String(sum.photos ?? 0)}
                />
                <Field
                  numeric
                  label={t("ui.RouteRunDetail.novedades", "Novedades")}
                  value={String(sum.observations ?? 0)}
                />
                <Field
                  numeric
                  label={t("ui.RouteRunDetail.incidentes", "Incidentes")}
                  value={String(sum.incidents ?? 0)}
                />
                <Field
                  numeric
                  label={t("ui.RouteRunDetail.fueraDeZona", "Fuera de zona")}
                  value={String(sum.geofenceFlags ?? 0)}
                />
              </GlassPanel>
            )}

            {mapStops.length > 0 && (
              <div className="overflow-hidden rounded-2xl">
                <RouteMap height={300} hud={false} stops={mapStops} />
              </div>
            )}

            {/* Secciones de UN registro → `TabNav`, el mismo carril de pestañas
                que la ficha de un vigilante o de un puesto. Dos botones de
                relleno alternando era un tercer idioma de pestañas. El carril
                ES la cabecera de la tarjeta: un título encima repetía el
                nombre de la pestaña activa. */}
            <Section>
              <TabNav
                className="mb-4"
                items={[
                  {
                    value: "visitas",
                    label: t("ui.RouteRunDetail.visitas", "Visitas"),
                    icon: <MapPin />,
                    badge: stops.length,
                  },
                  {
                    value: "eventos",
                    label: t(
                      "ui.RouteRunDetail.lineaDeTiempo",
                      "Línea de tiempo",
                    ),
                    icon: <HistoryIcon />,
                    badge: eventos.length,
                  },
                ]}
                value={tab}
                onChange={setTab}
              />
              {tab === "visitas" ? (
                <div className="space-y-3">
                  {stops.map((s, idx) => (
                    <VisitaCard
                      key={s.routePointId}
                      abierta={abierta}
                      busy={busy}
                      idx={idx}
                      locale={locale}
                      s={s}
                      onMove={(d) => mover(idx, d)}
                      onRemove={() => quitar(s)}
                      onSkip={() => omitir(s)}
                    />
                  ))}
                </div>
              ) : (
                <Eventos events={eventos} locale={locale} stops={stops} />
              )}
            </Section>
          </>
        )}
      </PageContainer>

      <AgregarParadaModal
        busy={busy}
        open={addOpen}
        stops={stops}
        onAdd={async (body) => {
          await accion(
            () => routeService.dispatchAddStop(runId, body),
            t("ui.RouteRunDetail.paradaAgregada", "Parada añadida al plan"),
          );
          setAddOpen(false);
        }}
        onOpenChange={setAddOpen}
      />
    </AppLayout>
  );
}

function VisitaCard({
  s,
  idx,
  abierta,
  busy,
  locale,
  onSkip,
  onRemove,
  onMove,
}: {
  s: any;
  idx: number;
  abierta: boolean;
  busy: boolean;
  locale: string;
  onSkip: () => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const v = s.visit || {};
  const st = v.status || "pending";
  const terminal = TERMINAL.has(st);
  const enSitio = st === "arrived" || st === "inspection_in_progress";
  const insp = s.inspection;
  const fotos: any[] = s.photos || [];
  const obs: any[] = s.observations || [];
  const hayDetalle = Boolean(
    insp?.responses ||
      fotos.length ||
      obs.length ||
      v.notes ||
      (v.guardVerifications || []).length,
  );

  return (
    <GlassPanel flat className="p-4">
      <div className="flex items-start gap-3">
        {/* El número de orden va en una ficha del kit, la misma que lleva un
            icono en cualquier lista: en curso se tiñe de marca, cerrada queda
            neutra, y así el ojo encuentra «por dónde va» sin leer. */}
        <IconTile size="sm" tone={enSitio ? "brand" : "neutral"}>
          <span className="text-sm font-bold tabular-nums">
            {s.order ?? idx + 1}
          </span>
        </IconTile>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{s.name}</p>
            <StatusBadge tone={VISIT_STATUS_TONE[st] || "neutral"}>
              {VISIT_STATUS_LABEL[st] || st}
            </StatusBadge>
            {s.priority &&
              (s.priority === "high" || s.priority === "critical") && (
                <StatusBadge dot={false} tone="bad">
                  {t("ui.RouteRunDetail.prioritaria", "Prioritaria")}
                </StatusBadge>
              )}
            {s.required === false && (
              <StatusBadge dot={false} tone="neutral">
                {t("ui.RouteRunDetail.opcional", "Opcional")}
              </StatusBadge>
            )}
            {s.arrival?.flagged && (
              <StatusBadge dot={false} tone="warn">
                {t("ui.RouteRunDetail.fueraDeZonaBadge", "Fuera de zona")}
                {s.arrival.distanceMeters != null
                  ? ` · ${Math.round(s.arrival.distanceMeters)} m`
                  : ""}
              </StatusBadge>
            )}
            {v.inspectionScore != null && (
              <StatusBadge
                dot={false}
                tone={
                  v.inspectionScore >= 80
                    ? "ok"
                    : v.inspectionScore >= 60
                      ? "warn"
                      : "bad"
                }
              >
                {Math.round(v.inspectionScore)} %
              </StatusBadge>
            )}
          </div>
          <div
            className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs"
            style={{ color: "var(--ink-soft)" }}
          >
            {s.address && <span>{s.address}</span>}
            {v.expectedArrivalAt && (
              <span>
                <Clock className="mr-1 inline size-3" />
                {t("ui.RouteRunDetail.previsto", "Previsto")}{" "}
                {fmtHora(v.expectedArrivalAt, locale)}
              </span>
            )}
            {v.arrivedAt && (
              <span>
                {t("ui.RouteRunDetail.llegada", "Llegada")}{" "}
                {fmtHora(v.arrivedAt, locale)}
              </span>
            )}
            {v.completedAt && (
              <span>
                {t("ui.RouteRunDetail.cierre", "Cierre")}{" "}
                {fmtHora(v.completedAt, locale)}
              </span>
            )}
            {v.timeSpentSeconds != null && (
              <span>
                {fmtDur(v.timeSpentSeconds)}{" "}
                {t("ui.RouteRunDetail.enSitio", "en el sitio")}
              </span>
            )}
            {fotos.length > 0 && (
              <span>
                <Camera className="mr-1 inline size-3" />
                {fotos.length}
              </span>
            )}
            {obs.length > 0 && (
              <span>
                <MessageSquareText className="mr-1 inline size-3" />
                {obs.length}
              </span>
            )}
          </div>
          {s.skip && (
            <p className="mt-1 text-xs" style={{ color: "var(--warn-text)" }}>
              <SkipForward className="mr-1 inline size-3" />
              {SKIP_REASON_LABEL[s.skip.reason] ||
                s.skip.label ||
                s.skip.reason}
              {s.skip.notes ? ` — ${s.skip.notes}` : ""}
            </p>
          )}
          {s.arrival?.overrideReason && (
            <p className="mt-1 text-xs" style={{ color: "var(--warn-text)" }}>
              {t(
                "ui.RouteRunDetail.motivoOverride",
                "Motivo del registro fuera de zona",
              )}
              : {s.arrival.overrideReason}
            </p>
          )}

          {hayDetalle && (
            <Button
              aria-expanded={open}
              className="-ml-3 mt-1"
              size="sm"
              variant="ghost"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? (
                <ChevronUp className="size-3.5" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
              {open
                ? t("ui.RouteRunDetail.ocultarDetalle", "Ocultar detalle")
                : t("ui.RouteRunDetail.verDetalle", "Ver detalle de la visita")}
            </Button>
          )}

          {open && (
            <div
              className="mt-3 space-y-4 border-t pt-3"
              style={{ borderColor: "var(--hairline)" }}
            >
              {insp?.snapshot?.sections && (
                <div>
                  <p className="cg-eyebrow mb-1">
                    {t(
                      "ui.RouteRunDetail.inspeccionV",
                      "Inspección (plantilla v{{v}})",
                      { v: insp.templateVersion || 1 },
                    )}
                  </p>
                  {insp.snapshot.sections.map((sec: any) => (
                    <div key={sec.id} className="mb-2">
                      <p
                        className="text-xs font-semibold"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {sec.title}
                      </p>
                      {(sec.items || []).map((it: any) => {
                        const val = insp.responses?.[it.id];

                        if (val === undefined || val === null || val === "")
                          return null;

                        return (
                          <p
                            key={it.id}
                            className="flex justify-between gap-4 border-b py-1 text-sm"
                            style={{ borderColor: "var(--hairline)" }}
                          >
                            <span>{it.label}</span>
                            <strong className="tabular-nums">
                              {etiquetaRespuesta(val)}
                            </strong>
                          </p>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
              {(v.guardVerifications || []).length > 0 && (
                <div>
                  <p className="cg-eyebrow mb-1">
                    <Users2 className="mr-1 inline size-3" />
                    {t("ui.RouteRunDetail.personal", "Personal del puesto")}
                  </p>
                  {v.guardVerifications.map((g: any, i: number) => (
                    <p key={i} className="flex justify-between gap-4 text-sm">
                      <span>{g.name}</span>
                      <strong>
                        {VERIFICACION[String(g.status)] || g.status}
                        {g.note ? ` — ${g.note}` : ""}
                      </strong>
                    </p>
                  ))}
                </div>
              )}
              {fotos.length > 0 && (
                <div>
                  <p className="cg-eyebrow mb-1">
                    <Camera className="mr-1 inline size-3" />
                    {t("ui.RouteRunDetail.fotos", "Fotos")}
                  </p>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {fotos.map((f: any) => {
                      const u = f.downloadUrl || f.url || f.publicUrl;

                      return u ? (
                        <a
                          key={f.id}
                          className="cg-focus rounded-lg"
                          href={u}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <img
                            alt=""
                            className="aspect-square w-full rounded-lg object-cover"
                            loading="lazy"
                            src={u}
                          />
                        </a>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
              {obs.length > 0 && (
                <div>
                  <p className="cg-eyebrow mb-1">
                    <MessageSquareText className="mr-1 inline size-3" />
                    {t("ui.RouteRunDetail.novedades", "Novedades")}
                  </p>
                  {obs.map((o: any) => (
                    <div
                      key={o.id}
                      className="flex flex-wrap items-start gap-2 py-1 text-sm"
                    >
                      <StatusBadge
                        dot={false}
                        tone={SEVERITY_TONE[o.severity] || "neutral"}
                      >
                        {SEVERITY_LABEL[o.severity] || o.severity}
                      </StatusBadge>
                      <span className="min-w-0 flex-1">{o.text}</span>
                      {o.visibility === "client_visible" && (
                        <StatusBadge dot={false} tone="brand">
                          {t("ui.RouteRunDetail.visibleCliente", "Cliente")}
                        </StatusBadge>
                      )}
                      {o.incidentId && (
                        <a
                          className="cg-focus inline-flex items-center gap-1 rounded-md text-xs font-semibold"
                          href={`/reports/incident/${o.incidentId}`}
                          style={{ color: "var(--bad-text)" }}
                        >
                          <Siren className="size-3" />
                          {t("ui.RouteRunDetail.incidente", "Incidente")}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {v.notes && (
                <div>
                  <p className="cg-eyebrow mb-1">
                    {t("ui.RouteRunDetail.notas", "Notas")}
                  </p>
                  <p className="whitespace-pre-wrap text-sm">{v.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
        {abierta && !terminal && (
          <div className="flex shrink-0 flex-col gap-1">
            <Button
              aria-label={t("ui.RouteRunDetail.subir", "Subir")}
              disabled={busy || enSitio}
              size="icon-sm"
              variant="ghost"
              onClick={() => onMove(-1)}
            >
              <ArrowUp className="size-4" />
            </Button>
            <Button
              aria-label={t("ui.RouteRunDetail.bajar", "Bajar")}
              disabled={busy || enSitio}
              size="icon-sm"
              variant="ghost"
              onClick={() => onMove(1)}
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button
              aria-label={t("ui.RouteRunDetail.omitir", "Omitir")}
              disabled={busy || enSitio}
              size="icon-sm"
              variant="ghost"
              onClick={onSkip}
            >
              <SkipForward className="size-4" />
            </Button>
            <Button
              aria-label={t("ui.RouteRunDetail.quitar", "Quitar del plan")}
              disabled={busy || enSitio}
              size="icon-sm"
              variant="danger-ghost"
              onClick={onRemove}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}

/**
 * La línea de tiempo. Cada evento lleva un punto del kit con su tono — el
 * texto va siempre en tinta normal. Pintar títulos enteros de rojo o verde
 * convertía la lista en un semáforo que competía con las insignias.
 */
function Eventos({
  events,
  stops,
  locale,
}: {
  events: any[];
  stops: any[];
  locale: string;
}) {
  const { t } = useTranslation();
  const nombre = useMemo(
    () => new Map(stops.map((s) => [String(s.routePointId), s.name || ""])),
    [stops],
  );

  if (!events.length)
    return (
      <EmptyState
        icon={<HistoryIcon />}
        title={t("ui.RouteRunDetail.sinEventos", "Todavía no hay eventos")}
        variant="inline"
      />
    );

  return (
    <div className="divide-y" style={{ borderColor: "var(--hairline)" }}>
      {events.map((e) => {
        const p = e.payload || {};
        const detalle =
          e.type === "stop.arrived" && p.distanceM != null
            ? `${p.distanceM} m${p.outside ? ` · ${t("ui.RouteRunDetail.fueraDeZonaBadge", "Fuera de zona").toLowerCase()}` : ""}`
            : e.type === "stop.completed" && p.score != null
              ? `${Math.round(p.score)} %`
              : e.type === "stop.skipped"
                ? p.notes || SKIP_REASON_LABEL[p.reason] || p.reason || ""
                : e.type === "route.plan_updated"
                  ? p.change || p.reason || ""
                  : e.type === "route.paused"
                    ? p.reason || ""
                    : e.type === "route.aborted"
                      ? p.reason || ""
                      : e.type === "route.delayed" || e.type === "route.at_risk"
                        ? `+${p.varianceMinutes ?? 0} min`
                        : e.type === "observation.created" ||
                            e.type === "incident.created"
                          ? p.text || ""
                          : e.type === "stop.geofence_override"
                            ? p.reason || ""
                            : "";
        const tone: "bad" | "warn" | "ok" | "brand" | "neutral" =
          e.type.includes("aborted") ||
          e.type === "route.at_risk" ||
          e.type === "stop.missed" ||
          e.type === "incident.created"
            ? "bad"
            : e.type === "route.delayed" ||
                e.type === "stop.skipped" ||
                e.type === "stop.geofence_override" ||
                e.type === "route.paused"
              ? "warn"
              : e.type === "stop.completed" || e.type === "route.completed"
                ? "ok"
                : e.type === "route.started" || e.type === "stop.arrived"
                  ? "brand"
                  : "neutral";
        const parada = e.routePointId ? nombre.get(String(e.routePointId)) : "";

        return (
          <div
            key={e.id}
            className="grid grid-cols-[5.5rem_auto_1fr] items-start gap-x-3 py-2.5 text-sm"
          >
            <span
              className="whitespace-nowrap tabular-nums"
              style={{ color: "var(--ink-soft)" }}
            >
              {fmtHora(e.at, locale)}
            </span>
            <StatusDot className="mt-[7px]" tone={tone} />
            <div className="min-w-0">
              <p className="font-medium">
                {EVENT_LABEL[e.type] || e.type}
                {parada ? (
                  <span
                    className="font-normal"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {" "}
                    · {parada}
                  </span>
                ) : null}
              </p>
              {detalle && (
                <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                  {detalle}
                </p>
              )}
              {e.actorChannel === "crm" && (
                <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t("ui.RouteRunDetail.porCentral", "Por la central")}
                  {e.actorName ? ` · ${e.actorName}` : ""}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* El `Select` de Radix no admite un elemento con valor vacío: «al final del
   recorrido» lleva un centinela que se convierte en `null` para la API. */
const AL_FINAL = "__final__";

function AgregarParadaModal({
  open,
  onOpenChange,
  stops,
  onAdd,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  stops: any[];
  onAdd: (b: any) => Promise<void>;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [siteId, setSiteId] = useState("");
  const [siteType, setSiteType] = useState("station");
  const [afterOrder, setAfterOrder] = useState<string>("");
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState("normal");
  const [estaciones, setEstaciones] = useState<
    Array<{ id: string; name: string }>
  >([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const tid = localStorage.getItem("tenantId");
        const { default: api } = await import("@/lib/api");
        const { data } = await api.get<any>(`/tenant/${tid}/station?limit=500`);
        const rows = Array.isArray(data?.rows)
          ? data.rows
          : Array.isArray(data)
            ? data
            : [];

        setEstaciones(
          rows.map((r: any) => ({
            id: String(r.id),
            name: r.name || r.stationName || r.id,
          })),
        );
      } catch {
        setEstaciones([]);
      }
    })();
  }, [open]);
  const pendientes = stops.filter(
    (s) => !TERMINAL.has(s.visit?.status || "pending"),
  );

  return (
    <Modal
      description={t(
        "ui.RouteRunDetail.agregarParadaSub",
        "Entra en el plan de hoy; la ruta base no cambia.",
      )}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("comun.cancelar", "Cancelar")}
          </Button>
          <Button
            disabled={!siteId || busy}
            variant="brand"
            onClick={() =>
              onAdd({
                siteType,
                siteId,
                afterOrder: afterOrder ? Number(afterOrder) : null,
                reason: reason || undefined,
                instructions: instructions || undefined,
                priority,
              })
            }
          >
            {t("ui.RouteRunDetail.agregar", "Añadir al plan")}
          </Button>
        </>
      }
      icon={<Plus />}
      open={open}
      size="md"
      title={t("ui.RouteRunDetail.agregarParada", "Añadir parada")}
      onOpenChange={onOpenChange}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          full
          required
          htmlFor="ap-puesto"
          label={t("ui.RouteRunDetail.puesto", "Puesto")}
        >
          <Select
            value={siteId || undefined}
            onValueChange={(v) => {
              setSiteId(v);
              setSiteType("station");
            }}
          >
            <SelectTrigger id="ap-puesto">
              <SelectValue
                placeholder={t(
                  "ui.RouteRunDetail.elegirPuesto",
                  "Elegir un puesto…",
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {estaciones.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          htmlFor="ap-despues"
          label={t("ui.RouteRunDetail.despuesDe", "Después de")}
        >
          <Select
            value={afterOrder || AL_FINAL}
            onValueChange={(v) => setAfterOrder(v === AL_FINAL ? "" : v)}
          >
            <SelectTrigger id="ap-despues">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AL_FINAL}>
                {t("ui.RouteRunDetail.alFinal", "Al final del recorrido")}
              </SelectItem>
              {pendientes.map((s) => (
                <SelectItem key={s.routePointId} value={String(s.order)}>
                  {s.order}. {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          htmlFor="ap-prioridad"
          label={t("ui.RouteRunDetail.prioridad", "Prioridad")}
        >
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="ap-prioridad">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORIDAD_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          full
          htmlFor="ap-instrucciones"
          label={t(
            "ui.RouteRunDetail.instrucciones",
            "Instrucciones para el supervisor",
          )}
        >
          <Textarea
            id="ap-instrucciones"
            maxLength={2000}
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </FormField>
        <FormField
          full
          hint={t(
            "ui.RouteRunDetail.motivoHint",
            "Queda en la línea de tiempo de la ruta.",
          )}
          htmlFor="ap-motivo"
          label={t("ui.RouteRunDetail.motivo", "Motivo del cambio")}
        >
          <Input
            id="ap-motivo"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
