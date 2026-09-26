import i18n from "@/i18n";
/**
 * Empresa activa del CRM.
 *
 * Una misma persona puede administrar DOS empresas de seguridad en CGuardPro
 * (el dueño con dos compañías, o el jefe de operaciones que lleva las dos). La
 * sesión es UNA —el token vale para todas sus membresías, y cada ruta
 * `/tenant/:id/` valida la membresía en el servidor—, pero el CRM opera sobre
 * UNA empresa a la vez: la activa.
 *
 * Este módulo es la única fuente de verdad de (a) qué empresas puede usar y
 * (b) cuál está activa. Escribe en la MISMA clave `tenantId` que ya leían los
 * ~40 servicios del CRM, así que todo el tráfico existente sigue al selector
 * sin tocar una sola llamada.
 *
 * Vive fuera de React para que los servicios puedan leerlo sin un hook.
 */
import { FIELD_ONLY_ROLES } from "./access";

const ACTIVE_KEY = "tenantId";
const LIST_KEY = "tenants.available.v1";

export interface AvailableTenant {
  tenantId: string;
  name: string;
  logoUrl?: string | null;
}

let list: AvailableTenant[] = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");

    return Array.isArray(raw) ? raw.filter((t) => t && t.tenantId) : [];
  } catch {
    return [];
  }
})();

const subs = new Set<() => void>();

function emit(): void {
  subs.forEach((f) => {
    try {
      f();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeActiveTenant(f: () => void): () => void {
  subs.add(f);

  return () => {
    subs.delete(f);
  };
}

export function getActiveTenantId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function getAvailableTenants(): AvailableTenant[] {
  return list;
}

export function getActiveTenant(): AvailableTenant | null {
  const id = getActiveTenantId();

  return list.find((t) => t.tenantId === id) || null;
}

/** ¿Administra más de una empresa? Decide si el selector se pinta siquiera. */
export function isMultiTenant(): boolean {
  return list.length > 1;
}

function rolesDe(t: any): string[] {
  let r = t?.roles ?? t?.role ?? [];

  if (typeof r === "string") {
    try {
      r = JSON.parse(r);
    } catch {
      r = [r];
    }
  }

  return (Array.isArray(r) ? r : [r])
    .map((x: any) => String(x?.name || x?.slug || x || "").toLowerCase())
    .filter(Boolean);
}

/**
 * Reconstruye la lista desde el perfil. Sólo membresías que de verdad pueden
 * operar ESTE panel:
 *
 *  · en estado 'active' — una 'invited'/'pending' autentica pero no tiene
 *    permisos (PermissionChecker los exige 'active'), así que ofrecerla sería
 *    una empresa que responde 403 a todo;
 *  · con algún rol de OFICINA — mismo criterio que `canAccessCrm` y que el
 *    portero de canal del backend. Quien es vigilante en la Empresa A y
 *    administrador en la B no debe ver la A en este selector: su sitio en la A
 *    es la app, no el CRM.
 *
 * Si la activa dejó de ser elegible (lo archivaron ahí), salta a la primera
 * válida — si no, el panel se queda apuntando a una empresa que ya no le
 * responde.
 */
export function syncTenantsFromProfile(user: any): void {
  const next: AvailableTenant[] = [];
  const entries = Array.isArray(user?.tenants)
    ? user.tenants
    : user?.tenant
      ? [user.tenant]
      : [];

  for (const t of entries) {
    const tenantId = t?.tenantId || t?.tenant?.id || null;

    if (!tenantId) continue;
    const status = String(t?.status || "").toLowerCase();

    if (status && status !== "active") continue;
    const slugs = rolesDe(t);

    // Sin roles = se acepta (payloads viejos/lean); con roles, alguno de oficina.
    if (slugs.length && !slugs.some((r) => !FIELD_ONLY_ROLES.includes(r)))
      continue;
    next.push({
      tenantId,
      name: t?.tenant?.name || i18n.t("ui.activeTenant.miEmpresa", "Mi empresa"),
      logoUrl: t?.tenant?.logoUrl || null,
    });
  }

  // El backend puede mandar la lista ya filtrada al iniciar sesión; si viene,
  // se completa con ella — es la vista del servidor.
  if (Array.isArray(user?.availableTenants) && user.availableTenants.length) {
    const porId = new Map(next.map((t) => [t.tenantId, t]));

    for (const t of user.availableTenants) {
      if (t?.tenantId && !porId.has(t.tenantId)) {
        next.push({
          tenantId: t.tenantId,
          name: t.name || i18n.t("ui.activeTenant.miEmpresa", "Mi empresa"),
          logoUrl: t.logoUrl || null,
        });
      }
    }
  }

  list = next;
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }

  const activa = getActiveTenantId();

  if (list.length && !list.some((t) => t.tenantId === activa)) {
    setActiveTenantId(list[0].tenantId);

    return; // setActiveTenantId ya emitió
  }
  emit();
}

/**
 * La empresa que debe quedar activa para este perfil: la guardada si sigue
 * siendo elegible, y si no la primera.
 *
 * Es lo que sustituye al `user.tenants[0]` que el CRM tomaba a ciegas en cuatro
 * sitios — y que además PISABA la elección del selector en cada refresco del
 * perfil, devolviendo al administrador a la otra empresa sin avisar.
 */
export function resolveActiveTenantId(user: any): string | null {
  syncTenantsFromProfile(user);
  const activa = getActiveTenantId();

  if (activa && list.some((t) => t.tenantId === activa)) return activa;
  if (list.length) return list[0].tenantId;
  // Sin elegibles, el comportamiento histórico: la primera membresía que haya.
  const t0 = Array.isArray(user?.tenants) ? user.tenants[0] : null;

  return (t0 && (t0.tenantId || t0.tenant?.id)) || null;
}

export function setActiveTenantId(tenantId: string): void {
  if (getActiveTenantId() === tenantId) return;
  try {
    localStorage.setItem(ACTIVE_KEY, tenantId);
  } catch {
    /* ignore */
  }
  emit();
}

/** Limpiar al cerrar sesión: el siguiente que entre no hereda nada. */
export function clearTenants(): void {
  list = [];
  try {
    localStorage.removeItem(LIST_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
  emit();
}
