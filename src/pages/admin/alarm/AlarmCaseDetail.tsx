import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import AlarmActionPlan from "@/components/alarm/AlarmActionPlan";
import AlarmVideoVerification from "@/components/alarm/AlarmVideoVerification";
import AlarmECV from "@/components/alarm/AlarmECV";
import {
  Siren,
  ArrowLeft,
  RefreshCw,
  Loader2,
  Check,
  Radio,
  CheckCircle2,
  Lock,
  AlertTriangle,
  StickyNote,
  Clock,
  ShieldAlert,
  MapPin,
  Cpu,
  FileText,
  History,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  Modal,
  GlassPanel,
  IconTile,
  StatusBadge,
  SkeletonCards,
} from "@/components/kit";
import {
  alarmService,
  alarmSourceMeta,
  type AlarmCase,
  type AlarmEvent,
  type AlarmAuditLog,
  type AlarmDispatchType,
  type AlarmCaseDisposition,
} from "@/lib/api/alarmService";
import {
  Chip,
  CriticalRail,
  PriorityPill,
  STATUS_META,
  OPEN_STATUSES,
  categoryMeta,
  categoryTone,
  criticalBorder,
  formatWhenFull as formatWhen,
  sourceTone,
} from "./shared";
import { AvisoLlegoTarde, llegadaDe } from "@/components/conexion/AvisoLlegoTarde";
import {
  useHasModule,
  VIDEO_SURVEILLANCE,
} from "@/components/modulos/ModuleGate";

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

/* `label` es el texto por defecto (español) y `labelKey` la clave que se traduce
   DONDE SE PINTA. No se llama a t() aquí: el módulo se evalúa al cargar y el
   texto quedaría congelado en el idioma de arranque. */
const DISPATCH_TYPES: {
  value: AlarmDispatchType;
  labelKey: string;
  label: string;
}[] = [
  {
    value: "guard",
    labelKey: "ui.AlarmCaseDetail.dispatch.guard",
    label: "Vigilante",
  },
  {
    value: "police",
    labelKey: "ui.AlarmCaseDetail.dispatch.police",
    label: "Policía",
  },
  {
    value: "fire",
    labelKey: "ui.AlarmCaseDetail.dispatch.fire",
    label: "Bomberos",
  },
  {
    value: "medical",
    labelKey: "ui.AlarmCaseDetail.dispatch.medical",
    label: "Médico",
  },
];

/** Fields present on the case payload but not on the base AlarmCase model. */
type AlarmCaseWithEcv = AlarmCase & {
  alarmPanelId?: string | null;
  ecvSatisfied?: boolean;
  calls?: unknown[];
};

const DISPOSITIONS: {
  value: AlarmCaseDisposition;
  labelKey: string;
  label: string;
}[] = [
  { value: "real", labelKey: "ui.AlarmCaseDetail.disposition.real", label: "Real" },
  { value: "false", labelKey: "ui.AlarmCaseDetail.disposition.false", label: "Falsa" },
  { value: "test", labelKey: "ui.AlarmCaseDetail.disposition.test", label: "Prueba" },
  {
    value: "runaway",
    labelKey: "ui.AlarmCaseDetail.disposition.runaway",
    label: "Reincidente",
  },
  {
    value: "cancelled",
    labelKey: "ui.AlarmCaseDetail.disposition.cancelled",
    label: "Cancelada",
  },
];

