import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2,
  VideoOff,
  WifiOff,
  PlayCircle,
  AlertTriangle,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Move,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  videoService,
  type Camera,
  type StreamInfo,
} from "@/lib/api/videoService";
import i18n from "@/i18n";

/* ── COLOR EN UN REPRODUCTOR DE VIDEO ────────────────────────────────
   Aquí el blanco NO se sustituye por tokens y es correcto que se quede:
   todo lo que dibujamos va ENCIMA de la imagen de una cámara o de un velo
   negro sobre ella. Ese lienzo es el mismo en tema claro y en oscuro (un
   vídeo no cambia de color con las preferencias del CRM), así que la tinta
   legible es blanca en los dos casos, y un token acromático —que SÍ se
   invierte con el tema— pondría texto negro sobre una escena nocturna.

   Lo que sí sale de los tokens es lo que significa algo: el acento de los
   estados de carga (`--brand`) y los semáforos de transporte/estado
   (`--ok`, `--warn`), que antes eran esmeralda y ámbar de Tailwind sueltos.
   ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* hls.js — the player engine. We deliberately run it BUFFERED (not    */
/* low-latency): a few seconds of buffer-ahead absorbs network jitter  */
/* so the picture never shows the "loading" spinner, the same way      */
/* YouTube/Twitch live do. (go2rtc MSE ran ~0 buffer → constant rebuf.)*/
/* ------------------------------------------------------------------ */
const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js";
const HLS_SRI =
  "sha384-R2JqybiEexSXz60H6Zz28MdsqWWnMQlP+NDb7nIhDHWxx6sM7Otw7OWCq9EBCPsz";
let hlsLoaderPromise: Promise<any> | null = null;

function loadHlsJs(): Promise<any> {
  if (typeof window !== "undefined" && (window as any).Hls)
    return Promise.resolve((window as any).Hls);
  if (hlsLoaderPromise) return hlsLoaderPromise;
  hlsLoaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-hls-loader]",
    );

    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).Hls));
      existing.addEventListener("error", () =>
        reject(new Error("hls.js failed")),
      );
      if ((window as any).Hls) resolve((window as any).Hls);

      return;
    }
    const s = document.createElement("script");

    s.src = HLS_CDN;
    s.async = true;
    s.integrity = HLS_SRI;
    s.crossOrigin = "anonymous";
    s.referrerPolicy = "no-referrer";
    s.dataset.hlsLoader = "true";
    s.onload = () =>
      (window as any).Hls
        ? resolve((window as any).Hls)
        : reject(new Error("Hls missing"));
    s.onerror = () => {
      hlsLoaderPromise = null;
      reject(new Error("hls.js failed"));
    };
    document.head.appendChild(s);
  });

  return hlsLoaderPromise;
}

