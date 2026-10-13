import { LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";

import DataReport, { type ReportColumn } from "./DataReport";
import {
  formatDateTime,
  rangeBounds,
  REPORT_ROW_LIMIT,
  warnIfCapped,
} from "./reportFormat";

import attendanceService from "@/lib/api/attendanceService";

interface Rec {
  id?: string;
  guardName?: { fullName?: string } | string | null;
  stationName?: { stationName?: string } | string | null;
  punchInTime?: string | null;
  punchOutTime?: string | null;
  hoursWorked?: number | null;
  lateMinutes?: number | null;
  status?: string | null;
}

// Backend sometimes returns the association object, sometimes a plain string.
const guard = (r: Rec) =>
  (typeof r.guardName === "string" ? r.guardName : r.guardName?.fullName) ||
  "—";
const station = (r: Rec) =>
  (typeof r.stationName === "string"
    ? r.stationName
    : r.stationName?.stationName) || "—";

const columns: ReportColumn<Rec>[] = [
  {
    key: "guard",
    label: "Vigilante",
    labelKey: "reports.col.checkInOut.guard",
    value: guard,
    privacy: "guardName",
  },
  {
    key: "station",
    label: "Puesto",
    labelKey: "reports.col.checkInOut.station",
    value: station,
  },
  {
    key: "in",
    label: "Entrada",
    labelKey: "reports.col.checkInOut.in",
    value: (r) => formatDateTime(r.punchInTime),
  },
  {
    key: "out",
    label: "Salida",
    labelKey: "reports.col.checkInOut.out",
    value: (r) => formatDateTime(r.punchOutTime),
  },
  {
    key: "hours",
    label: "Horas",
    labelKey: "reports.col.checkInOut.hours",
    value: (r) =>
      r.hoursWorked != null ? Number(r.hoursWorked).toFixed(2) : "—",
    align: "right",
  },
  {
    key: "late",
    label: "Atraso (min)",
    labelKey: "reports.col.checkInOut.late",
    value: (r) => String(r.lateMinutes ?? 0),
    align: "right",
  },
  {
    key: "status",
    label: "Estado",
    labelKey: "reports.col.checkInOut.status",
    value: (r) => r.status || "—",
  },
];

export default function CheckInOut() {
  const { t } = useTranslation();

  return (
    <DataReport<Rec>
      columns={columns}
      // Entradas/salidas marcadas sin señal que llegaron después.
      idSinSenal={(r) => r.id}
      description={t("ui.CheckInOut.descripcion", "Marcajes de asistencia (entrada, salida, horas y atrasos) por vigilante.")}
      icon={LogIn}
      load={async ({ from, to }) => {
        // El rango ya viajaba en la consulta; lo que faltaba era que el tope
        // dejara de recortar en silencio.
        const { start, end } = rangeBounds(from, to);
        const res = await attendanceService.list({
          "filter[punchInTimeRange][0]": start,
          "filter[punchInTimeRange][1]": end,
          limit: REPORT_ROW_LIMIT,
          orderBy: "punchInTime_DESC",
        });

        return warnIfCapped((res?.rows as Rec[]) || []);
      }}
      title={t(
        "ui.CheckInOut.informeDeEntradaSalida",
        "Informe de Entrada/Salida",
      )}
    />
  );
}
