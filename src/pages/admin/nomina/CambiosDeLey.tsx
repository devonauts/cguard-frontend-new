/**
 * CHANGES OF THE LAW — Configuración › Asistencia › Reglas de pago.
 *
 * The law's dated changes for the company's country (backend
 * lib/payroll/legalCalendar): each one with what it will do to THIS company
 * («se aplicará sola el 16 dic 2026», «se mantiene su valor propio»), a switch
 * to stop following them, and the collective agreements to review. Nothing is
 * applied without being shown here first.
 */
import { useTranslation } from "react-i18next";
import { Landmark, TriangleAlert } from "lucide-react";

import { soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import {
  conOmitido, type AvisoDeConvenio, type CambioConEstado, type CampoFechado, type EleccionDeLeyes,
} from "@/lib/cambiosDeLey";

export function fechaDeLey(ymd: string): string {
  return soloFechaCivil(ymd, { day: "numeric", month: "short", year: "numeric" });
}

export function useNombreDelCampo() {
  const { t } = useTranslation();
  return (campo: CampoFechado) =>
    ({
      horasOrdinariasSemana: t("ui.CambiosDeLey.campo.jornadaSemanal", "Jornada semanal"),
      domingoRecargoPct: t("ui.CambiosDeLey.campo.domingo", "Recargo dominical"),
      feriadoRecargoPct: t("ui.CambiosDeLey.campo.feriado", "Recargo en feriado"),
      descansoRecargoPct: t("ui.CambiosDeLey.campo.descanso", "Recargo por día de descanso"),
    })[campo];
}

export function valorDelCampo(campo: CampoFechado, v: number): string {
  return campo === "horasOrdinariasSemana" ? `${v} h` : `+${v} %`;
}

export default function CambiosDeLey({
  cambios,
  avisos,
  leyes,
  onChange,
}: {
  cambios: CambioConEstado[];
  avisos: AvisoDeConvenio[];
  leyes: EleccionDeLeyes;
  onChange: (l: EleccionDeLeyes) => void;
}) {
  const { t } = useTranslation();
  const nombre = useNombreDelCampo();

  if (!cambios.length && !avisos.length) return null;

  const estadoTexto = (c: CambioConEstado) => {
    const fecha = fechaDeLey(c.effectiveFrom);
    switch (c.estado) {
      case "seAplica":
        return c.vigente
          ? t("ui.CambiosDeLey.estado.vigente", { fecha, defaultValue: "En vigor desde el {{fecha}}" })
          : t("ui.CambiosDeLey.estado.seAplicara", { fecha, defaultValue: "Se aplicará sola el {{fecha}}" });
      case "valorPropio":
        return t("ui.CambiosDeLey.estado.valorPropio", {
          valor: valorDelCampo(c.field, c.valorDeLaEmpresa),
          defaultValue: "No cambia: tu empresa usa {{valor}}, un valor propio",
        });
      case "omitido":
        return t("ui.CambiosDeLey.estado.omitido", "No se aplicará: tu empresa lo omitió");
      default:
        return t("ui.CambiosDeLey.estado.apagado", "No se aplicará: los cambios de ley están apagados");
    }
  };

  return (
    <div className="glass-flat space-y-3 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Landmark size={15} /> {t("ui.CambiosDeLey.titulo", "Cambios de ley con fecha")}
      </div>

      {avisos.map((a) => (
        <div
          key={a.id}
          role="status"
          className="flex gap-2 rounded-lg p-2.5 text-xs"
          style={{ background: "color-mix(in oklab, var(--warn) 12%, transparent)", border: "1px solid color-mix(in oklab, var(--warn) 30%, transparent)" }}
        >
          <TriangleAlert size={15} className="mt-0.5 shrink-0" style={{ color: "var(--warn-text)" }} />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">
              {t("ui.CambiosDeLey.convenioVence", {
                convenio: a.agreement,
                fecha: fechaDeLey(a.expires),
                defaultValue: "El convenio «{{convenio}}» vence el {{fecha}}.",
              })}
            </p>
            <p>
              {t(
                "ui.CambiosDeLey.convenioRevisar",
                "Revisa con tu asesor qué rige después y ajusta tus reglas de pago. No cambiamos nada por nuestra cuenta: los valores nuevos aún no se conocen.",
              )}
            </p>
            <p style={{ color: "var(--ink-faint)" }}>{a.sources.join(" · ")}</p>
          </div>
        </div>
      ))}

      {cambios.length > 0 && (
        <>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              className="cg-focus mt-0.5 size-4"
              style={{ accentColor: "var(--brand)" }}
              checked={leyes.seguirCambios}
              onChange={(e) => onChange({ ...leyes, seguirCambios: e.target.checked })}
            />
            <span className="min-w-0">
              <span className="block text-sm">{t("ui.CambiosDeLey.seguir", "Aplicar los cambios de la ley en su fecha")}</span>
              <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.CambiosDeLey.seguirAyuda",
                  "Sólo cambia un valor que esté en la cifra de la ley. Si tu empresa paga otro valor (convenio o contrato), se mantiene. Las tarjetas ya aprobadas no se recalculan.",
                )}
              </span>
            </span>
          </label>

          <ul className="space-y-2">
            {cambios.map((c) => (
              <li key={c.id} className="rounded-lg border p-2.5 text-sm" style={{ borderColor: "var(--hairline)" }}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium">
                    {fechaDeLey(c.effectiveFrom)} · {nombre(c.field)}: {valorDelCampo(c.field, c.from)} → {valorDelCampo(c.field, c.to)}
                  </span>
                  <span className="text-xs" style={{ color: c.estado === "seAplica" ? "var(--ok-text)" : "var(--ink-soft)" }}>
                    {estadoTexto(c)}
                  </span>
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--ink-faint)" }}>
                  {c.sources.join(" · ")}
                </p>
                {leyes.seguirCambios && !c.vigente && (c.estado === "seAplica" || c.estado === "omitido") && (
                  <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="cg-focus size-3.5"
                      style={{ accentColor: "var(--brand)" }}
                      checked={c.estado === "omitido"}
                      onChange={(e) => onChange(conOmitido(leyes, c.id, e.target.checked))}
                    />
                    {t("ui.CambiosDeLey.omitir", "No aplicar este cambio")}
                  </label>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
