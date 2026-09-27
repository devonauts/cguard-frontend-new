import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Megaphone, X, AlertTriangle, Info } from "lucide-react";

import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { acusar, cargarAvisos, conMarca, EVENTO } from "@/lib/anuncios/anuncios";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AVISOS DE LA PLATAFORMA — lo que la casa quiere decirle a esta empresa.
 *
 * Mantenimiento del domingo, función nueva, cambio de precio. Llega aquí, al
 * escritorio de quien administra, y no por push al móvil del vigilante: no es
 * el mismo lector ni la misma decisión.
 *
 * Un aviso CRÍTICO no se puede cerrar; los demás sí, y el descarte se recuerda
 * por id en este navegador. Obligar a leer cada mañana el mismo aviso de
 * novedades es la forma más rápida de que dejen de leerse todos.
 *
 * Falla en silencio: si la plataforma no responde, aquí no se pinta nada. Un
 * aviso roto no puede estropearle la pantalla a nadie.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface Aviso {
  id: string;
  title: string;
  body: string;
  level: "info" | "warning" | "critical" | string;
  dismissible: boolean;
}

const DESCARTADOS = "cg_avisos_descartados";

const leerDescartados = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DESCARTADOS) || "[]");
  } catch {
    return [];
  }
};

export default function PlatformAnnouncements() {
  const { t } = useTranslation();
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  // La marca del anfitrión: en el dominio de un socio, su nombre (nunca el nuestro).
  const marca = useWhiteLabel()?.platformName || "";

  useEffect(() => {
    let vivo = true;
    const cargar = async () => {
      const rows = (await cargarAvisos()).filter((a) => a.format !== "popup");
      if (!vivo) return;
      const fuera = leerDescartados();
      setAvisos(rows.filter((a) => !a.dismissible || !fuera.includes(a.id)) as any);
    };
    void cargar();
    // «Enviar ahora» desde el superadmin: aparece sin recargar.
    const alLlegar = () => void cargar();
    window.addEventListener(EVENTO, alLlegar);

    return () => {
      vivo = false;
      window.removeEventListener(EVENTO, alLlegar);
    };
  }, []);

  const cerrar = (id: string) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
    // En el servidor: así no vuelve en otro equipo, y el superadmin sabe quién lo cerró.
    acusar(id, "dismissed");
    try {
      const fuera = leerDescartados();

      localStorage.setItem(
        DESCARTADOS,
        JSON.stringify([...new Set([...fuera, id])].slice(-50)),
      );
    } catch {
      /* privado */
    }
  };

  if (!avisos.length) return null;

  return (
    <div className="mb-4 space-y-2">
      {avisos.map((a) => {
        const critico = a.level === "critical";
        const aviso = a.level === "warning";

        return (
          <div
            key={a.id}
            className="flex items-start gap-3 rounded-xl border px-4 py-3"
            role={critico ? "alert" : "status"}
            style={{
              borderColor: critico
                ? "var(--danger, #dc2626)"
                : aviso
                  ? "var(--warning, #d97706)"
                  : "var(--hairline)",
              background: critico
                ? "color-mix(in oklab, var(--danger, #dc2626) 8%, transparent)"
                : aviso
                  ? "color-mix(in oklab, var(--warning, #d97706) 8%, transparent)"
                  : "var(--float)",
            }}
          >
            <span className="mt-0.5 shrink-0">
              {critico ? (
                <AlertTriangle size={16} />
              ) : aviso ? (
                <Info size={16} />
              ) : (
                <Megaphone size={16} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{conMarca(a.title, marca)}</p>
              <p className="whitespace-pre-wrap text-sm opacity-80">{conMarca(a.body, marca)}</p>
            </div>
            {a.dismissible && (
              <button
                aria-label={t("ui.PlatformAnnouncements.cerrarAviso", "Cerrar aviso")}
                className="cg-focus shrink-0 rounded p-1 opacity-60 hover:opacity-100"
                onClick={() => cerrar(a.id)}
              >
                <X size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
