import * as React from "react";
import { useTranslation } from 'react-i18next';
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  X,
  Scissors,
  Share2,
  Copy,
  Check,
  AlertTriangle,
  Radio,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { videoService, type Camera } from "@/lib/api/videoService";

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

type ModalShellProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

function ModalShell({ open, onClose, title, icon, children, footer }: ModalShellProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Velo del diálogo: negro en los dos temas a propósito. Un token
          acromático se invertiría y en claro dejaría el modal sobre un gris
          pálido, sin separación del fondo. */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "oklch(0 0 0 / 0.55)" }}
        onClick={onClose}
      />
      <div className="glass-raised relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--hairline)" }}>
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 items-center justify-center rounded-lg border"
              style={{ background: "var(--brand-wash)", borderColor: "var(--brand-line)", color: "var(--brand-text)" }}
            >
              {icon}
            </span>
            <h2 className="font-display text-base font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cg-focus rounded-full p-1 transition-colors hover:bg-[var(--glass-sunken)]"
            style={{ color: "var(--ink-faint)" }}
            aria-label="Cerrar"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-5 py-4" style={{ borderColor: "var(--hairline)", background: "var(--glass-sunken)" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}

/**
 * Botón principal de estos modales. Antes se pintaba a mano con `#C8860A` y
 * tinta BLANCA encima: 2,25:1, ilegible (ver la medición en tokens.css). Ahora
 * es la variante `brand` del botón del sistema, que ya lleva `--brand` de
 * relleno y `--brand-ink` de tinta y sigue al acento configurado. Se conserva el
 * nombre porque lo usan una docena de sitios de este archivo.
 */
function GoldButton(
  props: React.ComponentProps<typeof Button> & { busy?: boolean }
) {
  const { busy, children, disabled, ...rest } = props;
  return (
    <Button
      {...rest}
      variant="brand"
      disabled={disabled || busy}
      className={cn(props.className)}
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </Button>
  );
}

/* Native select styled like the system field (kept native for portal safety) */
const selectClass =
  "cg-input cg-focus flex h-9 w-full px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/* default datetime-local value = local now (truncated to minutes) */
