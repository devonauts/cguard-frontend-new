import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RadioTower,
  ShieldAlert,
  Trash2,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PageContainer,
  PageHeader,
  StatCard,
  StatsStrip,
  Stagger,
  EmptyState,
  Modal,
  GlassPanel,
  IconTile,
  Segmented,
  SkeletonBlock,
  SkeletonCards,
  StatusBadge as KitStatusBadge,
} from "@/components/kit";
import {
  alarmService,
  type AlarmComms,
  type AlarmContact,
  type AlarmContactAuthority,
  type AlarmPanel,
  type AlarmPanelStatus,
  type AlarmPanelType,
  type AlarmProtocol,
  type AlarmZone,
  type AlarmZoneType,
} from "@/lib/api/alarmService";
import { videoService, type Camera } from "@/lib/api/videoService";
import {
  useHasModule,
  VIDEO_SURVEILLANCE,
} from "@/components/modulos/ModuleGate";

// ============================================================
// Option labels (Spanish UI)
// ============================================================

const PROTOCOL_OPTS: AlarmProtocol[] = [
  "sia-dc09",
  "contactid",
  "surgard",
  "webhook",
  "manual",
];
const PROTOCOL_LABELS: Record<AlarmProtocol, string> = {
  "sia-dc09": "SIA DC-09",
  contactid: "Contact ID",
  surgard: "Sur-Gard",
  webhook: "Webhook",
  manual: "Manual",
};

const PANEL_TYPE_OPTS: AlarmPanelType[] = [
  "intrusion",
  "fire",
  "holdup",
  "access",
  "environmental",
];
const PANEL_TYPE_LABELS: Record<AlarmPanelType, string> = {
  intrusion: "Intrusión",
  fire: "Incendio",
  holdup: "Atraco",
  access: "Acceso",
  environmental: "Ambiental",
};
// Constantes de módulo: guardan la CLAVE. Se traducen donde se pintan.
const PANEL_TYPE_LABEL_KEYS: Record<AlarmPanelType, string> = {
  intrusion: "alarm.category.burglary",
  fire: "alarm.category.fire",
  holdup: "alarm.category.holdup",
  access: "alarm.panelType.access",
  environmental: "alarm.panelType.environmental",
};

const COMMS_OPTS: AlarmComms[] = ["ip", "cellular", "dual"];
const COMMS_LABELS: Record<AlarmComms, string> = {
  ip: "IP",
  cellular: "Celular",
  dual: "Dual",
};

const STATUS_LABELS: Record<AlarmPanelStatus, string> = {
  online: "En línea",
  offline: "Sin conexión",
  armed: "Armado",
  disarmed: "Desarmado",
  unknown: "Desconocido",
};
// Constantes de módulo: guardan la CLAVE. Se traducen donde se pintan.
const STATUS_LABEL_KEYS: Record<AlarmPanelStatus, string> = {
  online: "ui.AlarmPanels.enLinea",
  offline: "ui.AlarmPanels.sinConexion",
  armed: "alarm.panelStatus.armed",
  disarmed: "alarm.panelStatus.disarmed",
  unknown: "alarm.panelStatus.unknown",
};

const ZONE_TYPE_OPTS: AlarmZoneType[] = [
  "entry",
  "perimeter",
  "motion",
  "glassbreak",
  "smoke",
  "panic",
  "tamper",
  "supervisory",
];
const ZONE_TYPE_LABELS: Record<AlarmZoneType, string> = {
  entry: "Entrada/Salida",
  perimeter: "Perímetro",
  motion: "Movimiento",
  glassbreak: "Rotura de cristal",
  smoke: "Humo",
  panic: "Pánico",
  tamper: "Sabotaje",
  supervisory: "Supervisión",
};
// Constantes de módulo: guardan la CLAVE. Se traducen donde se pintan.
const ZONE_TYPE_LABEL_KEYS: Record<AlarmZoneType, string> = {
  entry: "alarm.zoneType.entry",
  perimeter: "alarm.zoneType.perimeter",
  motion: "alarm.zoneType.motion",
  glassbreak: "alarm.zoneType.glassbreak",
  smoke: "alarm.zoneType.smoke",
  panic: "alarm.category.panic",
  tamper: "alarm.category.tamper",
  supervisory: "alarm.category.supervisory",
};

const AUTHORITY_OPTS: AlarmContactAuthority[] = [
  "owner",
  "manager",
  "keyholder",
  "emergency",
];
const AUTHORITY_LABELS: Record<AlarmContactAuthority, string> = {
  owner: "Propietario",
  manager: "Gerente",
  keyholder: "Responsable de llaves",
  emergency: "Emergencia",
};
// Constantes de módulo: guardan la CLAVE. Se traducen donde se pintan.
const AUTHORITY_LABEL_KEYS: Record<AlarmContactAuthority, string> = {
  owner: "alarm.authority.owner",
  manager: "alarm.authority.manager",
  keyholder: "alarm.authority.keyholder",
  emergency: "alarm.authority.emergency",
};

// ============================================================
// Status badge
// ============================================================

/**
 * Estado del panel. Tonos SEMÁNTICOS fijos: «sin conexión» es rojo pase lo que
 * pase con el color de marca — un panel caído es un panel caído. «En línea»
 * además LATE, porque es el único estado que significa «ahora mismo».
 */
