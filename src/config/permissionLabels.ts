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
  coverageClockInOnBehalf: {
    es: 'Registrar la entrada a nombre del vigilante (Cobertura en vivo)',
    en: 'Clock in on behalf of a guard (Live coverage)',
    pt: 'Registrar a entrada em nome do vigilante (Cobertura ao vivo)',
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
  assistantUse: {
    es: 'Usar el asistente de IA',
    en: 'Use the AI assistant',
    pt: 'Usar o assistente de IA',
    de: 'Den KI-Assistenten nutzen',
    fr: 'Utiliser l’assistant IA',
    it: 'Usare l’assistente IA',
    nl: 'De AI-assistent gebruiken',
    pl: 'Korzystać z asystenta AI',
  },
  routeDispatch: {
    es: 'Modificar una ruta en curso desde la central',
    en: 'Change a route in progress from dispatch',
    pt: 'Alterar uma rota em andamento pela central',
    de: 'Eine laufende Route von der Zentrale aus ändern',
    fr: 'Modifier un itinéraire en cours depuis le centre',
    it: 'Modificare un percorso in corso dalla centrale',
    nl: 'Een lopende route vanuit de meldkamer wijzigen',
    pl: 'Zmieniać trasę w toku z centrali',
  },
  routeOverrideGeofence: {
    es: 'Registrar una llegada fuera de la geocerca',
    en: 'Record an arrival outside the geofence',
    pt: 'Registrar uma chegada fora da cerca geográfica',
    de: 'Eine Ankunft außerhalb des Geofence erfassen',
    fr: 'Enregistrer une arrivée hors de la zone géographique',
    it: 'Registrare un arrivo fuori dal geofence',
    nl: 'Een aankomst buiten de geofence registreren',
    pl: 'Rejestrować przybycie poza geostrefą',
  },
  coverageTransfer: {
    es: 'Trasladar personal entre estaciones para cubrir',
    en: 'Move staff between stations to cover',
    pt: 'Transferir pessoal entre estações para cobrir',
    de: 'Personal zur Abdeckung zwischen Standorten verlegen',
    fr: 'Déplacer du personnel entre postes pour couvrir',
    it: 'Spostare personale tra postazioni per coprire',
    nl: 'Personeel tussen posten verplaatsen om te dekken',
    pl: 'Przenosić personel między posterunkami, by zapewnić obsadę',
  },
  estimateConvert: {
    es: 'Convertir una cotización en contrato o factura',
    en: 'Turn a quote into a contract or invoice',
    pt: 'Converter um orçamento em contrato ou fatura',
    de: 'Ein Angebot in Vertrag oder Rechnung umwandeln',
    fr: 'Convertir un devis en contrat ou facture',
    it: 'Convertire un preventivo in contratto o fattura',
    nl: 'Een offerte omzetten in contract of factuur',
    pl: 'Zamieniać ofertę w umowę lub fakturę',
  },
  estimateDownload: {
    es: 'Descargar cotizaciones (PDF)',
    en: 'Download quotes (PDF)',
    pt: 'Baixar orçamentos (PDF)',
    de: 'Angebote herunterladen (PDF)',
    fr: 'Télécharger les devis (PDF)',
    it: 'Scaricare i preventivi (PDF)',
    nl: 'Offertes downloaden (pdf)',
    pl: 'Pobierać oferty (PDF)',
  },
};

type Localized3 = { es: string; en: string; pt: string } & Partial<
  Record<"de" | "fr" | "it" | "nl" | "pl", string>
>;

/* ── LABELS IN ALL EIGHT LANGUAGES (QA re-test 2026-11-01, N5) ─────────────
   The role editor showed raw ids for these groups and permissions
   («assistantUse», «Ver performanceSettings», «Agregar invoice»). They are
   written in the eight interface languages; a resource here also brings the
   action words in that language (ACTION_LABELS_I18N), so a German screen never
   mixes «View» with a German noun. Resources not yet here keep the es/en/pt
   matrix with English as the fallback. */
type Lang8 = "es" | "en" | "pt" | "de" | "fr" | "it" | "nl" | "pl";
type Localized8 = Record<Lang8, string>;

