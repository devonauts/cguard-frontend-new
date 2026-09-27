import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";

import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import {
  EVENTO,
  formatoCuentaAtras,
  recargarAhora,
  type PeticionDeRecarga,
} from "@/lib/recarga/recarga";

/**
 * El aviso de arriba: «La página se recargará en 0:42» con «Recargar ahora» y,
 * una sola vez, «Esperar 5 min» (para quien está a mitad de algo).
 *
 * Escucha `cg:recarga`, al que llegan las dos fuentes: la versión nueva del
 * service worker y el `platform:reload` del superadmin (lo reenvía `lib/socket`). Si llegan dos
 * peticiones, manda la que vence antes.
 */
const POSPONER_MS = 5 * 60_000;

interface Aviso {
  fin: number;
  motivo: PeticionDeRecarga["motivo"];
  mensaje: string | null;
  pospuesto: boolean;
}

export default function AvisoDeRecarga() {
  const { t } = useTranslation();
  // La marca del ANFITRIÓN: en el dominio de un socio, su nombre, nunca el nuestro.
  const marca = useWhiteLabel()?.platformName || "";
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const vistos = useRef(new Set<string>());
  const recargando = useRef(false);

  // Las peticiones (versión nueva o superadmin).
  useEffect(() => {
    const alPedir = (e: Event) => {
      const p = (e as CustomEvent<PeticionDeRecarga>).detail;
      if (!p || (p.id !== "version" && vistos.current.has(p.id))) return;
      vistos.current.add(p.id);
      const fin = Date.now() + Math.max(5, Number(p.segundos) || 60) * 1000;
      setAviso((previo) =>
        previo && previo.fin <= fin && !previo.pospuesto
          ? previo
          : { fin, motivo: p.motivo, mensaje: p.mensaje || previo?.mensaje || null, pospuesto: false },
      );
    };
    window.addEventListener(EVENTO, alPedir);
    return () => window.removeEventListener(EVENTO, alPedir);
  }, []);

  /* El `platform:reload` del superadmin lo recoge el propio socket del CRM
     (`lib/socket.ts`) y llega aquí como `cg:recarga`, igual que la versión nueva. */

  // La cuenta atrás.
  useEffect(() => {
    if (!aviso) return;
    const reloj = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(reloj);
  }, [aviso]);

  useEffect(() => {
    if (aviso && ahora >= aviso.fin && !recargando.current) {
      recargando.current = true;
      void recargarAhora();
    }
  }, [aviso, ahora]);

  if (!aviso) return null;
  const queda = aviso.fin - ahora;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed inset-x-0 top-0 z-[10000] flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2 text-[13px] font-semibold text-white shadow-lg"
      // Fondo oscuro FIJO y no el color de la marca: con una marca clara (un gris,
      // un amarillo) el texto blanco no se leía, y este aviso tiene que leerse.
      style={{ background: "#111827" }}
    >
      <RefreshCw aria-hidden className="size-4 shrink-0 animate-spin [animation-duration:3s]" />
      <span className="text-center">
        {aviso.motivo === "version"
          ? t("avisoDeRecarga.version", { marca, defaultValue: "Hay una versión nueva de {{marca}}." })
          : t("avisoDeRecarga.plataforma", { marca, defaultValue: "Estamos actualizando {{marca}}." })}
        {aviso.mensaje ? ` ${aviso.mensaje}` : ""}{" "}
        {t("avisoDeRecarga.enX", "La página se recargará en {{t}}. Guarda lo que estés escribiendo.", {
          t: formatoCuentaAtras(queda),
        })}
      </span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-full bg-white px-3 py-1 text-[12.5px] font-bold text-[#111827] hover:opacity-90"
          onClick={() => { recargando.current = true; void recargarAhora(); }}
        >
          {t("avisoDeRecarga.ahora", "Recargar ahora")}
        </button>
        {!aviso.pospuesto && (
          <button
            type="button"
            className="rounded-full border border-white/70 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-white/10"
            onClick={() => setAviso((a) => (a ? { ...a, fin: Date.now() + POSPONER_MS, pospuesto: true } : a))}
          >
            {t("avisoDeRecarga.esperar", "Esperar 5 min")}
          </button>
        )}
      </span>
    </div>
  );
}
