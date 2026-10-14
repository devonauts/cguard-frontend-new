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
import { useTranslation } from "react-i18next";
import { CalendarDays } from "lucide-react";

import { Modal } from "@/components/kit";
import { soloFechaCivil, soloHora } from "@/lib/horaDeLaEmpresa";
import type { TarjetaDeNomina } from "@/lib/api/payrollService";
import { fmtDescanso, fmtHours } from "./shared";

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

const hm = (v: string | null | undefined) =>
  v ? soloHora(v, { hourCycle: "h23" }) : "—";

export default function DiasDeLaTarjeta({
  tarjeta,
  onClose,
}: {
  tarjeta: TarjetaDeNomina | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

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
      <div className="max-h-[70vh] overflow-auto p-4">
        {!conDesglose && dias.length > 0 && (
          <p className="mb-3 text-xs" style={{ color: "var(--ink-soft)" }}>
            {t(
              "ui.DiasDeLaTarjeta.sinDesglose",
              "Esta tarjeta se generó antes de mostrar el descanso por día. Vuelve a generar el periodo para verlo (las tarjetas aprobadas no cambian).",
            )}
          </p>
        )}
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs" style={{ color: "var(--ink-soft)" }}>
              <th className="px-2 py-2 font-medium">{t("ui.DiasDeLaTarjeta.dia", "Día")}</th>
              <th className="px-2 py-2 font-medium">{t("comun.puesto", "Puesto")}</th>
              <th className="px-2 py-2 font-medium">{t("ui.NominaRecords.entrada", "Entrada")}</th>
              <th className="px-2 py-2 font-medium">{t("ui.NominaRecords.salida", "Salida")}</th>
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
                <td className="px-2 py-2 tabular-nums">{soloFechaCivil(d.fecha)}</td>
                <td className="px-2 py-2">{d.puesto || "—"}</td>
                <td className="px-2 py-2 tabular-nums">{hm(d.real?.entrada)}</td>
                <td className="px-2 py-2 tabular-nums">{hm(d.real?.salida)}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {d.real && d.horasEnElPuesto !== undefined ? fmtHours(d.horasEnElPuesto) : "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {d.real ? fmtDescanso(d.descansoMinutos) : "—"}
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums">
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
              <td className="px-2 py-2" colSpan={4}>
                {t("ui.DiasDeLaTarjeta.totalDelPeriodo", "Total del periodo")}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {totales.horasEnElPuesto != null ? fmtHours(Number(totales.horasEnElPuesto)) : "—"}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {totales.descansoMinutos != null ? fmtDescanso(Number(totales.descansoMinutos)) : "—"}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{fmtHours(Number(tarjeta.horas))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}