const RESOURCE_LABELS_I18N: Record<string, Localized8> = {
  assistant: { es: "Asistente IA", en: "AI assistant", pt: "Assistente de IA", de: "KI-Assistent", fr: "Assistant IA", it: "Assistente IA", nl: "AI-assistent", pl: "Asystent AI" },
  billing: { es: "Facturación de la cuenta", en: "Account billing", pt: "Faturamento da conta", de: "Kontoabrechnung", fr: "Facturation du compte", it: "Fatturazione dell'account", nl: "Accountfacturering", pl: "Rozliczenia konta" },
  coverage: { es: "Cobertura de puestos", en: "Post coverage", pt: "Cobertura de postos", de: "Postenabdeckung", fr: "Couverture des postes", it: "Copertura delle postazioni", nl: "Postdekking", pl: "Obsada posterunków" },
  dobletes: { es: "Dobletes", en: "Double shifts", pt: "Dobras de turno", de: "Doppelschichten", fr: "Doubles postes", it: "Doppi turni", nl: "Dubbele diensten", pl: "Podwójne zmiany" },
  estimate: { es: "Cotizaciones", en: "Quotes", pt: "Orçamentos", de: "Angebote", fr: "Devis", it: "Preventivi", nl: "Offertes", pl: "Oferty" },
  invoice: { es: "Facturas a clientes", en: "Client invoices", pt: "Faturas a clientes", de: "Kundenrechnungen", fr: "Factures clients", it: "Fatture ai clienti", nl: "Klantfacturen", pl: "Faktury dla klientów" },
  payrollIntegration: { es: "Nómina externa (Gusto)", en: "External payroll (Gusto)", pt: "Folha externa (Gusto)", de: "Externe Lohnabrechnung (Gusto)", fr: "Paie externe (Gusto)", it: "Paghe esterne (Gusto)", nl: "Externe salarisadministratie (Gusto)", pl: "Zewnętrzne płace (Gusto)" },
  payrollProfile: { es: "Perfiles de pago", en: "Pay profiles", pt: "Perfis de pagamento", de: "Vergütungsprofile", fr: "Profils de rémunération", it: "Profili retributivi", nl: "Loonprofielen", pl: "Profile płacowe" },
  payrollSlip: { es: "Roles de pago", en: "Payslips", pt: "Holerites", de: "Lohnabrechnungen", fr: "Bulletins de paie", it: "Buste paga", nl: "Loonstroken", pl: "Paski wypłaty" },
  performanceSettings: { es: "Ajustes de desempeño", en: "Performance settings", pt: "Configurações de desempenho", de: "Leistungseinstellungen", fr: "Paramètres de performance", it: "Impostazioni delle prestazioni", nl: "Prestatie-instellingen", pl: "Ustawienia wyników" },
  plan: { es: "Plan de suscripción", en: "Subscription plan", pt: "Plano de assinatura", de: "Abonnement", fr: "Formule d'abonnement", it: "Piano di abbonamento", nl: "Abonnement", pl: "Plan subskrypcji" },
  routeExecution: { es: "Rutas en curso", en: "Routes in progress", pt: "Rotas em andamento", de: "Laufende Routen", fr: "Itinéraires en cours", it: "Percorsi in corso", nl: "Lopende routes", pl: "Trasy w toku" },
  routeTemplate: { es: "Plantillas de ruta", en: "Route templates", pt: "Modelos de rota", de: "Routenvorlagen", fr: "Modèles d'itinéraire", it: "Modelli di percorso", nl: "Routesjablonen", pl: "Szablony tras" },
  tax: { es: "Impuestos", en: "Taxes", pt: "Impostos", de: "Steuern", fr: "Taxes", it: "Imposte", nl: "Belastingen", pl: "Podatki" },
  tenant: { es: "Empresa", en: "Company", pt: "Empresa", de: "Unternehmen", fr: "Entreprise", it: "Azienda", nl: "Bedrijf", pl: "Firma" },
};

