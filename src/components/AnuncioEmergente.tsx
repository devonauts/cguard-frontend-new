import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Gift, Info, Megaphone, Rocket, ShieldCheck, Sparkles, Wrench, X } from "lucide-react";

import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import TextoDeAviso from "@/components/TextoDeAviso";
import { acusar, cargarAvisos, conMarca, EVENTO, type Aviso } from "@/lib/anuncios/anuncios";

/**
 * La VENTANA de un aviso de la plataforma: imagen, título, texto, botón.
 *
 * Una a la vez, la más reciente primero. Se abre al entrar si hay alguna sin
 * ver, y al momento si el superadmin pulsa «Enviar ahora» (websocket). Acusa:
 *   · shown     al abrirse
 *   · seen      «Entendido»
 *   · dismissed la X o fuera de la ventana (si se puede cerrar)
 *   · cta       el botón del aviso
 * Con «Obligar a leer», sólo se cierra con «Entendido».
 */
const ICONOS: Record<string, any> = {
  megaphone: Megaphone, sparkles: Sparkles, rocket: Rocket, gift: Gift, wrench: Wrench,
  shield: ShieldCheck, info: Info, calendar: CalendarDays,
};

export default function AnuncioEmergente() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const marca = useWhiteLabel()?.platformName || "";
  const [cola, setCola] = useState<Aviso[]>([]);
  const mostrados = useRef(new Set<string>());

  const cargar = useCallback(async () => {
    const todos = await cargarAvisos();
    setCola(todos.filter((a) => a.format === "popup"));
  }, []);

  useEffect(() => {
    void cargar();
    const alLlegar = () => void cargar();
    window.addEventListener(EVENTO, alLlegar);
    return () => window.removeEventListener(EVENTO, alLlegar);
  }, [cargar]);

  const aviso = cola[0] || null;

  useEffect(() => {
    if (aviso && !mostrados.current.has(aviso.id)) {
      mostrados.current.add(aviso.id);
      acusar(aviso.id, "shown");
    }
  }, [aviso]);

  if (!aviso) return null;

  const cerrarCon = (evento: "seen" | "dismissed" | "cta") => {
    acusar(aviso.id, evento);
    setCola((c) => c.filter((a) => a.id !== aviso.id));
  };
  const puedeCerrar = aviso.dismissible && !aviso.requireAck;
  const critico = aviso.level === "critical";
  const acento = aviso.design?.accent || (critico ? "#dc2626" : aviso.level === "warning" ? "#d97706" : "#1d4ed8");
  const Icono = ICONOS[aviso.design?.icon || ""] || (critico ? ShieldCheck : Megaphone);
  const irAlBoton = () => {
    const url = aviso.design?.ctaUrl || "";
    cerrarCon("cta");
    if (url.startsWith("/")) navigate(url);
    else if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={() => puedeCerrar && cerrarCon("dismissed")}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`aviso-${aviso.id}`}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-[var(--surface,#fff)] text-[var(--text-primary,#111827)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {puedeCerrar && (
          <button
            type="button"
            aria-label={t("anuncios.cerrar", "Cerrar")}
            className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
            onClick={() => cerrarCon("dismissed")}
          >
            <X size={16} />
          </button>
        )}
        {aviso.design?.imageUrl ? (
          <img src={aviso.design.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
        ) : (
          <div className="h-1.5 w-full" style={{ background: acento }} />
        )}
        <div className="space-y-3 p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: acento }}>
            <span className="grid size-7 place-items-center rounded-full" style={{ background: `${acento}1f` }}>
              <Icono size={15} />
            </span>
            {t("anuncios.eyebrow", { marca, defaultValue: "Novedades de {{marca}}" })}
          </div>
          <h2 id={`aviso-${aviso.id}`} className="text-xl font-bold leading-snug">
            {conMarca(aviso.title, marca)}
          </h2>
          <TextoDeAviso texto={conMarca(aviso.body, marca)} className="text-sm leading-relaxed text-[var(--text-secondary,#4b5563)]" />
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {aviso.design?.ctaLabel && aviso.design?.ctaUrl ? (
              <>
                <button
                  type="button"
                  className="rounded-full border border-[var(--hairline,#e5e7eb)] px-4 py-2 text-sm font-semibold hover:bg-black/5"
                  onClick={() => cerrarCon("seen")}
                >
                  {t("anuncios.entendido", "Entendido")}
                </button>
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                  style={{ background: acento }}
                  onClick={irAlBoton}
                >
                  {conMarca(aviso.design.ctaLabel, marca)}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-full px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
                style={{ background: acento }}
                onClick={() => cerrarCon("seen")}
              >
                {t("anuncios.entendido", "Entendido")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
