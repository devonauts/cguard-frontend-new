import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

import { InfoNote } from "@/components/kit";
import { avisosDeRelevos, type SedeConVigencia } from "@/lib/eventos";

// ── LOS AVISOS DE RELEVOS QUE SE SALEN DEL EVENTO (crear y editar) ─────────

/**
 * Un relevo que empieza antes de que abra el evento o acaba después de que
 * cierre se recorta (nadie trabaja fuera del evento). Se avisa en línea, con
 * la hora a la que de verdad se entra o se sale.
 */
export function AvisosDeRelevos({
  sede,
  franjas,
  className,
}: {
  sede: SedeConVigencia | null | undefined;
  franjas: Array<{ start: string; end: string }>;
  className?: string;
}) {
  const { t } = useTranslation();
  const avisos = useMemo(
    () => avisosDeRelevos(sede, franjas),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sede?.vigenteDesde, sede?.vigenteHasta, JSON.stringify(franjas)],
  );

  if (!avisos.length) return null;

  return (
    <InfoNote
      className={className}
      icon={<AlertTriangle />}
      title={t("ui.RelevosDelEvento.avisos.titulo", "Revisa los horarios")}
      tone="warn"
    >
      <ul className="space-y-1">
        {avisos.map((a) => (
          <li key={`${a.relevo}-${a.tipo}`}>
            {a.tipo === "fuera"
              ? t("ui.RelevosDelEvento.avisos.fuera", {
                  defaultValue:
                    "El relevo {{relevo}} queda fuera de las horas del evento: nadie trabajaría en él. Cambia sus horas.",
                  relevo: a.relevo,
                })
              : a.tipo === "empiezaAntes"
                ? t(
                    a.variosDias
                      ? "ui.RelevosDelEvento.avisos.empiezaAntesPrimerDia"
                      : "ui.RelevosDelEvento.avisos.empiezaAntes",
                    {
                      defaultValue: a.variosDias
                        ? "El relevo {{relevo}} empieza antes de que abra el evento (a las {{hora}}). El primer día el vigilante entra a las {{hora}}."
                        : "El relevo {{relevo}} empieza antes de que abra el evento (a las {{hora}}). El vigilante entra a las {{hora}}.",
                      relevo: a.relevo,
                      hora: a.hora,
                    },
                  )
                : t(
                    a.variosDias
                      ? "ui.RelevosDelEvento.avisos.terminaDespuesUltimoDia"
                      : "ui.RelevosDelEvento.avisos.terminaDespues",
                    {
                      defaultValue: a.variosDias
                        ? "El relevo {{relevo}} termina después de que cierre el evento (a las {{hora}}). El último día el vigilante sale a las {{hora}}."
                        : "El relevo {{relevo}} termina después de que cierre el evento (a las {{hora}}). El vigilante sale a las {{hora}}.",
                      relevo: a.relevo,
                      hora: a.hora,
                    },
                  )}
          </li>
        ))}
      </ul>
    </InfoNote>
  );
}
