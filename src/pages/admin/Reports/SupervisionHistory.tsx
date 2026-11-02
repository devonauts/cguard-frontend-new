import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";

import DataReport, { type ReportColumn } from "./DataReport";
import {
  formatDateTime,
  rangeBounds,
  REPORT_ROW_LIMIT,
  truncate,
  warnIfCapped,
} from "./reportFormat";

import { ApiService } from "@/services/api/apiService";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * HISTORIAL DE SUPERVISIÓN POR PUESTO
 *
 * Una fila por VISITA del supervisor a un puesto. No es lo mismo que el informe
 * de patrulla vehicular, que cuenta RECORRIDOS: allí una fila es el turno
 * entero de un supervisor con cuatro sitios dentro, y para responder «¿cuándo
 * vinieron a MI puesto?» —la pregunta del cliente, y la del gerente antes de
 * renovar un contrato— había que abrir recorrido por recorrido.
 *
 * ── QUÉ LLEVA CADA FILA ───────────────────────────────────────────────────
 * Cuándo, qué puesto, quién supervisó, con qué recorrido, la nota de la
 * inspección, cuántos hallazgos quedaron abiertos, cuántas fotos se tomaron,
 * cuánto personal se verificó y cuántos no estaban, si la llegada cayó fuera de
 * la geocerca, cuánto duró y las novedades. Todo eso viaja también al CSV, al
 * Excel y al PDF: un informe exportado sin los hallazgos cuenta media historia.
 *
 * ── EL FILTRO DE PUESTO VA AL SERVIDOR ────────────────────────────────────
 * `stationId` se manda en la consulta y no se recorta aquí: con dos años de
 * patrullaje, traerse todo para quedarse con un puesto es traerse decenas de
 * miles de filas para enseñar veinte.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface Visita {
  id: string;
  visitedAt?: string | null;
  status?: string | null;
  stationId?: string | null;
  stationName?: string | null;
  stationCode?: string | null;
  routeName?: string | null;
  runId?: string | null;
  supervisorName?: string | null;
  inspectionScore?: number | null;
  findings?: number | null;
  photoCount?: number | null;
  guardsVerified?: number | null;
  guardsAbsent?: number | null;
  geofenceFlagged?: boolean | null;
  timeSpentSeconds?: number | null;
  skipReason?: string | null;
  notes?: string | null;
}

interface Puesto {
  id: string;
  stationName?: string | null;
  /** El CÓDIGO del puesto (P-011). Es lo único que lo distingue de verdad. */
  nickname?: string | null;
}

/**
 * «Caseta Principal» hay cuatro, una por cliente. El nombre solo deja un
 * desplegable con opciones idénticas y un informe filtrado por la que no era.
 * El código del puesto va delante porque es lo que se lee en la app y en la
 * radio.
 */
const nombrePuesto = (p: { stationCode?: string | null; nickname?: string | null; stationName?: string | null }) => {
  const codigo = p.stationCode || p.nickname || "";
  const nombre = p.stationName || "";
  if (codigo && nombre) return `${codigo} · ${nombre}`;
  return codigo || nombre || "—";
};

