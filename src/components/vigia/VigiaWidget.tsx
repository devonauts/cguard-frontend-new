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
import { Send, X, Loader2, Check, Ban } from "lucide-react";
import api from "@/lib/api";

const tenantId = () => localStorage.getItem("tenantId") || "";

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
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const fondo = useRef<HTMLDivElement | null>(null);
  const entrada = useRef<HTMLInputElement | null>(null);
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
  }, [msgs, propuesta, ocupado, open]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  if (!localStorage.getItem("authToken") || !tenantId()) return null;

  const llamar = async (body: any): Promise<any> => {
    const resp: any = await api.post(`/tenant/${tenantId()}/assistant/chat`, body, { toast: { silentError: true } } as any);
    return resp && resp.data !== undefined ? resp.data : resp;
  };

  const enviar = async () => {
    const contenido = texto.trim();
    if (!contenido || ocupado) return;
    setTexto("");
    setAviso(null);
    setPropuesta(null);
    const historia: Msg[] = [...msgs, { role: "user", content: contenido }];
    setMsgs(historia);
    setOcupado(true);
    try {
      const d = await llamar({ messages: historia });
      if (d?.error) { setAviso(d.error); return; }
      if (d?.reply) setMsgs((m) => [...m, { role: "assistant", content: d.reply }]);
      if (d?.proposal) setPropuesta(d.proposal);
      if (d?.navigate) { navigate(d.navigate); if (!d?.proposal) setOpen(false); }
    } catch (e: any) {
      setAviso(e?.message || "No pudimos hablar con VigIA. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async (si: boolean) => {
    if (!propuesta || ocupado) return;
    const p = propuesta;
    if (!si) {
      setPropuesta(null);
      setMsgs((m) => [...m, { role: "assistant", content: "Entendido, no lo hago. ¿Algo más?" }]);
      return;
    }
    setOcupado(true);
    try {
      // La firma viaja de vuelta: el servidor solo ejecuta propuestas que ÉL
      // emitió, frescas y una sola vez — reintentar con la misma firma devuelve
      // el mismo resultado en vez de ejecutar dos veces.
      const d = await llamar({ messages: [], confirm: { tool: p.tool, args: p.args, firma: p.firma, exp: p.exp } });
      if (d?.error) { setAviso(d.error); setPropuesta(null); return; }
      setPropuesta(null);
      if (d?.reply) setMsgs((m) => [...m, { role: "assistant", content: d.reply }]);
      if (d?.navigate) navigate(d.navigate);
    } catch (e: any) {
      // La tarjeta SIGUE AHÍ: si fue un corte de red, reintentar con la misma
      // firma es seguro (idempotente en el servidor).
      setAviso(e?.message || "No se pudo confirmar (¿se cortó la señal?). Vuelve a pulsar Confirmar: es seguro.");
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
          aria-label="Abrir VigIA, el asistente"
          className="cg-focus flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold shadow-lg transition-[filter] hover:brightness-110"
          aria-expanded={open}
          style={{
            // z-45: los diálogos del sistema (z-50) tapan la burbuja, no al
            // revés. La botonera de guardar de algunas páginas vive en
            // bottom-6 right-6 — la burbuja se levanta por encima de ella.
            position: "fixed", right: "1rem", bottom: "calc(4.5rem + env(safe-area-inset-bottom, 0px))", zIndex: 45,
            background: "var(--brand)", color: "var(--brand-ink)",
          }}
        >
          <LogoVigia />
          VigIA
        </button>
      )}

      {/* ── El panel ───────────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-label="VigIA, asistente de la operación"
          className="flex flex-col overflow-hidden rounded-2xl border shadow-2xl"
          style={{
            position: "fixed", right: "1rem", bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))", zIndex: 45,
            // 100dvh y no 100vh: con la barra de Safari desplegada, la fila de
            // entrada quedaba fuera de pantalla.
            width: "min(24rem, calc(100vw - 2rem))", height: "min(34rem, calc(100dvh - 6rem))",
            background: "var(--float)", borderColor: "var(--hairline)",
          }}
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between px-4 py-3" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
            <div className="flex items-center gap-2">
              <LogoVigia />
              <div>
                <p className="text-sm font-bold leading-none" style={{ fontFamily: "Saira, Inter, sans-serif" }}>VigIA</p>
                <p className="text-[11px] opacity-80">El vigía de tu operación</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar" className="cg-focus rounded p-1 opacity-80 hover:opacity-100">
              <X size={16} />
            </button>
          </div>

          {/* Mensajes */}
          <div ref={fondo} role="log" aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {msgs.length === 0 && (
              <div className="px-2 py-4 text-sm" style={{ color: "var(--ink-soft)" }}>
                <p className="mb-2 font-semibold" style={{ color: "var(--ink)" }}>¿En qué te ayudo?</p>
                <p>Puedo, por ejemplo:</p>
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
                  Toda acción te la muestro antes y la ejecuto solo si confirmas.
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
                  {m.content}
                </div>
              </div>
            ))}

            {/* Tarjeta de propuesta: el modelo propone, la persona decide. */}
            {propuesta && (
              <div className="rounded-2xl border px-3 py-3" style={{ borderColor: "var(--brand)", background: "color-mix(in oklab, var(--brand) 8%, transparent)" }}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--brand-text)" }}>
                  Acción por confirmar
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
                    <Check size={15} /> Confirmar
                  </button>
                  <button
                    onClick={() => confirmar(false)}
                    disabled={ocupado}
                    className="cg-focus flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--hairline)", color: "var(--ink)" }}
                  >
                    <Ban size={15} /> Cancelar
                  </button>
                </div>
              </div>
            )}

            {ocupado && (
              <div role="status" className="flex items-center gap-2 px-2 text-xs" style={{ color: "var(--ink-soft)" }}>
                <Loader2 size={13} className="animate-spin" /> VigIA está trabajando…
              </div>
            )}
            {aviso && (
              <div className="rounded-xl px-3 py-2 text-xs" style={{ background: "color-mix(in oklab, var(--warn) 14%, transparent)", color: "var(--warn-text, var(--ink))" }}>
                {aviso}
              </div>
            )}
          </div>

          {/* Entrada */}
          <div className="flex items-center gap-2 border-t px-3 py-2" style={{ borderColor: "var(--hairline)" }}>
            <input
              ref={entrada}
              className="cg-input flex-1 text-sm"
              placeholder="Escríbele a VigIA…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              disabled={ocupado}
              aria-label="Mensaje para VigIA"
            />
            <button
              onClick={enviar}
              disabled={ocupado || !texto.trim()}
              aria-label="Enviar"
              className="cg-focus rounded-xl p-2 transition-[filter] hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
