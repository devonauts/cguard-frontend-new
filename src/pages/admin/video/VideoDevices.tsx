import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Camera as CameraIcon,
  HardDrive,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Trash2,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";
import VideoGatewayModal from "@/components/video/VideoGatewayModal";

import AppLayout from "@/layouts/app-layout";
import {
  PageContainer,
  PageHeader,
  StatCard,
  Stagger,
  EmptyState,
  SkeletonCards,
  GlassPanel,
  IconTile,
  StatusBadge,
} from "@/components/kit";
import { DeviceStatusBadge, healthTone, type DeviceHealth } from "./deviceStatus";
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
  videoService,
  type Device,
  type DeviceProtocol,
  type DeviceStatus,
  type DeviceType,
  type RelaySite,
} from "@/lib/api/videoService";

const TYPE_LABELS: Record<DeviceType, string> = {
  dvr: "DVR",
  nvr: "NVR",
  camera: "Cámara",
  cloud: "Nube",
};

const PROTOCOL_OPTS: DeviceProtocol[] = ["rtsp", "onvif", "hls", "webrtc"];
const TYPE_OPTS: DeviceType[] = ["dvr", "nvr", "camera", "cloud"];

interface DeviceForm {
  name: string;
  type: DeviceType;
  brand: string;
  model: string;
  host: string;
  port: string;
  httpPort: string;
  username: string;
  password: string;
  channels: string;
  protocol: DeviceProtocol;
  postSiteId: string;
  stationId: string;
  notes: string;
  connectionMode: "direct" | "relay";
  relaySiteId: string;
}

const emptyForm = (): DeviceForm => ({
  name: "",
  type: "dvr",
  brand: "",
  model: "",
  host: "",
  port: "554",
  httpPort: "80",
  username: "",
  password: "",
  channels: "1",
  protocol: "rtsp",
  postSiteId: "",
  stationId: "",
  notes: "",
  connectionMode: "direct",
  relaySiteId: "",
});

const deviceToForm = (d: Device): DeviceForm => ({
  name: d.name ?? "",
  type: (d.type as DeviceType) ?? "dvr",
  brand: d.brand ?? "",
  model: d.model ?? "",
  host: d.host ?? "",
  port: d.port != null ? String(d.port) : "554",
  httpPort: d.httpPort != null ? String(d.httpPort) : "80",
  username: d.username ?? "",
  password: "",
  channels: d.channels != null ? String(d.channels) : "1",
  protocol: (d.protocol as DeviceProtocol) ?? "rtsp",
  postSiteId: d.postSiteId ?? "",
  stationId: d.stationId ?? "",
  notes: d.notes ?? "",
  connectionMode: (d.connectionMode as "direct" | "relay") ?? "direct",
  relaySiteId: d.relaySiteId ?? "",
});

/**
 * Estado del equipo. La escala vive en `./deviceStatus` y la comparten los
 * enlaces de radio y los sitios de retransmisión: antes cada pantalla decidía
 * por su cuenta de qué color era «sin conexión» y salían cuatro respuestas.
 */
const DEVICE_HEALTH: Record<DeviceStatus | "unknown", { health: DeviceHealth; label: string }> = {
  online: { health: "up", label: "En línea" },
  offline: { health: "down", label: "Sin conexión" },
  auth_failed: { health: "auth", label: "Credenciales" },
  unreachable: { health: "unreachable", label: "Sin stream" },
  unknown: { health: "unknown", label: "Desconocido" },
};

function deviceHealth(status?: DeviceStatus): { health: DeviceHealth; label: string } {
  return DEVICE_HEALTH[status ?? "unknown"] ?? DEVICE_HEALTH.unknown;
}

function TypeIcon({ type }: { type?: DeviceType }) {
  switch (type) {
    case "nvr":
      return <Server className="h-5 w-5" />;
    case "camera":
      return <CameraIcon className="h-5 w-5" />;
    case "cloud":
      return <HardDrive className="h-5 w-5" />;
    default:
      return <Video className="h-5 w-5" />;
  }
}

