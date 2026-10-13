import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

import { soloHora } from "@/lib/horaDeLaEmpresa";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «OCURRIÓ HACE 40 MIN · ENVIADO SIN SEÑAL»
 *
 * Un SOS o un incidente que el teléfono guardó sin cobertura llega a la central
 * cuando vuelve la señal. Sin esta franja se ve como si acabara de pasar, y el
 * operador despacha a un sitio donde la emergencia empezó hace media hora. Se
 * dice ARRIBA y en rojo: cambia lo que hay que hacer.
 *
 * Acepta lo que traiga el servidor (`llegoTarde`, `minutosTarde`, `ocurridoEn`,
 * `llegoEn`) o, para registros sin esos campos, una marca de
 * `/sin-senal/marcas` (`ocurridoEn` + `llegoEn`).
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface DatosDeLlegada {
  llegoTarde?: boolean | null;
  minutosTarde?: number | null;
  ocurridoEn?: string | null;
  llegoEn?: string | null;
}

/** Menos que esto entre que pasó y que llegó no es «llegar tarde». */
const MARGEN_MIN = 2;

/** Saca los datos de llegada de un payload, de su `incident` o de una marca. */
export function llegadaDe(...fuentes: Array<any>): DatosDeLlegada | null {
  for (const f of fuentes) {
    if (!f || typeof f !== "object") continue;
    // El servidor lo manda anidado en `sinSenal` (avisos de pánico e
    // incidentes); se acepta también plano y dentro de `incident`.
    const base = f.incident && typeof f.incident === "object" && !("ocurridoEn" in f) && !f.sinSenal ? f.incident : f;
    const x = base.sinSenal && typeof base.sinSenal === "object" ? base.sinSenal : base;
    const ocurridoEn = x.ocurridoEn ?? null;
    const llegoEn = x.llegoEn ?? null;
    let minutos = typeof x.minutosTarde === "number" ? x.minutosTarde : null;

    if (minutos == null && ocurridoEn && llegoEn) {
      minutos = Math.round((new Date(llegoEn).getTime() - new Date(ocurridoEn).getTime()) / 60_000);
    }
    const tarde = x.llegoTarde === true || (minutos != null && minutos >= MARGEN_MIN);

    if (tarde) return { llegoTarde: true, minutosTarde: minutos, ocurridoEn, llegoEn };
  }

  return null;
}

export function AvisoLlegoTarde({
  datos,
  compacto = false,
  className = "",
}: {
  datos?: DatosDeLlegada | null;
  /** Para listas: una sola línea, sin el detalle de horas. */
  compacto?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!datos?.llegoTarde) return null;
  const haceMin = datos.ocurridoEn
    ? Math.max(0, Math.round((Date.now() - new Date(datos.ocurridoEn).getTime()) / 60_000))
    : datos.minutosTarde ?? 0;
  const titular = String(
    t("conexionApp.ocurrioHace", "Ocurrió hace {{count}} min · enviado sin señal", { count: haceMin }),
  );
  const detalle =
    datos.ocurridoEn && datos.llegoEn
      ? String(
          t("conexionApp.ocurrioYLlego", "Ocurrió a las {{ocurrio}} · llegó a la central a las {{llego}} ({{count}} min después)", {
            ocurrio: soloHora(datos.ocurridoEn),
            llego: soloHora(datos.llegoEn),
            count: datos.minutosTarde ?? 0,
          }),
        )
      : "";

  if (compacto) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
        style={{ background: "color-mix(in oklab, var(--bad) 16%, transparent)", color: "var(--bad-text)" }}
        title={detalle || titular}
      >
        <WifiOff className="size-3" />
        {titular}
      </span>
    );
  }

  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-xl px-3 py-2 ${className}`}
      style={{
        background: "color-mix(in oklab, var(--bad) 14%, transparent)",
        border: "1px solid color-mix(in oklab, var(--bad) 45%, transparent)",
        color: "var(--bad-text)",
      }}
    >
      <WifiOff className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-bold">{titular}</div>
        {detalle ? <div className="text-xs opacity-90">{detalle}</div> : null}
      </div>
    </div>
  );
}
