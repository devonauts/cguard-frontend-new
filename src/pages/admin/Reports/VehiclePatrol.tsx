import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Car } from "lucide-react";

import DataReport, { type ReportColumn } from "./DataReport";
import { REPORT_ROW_LIMIT, warnIfCapped } from "./reportFormat";

import {
  RUN_STATUS_LABEL,
  SCHEDULE_LABEL,
  fmtDur,
  fmtFecha,
  fmtHora,
} from "@/pages/admin/vehicle-patrol/runLabels";
import routeService from "@/lib/api/routeService";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * INFORME DE PATRULLA VEHICULAR
 *
 * Una fila por RECORRIDO ejecutado: quién lo condujo, a qué hora empezó y
 * terminó, cuántas paradas hizo de las que llevaba, cuáles se omitieron o
 * quedaron sin visitar, qué nota sacó la inspección y si alguna llegada se
 * registró fuera de la geocerca.
 *
 * ── DE DÓNDE SALEN LAS FILAS ───────────────────────────────────────────────
 * De `GET /route-runs/history`, el mismo origen que el historial de la sección
 * de patrulla. No hay una consulta propia: dos formas de contar lo mismo
 * acaban divergiendo, y entonces el informe que se exporta y la pantalla que
 * se mira dejan de coincidir. Lo que este informe añade es el rango de fechas,
 * la búsqueda, y la exportación a CSV, Excel y PDF que da el armazón.
 *
 * ── EL RANGO VA EN DÍAS, NO EN INSTANTES ───────────────────────────────────
 * `routeRuns.date` guarda el DÍA de la empresa (`YYYY-MM-DD`), no una marca de
 * tiempo, y el servidor filtra con `date BETWEEN from AND to`. Por eso aquí NO
 * se usa `rangeBounds()`, que convierte el rango a instantes UTC: al recortar
 * ese instante a diez caracteres, cualquier zona al oeste de Greenwich pierde
 * la primera o la última jornada del rango. Se manda el día tal cual.
 *
 * ── LOS TOTALES DEL RESUMEN ────────────────────────────────────────────────
 * `summary` lo congela el servidor al cerrar el recorrido (`buildSummary`), y
 * por eso una ejecución EN CURSO no lo tiene: sus columnas de cierre salen con
 * raya, no con ceros. Un cero diría que no hubo fotos ni paradas omitidas; la
 * raya dice que todavía no se sabe, que es la verdad.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface ResumenEjecucion {
  stopsPlanned?: number | null;
  stopsCompleted?: number | null;
  stopsSkipped?: number | null;
  stopsMissed?: number | null;
  requiredMissed?: number | null;
  totalSeconds?: number | null;
  plannedDistanceKm?: number | null;
  photos?: number | null;
  observations?: number | null;
  criticalFindings?: number | null;
  geofenceFlags?: number | null;
  averageInspection?: number | null;
}

interface Ejecucion {
  id: string;
  date?: string | null;
  routeName?: string | null;
  supervisorName?: string | null;
  status?: string | null;
  scheduleState?: string | null;
  varianceMinutes?: number | null;
  startedAt?: string | null;
  completedAt?: string | null;
  progress?: { completed: number; total: number } | null;
  summary?: ResumenEjecucion | null;
}

/**
 * A time of the run; with its day when it is not the run's day. A 45-hour
 * run that started on 19/10 showed «Fin 10:11 p. m.» with no date at all.
 */
