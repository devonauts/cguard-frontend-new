import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Route } from "lucide-react";
import DataReport, { type ReportColumn } from "./DataReport";
import { formatDateTime, rangeBounds, REPORT_ROW_LIMIT, warnIfCapped } from "./reportFormat";
import { ApiService } from "@/services/api/apiService";
import ScanDetailModal, { type VeredictoRevision } from "@/components/rondas/ScanDetailModal";

interface TagScan {
  id: string;
  scannedAt?: string | null;
  validLocation?: boolean | null;
  distanceMeters?: number | null;
  reviewStatus?: VeredictoRevision | null;
  tag?: { name?: string; tagIdentifier?: string; siteTour?: { name?: string } } | null;
  guard?: { fullName?: string } | null;
  station?: { stationName?: string } | null;
}

/** El veredicto de la revisión manual, en una palabra. */
const revisionTexto = (e?: VeredictoRevision | null) =>
  e === "accepted" ? "Aceptado" : e === "rejected" ? "Rechazado" : "Sin revisar";

export default function SiteTour() {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const [escaneoId, setEscaneoId] = useState<string | null>(null);
  // Cambiar un veredicto no debe obligar a recargar el informe entero: se
  // recarga la tabla en su sitio (`DataReport` vuelve a pedir el rango).
  const recargar = useRef<(() => void) | null>(null);

  // Las etiquetas se arman DENTRO del componente: una constante de módulo se
  // evalúa al cargar, antes de que el idioma esté listo, y se quedaría congelada.
  const columns: ReportColumn<TagScan>[] = useMemo(() => [
    { key: "scanned", label: "Fecha/Hora", value: (r) => formatDateTime(r.scannedAt) },
    { key: "tour", label: "Recorrido", value: (r) => r.tag?.siteTour?.name || "—" },
    { key: "tag", label: "Punto (etiqueta)", value: (r) => r.tag?.name || r.tag?.tagIdentifier || "—" },
    { key: "guard", label: "Vigilante", value: (r) => r.guard?.fullName || "—", privacy: "guardName" },
    { key: "station", label: "Estación", value: (r) => r.station?.stationName || "—" },
    { key: "valid", label: "Ubicación", value: (r) => (r.validLocation ? "Válida" : "Fuera de rango"), align: "center" },
    { key: "dist", label: "Distancia (m)", value: (r) => (r.distanceMeters != null ? Number(r.distanceMeters).toFixed(0) : "—"), align: "right" },
    // La revisión viaja también al CSV y al PDF: un informe exportado sin el
    // veredicto de la oficina cuenta la mitad de la historia.
    { key: "review", label: t('ui.SiteTour.revision', "Revisión"), value: (r) => revisionTexto(r.reviewStatus), align: "center" },
  ], [t]);


  const cargar = useCallback(async ({ from, to }: { from: string; to: string }) => {
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
  }, []);

  return (
    <>
      <DataReport<TagScan>
        title={t('ui.SiteTour.informeDeRecorridosDelSitio', 'Informe de Recorridos del Sitio')}
        description="Escaneos de rondas: pulsa una fila para ver la foto, la observación, la ubicación y aceptar o rechazar el punto."
        icon={Route}
        columns={columns}
        // Un punto marcado fuera de rango es una anomalía, no un dato más; uno
        // rechazado por una persona pesa más todavía.
        rowTone={(r) => (r.reviewStatus === "rejected" ? "bad" : r.validLocation === false ? "warn" : undefined)}
        onRowClick={(r) => { setEscaneoId(r.id); setAbierto(true); }}
        reloadRef={recargar}
        load={cargar}
      />
      <ScanDetailModal
        open={abierto}
        onOpenChange={setAbierto}
        scanId={escaneoId}
        onRevisado={() => recargar.current?.()}
      />
    </>
  );
}
