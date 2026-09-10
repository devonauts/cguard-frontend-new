import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Video,
  Camera as CameraIcon,
  Scissors,
  AlertTriangle,
  Radio,
  ImageDown,
  RefreshCw,
  MonitorPlay,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  EmptyState,
  GlassPanel,
  SkeletonCards,
  StatusBadge,
  Toolbar,
} from "@/components/kit";
import { cn } from "@/lib/utils";
import {
  videoService,
  type Camera,
  type Device,
  type StreamInfo,
} from "@/lib/api/videoService";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import {
  TrimShareModal,
  CreateIncidentModal,
  DispatchModal,
} from "@/components/video/VideoActionModals";
import i18n from "@/i18n";

type ModalKind = "trim" | "incident" | "dispatch" | null;

/* ------------------------------------------------------------------ */
/* Status dot                                                          */
/* ------------------------------------------------------------------ */

/**
 * El punto de conexión. «En línea» LATE (`.cc-dot`): es lo que distingue de un
 * vistazo una cámara que está transmitiendo ahora de una que sólo está dada de
 * alta. El color es semántico fijo — una cámara caída sigue en rojo aunque la
 * empresa haya elegido rojo como color de marca.
 */
function StatusDot({ status }: { status?: string }) {
  const enLinea = status === "online";
  const tono = enLinea
    ? "var(--ok)"
    : status === "offline"
      ? "var(--bad)"
      : "var(--ink-faint)";
  const label = enLinea
    ? "En línea"
    : status === "offline"
      ? "Fuera de línea"
      : "Estado desconocido";

  return (
    <span aria-label={label} className="inline-flex items-center" title={label}>
      <span
        className={cn("h-2 w-2 rounded-full", enLinea && "cc-dot")}
        style={{ background: tono }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Camera tile                                                         */
/* ------------------------------------------------------------------ */

/**
 * Control flotante sobre el reproductor. Va arriba a la derecha a propósito: el
 * reproductor ya ocupa la esquina inferior derecha con el mando de giro y el
 * borde inferior con los controles nativos de reproducción.
 */
function TileButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      style={{ background: 'var(--glass-raised)', borderColor: 'var(--hairline)', color: 'var(--ink)' }}
      title={label}
      type="button"
      onClick={onClick}
      aria-label={label}
      /* SIN `cg-btn-glass`: lleva `backdrop-filter`, y aquí se instancian
         CUATRO por cámara ENCIMA de un <video> decodificando. Cada capa obliga
         al navegador a rasterizar el fotograma de vídeo que tiene detrás. El
         cluster ya se apoya en una superficie `--glass-sunken`, que es la que
         da el aspecto esmerilado; los botones sólo necesitan su propio filo. */
      className="cg-focus grid size-9 place-items-center rounded-full border transition-all duration-200 hover:-translate-y-0.5 sm:size-8"
    >
      {icon}
    </button>
  );
}

function CameraTile({
  camera,
  deviceName,
  onAction,
}: {
  camera: Camera;
  deviceName?: string;
  onAction: (kind: Exclude<ModalKind, null>, camera: Camera) => void;
}) {
  const videoElRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<StreamInfo | null>(null);

  const handleSnapshot = async () => {
    const video = videoElRef.current;

    // 1) Try to grab a frame from the live <video> element via canvas.
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        const canvas = document.createElement("canvas");

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");

        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

          downloadDataUrl(dataUrl, `snapshot-${slug(camera.name)}.jpg`);
          toast.success("Captura descargada");

          return;
        }
      } catch {
        // CORS-tainted canvas etc. — fall through to snapshot URL.
      }
    }
    // 2) Fall back to the configured snapshot URL.
    const snap = streamRef.current?.snapshotUrl || camera.snapshotUrl;

    if (snap && /^https?:\/\//i.test(snap)) {
      window.open(snap, "_blank", "noopener,noreferrer");
      toast.success(i18n.t("ui.VideoMonitoring.capturaAbiertaEnUnaPestana"));

      return;
    }
    toast.error(i18n.t("ui.VideoMonitoring.noHayCapturaDisponiblePara"));
  };

  return (
    /* `flat` obligatorio: son marcos que se repiten en una rejilla, y el
       desenfoque de `.glass` por tarjeta hunde el desplazamiento. */
    <GlassPanel flat className="group/tile flex flex-col overflow-hidden p-1.5">
      <div className="relative overflow-hidden rounded-[calc(var(--r-lg)-4px)]">
        <VideoPlayer
          camera={camera}
          videoRef={videoElRef}
          onStream={(info) => {
            streamRef.current = info;
          }}
        />

        {/* Controles flotantes de cristal. Visibles siempre en táctil (donde no
            hay puntero) y al acercarse o tabular en escritorio. */}
        <div
          className="absolute right-2 top-2 z-30 flex items-center gap-1.5 rounded-full p-1 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover/tile:opacity-100 sm:group-focus-within/tile:opacity-100"
          style={{ background: "var(--glass-sunken)" }}
        >
          <TileButton
            icon={<Scissors className="size-3.5" />}
            label="Recortar y compartir"
            onClick={() => onAction("trim", camera)}
          />
          <TileButton
            icon={<AlertTriangle className="size-3.5" />}
            label={i18n.t("comun.crearIncidente")}
            onClick={() => onAction("incident", camera)}
          />
          <TileButton
            icon={<Radio className="size-3.5" />}
            label="Despachar"
            onClick={() => onAction("dispatch", camera)}
          />
          <TileButton
            icon={<ImageDown className="size-3.5" />}
            label="Capturar imagen"
            onClick={handleSnapshot}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-2.5 py-2.5">
        <StatusDot status={camera.status} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-tight">
            {camera.name || `Cámara ${camera.channel ?? ""}`}
          </h3>
          {deviceName ? (
            <p
              className="mt-0.5 truncate text-xs"
              style={{ color: "var(--ink-faint)" }}
            >
              {deviceName}
              {camera.channel ? ` · Canal ${camera.channel}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </GlassPanel>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function slug(name?: string | null): string {
  return (name || "camara")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");

  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const selectClass = "cg-input cg-focus h-9 w-full px-3 text-sm sm:w-56";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function VideoMonitoring() {
  const { t } = useTranslation();
  const [cameras, setCameras] = React.useState<Camera[]>([]);
  const [devices, setDevices] = React.useState<Device[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [deviceFilter, setDeviceFilter] = React.useState<string>("");
  const [siteFilter, setSiteFilter] = React.useState<string>("");

  const [modal, setModal] = React.useState<ModalKind>(null);
  const [activeCamera, setActiveCamera] = React.useState<Camera | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cams, devs] = await Promise.all([
        videoService.cameras(),
        videoService.devices().catch(() => [] as Device[]),
      ]);

      setCameras(Array.isArray(cams) ? cams : []);
      setDevices(Array.isArray(devs) ? devs : []);
    } catch (e) {
      const err = e as { data?: { message?: string }; message?: string };

      setError(
        err?.data?.message ||
          err?.message ||
          "No se pudieron cargar las cámaras",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const deviceName = React.useCallback(
    (id?: string | null) => {
      if (!id) return undefined;
      const d = devices.find((x) => x.id === id);

      return d?.name;
    },
    [devices],
  );

  // Distinct post-site ids present among cameras (for the site filter).
  const siteOptions = React.useMemo(() => {
    const set = new Set<string>();

    for (const c of cameras) if (c.postSiteId) set.add(c.postSiteId);

    return Array.from(set);
  }, [cameras]);

  const visible = React.useMemo(() => {
    return cameras
      .filter((c) => c.enabled !== false)
      .filter((c) => (deviceFilter ? c.videoDeviceId === deviceFilter : true))
      .filter((c) => (siteFilter ? c.postSiteId === siteFilter : true));
  }, [cameras, deviceFilter, siteFilter]);

  const enLinea = React.useMemo(
    () => visible.filter((c) => c.status === "online").length,
    [visible],
  );

  const openAction = (kind: Exclude<ModalKind, null>, camera: Camera) => {
    setActiveCamera(camera);
    setModal(kind);
  };
  const closeModal = () => setModal(null);

  return (
    <AppLayout>
      <PageContainer className="max-w-[1600px]" width="wide">
        {/* Header */}
        <PageHeader
          actions={
            <Button disabled={loading} variant="outline" onClick={load}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} />
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
          }
          badges={
            loading ? null : enLinea > 0 ? (
              /* Misma píldora que el kit ya calcula; estaba pintada a mano sólo
                 en esta rama y con `StatusBadge` en la contraria. */
              <StatusBadge tone="ok">
                {enLinea === 1
                  ? "1 cámara transmitiendo"
                  : `${enLinea} cámaras transmitiendo`}
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral">
                {t(
                  "ui.VideoMonitoring.ningunaCamaraTransmitiendo",
                  "Ninguna cámara transmitiendo",
                )}
              </StatusBadge>
            )
          }
          icon={<MonitorPlay />}
          subtitle={t("ui.VideoMonitoring.vigilanciaEnVivoDeTodas")}
          title={t("ui.VideoMonitoring.monitoreoDeVideo", "Monitoreo de video")}
        />

        {/* Filtros */}
        <Toolbar>
          <select
            aria-label={t("ui.VideoMonitoring.filtrarPorEquipoGrabador")}
            className={selectClass}
            value={deviceFilter}
            onChange={(e) => setDeviceFilter(e.target.value)}
          >
            <option value="">{t("ui.VideoMonitoring.todosLosEquipos")}</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          {siteOptions.length > 0 ? (
            <select
              aria-label={t("ui.VideoMonitoring.filtrarPorPuesto")}
              className={selectClass}
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
            >
              <option value="">
                {t("ui.VideoMonitoring.todosLosPuestos")}
              </option>
              {siteOptions.map((s) => (
                <option key={s} value={s}>
                  Puesto {s.slice(0, 8)}
                </option>
              ))}
            </select>
          ) : null}

          {!loading && !error && visible.length > 0 ? (
            <span
              className="ml-auto flex items-center gap-1.5 pr-2 text-xs"
              style={{ color: "var(--ink-faint)" }}
            >
              <Video className="size-3.5" />
              {visible.length} cámara{visible.length === 1 ? "" : "s"} en vista
            </span>
          ) : null}
        </Toolbar>

        {/* Body */}
        {loading ? (
          <SkeletonCards className="md:grid-cols-2 xl:grid-cols-3" count={6} />
        ) : error ? (
          <EmptyState
            action={
              <Button variant="brand" onClick={load}>
                <RefreshCw className="size-4" />
                Reintentar
              </Button>
            }
            description={error}
            icon={<AlertTriangle />}
            title={t(
              "ui.VideoMonitoring.noSePudieronCargarLas",
              "No se pudieron cargar las cámaras",
            )}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            description={
              cameras.length === 0
                ? "Agrega un dispositivo y sincroniza sus cámaras para comenzar."
                : "Ajusta los filtros para ver más cámaras."
            }
            icon={<CameraIcon />}
            title={
              cameras.length === 0
                ? t(
                    "video.monitoring.empty.noCameras",
                    "Aún no hay cámaras configuradas",
                  )
                : t(
                    "video.monitoring.empty.noMatches",
                    "Ninguna cámara coincide con los filtros",
                  )
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((camera) => (
              <CameraTile
                key={camera.id}
                camera={camera}
                deviceName={deviceName(camera.videoDeviceId)}
                onAction={openAction}
              />
            ))}
          </div>
        )}
      </PageContainer>

      {/* Action modals */}
      <TrimShareModal
        camera={activeCamera}
        open={modal === "trim"}
        onClose={closeModal}
      />
      <CreateIncidentModal
        camera={activeCamera}
        open={modal === "incident"}
        onClose={closeModal}
      />
      <DispatchModal
        camera={activeCamera}
        open={modal === "dispatch"}
        onClose={closeModal}
      />
    </AppLayout>
  );
}
