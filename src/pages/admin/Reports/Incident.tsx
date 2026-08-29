import { AlertTriangle } from "lucide-react";
import { useTranslation } from 'react-i18next';
import DataReport, { type ReportColumn } from "./DataReport";
import { formatDateTime, rangeBounds, REPORT_ROW_LIMIT, warnIfCapped } from "./reportFormat";
import { ApiService } from "@/services/api/apiService";

interface Incident {
  id: string;
  createdAt?: string | null;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  location?: string | null;
  postSite?: { name?: string } | null;
  station?: { stationName?: string } | null;
}


const trim = (s?: string | null, n = 80) => {
  const v = (s || "").trim();
  return v.length > n ? `${v.slice(0, n)}…` : v || "—";
};

const columns: ReportColumn<Incident>[] = [
  { key: "created", label: "Fecha", value: (r) => formatDateTime(r.createdAt) },
  { key: "title", label: "Título", value: (r) => r.title || "—" },
  { key: "priority", label: "Prioridad", value: (r) => r.priority || "—", align: "center" },
  { key: "status", label: "Estado", value: (r) => r.status || "—" },
  { key: "site", label: "Puesto/Estación", value: (r) => r.postSite?.name || r.station?.stationName || "—" },
  { key: "location", label: "Ubicación", value: (r) => r.location || "—" },
  { key: "desc", label: "Descripción", value: (r) => trim(r.description) },
];

export default function Incident() {
  const { t } = useTranslation();
  return (
    <DataReport<Incident>
      title={t("ui.Incident.informeDeIncidente", "Informe de Incidente")}
      description="Incidentes reportados: prioridad, estado, ubicación y descripción por puesto."
      icon={AlertTriangle}
      tone="bad"
      columns={columns}
      // Un incidente de prioridad alta/crítica todavía abierto se señala en rojo.
      rowTone={(r) => {
        const p = String(r.priority || "").toLowerCase();
        const abierto = !/closed|cerrado|resolved|resuelto/i.test(String(r.status || ""));
        if (/critical|crítica|critica|alta|high|urgent/.test(p)) return abierto ? "bad" : "warn";
        return undefined;
      }}
      load={async ({ from, to }) => {
        const tenantId = localStorage.getItem("tenantId") || "";
        // Filter by date range on the SERVER (filter[createdAtRange]) — the old
        // limit=2000 + client-side date filter silently dropped any range older
        // than the newest 2000 incidents.
        const { start, end } = rangeBounds(from, to);
        const params = new URLSearchParams();
        params.append("filter[createdAtRange][]", start);
        params.append("filter[createdAtRange][]", end);
        params.append("orderBy", "createdAt_DESC");
        params.append("limit", String(REPORT_ROW_LIMIT));
        const res: Incident[] | { rows?: Incident[] } = await ApiService.get(
          `/tenant/${tenantId}/incident?${params.toString()}`,
        );
        const rows: Incident[] = Array.isArray(res) ? res : res?.rows || [];
        return warnIfCapped(rows);
      }}
    />
  );
}
