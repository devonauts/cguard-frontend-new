// Shared shapes for the guard-detail tab pages under security-guards/components.
// These mirror the real backend models/endpoints (backend/src/database/models
// and backend/src/api/security-guard/*) so the tabs can drop their `any`s.
//
// NOTE: fields are optional/loose where the API response varies (rows vs bare
// arrays, association objects that may or may not be included).

import type { GuardUser } from '@/types/securityGuard';

/** A stored file descriptor (avatar, license image, note attachment). */
export interface FileDescriptor {
  id?: string;
  new?: boolean;
  name?: string;
  mimeType?: string;
  sizeInBytes?: number;
  size?: number;
  privateUrl?: string | null;
  publicUrl?: string | null;
  downloadUrl?: string | null;
  fileToken?: string | null;
  storageId?: string;
}

/** A minimal user reference as returned by `createdBy`/`updatedBy` includes. */
export interface UserRef {
  id?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

/**
 * The `guard` object the detail pages receive/derive. It is the security-guard
 * record from `securityGuardService.find(id)` — a securityGuard row that may
 * carry the linked app `user` under `guard`/`user`.
 */
export interface GuardDetail {
  id: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  governmentId?: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  status?: string;
  guardType?: string;
  stationId?: string;
  guardId?: string;
  userId?: string;
  guardNumber?: string;
  employeeCode?: string;
  guard?: GuardUser;
  user?: GuardUser;
  activated?: boolean;
  isOnDuty?: boolean;
  hasPassword?: boolean;
  photoUrl?: string | null;
  profileImage?: Array<{ downloadUrl?: string; publicUrl?: string; privateUrl?: string }> | { downloadUrl?: string; publicUrl?: string } | null;
  availability?: Array<{ day: string; available?: boolean; start?: string; end?: string }>;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * A KPI row (backend model `kpi`). Report flags/counts map 1:1 to the create
 * modal. `actual` is computed client-side in GuardKPIspage from the report
 * feed; it is not a persisted column.
 *
 * The `type`/`dateTime`/`addedBy`/`date`/`createdByName` fields are read by the
 * legacy table markup but are NOT returned by the endpoint (see FLAGGED note in
 * the audit report) — kept optional so the display degrades to blank rather
 * than crashing.
 */
export interface Kpi {
  id: string;
  scope?: 'guard' | 'postSite' | string;
  guardId?: string;
  postSiteId?: string;
  frequency?: string;
  description?: string;
  standardReports?: boolean;
  standardReportsNumber?: number | null;
  incidentReports?: boolean;
  incidentReportsNumber?: number | null;
  routeReports?: boolean;
  routeReportsNumber?: number | null;
  taskReports?: boolean;
  taskReportsNumber?: number | null;
  verificationReports?: boolean;
  verificationReportsNumber?: number | null;
  emailNotification?: boolean;
  emails?: string[];
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  guard?: { id?: string; fullName?: string } | null;
  postSite?: { id?: string; name?: string } | null;
  createdBy?: UserRef | null;
  /** Client-computed actual count for the selected month. */
  actual?: number;
  // Legacy display-only fields not emitted by the endpoint:
  type?: string;
  dateTime?: string;
  date?: string;
  addedBy?: string;
  pdfUrl?: string;
  pdfBase64?: string;
}

/** A license type option (backend `licenseType`). */
export interface LicenseTypeOption {
  id: string;
  name?: string;
}

/** A guard license row (backend model `guardLicense`). */
export interface GuardLicense {
  id: string;
  guardId?: string;
  licenseTypeId?: string | null;
  licenseType?: LicenseTypeOption | null;
  customName?: string | null;
  number?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  frontImage?: FileDescriptor[];
  backImage?: FileDescriptor[];
  createdBy?: UserRef | null;
  createdAt?: string;
  updatedAt?: string;
}

/** A note attachment descriptor (backend `attachment`/`file`). */
export interface NoteAttachment extends FileDescriptor {}

/** A guard note row (backend model `note`, notableType = 'note'). */
export interface GuardNote {
  id: string;
  title?: string;
  description?: string;
  noteDate?: string;
  date?: string;
  createdAt?: string;
  createdBy?: UserRef | null;
  addedBy?: string;
  attachments?: NoteAttachment[];
}

/** One factor in the 8-factor performance score. */
export interface PerformanceComponent {
  key:
    | 'punctuality'
    | 'uniform'
    | 'inventory'
    | 'consignas'
    | 'rondas'
    | 'quiz'
    | 'training'
    | 'clientRating';
  score: number;
  weight: number;
  /** Cuánto puede restar este factor de los 100 como máximo. */
  maxDeduction?: number;
  /** Cuánto está restando ahora mismo. */
  deduction?: number;
}

/** Attendance/rating stats bundled with the performance score. */
export interface PerformanceStats {
  attendanceRate?: number;
  shiftsWorked?: number;
  shiftsScheduled?: number;
  hoursWorked?: number;
  absences?: number;
  tardies?: number;
  clientRatingCount?: number;
  clientRatingAvg?: number;
}

/**
 * Guard/supervisor performance score (security-guard `/performance`).
 *
 * La nota PARTE DE 100 y sólo baja por lo que se mide, así que `score` es 100
 * para quien acaba de entrar. Cuando la medición está apagada —por la empresa o
 * por esta persona— `enabled` es false y `score` llega NULO: un 0 se leería
 * como una mala calificación, que es justo lo contrario de «no se le mide».
 */
export interface GuardPerformance {
  score: number | null;
  tier: string;
  hasData?: boolean;
  /** ¿Hay algo real detrás de la nota, o es el 100 de salida? */
  hasSignals?: boolean;
  /** ¿Se le mide el desempeño a esta persona? */
  enabled?: boolean;
  /** Qué interruptor lo apagó, si alguno. */
  disabledBy?: 'tenant' | 'subject' | null;
  /** El usuario puntuado — con él se escribe el interruptor de la persona. */
  subjectUserId?: string | null;
  /** De dónde parte la nota (100). */
  startingScore?: number;
  /** Cuánto se ha descontado de los 100 por los factores medidos. */
  deduction?: number;
  base?: number;
  penalty?: { points: number; absences: number; tardies: number };
  bonus?: { points: number; volunteerCount: number; coverCount: number };
  components?: PerformanceComponent[];
  stats?: PerformanceStats;
}

/** One day column header in the schedule snapshot. */
export interface ScheduleDay {
  date: string;
  dow: string;
  day: number | string;
  isToday?: boolean;
  weekend?: boolean;
}

/** One cell (day/night/rest/gap/none) in a schedule row. */
export interface ScheduleCell {
  date: string;
  status: string;
  /** Real turno window in tenant time, e.g. "07:00 - 19:00". */
  hours?: string | null;
  /** Who actually covers the day (may be a sacafranco, not the titular). */
  guardName?: string | null;
  covering?: boolean;
}

/** One station/position row in the schedule snapshot. */
export interface ScheduleRow {
  assignmentId?: string;
  positionId?: string;
  stationName?: string;
  positionName?: string;
  positionType?: string;
  sedeName?: string;
  clientName?: string;
  rotationStyleName?: string;
  window?: string;
  cells?: ScheduleCell[];
}

/** Forward schedule snapshot (security-guard `/schedule`). */
export interface ScheduleSnapshot {
  startDate?: string;
  endDate?: string;
  days?: ScheduleDay[];
  rows?: ScheduleRow[];
}

/**
 * A station/post assignment row (security-guard `/assignments`). The endpoint
 * has historically returned several shapes (snake/camel, flat id vs nested
 * object), so the consumers probe many keys — kept loose on purpose.
 */
export interface GuardAssignmentRow {
  id?: string;
  stationId?: string;
  stationName?: string;
  postSiteName?: string;
  clientName?: string;
  startTime?: string;
  endTime?: string;
  name?: string;
  postSiteId?: string;
  businessInfoId?: string;
  business_info_id?: string;
  post_site_id?: string;
  businessInfo?: { id?: string; businessInfoId?: string } | null;
  postSite?: { id?: string; postSiteId?: string } | null;
  [key: string]: unknown;
}
