import { uiLang } from "@/config/roleLabels";

/**
 * Human labels for permission ids, in the user's chosen language (es/en/pt).
 * RESOURCE_LABELS / ACTION_LABELS keep their original Spanish shape because
 * older code indexes them directly; use getResourceLabel()/
 * formatPermissionLabel() for locale-aware rendering.
 */
export const RESOURCE_LABELS: Record<string, string> = {
  user: 'Usuarios',
  category: 'Sectores',
  auditLog: 'Registro de auditoría',
  settings: 'Ajustes',
  clienteApp: 'App del Cliente',
  bannerSuperiorApp: 'Banner superior',
  service: 'Servicios',
  certification: 'Certificaciones',
  securityGuard: 'Vigilantes',
  clientAccount: 'Clientes',
  businessInfo: 'Información de negocio',
  representanteEmpresa: 'Representantes',
  incident: 'Incidentes',
  station: 'Estaciones',
  shift: 'Turnos',
  guardShift: 'Turnos de vigilante',
  patrol: 'Patrullas',
  patrolCheckpoint: 'Puntos de control',
  patrolLog: 'Registros de patrulla',
  report: 'Reportes',
  inventory: 'Inventario',
  inventoryHistory: 'Historial de inventario',
  additionalService: 'Servicios adicionales',
  notification: 'Notificaciones',
  notificationRecipient: 'Destinatarios',
  inquiries: 'Consultas',
  request: 'Solicitudes',
  dispatch: 'Incidentes',
  task: 'Tareas',
  memos: 'Memorandos',
  tutorial: 'Tutoriales',
  videoTutorial: 'Videos tutoriales',
  videoTutorialCategory: 'Sectores de video',
  completionOfTutorial: 'Completitud de tutorial',
  deviceIdInformation: 'Dispositivos',
  insurance: 'Seguros',
  file: 'Archivos',
  attendance: 'Asistencia',
  attendanceSettings: 'Ajustes de asistencia',
  timeOffRequest: 'Tiempo libre',
  shiftExchangeRequest: 'Intercambio de turnos',
  postSite: 'Sedes del cliente',
  route: 'Rutas (patrulla vehicular)',
  vehicle: 'Vehículos',
  visitorLog: 'Control de visitas',
  incidentType: 'Tipos de incidente',
  licenseType: 'Tipos de licencia',
  clientContact: 'Contactos de cliente',
  note: 'Notas',
  attachment: 'Adjuntos',
  message: 'Mensajería',
  inventoryItem: 'Ítems de inventario',
  uniformInspection: 'Inspección de uniformes',
  radioDevice: 'Radios IP',
  radioCheck: 'Pase de novedades',
  radioCheckSettings: 'Ajustes de pase de novedades',
  radioChannel: 'Canales de radio',
  trainingCourse: 'Cursos de entrenamiento',
  trainingLesson: 'Lecciones de entrenamiento',
  trainingEnrollment: 'Inscripciones a cursos',
  trainingQuiz: 'Quiz de entrenamiento',
  trainingCertificate: 'Certificados de entrenamiento',
  quizBank: 'Banco de preguntas',
  quizAttempt: 'Intentos de quiz',
  backup: 'Cobertura de turnos',
  backupEvent: 'Eventos de cobertura',
  staffMe: 'Autoservicio del personal (app)',
  supervisorMe: 'Autoservicio del supervisor (app)',
};

const RESOURCE_LABELS_EN: Record<string, string> = {
  clienteApp: 'Client app',
  user: 'Users',
  category: 'Sectors',
  auditLog: 'Audit log',
  settings: 'Settings',
  bannerSuperiorApp: 'Top banner',
  service: 'Services',
  certification: 'Certifications',
  securityGuard: 'Guards',
  clientAccount: 'Clients',
  businessInfo: 'Business info',
  representanteEmpresa: 'Representatives',
  incident: 'Incidents',
  station: 'Stations',
  shift: 'Shifts',
  guardShift: 'Guard shifts',
  patrol: 'Patrols',
  patrolCheckpoint: 'Checkpoints',
  patrolLog: 'Patrol logs',
  report: 'Reports',
  inventory: 'Inventory',
  inventoryHistory: 'Inventory history',
  additionalService: 'Additional services',
  notification: 'Notifications',
  notificationRecipient: 'Recipients',
  inquiries: 'Inquiries',
  request: 'Requests',
  dispatch: 'Incidents',
  task: 'Tasks',
  memos: 'Memos',
  tutorial: 'Tutorials',
  videoTutorial: 'Video tutorials',
  videoTutorialCategory: 'Video sectors',
  completionOfTutorial: 'Tutorial completion',
  deviceIdInformation: 'Devices',
  insurance: 'Insurance',
  file: 'Files',
  attendance: 'Attendance (Payroll)',
  attendanceSettings: 'Attendance settings',
  timeOffRequest: 'Time off',
  shiftExchangeRequest: 'Shift exchanges',
  postSite: 'Client sites',
  route: 'Routes (vehicle patrol)',
  vehicle: 'Vehicles',
  visitorLog: 'Visitor log',
  incidentType: 'Incident types',
  licenseType: 'License types',
  clientContact: 'Client contacts',
  note: 'Notes',
  attachment: 'Attachments',
  message: 'Messaging',
  inventoryItem: 'Inventory items',
  uniformInspection: 'Uniform inspections',
  radioDevice: 'IP radios',
  radioCheck: 'Radio check',
  radioCheckSettings: 'Radio check settings',
  radioChannel: 'Radio channels',
  trainingCourse: 'Training courses',
  trainingLesson: 'Training lessons',
  trainingEnrollment: 'Course enrollments',
  trainingQuiz: 'Training quizzes',
  trainingCertificate: 'Training certificates',
  quizBank: 'Question bank',
  quizAttempt: 'Quiz attempts',
  backup: 'Shift coverage',
  backupEvent: 'Coverage events',
  staffMe: 'Staff self-service (app)',
  supervisorMe: 'Supervisor self-service (app)',
};

