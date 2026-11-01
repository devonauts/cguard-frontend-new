export const PERMISSIONS: string[] = [
  "tenantEdit","tenantDestroy","planEdit","planRead","userEdit","userDestroy","userCreate","userImport","userRead","userAutocomplete","userExport",
  "categoryImport","categoryCreate","categoryEdit","categoryDestroy","categoryRead","categoryAutocomplete","auditLogRead","settingsEdit","settingsRead",
  "bannerSuperiorAppImport","bannerSuperiorAppCreate","bannerSuperiorAppEdit","bannerSuperiorAppDestroy","bannerSuperiorAppRead","bannerSuperiorAppAutocomplete",
  "serviceImport","serviceCreate","serviceEdit","serviceDestroy","serviceRead","serviceAutocomplete",
  "certificationImport","certificationCreate","certificationEdit","certificationDestroy","certificationRead","certificationAutocomplete",
  "securityGuardImport","securityGuardCreate","securityGuardRestore","securityGuardArchive","securityGuardEdit","securityGuardDestroy","securityGuardRead","securityGuardAutocomplete",
  "clientAccountImport","clientAccountCreate","clientAccountEdit","clientAccountDestroy","clientAccountRead","clientAccountAutocomplete",
  "businessInfoImport","businessInfoCreate","businessInfoEdit","businessInfoDestroy","businessInfoRead","businessInfoAutocomplete",
  "representanteEmpresaImport","representanteEmpresaCreate","representanteEmpresaEdit","representanteEmpresaDestroy","representanteEmpresaRead","representanteEmpresaAutocomplete",
  "incidentImport","incidentCreate","incidentEdit","incidentDestroy","incidentRead","incidentAutocomplete",
  "stationImport","stationCreate","stationEdit","stationDestroy","stationRead","stationAutocomplete",
  "shiftImport","shiftCreate","shiftEdit","shiftDestroy","shiftRead","shiftAutocomplete",
  "guardShiftImport","guardShiftCreate","guardShiftEdit","guardShiftDestroy","guardShiftRead","guardShiftAutocomplete",
  "patrolImport","patrolCreate","patrolEdit","patrolDestroy","patrolRead","patrolAutocomplete",
  "patrolCheckpointImport","patrolCheckpointCreate","patrolCheckpointEdit","patrolCheckpointDestroy","patrolCheckpointRead","patrolCheckpointAutocomplete",
  "patrolLogImport","patrolLogCreate","patrolLogEdit","patrolLogDestroy","patrolLogRead","patrolLogAutocomplete",
  "reportImport","reportCreate","reportEdit","reportDestroy","reportRead","reportAutocomplete",
  "inventoryImport","inventoryCreate","inventoryEdit","inventoryDestroy","inventoryRead","inventoryAutocomplete",
  "inventoryHistoryImport","inventoryHistoryCreate","inventoryHistoryEdit","inventoryHistoryDestroy","inventoryHistoryRead","inventoryHistoryAutocomplete",
  "additionalServiceImport","additionalServiceCreate","additionalServiceEdit","additionalServiceDestroy","additionalServiceRead","additionalServiceAutocomplete",
  "notificationImport","notificationCreate","notificationEdit","notificationDestroy","notificationRead","notificationAutocomplete",
  "notificationRecipientImport","notificationRecipientCreate","notificationRecipientEdit","notificationRecipientDestroy","notificationRecipientRead","notificationRecipientAutocomplete",
  "inquiriesImport","inquiriesCreate","inquiriesEdit","inquiriesDestroy","inquiriesRead","inquiriesAutocomplete",
  "requestImport","requestCreate","requestEdit","requestDestroy","requestRead","requestAutocomplete",
  "dispatchImport","dispatchCreate","dispatchEdit","dispatchDestroy","dispatchRead","dispatchAutocomplete",
  "taskImport","taskCreate","taskEdit","taskDestroy","taskRead","taskAutocomplete",
  "memosImport","memosCreate","memosEdit","memosDestroy","memosRead","memosAutocomplete",
  "tutorialImport","tutorialCreate","tutorialEdit","tutorialDestroy","tutorialRead","tutorialAutocomplete",
  "videoTutorialImport","videoTutorialCreate","videoTutorialEdit","videoTutorialDestroy","videoTutorialRead","videoTutorialAutocomplete",
  "videoTutorialCategoryImport","videoTutorialCategoryCreate","videoTutorialCategoryEdit","videoTutorialCategoryDestroy","videoTutorialCategoryRead","videoTutorialCategoryAutocomplete",
  "completionOfTutorialImport","completionOfTutorialCreate","completionOfTutorialEdit","completionOfTutorialDestroy","completionOfTutorialRead","completionOfTutorialAutocomplete",
  "deviceIdInformationImport","deviceIdInformationCreate","deviceIdInformationEdit","deviceIdInformationDestroy","deviceIdInformationRead","deviceIdInformationAutocomplete",
  "insuranceImport","insuranceCreate","insuranceEdit","insuranceDestroy","insuranceRead","insuranceAutocomplete",
  "fileCreate","fileEdit","fileDestroy","fileRead",
  // ── Nómina / asistencia ──
  "attendanceRead","attendanceEdit","attendanceApprove","attendanceCorrect","attendanceDestroy",
  "attendanceSettingsRead","attendanceSettingsEdit",
  // Conectar la nómina externa (Gusto, EE. UU.).
  "payrollIntegrationManage",
  "payrollSlipRead",
  "payrollSlipEdit",
  "payrollSlipPublish",
  "payrollProfileRead",
  "payrollProfileEdit",
  "timeOffRequestCreate","timeOffRequestRead","timeOffRequestEdit","timeOffRequestDestroy",
  // ── Programador ──
  "shiftExchangeRequestCreate","shiftExchangeRequestRead","shiftExchangeRequestEdit","shiftExchangeRequestDestroy",
  // ── Sitios / operación ──
  "postSiteCreate","postSiteRead","postSiteEdit","postSiteDestroy","postSiteAutocomplete",
  "routeImport","routeCreate","routeEdit","routeDestroy","routeRead","routeAutocomplete",
  // ── RUTAS DE SUPERVISIÓN (ejecución en vivo) ──────────────────────────────
  // Estos cinco existían en el backend y NO aquí, y esta lista es la que dibuja
  // Configuración › Roles. O sea que un admin no podía concederlos ni verlos:
  // la pantalla de Patrulla Vehicular respondía 403 y no había forma de
  // arreglarlo desde la interfaz. Es la misma lista de `permissions.ts` del
  // backend copiada a mano, así que se separa sola cada vez que se añade uno.
  "routeExecutionRead","routeDispatch","routeOverrideGeofence",
  "routeTemplateRead","routeTemplateManage",
  "vehicleCreate","vehicleEdit","vehicleDestroy","vehicleRead","vehicleAutocomplete",
  "visitorLogImport","visitorLogCreate","visitorLogEdit","visitorLogDestroy","visitorLogRead","visitorLogAutocomplete",
  "incidentTypeImport","incidentTypeCreate","incidentTypeEdit","incidentTypeDestroy","incidentTypeRead","incidentTypeAutocomplete",
  "licenseTypeCreate","licenseTypeEdit","licenseTypeDestroy","licenseTypeRead","licenseTypeAutocomplete",
  // ── Clientes / colaboración ──
  "clientContactCreate","clientContactEdit","clientContactDestroy","clientContactRead",
  "noteCreate","noteEdit","noteDestroy","noteRead",
  "attachmentCreate","attachmentEdit","attachmentDestroy","attachmentRead",
  "messageRead","messageSend",
  // ── Inventario / uniformes ──
  "inventoryItemCreate","inventoryItemEdit","inventoryItemDestroy","inventoryItemRead",
  "uniformInspectionCreate","uniformInspectionRead",
  // ── Radio ──
  "radioDeviceCreate","radioDeviceEdit","radioDeviceDestroy","radioDeviceRead",
  "radioCheckRead","radioCheckReply","radioCheckManage",
  "radioCheckSettingsRead","radioCheckSettingsEdit",
  "radioChannelRead","radioChannelManage",
  // ── Entrenamiento ──
  "trainingCourseCreate","trainingCourseRead","trainingCourseEdit","trainingCourseDestroy",
  "trainingLessonCreate","trainingLessonRead","trainingLessonEdit","trainingLessonDestroy","trainingLessonComplete",
  "trainingEnrollmentCreate","trainingEnrollmentRead",
  "trainingQuizAttempt","trainingCertificateRead",
  "quizBankRead","quizBankManage",
  "quizAttemptCreate","quizAttemptRead",
  // ── Cobertura de turnos ──
  "backupConfirm","backupVolunteer","backupEventRead",
  // Dobletes (módulo): ofrecer turnos a la reserva, campañas, ajustes.
  "dobletesManage",
  // «Registrar entrada» a nombre del vigilante en Cobertura en vivo.
  "coverageClockInOnBehalf",
  // ── Autoservicio apps móviles ──
  "staffMe","supervisorMe"
,
  // ── Puestos al día con el servidor (respaldo; la fuente es /permission-catalog) ──
  "assistantUse","performanceSettingsRead","performanceSettingsEdit","coverageRead","coverageCreate","coverageTransfer","billingImport","billingCreate","billingEdit","billingDestroy","billingRead","billingAutocomplete","estimateImport","estimateCreate","estimateEdit","estimateDestroy","estimateRead","estimateAutocomplete","estimateSend","estimateConvert","estimateDownload","invoiceImport","invoiceCreate","invoiceEdit","invoiceDestroy","invoiceRead","invoiceAutocomplete","invoiceSend","taxCreate","taxEdit","taxDestroy","taxRead","taxAutocomplete",
];

