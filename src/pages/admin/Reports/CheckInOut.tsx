import { LogIn } from "lucide-react";
import { useTranslation } from "react-i18next";
import DataReport, { type ReportColumn } from "./DataReport";
import { formatDateTime, rangeBounds, REPORT_ROW_LIMIT, warnIfCapped } from "./reportFormat";
import attendanceService from "@/lib/api/attendanceService";

interface Rec {
  guardName?: { fullName?: string } | string | null;
  stationName?: { stationName?: string } | string | null;
  punchInTime?: string | null;
  punchOutTime?: string | null;
  hoursWorked?: number | null;
  lateMinutes?: number | null;
  status?: string | null;
}


// Backend sometimes returns the association object, sometimes a plain string.
const guard = (r: Rec) => (typeof r.guardName === "string" ? r.guardName : r.guardName?.fullName) || "—";
const station = (r: Rec) => (typeof r.stationName === "string" ? r.stationName : r.stationName?.stationName) || "—";

const columns: ReportColumn<Rec>[] = [
  { key: "guard", label: "Vigilante", value: guard, privacy: "guardName" },
  { key: "station", label: "Puesto", value: station },
  { key: "in", label: "Entrada", value: (r) => formatDateTime(r.punchInTime) },
  { key: "out", label: "Salida", value: (r) => formatDateTime(r.punchOutTime) },
  { key: "hours", label: "Horas", value: (r) => (r.hoursWorked != null ? Number(r.hoursWorked).toFixed(2) : "—"), align: "right" },
  { key: "late", label: "Atraso (min)", value: (r) => String(r.lateMinutes ?? 0), align: "right" },
  { key: "status", label: "Estado", value: (r) => r.status || "—" },
];

export default function CheckInOut() {
  const { t } = useTranslation();
  return (
    <DataReport<Rec>
      title={t("ui.CheckInOut.informeDeEntradaSalida", "Informe de Entrada/Salida")}
      description="Marcajes de asistencia (entrada, salida, horas y atrasos) por vigilante."
      icon={LogIn}
      columns={columns}
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
    />
  );
}
