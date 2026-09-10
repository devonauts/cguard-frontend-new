import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import DataReport, { type ReportColumn } from "./DataReport";
import {
  formatDateTime,
  rangeBounds,
  REPORT_ROW_LIMIT,
  warnIfCapped,
} from "./reportFormat";

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
  /** El caso del Centro de Emergencias que atiende este incidente, si lo hay
   *  (un pánico crea los dos). Lo adjunta el listado del servidor. */
  alarmCaseId?: string | null;
}

const trim = (s?: string | null, n = 80) => {
  const v = (s || "").trim();

  return v.length > n ? `${v.slice(0, n)}…` : v || "—";
};

const columns: ReportColumn<Incident>[] = [
  {
    key: "created",
    label: "Fecha",
    labelKey: "reports.col.incident.created",
    value: (r) => formatDateTime(r.createdAt),
  },
  {
    key: "title",
    label: "Título",
    labelKey: "reports.col.incident.title",
    value: (r) => r.title || "—",
  },
  {
    key: "priority",
    label: "Prioridad",
    labelKey: "reports.col.incident.priority",
    value: (r) => r.priority || "—",
    align: "center",
  },
  {
    key: "status",
    label: "Estado",
    labelKey: "reports.col.incident.status",
    value: (r) => r.status || "—",
  },
  {
    key: "site",
    label: "Puesto/Estación",
    labelKey: "reports.col.incident.site",
    value: (r) => r.postSite?.name || r.station?.stationName || "—",
  },
  {
    key: "location",
    label: "Ubicación",
    labelKey: "reports.col.incident.location",
    value: (r) => r.location || "—",
  },
  {
    key: "desc",
    label: "Descripción",
    labelKey: "reports.col.incident.desc",
    value: (r) => trim(r.description),
  },
];

export default function Incident() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <DataReport<Incident>
      description="Incidentes reportados: prioridad, estado, ubicación y descripción por puesto."
      icon={AlertTriangle}
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
      rowTone={(r) => {
        const p = String(r.priority || "").toLowerCase();
        const abierto = !/closed|cerrado|resolved|resuelto/i.test(String(r.status || ""));
        if (/critical|crítica|critica|alta|high|urgent/.test(p)) return abierto ? "bad" : "warn";
        return undefined;
      }}
      columns={columns}
      /* ── LA FILA TIENE QUE LLEVAR A ALGUNA PARTE ────────────────────────────
         Un pánico aparece aquí y la fila no se podía ni tocar: sin acción, sin
         ficha y —hasta el arreglo del espejo en el servidor— mostrando
         «abierto» aunque ya se hubiera cerrado en el Centro de Emergencias.
         Ahí es donde se atiende de verdad una emergencia (reconocer, despachar,
         cerrar, con su bitácora), así que la fila lleva al caso. Los incidentes
         que no nacieron de un pánico no tienen caso: se dice, en vez de dejar
         una fila que a veces responde y a veces no — que es peor que una que
         nunca responde. */
      onRowClick={(r) => {
        if (r.alarmCaseId) { navigate(`/alarm/case/${r.alarmCaseId}`); return; }
        toast.info(t("ui.Incident.sinCaso", "Este incidente no tiene un caso de emergencia asociado."));
      }}
      title={t("ui.Incident.informeDeIncidente", "Informe de Incidente")}
      // Un incidente de prioridad alta/crítica todavía abierto se señala en rojo.
      tone="bad"
    />
  );
}