const RESOURCE_LABELS_PT: Record<string, string> = {
  clienteApp: 'App do Cliente',
  user: 'Usuários',
  category: 'Setores',
  auditLog: 'Registro de auditoria',
  settings: 'Configurações',
  bannerSuperiorApp: 'Banner superior',
  service: 'Serviços',
  certification: 'Certificações',
  securityGuard: 'Vigilantes',
  clientAccount: 'Clientes',
  businessInfo: 'Informações do negócio',
  representanteEmpresa: 'Representantes',
  incident: 'Incidentes',
  station: 'Estações',
  shift: 'Turnos',
  guardShift: 'Turnos de vigilante',
  patrol: 'Patrulhas',
  patrolCheckpoint: 'Pontos de controle',
  patrolLog: 'Registros de patrulha',
  report: 'Relatórios',
  inventory: 'Inventário',
  inventoryHistory: 'Histórico de inventário',
  additionalService: 'Serviços adicionais',
  notification: 'Notificações',
  notificationRecipient: 'Destinatários',
  inquiries: 'Consultas',
  request: 'Solicitações',
  dispatch: 'Incidentes',
  task: 'Tarefas',
  memos: 'Memorandos',
  tutorial: 'Tutoriais',
  videoTutorial: 'Vídeos tutoriais',
  videoTutorialCategory: 'Setores de vídeo',
  completionOfTutorial: 'Conclusão de tutorial',
  deviceIdInformation: 'Dispositivos',
  insurance: 'Seguros',
  file: 'Arquivos',
  attendance: 'Presença (Folha)',
  attendanceSettings: 'Configurações de presença',
  timeOffRequest: 'Folgas',
  shiftExchangeRequest: 'Troca de turnos',
  postSite: 'Sedes do cliente',
  route: 'Rotas (patrulha veicular)',
  vehicle: 'Veículos',
  visitorLog: 'Controle de visitas',
  incidentType: 'Tipos de incidente',
  licenseType: 'Tipos de licença',
  clientContact: 'Contatos de cliente',
  note: 'Notas',
  attachment: 'Anexos',
  message: 'Mensagens',
  inventoryItem: 'Itens de inventário',
  uniformInspection: 'Inspeção de uniformes',
  radioDevice: 'Rádios IP',
  radioCheck: 'Chamada de rádio',
  radioCheckSettings: 'Config. de chamada de rádio',
  radioChannel: 'Canais de rádio',
  trainingCourse: 'Cursos de treinamento',
  trainingLesson: 'Lições de treinamento',
  trainingEnrollment: 'Inscrições em cursos',
  trainingQuiz: 'Quiz de treinamento',
  trainingCertificate: 'Certificados de treinamento',
  quizBank: 'Banco de questões',
  quizAttempt: 'Tentativas de quiz',
  backup: 'Cobertura de turnos',
  backupEvent: 'Eventos de cobertura',
  staffMe: 'Autoatendimento do funcionário (app)',
  supervisorMe: 'Autoatendimento do supervisor (app)',
};

export const ACTION_LABELS: Record<string, string> = {
  Import: 'Importar',
  Create: 'Agregar',
  Edit: 'Editar',
  Destroy: 'Eliminar',
  Read: 'Ver',
  Autocomplete: 'Autocompletar',
  Export: 'Exportar',
  Restore: 'Restaurar',
  Archive: 'Archivar',
  Approve: 'Aprobar',
  Correct: 'Corregir',
  Send: 'Enviar',
  Manage: 'Gestionar',
  Reply: 'Responder',
  Complete: 'Completar',
  Attempt: 'Rendir',
  Confirm: 'Confirmar',
  Volunteer: 'Ofrecerse a',
};

const ACTION_LABELS_EN: Record<string, string> = {
  Import: 'Import',
  Create: 'Create',
  Edit: 'Edit',
  Destroy: 'Delete',
  Read: 'View',
  Autocomplete: 'Autocomplete',
  Export: 'Export',
  Restore: 'Restore',
  Archive: 'Archive',
  Approve: 'Approve',
  Correct: 'Correct',
  Send: 'Send',
  Manage: 'Manage',
  Reply: 'Reply to',
  Complete: 'Complete',
  Attempt: 'Take',
  Confirm: 'Confirm',
  Volunteer: 'Volunteer for',
};

