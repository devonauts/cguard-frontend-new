/**
 * Persistent radio voice manager (singleton, outside React).
 *
 * The CRM mounts its layout per-page, so any widget inside it remounts on every
 * navigation. To keep the open radio channel ALIVE while the dispatcher works
 * elsewhere, the socket + audio live here at module scope — immune to React
 * remounts. The floating widget is just a thin subscriber. Toggling on/off (and
 * surviving a full reload) is persisted in localStorage.
 *
 * It joins the same tenant-wide channel (`rc-voice:<tenantId>`) the guards use,
 * so the dispatcher listens to every station/guard on one frequency.
 */
// SÓLO TIPOS. Se borran al compilar, así que este import no arrastra nada en
// tiempo de ejecución. La clase se carga bajo demanda en `doConnect` — ver ahí
// el porqué.
import type { VoiceChannel, VoiceMember, VoiceSpeaker, VoiceState } from "./voiceChannel";
import { getAuthToken } from "./api";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "";
const socketOrigin = () => {
  try {
    return new URL(API_URL || window.location.origin, window.location.origin).origin;
  } catch {
    return window.location.origin;
  }
};

const ON_KEY = "radioVoiceOn";

export type RadioVoiceSnapshot = {
  open: boolean; // is the widget panel showing (toggled from the header icon)
  on: boolean;
  state: VoiceState; // idle | connecting | connected | error
  joined: boolean;
  roster: VoiceMember[];
  speaker: VoiceSpeaker;
  talking: boolean;
  hint: string | null;
};

let vc: VoiceChannel | null = null;
let connectPending = false;
let joinTimer: any = null;
let selfId: string | undefined;
let gestureCleanup: (() => void) | null = null;

// Desktop browsers keep a listen-only AudioContext SUSPENDED until a user
// gesture — so incoming voice is scheduled silently. While the radio is on, we
// resume on ANY interaction anywhere in the CRM, guaranteeing audio unmutes as
// soon as the dispatcher clicks/taps/types. (Capacitor WebViews don't need this,
// which is why the guard app hears fine but the web didn't.)
function installGestureResume() {
  if (gestureCleanup || typeof window === "undefined") return;
  const h = () => { try { vc?.resume(); } catch { /* ignore */ } };
  const opts: any = { capture: true, passive: true };
  window.addEventListener("pointerdown", h, opts);
  window.addEventListener("touchstart", h, opts);
  window.addEventListener("keydown", h, opts);
  gestureCleanup = () => {
    window.removeEventListener("pointerdown", h, opts);
    window.removeEventListener("touchstart", h, opts);
    window.removeEventListener("keydown", h, opts);
    gestureCleanup = null;
  };
}

let snap: RadioVoiceSnapshot = {
  open: false,
  on: false,
  state: "idle",
  joined: false,
  roster: [],
  speaker: null,
  talking: false,
  hint: null,
};

const listeners = new Set<() => void>();
function emit() {
  snap = { ...snap };
  listeners.forEach((l) => { try { l(); } catch { /* ignore */ } });
}
function set(p: Partial<RadioVoiceSnapshot>) {
  Object.assign(snap, p);
  emit();
}

