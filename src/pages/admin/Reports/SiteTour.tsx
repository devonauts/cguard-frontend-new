import { Route } from "lucide-react";
import DataReport, { type ReportColumn } from "./DataReport";
import { formatDateTime, rangeBounds, REPORT_ROW_LIMIT, warnIfCapped } from "./reportFormat";
import { ApiService } from "@/services/api/apiService";

interface TagScan {
  id: string;
  scannedAt?: string | null;
  validLocation?: boolean | null;
  distanceMeters?: number | null;
  tag?: { name?: string; tagIdentifier?: string; siteTour?: { name?: string } } | null;
  guard?: { fullName?: string } | null;
  station?: { stationName?: string } | null;
}


const columns: ReportColumn<TagScan>[] = [
  { key: "scanned", label: "Fecha/Hora", value: (r) => formatDateTime(r.scannedAt) },
  { key: "tour", label: "Recorrido", value: (r) => r.tag?.siteTour?.name || "—" },
  { key: "tag", label: "Punto (etiqueta)", value: (r) => r.tag?.name || r.tag?.tagIdentifier || "—" },
  { key: "guard", label: "Vigilante", value: (r) => r.guard?.fullName || "—", privacy: "guardName" },
  { key: "station", label: "Estación", value: (r) => r.station?.stationName || "—" },
  { key: "valid", label: "Ubicación", value: (r) => (r.validLocation ? "Válida" : "Fuera de rango"), align: "center" },
  { key: "dist", label: "Distancia (m)", value: (r) => (r.distanceMeters != null ? Number(r.distanceMeters).toFixed(0) : "—"), align: "right" },
];

export default function SiteTour() {
  return (
    <DataReport<TagScan>
      title="Informe de Recorridos del Sitio"
      description="Escaneos de rondas: puntos de control marcados por vigilante, con validación de ubicación."
      icon={Route}
      columns={columns}
      // Un punto marcado fuera de rango es una anomalía, no un dato más.
      rowTone={(r) => (r.validLocation === false ? "warn" : undefined)}
      load={async ({ from, to }) => {
        const tenantId = localStorage.getItem("tenantId") || "";
        // El rango (`scannedAt`) va EN LA CONSULTA. Antes se pedían los 2000
        // escaneos más recientes y se recortaba aquí: un rango antiguo se
        // exportaba vacío.
        const { start, end } = rangeBounds(from, to);
        const params = new URLSearchParams({ from: start, to: end, limit: String(REPORT_ROW_LIMIT) });
        const res: TagScan[] | { rows?: TagScan[] } = await ApiService.get(
          `/tenant/${tenantId}/site-tour/tag-scans?${params.toString()}`,
        );
        const rows: TagScan[] = Array.isArray(res) ? res : res?.rows || [];
        return warnIfCapped(rows);
      }}
    />
  );
}
