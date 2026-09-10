/**
 * CRM channel access control (defense-in-depth + UX; the backend is the real
 * boundary). Guards → worker app, supervisors → supervisor app, customers →
 * portal. Only administrative/office accounts may use this CRM.
 */

// Roles that must NEVER reach the CRM (their home is a mobile app / portal).
export const FIELD_ONLY_ROLES = [
  "securityguard",
  "securitysupervisor",
  "customer",
];

const SUPER = ["superadmin", "super_admin"];

/** Every role slug (lowercased) a user holds, across selected tenant, tenants[], top-level. */
export function normalizedRoles(user: any): string[] {
  const out: string[] = [];
  const push = (r: any) => {
    if (!r) return;
    if (Array.isArray(r)) r.forEach((x) => push(x));
    else if (typeof r === "string")
      r.split(",").forEach((x) => out.push(x.trim()));
    else if (typeof r === "object" && (r.name || r.slug || r.id || r.key))
      out.push(String(r.name || r.slug || r.id || r.key));
  };

  push(user?.tenant?.roles ?? user?.tenant?.role);
  if (Array.isArray(user?.tenants))
    user.tenants.forEach((t: any) => push(t?.roles ?? t?.role));
  push(user?.roles ?? user?.role);
  if (user?.isSuperadmin) out.push("superadmin");

  return out.map((r) => String(r).toLowerCase()).filter(Boolean);
}

export function isPlatformSuperadmin(user: any): boolean {
  return (
    user?.isSuperadmin === true ||
    normalizedRoles(user).some((r) => SUPER.includes(r))
  );
}

/**
 * True when this user may use the CRM. Mirrors the backend rule: superadmin →
 * yes; roleless → yes (harmless restricted dashboard, matches backend); a user
 * with roles is allowed iff they hold at least one non-field-only (office) role.
 */
export function canAccessCrm(user: any): boolean {
  if (!user) return false;
  if (isPlatformSuperadmin(user)) return true;
  // El operador de la CENTRAL entra aunque su rol sea «vigilante»: lo que le
  // abre el CRM es tener la consola asignada, no su rol. El servidor lo marca
  // en cada membresía (ver centralOperationsService); aquí sólo se respeta.
  if (esOperadorDeCentral(user)) return true;
  const roles = normalizedRoles(user);

  if (roles.length === 0) return true;

  return roles.some((r) => !FIELD_ONLY_ROLES.includes(r));
}

/** ¿Alguna empresa activa lo marca como operador de la central de operaciones? */
export function esOperadorDeCentral(user: any): boolean {
  if (!user) return false;
  if (user.centralOperator === true) return true;
  const ts = Array.isArray(user?.tenants) ? user.tenants : [];

  return ts.some(
    (t: any) =>
      t && t.centralOperator === true && (!t.status || t.status === "active"),
  );
}

/**
 * ── NIVEL DE AUTORIDAD (espejo de `staffTierGuard` del backend) ──────────
 *
 * Varios endpoints del CRM piden un permiso ancho (p. ej. `businessInfoRead`,
 * que también alimenta el portal del cliente) y encima imponen un PISO de
 * autoridad. El servidor es la frontera de verdad; esto es su espejo para que
 * el CRM no pida datos que ya sabe que le van a negar — cada petición así
 * devolvía 403 y dejaba un rastro de error en el log del servidor.
 *
 * Mantener `ROLE_AUTHORITY` sincronizado con `backend/src/security/roles.ts`.
 */
export const ROLE_AUTHORITY: Record<string, number> = {
  superadmin: 110,
  admin: 100,
  operationsmanager: 90,
  securitysupervisor: 80,
  hrmanager: 75,
  clientaccountmanager: 70,
  administrativesupervisor: 68,
  dispatcher: 60,
  centraloperator: 60,
  administrativeassistant: 55,
  secretary: 52,
  securityguard: 50,
  customer: 10,
  custom: 1,
};

export const AUTHORITY = {
  MANAGEMENT: 90, // admin, operationsManager — finanzas / panel ejecutivo
  SUPERVISOR: 80,
  HR: 75,
  DISPATCHER: 60, // + dispatcher — monitoreo de operaciones
  OFFICE: 52, // + oficina; excluye vigilante(50) y cliente(10)
  GUARD: 50,
} as const;

/** Roles (en minúsculas) del usuario ACOTADOS a una empresa y a membresías activas. */
function rolesEnEmpresa(user: any, tenantId?: string | null): string[] {
  if (!tenantId) return normalizedRoles(user);
  const out: string[] = [];
  const push = (r: any) => {
    if (!r) return;
    if (Array.isArray(r)) r.forEach((x) => push(x));
    else if (typeof r === "string")
      r.split(",").forEach((x) => out.push(x.trim()));
    else if (typeof r === "object" && (r.name || r.slug || r.id || r.key))
      out.push(String(r.name || r.slug || r.id || r.key));
  };
  const idDe = (t: any) => String(t?.tenantId || t?.tenant?.id || "");
  const activa = (t: any) =>
    !t?.status || String(t.status).toLowerCase() === "active";
  const membresias = Array.isArray(user?.tenants) ? user.tenants : [];

  membresias
    .filter((t: any) => idDe(t) === String(tenantId) && activa(t))
    .forEach((t: any) => push(t?.roles ?? t?.role));
  // `user.tenant` es la empresa ya seleccionada: sólo cuenta si es ÉSTA.
  if (!user?.tenant?.id || String(user.tenant.id) === String(tenantId)) {
    push(user?.tenant?.roles ?? user?.tenant?.role);
  }
  push(user?.roles ?? user?.role);
  if (user?.isSuperadmin) out.push("superadmin");

  return out.map((r) => String(r).toLowerCase()).filter(Boolean);
}

/**
 * Autoridad máxima del usuario EN ESA EMPRESA. Igual que el backend:
 * superadmin de plataforma = 999, y el operador de central sube a
 * despachador (60) mientras tenga la consola, nunca por encima.
 */
export function userAuthority(user: any, tenantId?: string | null): number {
  if (!user) return 0;
  if (isPlatformSuperadmin(user)) return 999;
  const porRol = rolesEnEmpresa(user, tenantId).reduce(
    (max, slug) => Math.max(max, ROLE_AUTHORITY[slug] || 0),
    0,
  );
  const porConsola = esOperadorDeCentral(user) ? ROLE_AUTHORITY.dispatcher : 0;

  return Math.max(porRol, porConsola);
}

/** ¿Alcanza el piso de autoridad que ese endpoint del CRM exige? */
export function hasMinAuthority(
  user: any,
  minAuthority: number,
  tenantId?: string | null,
): boolean {
  return userAuthority(user, tenantId) >= minAuthority;
}
