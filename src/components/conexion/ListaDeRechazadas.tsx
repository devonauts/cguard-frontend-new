import { Ban, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { fechaYHora } from "@/lib/horaDeLaEmpresa";
import type { AccionRechazada } from "@/lib/api/conexionAppService";

/**
 * Qué era la acción, en palabras de operaciones. La app manda su propia
 * etiqueta («Entrada · Garita norte»); si no la hay, se deduce del tipo.
 */
export function nombreDeAccion(
  t: (k: string, d: string, o?: any) => unknown,
  a: Pick<AccionRechazada, "etiqueta" | "tipo" | "ruta">,
): string {
  if (a.etiqueta) return a.etiqueta;
  const x = `${a.tipo || ""} ${a.ruta || ""}`.toLowerCase();
  const tabla: Array<[RegExp, string, string]> = [
    [/sos|panic/, "conexionApp.accion.sos", "SOS"],
    [/clock-in|entrada/, "conexionApp.accion.entrada", "Entrada"],
    [/clock-out|salida/, "conexionApp.accion.salida", "Salida"],
    [/break|pausa/, "conexionApp.accion.pausa", "Pausa"],
    [/tag-scan|escaneo/, "conexionApp.accion.escaneo", "Escaneo de punto"],
    [/patrol|ronda/, "conexionApp.accion.ronda", "Ronda"],
    [/shift-notes|novedad/, "conexionApp.accion.novedad", "Novedad"],
    [/incident/, "conexionApp.accion.incidente", "Incidente"],
    [/visitor|visita/, "conexionApp.accion.visita", "Visita"],
    [/task|tarea/, "conexionApp.accion.tarea", "Tarea"],
    [/orders|consigna/, "conexionApp.accion.consigna", "Consigna"],
    [/memo/, "conexionApp.accion.memo", "Memo"],
    [/relevo/, "conexionApp.accion.relevo", "Relevo"],
    [/location|gps|rastro/, "conexionApp.accion.rastro", "Recorrido GPS"],
    [/route|ruta|stop/, "conexionApp.accion.ruta", "Ruta de supervisión"],
    [/coverage|cobertura/, "conexionApp.accion.cobertura", "Cobertura"],
  ];

  for (const [re, k, d] of tabla) if (re.test(x)) return String(t(k, d));

  return String(t("conexionApp.accion.otra", "Acción"));
}

/**
 * La lista de acciones hechas sin señal que NO entraron: rechazadas por el
 * servidor (con su motivo) o quitadas del teléfono sin enviar. Cada una con la
 * hora en que se hizo y la hora en que llegó.
 */
export function ListaDeRechazadas({
  filas,
  conNombre = false,
  max,
  vacio,
}: {
  filas: AccionRechazada[];
  /** En la vista de toda la empresa: quién la hizo. */
  conNombre?: boolean;
  max?: number;
  vacio?: string;
}) {
  const { t } = useTranslation();
  const visibles = max ? filas.slice(0, max) : filas;

  if (!visibles.length) {
    return vacio ? <div className="text-xs text-[color:var(--ink-soft)]">{vacio}</div> : null;
  }

  return (
    <ul className="space-y-2">
      {visibles.map((a) => {
        const descartada = a.estado === "descartada";

        return (
          <li key={a.id} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 shrink-0" style={{ color: descartada ? "var(--warn-text)" : "var(--bad-text)" }}>
              {descartada ? <Trash2 className="size-3.5" /> : <Ban className="size-3.5" />}
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-[color:var(--ink)]">
                {conNombre && a.nombre ? `${a.nombre} · ` : ""}
                {nombreDeAccion(t, a)}
                {" · "}
                {descartada
                  ? t("conexionApp.descartada", "Quitada del teléfono sin enviar")
                  : t("conexionApp.rechazada", "No se pudo registrar")}
              </div>
              {!descartada && (a.motivo || a.httpStatus) ? (
                <div className="text-[color:var(--ink)]">
                  {t("conexionApp.motivo", "Motivo: {{motivo}}", {
                    motivo: a.motivo || t("conexionApp.errorN", "error {{n}}", { n: a.httpStatus }),
                  })}
                </div>
              ) : null}
              <div className="text-[color:var(--ink-soft)]">
                {a.ocurridoEn
                  ? t("conexionApp.hechaALas", "Hecha {{hora}}", { hora: fechaYHora(a.ocurridoEn) })
                  : null}
                {a.ocurridoEn && a.llegoEn ? " · " : null}
                {a.llegoEn ? t("conexionApp.llegoALas", "llegó {{hora}}", { hora: fechaYHora(a.llegoEn) }) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
