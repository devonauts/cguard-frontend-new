/**
 * LOS DÍAS DE UNA TARJETA DE NÓMINA — con su descanso.
 *
 * Decisión del dueño (2026-10-14): «horas netas está bien, deberíamos poner los
 * descansos en días». La tarjeta paga en el puesto MENOS descansos, y aquí se ve
 * día por día: entrada, salida, tiempo en el puesto, descanso y lo que se paga.
 * Las tres columnas cuadran siempre (en el puesto − descanso = netas) porque las
 * calcula el servidor con la misma regla que el evento y Gusto.
 *
 * Una tarjeta aprobada antes de ese cambio no trae el desglose: se enseña lo
 * que se aprobó, con «—» donde no hay dato. No se recalcula: es lo que se pagó.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";

import { Modal } from "@/components/kit";
import { soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import type { TarjetaDeNomina } from "@/lib/api/payrollService";
import { fmtDescanso, fmtHours, fmtTime } from "./shared";

// [clave, texto por defecto] — se traduce al pintar.
const ESTADO_DIA: Record<string, [string, string]> = {
  trabajado: ["ui.DiasDeLaTarjeta.estado.trabajado", "Trabajado"],
  atraso: ["ui.DiasDeLaTarjeta.estado.atraso", "Atraso"],
  salida_antes: ["ui.DiasDeLaTarjeta.estado.salida_antes", "Salió antes"],
  extra: ["ui.DiasDeLaTarjeta.estado.extra", "Se quedó más"],
  falta: ["ui.DiasDeLaTarjeta.estado.falta", "Falta"],
  justificado: ["ui.DiasDeLaTarjeta.estado.justificado", "Justificado"],
  cubierto: ["ui.DiasDeLaTarjeta.estado.cubierto", "Cubierto por otro"],
  cubriendo: ["ui.DiasDeLaTarjeta.estado.cubriendo", "Cubriendo"],
  trasladado: ["ui.DiasDeLaTarjeta.estado.trasladado", "En otro puesto"],
  sin_marcar: ["ui.DiasDeLaTarjeta.estado.sin_marcar", "Sin resolver"],
  no_planificado: ["ui.DiasDeLaTarjeta.estado.no_planificado", "Sin turno"],
  programado: ["ui.DiasDeLaTarjeta.estado.programado", "Programado"],
};

/* La hora como en Registros de asistencia (`fmtTime`): 12 o 24 h según el
   idioma de quien mira, en la zona de la empresa. Aquí iba fija en 24 h y la
   misma entrada se leía distinta en las dos pantallas. */
const hm = (v: string | null | undefined) => (v ? fmtTime(v) : "—");