function horaConDia(
  iso: string | null | undefined,
  diaDeLaRuta: string | null | undefined,
  locale: string,
): string {
  if (!iso) return fmtHora(iso, locale);
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return fmtHora(iso, locale);
  const zona = zonaDeLaEmpresa();
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  if (!diaDeLaRuta || dia === String(diaDeLaRuta).slice(0, 10))
    return fmtHora(iso, locale);

  return d.toLocaleString(locale, {
    timeZone: zona,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Un número del resumen, o raya si el recorrido aún no ha cerrado. */
const cifra = (v: number | null | undefined) =>
  v == null ? "—" : String(v);

/**
 * Puntualidad: el estado y, SÓLO si no salió a tiempo, cuánto se desvió.
 *
 * El servidor tolera unos minutos antes de marcar una ruta como retrasada, así
 * que un recorrido con `on_time` puede llevar una varianza de ocho minutos.
 * Escribir «A tiempo · +8 min» se lee como una contradicción: o llegó a tiempo
 * o no. El número acompaña al retraso, no a la puntualidad.
 */
function puntualidad(r: Ejecucion): string {
  const estado = r.scheduleState ? SCHEDULE_LABEL[r.scheduleState] : null;

  if (!estado) return "—";
  if (r.scheduleState === "on_time") return estado;
  const v = r.varianceMinutes;

  return v != null && v !== 0
    ? `${estado} · ${v > 0 ? "+" : ""}${v} min`
    : estado;
}

export default function VehiclePatrol() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const locale = localeActual();

  const columns: ReportColumn<Ejecucion>[] = useMemo(
    () => [
      {
        key: "date",
        label: t("ui.VehiclePatrol.fecha", "Fecha"),
        value: (r) => fmtFecha(r.date, locale),
      },
      {
        key: "route",
        label: t("ui.VehiclePatrol.ruta", "Ruta"),
        value: (r) => r.routeName || "—",
      },
      {
        key: "supervisor",
        label: t("ui.VehiclePatrol.supervisor", "Supervisor"),
        value: (r) => r.supervisorName || "—",
      },
      {
        key: "status",
        label: t("ui.VehiclePatrol.estado", "Estado"),
        value: (r) =>
          (r.status && RUN_STATUS_LABEL[r.status]) || r.status || "—",
      },
      {
        key: "schedule",
        label: t("ui.VehiclePatrol.puntualidad", "Puntualidad"),
        value: puntualidad,
      },
      {
        key: "start",
        label: t("ui.VehiclePatrol.inicio", "Inicio"),
        value: (r) => horaConDia(r.startedAt, r.date, locale),
        align: "right",
      },
      {
        key: "end",
        label: t("ui.VehiclePatrol.fin", "Fin"),
        value: (r) => horaConDia(r.completedAt, r.date, locale),
        align: "right",
      },
      {
        key: "duration",
        label: t("ui.VehiclePatrol.duracion", "Duración"),
        value: (r) => fmtDur(r.summary?.totalSeconds ?? null),
        align: "right",
      },
      {
        key: "stops",
        label: t("ui.VehiclePatrol.paradas", "Paradas"),
        // «hechas / planificadas»: el numerador solo no dice si faltó algo.
        // `progress.completed` counts every CLOSED stop — missed and skipped
        // too — so a run read «2/2» next to «No visitadas 2». Once the run
        // has its summary, the numerator is the stops actually visited.
        value: (r) =>
          r.summary?.stopsCompleted != null && r.summary?.stopsPlanned != null
            ? `${r.summary.stopsCompleted}/${r.summary.stopsPlanned}`
            : r.progress
              ? `${r.progress.completed}/${r.progress.total}`
              : "—",
        align: "center",
      },
      {
        key: "skipped",
        label: t("ui.VehiclePatrol.omitidas", "Omitidas"),
        value: (r) => cifra(r.summary?.stopsSkipped),
        align: "right",
      },
      {
        key: "missed",
        label: t("ui.VehiclePatrol.noVisitadas", "No visitadas"),
        value: (r) => cifra(r.summary?.stopsMissed),
        align: "right",
      },
      {
        key: "inspection",
        label: t("ui.VehiclePatrol.inspeccion", "Inspección"),
        value: (r) =>
          r.summary?.averageInspection == null
            ? "—"
            : `${Math.round(Number(r.summary.averageInspection))} %`,
        align: "right",
      },
      {
        key: "geofence",
        label: t("ui.VehiclePatrol.fueraDeZona", "Fuera de zona"),
        value: (r) => cifra(r.summary?.geofenceFlags),
        align: "right",
      },
      {
        key: "distance",
        label: t("ui.VehiclePatrol.distancia", "Distancia"),
        value: (r) =>
          r.summary?.plannedDistanceKm == null
            ? "—"
            : `${Number(r.summary.plannedDistanceKm).toLocaleString(locale, {
                maximumFractionDigits: 1,
              })} km`,
        align: "right",
      },
    ],
    [t, locale],
  );

  const cargar = useCallback(async ({ from, to }: { from: string; to: string }) => {
    // Días, no instantes — ver la cabecera.
    const { rows } = await routeService.runHistory({
      from,
      to,
      limit: REPORT_ROW_LIMIT,
    });

    return warnIfCapped(rows as Ejecucion[]);
  }, []);

  return (
    <DataReport<Ejecucion>
      searchable
      columns={columns}
      description={t(
        "ui.VehiclePatrol.recorridosDePatrullajeVehicular",
        "Recorridos de patrullaje vehicular: rutas, paradas y tiempos. Pulsa una fila para abrir el recorrido completo.",
      )}
      emptyMessage={t(
        "ui.VehiclePatrol.sinRecorridos",
        "No hubo recorridos de patrullaje en este rango.",
      )}
      icon={Car}
      load={cargar}
      /* La severidad sale del recorrido, nunca del acento de la empresa: se
         aborta un recorrido o se deja una parada obligatoria sin visitar y eso
         es rojo; omitir una parada, llegar fuera de la geocerca o ir retrasado
         es ámbar. Lo demás no se pinta. */
      rowTone={(r) => {
        const s = r.summary;

        if (
          r.status === "aborted" ||
          (s?.requiredMissed ?? 0) > 0 ||
          (s?.criticalFindings ?? 0) > 0
        )
          return "bad";
        if (
          r.status === "partially_completed" ||
          (s?.stopsSkipped ?? 0) > 0 ||
          (s?.geofenceFlags ?? 0) > 0 ||
          r.scheduleState === "delayed" ||
          r.scheduleState === "at_risk"
        )
          return "warn";

        return undefined;
      }}
      title={t(
        "ui.VehiclePatrol.informeDePatrullaVehicular",
        "Informe de Patrulla Vehicular",
      )}
      onRowClick={(r) => navigate(`/vehicle-patrol/runs/${r.id}`)}
    />
  );
}
