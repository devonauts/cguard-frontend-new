/**
 * ════════════════════════════════════════════════════════════════════════════
 * WHO CAN DO WHAT — the server's rule, mirrored for the buttons
 *
 * A button the person cannot use used to show and then fail («sin permiso»,
 * «se necesita el módulo»). Each action here repeats what its endpoint checks:
 *   · `permiso`      — the permission the endpoint validates (any of the list);
 *   · `nivel`        — the authority floor (backend security/staffTierGuard);
 *   · `alternativa`  — a second way the server accepts (payroll approval:
 *                      the payroll person OR a supervisor);
 *   · `dinero`       — needs Roles de pago or Gusto (backend services/payroll/moneyModule).
 * Keep it in step with the backend: a rule that drifts shows a button that
 * fails, or hides one that works.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Same levels as the backend `AUTHORITY`. */
export const NIVEL = {
  GERENCIA: 90,
  SUPERVISION: 80,
  RRHH: 75,
  CENTRAL: 60,
  OFICINA: 52,
  VIGILANTE: 50,
} as const;

export interface Regla {
  permiso: string | string[];
  nivel?: number;
  dinero?: boolean;
  alternativa?: { permiso: string | string[]; nivel?: number };
}

export const ACCIONES = {
  // ── Asistencia ──
  "asistencia.resolverNovedad": { permiso: "attendanceApprove" },
  "asistencia.resolverEnLote": { permiso: "attendanceApprove", nivel: NIVEL.GERENCIA },
  "asistencia.aprobarSolicitud": { permiso: "attendanceApprove" },
  "asistencia.corregir": { permiso: "attendanceCorrect" },
  "asistencia.editarTiempos": { permiso: "attendanceEdit" },
  "asistencia.marcarAMano": { permiso: "attendanceEdit", nivel: NIVEL.OFICINA },
  "asistencia.exportar": { permiso: "attendanceRead", nivel: NIVEL.GERENCIA },
  // Approve for payroll (records → Gusto / Roles de pago).
  "asistencia.aprobarParaPago": {
    permiso: "attendanceSettingsEdit", nivel: NIVEL.RRHH, dinero: true,
    alternativa: { permiso: "attendanceApprove", nivel: NIVEL.SUPERVISION },
  },
  "asistencia.marcarPagado": { permiso: "attendanceSettingsEdit", nivel: NIVEL.RRHH, dinero: true },
  // ── Horas del periodo (tarjetas) ──
  "tarjetas.generar": { permiso: "attendanceApprove" },
  "tarjetas.aprobar": {
    permiso: "attendanceSettingsEdit", nivel: NIVEL.RRHH,
    alternativa: { permiso: "attendanceApprove", nivel: NIVEL.SUPERVISION },
  },
  "tarjetas.reabrir": { permiso: "attendanceSettingsEdit", nivel: NIVEL.RRHH },
  "tarjetas.exportar": { permiso: "attendanceSettingsEdit", nivel: NIVEL.RRHH },
  "tarjetas.exportarDetalle": { permiso: "attendanceRead", nivel: NIVEL.RRHH },
  "tarjetas.cerrarPeriodo": { permiso: "attendanceSettingsEdit" },
  "tarjetas.reabrirPeriodo": { permiso: "attendanceSettingsEdit", nivel: NIVEL.GERENCIA },
  "tarjetas.tarifas": { permiso: "attendanceSettingsEdit", dinero: true },
  "asistencia.ajustes": { permiso: "attendanceSettingsEdit" },
  // ── Turnos ──
  "turnos.editarHorario": { permiso: "stationEdit", nivel: NIVEL.OFICINA },
  "turnos.crearPlaza": { permiso: "stationCreate", nivel: NIVEL.OFICINA },
  "turnos.publicarPlanificador": { permiso: "stationEdit", nivel: NIVEL.OFICINA },
  "cobertura.registrar": { permiso: "coverageCreate", nivel: NIVEL.OFICINA },
  "cobertura.trasladar": { permiso: "coverageTransfer", nivel: NIVEL.OFICINA },
  // «Registrar entrada» (the person is at the post and cannot clock in): its
  // own permission since 2026-11, so the central can have it without editing
  // every timecard (server: POST coverage/manual-clock-in).
  // Its own permission, or attendanceEdit until the permission sync copies it into stored roles.
  "cobertura.registrarEntrada": { permiso: ["coverageClockInOnBehalf", "attendanceEdit"], nivel: NIVEL.OFICINA },
  "dobletes.gestionar": { permiso: "dobletesManage", nivel: NIVEL.OFICINA },
  "intercambio.decidir": { permiso: "shiftExchangeRequestEdit" },
  // ── Permisos y vacaciones ──
  "permisos.crear": { permiso: "timeOffRequestCreate" },
  "permisos.decidir": { permiso: "timeOffRequestEdit" },
  "permisos.borrar": { permiso: "timeOffRequestDestroy" },
  // ── Empresa nueva (phase 3): the first step of each empty page ──
  "estaciones.crear": { permiso: "stationCreate", nivel: NIVEL.OFICINA },
  "personal.crearVigilante": { permiso: "securityGuardCreate", nivel: NIVEL.OFICINA },
  "personal.crearOficina": { permiso: "userCreate", nivel: NIVEL.OFICINA },
  // ── Background reads of the layout (QA 2026-11-01: the office assistant got
  //    silent 403s on every page). Same checks as the server routes. ──
  "alarmas.verCasos": { permiso: "businessInfoRead", nivel: NIVEL.CENTRAL }, // GET alarm/cases (dispatcher level and up)
  "suscripcion.verResumen": { permiso: "settingsRead", nivel: NIVEL.GERENCIA }, // GET subscription/summary
  "radio.verConsola": { permiso: "radioCheckRead" }, // GET radio-check/console
} satisfies Record<string, Regla>;

export type Accion = keyof typeof ACCIONES;

export type MotivoNo = "permiso" | "nivel" | "modulo";

export interface Contexto {
  esAdmin: boolean;
  tienePermiso: (p: string) => boolean;
  /** Authority in this company (`/auth/me` → tenants[].authority); null = unknown. */
  nivel: number | null;
  /** Roles de pago or Gusto connected; null = unknown. */
  conDinero: boolean | null;
}

const lista = (p: string | string[]) => (Array.isArray(p) ? p : [p]);

function cumple(ctx: Contexto, permiso: string | string[], nivel?: number): MotivoNo | null {
  if (!lista(permiso).some((p) => ctx.tienePermiso(p))) return "permiso";
  // Unknown level (older session) → do not hide; the server still decides.
  if (nivel && ctx.nivel !== null && ctx.nivel < nivel) return "nivel";
  return null;
}

/** null when the action is allowed; otherwise why not. Pure, for tests. */
export function motivoParaNo(regla: Regla, ctx: Contexto): MotivoNo | null {
  if (regla.dinero && ctx.conDinero === false) return "modulo";
  if (ctx.esAdmin) return null;
  const principal = cumple(ctx, regla.permiso, regla.nivel);
  if (!principal) return null;
  if (regla.alternativa && !cumple(ctx, regla.alternativa.permiso, regla.alternativa.nivel)) return null;
  return principal;
}