function localNow(offsetMinutes = 0): string {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/* ------------------------------------------------------------------ */
/* TrimShareModal                                                      */
/* ------------------------------------------------------------------ */

export type TrimShareModalProps = {
  camera?: Camera | null;
  open: boolean;
  onClose: () => void;
  onShared?: (result: { token: string; url: string; expiresAt: string }) => void;
};

export function TrimShareModal({
  camera,
  open,
  onClose,
  onShared,
}: TrimShareModalProps) {
  const [label, setLabel] = React.useState("");
  const [startAt, setStartAt] = React.useState(localNow(-2));
  const [endAt, setEndAt] = React.useState(localNow());
  const [busy, setBusy] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending "copied" reset timer on unmount.
  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (open) {
      setLabel("");
      setStartAt(localNow(-2));
      setEndAt(localNow());
      setShareUrl(null);
      setExpiresAt(null);
      setCopied(false);
      setBusy(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!camera?.id) {
      toast.error("No hay cámara seleccionada");
      return;
    }
    if (!startAt || !endAt) {
      toast.error("Indique inicio y fin del clip");
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      toast.error("El fin debe ser posterior al inicio");
      return;
    }
    setBusy(true);
    try {
      const clip = await videoService.createClip({
        videoCameraId: camera.id,
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        label: label || undefined,
      });
      const share = await videoService.shareClip(clip.id);
      setShareUrl(share.url);
      setExpiresAt(share.expiresAt);
      toast.success("Enlace para el cliente generado");
      onShared?.(share);
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "No se pudo generar el clip");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Enlace copiado");
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Recortar y compartir clip"
      icon={<Scissors className="size-4" />}
      footer={
        shareUrl ? (
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancelar
            </Button>
            <GoldButton busy={busy} onClick={handleCreate}>
              <Share2 className="size-4" />
              Generar enlace
            </GoldButton>
          </>
        )
      }
    >
      {camera?.name ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Cámara: <span className="font-medium text-foreground">{camera.name}</span>
        </p>
      ) : null}

      {!shareUrl ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="clip-label">Etiqueta</Label>
            <Input
              id="clip-label"
              placeholder="Ej. Incidente en acceso principal"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="clip-start">Inicio</Label>
              <Input
                id="clip-start"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clip-end">Fin</Label>
              <Input
                id="clip-end"
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className="flex items-start gap-2 rounded-lg border p-3"
            style={{ borderColor: "var(--brand-line)", background: "var(--brand-wash)" }}
          >
            <LinkIcon className="mt-0.5 size-4 shrink-0" style={{ color: "var(--brand-text)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                Enlace para el cliente
              </p>
              <p className="mt-0.5 break-all text-sm font-medium">{shareUrl}</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="size-4" style={{ color: "var(--ok-text)" }} />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? "Copiado" : "Copiar enlace"}
          </Button>
          {expiresAt ? (
            <p className="text-center text-xs text-muted-foreground">
              Expira el {new Date(expiresAt).toLocaleString("es")}
            </p>
          ) : null}
        </div>
      )}
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/* CreateIncidentModal                                                 */
/* ------------------------------------------------------------------ */

type Priority = "baja" | "media" | "alta" | "critica";

export type CreateIncidentModalProps = {
  camera?: Camera | null;
  clipId?: string;
  eventId?: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (incident: any) => void;
};

export function CreateIncidentModal({
  camera,
  clipId,
  eventId,
  open,
  onClose,
  onCreated,
}: CreateIncidentModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] = React.useState<Priority>("media");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setPriority("media");
      setBusy(false);
    }
  }, [open]);

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Indique un título para el incidente");
      return;
    }
    setBusy(true);
    const body = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      stationId: camera?.stationId || undefined,
      postSiteId: camera?.postSiteId || undefined,
    };
    try {
      let incident: any;
      if (clipId) {
        incident = await videoService.clipToIncident(clipId, body);
      } else if (eventId) {
        incident = await videoService.eventToIncident(eventId, body);
      } else if (camera?.id) {
        // No clip/event yet: create a manual event then convert it.
        const ev = await videoService.createEvent({
          videoCameraId: camera.id,
          videoDeviceId: camera.videoDeviceId || undefined,
          type: "manual",
          severity: priority === "critica" ? "critical" : priority === "alta" ? "high" : "medium",
          title: title.trim(),
          description: description.trim() || undefined,
          stationId: camera.stationId || undefined,
          postSiteId: camera.postSiteId || undefined,
        });
        incident = await videoService.eventToIncident(ev.id, body);
      } else {
        toast.error("No hay origen para crear el incidente");
        setBusy(false);
        return;
      }
      toast.success("Incidente creado");
      onCreated?.(incident);
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "No se pudo crear el incidente");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Crear incidente"
      icon={<AlertTriangle className="size-4" />}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <GoldButton busy={busy} onClick={handleCreate}>
            <AlertTriangle className="size-4" />
            Crear incidente
          </GoldButton>
        </>
      }
    >
      <div className="space-y-4">
        {camera?.name ? (
          <p className="text-sm text-muted-foreground">
            Origen:{" "}
            <span className="font-medium text-foreground">{camera.name}</span>
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="inc-title">{t("ui.VideoActionModals.titulo", "Título")}</Label>
          <Input
            id="inc-title"
            placeholder={t("ui.VideoActionModals.ejIntrusionDetectada", "Ej. Intrusión detectada")}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inc-desc">{t("ui.VideoActionModals.descripcion", "Descripción")}</Label>
          <Textarea
            id="inc-desc"
            rows={4}
            placeholder="Detalles del incidente…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inc-priority">Prioridad</Label>
          <select
            id="inc-priority"
            className={selectClass}
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="critica">{t("ui.VideoActionModals.critica", "Crítica")}</option>
          </select>
        </div>
      </div>
    </ModalShell>
  );
}

/* ------------------------------------------------------------------ */
/* DispatchModal                                                       */
/* ------------------------------------------------------------------ */

export type DispatchModalProps = {
  camera?: Camera | null;
  eventId?: string;
  open: boolean;
  onClose: () => void;
  onDispatched?: (result: any) => void;
};

export function DispatchModal({
  camera,
  eventId,
  open,
  onClose,
  onDispatched,
}: DispatchModalProps) {
  const { t } = useTranslation();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setNote("");
      setBusy(false);
    }
  }, [open]);

  const handleDispatch = async () => {
    setBusy(true);
    try {
      const result = await videoService.dispatch({
        cameraId: camera?.id,
        eventId,
        note: note.trim() || undefined,
      });
      toast.success("Supervisor notificado");
      onDispatched?.(result);
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || e?.message || "No se pudo despachar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={t("ui.VideoActionModals.despacharASupervision", "Despachar a supervisión")}
      icon={<Radio className="size-4" />}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <GoldButton busy={busy} onClick={handleDispatch}>
            <Radio className="size-4" />
            Notificar supervisor
          </GoldButton>
        </>
      }
    >
      <div className="space-y-4">
        {camera?.name ? (
          <p className="text-sm text-muted-foreground">
            Cámara:{" "}
            <span className="font-medium text-foreground">{camera.name}</span>
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="dispatch-note">Nota para el supervisor</Label>
          <Textarea
            id="dispatch-note"
            rows={4}
            placeholder={t("ui.VideoActionModals.describaLaSituacionQueRequiere", "Describa la situación que requiere atención…")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
    </ModalShell>
  );
}

export default {
  TrimShareModal,
  CreateIncidentModal,
  DispatchModal,
};
