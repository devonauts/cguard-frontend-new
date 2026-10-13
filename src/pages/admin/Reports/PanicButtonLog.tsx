import { Siren } from "lucide-react";
import { useTranslation } from "react-i18next";

import DataReport, { type ReportColumn } from "./DataReport";
import {
  formatDateTime,
  rangeBounds,
  REPORT_ROW_LIMIT,
  warnIfCapped,
} from "./reportFormat";

import i18n from "@/i18n";
import { alarmService, type AlarmCase } from "@/lib/api/alarmService";

// Clave i18n + texto en español. La traducción se hace al PINTAR (dentro de
// `value`, ya en ejecución); poner t() en la constante congelaría el idioma de
// arranque para toda la sesión.
const ORIGIN: Record<string, [key: string, es: string]> = {
  alarm_panel: ["reports.panicLog.origin.alarmPanel", "Panel de alarma"],
  client_app: ["reports.panicLog.origin.clientApp", "App cliente (SOS)"],
  worker_app: [
    "reports.panicLog.origin.workerApp",
    "Botón de pánico (vigilante)",
  ],
  manual: ["reports.panicLog.origin.manual", "Manual"],
};

// Misma regla que ORIGIN: clave + respaldo en español, traducido al pintar.
const STATUS: Record<string, [key: string, es: string]> = {
  open: ["reports.panicLog.status.open", "Abierto"],
  acknowledged: ["reports.panicLog.status.acknowledged", "Reconocido"],
  dispatched: ["reports.panicLog.status.dispatched", "Despachado"],
  resolved: ["reports.panicLog.status.resolved", "Resuelto"],
  closed: ["reports.panicLog.status.closed", "Cerrado"],
};

// La prioridad llega como número (1 = la más grave). Mostrarla cruda no le dice
// nada a nadie, ni en pantalla ni en el archivo exportado.
const PRIORITY: Record<number, [key: string, es: string]> = {
  1: ["alarm.priority.1", "P1 · Crítica"],
  2: ["alarm.priority.2", "P2 · Alta"],
  3: ["alarm.priority.3", "P3 · Media"],
  4: ["alarm.priority.4", "P4 · Baja"],
  5: ["alarm.priority.5", "P5 · Informativa"],
};

const columns: ReportColumn<AlarmCase>[] = [
  {
    key: "created",
    label: "Fecha",
    labelKey: "reports.col.panicButtonLog.created",
    value: (r) => formatDateTime(r.createdAt),
  },
  {
    key: "title",
    label: "Título",
    labelKey: "reports.col.panicButtonLog.title",
    value: (r) => r.title || i18n.t("ui.PanicButtonLog.alertaDePanico", "Alerta de pánico"),
  },
  {
    key: "origin",
    label: "Origen",
    labelKey: "reports.col.panicButtonLog.origin",
    value: (r) => {
      const o = ORIGIN[String(r.source || "")];

      return o ? i18n.t(o[0], o[1]) : r.source || "—";
    },
  },
  {
    key: "priority",
    label: "Prioridad",
    labelKey: "reports.col.panicButtonLog.priority",
    value: (r) => {
      if (r.priority == null) return "—";
      const p = PRIORITY[r.priority];

      return p ? i18n.t(p[0], p[1]) : String(r.priority);
    },
    align: "center",
  },
  {
    key: "status",
    label: "Estado",
    labelKey: "reports.col.panicButtonLog.status",
    value: (r) => {
      const st = STATUS[String(r.status || "")];

      return st ? i18n.t(st[0], st[1]) : r.status || "—";
    },
  },
  {
    key: "ack",
    label: "Reconocido",
    labelKey: "reports.col.panicButtonLog.ack",
    value: (r) => formatDateTime(r.ackAt),
  },
  {
    key: "resolved",
    label: "Resuelto",
    labelKey: "reports.col.panicButtonLog.resolved",
    value: (r) => formatDateTime(r.resolvedAt),
  },
];

export default function PanicButtonLog() {
  const { t } = useTranslation();

  return (
    <DataReport<AlarmCase>
      description={t('ui.PanicButtonLog.alertasDePanicoYSos')}
      load={async ({ from, to }) => {
        // Rango y categoría van EN LA CONSULTA. Antes se pedían los casos más
        // recientes y se recortaba aquí: un rango antiguo se exportaba vacío.
        const { start, end } = rangeBounds(from, to);
        const cases = await alarmService.cases({
          category: "panic",
          from: start,
          to: end,
          limit: REPORT_ROW_LIMIT,
        });
        // El `category` de arriba es el filtro real; esta línea es sólo un
        // seguro contra un servidor anterior a él, que devolvería TODAS las
        // categorías y convertiría este informe en la cola de alarmas entera.
        return warnIfCapped((cases || []).filter((c) => c.category === "panic"));
      }}
      rowTone={(r) => {
        const grave = (r.priority ?? 3) <= 2;
        if (!grave) return undefined;
        const cerrado = r.status === "resolved" || r.status === "closed";
        return cerrado ? "warn" : "bad";
      }}
      columns={columns}
      // SOS guardado sin señal: llegó tarde (por el incidente del caso).
      idSinSenal={(r: any) => r.incidentId || r.id}
      // Crítica/Alta sin cerrar → regla roja en el canto de la fila. Una vez
      // resuelto deja de ser una emergencia y baja a aviso.
      title={t("ui.PanicButtonLog.registrosDelBotonDePanico", "Registros del Botón de Pánico")}
      icon={Siren}
      // Un pánico va en `--bad` SIEMPRE, elija la empresa el acento que elija.
      tone="bad"
    />
  );
}
