import { MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";

import DataReport, { type ReportColumn } from "./DataReport";
import {
  formatDateTime,
  formatMeters,
  rangeBounds,
  REPORT_ROW_LIMIT,
  warnIfCapped,
} from "./reportFormat";

import attendanceService from "@/lib/api/attendanceService";
import i18n from "@/i18n";

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
  {
    key: "date",
    label: "Fecha",
    labelKey: "reports.col.geoFenceLog.date",
    value: (r) => formatDateTime(r.punchInTime),
  },
  {
    key: "guard",
    label: "Vigilante",
    labelKey: "reports.col.geoFenceLog.guard",
    value: (r) => r.guardName?.fullName || "—",
    privacy: "guardName",
  },
  {
    key: "station",
    label: "Puesto",
    labelKey: "reports.col.geoFenceLog.station",
    value: (r) => r.stationName?.stationName || "—",
    privacy: "stationName",
  },
  {
    key: "inDist",
    label: "Dist. entrada",
    labelKey: "reports.col.geoFenceLog.inDist",
    value: (r) => formatMeters(r.punchInDistanceM),
    align: "right",
  },
  {
    key: "in",
    label: "Entrada",
    labelKey: "reports.col.geoFenceLog.in",
    value: (r) => (r.punchInOutsideGeofence ? i18n.t("ui.GeoFenceLog.fueraDeValla", "Fuera de valla") : "OK"),
    align: "center",
  },
  {
    key: "outDist",
    label: "Dist. salida",
    labelKey: "reports.col.geoFenceLog.outDist",
    value: (r) => formatMeters(r.punchOutDistanceM),
    align: "right",
  },
  {
    key: "out",
    label: "Salida",
    labelKey: "reports.col.geoFenceLog.out",
    value: (r) => (r.punchOutOutsideGeofence ? i18n.t("ui.GeoFenceLog.fueraDeValla", "Fuera de valla") : "OK"),
    align: "center",
  },
];

export default function GeoFenceLog() {
  const { t } = useTranslation();

  return (
    <DataReport<Rec>
      columns={columns}
      description={t("ui.GeoFenceLog.descripcion", "Marcajes realizados FUERA del perímetro (geo valla) del puesto, con la distancia al centro.")}
      emptyMessage={t("ui.GeoFenceLog.sinMarcajesFuera", "Sin marcajes fuera de la geo valla en este rango — todo dentro del perímetro.")}
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
      rowTone={() => "warn"}
      title={t('ui.GeoFenceLog.registrosDeGeoVallas', 'Registros de Geo Vallas')}
      icon={MapPin}
      // Todo lo que sale en este informe ES una salida del perímetro.
      tone="warn"
    />
  );
}