export function subscribeRadio(l: () => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export function getRadioSnapshot(): RadioVoiceSnapshot {
  return snap;
}

/** Tell the manager who "I" am (so the roster can mark the dispatcher). */
export function setRadioSelf(id?: string) {
  selfId = id;
}

/** Show/hide the floating widget panel (driven by the header radio icon). */
export function setWidgetOpen(open: boolean) {
  set({ open });
}
export function toggleWidget() {
  set({ open: !snap.open });
}

/**
 * Carga del SDK de voz BAJO DEMANDA.
 *
 * `header.tsx` importa este módulo para pintar el icono de radio, y la cabecera
 * está en todas las pantallas. Con un `import` estático de `./voiceChannel`, esa
 * cadena metía `livekit-client` —495 kB sin comprimir, 129 kB gzip— en el chunk
 * de entrada: TODO el mundo se lo descargaba, incluso quien sólo abre el login y
 * nunca enciende la radio.
 *
 * El `import()` de aquí abajo lo saca del arranque. El coste se paga una sola
 * vez, cuando el usuario enciende la radio de verdad, y para entonces ya está
 * autenticado y con la app cargada.
 *
 * `connectPending` evita la carrera: encender dos veces seguidas dejaría a dos
 * llamadas pasando el `if (vc)` antes de que ninguna haya asignado `vc`, y se
 * abrirían DOS conexiones al SFU.
 */
async function doConnect() {
  if (vc || connectPending) return;
  connectPending = true;
  set({ state: "connecting", hint: null });

  let VoiceChannelCtor: typeof import("./voiceChannel").VoiceChannel;
  try {
    ({ VoiceChannel: VoiceChannelCtor } = await import("./voiceChannel"));
  } catch {
    connectPending = false;
    set({ state: "error", hint: "No se pudo cargar el módulo de voz." });
    return;
  }
  connectPending = false;

  // El usuario pudo apagar la radio mientras se descargaba el módulo.
  if (!snap.on || vc) return;

  const tenantId = localStorage.getItem("tenantId") || "";
  const v = new VoiceChannelCtor();
  vc = v;
  v.connect(
    { url: socketOrigin(), path: "/api/socket.io", token: getAuthToken() || "", tenantId, selfId },
    {
      onState: (s) => set({ state: s }),
      onPresence: (r) => set({ roster: r }),
      onSpeaker: (sp) => set({ speaker: sp }),
      onError: (m) => set({ hint: m }),
    },
  );
  v.resume();
  installGestureResume();
  // Keep the snapshot's `joined` reconciled with the engine. The LiveKit engine
  // flips `joined` on the Connected event itself (connect == join), so the old
  // "connected && !joined → call join()" gate NEVER fired — the room was live but
  // the snapshot stayed joined:false, leaving the UI stuck on "Conectando…" with
  // PTT disabled. We reconcile both directions so a drop/reconnect re-syncs too.
  if (joinTimer) clearInterval(joinTimer);
  joinTimer = setInterval(async () => {
    if (!vc) { clearInterval(joinTimer); joinTimer = null; return; }
    if (vc.joined && !snap.joined) {
      try {
        const r = await vc.join(); // roster snapshot (LiveKit: connect already subscribed)
        set({ joined: true, roster: r.roster, speaker: r.speaker, hint: null });
      } catch {
        set({ joined: true, hint: null }); // joined; roster fills via presence events
      }
    } else if (!vc.joined && snap.joined) {
      set({ joined: false });
    }
  }, 400);
}

function doDisconnect() {
  // Si aún se está descargando el SDK, `doConnect` verá `snap.on === false` al
  // terminar y se retirará solo.
  connectPending = false;
  if (joinTimer) { clearInterval(joinTimer); joinTimer = null; }
  gestureCleanup?.();
  try { vc?.disconnect(); } catch { /* ignore */ }
  vc = null;
  set({ state: "idle", joined: false, roster: [], speaker: null, talking: false, hint: null });
}

/** Turn the radio on/off. Persists across reloads. */
export function setRadioOn(on: boolean) {
  try { localStorage.setItem(ON_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  if (on === snap.on && (on ? vc : !vc)) { set({ on }); return; }
  set({ on });
  if (on) doConnect();
  else doDisconnect();
}

/** Restore the on-state after a reload / first mount (best-effort). */
export function restoreRadio() {
  let was = false;
  try { was = localStorage.getItem(ON_KEY) === "1"; } catch { /* ignore */ }
  if (was && !snap.on) setRadioOn(true);
}

/** Resume audio playback within a user gesture (browser autoplay policy). */
export function radioResume() {
  try { vc?.resume(); } catch { /* ignore */ }
}

export async function radioStartTalk(): Promise<{ ok: boolean; busyWith?: string; error?: string }> {
  if (!vc) return { ok: false, error: "off" };
  try {
    const r = await vc.startTalk();
    if ((r as any)?.ok) set({ talking: true });
    return r as any;
  } catch (e: any) {
    return { ok: false, error: e?.message || "mic" };
  }
}
export function radioStopTalk() {
  try { vc?.stopTalk(); } catch { /* ignore */ }
  set({ talking: false });
}
