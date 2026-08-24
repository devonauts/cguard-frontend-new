/**
 * CRM channel access control (defense-in-depth + UX; the backend is the real
 * boundary). Guards → worker app, supervisors → supervisor app, customers →
 * portal. Only administrative/office accounts may use this CRM.
 */

// Roles that must NEVER reach the CRM (their home is a mobile app / portal).
export const FIELD_ONLY_ROLES = ['securityguard', 'securitysupervisor', 'customer'];

const SUPER = ['superadmin', 'super_admin'];

/** Every role slug (lowercased) a user holds, across selected tenant, tenants[], top-level. */
export function normalizedRoles(user: any): string[] {
  const out: string[] = [];
  const push = (r: any) => {
    if (!r) return;
    if (Array.isArray(r)) r.forEach((x) => push(x));
    else if (typeof r === 'string') r.split(',').forEach((x) => out.push(x.trim()));
    else if (typeof r === 'object' && (r.name || r.slug || r.id || r.key)) out.push(String(r.name || r.slug || r.id || r.key));
  };
  push(user?.tenant?.roles ?? user?.tenant?.role);
  if (Array.isArray(user?.tenants)) user.tenants.forEach((t: any) => push(t?.roles ?? t?.role));
  push(user?.roles ?? user?.role);
  if (user?.isSuperadmin) out.push('superadmin');
  return out.map((r) => String(r).toLowerCase()).filter(Boolean);
}

export function isPlatformSuperadmin(user: any): boolean {
  return user?.isSuperadmin === true || normalizedRoles(user).some((r) => SUPER.includes(r));
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
  return ts.some((t: any) => t && t.centralOperator === true && (!t.status || t.status === 'active'));
}
