/**
 * VigIA — el asistente del CRM, en la esquina inferior derecha.
 *
 * El vigía de la operación: chatea, consulta (cobertura, incidentes) y ejecuta
 * acciones (invitar vigilantes, supervisores, clientes) SIEMPRE con
 * confirmación: el modelo propone en una tarjeta, la persona decide.
 *
 * Notas de esta casa:
 *  - `position: fixed` va EN LÍNEA: las clases .glass* fijan position y
 *    glass.css gana a las utilidades (ver su cabecera).
 *  - El panel FLOTA sobre la página entera → fondo `--float`, no un tinte.
 *  - La severidad y la marca salen de los tokens; nada de colores propios.
 *  - La conversación vive en el estado del armazón (persiste al navegar,
 *    muere al recargar — un chat operativo no necesita más memoria que esa).
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Send, X, Loader2, Check, Ban } from "lucide-react";
import api from "@/lib/api";

const tenantId = () => localStorage.getItem("tenantId") || "";

/** El hilo sobrevive a una recarga (2 h de vida): repetir el contexto se paga
 *  dos veces — en paciencia y en tokens. */
const HILO_KEY = "vigia_hilo";
const HILO_TTL_MS = 2 * 60 * 60 * 1000;

function cargarHilo(): Msg[] {
  try {
    const raw = sessionStorage.getItem(HILO_KEY);
    if (!raw) return [];
    const { ts, tid, msgs } = JSON.parse(raw);
    if (Date.now() - ts > HILO_TTL_MS || tid !== tenantId()) return [];
    return Array.isArray(msgs) ? msgs.slice(-24) : [];
  } catch { return []; }
}
function guardarHilo(msgs: Msg[]) {
  try { sessionStorage.setItem(HILO_KEY, JSON.stringify({ ts: Date.now(), tid: tenantId(), msgs: msgs.slice(-24) })); } catch { /* privado */ }
}

/** El modelo a veces escapa el «sin markdown» del prompt: los restos de
 *  negritas y viñetas se limpian aquí para que no salgan asteriscos crudos. */
function sinMarkdown(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|[.,;:!?]|$)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

interface Msg { role: "user" | "assistant"; content: string }
interface Propuesta { tool: string; args: any; resumen: string; firma: string; exp: number }

