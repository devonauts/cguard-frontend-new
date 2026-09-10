import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
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
  MapPin,
  Cpu,
  FileText,
  History,
} from "lucide-react";

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

import AlarmActionPlan from "@/components/alarm/AlarmActionPlan";
import AlarmVideoVerification from "@/components/alarm/AlarmVideoVerification";
import AlarmECV from "@/components/alarm/AlarmECV";
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

const DISPOSITIONS: { value: AlarmCaseDisposition; label: string }[] = [
  { value: "real", label: "Real" },
  { value: "false", label: "Falsa" },
  { value: "test", label: "Prueba" },
  { value: "runaway", label: "Reincidente" },
  { value: "cancelled", label: "Cancelada" },
];

const selectClass =
  "cg-input cg-focus h-9 w-full px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50";

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AlarmCaseDetail() {
  const { t } = useTranslation();
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
          err?.data?.message || err?.message || "No se pudo cargar el caso",
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
        err?.data?.message || err?.message || "No se pudo completar la acción",
      );

      return false;
    } finally {
      setBusy(false);
    }
  };

  const onAcknowledge = () =>
    runAction(() => alarmService.acknowledge(id), "Caso reconocido");

  const onResolve = () =>
    runAction(() => alarmService.resolve(id), "Caso resuelto");

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
      "Despacho solicitado",
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
      "Caso cerrado",
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
      "Incidente creado",
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
      "Nota agregada",
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
            action={
              <Button
                variant="outline"
                onClick={() => navigate("/alarm/queue")}
              >
                <ArrowLeft className="size-4" />
                {t("ui.AlarmCaseDetail.volverALaCola", "Volver a la cola")}
              </Button>
            }
            description={t("ui.AlarmCaseDetail.elCasoSolicitadoNoExiste")}
            icon={<Siren />}
            title={t(
              "ui.AlarmCaseDetail.casoNoEncontrado",
              "Caso no encontrado",
            )}
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
                  disabled={busy}
                  variant="outline"
                  onClick={() => load()}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  Actualizar
                </Button>
              </>
            }
            badges={
              <>
                <PriorityPill p={data.priority} />
                <StatusBadge dot={false} tone={categoryTone(data.category)}>
                  <span className="[&_svg]:size-3.5">{cat.icon}</span>
                  {cat.label}
                </StatusBadge>
                <StatusBadge dot={isOpen} tone={st.tone}>
                  {st.label}
                </StatusBadge>
                {(() => {
                  const sm = alarmSourceMeta(data.source);

                  return (
                    <StatusBadge dot={false} tone={sourceTone(data.source)}>
                      {sm.label}
                    </StatusBadge>
                  );
                })()}
                {data.disposition ? (
                  <Chip>
                    {DISPOSITIONS.find((d) => d.value === data.disposition)
                      ?.label || data.disposition}
                  </Chip>
                ) : null}
                {data.incidentId ? (
                  /* Escalado a incidente: agravación del caso, no realce de
                     marca. Iba en el acento configurable. */
                  <StatusBadge dot={false} tone="bad">
                    <AlertTriangle className="size-3.5" />
                    Incidente
                  </StatusBadge>
                ) : null}
              </>
            }
            className={critico ? "overflow-hidden" : undefined}
            icon={<Siren />}
            subtitle={`Caso #${String(data.id).slice(0, 8)} · creado ${formatWhen(data.createdAt)}`}
            title={data.title || cat.label}
          />
        </div>

        {/* Acciones del caso */}
        <GlassPanel
          className="relative overflow-hidden p-5"
          style={criticalBorder(critico)}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || acked || isClosed}
              size="sm"
              variant="outline"
              onClick={onAcknowledge}
            >
              <Check className="size-4" />
              Reconocer
            </Button>
            <Button
              disabled={busy || !isOpen}
              size="sm"
              variant="brand"
              onClick={() => setDispatchOpen(true)}
            >
              <Radio className="size-4" />
              Despachar
            </Button>
            <Button
              disabled={busy || !isOpen}
              size="sm"
              variant="outline"
              onClick={onResolve}
            >
              <CheckCircle2 className="size-4" />
              Resolver
            </Button>
            <Button
              disabled={busy || isClosed}
              size="sm"
              variant="outline"
              onClick={() => setCloseOpen(true)}
            >
              <Lock className="size-4" />
              Cerrar
            </Button>
            <Button
              disabled={busy || Boolean(data.incidentId)}
              size="sm"
              variant="outline"
              onClick={() => setIncidentOpen(true)}
            >
              <AlertTriangle className="size-4" />{" "}
              {t("comun.crearIncidente")}{" "}
            </Button>
            <Button
              disabled={busy}
              size="sm"
              variant="outline"
              onClick={() => setNoteOpen(true)}
            >
              <StickyNote className="size-4" />
              Nota
            </Button>
          </div>
        </GlassPanel>

        {/* Action plan — guided operator response */}
        <div className="mb-5">
          <AlarmActionPlan caseId={id} />
        </div>

        {/* Video verification — live linked camera(s) + verification clips */}
        <div className="mb-5">
          <AlarmVideoVerification caseId={id} />
        </div>

        {/* ECV — enhanced call verification + police dispatch */}
        <div className="mb-5">
          <AlarmECV
            calls={(data as AlarmCaseWithEcv).calls || []}
            caseId={id}
            category={data.category || undefined}
            ecvSatisfied={(data as AlarmCaseWithEcv).ecvSatisfied}
            panelId={(data as AlarmCaseWithEcv).alarmPanelId}
            status={data.status || undefined}
            onChanged={() => load()}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Panel / site info */}
          <Section
            className="lg:col-span-1"
            icon={<Cpu />}
            title="Panel y sitio"
          >
            {panel ? (
              <dl className="space-y-2.5 text-sm">
                <PanelField label="Panel" value={panel.name} />
                <PanelField mono label="Cuenta" value={panel.accountNumber} />
                <PanelField
                  label={t("comun.tipo")}
                  value={
                    panel.panelType
                      ? {
                          intrusion: "Intrusión",
                          fire: "Incendio",
                          holdup: "Atraco",
                          access: "Acceso",
                          environmental: "Ambiental",
                        }[panel.panelType] || panel.panelType
                      : null
                  }
                />
                <PanelField label="Protocolo" value={panel.protocol} />
                <PanelField
                  label="Equipo"
                  value={
                    [panel.make, panel.model].filter(Boolean).join(" ") || null
                  }
                />
                <PanelField
                  label={t("ui.AlarmCaseDetail.comunicacion", "Comunicación")}
                  value={
                    panel.comms
                      ? { ip: "IP", cellular: "Celular", dual: "Dual" }[
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
                          dot={false}
                          tone={categoryTone(ev.category)}
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
                            Zona {ev.zoneNumber}
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
                        {a.action || "Acción"}
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
        footer={
          <>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setDispatchOpen(false)}
            >
              Cancelar
            </Button>
            <Button disabled={busy} variant="brand" onClick={onDispatch}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Radio className="size-4" />
              )}
              Despachar
            </Button>
          </>
        }
        icon={<Radio className="size-4" />}
        open={dispatchOpen}
        title="Despachar"
        onOpenChange={(o) => {
          if (!o) setDispatchOpen(false);
        }}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="d-type">{t("comun.tipo")}</Label>
            <select
              className={selectClass}
              id="d-type"
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
            <Label htmlFor="d-target">Destino</Label>
            <Input
              id="d-target"
              placeholder={t(
                "ui.AlarmCaseDetail.unidadNombreONumeroDe",
                "Unidad, nombre o número de contacto",
              )}
              value={dTarget}
              onChange={(e) => setDTarget(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-note">Nota (opcional)</Label>
            <Textarea
              id="d-note"
              placeholder={t("ui.AlarmCaseDetail.instruccionesParaElDespacho")}
              rows={3}
              value={dNote}
              onChange={(e) => setDNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Close */}
      <Modal
        footer={
          <>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setCloseOpen(false)}
            >
              Cancelar
            </Button>
            <Button disabled={busy} variant="brand" onClick={onClose}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Lock className="size-4" />
              )}
              Cerrar caso
            </Button>
          </>
        }
        icon={<Lock className="size-4" />}
        open={closeOpen}
        title={t("ui.AlarmCaseDetail.cerrarCaso")}
        onOpenChange={(o) => {
          if (!o) setCloseOpen(false);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="disposition">
            {t("ui.AlarmCaseDetail.disposicion", "Disposición")}
          </Label>
          <select
            className={selectClass}
            id="disposition"
            value={disposition}
            onChange={(e) =>
              setDisposition(e.target.value as AlarmCaseDisposition)
            }
          >
            {DISPOSITIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
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
        footer={
          <>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setIncidentOpen(false)}
            >
              Cancelar
            </Button>
            <Button disabled={busy} variant="brand" onClick={onIncident}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <AlertTriangle className="size-4" />
              )}
              Crear incidente
            </Button>
          </>
        }
        icon={<AlertTriangle className="size-4" />}
        open={incidentOpen}
        title={t("comun.crearIncidente")}
        onOpenChange={(o) => {
          if (!o) setIncidentOpen(false);
        }}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="inc-title">
              {t("ui.AlarmCaseDetail.titulo", "Título")}
            </Label>
            <Input
              id="inc-title"
              placeholder={data.title || cat.label}
              value={incTitle}
              onChange={(e) => setIncTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inc-desc">
              {t("ui.AlarmCaseDetail.descripcion", "Descripción")}
            </Label>
            <Textarea
              id="inc-desc"
              placeholder={t("ui.AlarmCaseDetail.detalleDelIncidente")}
              rows={4}
              value={incDescription}
              onChange={(e) => setIncDescription(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Note */}
      <Modal
        footer={
          <>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => setNoteOpen(false)}
            >
              Cancelar
            </Button>
            <Button disabled={busy} variant="brand" onClick={onNote}>
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <StickyNote className="size-4" />
              )}
              Guardar nota
            </Button>
          </>
        }
        icon={<StickyNote className="size-4" />}
        open={noteOpen}
        title={t("ui.AlarmCaseDetail.agregarNota")}
        onOpenChange={(o) => {
          if (!o) setNoteOpen(false);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="note-text">Nota</Label>
          <Textarea
            id="note-text"
            placeholder={t("ui.AlarmCaseDetail.observacionesDelOperador")}
            rows={4}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
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
