// src/config/reportesDeMultimarca.ts
//
// Module «Multimarca» (phase 5 default): «Horas entre marcas» gets a card in
// the reports center's payroll section, only with the module and for whoever
// reads attendance. Pure (no i18n here: Reports.tsx translates the keys).
import type { ReportCard, ReportSection } from "@/config/reports-config";

export const HORAS_ENTRE_MARCAS: ReportCard = {
  id: "cross-brand-hours",
  title: "Horas entre marcas",
  titleKey: "ui.HorasEntreMarcas.titulo",
  description: "Horas aprobadas de una marca en sitios de otra, con el importe a liquidar entre empresas.",
  descriptionKey: "ui.Reports.horasEntreMarcasDesc",
  href: "/reports/horas-entre-marcas",
};

export function seccionesConMultimarca(base: ReportSection[], conMultimarca: boolean): ReportSection[] {
  if (!conMultimarca) return base;

  return base.map((s) => (s.id === "payroll" ? { ...s, reports: [HORAS_ENTRE_MARCAS, ...s.reports] } : s));
}