// Buffered live tuning — the heart of "no spinner". ~6–8s of buffer-ahead.
const hlsConfig = (Hls: any) => ({
  enableWorker: true,
  lowLatencyMode: false,
  liveSyncDurationCount: 3, // stay ~3 segments behind the live edge
  liveMaxLatencyDurationCount: 12, // tolerate drift before seeking forward
  maxBufferLength: 20, // buffer up to 20s ahead
  maxMaxBufferLength: 40,
  backBufferLength: 15,
  // Be patient + persistent on a flaky/remote link instead of erroring out.
  manifestLoadingMaxRetry: 8,
  manifestLoadingRetryDelay: 800,
  manifestLoadingMaxRetryTimeout: 16000,
  levelLoadingMaxRetry: 8,
  levelLoadingRetryDelay: 800,
  fragLoadingMaxRetry: 12,
  fragLoadingRetryDelay: 800,
  fragLoadingMaxRetryTimeout: 16000,
  ...(Hls ? {} : {}),
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * When to re-fetch the stream info so the playback token never runs out.
 * The backend signs `url`/`webrtcUrl` with a ≤10-minute token that the media
 * server checks only when a session STARTS (an open HLS/WebRTC session keeps
 * playing), but every reconnect — HLS re-attach, WebRTC upgrade, fallback from
 * WebRTC to HLS — starts a new session and needs a valid one. Refresh at ~75%
 * of the lifetime, never sooner than 20 s.
 */
function tokenRefreshDelayMs(info: StreamInfo | null): number | null {
  if (!info?.tokenExpiresAt) return null;
  const exp = Date.parse(info.tokenExpiresAt);

  if (!Number.isFinite(exp)) return null;
  const ttlMs = info.tokenTtlSec ? info.tokenTtlSec * 1000 : exp - Date.now();
  const at = exp - Math.max(30_000, ttlMs * 0.25);

  return Math.max(20_000, at - Date.now());
}

/* ------------------------------------------------------------------ */
/* WebRTC (WHEP) — sub-second latency on the LAN. We POST an SDP offer  */
/* to MediaMTX's WHEP endpoint and pipe the returned track into the     */
/* <video>. If it can't establish (remote / cold stream), the caller    */
/* falls back to buffered HLS.                                          */
/* ------------------------------------------------------------------ */
async function whepConnect(
  whepUrl: string,
): Promise<{ pc: RTCPeerConnection; stream: MediaStream } | null> {
  const pc = new RTCPeerConnection({ iceServers: [] }); // LAN: host candidates, no STUN/TURN

  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });
  const ms = new MediaStream();

  pc.ontrack = (e) => ms.addTrack(e.track); // attach to <video> only once connected (don't fight HLS)
  await pc.setLocalDescription(await pc.createOffer());
  // non-trickle: wait for ICE gathering (LAN host candidates are near-instant)
  await new Promise<void>((res) => {
    if (pc.iceGatheringState === "complete") return res();
    const t = setTimeout(res, 1200);

    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(t);
        res();
      }
    });
  });
  const r = await fetch(whepUrl, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: pc.localDescription?.sdp || "",
  });

  if (!r.ok) {
    pc.close();

    return null;
  }
  await pc.setRemoteDescription({ type: "answer", sdp: await r.text() });

  return { pc, stream: ms };
}
function waitConnected(
  pc: RTCPeerConnection,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((res) => {
    if (pc.connectionState === "connected") return res(true);
    const t = setTimeout(() => res(false), timeoutMs);

    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected") {
        clearTimeout(t);
        res(true);
      } else if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        clearTimeout(t);
        res(false);
      }
    });
  });
}

type PlayerState = "loading" | "ready" | "none" | "offline" | "error";

export type VideoPlayerProps = {
  camera: Camera;
  className?: string;
  autoPlay?: boolean;
  ptz?: boolean;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onStream?: (info: StreamInfo | null) => void;
};