const ACTION_LABELS_I18N: Record<"de" | "fr" | "it" | "nl" | "pl", Record<string, string>> = {
  de: { Import: "Importieren:", Create: "Anlegen:", Edit: "Bearbeiten:", Destroy: "Löschen:", Read: "Ansehen:", Autocomplete: "Autovervollständigen:", Export: "Exportieren:", Restore: "Wiederherstellen:", Archive: "Archivieren:", Approve: "Genehmigen:", Correct: "Korrigieren:", Send: "Senden:", Manage: "Verwalten:", Reply: "Antworten:", Complete: "Abschließen:", Attempt: "Ablegen:", Confirm: "Bestätigen:", Volunteer: "Freiwillig melden:" },
  fr: { Import: "Importer", Create: "Ajouter", Edit: "Modifier", Destroy: "Supprimer", Read: "Voir", Autocomplete: "Saisie automatique", Export: "Exporter", Restore: "Restaurer", Archive: "Archiver", Approve: "Approuver", Correct: "Corriger", Send: "Envoyer", Manage: "Gérer", Reply: "Répondre à", Complete: "Terminer", Attempt: "Passer", Confirm: "Confirmer", Volunteer: "Se porter volontaire pour" },
  it: { Import: "Importare", Create: "Aggiungere", Edit: "Modificare", Destroy: "Eliminare", Read: "Vedere", Autocomplete: "Completamento automatico", Export: "Esportare", Restore: "Ripristinare", Archive: "Archiviare", Approve: "Approvare", Correct: "Correggere", Send: "Inviare", Manage: "Gestire", Reply: "Rispondere a", Complete: "Completare", Attempt: "Sostenere", Confirm: "Confermare", Volunteer: "Offrirsi per" },
  nl: { Import: "Importeren:", Create: "Toevoegen:", Edit: "Bewerken:", Destroy: "Verwijderen:", Read: "Bekijken:", Autocomplete: "Automatisch aanvullen:", Export: "Exporteren:", Restore: "Herstellen:", Archive: "Archiveren:", Approve: "Goedkeuren:", Correct: "Corrigeren:", Send: "Versturen:", Manage: "Beheren:", Reply: "Beantwoorden:", Complete: "Voltooien:", Attempt: "Afleggen:", Confirm: "Bevestigen:", Volunteer: "Aanmelden voor:" },
  pl: { Import: "Importuj:", Create: "Dodaj:", Edit: "Edytuj:", Destroy: "Usuń:", Read: "Wyświetl:", Autocomplete: "Autouzupełnianie:", Export: "Eksportuj:", Restore: "Przywróć:", Archive: "Archiwizuj:", Approve: "Zatwierdź:", Correct: "Popraw:", Send: "Wyślij:", Manage: "Zarządzaj:", Reply: "Odpowiedz:", Complete: "Ukończ:", Attempt: "Podejdź:", Confirm: "Potwierdź:", Volunteer: "Zgłoś się:" },
};


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
  return e[l] ?? e.en;
}

/** Locale-aware group/resource label (falls back to the raw key). */
export function getResourceLabel(resourceKey: string): string {
  const all = RESOURCE_LABELS_I18N[resourceKey];
  if (all) return all[uiLang() as Lang8] ?? all.en;
  return resourceMap()[resourceKey] ?? RESOURCE_LABELS[resourceKey] ?? resourceKey;
}

/** Action words in the language a resource label was written in. */
function actionMapFor(resourceKey: string): Record<string, string> {
  const l = uiLang();
  if (RESOURCE_LABELS_I18N[resourceKey] && l in ACTION_LABELS_I18N) {
    return ACTION_LABELS_I18N[l as keyof typeof ACTION_LABELS_I18N];
  }
  return actionMap();
}

export function formatPermissionLabel(permission: string) {
  const special = SPECIAL_PERMISSION_LABELS[permission];
  if (special) return especialEnIdioma(special);
  // split suffix from resource
  const suffixes = Object.keys(ACTION_LABELS).sort((a, b) => b.length - a.length);
  for (const s of suffixes) {
    if (permission.endsWith(s)) {
      const resourceKey = permission.slice(0, -s.length);
      const resource = getResourceLabel(resourceKey);
      const action = actionMapFor(resourceKey)[s] ?? s;
      return `${action} ${resource}`;
    }
  }
  return permission;
}
