import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wrench } from "lucide-react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CARTEL DE MANTENIMIENTO — el aviso que se ve cuando el API NO contesta.
 *
 * Los avisos de la plataforma viven en la base de datos: justo lo que está
 * apagado en pleno mantenimiento. Por eso este cartel lee un fichero ESTÁTICO
 * junto al CRM (`/mantenimiento.json`), que nginx sirve aunque el API esté
 * reiniciando. Lo escribe el script de despliegue antes de recargar y lo
 * borra tras la prueba de humo; si algo se queda colgado, el cartel caduca
 * solo 10 minutos después de la hora prevista de fin.
 *
 * Mismo origen en todos los dominios (también los de socios), sin marca
 * nuestra en el texto. Falla en silencio: sin fichero, no hay cartel.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface Cartel {
  enCurso: boolean;
  desde?: string | null;
  hasta?: string | null;
  motivo?: string | null;
}

const CADA_MS = 30_000;
const GRACIA_MS = 10 * 60_000;

async function leerCartel(): Promise<Cartel | null> {
  try {
    const r = await fetch(`/mantenimiento.json?t=${Date.now()}`, { cache: "no-store", credentials: "same-origin" });
    if (r.status !== 200) return null;
    const tipo = r.headers.get("content-type") || "";
    if (!tipo.includes("json")) return null; // el index.html del CRM no es un cartel
    const j = await r.json();
    return j && typeof j === "object" && "enCurso" in j ? (j as Cartel) : null;
  } catch {
    return null;
  }
}

export default function CartelDeMantenimiento() {
  const { t } = useTranslation();
  const [cartel, setCartel] = useState<Cartel | null>(null);

  useEffect(() => {
    let vivo = true;
    const mirar = async () => {
      const c = await leerCartel();
      if (!vivo) return;
      if (!c?.enCurso) return setCartel(null);
      const hasta = c.hasta ? new Date(c.hasta).getTime() : NaN;
      if (!Number.isNaN(hasta) && Date.now() > hasta + GRACIA_MS) return setCartel(null);
      setCartel(c);
    };
    void mirar();
    const id = window.setInterval(() => void mirar(), CADA_MS);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, []);

  if (!cartel) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-3 rounded-xl border px-4 py-3"
      style={{
        borderColor: "var(--danger, #dc2626)",
        background: "color-mix(in oklab, var(--danger, #dc2626) 8%, transparent)",
      }}
    >
      <span className="mt-0.5 shrink-0"><Wrench size={16} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t("anuncios.mantenimiento.cartel.titulo")}</p>
        <p className="text-sm opacity-80">{t("anuncios.mantenimiento.cartel.texto")}</p>
      </div>
    </div>
  );
}