// Admin "floor" — permissions that can never be removed from the admin role or
// from an admin user, otherwise the tenant would lose access to role & user
// management. Mirrors backend src/security/staticRolePermissions.ts. Rendered as
// always-checked + disabled in the permission editors.
export const ADMIN_FLOOR_PERMISSIONS: string[] = [
  "settingsEdit",
  "settingsRead",
  "userRead",
  "userCreate",
  "userEdit",
  "userDestroy",
  "tenantEdit",
];

const ACTION_SUFFIXES = [
  'Import','Create','Edit','Destroy','Read','Autocomplete','Export','Restore','Archive',
  'Approve','Correct','Send','Manage','Reply','Complete','Attempt','Confirm','Volunteer',
];

// Some small resources are clearer folded into one display group in the role
// editor. Key = derived resource, value = the group bucket it should render in.
// (Only affects grouping/labels in the UI — the permission ids never change.)
const GROUP_OVERRIDES: Record<string, string> = {
  bannerSuperiorApp: 'clienteApp',
  service: 'clienteApp',
  certification: 'clienteApp',
};

export function groupPermissions(perms: string[]) {
  const groups: Record<string, string[]> = {};
  for (const p of perms) {
    // derive resource by stripping known action suffixes
    let resource = p;
    for (const s of ACTION_SUFFIXES) {
      if (resource.endsWith(s)) {
        resource = resource.slice(0, -s.length);
        break;
      }
    }
    resource = resource || p;
    resource = GROUP_OVERRIDES[resource] || resource;
    if (!groups[resource]) groups[resource] = [];
    groups[resource].push(p);
  }
  return groups;
}