const selectClass =
  "cg-input cg-focus h-9 w-full px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50";

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AlarmCaseDetail() {
  const { t } = useTranslation();
  // Video verification belongs to the Video Surveillance module; the case
  // itself (SOS, panic, alarm) is the Emergency Center and is for everyone.
  const hasVideo = useHasModule(VIDEO_SURVEILLANCE);
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = React.useState<AlarmCase | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  // Modal state
  const [dispatchOpen, setDispatchOpen] = React.useState(false);
  const [closeOpen, setCloseOpen] = React.useState(false);
  const [incidentOpen, setIncidentOpen] = React.useState(false);
  const [noteOpen, setNoteOpen] = React.useState(false);

  // Form state
  const [dType, setDType] = React.useState<AlarmDispatchType>("guard");
  const [dTarget, setDTarget] = React.useState("");
  const [dNote, setDNote] = React.useState("");
  const [disposition, setDisposition] =
    React.useState<AlarmCaseDisposition>("real");
  const [incTitle, setIncTitle] = React.useState("");
  const [incDescription, setIncDescription] = React.useState("");
  const [noteText, setNoteText] = React.useState("");

  const load = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const c = await alarmService.case(id);
        setData(c || null);
      } catch (e) {
        const err = e as { data?: { message?: string }; message?: string };
        toast.error(
          err?.data?.message ||
            err?.message ||
            t("ui.AlarmCaseDetail.noSePudoCargarElCaso", "No se pudo cargar el caso"),
        );
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  React.useEffect(() => {
    if (id) load();
  }, [id, load]);

  const refetch = () => load({ silent: true });

  const runAction = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      await refetch();
      return true;
    } catch (e) {
      const err = e as { data?: { message?: string }; message?: string };
      toast.error(
        err?.data?.message ||
          err?.message ||
          t("ui.AlarmCaseDetail.noSePudoCompletarLaAccion", "No se pudo completar la acción"),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onAcknowledge = () =>
    runAction(
      () => alarmService.acknowledge(id),
      t("ui.AlarmCaseDetail.casoReconocido", "Caso reconocido"),
    );

  const onResolve = () =>
    runAction(
      () => alarmService.resolve(id),
      t("ui.AlarmCaseDetail.casoResuelto", "Caso resuelto"),
    );

  const onDispatch = async () => {
    if (!dTarget.trim()) {
      toast.error(t("ui.AlarmCaseDetail.indiqueElDestinoDelDespacho"));
      return;
    }
    const ok = await runAction(
      () =>
        alarmService.dispatch(id, {
          type: dType,
          target: dTarget.trim(),
          note: dNote.trim() || undefined,
        }),
      t("ui.AlarmCaseDetail.despachoSolicitado", "Despacho solicitado"),
    );
    if (ok) {
      setDispatchOpen(false);
      setDTarget("");
      setDNote("");
    }
  };

  const onClose = async () => {
    const ok = await runAction(
      () => alarmService.close(id, { disposition }),
      t("ui.AlarmCaseDetail.casoCerrado", "Caso cerrado"),
    );
    if (ok) setCloseOpen(false);
  };

  const onIncident = async () => {
    const ok = await runAction(
      () =>
        alarmService.caseToIncident(id, {
          title: incTitle.trim() || undefined,
          description: incDescription.trim() || undefined,
        }),
      t("ui.AlarmCaseDetail.incidenteCreado", "Incidente creado"),
    );
    if (ok) {
      setIncidentOpen(false);
      setIncTitle("");
      setIncDescription("");
    }
  };

  const onNote = async () => {
    if (!noteText.trim()) {
      toast.error(t("ui.AlarmCaseDetail.escribaUnaNota"));
      return;
    }
    const ok = await runAction(
      () => alarmService.addNote(id, { detail: noteText.trim() }),
      t("ui.AlarmCaseDetail.notaAgregada", "Nota agregada"),
    );
    if (ok) {
      setNoteOpen(false);
      setNoteText("");
    }
  };

  /* ------------------------------- render ------------------------------ */

  if (loading) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <SkeletonCards count={4} />
        </PageContainer>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <PageContainer width="narrow">
          <EmptyState
            icon={<Siren />}
            title={t(
              "ui.AlarmCaseDetail.casoNoEncontrado",
              "Caso no encontrado",
            )}
            description={t("ui.AlarmCaseDetail.elCasoSolicitadoNoExiste")}
            action={
              <Button
                variant="outline"
                onClick={() => navigate("/alarm/queue")}
              >
                <ArrowLeft className="size-4" />
                {t("ui.AlarmCaseDetail.volverALaCola", "Volver a la cola")}
              </Button>
            }
          />
        </PageContainer>
      </AppLayout>
    );
  }

  const cat = categoryMeta(data.category);
  const st = STATUS_META[data.status || "queued"] || STATUS_META.queued;
  const panel = data.panel || null;
  const isOpen = OPEN_STATUSES.has(data.status || "queued");
  const isClosed = data.status === "closed";
  const acked =
    Boolean(data.ackAt) || !["queued"].includes(data.status || "queued");
  /* Crítico = P1 todavía abierta. Es lo único que se lleva el canto rojo. */
  const critico = isOpen && (data.priority ?? 3) === 1;

  const events: AlarmEvent[] = Array.isArray(data.events) ? data.events : [];
  const audit: AlarmAuditLog[] = Array.isArray(data.auditLogs)
    ? data.auditLogs
    : [];

  const sortedEvents = [...events].sort((a, b) => {
    const ta = new Date(a.at || a.createdAt || "").getTime() || 0;
    const tb = new Date(b.at || b.createdAt || "").getTime() || 0;
    return tb - ta;
  });
  const sortedAudit = [...audit].sort((a, b) => {
    const ta = new Date(a.at || a.createdAt || "").getTime() || 0;
    const tb = new Date(b.at || b.createdAt || "").getTime() || 0;
    return tb - ta;
  });

  return (
    <AppLayout>
      <PageContainer width="wide">
        {/* La cabecera del sistema, igual que en las cinco pantallas hermanas.
            Antes era un `<h1 text-xl>` propio dentro de una tarjeta a mano: un
            escalón más pequeño que cualquier otra página y sin el halo del
            acento. El canto rojo de un caso crítico se conserva encima. */}
        <div className="relative">
          {critico && <CriticalRail />}
          <PageHeader
            className={critico ? "overflow-hidden" : undefined}
            icon={<Siren />}
            title={data.title || cat.label}
            subtitle={t("ui.AlarmCaseDetail.casoNumeroCreado", {
              defaultValue: "Caso #{{id}} · creado {{when}}",
              id: String(data.id).slice(0, 8),
              when: formatWhen(data.createdAt),
            })}
            badges={
              <>
                <PriorityPill p={data.priority} />
                <StatusBadge tone={categoryTone(data.category)} dot={false}>
                  <span className="[&_svg]:size-3.5">{cat.icon}</span>
                  {cat.label}
                </StatusBadge>
                <StatusBadge tone={st.tone} dot={isOpen}>
                  {st.label}
                </StatusBadge>
                {(() => {
                  const sm = alarmSourceMeta(data.source);
                  return (
                    <StatusBadge tone={sourceTone(data.source)} dot={false}>
                      {sm.label}
                    </StatusBadge>
                  );
                })()}
                {data.disposition ? (
                  <Chip>
                    {(() => {
                      const dp = DISPOSITIONS.find(
                        (d) => d.value === data.disposition,
                      );
                      return dp ? t(dp.labelKey, dp.label) : data.disposition;
                    })()}
                  </Chip>
                ) : null}
                {data.incidentId ? (
                  /* Escalado a incidente: agravación del caso, no realce de
                     marca. Iba en el acento configurable. */
                  <StatusBadge tone="bad" dot={false}>
                    <AlertTriangle className="size-3.5" />
                    {t("ui.AlarmCaseDetail.incidente", "Incidente")}
                  </StatusBadge>
                ) : null}
              </>
            }
            actions={
              <>
                <Button
                  variant="ghost"
                  onClick={() => navigate("/alarm/queue")}
                >
                  <ArrowLeft className="size-4" />
                  {t("emergency.title", "Centro de Emergencias")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => load()}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {t("ui.AlarmCaseDetail.actualizar", "Actualizar")}
                </Button>
              </>
            }
          />
        </div>

        {/* Un SOS guardado sin señal: llegó tarde. Va antes de las acciones
            porque cambia QUÉ hacer (la emergencia empezó hace rato). */}
        <AvisoLlegoTarde
          datos={llegadaDe(
            data,
            (data as any).payload,
            (data as any).metadata,
            (data as any).incident,
            events[0] ? (events[0] as any).payload : null,
          )}
        />

        {/* Acciones del caso */}
        <GlassPanel
          className="relative overflow-hidden p-5"
          style={criticalBorder(critico)}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || acked || isClosed}
              onClick={onAcknowledge}
            >
              <Check className="size-4" />
              {t("ui.AlarmCaseDetail.reconocer", "Reconocer")}
            </Button>
            <Button
              size="sm"
              variant="brand"
              disabled={busy || !isOpen}
              onClick={() => setDispatchOpen(true)}
            >
              <Radio className="size-4" />
              {t("ui.AlarmCaseDetail.despachar", "Despachar")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !isOpen}
              onClick={onResolve}
            >
              <CheckCircle2 className="size-4" />
              {t("ui.AlarmCaseDetail.resolver", "Resolver")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || isClosed}
              onClick={() => setCloseOpen(true)}
            >
              <Lock className="size-4" />
              {t("actions.close", "Cerrar")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || Boolean(data.incidentId)}
              onClick={() => setIncidentOpen(true)}
            >
              <AlertTriangle className="size-4" />{" "}
              {t("comun.crearIncidente")}{" "}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setNoteOpen(true)}
            >
              <StickyNote className="size-4" />
              {t("ui.AlarmCaseDetail.nota", "Nota")}
            </Button>
          </div>
        </GlassPanel>

        {/* Action plan — guided operator response */}
        <div className="mb-5">
          <AlarmActionPlan caseId={id} />
        </div>

        {/* Video verification — live linked camera(s) + verification clips */}
        {hasVideo && (
          <div className="mb-5">
            <AlarmVideoVerification caseId={id} />
          </div>
        )}

        {/* ECV — enhanced call verification + police dispatch */}
        <div className="mb-5">
          <AlarmECV
            caseId={id}
            panelId={(data as AlarmCaseWithEcv).alarmPanelId}
            category={data.category || undefined}
            ecvSatisfied={(data as AlarmCaseWithEcv).ecvSatisfied}
            calls={(data as AlarmCaseWithEcv).calls || []}
            status={data.status || undefined}
            onChanged={() => load()}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Panel / site info */}
          <Section
            title={t("ui.AlarmCaseDetail.panelYSitio", "Panel y sitio")}
            icon={<Cpu />}
            className="lg:col-span-1"
          >
            {panel ? (
              <dl className="space-y-2.5 text-sm">
                <PanelField label={t("ui.AlarmCaseDetail.panel", "Panel")} value={panel.name} />
                <PanelField label={t("ui.AlarmCaseDetail.cuenta", "Cuenta")} value={panel.accountNumber} mono />
                <PanelField
                  label={t("comun.tipo")}
                  value={
                    panel.panelType
                      ? {
                          intrusion: t("ui.AlarmCaseDetail.panelType.intrusion", "Intrusión"),
                          fire: t("ui.AlarmCaseDetail.panelType.fire", "Incendio"),
                          holdup: t("ui.AlarmCaseDetail.panelType.holdup", "Atraco"),
                          access: t("ui.AlarmCaseDetail.panelType.access", "Acceso"),
                          environmental: t(
                            "ui.AlarmCaseDetail.panelType.environmental",
                            "Ambiental",
                          ),
                        }[panel.panelType] || panel.panelType
                      : null
                  }
                />
                <PanelField label={t("ui.AlarmCaseDetail.protocolo", "Protocolo")} value={panel.protocol} />
                <PanelField
                  label={t("ui.AlarmCaseDetail.equipo", "Equipo")}
                  value={
                    [panel.make, panel.model].filter(Boolean).join(" ") || null
                  }
                />
                <PanelField
                  label={t("ui.AlarmCaseDetail.comunicacion", "Comunicación")}
                  value={
                    panel.comms
                      ? {
                          ip: "IP",
                          cellular: t("ui.AlarmCaseDetail.comms.cellular", "Celular"),
                          dual: t("ui.AlarmCaseDetail.comms.dual", "Dual"),
                        }[
                          panel.comms
                        ] || panel.comms
                      : null
                  }
                />
                <PanelField
                  label={t("ui.AlarmCaseDetail.estadoDelPanel")}
                  value={panel.status}
                />
                <PanelField
                  label={t("ui.AlarmCaseDetail.ultimaSenal", "Última señal")}
                  value={formatWhen(panel.lastSignalAt)}
                />
                {panel.notes ? (
                  <div className="flex items-start gap-1.5 pt-1 text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                    <span>{panel.notes}</span>
                  </div>
                ) : null}
              </dl>
            ) : (
              <EmptyState
                className="border-0 py-6"
                icon={<Cpu />}
                title={t(
                  "ui.AlarmCaseDetail.sinInformacionDePanel",
                  "Sin información de panel",
                )}
              />
            )}
          </Section>

          {/* Events timeline */}
          <Section
            className="lg:col-span-2"
            icon={<FileText />}
            title={
              <span className="flex items-center gap-2">
                {t(
                  "ui.AlarmCaseDetail.cronologiaDeEventos",
                  "Cronología de eventos",
                )}
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                  style={{
                    background: "var(--glass-sunken)",
                    color: "var(--ink-soft)",
                  }}
                >
                  {sortedEvents.length}
                </span>
              </span>
            }
          >
            {sortedEvents.length === 0 ? (
              <EmptyState
                className="border-0 py-6"
                icon={<FileText />}
                title={t("ui.AlarmCaseDetail.sinEventosRegistrados")}
              />
            ) : (
              <ol
                className="relative space-y-4 border-l pl-5"
                style={{ borderColor: "var(--hairline)" }}
              >
                {sortedEvents.map((ev) => {
                  const ec = categoryMeta(ev.category);
                  // Grave por categoría o por prioridad: cualquiera de las dos
                  // basta para que el nudo se lea como emergencia.
                  const nodo =
                    ec.grave || ev.priority === 1
                      ? "bad"
                      : ev.priority === 2
                        ? "warn"
                        : "info";
                  return (
                    <li key={ev.id} className="relative">
                      {/* El nudo de la línea de tiempo, con el halo del lienzo
                          alrededor para que la línea parezca pasar por detrás. */}
                      {/* El nudo lleva la GRAVEDAD del evento, no el acento.
                          Iba en `var(--brand)`: un evento de pánico o incendio
                          se pintaba del color de marca mientras la píldora de
                          prioridad justo al lado decía «P1 · Crítica» en rojo. */}
                      <span
                        className="absolute -left-[27px] top-1 flex size-4 items-center justify-center rounded-full"
                        style={{
                          background: `var(--${nodo})`,
                          boxShadow: `0 0 0 4px var(--canvas), 0 0 12px 0 color-mix(in oklab, var(--${nodo}) 45%, transparent)`,
                        }}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          tone={categoryTone(ev.category)}
                          dot={false}
                        >
                          <span className="[&_svg]:size-3.5">{ec.icon}</span>
                          {ec.label}
                        </StatusBadge>
                        {ev.priority ? <PriorityPill p={ev.priority} /> : null}
                        {ev.zoneNumber ? (
                          <span
                            className="text-xs"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            {t("ui.AlarmCaseDetail.zonaN", {
                              defaultValue: "Zona {{n}}",
                              n: ev.zoneNumber,
                            })}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm">
                        {ev.description || ec.label}
                      </p>
                      <p
                        className="mt-0.5 flex items-center gap-1 text-xs"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        <Clock className="size-3" />
                        {formatWhen(ev.at || ev.createdAt)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>

          {/* Audit log */}
          <Section
            className="lg:col-span-3"
            icon={<History />}
            title={
              <span className="flex items-center gap-2">
                {t(
                  "ui.AlarmCaseDetail.registroDeAuditoria",
                  "Registro de auditoría",
                )}
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                  style={{
                    background: "var(--glass-sunken)",
                    color: "var(--ink-soft)",
                  }}
                >
                  {sortedAudit.length}
                </span>
              </span>
            }
          >
            {sortedAudit.length === 0 ? (
              <EmptyState
                className="border-0 py-6"
                icon={<History />}
                title={t(
                  "ui.AlarmCaseDetail.sinEntradasDeAuditoria",
                  "Sin entradas de auditoría",
                )}
              />
            ) : (
              <ul
                className="divide-y"
                style={{ borderColor: "var(--hairline)" }}
              >
                {sortedAudit.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">
                        {a.action || t("actions.action", "Acción")}
                      </span>
                      {a.detail ? (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {a.detail}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatWhen(a.at || a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </PageContainer>

      {/* ----------------------------- Modals ----------------------------- */}

      {/* Dispatch */}
      <Modal
        open={dispatchOpen}
        title={t("ui.AlarmCaseDetail.despachar", "Despachar")}
        icon={<Radio className="size-4" />}
        onOpenChange={(o) => {
          if (!o) setDispatchOpen(false);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setDispatchOpen(false)}
              disabled={busy}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button onClick={onDispatch} variant="brand" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Radio className="size-4" />
              )}
              {t("ui.AlarmCaseDetail.despachar", "Despachar")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="d-type">{t("comun.tipo")}</Label>
            <select
              id="d-type"
              className={selectClass}
              value={dType}
              onChange={(e) => setDType(e.target.value as AlarmDispatchType)}
            >
              {DISPATCH_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>
                  {t(dt.labelKey, dt.label)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-target">{t("ui.AlarmCaseDetail.destino", "Destino")}</Label>
            <Input
              id="d-target"
              value={dTarget}
              onChange={(e) => setDTarget(e.target.value)}
              placeholder={t(
                "ui.AlarmCaseDetail.unidadNombreONumeroDe",
                "Unidad, nombre o número de contacto",
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-note">
              {t("ui.AlarmCaseDetail.notaOpcional", "Nota (opcional)")}
            </Label>
            <Textarea
              id="d-note"
              value={dNote}
              onChange={(e) => setDNote(e.target.value)}
              placeholder={t("ui.AlarmCaseDetail.instruccionesParaElDespacho")}
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* Close */}
      <Modal
        open={closeOpen}
        title={t("ui.AlarmCaseDetail.cerrarCaso")}
        icon={<Lock className="size-4" />}
        onOpenChange={(o) => {
          if (!o) setCloseOpen(false);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setCloseOpen(false)}
              disabled={busy}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button onClick={onClose} variant="brand" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              {t("ui.AlarmCaseDetail.cerrarCaso", "Cerrar caso")}
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="disposition">
            {t("ui.AlarmCaseDetail.disposicion", "Disposición")}
          </Label>
          <select
            id="disposition"
            className={selectClass}
            value={disposition}
            onChange={(e) =>
              setDisposition(e.target.value as AlarmCaseDisposition)
            }
          >
            {DISPOSITIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {t(d.labelKey, d.label)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {t(
              "ui.AlarmCaseDetail.clasifiqueElDesenlaceDelCaso",
              "Clasifique el desenlace del caso antes de cerrarlo.",
            )}
          </p>
        </div>
      </Modal>

      {/* Incident */}
      <Modal
        open={incidentOpen}
        title={t("comun.crearIncidente")}
        icon={<AlertTriangle className="size-4" />}
        onOpenChange={(o) => {
          if (!o) setIncidentOpen(false);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setIncidentOpen(false)}
              disabled={busy}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button onClick={onIncident} variant="brand" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
              {t("comun.crearIncidente", "Crear incidente")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inc-title">
              {t("ui.AlarmCaseDetail.titulo", "Título")}
            </Label>
            <Input
              id="inc-title"
              value={incTitle}
              onChange={(e) => setIncTitle(e.target.value)}
              placeholder={data.title || cat.label}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inc-desc">
              {t("ui.AlarmCaseDetail.descripcion", "Descripción")}
            </Label>
            <Textarea
              id="inc-desc"
              value={incDescription}
              onChange={(e) => setIncDescription(e.target.value)}
              placeholder={t("ui.AlarmCaseDetail.detalleDelIncidente")}
              rows={4}
            />
          </div>
        </div>
      </Modal>

      {/* Note */}
      <Modal
        open={noteOpen}
        title={t("ui.AlarmCaseDetail.agregarNota")}
        icon={<StickyNote className="size-4" />}
        onOpenChange={(o) => {
          if (!o) setNoteOpen(false);
        }}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setNoteOpen(false)}
              disabled={busy}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button onClick={onNote} variant="brand" disabled={busy}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <StickyNote className="size-4" />
              )}
              {t("ui.AlarmCaseDetail.guardarNota", "Guardar nota")}
            </Button>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="note-text">{t("ui.AlarmCaseDetail.nota", "Nota")}</Label>
          <Textarea
            id="note-text"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={t("ui.AlarmCaseDetail.observacionesDelOperador")}
            rows={4}
          />
        </div>
      </Modal>
    </AppLayout>
  );
}

/* ------------------------------------------------------------------ */
/* Small field row                                                     */
/* ------------------------------------------------------------------ */

/**
 * Renglón de la ficha del panel. NO es el `Field` del kit —se llamaba igual y lo
 * tapaba al importarlo—: aquí el par va en `dt`/`dd` dentro de un `<dl>`, que es
 * lo que corresponde a una ficha técnica, y la etiqueta y el valor comparten
 * línea en vez de apilarse. El estilo de la etiqueta sí es el del sistema
 * (`cg-eyebrow`), que antes se reimplementaba a mano.
 */
function PanelField({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="cg-eyebrow shrink-0">{label}</dt>
      <dd
        className={[
          "min-w-0 break-words text-right",
          mono ? "font-mono text-xs" : "",
        ].join(" ")}
      >
        {value || <span style={{ color: "var(--ink-faint)" }}>—</span>}
      </dd>
    </div>
  );
}
