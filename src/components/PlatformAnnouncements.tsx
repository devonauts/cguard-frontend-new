import { useEffect, useState } from "react";
import { Megaphone, X, AlertTriangle, Info } from "lucide-react";
import { ApiService } from "@/services/api/apiService";

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
  try { return JSON.parse(localStorage.getItem(DESCARTADOS) || "[]"); } catch { return []; }
};

export default function PlatformAnnouncements() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);

  useEffect(() => {
    let vivo = true;
    const tenantId = localStorage.getItem("tenantId");
    if (!tenantId) return;
    (async () => {
      try {
        const r: any = await ApiService.get(`/tenant/${tenantId}/announcements`);
        const rows: Aviso[] = (r?.rows || r?.data?.rows || []) as Aviso[];
        if (!vivo) return;
        const fuera = leerDescartados();
        setAvisos(rows.filter((a) => !a.dismissible || !fuera.includes(a.id)));
      } catch { /* sin avisos, sin ruido */ }
    })();
    return () => { vivo = false; };
  }, []);

  const cerrar = (id: string) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
    try {
      const fuera = leerDescartados();
      localStorage.setItem(DESCARTADOS, JSON.stringify([...new Set([...fuera, id])].slice(-50)));
    } catch { /* privado */ }
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
            role={critico ? "alert" : "status"}
            className="flex items-start gap-3 rounded-xl border px-4 py-3"
            style={{
              borderColor: critico ? "var(--danger, #dc2626)" : aviso ? "var(--warning, #d97706)" : "var(--hairline)",
              background: critico ? "color-mix(in oklab, var(--danger, #dc2626) 8%, transparent)"
                : aviso ? "color-mix(in oklab, var(--warning, #d97706) 8%, transparent)"
                : "var(--float)",
            }}
          >
            <span className="mt-0.5 shrink-0">
              {critico ? <AlertTriangle size={16} /> : aviso ? <Info size={16} /> : <Megaphone size={16} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="whitespace-pre-wrap text-sm opacity-80">{a.body}</p>
            </div>
            {a.dismissible && (
              <button onClick={() => cerrar(a.id)} aria-label="Cerrar aviso" className="cg-focus shrink-0 rounded p-1 opacity-60 hover:opacity-100">
                <X size={15} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