export default function DiasDeLaTarjeta({
  tarjeta,
  onClose,
}: {
  tarjeta: TarjetaDeNomina | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  /* En una ventana estrecha la tabla se desliza de lado, y nada lo decía:
     Descanso y Netas —lo que se paga— quedaban fuera sin pista. El borde
     derecho se desvanece mientras quede algo por ver. */
  const carril = useRef<HTMLDivElement | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const medir = useCallback(() => {
    const el = carril.current;

    setHayMas(!!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);

    return () => window.removeEventListener("resize", medir);
  }, [medir, tarjeta]);

  if (!tarjeta) return null;
  const dias = tarjeta.detalle?.dias || [];
  const totales = (tarjeta.detalle?.totales || {}) as Record<string, unknown>;
  const conDesglose = dias.some((d) => d.descansoMinutos !== undefined);

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      size="xl"
      icon={<CalendarDays />}
      title={tarjeta.nombre || "—"}
      description={t("ui.DiasDeLaTarjeta.subtitulo", {
        desde: soloFechaCivil(tarjeta.periodoDesde),
        hasta: soloFechaCivil(tarjeta.periodoHasta),
        defaultValue: "Día por día, del {{desde}} al {{hasta}}",
      })}
    >
      <div className="max-h-[70vh] overflow-y-auto p-4">
        {!conDesglose && dias.length > 0 && (
          <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
            {/* Aprobada o exportada, volver a generar no la toca: decirle a
                la oficina que regenere era mandarla a un callejón. */}
            {tarjeta.estado === "exportada"
              ? t(
                  "ui.DiasDeLaTarjeta.sinDesgloseExportada",
                  "Esta tarjeta ya se exportó y queda como está: se generó antes de mostrar el descanso por día, así que ese desglose no está disponible para ella. El total es el que se exportó.",
                )
              : tarjeta.estado === "aprobada"
              ? t(
                  "ui.DiasDeLaTarjeta.sinDesgloseAprobada",
                  "Esta tarjeta ya está aprobada y queda como está: se generó antes de mostrar el descanso por día, así que ese desglose no está disponible para ella. El total es el que se aprobó.",
                )
              : t(
                  "ui.DiasDeLaTarjeta.sinDesglose",
                  "Esta tarjeta se generó antes de mostrar el descanso por día. Vuelve a generar el periodo para verlo (las tarjetas aprobadas no cambian).",
                )}
          </p>
        )}
        {/* La pista es una máscara y no un velo: el fondo del diálogo es
            vidrio translúcido y un degradado de color no casaba con él. */}
        <div
          ref={carril}
          className="overflow-x-auto"
          style={
            hayMas
              ? {
                  maskImage:
                    "linear-gradient(to right, #000 calc(100% - 2.5rem), transparent)",
                  WebkitMaskImage:
                    "linear-gradient(to right, #000 calc(100% - 2.5rem), transparent)",
                }
              : undefined
          }
          onScroll={medir}
        >
          {/* Entrada y salida van una encima de otra y la estación debajo del
              día: así caben Descanso y Netas sin deslizar en casi cualquier
              ventana. Las cifras no se parten («0.00 h» en dos líneas). */}
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--ink-soft)" }}>
                <th className="px-2 py-2 font-medium">
                  {t("ui.DiasDeLaTarjeta.dia", "Día")} · {t("ui.Schedule.estacion", "Estación")}
                </th>
                <th className="whitespace-nowrap px-2 py-2 font-medium">
                  {t("ui.NominaRecords.entrada", "Entrada")} / {t("ui.NominaRecords.salida", "Salida")}
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  {t("ui.DiasDeLaTarjeta.enElPuesto", "En el puesto")}
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  {t("ui.NominaRecords.descanso", "Descanso")}
                </th>
                <th className="px-2 py-2 text-right font-medium">
                  {t("ui.NominaRecords.horasNetas", "Horas netas")}
                </th>
                <th className="px-2 py-2 font-medium">{t("comun.estado", "Estado")}</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d, i) => (
                <tr
                  key={`${d.fecha}-${i}`}
                  className="border-t align-top"
                  style={{ borderColor: "var(--hairline)" }}
                >
                  <td className="px-2 py-2">
                    <span className="block whitespace-nowrap tabular-nums">
                      {soloFechaCivil(d.fecha)}
                    </span>
                    {d.puesto && (
                      <span
                        className="block max-w-[10rem] truncate text-xs"
                        style={{ color: "var(--ink-soft)" }}
                        title={d.puesto}
                      >
                        {d.puesto}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                    {d.real ? (
                      <>
                        <span className="block">{hm(d.real.entrada)}</span>
                        <span className="block" style={{ color: "var(--ink-soft)" }}>
                          {hm(d.real.salida)}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                    {d.real && d.horasEnElPuesto !== undefined ? fmtHours(d.horasEnElPuesto) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                    {d.real ? fmtDescanso(d.descansoMinutos) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums">
                    {d.real ? fmtHours(d.real.horas) : "—"}
                  </td>
                  <td className="px-2 py-2">
                    {ESTADO_DIA[d.estado] ? t(ESTADO_DIA[d.estado][0], ESTADO_DIA[d.estado][1]) : d.estado}
                    {d.motivo && (
                      <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>
                        {d.motivo}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold" style={{ borderColor: "var(--hairline)" }}>
                <td className="px-2 py-2" colSpan={2}>
                  {t("ui.DiasDeLaTarjeta.totalDelPeriodo", "Total del periodo")}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                  {totales.horasEnElPuesto != null ? fmtHours(Number(totales.horasEnElPuesto)) : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                  {totales.descansoMinutos != null ? fmtDescanso(Number(totales.descansoMinutos)) : "—"}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                  {fmtHours(Number(tarjeta.horas))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Modal>
  );
}
