import { useEffect, useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import { toast } from "sonner";
import {
  Loader2,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import {
  PageContainer, PageHeader, StatCard, StatusBadge, EmptyState, SkeletonCards,
  Stagger, GlassPanel, IconTile, Section,
} from "@/components/kit";
import { DeviceStatusBadge, FaultRail, healthTone, type DeviceHealth } from "../video/deviceStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  radioDeviceService,
  type RadioDevice,
  type RadioTransport,
} from "@/lib/api/radioDeviceService";

type FormState = {
  name: string;
  host: string;
  sipPort: string;
  transport: RadioTransport;
  sipUsername: string;
  sipPassword: string;
  sipDomain: string;
  extension: string;
  rtpPortStart: string;
  rtpPortEnd: string;
  registerRequired: boolean;
  notes: string;
  active: boolean;
};

const emptyForm: FormState = {
  name: "",
  host: "",
  sipPort: "5060",
  transport: "udp",
  sipUsername: "",
  sipPassword: "",
  sipDomain: "",
  extension: "",
  rtpPortStart: "16000",
  rtpPortEnd: "16100",
  registerRequired: true,
  notes: "",
  active: true,
};

/**
 * El estado de un enlace de radio es SEVERIDAD, no marca. La escala es la común
 * de equipos (`../video/deviceStatus`): «sin conexión» tenía aquí el tono
 * neutro y en los dispositivos de vídeo el rojo, así que el mismo equipo caído
 * se leía como trámite o como avería según la pantalla.
 */
const STATUS_BADGE: Record<string, { health: DeviceHealth; label: string }> = {
  registered: { health: "up", label: "Registrado" },
  offline: { health: "down", label: "Sin conexión" },
  error: { health: "down", label: "Error" },
  unknown: { health: "unknown", label: "Sin probar" },
};

export default function RadioDevices() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<RadioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RadioDevice | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<RadioDevice | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    radioDeviceService
      .list()
      .then(setDevices)
      .catch((e: any) => setError(e?.message || "No se pudieron cargar los radios IP"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (d: RadioDevice) => {
    setEditing(d);
    setForm({
      name: d.name || "",
      host: d.host || "",
      sipPort: String(d.sipPort ?? 5060),
      transport: (d.transport as RadioTransport) || "udp",
      sipUsername: d.sipUsername || "",
      sipPassword: "", // never prefilled; leave blank to keep
      sipDomain: d.sipDomain || "",
      extension: d.extension || "",
      rtpPortStart: String(d.rtpPortStart ?? 16000),
      rtpPortEnd: String(d.rtpPortEnd ?? 16100),
      registerRequired: d.registerRequired ?? true,
      notes: d.notes || "",
      active: d.active ?? true,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    if (!form.host.trim()) {
      toast.error("La IP / host del radio es obligatoria");
      return;
    }
    const payload: any = {
      name: form.name.trim(),
      host: form.host.trim(),
      sipPort: Number(form.sipPort) || 5060,
      transport: form.transport,
      sipUsername: form.sipUsername.trim() || null,
      sipDomain: form.sipDomain.trim() || null,
      extension: form.extension.trim() || null,
      rtpPortStart: Number(form.rtpPortStart) || 16000,
      rtpPortEnd: Number(form.rtpPortEnd) || 16100,
      registerRequired: form.registerRequired,
      notes: form.notes.trim() || null,
      active: form.active,
    };
    // Only send the password when the user typed one (blank = keep existing).
    if (form.sipPassword) payload.sipPassword = form.sipPassword;

    setSaving(true);
    try {
      if (editing) {
        await radioDeviceService.update(editing.id, payload);
        toast.success("Radio IP actualizado");
      } else {
        await radioDeviceService.create(payload);
        toast.success("Radio IP agregado");
      }
      setDialogOpen(false);
      setForm({ ...emptyForm });
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar el radio IP");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await radioDeviceService.remove(deleteTarget.id);
      toast.success("Radio IP eliminado");
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo eliminar");
    }
  };

  const test = async (d: RadioDevice) => {
    setTestingId(d.id);
    try {
      const res = await radioDeviceService.test(d.id);
      toast.success(
        res.dispatched
          ? "Solicitud de registro enviada al puente SIP"
          : "Guardado. El puente SIP aún no está activo (Fase 2).",
      );
      load();
    } catch (e: any) {
      toast.error(e?.message || "No se pudo probar la conexión");
    } finally {
      setTestingId(null);
    }
  };

  const counts = useMemo(() => {
    const c = { total: devices.length, registered: 0, offline: 0, other: 0 };
    for (const d of devices) {
      if (d.status === "registered") c.registered++;
      else if (d.status === "offline") c.offline++;
      else c.other++;
    }
    return c;
  }, [devices]);

  return (
    <AppLayout>
      <PageContainer width="wide" className="px-4 sm:px-6">
        <PageHeader
          icon={<Radio />}
          title="Radios IP"
          subtitle="Conecta una pasarela RoIP / SIP para enlazar los radios físicos con el canal de la app."
          badges={(
            counts.registered > 0 ? (
              /* La misma píldora que el kit ya calcula: la página la pintaba a
                 mano en la rama «hay enlaces» y con `StatusBadge` en la otra,
                 así que el mismo indicador tenía dos anatomías. */
              <StatusBadge tone="ok">
                {counts.registered === 1 ? 'Un enlace al aire' : `${counts.registered} enlaces al aire`}
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">Sin enlaces al aire</StatusBadge>
            )
          )}
          actions={(
            <Button variant="brand" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Agregar radio IP
            </Button>
          )}
        />

        {/* Summary */}
        <Stagger className="grid grid-cols-3 gap-3">
          <StatCard label="Total" value={counts.total} icon={<Radio />} accent="primary" />
          <StatCard label="Registrados" value={counts.registered} icon={<Wifi />} accent="ok" />
          <StatCard label="Sin conexión" value={counts.offline} icon={<WifiOff />} accent="neutral" />
        </Stagger>

        {/* List */}
        {loading ? (
          <SkeletonCards count={4} className="lg:grid-cols-2" />
        ) : error ? (
          <Section>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <IconTile tone="bad" size="lg"><WifiOff /></IconTile>
              <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{error}</p>
              <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Reintentar</Button>
            </div>
          </Section>
        ) : devices.length === 0 ? (
          <EmptyState
            icon={<Radio />}
            title={t("ui.RadioDevices.aunNoHayRadiosIp", "Aún no hay radios IP")}
            description="Agrega la pasarela RoIP/SIP del cliente con su IP y credenciales SIP."
            action={(
              <Button variant="brand" onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" />Agregar radio IP
              </Button>
            )}
          />
        ) : (
          <Stagger className="grid gap-3 lg:grid-cols-2">
            {devices.map((d) => {
              const badge = STATUS_BADGE[d.status || "unknown"] || STATUS_BADGE.unknown;
              const alAire = d.status === "registered";
              const falla = d.status === "error";
              return (
                /* `flat` a propósito: dentro de un map(), el desenfoque de `.glass`
                   obliga a rasterizar el fondo por tarjeta en cada fotograma. */
                <GlassPanel key={d.id} flat className="relative overflow-hidden p-4">
                  {/* Canto de severidad — sólo cuando el enlace ha fallado. */}
                  {falla && <FaultRail />}
                  <div className="flex items-start gap-3">
                    {/* El icono y la píldora salen del MISMO estado: un enlace
                        «sin probar» tenía la píldora en ámbar y el icono en el
                        acento de marca. */}
                    <IconTile tone={healthTone(badge.health)}>
                      {alAire ? <Wifi /> : d.status === "offline" || falla ? <WifiOff /> : <Radio />}
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-foreground">{d.name}</p>
                        <DeviceStatusBadge health={badge.health} label={badge.label} />
                        {!d.active && <StatusBadge tone="neutral" dot={false}>Inactivo</StatusBadge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--ink-soft)' }}>
                        {d.host || "—"}:{d.sipPort ?? 5060} · {String(d.transport || "udp").toUpperCase()}
                        {d.extension ? ` · ext ${d.extension}` : ""}
                        {d.sipUsername ? ` · ${d.sipUsername}` : ""}
                      </p>
                      {d.lastError && (
                        <p className="mt-1 truncate text-xs" style={{ color: 'var(--bad-text)' }}>{d.lastError}</p>
                      )}
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={testingId === d.id} onClick={() => test(d)}>
                          {testingId === d.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                          Probar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />Editar
                        </Button>
                        <Button size="sm" variant="ghost" style={{ color: 'var(--bad-text)' }} onClick={() => setDeleteTarget(d)}>
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />Eliminar
                        </Button>
                      </div>
                    </div>
                  </div>
                </GlassPanel>
              );
            })}
          </Stagger>
        )}
      </PageContainer>

      {/* Create / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!saving) { setDialogOpen(o); if (!o) { setEditing(null); setForm({ ...emptyForm }); } } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar radio IP" : "Agregar radio IP"}</DialogTitle>
            <DialogDescription>{t("ui.RadioDevices.pasarelaRoipSipLaContrasena", "Pasarela RoIP / SIP. La contraseña SIP se guarda cifrada.")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Radio Central Norte" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>IP / Host *</Label>
                <Input value={form.host} onChange={(e) => set({ host: e.target.value })} placeholder="192.168.1.50" />
              </div>
              <div className="grid gap-1.5">
                <Label>Puerto SIP</Label>
                <Input type="number" value={form.sipPort} onChange={(e) => set({ sipPort: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Transporte</Label>
                <Select value={form.transport} onValueChange={(v) => set({ transport: v as RadioTransport })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="udp">UDP</SelectItem>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="tls">TLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t("ui.RadioDevices.extensionTalkgroup", "Extensión / Talkgroup")}</Label>
                <Input value={form.extension} onChange={(e) => set({ extension: e.target.value })} placeholder="1001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Usuario SIP</Label>
                <Input value={form.sipUsername} onChange={(e) => set({ sipUsername: e.target.value })} autoComplete="off" />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("ui.RadioDevices.contrasenaSip", "Contraseña SIP")}</Label>
                <Input
                  type="password"
                  value={form.sipPassword}
                  onChange={(e) => set({ sipPassword: e.target.value })}
                  autoComplete="new-password"
                  placeholder={editing?.sipPasswordConfigured ? "•••• (sin cambios)" : ""}
                />
                {editing?.sipPasswordConfigured && (
                  <p className="text-[11px] text-muted-foreground">Deja en blanco para conservar la actual.</p>
                )}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Dominio / Registrar (opcional)</Label>
              <Input value={form.sipDomain} onChange={(e) => set({ sipDomain: e.target.value })} placeholder="Por defecto: el host" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Puerto RTP inicial</Label>
                <Input type="number" value={form.rtpPortStart} onChange={(e) => set({ rtpPortStart: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Puerto RTP final</Label>
                <Input type="number" value={form.rtpPortEnd} onChange={(e) => set({ rtpPortEnd: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} />
            </div>
            <label className="glass-sunken flex cursor-pointer items-center gap-2.5 p-3 text-sm">
              <input
                type="checkbox"
                className="cg-focus size-4"
                style={{ accentColor: 'var(--brand)' }}
                checked={form.registerRequired}
                onChange={(e) => set({ registerRequired: e.target.checked })}
              />
              Requiere registro SIP (REGISTER)
            </label>
            <label className="glass-sunken flex cursor-pointer items-center gap-2.5 p-3 text-sm">
              <input
                type="checkbox"
                className="cg-focus size-4"
                style={{ accentColor: 'var(--brand)' }}
                checked={form.active}
                onChange={(e) => set({ active: e.target.checked })}
              />
              Activo (se intentará mantener conectado)
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button variant="brand" disabled={saving} onClick={save}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editing ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar radio IP</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar “{deleteTarget?.name}”? El puente dejará de conectarlo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="cg-btn-bad">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