const ACTION_LABELS_PT: Record<string, string> = {
  Import: 'Importar',
  Create: 'Adicionar',
  Edit: 'Editar',
  Destroy: 'Excluir',
  Read: 'Ver',
  Autocomplete: 'Autocompletar',
  Export: 'Exportar',
  Restore: 'Restaurar',
  Archive: 'Arquivar',
  Approve: 'Aprovar',
  Correct: 'Corrigir',
  Send: 'Enviar',
  Manage: 'Gerenciar',
  Reply: 'Responder',
  Complete: 'Concluir',
  Attempt: 'Fazer',
  Confirm: 'Confirmar',
  Volunteer: 'Voluntariar-se para',
};

// Permission ids with no action suffix (whole-feature switches): show a
// descriptive label instead of the raw id.
const SPECIAL_PERMISSION_LABELS: Record<string, Localized3> = {
  staffMe: {
    es: 'Acceso al autoservicio del personal',
    en: 'Access staff self-service',
    pt: 'Acesso ao autoatendimento do funcionário',
  },
  supervisorMe: {
    es: 'Acceso a la app del supervisor',
    en: 'Access the supervisor app',
    pt: 'Acesso ao app do supervisor',
  },
  payrollIntegrationManage: {
    es: 'Conectar y gestionar la nómina externa (Gusto)',
    en: 'Connect and manage external payroll (Gusto)',
    pt: 'Conectar e gerenciar a folha externa (Gusto)',
  },
  dobletesManage: {
    es: 'Gestionar dobletes: ofrecer turnos, reserva, campañas y ajustes',
    en: 'Manage double shifts: offer shifts, reserve, campaigns and settings',
    pt: 'Gerenciar dobras de turno: ofertas, reserva, campanhas e ajustes',
  },
  payrollSlipRead: {
    es: 'Ver roles de pago y planillas',
    en: 'View payslips and payroll sheets',
    pt: 'Ver holerites e folhas de pagamento',
  },
  payrollSlipEdit: {
    es: 'Editar conceptos, novedades y ajustes de roles de pago',
    en: 'Edit payslip concepts, adjustments and settings',
    pt: 'Editar conceitos, lançamentos e ajustes de holerites',
  },
  payrollSlipPublish: {
    es: 'Publicar roles de pago',
    en: 'Publish payslips',
    pt: 'Publicar holerites',
  },
  payrollProfileRead: {
    es: 'Ver el perfil de pago (sueldo) de cada persona',
    en: 'View each person’s pay profile (salary)',
    pt: 'Ver o perfil de pagamento (salário) de cada pessoa',
  },
  payrollProfileEdit: {
    es: 'Editar el perfil de pago (sueldo) de cada persona',
    en: 'Edit each person’s pay profile (salary)',
    pt: 'Editar o perfil de pagamento (salário) de cada pessoa',
  },
};

type Localized3 = { es: string; en: string; pt: string };

// La matriz de permisos sólo existe en es/en/pt. Para los idiomas europeos el
// respaldo es el INGLÉS, no el español: a un alemán o a un polaco le sirve
// bastante más. Traducir la matriz entera queda pendiente.
const esRespaldoIngles = (l: string) => !['es', 'en', 'pt'].includes(l);

function resourceMap(): Record<string, string> {
  const l = uiLang();
  if (l === 'pt') return RESOURCE_LABELS_PT;
  return l === 'en' || esRespaldoIngles(l) ? RESOURCE_LABELS_EN : RESOURCE_LABELS;
}

function actionMap(): Record<string, string> {
  const l = uiLang();
  if (l === 'pt') return ACTION_LABELS_PT;
  return l === 'en' || esRespaldoIngles(l) ? ACTION_LABELS_EN : ACTION_LABELS;
}

/** Etiqueta especial en el idioma actual, con el inglés como respaldo. */
function especialEnIdioma(e: Localized3): string {
  const l = uiLang();
  return (l === 'es' || l === 'en' || l === 'pt') ? e[l] : e.en;
}

/** Locale-aware group/resource label (falls back to the raw key). */
export function getResourceLabel(resourceKey: string): string {
  return resourceMap()[resourceKey] ?? RESOURCE_LABELS[resourceKey] ?? resourceKey;
}

export function formatPermissionLabel(permission: string) {
  const special = SPECIAL_PERMISSION_LABELS[permission];
  if (special) return especialEnIdioma(special);
  // split suffix from resource
  const actions = actionMap();
  const suffixes = Object.keys(ACTION_LABELS).sort((a, b) => b.length - a.length);
  for (const s of suffixes) {
    if (permission.endsWith(s)) {
      const resourceKey = permission.slice(0, -s.length);
      const resource = getResourceLabel(resourceKey);
      const action = actions[s] ?? s;
      return `${action} ${resource}`;
    }
  }
  return permission;
}