/** Segundos → «12 min» / «1 h 05». Una visita de 4 500 s no dice nada. */
const duracion = (s?: number | null) => {
  if (s == null || !Number.isFinite(Number(s))) return "—";
  const n = Math.max(0, Math.round(Number(s)));
  if (n < 60) return `${n} s`;
  const m = Math.round(n / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
};

export default function SupervisionHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [puestos, setPuestos] = useState<Puesto[]>([]);
  const [puesto, setPuesto] = useState<string>("");
  // El filtro lo lee `cargar`, que es un callback memorizado: sin la referencia
  // se quedaría con el puesto que había al montarse y «Aplicar» no haría nada.
  const puestoRef = useRef("");
  puestoRef.current = puesto;

  useEffect(() => {
    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        const res: { rows?: Puesto[] } | Puesto[] = await ApiService.get(
          `/tenant/${tenantId}/stations?limit=500&offset=0`,
        );
        const rows = Array.isArray(res) ? res : res?.rows || [];
        setPuestos(
          rows
            .filter((p) => p?.id)
            .sort((a, b) => nombrePuesto(a).localeCompare(nombrePuesto(b))),
        );
      } catch {
        /* sin lista de puestos el informe sigue sirviendo: se ven todos */
      }
    })();
  }, []);

  const estado = useCallback(
    (s?: string | null) =>
      s === "completed"
        ? t("ui.SupervisionHistory.completada", "Completada")
        : s === "skipped"
          ? t("ui.SupervisionHistory.omitida", "Omitida")
          : s === "missed"
            ? t("ui.SupervisionHistory.noVisitada", "No visitada")
            : "—",
    [t],
  );

  const columns: ReportColumn<Visita>[] = useMemo(
    () => [
      {
        key: "when",
        label: t("ui.SupervisionHistory.fechaHora", "Fecha/Hora"),
        value: (r) => formatDateTime(r.visitedAt),
      },
      {
        key: "station",
        label: t("ui.SupervisionHistory.puesto", "Puesto"),
        value: (r) => nombrePuesto(r),
        privacy: "stationName",
      },
      {
        key: "status",
        label: t("ui.SupervisionHistory.estado", "Estado"),
        value: (r) => estado(r.status),
        align: "center",
      },
      {
        key: "supervisor",
        label: t("ui.SupervisionHistory.supervisor", "Supervisor"),
        value: (r) => r.supervisorName || "—",
      },
      {
        key: "route",
        label: t("ui.SupervisionHistory.recorrido", "Recorrido"),
        value: (r) => r.routeName || "—",
      },
      {
        key: "score",
        label: t("ui.SupervisionHistory.inspeccion", "Inspección"),
        value: (r) =>
          r.inspectionScore != null ? `${Math.round(Number(r.inspectionScore))}%` : "—",
        align: "right",
      },
      {
        key: "findings",
        label: t("ui.SupervisionHistory.hallazgos", "Hallazgos"),
        value: (r) => String(Number(r.findings) || 0),
        align: "right",
      },
      {
        key: "photos",
        label: t("ui.SupervisionHistory.fotos", "Fotos"),
        value: (r) => String(Number(r.photoCount) || 0),
        align: "right",
      },
      {
        key: "staff",
        label: t("ui.SupervisionHistory.personal", "Personal verificado"),
        value: (r) => {
          const v = Number(r.guardsVerified) || 0;
          const a = Number(r.guardsAbsent) || 0;
          if (!v) return "—";
          return a > 0
            ? t("ui.SupervisionHistory.personalConAusencias", "{{v}} ({{a}} sin presencia)", { v, a })
            : String(v);
        },
        align: "center",
      },
      {
        key: "geofence",
        label: t("ui.SupervisionHistory.llegada", "Llegada"),
        value: (r) =>
          r.geofenceFlagged
            ? t("ui.SupervisionHistory.fueraDeZona", "Fuera de zona")
            : t("ui.SupervisionHistory.enZona", "En zona"),
        align: "center",
      },
      {
        key: "time",
        label: t("ui.SupervisionHistory.duracion", "Duración"),
        value: (r) => duracion(r.timeSpentSeconds),
        align: "right",
      },
      {
        key: "notes",
        label: t("ui.SupervisionHistory.novedades", "Novedades"),
        value: (r) => truncate(r.notes || r.skipReason || "") || "—",
      },
    ],
    [t, estado],
  );

  const cargar = useCallback(async ({ from, to }: { from: string; to: string }) => {
    const tenantId = localStorage.getItem("tenantId") || "";
    const { start, end } = rangeBounds(from, to);
    const params = new URLSearchParams({
      from: start,
      to: end,
      limit: String(REPORT_ROW_LIMIT),
    });
    if (puestoRef.current) params.append("stationId", puestoRef.current);
    const res: { rows?: Visita[] } | Visita[] = await ApiService.get(
      `/tenant/${tenantId}/route-runs/visits?${params.toString()}`,
    );
    const rows: Visita[] = Array.isArray(res) ? res : res?.rows || [];

    return warnIfCapped(rows);
  }, []);

  return (
    <DataReport<Visita>
      columns={columns}
      description={t(
        "ui.SupervisionHistory.descripcion",
        "Cada visita de supervisión a un puesto: quién fue, qué encontró y cómo cerró. Filtra por puesto y expórtalo para el cliente.",
      )}
      extraFilters={
        <div className="space-y-1.5">
          <label className="cg-eyebrow" htmlFor="filtro-puesto">
            {t("ui.SupervisionHistory.puesto", "Puesto")}
          </label>
          <select
            className="cg-input w-full px-3 py-2 text-sm"
            id="filtro-puesto"
            value={puesto}
            onChange={(e) => setPuesto(e.target.value)}
          >
            <option value="">
              {t("ui.SupervisionHistory.todosLosPuestos", "Todos los puestos")}
            </option>
            {puestos.map((p) => (
              <option key={p.id} value={p.id}>
                {nombrePuesto(p)}
              </option>
            ))}
          </select>
        </div>
      }
      icon={ClipboardCheck}
      load={cargar}
      // Una visita omitida es una anomalía, no un dato más; una llegada fuera
      // de la geocerca o un hallazgo abierto piden que alguien mire.
      rowTone={(r) =>
        r.status === "missed"
          ? "bad"
          : r.status === "skipped" || r.geofenceFlagged || Number(r.findings) > 0
            ? "warn"
            : undefined
      }
      title={t("ui.SupervisionHistory.titulo", "Historial de supervisión por puesto")}
      // Paradas e inspecciones hechas sin señal que llegaron después.
      idSinSenal={(r) => r.id}
      onRowClick={(r) => {
        if (r.runId) navigate(`/vehicle-patrol/runs/${r.runId}`);
      }}
    />
  );
}
