import { MapPin } from "lucide-react";
import DataReport, { type ReportColumn } from "./DataReport";
import { formatDateTime, formatMeters, rangeBounds, REPORT_ROW_LIMIT, warnIfCapped } from "./reportFormat";
import attendanceService from "@/lib/api/attendanceService";

interface Rec {
  guardName?: { fullName?: string } | null;
  stationName?: { stationName?: string } | null;
  punchInTime?: string | null;
  punchOutTime?: string | null;
  punchInDistanceM?: number | null;
  punchOutDistanceM?: number | null;
  punchInOutsideGeofence?: boolean | null;
  punchOutOutsideGeofence?: boolean | null;
}


const columns: ReportColumn<Rec>[] = [
  { key: "date", label: "Fecha", value: (r) => formatDateTime(r.punchInTime) },
  { key: "guard", label: "Vigilante", value: (r) => r.guardName?.fullName || "—" },
  { key: "station", label: "Puesto", value: (r) => r.stationName?.stationName || "—" },
  { key: "inDist", label: "Dist. entrada", value: (r) => formatMeters(r.punchInDistanceM), align: "right" },
  { key: "in", label: "Entrada", value: (r) => (r.punchInOutsideGeofence ? "Fuera de valla" : "OK"), align: "center" },
  { key: "outDist", label: "Dist. salida", value: (r) => formatMeters(r.punchOutDistanceM), align: "right" },
  { key: "out", label: "Salida", value: (r) => (r.punchOutOutsideGeofence ? "Fuera de valla" : "OK"), align: "center" },
];

export default function GeoFenceLog() {
  return (
    <DataReport<Rec>
      title="Registros de Geo Vallas"
      description="Marcajes realizados FUERA del perímetro (geo valla) del puesto, con la distancia al centro."
      icon={MapPin}
      // Todo lo que sale en este informe ES una salida del perímetro.
      tone="warn"
      columns={columns}
      rowTone={() => "warn"}
      emptyMessage="Sin marcajes fuera de la geo valla en este rango — todo dentro del perímetro."
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
        // El aviso se mide sobre los marcajes TRAÍDOS, no sobre las
        // infracciones: si el servidor recortó, faltan infracciones aunque la
        // lista final sea corta.
        const rows = warnIfCapped((res?.rows as Rec[]) || []);
        // Only the violations — a geo-fence LOG is about the breaches.
        return rows.filter((r) => r.punchInOutsideGeofence || r.punchOutOutsideGeofence);
      }}
    />
  );
}
