/**
 * Radio "Canal abierto" — live PTT voice engine on LiveKit (WebRTC).
 *
 * Replaces the old socket.io + µ-law/ScriptProcessor relay with the self-hosted
 * LiveKit SFU (wss://livekit.cguardpro.com): Opus, encrypted (DTLS-SRTP),
 * jitter-buffered, with a coturn TURN fallback for locked-down networks. The
 * public interface (connect / join / startTalk / stopTalk / resume / disconnect
 * + callbacks) is UNCHANGED, so RadioContext and the UI keep working as-is.
 *
 * Push-to-talk: the mic track is DISABLED by default; startTalk() enables it
 * (publishes), stopTalk() disables it (mutes) — the guard only transmits while
 * holding. Everyone hears everyone; the UI shows the active speaker and blocks
 * the button while someone else is talking. Runs on the WebView's built-in
 * WebRTC + getUserMedia, so it needs NO permission beyond RECORD_AUDIO (already
 * granted) and rides the Phase-1 microphone foreground service for background.
 */
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  setLogLevel,
  type RemoteTrack,
  type Participant,
} from "livekit-client";

import { radioDeviceId, usuarioDeIdentidad } from "./radioDevice";

import i18n from "@/i18n";

// Quiet the LiveKit SDK's default `info` chatter (it narrates every connection
// state change / signal connect / "connected to Livekit Server" — ~5 lines per
// connect). We only want real warnings/errors in the console. This is cosmetic:
// the radio connects exactly once (VoiceChannel is a singleton, guarded by
// `if (vc) return`), so the volume was verbosity, not duplicate connections.
try {
  setLogLevel("warn");
} catch {
  /* older SDKs: no-op */
}

/**
 * ¿El puntero primario es un dedo? Es la misma señal que usa `glass.css` para
 * separar escritorio de móvil. Se mira contra el puntero y no contra el ancho
 * de la ventana a propósito: una ventana del CRM estrecha en el escritorio
 * sigue siendo escritorio, y ahí el permiso del micrófono sí se queda dado.
 */