export function VideoPlayer({
  camera,
  className,
  autoPlay = true,
  ptz = true,
  videoRef,
  onStream,
}: VideoPlayerProps) {
  const { t } = useTranslation();
  const videoElRef = React.useRef<HTMLVideoElement | null>(null);
  const hlsRef = React.useRef<any>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const recoverRef = React.useRef(0);
  // Current (token-bearing) URLs. Refreshed in place before the token expires,
  // WITHOUT touching `stream` state — that would tear down a playing video.
  const urlRef = React.useRef<string | null>(null);
  const webrtcUrlRef = React.useRef<string | null>(null);
  const netRetryRef = React.useRef(0);
  const [transport, setTransport] = React.useState<"webrtc" | "hls" | null>(
    null,
  );

  const [state, setState] = React.useState<PlayerState>("loading");
  const [stream, setStream] = React.useState<StreamInfo | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const setVideoEl = React.useCallback(
    (el: HTMLVideoElement | null) => {
      videoElRef.current = el;
      if (videoRef) videoRef.current = el;
    },
    [videoRef],
  );

  const cameraOffline = camera.status === "offline";

  // 1) Resolve stream info → an HLS url (go2rtc serves go2rtc HLS; manual streamUrl works too).
  React.useEffect(() => {
    let cancelled = false;

    if (cameraOffline) {
      setState("offline");
      setStream(null);
      onStream?.(null);

      return;
    }
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = (info: StreamInfo | null) => {
      const ms = tokenRefreshDelayMs(info);

      if (ms === null) return;
      refreshTimer = setTimeout(() => {
        videoService
          .stream(camera.id)
          .then((fresh) => {
            if (cancelled) return;
            if (fresh?.url) urlRef.current = fresh.url;
            webrtcUrlRef.current = fresh?.webrtcUrl || null;
            scheduleRefresh(fresh);
          })
          .catch(() => {
            // Keep playing on the open session; try again shortly.
            if (!cancelled)
              scheduleRefresh({
                ...(info as StreamInfo),
                tokenExpiresAt: new Date(Date.now() + 90_000).toISOString(),
                tokenTtlSec: 120,
              });
          });
      }, ms);
    };

    setState("loading");
    setErrorMsg(null);
    videoService
      .stream(camera.id)
      .then((info) => {
        if (cancelled) return;
        urlRef.current = info?.url || null;
        webrtcUrlRef.current = info?.webrtcUrl || null;
        scheduleRefresh(info);
        setStream(info);
        onStream?.(info);
        setState(!info || info.type === "none" || !info.url ? "none" : "ready");
      })
      .catch((e: any) => {
        if (cancelled) return;
        if (camera.streamUrl) {
          const fb: StreamInfo = { type: "hls", url: camera.streamUrl };

          urlRef.current = fb.url;
          webrtcUrlRef.current = null;
          setStream(fb);
          onStream?.(fb);
          setState("ready");

          return;
        }
        setStream(null);
        onStream?.(null);
        setErrorMsg(
          e?.data?.message ||
            e?.message ||
            t(
              "ui.VideoPlayer.noSePudoObtenerLaTransmision",
              "No se pudo obtener la transmisión",
            ),
        );
        setState("error");
      });

    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [camera.id, camera.status, reloadKey]);

  // 2) Play: try WebRTC (sub-second on LAN) first, fall back to buffered HLS.
  React.useEffect(() => {
    if (state !== "ready" || !stream?.url) return;
    // Always read the latest token-bearing URL at (re)connect time.
    const initialUrl = stream.url;
    const currentUrl = () => urlRef.current || initialUrl;
    const video = videoElRef.current;

    if (!video) return;
    let cancelled = false;

    recoverRef.current = 0;
    netRetryRef.current = 0;
    const onErr = (m: string) => {
      if (!cancelled) {
        setErrorMsg(m);
        setState("error");
      }
    };
    const destroyHls = () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {
          /* */
        }
        hlsRef.current = null;
      }
    };
    const destroyPc = () => {
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          /* */
        }
        pcRef.current = null;
      }
    };

    destroyHls();
    destroyPc();

    const startHls = () => {
      if (cancelled) return;
      setTransport("hls");
      try {
        video.srcObject = null;
      } catch {
        /* */
      }
      // Safari / iOS — native buffered HLS.
      if (video.canPlayType("application/vnd.apple.mpegurl") !== "") {
        video.src = currentUrl();
        if (autoPlay) video.play().catch(() => {});

        return;
      }
      loadHlsJs()
        .then((Hls) => {
          if (cancelled || videoElRef.current !== video) return;
          if (!Hls.isSupported()) {
            onErr(
              t("ui.VideoPlayer.hlsNoSoportado", "Tu navegador no soporta HLS"),
            );

            return;
          }
          const attach = () => {
            const hls = new Hls(hlsConfig(Hls));

            hlsRef.current = hls;
            hls.loadSource(currentUrl());
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (autoPlay) video.play().catch(() => {});
            });
            hls.on(Hls.Events.ERROR, (_e: any, d: any) => {
              if (!d?.fatal) return; // non-fatal: hls.js self-heals (key to no-spinner)
              if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                // 401/403: the media server refused the session (token expired
                // or the HLS session was reaped). Retrying the same URLs cannot
                // succeed — re-attach from scratch with the freshest token.
                const code = Number(d?.response?.code) || 0;

                if ((code === 401 || code === 403) && recoverRef.current < 4) {
                  recoverRef.current++;
                  destroyHls();
                  setTimeout(() => {
                    if (!cancelled) attach();
                  }, 1000);

                  return;
                }
                // The on-demand stream needs ~20s to warm (ffmpeg pulling the camera RTSP),
                // so the manifest legitimately 500s at first. Retry a FEW times WITH a delay
                // (no tight hammer loop). If it keeps failing, the camera source is
                // unreachable — stop retrying and show the offline overlay instead of
                // spamming the endpoint with 500s forever.
                if (netRetryRef.current < 8) {
                  netRetryRef.current++;
                  setTimeout(() => {
                    if (!cancelled) {
                      try {
                        hls.startLoad();
                      } catch {
                        /* */
                      }
                    }
                  }, 3000);
                } else {
                  destroyHls();
                  if (!cancelled) {
                    setStream(null);
                    setState("offline");
                  }
                }

                return;
              }
              if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                try {
                  hls.recoverMediaError();
                } catch {
                  /* */
                }

                return;
              }
              if (recoverRef.current < 4) {
                recoverRef.current++;
                destroyHls();
                setTimeout(() => {
                  if (!cancelled) attach();
                }, 1500);
              } else
                onErr(
                  t(
                    "ui.VideoPlayer.noSePudoReproducirLaTransmision",
                    "No se pudo reproducir la transmisión",
                  ),
                );
            });
          };

          attach();
        })
        .catch(() =>
          onErr(
            t(
              "ui.VideoPlayer.noSePudoCargarElReproductor",
              "No se pudo cargar el reproductor de video",
            ),
          ),
        );
    };

    // Start HLS right away (reliable, and it wakes/warms the on-demand stream). Then try
    // to UPGRADE to WebRTC against the now-warm stream; on success, switch the <video> to
    // WebRTC (sub-second) and tear HLS down. On failure, we simply stay on HLS.
    startHls();

    const upgradeToWebRTC = async () => {
      if (!webrtcUrlRef.current || typeof RTCPeerConnection === "undefined")
        return;
      for (let attempt = 0; attempt < 3 && !cancelled; attempt++) {
        await delay(attempt === 0 ? 2000 : 2500); // let HLS warm the stream first
        if (cancelled) return;
        try {
          const whepUrl = webrtcUrlRef.current;

          if (!whepUrl) return;
          const res = await whepConnect(whepUrl);

          if (cancelled || !res) {
            res?.pc.close();
            continue;
          }
          pcRef.current = res.pc;
          if (await waitConnected(res.pc, 5000)) {
            if (cancelled) {
              destroyPc();

              return;
            }
            destroyHls(); // switch off HLS
            try {
              video.srcObject = res.stream;
            } catch {
              /* */
            }
            if (autoPlay) video.play().catch(() => {});
            setTransport("webrtc");
            res.pc.addEventListener("connectionstatechange", () => {
              if (
                !cancelled &&
                (res.pc.connectionState === "failed" ||
                  res.pc.connectionState === "disconnected")
              ) {
                destroyPc();
                try {
                  video.srcObject = null;
                } catch {
                  /* */
                }
                startHls(); // drop back to HLS
              }
            });

            return; // upgraded
          }
          destroyPc();
        } catch {
          destroyPc();
        }
      }
    };

    upgradeToWebRTC();

    return () => {
      cancelled = true;
      destroyHls();
      destroyPc();
    };
  }, [state, stream?.url, stream?.webrtcUrl, autoPlay]);

  React.useEffect(
    () => () => {
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {
          /* */
        }
      }
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch {
          /* */
        }
      }
    },
    [],
  );

  const reload = () => setReloadKey((k) => k + 1);
  const snapshot = stream?.snapshotUrl || camera.snapshotUrl || undefined;

  return (
    <div
      className={cn(
        "group relative aspect-video w-full overflow-hidden rounded-lg bg-black",
        className,
      )}
    >
      {state === "ready" ? (
        <video
          ref={setVideoEl}
          controls
          muted
          playsInline
          autoPlay={autoPlay}
          className="h-full w-full bg-black object-contain"
          poster={snapshot}
        />
      ) : null}

      {state === "ready" && transport ? (
        <div className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">
          {/* En vivo = `--ok`, diferido = `--warn`. Semánticos fijos: no siguen al
              acento, porque «hay latencia» significa lo mismo con cualquier tono. */}
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: transport === "webrtc" ? "var(--ok)" : "var(--warn)",
            }}
          />
          {transport === "webrtc"
            ? t("ui.VideoPlayer.enVivo", "EN VIVO")
            : "HLS"}
        </div>
      ) : null}

      {state === "ready" && ptz ? <PtzPad cameraId={camera.id} /> : null}

      {state === "loading" ? (
        <Overlay>
          <Loader2
            className="size-7 animate-spin"
            style={{ color: "var(--brand)" }}
          />
          <p className="text-sm text-white/70">
            {t("ui.VideoPlayer.conectando", "Conectando…")}
          </p>
        </Overlay>
      ) : null}
      {state === "offline" ? (
        <Overlay snapshot={snapshot}>
          <WifiOff className="size-8 text-white/60" />
          <p className="text-sm font-medium text-white/80">
            {t("ui.VideoPlayer.camaraFueraDeLinea", "Cámara fuera de línea")}
          </p>
          <RetryButton onClick={reload} />
        </Overlay>
      ) : null}
      {state === "none" ? (
        <Overlay snapshot={snapshot}>
          <VideoOff className="size-8" style={{ color: "var(--brand)" }} />
          <p className="text-sm font-medium text-white/85">
            {t(
              "ui.VideoPlayer.sinTransmisionConfigurada",
              "Sin transmisión configurada",
            )}
          </p>
        </Overlay>
      ) : null}
      {state === "error" ? (
        <Overlay snapshot={snapshot}>
          <AlertTriangle className="size-8" style={{ color: "var(--warn)" }} />
          <p className="text-sm font-medium text-white/85">
            {errorMsg ||
              t("ui.VideoPlayer.errorDeTransmision", "Error de transmisión")}
          </p>
          <RetryButton onClick={reload} />
        </Overlay>
      ) : null}
    </div>
  );
}

