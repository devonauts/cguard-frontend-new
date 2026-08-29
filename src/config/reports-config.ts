// src/config/reports-config.ts
//
// Constante de módulo: se evalúa al importar, antes de que i18next tenga idioma.
// Por eso aquí NO se llama a t(): se guarda la CLAVE (`titleKey`/`descriptionKey`)
// y la traducción ocurre donde se pinta (src/pages/admin/Reports/Reports.tsx).

export type ReportCard = {
  id: string;
  title: string;
  titleKey?: string;
  description: string;
  descriptionKey?: string;
  href: string;
  openCount?: number;
  closedCount?: number;
};

export type ReportSection = {
  id: string;
  title: string;
  titleKey?: string;
  viewAllHref?: string;
  settingsHref?: string;
  reports: ReportCard[];
};

export const REPORT_SECTIONS: ReportSection[] = [
  {
    id: "general",
    title: "Informes generales",
    titleKey: "reports.section.general.title",
    reports: [
      {
        id: "entry-exit",
        title: "Informe de Entrada/Salida",
        titleKey: "ui.CheckInOut.informeDeEntradaSalida",
        description:
          "Ver cuando su vigilante de seguridad registra entrada y salida del sitio",
        descriptionKey: "reports.card.entryExit.desc",
        href: "/reports/check-in-out",
      },
      {
        id: "site-tours",
        title: "Informe de Recorridos del Sitio",
        titleKey: "ui.SiteTour.informeDeRecorridosDelSitio",
        description:
          "Ver recorridos completados y perdidos por vigilantes de seguridad",
        descriptionKey: "reports.card.siteTours.desc",
        href: "/reports/site-tour",
      },
      {
        id: "tasks",
        title: "Informe de Tareas",
        titleKey: "ui.Task.informeDeTareas",
        description:
          "Ver las tareas completadas por los vigilantes de seguridad",
        descriptionKey: "reports.card.tasks.desc",
        href: "/reports/tasks",
      },
      {
        id: "dar",
        title: "Informe DAR",
        titleKey: "reports.card.dar.title",
        description:
          "Ver actividad diaria de los vigilantes de seguridad",
        descriptionKey: "reports.card.dar.desc",
        href: "/reports/dar",
      },
      {
        id: "vehicle-patrol",
        title: "Informe de Patrulla Vehicular",
        titleKey: "ui.VehiclePatrol.informeDePatrullaVehicular",
        description: "Ver actividad de patrulla vehicular",
        descriptionKey: "reports.card.vehiclePatrol.desc",
        href: "/reports/vehicle-patrol",
      },
      {
        id: "checklist",
        title: "Informe de lista de verificación",
        titleKey: "reports.card.checklist.title",
        description:
          "Ver las listas de verificación completadas por los vigilantes",
        descriptionKey: "reports.card.checklist.desc",
        href: "/reports/checklist",
      },
      {
        id: "post-kpi",
        title: "Informe de KPI del Puesto de seguridad",
        titleKey: "reports.card.postKpi.title",
        description: "Ver informe de KPI del puesto de seguridad",
        descriptionKey: "reports.card.postKpi.desc",
        href: "/reports/post-kpi",
      },
      {
        id: "guard-kpi",
        title: "Informe de KPI del Vigilante",
        titleKey: "ui.GuardKpi.informeDeKpiDelVigilante",
        description: "Ver informe de KPI del vigilante",
        descriptionKey: "reports.card.guardKpi.desc",
        href: "/reports/guard-kpi",
      },
    ],
  },
  {
    id: "incidents",
    title: "Informes de Incidentes",
    titleKey: "reports.section.incidents.title",
    viewAllHref: "/reports/incidents",
    reports: [
      {
        id: "general-incident",
        title: "General Incident report",
        description:
          "General incident report with an option to select any incident",
        href: "/reports/incidents/general",
      },
      {
        id: "detailed-incident",
        title: "Detailed Incident Report",
        description: "Detailed Incident Report",
        href: "/reports/incidents/detailed",
      },
      {
        id: "parking-violation",
        title: "Parking Violation",
        description:
          "This report is used to check the parking violation.",
        href: "/reports/incidents/parking-violation",
      },
      {
        id: "break-in",
        title: "Break-In",
        description: "This report covers break-in incident.",
        href: "/reports/incidents/break-in",
      },
      {
        id: "fire-alarm",
        title: "Fire Alarm",
        description:
          "This report is created to address fire alarm.",
        href: "/reports/incidents/fire-alarm",
      },
      {
        id: "vandalism",
        title: "Vandalism",
        description: "This report covers vandalism incident.",
        href: "/reports/incidents/vandalism",
      },
      {
        id: "suspicious-activity",
        title: "Suspicious Activity",
        description: "This report covers suspicious activity.",
        href: "/reports/incidents/suspicious-activity",
      },
      {
        id: "police-onsite",
        title: "Police Onsite",
        description: "This report covers police reports.",
        href: "/reports/incidents/police-onsite",
      },
      {
        id: "trespassing",
        title: "Trespassing",
        description: "This report is to address trespassing incident.",
        href: "/reports/incidents/trespassing",
      },
    ],
  },
  {
    id: "standard",
    title: "Informes Estándar",
    titleKey: "reports.section.standard.title",
    reports: [
      {
        id: "hourly-report",
        title: "Hourly Report",
        description: "Hourly Report",
        href: "/reports/standard/hourly",
        openCount: 0,
      },
      {
        id: "vehicle-inspection",
        title: "Vehicle Inspection Report",
        description: "Vehicle Inspection Report",
        href: "/reports/standard/vehicle-inspection",
      },
      {
        id: "equipment-inspection",
        title: "Equipment Inspection Report",
        description: "Equipment Inspection Report",
        href: "/reports/standard/equipment-inspection",
      },
    ],
  },
  {
    id: "timecard",
    title: "Informes de Registro de Tiempo",
    titleKey: "reports.section.timecard.title",
    reports: [
      {
        id: "timecard-client",
        title: "Horas de Tarjeta de Tiempo por Cliente",
        titleKey: "reports.card.timecardClient.title",
        description: "Ver horas de tarjeta de tiempo por cliente",
        descriptionKey: "reports.card.timecardClient.desc",
        href: "/reports/timecard/by-client",
      },
      {
        id: "timecard-post",
        title: "Horas de Tarjeta de Tiempo por Puesto de seguridad",
        titleKey: "reports.card.timecardPost.title",
        description:
          "Ver horas de tarjeta de tiempo por puesto de seguridad",
        descriptionKey: "reports.card.timecardPost.desc",
        href: "/reports/timecard/by-post",
      },
      {
        id: "timecard-guard",
        title: "Horas de Tarjeta de Tiempo por Vigilante",
        titleKey: "reports.card.timecardGuard.title",
        description:
          "Ver horas de tarjeta de tiempo por vigilante",
        descriptionKey: "reports.card.timecardGuard.desc",
        href: "/reports/timecard/by-guard",
      },
    ],
  },
  {
    id: "payroll",
    title: "Informes de Horas Trabajadas",
    titleKey: "reports.section.payroll.title",
    reports: [
      {
        id: "payroll-client",
        title: "Horas Trabajadas por Cliente",
        titleKey: "reports.card.payrollClient.title",
        description: "Ver horas trabajadas por cliente",
        descriptionKey: "reports.card.payrollClient.desc",
        href: "/reports/payroll/by-client",
      },
      {
        id: "payroll-post",
        title: "Horas Trabajadas por Puesto de seguridad",
        titleKey: "reports.card.payrollPost.title",
        description:
          "Ver horas trabajadas por puesto de seguridad",
        descriptionKey: "reports.card.payrollPost.desc",
        href: "/reports/payroll/by-post",
      },
      {
        id: "payroll-department",
        title: "Horas Trabajadas por Departamento",
        titleKey: "reports.card.payrollDepartment.title",
        description:
          "Ver horas de nómina por departamento",
        descriptionKey: "reports.card.payrollDepartment.desc",
        href: "/reports/payroll/by-department",
      },
    ],
  },
  {
    id: "logs",
    title: "Informes de registro",
    titleKey: "reports.section.logs.title",
    reports: [
      {
        id: "delivery-logs",
        title: "Registros de Entrega",
        titleKey: "ui.Passdown.registrosDeEntrega",
        description:
          "Ver entregas compartidas por vigilantes de seguridad",
        descriptionKey: "reports.card.deliveryLogs.desc",
        href: "/reports/passdown",
      },
      {
        id: "watch-mode-logs",
        title: "Registros de Modo Vigilancia",
        titleKey: "ui.WatchMode.registrosDeModoVigilancia",
        description:
          "Ver los archivos multimedia enviados por los vigilantes de seguridad",
        descriptionKey: "reports.card.watchModeLogs.desc",
        href: "/reports/watch-mode",
      },
      {
        id: "checkpoint-logs",
        title: "Registros de Puntos de Control de Recorridos",
        titleKey: "reports.card.checkpointLogs.title",
        description:
          "Ver los puntos de control escaneados por los vigilantes de seguridad",
        descriptionKey: "reports.card.checkpointLogs.desc",
        href: "/reports/tour-check-point",
      },
      {
        id: "inactive-guard-logs",
        title: "Registros de Vigilante Inactivo",
        titleKey: "ui.GuardIdleLog.registrosDeVigilanteInactivo",
        description:
          "Ver registros de inactividad de los vigilantes de seguridad",
        descriptionKey: "reports.card.inactiveGuardLogs.desc",
        href: "/reports/guard-idle-log",
      },
      {
        id: "panic-button-logs",
        title: "Registros del Botón de Pánico",
        titleKey: "ui.PanicButtonLog.registrosDelBotonDePanico",
        description:
          "Ver registros del botón de pánico presionado por los vigilantes",
        descriptionKey: "reports.card.panicButtonLogs.desc",
        href: "/reports/panic-button-log",
      },
      {
        id: "geofence-logs",
        title: "Registros de Geo Vallas",
        titleKey: "ui.GeoFenceLog.registrosDeGeoVallas",
        description:
          "Ver registros de geovalla de los vigilantes de seguridad",
        descriptionKey: "reports.card.geofenceLogs.desc",
        href: "/reports/geo-fence-log",
      },
      {
        id: "fall-alert-logs",
        title: "Registros de Alerta de Caída de Vigilante",
        titleKey: "reports.card.fallAlertLogs.title",
        description:
          "Ver registros de alerta de caída de vigilantes/dispositivos de seguridad",
        descriptionKey: "reports.card.fallAlertLogs.desc",
        href: "/reports/guard-device-fall-report",
      },
      {
        id: "order-ack-logs",
        title: "Reconocimiento de Órdenes de Publicación",
        titleKey: "ui.PostOrderAck.reconocimientoDeOrdenesDePublicacion",
        description:
          "Reconocimiento de Órdenes de Publicación",
        descriptionKey: "ui.PostOrderAck.reconocimientoDeOrdenesDePublicacion",
        href: "/reports/post-order-ack",
      },
      {
        id: "document-ack-logs",
        title: "Reconocimiento de Documentos y Políticas",
        titleKey: "ui.DocPolicyAck.reconocimientoDeDocumentosYPoliticas",
        description:
          "Reconocimiento de Documentos y Políticas",
        descriptionKey: "ui.DocPolicyAck.reconocimientoDeDocumentosYPoliticas",
        href: "/reports/doc-policy-ack",
      },
      {
        id: "license-logs",
        title: "Registro de Licencias",
        titleKey: "ui.License.registroDeLicencias",
        description:
          "Ver registro de licencias de los vigilantes",
        descriptionKey: "reports.card.licenseLogs.desc",
        href: "/reports/license",
      },
    ],
  },
];