function PanelStatusBadge({ status }: { status?: AlarmPanelStatus }) {
  const { t } = useTranslation();
  const s = status ?? "unknown";

  if (s === "online") {
    return (
      <KitStatusBadge dot={false} tone="ok">
        <span className="cc-dot" style={{ background: "var(--ok)" }} />{" "}
        {t(STATUS_LABEL_KEYS.online, STATUS_LABELS.online)}
      </KitStatusBadge>
    );
  }
  if (s === "armed") {
    return (
      <KitStatusBadge dot={false} tone="warn">
        <ShieldAlert className="h-3 w-3" />{" "}
        {t(STATUS_LABEL_KEYS.armed, STATUS_LABELS.armed)}
      </KitStatusBadge>
    );
  }
  if (s === "disarmed") {
    return (
      <KitStatusBadge dot={false} tone="info">
        <Wifi className="h-3 w-3" />{" "}
        {t(STATUS_LABEL_KEYS.disarmed, STATUS_LABELS.disarmed)}
      </KitStatusBadge>
    );
  }
  if (s === "offline") {
    return (
      <KitStatusBadge dot={false} tone="bad">
        <WifiOff className="h-3 w-3" />{" "}
        {t(STATUS_LABEL_KEYS.offline, STATUS_LABELS.offline)}
      </KitStatusBadge>
    );
  }

  return (
    <KitStatusBadge dot={false} tone="neutral">
      <WifiOff className="h-3 w-3" />{" "}
      {t(STATUS_LABEL_KEYS.unknown, STATUS_LABELS.unknown)}
    </KitStatusBadge>
  );
}

// ============================================================
// Panel form
// ============================================================

interface PanelForm {
  name: string;
  protocol: AlarmProtocol;
  accountNumber: string;
  panelType: AlarmPanelType;
  comms: AlarmComms;
  receiverLine: string;
  dc09Key: string;
  supervisionMins: string;
  testIntervalHrs: string;
  make: string;
  model: string;
  psapAgency: string;
  psapPhone: string;
  asapOri: string;
  postSiteId: string;
  stationId: string;
  customerId: string;
  notes: string;
}

const emptyPanelForm = (): PanelForm => ({
  name: "",
  protocol: "sia-dc09",
  accountNumber: "",
  panelType: "intrusion",
  comms: "ip",
  receiverLine: "",
  dc09Key: "",
  supervisionMins: "0",
  testIntervalHrs: "",
  make: "",
  model: "",
  psapAgency: "",
  psapPhone: "",
  asapOri: "",
  postSiteId: "",
  stationId: "",
  customerId: "",
  notes: "",
});

/** PSAP/ASAP fields present on the API payload but not on the base AlarmPanel model. */
type AlarmPanelWithPsap = AlarmPanel & {
  psapAgency?: string | null;
  psapPhone?: string | null;
  asapOri?: string | null;
};

const panelToForm = (p: AlarmPanel): PanelForm => ({
  name: p.name ?? "",
  protocol: (p.protocol as AlarmProtocol) ?? "sia-dc09",
  accountNumber: p.accountNumber ?? "",
  panelType: (p.panelType as AlarmPanelType) ?? "intrusion",
  comms: (p.comms as AlarmComms) ?? "ip",
  receiverLine: p.receiverLine ?? "",
  // dc09Key is never returned by the API; always start blank on edit.
  dc09Key: "",
  supervisionMins: p.supervisionMins != null ? String(p.supervisionMins) : "0",
  testIntervalHrs: p.testIntervalHrs != null ? String(p.testIntervalHrs) : "",
  make: p.make ?? "",
  model: p.model ?? "",
  psapAgency: (p as AlarmPanelWithPsap).psapAgency ?? "",
  psapPhone: (p as AlarmPanelWithPsap).psapPhone ?? "",
  asapOri: (p as AlarmPanelWithPsap).asapOri ?? "",
  postSiteId: p.postSiteId ?? "",
  stationId: p.stationId ?? "",
  customerId: p.customerId ?? "",
  notes: p.notes ?? "",
});

// Small native select styled like the app's inputs.
function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;

  return (
    <select
      className={
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm " +
        "ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
        (className ?? "")
      }
      {...rest}
    />
  );
}

// ============================================================
// Panel create/edit modal (portaled)
// ============================================================

function PanelModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: AlarmPanel | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<PanelForm>(emptyPanelForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(editing ? panelToForm(editing) : emptyPanelForm());
  }, [open, editing]);

  if (!open) return null;

  const set = <K extends keyof PanelForm>(k: K, v: PanelForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const num = (s: string): number | null => {
    const n = parseInt(s, 10);

    return Number.isFinite(n) ? n : null;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t("comun.elNombreEsObligatorio"));

      return;
    }
    const payload: Partial<AlarmPanel> & {
      dc09Key?: string;
      psapAgency?: string | null;
      psapPhone?: string | null;
      asapOri?: string | null;
    } = {
      name: form.name.trim(),
      protocol: form.protocol,
      accountNumber: form.accountNumber.trim() || null,
      panelType: form.panelType,
      comms: form.comms,
      receiverLine: form.receiverLine.trim() || null,
      supervisionMins: num(form.supervisionMins) ?? 0,
      testIntervalHrs: num(form.testIntervalHrs),
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      psapAgency: form.psapAgency.trim() || null,
      psapPhone: form.psapPhone.trim() || null,
      asapOri: form.asapOri.trim() || null,
      postSiteId: form.postSiteId.trim() || null,
      stationId: form.stationId.trim() || null,
      customerId: form.customerId.trim() || null,
      notes: form.notes.trim() || null,
    };

    // Only send the AES key when provided (never overwrite with empty on edit).
    if (form.dc09Key.trim()) payload.dc09Key = form.dc09Key.trim();

    setSaving(true);
    try {
      if (editing) {
        await alarmService.updatePanel(editing.id, payload);
        toast.success(t("ui.AlarmPanels.panelActualizado", "Panel actualizado"));
      } else {
        await alarmService.createPanel(payload);
        toast.success(t("ui.AlarmPanels.panelAgregado", "Panel agregado"));
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        (err as Error)?.message ||
          t("alarm.panels.saveError", "No se pudo guardar el panel"),
      );
    } finally {
      setSaving(false);
    }
  };

  const showDc09Key = form.protocol === "sia-dc09";

  return (
    <Modal
      description={t('ui.AlarmPanels.configuraLaConexionDelPanel')}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            {t("actions.cancel", "Cancelar")}
          </Button>
          <Button type="submit" form="alarm-panel-form" variant="brand" disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {editing
              ? t("ui.AlarmPanels.guardarCambios", "Guardar cambios")
              : t("ui.AlarmPanels.agregarPanel", "Agregar panel")}
          </Button>
        </>
      }
      icon={<ShieldAlert className="h-5 w-5" />}
      open={open}
      size="lg"
      title={
        editing
          ? t("ui.AlarmPanels.editarPanel", "Editar panel")
          : t("ui.AlarmPanels.agregarPanel", "Agregar panel")
      }
      onOpenChange={(o) => { if (!o) onClose(); }}
    >
      <form className="space-y-4" id="alarm-panel-form" onSubmit={onSubmit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="ap-name">{t("comun.nombreReq")}</Label>
            <Input
              required
                id="ap-name"
                placeholder={t(
                  "ui.AlarmPanels.ejSucursalCentroPanelPrincipal",
                  "Sucursal Centro - Panel principal",
                )}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ap-protocol">
              {t("ui.AlarmPanels.protocolo", "Protocolo")}
            </Label>
            <NativeSelect
              id="ap-protocol"
              value={form.protocol}
              onChange={(e) => set("protocol", e.target.value as AlarmProtocol)}
            >
              {PROTOCOL_OPTS.map((p) => (
                <option key={p} value={p}>
                  {p === "manual"
                    ? t("ui.AlarmPanels.protocol.manual", PROTOCOL_LABELS[p])
                    : PROTOCOL_LABELS[p]}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="ap-account">
              {t("ui.AlarmPanels.numeroDeCuenta", "Número de cuenta")}
            </Label>
            <Input
              id="ap-account"
              value={form.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              placeholder="1234"
            />
          </div>

          <div>
            <Label htmlFor="ap-type">{t("ui.AlarmPanels.tipoDePanel")}</Label>
            <NativeSelect
              id="ap-type"
              value={form.panelType}
              onChange={(e) =>
                set("panelType", e.target.value as AlarmPanelType)
              }
            >
              {PANEL_TYPE_OPTS.map((opt) => (
                <option key={opt} value={opt}>
                  {t(PANEL_TYPE_LABEL_KEYS[opt], PANEL_TYPE_LABELS[opt])}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="ap-comms">
              {t("ui.AlarmPanels.comunicacion", "Comunicación")}
            </Label>
            <NativeSelect
              id="ap-comms"
              value={form.comms}
              onChange={(e) => set("comms", e.target.value as AlarmComms)}
            >
              {COMMS_OPTS.map((c) => (
                <option key={c} value={c}>
                  {c === "ip"
                    ? COMMS_LABELS[c]
                    : t(`ui.AlarmPanels.comms.${c}`, COMMS_LABELS[c])}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div>
            <Label htmlFor="ap-receiverLine">
              {t("ui.AlarmPanels.lineaDeReceptor", "Línea de receptor")}
            </Label>
            <Input
              id="ap-receiverLine"
              value={form.receiverLine}
              onChange={(e) => set("receiverLine", e.target.value)}
              placeholder="R1L1"
            />
          </div>

          <div>
            <Label htmlFor="ap-supervision">
              {t("ui.AlarmPanels.supervisionMin", "Supervisión (min)")}
            </Label>
            <Input
              id="ap-supervision"
                min={0}
                placeholder="0"
                type="number"
                value={form.supervisionMins}
                onChange={(e) => set("supervisionMins", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ap-psapAgency">
              {t(
                "ui.AlarmPanels.agenciaPsapPolicia",
                "Agencia / PSAP (policía)",
              )}
            </Label>
            <Input
              id="ap-psapAgency"
              value={form.psapAgency}
              onChange={(e) => set("psapAgency", e.target.value)}
              placeholder={t(
                "ui.AlarmPanels.ejPoliciaNacionalZona9",
                "Ej. Policía Nacional - Zona 9",
              )}
            />
          </div>

          <div>
            <Label htmlFor="ap-psapPhone">
              {t("ui.AlarmPanels.telefonoPsap", "Teléfono PSAP")}
            </Label>
            <Input
              id="ap-psapPhone"
              value={form.psapPhone}
              onChange={(e) => set("psapPhone", e.target.value)}
              placeholder={t("ui.AlarmPanels.despachoManual", "Despacho manual")}
            />
          </div>

          <div>
            <Label htmlFor="ap-asapOri">
              {t(
                "ui.AlarmPanels.oriAsapDespachoAutomatico",
                "ORI ASAP (despacho automático)",
              )}
            </Label>
            <Input
              id="ap-asapOri"
                placeholder={t("ui.AlarmPanels.identificadorDeAgenciaAsap", "Identificador de agencia ASAP")}
                value={form.asapOri}
                onChange={(e) => set("asapOri", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ap-testInterval">
              {t(
                "ui.AlarmPanels.intervaloDePruebaH",
                "Intervalo de prueba (h)",
              )}
            </Label>
            <Input
              id="ap-testInterval"
                min={0}
                placeholder="24"
                type="number"
                value={form.testIntervalHrs}
                onChange={(e) => set("testIntervalHrs", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ap-make">{t("ui.AlarmPanels.marca", "Marca")}</Label>
            <Input
              id="ap-make"
              value={form.make}
              onChange={(e) => set("make", e.target.value)}
              placeholder="DSC / Honeywell..."
            />
          </div>

          <div>
            <Label htmlFor="ap-model">{t("ui.AlarmPanels.modelo", "Modelo")}</Label>
            <Input
              id="ap-model"
                placeholder="PowerSeries Neo"
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
            />
          </div>

          {showDc09Key && (
            <div className="sm:col-span-2">
              <Label htmlFor="ap-dc09Key">
                {t("ui.AlarmPanels.claveAesDc09Hex", "Clave AES DC-09 (hex)")}
              </Label>
              <Input
                autoComplete="off"
                  id="ap-dc09Key"
                  placeholder={
                    editing
                      ? t("alarm.panels.keepCurrentKey", "Dejar en blanco para conservar la clave actual")
                      : t(
                          "ui.AlarmPanels.claveDeCifradoEnHexadecimal",
                          "Clave de cifrado en hexadecimal (opcional)",
                        )
                  }
                  value={form.dc09Key}
                  onChange={(e) => set("dc09Key", e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  "ui.AlarmPanels.soloParaSenalesCifradas",
                  "Solo para señales cifradas. La clave nunca se muestra una vez guardada.",
                )}
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="ap-postSite">
              {t(
                "ui.AlarmPanels.puntoDeServicioOpcional",
                "Punto de servicio (opcional)",
              )}
            </Label>
            <Input
              id="ap-postSite"
              value={form.postSiteId}
              onChange={(e) => set("postSiteId", e.target.value)}
              placeholder={t("comun.idDelPuntoDeServicio")}
            />
          </div>

          <div>
            <Label htmlFor="ap-station">
              {t("ui.AlarmPanels.estacionOpcional", "Estación (opcional)")}
            </Label>
            <Input
              id="ap-station"
              placeholder={t("ui.AlarmPanels.idDeLaEstacion", "ID de la estación")}
              value={form.stationId}
              onChange={(e) => set("stationId", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ap-customer">
              {t("ui.AlarmPanels.clienteOpcional")}
            </Label>
            <Input
              id="ap-customer"
                placeholder={t('ui.AlarmPanels.idDelCliente')}
                value={form.customerId}
                onChange={(e) => set("customerId", e.target.value)}
            />
          </div>

          <div className="hidden sm:block" />

          <div className="sm:col-span-2">
            <Label htmlFor="ap-notes">{t("comun.notas")}</Label>
            <Textarea
              id="ap-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder={t(
                "ui.AlarmPanels.instruccionesUbicacionObservaciones",
                "Instrucciones, ubicación, observaciones...",
              )}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Delete confirmation (portaled)
// ============================================================

function ConfirmDelete({
  open,
  title,
  message,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t("actions.cancel", "Cancelar")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("actions.delete", "Eliminar")}
          </Button>
        </>
      }
      icon={<Trash2 className="h-5 w-5" />}
      open={open}
      size="sm"
      title={title}
      onOpenChange={(o) => { if (!o) onCancel(); }}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
    </Modal>
  );
}

// ============================================================
// Zones manager (inside expanded row)
// ============================================================

interface ZoneForm {
  zoneNumber: string;
  name: string;
  type: AlarmZoneType;
  partition: string;
  linkedCameraId: string;
  bypassed: boolean;
}

const emptyZoneForm = (): ZoneForm => ({
  zoneNumber: "",
  name: "",
  type: "motion",
  partition: "",
  linkedCameraId: "",
  bypassed: false,
});

function ZonesManager({ panelId }: { panelId: string }) {
  const { t } = useTranslation();
  const [zones, setZones] = useState<AlarmZone[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  // Linking a zone to a camera needs the Video Surveillance module: without
  // it the camera list is not asked for and the camera column/field is hidden
  // (a camera already linked is kept as is when the zone is saved).
  const hasVideo = useHasModule(VIDEO_SURVEILLANCE);

  useEffect(() => {
    if (!hasVideo) return;
    videoService
      .cameras()
      .then((c) => setCameras(Array.isArray(c) ? c : []))
      .catch(() => {});
  }, [hasVideo]);
  const cameraName = (id?: string | null) =>
    cameras.find((c) => c.id === id)?.name || (id ? t("ui.AlarmPanels.camaraVinculada", "Cámara vinculada") : "—");
  const [form, setForm] = useState<ZoneForm>(emptyZoneForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AlarmZone | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await alarmService.zones(panelId);

      setZones(Array.isArray(list) ? list : []);
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("alarm.zones.loadError", "No se pudieron cargar las zonas"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
     
  }, [panelId]);

  const set = <K extends keyof ZoneForm>(k: K, v: ZoneForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm(emptyZoneForm());
    setEditingId(null);
  };

  const startEdit = (z: AlarmZone) => {
    setEditingId(z.id);
    setForm({
      zoneNumber: z.zoneNumber ?? "",
      name: z.name ?? "",
      type: (z.type as AlarmZoneType) ?? "motion",
      partition: z.partition ?? "",
      linkedCameraId: z.linkedCameraId ?? "",
      bypassed: !!z.bypassed,
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: Partial<AlarmZone> = {
      zoneNumber: form.zoneNumber.trim() || null,
      name: form.name.trim() || null,
      type: form.type,
      partition: form.partition.trim() || null,
      linkedCameraId: form.linkedCameraId.trim() || null,
      bypassed: form.bypassed,
    };

    setSaving(true);
    try {
      if (editingId) {
        await alarmService.updateZone(editingId, payload);
        toast.success(t("ui.AlarmPanels.zonaActualizada", "Zona actualizada"));
      } else {
        await alarmService.createZone(panelId, payload);
        toast.success(t("ui.AlarmPanels.zonaAgregada", "Zona agregada"));
      }
      resetForm();
      await load();
    } catch (err) {
      toast.error(
        (err as Error)?.message ||
          t("alarm.zones.saveError", "No se pudo guardar la zona"),
      );
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await alarmService.deleteZone(deleteTarget.id);
      toast.success(t("ui.AlarmPanels.zonaEliminada", "Zona eliminada"));
      setZones((prev) => prev.filter((z) => z.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("alarm.zones.deleteError", "No se pudo eliminar la zona"),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {loading ? (
        <div className="space-y-2 py-2">
          <SkeletonBlock className="h-9" />
          <SkeletonBlock className="h-9" />
          <SkeletonBlock className="h-9" />
        </div>
      ) : zones.length === 0 ? (
        <EmptyState
          description={t('ui.AlarmPanels.anadeLasZonasDelPanel')}
          icon={<RadioTower />}
          title={t('ui.AlarmPanels.sinZonasConfiguradas')}
        />
      ) : (
        <div className="glass-flat overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead
              className="text-left text-xs uppercase tracking-wide"
              style={{
                background: "var(--glass-sunken)",
                color: "var(--ink-faint)",
              }}
            >
              <tr>
                <th className="px-3 py-2">{t("ui.AlarmPanels.zona", "Zona")}</th>
                <th className="px-3 py-2">{t("comun.nombre")}</th>
                <th className="px-3 py-2">{t("comun.tipo")}</th>
                <th className="px-3 py-2">
                  {t("ui.AlarmPanels.particion", "Partición")}
                </th>
                {hasVideo && (
                  <th className="px-3 py-2">
                    {t("ui.AlarmPanels.camara", "Cámara")}
                  </th>
                )}
                <th className="px-3 py-2">{t("comun.estado")}</th>
                <th className="px-3 py-2 text-right">
                  {t("ui.AlarmPanels.acciones", "Acciones")}
                </th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr
                  key={z.id}
                  className="border-t"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <td className="px-3 py-2 font-mono">{z.zoneNumber || "—"}</td>
                  <td className="px-3 py-2">{z.name || "—"}</td>
                  <td className="px-3 py-2">
                    {t(
                      ZONE_TYPE_LABEL_KEYS[
                        (z.type as AlarmZoneType) ?? "motion"
                      ],
                      ZONE_TYPE_LABELS[(z.type as AlarmZoneType) ?? "motion"],
                    )}
                  </td>
                  <td className="px-3 py-2">{z.partition || "—"}</td>
                  {hasVideo && (
                    <td className="px-3 py-2 font-mono text-xs">
                      {cameraName(z.linkedCameraId)}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    {z.bypassed ? (
                      <KitStatusBadge tone="warn">
                        {t("ui.AlarmPanels.anulada", "Anulada")}
                      </KitStatusBadge>
                    ) : (
                      <KitStatusBadge dot={false} tone="ok">
                        {t("comun.activa")}
                      </KitStatusBadge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        title={t('actions.edit')}
                        variant="ghost"
                        onClick={() => startEdit(z)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        style={{ color: 'var(--bad-text)' }}
                        title={t('actions.delete')}
                        variant="ghost"
                        onClick={() => setDeleteTarget(z)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Zone form */}
      <form
        className="mt-3 grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={onSubmit}
      >
        <div>
          <Label className="text-xs" htmlFor="z-number">
            {t("ui.AlarmPanels.numeroDeZona", "Número de zona")}
          </Label>
          <Input
            id="z-number"
            placeholder="001"
            value={form.zoneNumber}
            onChange={(e) => set("zoneNumber", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="z-name">
            {" "}
            {t("comun.nombre")}{" "}
          </Label>
          <Input
            id="z-name"
            placeholder={t("ui.AlarmPanels.ejPuertaPrincipal", "Puerta principal")}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="z-type">
            {" "}
            {t("comun.tipo")}{" "}
          </Label>
          <NativeSelect
            id="z-type"
            value={form.type}
            onChange={(e) => set("type", e.target.value as AlarmZoneType)}
          >
            {ZONE_TYPE_OPTS.map((opt) => (
              <option key={opt} value={opt}>
                {t(ZONE_TYPE_LABEL_KEYS[opt], ZONE_TYPE_LABELS[opt])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label className="text-xs" htmlFor="z-partition">
            {t("ui.AlarmPanels.particion", "Partición")}
          </Label>
          <Input
            id="z-partition"
            placeholder="1"
            value={form.partition}
            onChange={(e) => set("partition", e.target.value)}
          />
        </div>
        {hasVideo && (
          <div>
            <Label className="text-xs" htmlFor="z-camera">
              {t(
                "ui.AlarmPanels.camaraVinculadaVerificacionPorVideo",
                "Cámara vinculada (verificación por video)",
              )}
            </Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              id="z-camera"
              value={form.linkedCameraId}
              onChange={(e) => set("linkedCameraId", e.target.value)}
            >
              <option value="">
                {t("ui.AlarmPanels.sinCamara", "— Sin cámara —")}
              </option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.id}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-end gap-2 pb-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              checked={form.bypassed}
              className="h-4 w-4 rounded border-input"
              type="checkbox"
              onChange={(e) => set("bypassed", e.target.checked)}
            />
            {t("ui.AlarmPanels.anuladaBypass", "Anulada (bypass)")}
          </label>
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button disabled={saving} size="sm" type="submit" variant="brand">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {editingId
              ? t("ui.AlarmPanels.guardarZona", "Guardar zona")
              : t("ui.AlarmPanels.agregarZona", "Agregar zona")}
          </Button>
          {editingId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={resetForm}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
          )}
        </div>
      </form>

      <ConfirmDelete
        busy={deleting}
        message={t("ui.AlarmPanels.confirmarEliminarZona", {
          defaultValue:
            "¿Seguro que deseas eliminar la zona {{name}}? Esta acción no se puede deshacer.",
          name: deleteTarget?.name || deleteTarget?.zoneNumber || "",
        })}
        open={!!deleteTarget}
        title={t('ui.AlarmPanels.eliminarZona')}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
      />
    </div>
  );
}

// ============================================================
// Contacts manager (inside expanded row)
// ============================================================

interface ContactForm {
  name: string;
  phone: string;
  email: string;
  callOrder: string;
  passcode: string;
  authority: AlarmContactAuthority;
}

const emptyContactForm = (): ContactForm => ({
  name: "",
  phone: "",
  email: "",
  callOrder: "1",
  passcode: "",
  authority: "keyholder",
});

function ContactsManager({ panelId }: { panelId: string }) {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<AlarmContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ContactForm>(emptyContactForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AlarmContact | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await alarmService.contacts(panelId);
      const arr = Array.isArray(list) ? list : [];

      arr.sort((a, b) => (a.callOrder ?? 0) - (b.callOrder ?? 0));
      setContacts(arr);
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t(
            "clients.contacts.loadError",
            "No se pudieron cargar los contactos",
          ),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
     
  }, [panelId]);

  const set = <K extends keyof ContactForm>(k: K, v: ContactForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm(emptyContactForm());
    setEditingId(null);
  };

  const startEdit = (c: AlarmContact) => {
    setEditingId(c.id);
    setForm({
      name: c.name ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      callOrder: c.callOrder != null ? String(c.callOrder) : "1",
      // passcode is never returned by the API; always start blank on edit.
      passcode: "",
      authority: (c.authority as AlarmContactAuthority) ?? "keyholder",
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error(t("ui.AlarmPanels.elNombreDelContactoEs"));

      return;
    }
    const n = parseInt(form.callOrder, 10);
    const payload: Partial<AlarmContact> & { passcode?: string } = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      callOrder: Number.isFinite(n) ? n : 1,
      authority: form.authority,
    };

    if (form.passcode.trim()) payload.passcode = form.passcode.trim();

    setSaving(true);
    try {
      if (editingId) {
        await alarmService.updateContact(editingId, payload);
        toast.success(t("ui.AlarmPanels.contactoActualizado"));
      } else {
        await alarmService.createContact(panelId, payload);
        toast.success(t("ui.AlarmPanels.contactoAgregado"));
      }
      resetForm();
      await load();
    } catch (err) {
      toast.error(
        (err as Error)?.message ||
          t("alarm.contacts.saveError", "No se pudo guardar el contacto"),
      );
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await alarmService.deleteContact(deleteTarget.id);
      toast.success(t("ui.AlarmPanels.contactoEliminado"));
      setContacts((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t(
            "clients.contacts.contactDeleteFailed",
            "No se pudo eliminar el contacto",
          ),
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      {loading ? (
        <div className="space-y-2 py-2">
          <SkeletonBlock className="h-9" />
          <SkeletonBlock className="h-9" />
          <SkeletonBlock className="h-9" />
        </div>
      ) : contacts.length === 0 ? (
        <EmptyState
          description={t('ui.AlarmPanels.anadeAQuienHayQue')}
          icon={<Users />}
          title={t('ui.AlarmPanels.sinContactosDeAviso')}
        />
      ) : (
        <div className="glass-flat overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead
              className="text-left text-xs uppercase tracking-wide"
              style={{
                background: "var(--glass-sunken)",
                color: "var(--ink-faint)",
              }}
            >
              <tr>
                <th className="px-3 py-2">{t("ui.AlarmPanels.orden", "Orden")}</th>
                <th className="px-3 py-2">{t("comun.nombre")}</th>
                <th className="px-3 py-2">
                  {t("ui.AlarmPanels.telefono", "Teléfono")}
                </th>
                <th className="px-3 py-2">{t("ui.AlarmPanels.email", "Email")}</th>
                <th className="px-3 py-2">{t("ui.AlarmPanels.autoridad", "Autoridad")}</th>
                <th className="px-3 py-2 text-right">
                  {t("ui.AlarmPanels.acciones", "Acciones")}
                </th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-t"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <td className="px-3 py-2 font-mono">{c.callOrder ?? "—"}</td>
                  <td className="px-3 py-2">{c.name || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {c.phone || "—"}
                  </td>
                  <td className="px-3 py-2 text-xs">{c.email || "—"}</td>
                  <td className="px-3 py-2">
                    {c.authority
                      ? t(
                          AUTHORITY_LABEL_KEYS[
                            c.authority as AlarmContactAuthority
                          ],
                          AUTHORITY_LABELS[
                            c.authority as AlarmContactAuthority
                          ],
                        )
                      : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        title={t('actions.edit')}
                        variant="ghost"
                        onClick={() => startEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        style={{ color: 'var(--bad-text)' }}
                        title={t('actions.delete')}
                        variant="ghost"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Contact form */}
      <form
        className="mt-3 grid grid-cols-1 gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={onSubmit}
      >
        <div>
          <Label className="text-xs" htmlFor="c-name">
            {" "}
            {t("comun.nombreReq")}{" "}
          </Label>
          <Input
            id="c-name"
            placeholder={t("ui.AlarmPanels.juanPerez", "Juan Pérez")}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="c-phone">
            {t("ui.AlarmPanels.telefono", "Teléfono")}
          </Label>
          <Input
            id="c-phone"
            placeholder="+52 55 1234 5678"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="c-email">
            {t("ui.AlarmPanels.email", "Email")}
          </Label>
          <Input
            id="c-email"
            placeholder={t('ui.AlarmPanels.contactoEmpresaCom')}
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="c-order">
            {t("ui.AlarmPanels.ordenDeLlamada", "Orden de llamada")}
          </Label>
          <Input
            id="c-order"
            min={1}
            placeholder="1"
            type="number"
            value={form.callOrder}
            onChange={(e) => set("callOrder", e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs" htmlFor="c-authority">
            {t("ui.AlarmPanels.autoridad", "Autoridad")}
          </Label>
          <NativeSelect
            id="c-authority"
            value={form.authority}
            onChange={(e) =>
              set("authority", e.target.value as AlarmContactAuthority)
            }
          >
            {AUTHORITY_OPTS.map((a) => (
              <option key={a} value={a}>
                {t(AUTHORITY_LABEL_KEYS[a], AUTHORITY_LABELS[a])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label className="text-xs" htmlFor="c-passcode">
            {t("ui.AlarmPanels.codigoDeVerificacion", "Código de verificación")}
          </Label>
          <Input
            autoComplete="off"
            id="c-passcode"
            placeholder={
              editingId
                ? t("ui.AlarmPanels.dejarEnBlancoParaConservar", "Dejar en blanco para conservar")
                : "••••"
            }
            value={form.passcode}
            onChange={(e) => set("passcode", e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <Button disabled={saving} size="sm" type="submit" variant="brand">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {editingId
              ? t("ui.AlarmPanels.guardarContacto", "Guardar contacto")
              : t("ui.AlarmPanels.agregarContacto", "Agregar contacto")}
          </Button>
          {editingId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={resetForm}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
          )}
        </div>
      </form>

      <ConfirmDelete
        busy={deleting}
        message={t("ui.AlarmPanels.confirmarEliminarContacto", {
          defaultValue:
            "¿Seguro que deseas eliminar a {{name}}? Esta acción no se puede deshacer.",
          name: deleteTarget?.name || t("ui.AlarmPanels.esteContacto", "este contacto"),
        })}
        open={!!deleteTarget}
        title={t('ui.AlarmPanels.eliminarContacto')}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
      />
    </div>
  );
}

// ============================================================
// Expanded panel detail (zones + contacts tabs)
// ============================================================

function PanelDetail({ panelId }: { panelId: string }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"zones" | "contacts">("zones");

  return (
    <div
      className="border-t px-4 py-4"
      style={{
        borderColor: "var(--hairline)",
        background: "var(--glass-sunken)",
      }}
    >
      <div className="mb-3">
        <Segmented
          options={[
            { value: "zones", label: <span className="inline-flex items-center gap-1.5"><RadioTower className="h-3.5 w-3.5" /> {t("ui.AlarmPanels.zonas", "Zonas")}</span> },
            { value: "contacts", label: <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {t("ui.AlarmPanels.contactos", "Contactos")}</span> },
          ]}
          value={tab}
          onChange={(v) => setTab(v)}
        />
      </div>

      {tab === "zones" ? (
        <ZonesManager panelId={panelId} />
      ) : (
        <ContactsManager panelId={panelId} />
      )}
    </div>
  );
}

// ============================================================
// Page
// ============================================================

export default function AlarmPanels() {
  const { t } = useTranslation();
  const [panels, setPanels] = useState<AlarmPanel[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AlarmPanel | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<AlarmPanel | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await alarmService.panels();

      setPanels(Array.isArray(list) ? list : []);
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("alarm.panels.loadError", "No se pudieron cargar los paneles"),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (p: AlarmPanel) => {
    setEditing(p);
    setModalOpen(true);
  };

  const toggleExpand = (id: string) =>
    setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await alarmService.deletePanel(deleteTarget.id);
      toast.success(t("ui.AlarmPanels.panelEliminado", "Panel eliminado"));
      setPanels((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("alarm.panels.deleteError", "No se pudo eliminar el panel"),
      );
    } finally {
      setDeleting(false);
    }
  };

  const counts = useMemo(() => {
    const c = { total: panels.length, online: 0, offline: 0, armed: 0 };

    for (const p of panels) {
      const s = (p.status as AlarmPanelStatus) ?? "unknown";

      if (s === "online") c.online += 1;
      else if (s === "offline") c.offline += 1;
      else if (s === "armed") c.armed += 1;
    }

    return c;
  }, [panels]);

  return (
    <AppLayout>
      <PageContainer width="wide">
        {/* Header */}
        <PageHeader
          actions={
            <>
              <Button asChild variant="outline">
                <Link to="/alarm/queue">{t("ui.AlarmPanels.colaDeCasos", "Cola de casos")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/alarm/signals">{t("ui.AlarmPanels.senales", "Señales")}</Link>
              </Button>
              <Button variant="brand" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t("ui.AlarmPanels.agregarPanel", "Agregar panel")}
              </Button>
            </>
          }
          icon={<ShieldAlert />}
          subtitle={t('ui.AlarmPanels.administraLosPanelesMonitoreadosSus')}
          title={t("ui.AlarmPanels.panelesDeAlarma", "Paneles de alarma")}
        />

        {/* Summary */}
        <StatsStrip className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label={t("comun.total")}
            value={counts.total}
            icon={<ShieldAlert />}
            accent="neutral"
          />
          <StatCard
            label={t("ui.AlarmPanels.enLinea", "En línea")}
            value={counts.online}
            icon={<Wifi />}
            accent="ok"
          />
          <StatCard
            label={t("ui.AlarmPanels.armados", "Armados")}
            value={counts.armed}
            icon={<ShieldAlert />}
            accent="warn"
          />
          <StatCard
            label={t("ui.AlarmPanels.sinConexion", "Sin conexión")}
            value={counts.offline}
            icon={<WifiOff />}
            accent="bad"
          />
        </StatsStrip>

        {/* List */}
        {loading ? (
          <SkeletonCards className="sm:grid-cols-1" count={4} />
        ) : panels.length === 0 ? (
          <EmptyState
            action={
              <Button variant="brand" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t("ui.AlarmPanels.agregarPanel", "Agregar panel")}
              </Button>
            }
            description={t('ui.AlarmPanels.agregaTuPrimerPanelDe')}
            icon={<ShieldAlert />}
            title={t('ui.AlarmPanels.noHayPaneles')}
          />
        ) : (
          <div className="space-y-3">
            {panels.map((p) => {
              const isOpen = !!expanded[p.id];

              return (
                /* `flat`: la lista de paneles puede ser larga y cada ficha
                   despliega tablas dentro; el desenfoque por ficha no se paga. */
                <GlassPanel key={p.id} flat className="overflow-hidden">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <button
                      aria-expanded={isOpen}
                      className="cg-focus flex min-w-0 flex-1 items-start gap-3 rounded-xl text-left"
                      type="button"
                      onClick={() => toggleExpand(p.id)}
                    >
                      {/* Un panel sin reportar no es «lo destacado de la
                          pantalla»: iba en el acento de marca mientras la
                          tarjeta «Armados» de arriba lo contaba en ámbar. */}
                      <IconTile
                        tone={
                          p.status === "offline"
                            ? "bad"
                            : p.status === "online"
                              ? "ok"
                              : "warn"
                        }
                        size="sm"
                      >
                        {isOpen ? <ChevronDown /> : <ChevronRight />}
                      </IconTile>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold">
                            {p.name}
                          </span>
                          <KitStatusBadge
                            tone="neutral"
                            dot={false}
                            className="uppercase"
                          >
                            {t(
                              PANEL_TYPE_LABEL_KEYS[
                                (p.panelType as AlarmPanelType) ?? "intrusion"
                              ],
                              PANEL_TYPE_LABELS[
                                (p.panelType as AlarmPanelType) ?? "intrusion"
                              ],
                            )}
                          </KitStatusBadge>
                          {p.active === false && (
                            <KitStatusBadge dot={false} tone="neutral">
                              {t("common.inactive")}
                            </KitStatusBadge>
                          )}
                        </div>
                        <div
                          className="mt-0.5 truncate text-sm"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {[p.make, p.model].filter(Boolean).join(" · ") ||
                            t(
                              "alarm.panels.noMakeModel",
                              "Sin marca ni modelo",
                            )}
                        </div>
                        <div
                          className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          <span>
                            {t("ui.AlarmPanels.cuentaValor", {
                              defaultValue: "Cuenta: {{value}}",
                              value: p.accountNumber || "—",
                            })}
                          </span>
                          <span>
                            {p.protocol === "manual"
                              ? t("ui.AlarmPanels.protocol.manual", PROTOCOL_LABELS.manual)
                              : PROTOCOL_LABELS[
                                  (p.protocol as AlarmProtocol) ?? "sia-dc09"
                                ]}
                          </span>
                          <span>
                            {(p.comms ?? "ip") === "ip"
                              ? COMMS_LABELS.ip
                              : t(
                                  `ui.AlarmPanels.comms.${p.comms}`,
                                  COMMS_LABELS[p.comms as AlarmComms] ??
                                    String(p.comms),
                                )}
                          </span>
                          {p.receiverLine ? (
                            <span>{p.receiverLine}</span>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    <div className="flex shrink-0 items-center gap-2">
                      <PanelStatusBadge status={p.status as AlarmPanelStatus} />
                      <Button
                        size="icon"
                        title={t('actions.edit')}
                        variant="ghost"
                        onClick={() => openEdit(p)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        style={{ color: 'var(--bad-text)' }}
                        title={t('actions.delete')}
                        variant="ghost"
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isOpen && <PanelDetail panelId={p.id} />}
                </GlassPanel>
              );
            })}
          </div>
        )}
      </PageContainer>

      <PanelModal
        editing={editing}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
      />

      <ConfirmDelete
        busy={deleting}
        message={t("ui.AlarmPanels.confirmarEliminarPanel", {
          defaultValue:
            "¿Seguro que deseas eliminar {{name}}? Se eliminarán también sus zonas y contactos. Esta acción no se puede deshacer.",
          name: deleteTarget?.name || t("ui.AlarmPanels.estePanel", "este panel"),
        })}
        open={!!deleteTarget}
        title={t('ui.AlarmPanels.eliminarPanel')}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={onDelete}
      />
    </AppLayout>
  );
}