export default function VideoDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [form, setForm] = useState<DeviceForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [busy, setBusy] = useState<Record<string, "test" | "sync" | undefined>>({});
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [gatewayTarget, setGatewayTarget] = useState<Device | null>(null);
  const [relaySites, setRelaySites] = useState<RelaySite[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const list = await videoService.devices();
      setDevices(Array.isArray(list) ? list : []);
    } catch (e) {
      toast.error((e as Error)?.message || "No se pudieron cargar los dispositivos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    videoService.relaySites().then(setRelaySites).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    setForm(deviceToForm(d));
    setDialogOpen(true);
  };

  const set = <K extends keyof DeviceForm>(k: K, v: DeviceForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const buildPayload = () => {
    const num = (s: string, fb: number | null) => {
      const n = parseInt(s, 10);
      return Number.isFinite(n) ? n : fb;
    };
    const payload: Partial<Device> & { password?: string } = {
      name: form.name.trim(),
      type: form.type,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      host: form.host.trim() || null,
      port: num(form.port, 554),
      httpPort: num(form.httpPort, 80),
      username: form.username.trim() || null,
      channels: num(form.channels, 1),
      protocol: form.protocol,
      postSiteId: form.postSiteId.trim() || null,
      stationId: form.stationId.trim() || null,
      notes: form.notes.trim() || null,
      connectionMode: form.connectionMode,
      relaySiteId: form.connectionMode === "relay" ? form.relaySiteId || null : null,
    };
    // Only send password when provided (never overwrite with empty on edit).
    if (form.password) payload.password = form.password;
    return payload;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await videoService.updateDevice(editing.id, buildPayload());
        toast.success("Dispositivo actualizado");
      } else {
        await videoService.createDevice(buildPayload());
        toast.success("Dispositivo agregado");
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast.error((err as Error)?.message || "No se pudo guardar el dispositivo");
    } finally {
      setSaving(false);
    }
  };

  const onTest = async (d: Device) => {
    setBusy((b) => ({ ...b, [d.id]: "test" }));
    try {
      const res = await videoService.testDevice(d.id) as { status?: string; message?: string };
      const status = (res?.status as DeviceStatus) ?? "unknown";
      const message = res?.message as string | undefined;
      setDevices((prev) =>
        prev.map((x) =>
          x.id === d.id
            ? { ...x, status, lastSeenAt: status === "online" ? new Date().toISOString() : x.lastSeenAt }
            : x
        )
      );
      if (status === "online") toast.success(`${d.name}: stream OK`);
      else if (status === "auth_failed") toast.error(`${d.name}: ${message || "credenciales incorrectas"}`, { duration: 9000 });
      else if (status === "unreachable") toast.error(`${d.name}: ${message || "no se pudo leer el stream"}`, { duration: 9000 });
      else if (status === "offline") toast.error(`${d.name}: ${message || "sin conexión"}`);
      else toast(`${d.name}: estado desconocido`);
    } catch (e) {
      toast.error((e as Error)?.message || "Falló la prueba de conexión");
    } finally {
      setBusy((b) => ({ ...b, [d.id]: undefined }));
    }
  };

  const onSync = async (d: Device) => {
    setBusy((b) => ({ ...b, [d.id]: "sync" }));
    try {
      const cams = await videoService.syncCameras(d.id);
      const n = Array.isArray(cams) ? cams.length : 0;
      toast.success(`${d.name}: ${n} cámara(s) sincronizada(s)`);
    } catch (e) {
      toast.error((e as Error)?.message || "No se pudieron sincronizar las cámaras");
    } finally {
      setBusy((b) => ({ ...b, [d.id]: undefined }));
    }
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await videoService.deleteDevice(deleteTarget.id);
      toast.success("Dispositivo eliminado");
      setDevices((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      toast.error((e as Error)?.message || "No se pudo eliminar el dispositivo");
    } finally {
      setDeleting(false);
    }
  };

  const counts = useMemo(() => {
    const c = { online: 0, offline: 0, unknown: 0 };
    for (const d of devices) {
      const s = (d.status as DeviceStatus) ?? "unknown";
      const key = s === "online" ? "online" : s === "offline" ? "offline" : "unknown";
      c[key] += 1;
    }
    return c;
  }, [devices]);

  return (
    <AppLayout>
      <PageContainer width="wide">
        {/* Header */}
        <PageHeader
          icon={<Video />}
          title="Dispositivos de video"
          subtitle="Conecta y administra tus DVR, NVR y cámaras de videovigilancia."
          actions={
            <>
              <Button asChild variant="outline">
                <Link to="/video/monitoring">Monitoreo</Link>
              </Button>
              <Button variant="brand" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                Agregar dispositivo
              </Button>
            </>
          }
        />

        {/* Summary */}
        <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={devices.length} icon={<Video />} accent="primary" />
          <StatCard label="En línea" value={counts.online} icon={<Wifi />} accent="ok" />
          <StatCard label="Sin conexión" value={counts.offline} icon={<WifiOff />} accent="bad" />
          <StatCard label="Desconocido" value={counts.unknown} icon={<Server />} accent="neutral" />
        </Stagger>

        {/* List */}
        {loading ? (
          <SkeletonCards count={4} />
        ) : devices.length === 0 ? (
          <EmptyState
            icon={<Video />}
            title="No hay dispositivos"
            description="Agrega tu primer DVR, NVR o cámara para comenzar la videovigilancia."
            action={
              <Button variant="brand" onClick={openCreate}>
                <Plus className="mr-1.5 h-4 w-4" />
                Agregar dispositivo
              </Button>
            }
          />
        ) : (
          <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {devices.map((d) => {
              const b = busy[d.id];
              return (
                /* `flat`: estas fichas se repiten en rejilla y el desenfoque de
                   `.glass` por ficha se paga en cada fotograma al desplazar. */
                <GlassPanel key={d.id} flat hover className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      {/* El tono del equipo y el de su píldora salen de la MISMA función: iban
                          por separado y un equipo con las credenciales caídas mostraba
                          la píldora en ámbar y el icono en el acento de marca. */}
                      <IconTile tone={healthTone(deviceHealth(d.status as DeviceStatus).health)}>
                        <TypeIcon type={d.type as DeviceType} />
                      </IconTile>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold">{d.name}</span>
                          {/* Chip de clasificación, no de estado: neutro y con la
                              misma pieza que usan las pantallas hermanas. */}
                          <StatusBadge tone="neutral" dot={false}>
                            {TYPE_LABELS[(d.type as DeviceType) ?? "dvr"]}
                          </StatusBadge>
                        </div>
                        <div className="mt-0.5 truncate text-sm text-muted-foreground">
                          {[d.brand, d.model].filter(Boolean).join(" · ") || "Sin marca/modelo"}
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                          {d.host || "—"}
                          {d.host ? `:${d.port ?? 554}` : ""}
                          {d.protocol ? ` · ${d.protocol.toUpperCase()}` : ""}
                          {d.channels != null ? ` · ${d.channels} canal(es)` : ""}
                        </div>
                      </div>
                    </div>
                    <DeviceStatusBadge {...deviceHealth(d.status as DeviceStatus)} />
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!b}
                      onClick={() => onTest(d)}
                    >
                      {b === "test" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wifi className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Probar conexión
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!b}
                      onClick={() => onSync(d)}
                    >
                      {b === "sync" ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Sincronizar cámaras
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setGatewayTarget(d)}>
                      <Server className="mr-1.5 h-3.5 w-3.5" />
                      Gateway
                    </Button>
                    <div className="ml-auto flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Editar"
                        onClick={() => openEdit(d)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Eliminar"
                        style={{ color: 'var(--bad-text)' }}
                        onClick={() => setDeleteTarget(d)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </GlassPanel>
              );
            })}
          </Stagger>
        )}
      </PageContainer>

      {/* Create / Edit modal (portaled via DialogContent) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar dispositivo" : "Agregar dispositivo"}
            </DialogTitle>
            <DialogDescription>
              Configura los datos de conexión del DVR/NVR o cámara.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="vd-name">Nombre *</Label>
                <Input
                  id="vd-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="DVR Recepción"
                  required
                />
              </div>

              {/* Connection: direct (same LAN) vs relay (remote site behind NAT) */}
              <div className={form.connectionMode === "relay" ? "" : "sm:col-span-2"}>
                <Label htmlFor="vd-conn">Conexión</Label>
                <Select value={form.connectionMode} onValueChange={(v) => set("connectionMode", v as "direct" | "relay")}>
                  <SelectTrigger id="vd-conn"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Directa (misma red / accesible)</SelectItem>
                    <SelectItem value="relay">Remota — vía relay (otra red/país)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.connectionMode === "relay" && (
                <div>
                  <Label htmlFor="vd-relay">Sitio relay</Label>
                  <Select value={form.relaySiteId} onValueChange={(v) => set("relaySiteId", v)}>
                    <SelectTrigger id="vd-relay"><SelectValue placeholder="Selecciona un sitio" /></SelectTrigger>
                    <SelectContent>
                      {relaySites.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.connectionMode === "relay" && (
                <p className="sm:col-span-2 -mt-2 text-xs text-muted-foreground">
                  La IP/host de abajo es la del DVR en la red local del sitio. El equipo relay instalado
                  en el sitio se encarga de enviar el video a C-Guard Pro.
                </p>
              )}

              <div>
                <Label htmlFor="vd-type">Tipo</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v as DeviceType)}>
                  <SelectTrigger id="vd-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="vd-protocol">Protocolo</Label>
                <Select
                  value={form.protocol}
                  onValueChange={(v) => set("protocol", v as DeviceProtocol)}
                >
                  <SelectTrigger id="vd-protocol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROTOCOL_OPTS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="vd-brand">Marca</Label>
                <Input
                  id="vd-brand"
                  value={form.brand}
                  onChange={(e) => set("brand", e.target.value)}
                  placeholder="Hikvision"
                />
              </div>

              <div>
                <Label htmlFor="vd-model">Modelo</Label>
                <Input
                  id="vd-model"
                  value={form.model}
                  onChange={(e) => set("model", e.target.value)}
                  placeholder="DS-7608NI"
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="vd-host">Host / IP</Label>
                <Input
                  id="vd-host"
                  value={form.host}
                  onChange={(e) => set("host", e.target.value)}
                  placeholder="192.168.1.100"
                />
              </div>

              <div>
                <Label htmlFor="vd-port">Puerto RTSP</Label>
                <Input
                  id="vd-port"
                  type="number"
                  value={form.port}
                  onChange={(e) => set("port", e.target.value)}
                  placeholder="554"
                />
              </div>

              <div>
                <Label htmlFor="vd-httpPort">Puerto HTTP</Label>
                <Input
                  id="vd-httpPort"
                  type="number"
                  value={form.httpPort}
                  onChange={(e) => set("httpPort", e.target.value)}
                  placeholder="80"
                />
              </div>

              <div>
                <Label htmlFor="vd-username">Usuario</Label>
                <Input
                  id="vd-username"
                  value={form.username}
                  onChange={(e) => set("username", e.target.value)}
                  autoComplete="off"
                  placeholder="admin"
                />
              </div>

              <div>
                <Label htmlFor="vd-password">Contraseña</Label>
                <Input
                  id="vd-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  autoComplete="new-password"
                  placeholder={editing ? "Dejar en blanco para conservar" : "••••••••"}
                />
              </div>

              <div>
                <Label htmlFor="vd-channels">Canales</Label>
                <Input
                  id="vd-channels"
                  type="number"
                  min={1}
                  value={form.channels}
                  onChange={(e) => set("channels", e.target.value)}
                  placeholder="8"
                />
              </div>

              <div className="hidden sm:block" />

              <div>
                <Label htmlFor="vd-postSite">Punto de servicio (opcional)</Label>
                <Input
                  id="vd-postSite"
                  value={form.postSiteId}
                  onChange={(e) => set("postSiteId", e.target.value)}
                  placeholder="ID del punto de servicio"
                />
              </div>

              <div>
                <Label htmlFor="vd-station">Estación (opcional)</Label>
                <Input
                  id="vd-station"
                  value={form.stationId}
                  onChange={(e) => set("stationId", e.target.value)}
                  placeholder="ID de la estación"
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="vd-notes">Notas</Label>
                <Textarea
                  id="vd-notes"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={2}
                  placeholder="Ubicación, observaciones..."
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="brand" disabled={saving}>
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {editing ? "Guardar cambios" : "Agregar dispositivo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar dispositivo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar{" "}
              <span className="font-semibold">{deleteTarget?.name}</span>? Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onDelete();
              }}
              disabled={deleting}
              className="cg-btn-bad"
            >
              {deleting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VideoGatewayModal
        device={gatewayTarget}
        open={!!gatewayTarget}
        onClose={() => setGatewayTarget(null)}
        onSaved={load}
      />
    </AppLayout>
  );
}