/** El logo: un escudo con el pulso del vigía. Inline para no cargar assets. */
function LogoVigia({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M7.5 12h2l1.5-3 2 6 1.5-3h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function VigiaWidget() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => cargarHilo());
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement | null>(null);
  const entrada = useRef<HTMLTextAreaElement | null>(null);
  const botonConfirmar = useRef<HTMLButtonElement | null>(null);

  // El foco vuelve al campo al abrir y tras cada respuesta; cuando aparece una
  // propuesta, va al botón Confirmar — es LA decisión del feature.
  useEffect(() => {
    if (!open) return;
    if (propuesta) botonConfirmar.current?.focus();
    else if (!ocupado) entrada.current?.focus();
  }, [open, ocupado, propuesta]);

  useEffect(() => {
    fondo.current?.scrollTo({ top: fondo.current.scrollHeight });
    guardarHilo(msgs);
  }, [msgs, propuesta, ocupado, open]);

  // El parte matutino: la PRIMERA apertura del día trae el estado de la
  // operación sin gastar un token — el retrato ya lo sabe todo.
  useEffect(() => {
    if (!open) return;
    const hoy = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem("vigia_parte") === hoy) return;
    localStorage.setItem("vigia_parte", hoy);
    (async () => {
      try {
        const resp: any = await api.get(`/tenant/${tenantId()}/assistant/brief`, { toast: { silentError: true } } as any);
        const d = resp && resp.data !== undefined ? resp.data : resp;
        if (d?.lineas?.length) {
          setMsgs((m) => [...m, { role: "assistant", content: `${d.titulo}\n${d.lineas.map((l: string) => `• ${l}`).join("\n")}` }]);
        }
      } catch { /* sin parte no pasa nada */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cualquier parte del CRM puede abrir a VigIA con un primer mensaje sembrado:
  // window.dispatchEvent(new CustomEvent('vigia:abrir', { detail: { mensaje } }))
  useEffect(() => {
    const abrir = (e: any) => {
      setOpen(true);
      const mensaje = e?.detail?.mensaje;
      // Se siembra AUNQUE haya hilo: una alerta conversable llega en mitad del
      // día, no solo en el estreno del chat.
      if (mensaje) setMsgs((m) => [...m, { role: "assistant", content: String(mensaje) }]);
      const escribir = e?.detail?.escribir;
      if (escribir) setTexto(String(escribir));
    };
    window.addEventListener("vigia:abrir", abrir as any);
    return () => window.removeEventListener("vigia:abrir", abrir as any);
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  if (!localStorage.getItem("authToken") || !tenantId()) return null;

  const llamar = async (body: any): Promise<any> => {
    // 60s: un turno con varias consultas tarda más que los 15s globales de
    // axios — y abortar en el cliente mientras el servidor sigue era el modo
    // de fallo más caro (reintento = pagar el turno dos veces).
    const resp: any = await api.post(`/tenant/${tenantId()}/assistant/chat`, body, { timeout: 60000, toast: { silentError: true } } as any);
    return resp && resp.data !== undefined ? resp.data : resp;
  };

  const enviar = async () => {
    const contenido = texto.trim();
    if (!contenido || ocupado) return;
    setTexto("");
    setAviso(null);
    setPropuesta(null);
    // El servidor solo mira los últimos 16: mandar más es ancho de banda.
    const historia: Msg[] = [...msgs, { role: "user" as const, content: contenido }].slice(-16);
    setMsgs(historia);
    setOcupado(true);
    try {
      const d = await llamar({ messages: historia });
      if (d?.error) { setAviso(d.error); return; }
      if (d?.reply) setMsgs((m) => [...m, { role: "assistant", content: d.reply }]);
      if (d?.proposal) setPropuesta(d.proposal);
      if (d?.navigate) { navigate(d.navigate); if (!d?.proposal) setOpen(false); }
    } catch (e: any) {
      setAviso(e?.message || t("vigia.netError", "No pudimos hablar con VigIA. Inténtalo de nuevo."));
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async (si: boolean) => {
    if (!propuesta || ocupado) return;
    const p = propuesta;
    if (!si) {
      setPropuesta(null);
      setMsgs((m) => [...m, { role: "assistant", content: t("vigia.cancelled", "Entendido, no lo hago. ¿Algo más?") }]);
      return;
    }
    setOcupado(true);
    try {
      // La firma viaja de vuelta: el servidor solo ejecuta propuestas que ÉL
      // emitió, frescas y una sola vez — reintentar con la misma firma devuelve
      // el mismo resultado en vez de ejecutar dos veces.
      const d = await llamar({ messages: msgs.slice(-16), confirm: { tool: p.tool, args: p.args, firma: p.firma, exp: p.exp } });
      if (d?.error) { setAviso(d.error); setPropuesta(null); return; }
      setPropuesta(d?.proposal || null);
      if (d?.reply) setMsgs((m) => [...m, { role: "assistant", content: d.reply }]);
      if (d?.navigate) navigate(d.navigate);
    } catch (e: any) {
      // La tarjeta SIGUE AHÍ: si fue un corte de red, reintentar con la misma
      // firma es seguro (idempotente en el servidor).
      setAviso(e?.message || t("vigia.confirmError", "No se pudo confirmar (¿se cortó la señal?). Vuelve a pulsar Confirmar: es seguro."));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      {/* ── La burbuja ──────────────────────────────────────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label={t("vigia.openAria", "Abrir VigIA, el asistente")}
          className="cg-focus transition-transform hover:scale-105"
          aria-expanded={open}
          style={{
            // z-45: los diálogos del sistema (z-50) tapan la burbuja, no al
            // revés. La botonera de guardar de algunas páginas vive en
            // bottom-6 right-6 — la burbuja se levanta por encima de ella.
            position: "fixed", right: "clamp(1rem, 4vw, 1.75rem)", bottom: "calc(4.75rem + env(safe-area-inset-bottom, 0px))", zIndex: 45,
            // drop-shadow y no box-shadow: la sombra sigue la silueta del escudo.
            background: "transparent", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.30))",
          }}
        >
          <svg width={58} height={64} viewBox="0 0 48 54" aria-hidden>
            <path d="M24 2 6 8.5v11.5c0 10.8 7.2 20 18 23 10.8-3 18-12.2 18-23V8.5L24 2z" fill="var(--brand)" />
            <text x="24" y="22" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="var(--brand-ink)" style={{ fontFamily: "Saira, Inter, sans-serif" }}>VigIA</text>
            <path d="M13 32h5l3-6 4 12 3-6h7" stroke="var(--brand-ink)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      )}

      {/* ── El panel ───────────────────────────────────────────────────── */}
      {open && (
        <div
          className="flex flex-col"
          style={{
            position: "fixed", right: "clamp(1rem, 4vw, 1.75rem)", bottom: "calc(clamp(1rem, 3vh, 1.5rem) + env(safe-area-inset-bottom, 0px))", zIndex: 45,
            // 100dvh y no 100vh: con la barra de Safari desplegada, la fila de
            // entrada quedaba fuera de pantalla.
            width: "min(24rem, calc(100vw - 2 * clamp(1rem, 4vw, 1.75rem)))", height: "min(34rem, calc(100dvh - 6.5rem))",
          }}
        >
        <div
          role="dialog"
          aria-label={t("vigia.dialogAria", "VigIA, asistente de la operación")}
          className="flex min-h-0 flex-1 flex-col overflow-hidden border shadow-2xl"
          style={{
            // La silueta del escudo: esquinas superiores de tarjeta, base que
            // se afila hacia la punta central (el tip vive justo debajo).
            borderRadius: "1.25rem 1.25rem 2.75rem 2.75rem",
            background: "var(--float)", borderColor: "var(--hairline)",
            // La receta de .glass-raised: --float sin blur transparenta el
            // dashboard de atrás (números fantasma dentro del chat).
            backdropFilter: "blur(calc(var(--blur) * 1.4)) saturate(200%)",
            WebkitBackdropFilter: "blur(calc(var(--blur) * 1.4)) saturate(200%)",
          }}
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
            <div className="flex items-center gap-2">
              <LogoVigia />
              <div>
                <p className="text-sm font-bold leading-none" style={{ fontFamily: "Saira, Inter, sans-serif" }}>VigIA</p>
                <p className="text-[11px] opacity-80">{t("vigia.tagline", "El vigía de tu operación")}</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label={t("actions.close", "Cerrar")} className="cg-focus rounded p-1 opacity-80 hover:opacity-100">
              <X size={16} />
            </button>
          </div>

          {/* Mensajes */}
          <div ref={fondo} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {msgs.length === 0 && (
              <div className="px-2 py-4 text-sm" style={{ color: "var(--ink-soft)" }}>
                <p className="mb-2 font-semibold" style={{ color: "var(--ink)" }}>{t("vigia.emptyTitle", "¿En qué te ayudo?")}</p>
                <p>{t("vigia.emptyHint", "Puedo, por ejemplo:")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    "¿Cómo va la cobertura ahora?",
                    "¿Qué incidentes hubo hoy?",
                    "Agrega un vigilante nuevo",
                    "Llévame al horario",
                  ].map((ej) => (
                    <button
                      key={ej}
                      onClick={() => { setTexto(ej); setTimeout(() => entrada.current?.focus(), 0); }}
                      className="cg-focus rounded-full border px-2.5 py-1 text-xs transition-[filter] hover:brightness-110"
                      style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                    >
                      {ej}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t("vigia.emptyNote", "Toda acción te la muestro antes y la ejecuto solo si confirmas.")}
                </p>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm"
                  style={m.role === "user"
                    ? { background: "color-mix(in oklab, var(--brand) 16%, transparent)", color: "var(--ink)" }
                    : { background: "var(--glass-raised)", color: "var(--ink)" }}
                >
                  {m.role === "assistant" ? sinMarkdown(m.content) : m.content}
                </div>
              </div>
            ))}

            {/* Tarjeta de propuesta: el modelo propone, la persona decide. */}
            {propuesta && (
              <div className="rounded-2xl border px-3 py-3" style={{ borderColor: "var(--brand)", background: "color-mix(in oklab, var(--brand) 8%, transparent)" }}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--brand-text)" }}>
                  {t("vigia.proposalTitle", "Acción por confirmar")}
                </p>
                <p className="mb-3 text-sm">{propuesta.resumen}</p>
                <div className="flex gap-2">
                  <button
                    ref={botonConfirmar}
                    onClick={() => confirmar(true)}
                    disabled={ocupado}
                    className="cg-focus flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition-[filter] hover:brightness-110 disabled:opacity-50"
                    style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
                  >
                    <Check size={15} /> {t("actions.confirm", "Confirmar")}
                  </button>
                  <button
                    onClick={() => confirmar(false)}
                    disabled={ocupado}
                    className="cg-focus flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                  >
                    <Ban size={15} /> {t("actions.cancel", "Cancelar")}
                  </button>
                </div>
              </div>
            )}

            {ocupado && (
              <div role="status" className="flex items-center gap-2 px-2 text-xs" style={{ color: "var(--ink-soft)" }}>
                <Loader2 size={13} className="animate-spin" /> {t("vigia.working", "VigIA está trabajando…")}
              </div>
            )}
            {aviso && (
              <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "color-mix(in oklab, var(--warn) 14%, transparent)", color: "var(--warn-text, var(--ink))" }}>
                {aviso}
              </div>
            )}
          </div>

          {/* Entrada */}
          <div className="flex items-center gap-2 border-t px-4 pb-3 pt-2" style={{ borderColor: "var(--hairline)" }}>
            <textarea
              ref={entrada}
              rows={1}
              className="cg-input max-h-28 flex-1 resize-none px-3 py-2 text-sm"
              placeholder={t("vigia.placeholder", "Escríbele a VigIA…")}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = Math.min(112, e.target.scrollHeight) + "px";
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              disabled={ocupado}
              aria-label={t("vigia.inputAria", "Mensaje para VigIA")}
            />
            <button
              onClick={enviar}
              disabled={ocupado || !texto.trim()}
              aria-label={t("actions.send", "Enviar")}
              className="cg-focus rounded-xl p-2 transition-[filter] hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
        {/* La punta del escudo: remata la silueta bajo el panel. El relleno es
            un div recortado (clip-path) para poder llevar el MISMO blur del
            panel — un fill de SVG no desenfoca lo que tiene detrás. */}
        <div aria-hidden className="relative mx-auto shrink-0" style={{ width: 48, height: 14, marginTop: -1.5 }}>
          <div
            className="absolute inset-0"
            style={{
              clipPath: 'path("M1 0 C10 2 19 5 24 13 C29 5 38 2 47 0 Z")',
              background: "var(--float)",
              backdropFilter: "blur(calc(var(--blur) * 1.4)) saturate(200%)",
              WebkitBackdropFilter: "blur(calc(var(--blur) * 1.4)) saturate(200%)",
            }}
          />
          <svg width={48} height={14} viewBox="0 0 48 14" className="absolute inset-0">
            <path d="M1 0 C10 2 19 5 24 13 C29 5 38 2 47 0" stroke="var(--hairline)" strokeWidth="1" fill="none" />
          </svg>
        </div>
        </div>
      )}
    </>
  );
}