/* ----------------------------- PTZ joystick ----------------------------- */
function PtzPad({ cameraId }: { cameraId: string }) {
  const [open, setOpen] = React.useState(false);
  const moving = React.useRef(false);
  const start =
    (v: { pan?: number; tilt?: number; zoom?: number }) =>
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      moving.current = true;
      videoService.ptz(cameraId, v).catch(() => {});
    };
  const stop = () => {
    if (!moving.current) return;
    moving.current = false;
    videoService.ptz(cameraId, { stop: true }).catch(() => {});
  };
  const S = 0.7;
  // Reposo: velo negro + tinta blanca, porque va sobre la imagen de la cámara.
  // Pulsado: relleno de marca con `--brand-ink` encima — el mismo par que usa
  // cualquier botón del sistema, así que sigue al acento que elija el usuario.
  const dirBtn = (icon: React.ReactNode, v: any, cls: string) => (
    <button
      className={cn(
        "grid place-items-center rounded-md bg-black/55 text-white/90 backdrop-blur transition-colors",
        "hover:bg-[var(--brand)] hover:text-[var(--brand-ink)] active:bg-[var(--brand)] active:text-[var(--brand-ink)]",
        cls,
      )}
      onPointerCancel={stop}
      onPointerDown={start(v)}
      onPointerLeave={stop}
      onPointerUp={stop}
    >
      {icon}
    </button>
  );

  if (!open) {
    return (
      <button
        className="absolute bottom-2 right-2 z-20 grid h-9 w-9 place-items-center rounded-lg bg-black/55 text-white/85 opacity-100 backdrop-blur transition-opacity hover:bg-black/75 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        title={i18n.t("ui.VideoPlayer.controlPtz", "Control PTZ")}
        onClick={() => setOpen(true)}
      >
        <Move size={15} />
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-2 right-2 z-20 flex items-end gap-2"
      onPointerLeave={stop}
    >
      <div className="flex flex-col gap-1">
        {dirBtn(<Plus size={14} />, { zoom: S }, "h-7 w-7")}
        {dirBtn(<Minus size={14} />, { zoom: -S }, "h-7 w-7")}
      </div>
      <div className="grid grid-cols-3 grid-rows-3 gap-1">
        <span />
        {dirBtn(<ChevronUp size={16} />, { tilt: S }, "h-7 w-7")}
        <span />
        {dirBtn(<ChevronLeft size={16} />, { pan: -S }, "h-7 w-7")}
        <button
          className="grid h-7 w-7 place-items-center rounded-md bg-black/40 text-white/50 hover:text-white"
          title={i18n.t("actions.close")}
          onClick={() => setOpen(false)}
        >
          <Move size={13} />
        </button>
        {dirBtn(<ChevronRight size={16} />, { pan: S }, "h-7 w-7")}
        <span />
        {dirBtn(<ChevronDown size={16} />, { tilt: -S }, "h-7 w-7")}
        <span />
      </div>
    </div>
  );
}

/* ----------------------------- internals ----------------------------- */
function Overlay({
  children,
  snapshot,
}: {
  children: React.ReactNode;
  snapshot?: string;
}) {
  return (
    <div className="absolute inset-0">
      {snapshot ? (
        <>
          <img
            alt=""
            className="h-full w-full object-cover opacity-40"
            src={snapshot}
            onError={(e) =>
              ((e.currentTarget as HTMLImageElement).style.display = "none")
            }
          />
          <div className="absolute inset-0 bg-black/40" />
        </>
      ) : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4">
        {children}
      </div>
    </div>
  );
}
function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/20"
      type="button"
      onClick={onClick}
    >
      <RefreshCw className="size-3.5" />{" "}
      {i18n.t("ui.VideoPlayer.reintentar", "Reintentar")}
    </button>
  );
}

export default VideoPlayer;
export { PlayCircle };