function esTactil(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

export type VoiceMember = { userId: string; name: string; role: string };
export type VoiceSpeaker = { userId: string; name: string } | null;
export type VoiceState = "idle" | "connecting" | "connected" | "error";

export interface VoiceCallbacks {
  onState?: (s: VoiceState) => void;
  onPresence?: (roster: VoiceMember[]) => void;
  onSpeaker?: (speaker: VoiceSpeaker) => void;
  onError?: (msg: string) => void;
}

export class VoiceChannel {
  private room: Room | null = null;
  /**
   * Lo pone `disconnect()`. `start()` lo vuelve a mirar después de CADA await:
   * una desconexión que caiga mientras se pide el token no hacía nada (la sala
   * aún es null) y el `start()` en vuelo acababa conectando una sala SIN dueño
   * — que nadie puede cerrar y que sigue dentro con la MISMA identidad, así que
   * la siguiente conexión de esta persona se expulsa a sí misma. Es la segunda
   * fuente de `DUPLICATE_IDENTITY`, y ésta ocurre dentro de una sola pestaña.
   */
  private disposed = false;
  private cb: VoiceCallbacks = {};
  private selfId = "";
  private attached = new Map<string, HTMLMediaElement>();
  /** identity of whoever we last reported as the active speaker (for prompt clearing). */
  private speakerId: string | null = null;
  /**
   * Vigila un «X está hablando» ATASCADO. Un publicador que se va a mitad de
   * frase (el bot de la central de monitoreo, o alguien que pierde la red) puede
   * dejar sin entregar el `ParticipantDisconnected` / `ActiveSpeakersChanged`, y
   * entonces el canal se queda marcado como ocupado para siempre.
   *
   * Esto importa MUCHO más ahora que el botón se bloquea con el canal ocupado:
   * sin este repaso, un fantasma dejaría a toda la central sin poder transmitir
   * — que es exactamente por lo que este bloqueo se quitó en su día.
   */
  private speakerWatch: ReturnType<typeof setInterval> | null = null;
  /** true once the LiveKit room is connected (RadioContext polls this). */
  joined = false;

  get connected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  /**
   * `url` = the API origin, `token` = the app auth JWT, `tenantId` = current
   * tenant. We fetch a scoped LiveKit token from the backend, then join the room.
   * (Signature kept identical to the old socket.io engine so RadioContext is
   * unchanged; `path` is now ignored.)
   */
  connect(
    opts: {
      url: string;
      path?: string;
      token: string;
      tenantId: string;
      selfId?: string;
      channel?: string;
    },
    cb: VoiceCallbacks,
  ): void {
    this.cb = cb || {};
    this.selfId = opts.selfId || "";
    this.cb.onState?.("connecting");
    void this.start(opts);
  }

  private async start(opts: {
    url: string;
    token: string;
    tenantId: string;
    channel?: string;
  }): Promise<void> {
    this.disposed = false;
    try {
      const base = opts.url.replace(/\/+$/, "");
      const resp = await fetch(
        `${base}/api/tenant/${opts.tenantId}/radio/token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.token}`,
          },
          body: JSON.stringify({
            channel: opts.channel || "general",
            // Sin esto la identidad de sala es el userId pelado, y LiveKit
            // EXPULSA a la misma persona abierta en otra superficie.
            deviceId: radioDeviceId("w"),
          }),
        },
      );

      if (!resp.ok) {
        /* QUÉ FALLA, NO UN NÚMERO. Desde que el canal se comprueba contra el
           catálogo (services/radio/radioChannels), un 403 aquí significa algo
           concreto y accionable: ese canal existe pero no es tuyo. Decir
           «radio token 403» dejaba al despachador mirando un código. */
        if (resp.status === 403) {
          throw new Error(
            i18n.t(
              "radio.voice.channelForbidden",
              "No tienes acceso a este canal de radio.",
            ),
          );
        }
        if (resp.status === 400) {
          throw new Error(
            i18n.t(
              "radio.voice.channelMissing",
              "Ese canal de radio ya no existe. Actualiza la lista de canales.",
            ),
          );
        }
        throw new Error(`radio token ${resp.status}`);
      }
      const data: any = await resp.json();
      const url: string = data?.url;
      const token: string = data?.token;
      const iceServers = Array.isArray(data?.iceServers) ? data.iceServers : [];

      if (!url || !token) throw new Error("radio token payload");
      if (this.disposed) return; // se desconectó mientras se pedía el token

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        // Comms-grade capture (matches a real radio — AEC/NS/AGC).
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        ...(iceServers.length ? { rtcConfig: { iceServers } } : {}),
      });

      this.room = room;

      room
        .on(RoomEvent.Connected, () => {
          this.joined = true;
          this.cb.onState?.("connected");
          this.emitRoster();
          void room.startAudio().catch(() => {}); // unlock playback (best-effort)
        })
        .on(RoomEvent.Disconnected, () => {
          this.joined = false;
          this.setSpeaker(null);
          this.cb.onState?.("idle");
        })
        .on(RoomEvent.Reconnecting, () => this.cb.onState?.("connecting"))
        .on(RoomEvent.Reconnected, () => {
          this.cb.onState?.("connected");
          this.emitRoster();
        })
        .on(RoomEvent.ParticipantConnected, () => this.emitRoster())
        .on(RoomEvent.ParticipantDisconnected, (p) => {
          // If the speaker dropped (or the loop killed their session), clear the
          // "X está hablando" prompt immediately — don't leave it stuck.
          if (p && p.identity === this.speakerId) this.setSpeaker(null);
          this.emitRoster();
        })
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
          const sid = track.sid;

          if (track.kind === Track.Kind.Audio && sid) {
            const el = track.attach();

            el.style.display = "none";
            document.body.appendChild(el);
            this.attached.set(sid, el);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          const sid = track.sid;
          const el = sid ? this.attached.get(sid) : undefined;

          if (el && sid) {
            try {
              track.detach(el);
              el.remove();
            } catch {
              /* ignore */
            }
            this.attached.delete(sid);
          }
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
          const s = speakers[0];

          this.setSpeaker(s || null);
        })
        .on(RoomEvent.TrackMuted, (_pub: any, p: Participant) => {
          // PTT release mutes the mic → clear the "X está hablando" prompt
          // instantly instead of waiting on the speaker-detector's hold time.
          if (p && p.identity === this.speakerId) this.setSpeaker(null);
        });

      if (this.disposed) {
        void room.disconnect();

        return;
      }
      await room.connect(url, token, { autoSubscribe: true });
      if (this.disposed) {
        void room.disconnect();

        return;
      }
      // Pre-grant the mic permission now (join is a user gesture) so the FIRST
      // push-to-talk publishes instantly instead of the permission prompt
      // interrupting the hold. Best-effort; the track is released immediately —
      // the mic only actually publishes on startTalk().
      //
      // ── SÓLO EN ESCRITORIO ────────────────────────────────────────────────
      // Ahí el permiso queda concedido para el origen y esto se paga UNA vez.
      // En el móvil el permiso es por sesión, así que lo único que conseguía
      // era pedir el micrófono —y encender el indicador de grabación— CADA vez
      // que se abría el CRM: el widget de radio va en `app-layout`, y al montar
      // llama a `restoreRadio()`, que reconecta solo si alguna vez se encendió
      // la radio en ese navegador. Nadie lo había pedido; era el precalentado.
      // En táctil se entra en escucha y el micrófono se pide en el primer PTT.
      if (!esTactil()) {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });

          s.getTracks().forEach((t) => t.stop());
        } catch {
          /* user can still grant on first PTT */
        }
      }
    } catch (e: any) {
      this.cb.onState?.("error");
      // Dentro del método (no en el cuerpo del módulo): se resuelve al fallar,
      // con el idioma que esté activo entonces.
      this.cb.onError?.(
        e?.message ||
          i18n.t("radio.voice.connectError", "No se pudo conectar la radio"),
      );
    }
  }

  /**
   * `speakerId` guarda la IDENTIDAD DE SALA (con el sufijo del dispositivo), que
   * es contra lo que se compara `p.identity` al silenciarse o desconectarse, y
   * con lo que se busca al participante en la sala. Hacia fuera se emite la
   * PERSONA. Guardar aquí el userId pelado hacía que ninguna de esas dos
   * comparaciones acertara y el «X está hablando» no se borrara nunca.
   */
  private setSpeaker(p: { identity: string; name?: string } | null): void {
    this.speakerId = p ? p.identity : null;
    const sp: VoiceSpeaker = p
      ? { userId: usuarioDeIdentidad(p.identity), name: p.name || "—" }
      : null;

    this.cb.onSpeaker?.(sp);
    this.armSpeakerWatch();
  }

  /**
   * (Re)arma el vigía. Sólo corre mientras se muestra un hablante REMOTO — el
   * propio se limpia al instante con `TrackMuted` al soltar. Cada 2 s revalida
   * contra la sala en vivo: si esa persona ya no está, o está pero sin pista de
   * audio sonando y fuera de `activeSpeakers`, se libera el canal.
   */
  private armSpeakerWatch(): void {
    if (this.speakerWatch) {
      clearInterval(this.speakerWatch);
      this.speakerWatch = null;
    }
    const id = this.speakerId;
    const room = this.room;

    if (!id || !room) return;
    if (id === room.localParticipant?.identity) return; // lo mío lo limpia TrackMuted
    this.speakerWatch = setInterval(() => {
      const r = this.room;
      const sid = this.speakerId;

      if (!r || !sid) {
        if (this.speakerWatch) {
          clearInterval(this.speakerWatch);
          this.speakerWatch = null;
        }

        return;
      }
      const p = r.remoteParticipants.get(sid);

      if (!p) {
        this.setSpeaker(null);

        return;
      } // se fue de la sala
      const active = (r.activeSpeakers || []).some((s) => s.identity === sid);
      let liveAudio = false;

      p.audioTrackPublications.forEach((pub: any) => {
        if (pub?.track && !pub.isMuted) liveAudio = true;
      });
      if (!active && !liveAudio) this.setSpeaker(null); // presente pero callado
    }, 2000);
  }

  private emitRoster(): void {
    const room = this.room;

    if (!room) return;
    const roster: VoiceMember[] = [];
    const push = (p: Participant | undefined | null) => {
      if (p)
        roster.push({
          userId: usuarioDeIdentidad(p.identity),
          name: p.name || "—",
          role: "",
        });
    };

    push(room.localParticipant);
    room.remoteParticipants.forEach((p) => push(p));
    this.cb.onPresence?.(roster);
  }

  /**
   * LiveKit's connect() already joins the room; RadioContext polls this until
   * `joined`, so resolve with the current roster when connected, else throw to
   * make its backoff loop retry.
   */
  async join(): Promise<{ roster: VoiceMember[]; speaker: VoiceSpeaker }> {
    if (!this.room || !this.connected || !this.joined)
      throw new Error("not connected");
    const room = this.room;
    // Una PERSONA por fila, no una conexión: quien tenga el CRM y el
    // teléfono en el canal es uno solo, y verse duplicado en la plantilla
    // hace dudar de a quién se está oyendo.
    const porPersona = new Map<string, VoiceMember>();
    const anota = (identity: string, name?: string) => {
      const userId = usuarioDeIdentidad(identity);

      if (!porPersona.has(userId))
        porPersona.set(userId, { userId, name: name || "—", role: "" });
    };

    anota(room.localParticipant.identity, room.localParticipant.name);
    room.remoteParticipants.forEach((p) => anota(p.identity, p.name));

    return { roster: Array.from(porPersona.values()), speaker: null };
  }

  async startTalk(): Promise<{
    ok: boolean;
    busyWith?: string;
    error?: string;
  }> {
    if (!this.room || !this.connected)
      return {
        ok: false,
        error: i18n.t("radio.voice.notConnected", "Radio no conectada"),
      };
    try {
      await this.room.localParticipant.setMicrophoneEnabled(true);

      return { ok: true };
    } catch (e: any) {
      return {
        ok: false,
        error: e?.message || "No se pudo acceder al micrófono",
      };
    }
  }

  stopTalk(): void {
    try {
      void this.room?.localParticipant.setMicrophoneEnabled(false);
    } catch {
      /* ignore */
    }
  }

  /** Foreground/gesture: unlock audio playback (WebViews suspend it in background). */
  resume(): void {
    try {
      void this.room?.startAudio();
    } catch {
      /* ignore */
    }
  }

  leave(): void {
    this.disconnect();
  }

  disconnect(): void {
    this.disposed = true;
    this.joined = false;
    if (this.speakerWatch) {
      clearInterval(this.speakerWatch);
      this.speakerWatch = null;
    }
    this.speakerId = null;
    try {
      this.attached.forEach((el) => {
        try {
          el.remove();
        } catch {
          /* ignore */
        }
      });
      this.attached.clear();
      void this.room?.disconnect();
    } catch {
      /* ignore */
    }
    this.room = null;
  }
}
