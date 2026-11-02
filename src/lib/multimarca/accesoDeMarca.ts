/**
 * MULTIMARCA · PHASE 2 — the office per brand.
 *
 * A person can be limited to some brands (`tenantUsers.brandAccess`, a list
 * of brand ids). The «Administrador de marca» (`brandAdmin`) is an admin of
 * THEIR brands: they see everything of those brands (clients, quotes,
 * invoices, and the full HR and payroll of the people working there) but they
 * never pay, never touch the account, never create or archive brands and
 * never hand out roles. The server enforces all of it (`calcularAlcance` +
 * `rutaVedadaAlAdminDeMarca`); the CRM only avoids offering what would be
 * refused and says WHY in plain words.
 *
 * Everything here is free of React so it can be tested.
 */
import i18n from "@/i18n";

/** The role slug of the brand admin. */
export const ROL_ADMIN_DE_MARCA = "brandAdmin";

function lista(r: unknown): string[] {
  if (Array.isArray(r)) return r.map(String);
  if (typeof r === "string") {
    try {
      const p = JSON.parse(r);

      return Array.isArray(p) ? p.map(String) : [r];
    } catch {
      return [r];
    }
  }

  return [];
}

/** `null` = every brand; an array (maybe empty) = only those. */
export function normalizarAcceso(v: unknown): string[] | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    try {
      return normalizarAcceso(JSON.parse(v));
    } catch {
      return null;
    }
  }
  if (!Array.isArray(v)) return null;

  return [...new Set(v.map(String).filter(Boolean))];
}

export interface AccesoDeLaSesion {
  /** Brand ids this person is limited to; null = all brands. */
  brandAccess: string[] | null;
  /** Holds the «Administrador de marca» role (and is not an admin). */
  esAdminDeMarca: boolean;
  /** Administrator (or owner/superadmin): brand limits do not apply. */
  esAdmin: boolean;
  /**
   * Narrowed to some brands: the top bar offers only those and the company-
   * wide actions (pay, store, brands, roles) are not offered.
   */
  restringido: boolean;
}

/**
 * What the session says about brand access. `/auth/me` carries
 * `brandAccess` and `isBrandAdmin` at the top (phase 2); the tenant entry is
 * read too, so an older or differently shaped profile still works.
 */
export function accesoDeLaSesion(
  user: any,
  tenantId: string | null,
): AccesoDeLaSesion {
  const entrada = (Array.isArray(user?.tenants) ? user.tenants : []).find(
    (x: any) =>
      [x?.tenant?.id, x?.tenantId, x?.id].map(String).includes(String(tenantId)),
  );
  const roles = lista(entrada?.roles ?? entrada?.tenantUser?.roles ?? user?.roles);
  const esAdmin =
    !!user?.isSuperadmin || roles.includes("admin") || roles.includes("owner");
  const crudo =
    user?.brandAccess !== undefined
      ? user.brandAccess
      : (entrada?.brandAccess ?? entrada?.tenantUser?.brandAccess);
  const tieneRol = roles.includes(ROL_ADMIN_DE_MARCA);
  const esAdminDeMarca =
    !esAdmin && (user?.isBrandAdmin === true || tieneRol);
  return { ...accesoEfectivo(esAdmin ? null : crudo, esAdminDeMarca), esAdmin };
}

/**
 * The contract's rule on a stored `brandAccess`: only a NON-EMPTY list narrows
 * an ordinary role (null or [] = every brand); a brand admin is always
 * narrowed, and with no brands sees nothing (the server fails closed).
 */
export function accesoEfectivo(
  crudo: unknown,
  esAdminDeMarca: boolean,
): { brandAccess: string[] | null; esAdminDeMarca: boolean; restringido: boolean } {
  const v = normalizarAcceso(crudo);

  if (esAdminDeMarca) return { brandAccess: v ?? [], esAdminDeMarca, restringido: true };
  const brandAccess = v && v.length ? v : null;

  return { brandAccess, esAdminDeMarca, restringido: brandAccess !== null };
}

// ── The route gate's refusals (403 `marca_<motivo>`) ───────────────────────

/** The `marca_*` code of a refusal, wherever the server put it. */
export function motivoDeMarca(data: any): string | null {
  const d = data?.data ?? data?.response?.data ?? data?.details ?? data;

  for (const c of [d?.reason, d?.code, d?.errorCode, d?.messageCode]) {
    if (typeof c === "string" && /^marca_[a-z_]+$/.test(c)) return c;
  }

  return null;
}

/**
 * The refusal in plain words: what was refused and who can do it. Literal
 * keys (the i18n guard test reads them). Unknown `marca_*` codes get the
 * general line.
 */
export function mensajeDeAccesoDeMarca(code: string | null): string {
  switch (code) {
    case "marca_pago":
      return i18n.t(
        "ui.AccesoDeMarca.errores.pago",
        "Los pagos, la tienda y las marcas adicionales los gestiona un administrador de la empresa, no el de una marca.",
      );
    case "marca_cuenta":
      return i18n.t(
        "ui.AccesoDeMarca.errores.cuenta",
        "La cuenta de la empresa la gestiona un administrador general.",
      );
    case "marca_estructura":
      return i18n.t(
        "ui.AccesoDeMarca.errores.estructura",
        "Crear, editar o archivar marcas, o cambiar qué marcas ve cada persona, lo hace un administrador de la empresa.",
      );
    case "marca_roles":
      return i18n.t(
        "ui.AccesoDeMarca.errores.roles",
        "No puedes dar el rol de administrador ni de administrador de marca o de sucursal, ni editar a quien lo tiene.",
      );
    case "marca_empresa":
      return i18n.t(
        "ui.AccesoDeMarca.errores.empresa",
        "Esta configuración vale para toda la empresa: la cambia un administrador general.",
      );
    case "marca_fuera_de_alcance":
      return i18n.t(
        "ui.AccesoDeMarca.errores.fueraDeAlcance",
        "Eso pertenece a una marca que no tienes asignada.",
      );
    default:
      return i18n.t(
        "ui.AccesoDeMarca.errores.general",
        "Tu acceso por marca no permite hacer esto. Pídeselo a un administrador de la empresa.",
      );
  }
}

/**
 * The text a client error should carry: for a `marca_*` refusal, ours in the
 * reader's language; for anything else, the server's text untouched.
 */
export function textoDeError(data: any, delServidor: string): string {
  const code = motivoDeMarca(data);

  return code ? mensajeDeAccesoDeMarca(code) : delServidor;
}

/**
 * A brand chosen in the top bar that this person may no longer see (their
 * access changed on another device, or the brand was taken from them): every
 * request carrying it is refused with 403 `marca_fuera_de_alcance`, the brand
 * list included, so the bar could never correct itself. On the first such
 * refusal of a READ the choice goes back to «all my brands» and the CRM
 * reloads, once per minute at most.
 */
export function corregirMarcaFueraDeAlcance(
  status: number,
  data: any,
  method: string,
  conCabeceraDeMarca: boolean,
): boolean {
  if (
    status !== 403 ||
    !conCabeceraDeMarca ||
    String(method).toUpperCase() !== "GET" ||
    motivoDeMarca(data) !== "marca_fuera_de_alcance"
  )
    return false;
  try {
    const ultima = Number(sessionStorage.getItem("cguard.marcaCorregida") || 0);

    if (Date.now() - ultima < 60_000) return false;
    sessionStorage.setItem("cguard.marcaCorregida", String(Date.now()));
  } catch {
    /* no storage: still correct it */
  }
  void (async () => {
    const { elegirMarca } = await import("@/lib/marcaElegida");
    const { recargarSinCache } = await import("@/lib/offline/recargarSinCache");

    elegirMarca(null);
    await recargarSinCache();
  })();

  return true;
}

// ── Giving access (office user create / edit / invite) ─────────────────────

const clave = (rol: unknown) => String(rol ?? "").trim().toLowerCase();

/** The roles brand access never applies to: they see every brand. */
export function rolVeTodasLasMarcas(rol: unknown): boolean {
  return ["admin", "owner"].includes(clave(rol));
}

export function esRolAdminDeMarca(rol: unknown): boolean {
  return clave(rol) === ROL_ADMIN_DE_MARCA.toLowerCase();
}

/**
 * What to store for a person given their role and the brands ticked:
 *   · admin → nothing to store (`undefined`: admins ignore it);
 *   · brand admin → the list as is (an empty one is refused before saving);
 *   · any other role → `null` (every brand) or the brands ticked; unticking
 *     the last brand means «every brand» again, as with branches.
 */
export function accesoParaGuardar(
  rol: unknown,
  valor: string[] | null,
): string[] | null | undefined {
  if (rolVeTodasLasMarcas(rol)) return undefined;
  const v = normalizarAcceso(valor);

  if (esRolAdminDeMarca(rol)) return v ?? [];

  return v && v.length ? v : null;
}

/** Why the access cannot be saved as is, or null. */
export function errorDeAcceso(
  rol: unknown,
  valor: string[] | null,
): "sinMarcas" | null {
  if (esRolAdminDeMarca(rol) && !(normalizarAcceso(valor) ?? []).length)
    return "sinMarcas";

  return null;
}

/**
 * The roles someone limited to some brands may NOT give: admin, branch
 * manager and brand admin (403 `marca_roles`). They are not offered.
 */
export const ROLES_QUE_NO_DA_UN_ADMIN_DE_MARCA = [
  "admin",
  "owner",
  "branchmanager",
  ROL_ADMIN_DE_MARCA.toLowerCase(),
];

export function rolQuePuedeDar(rol: unknown, restringido: boolean): boolean {
  return !restringido || !ROLES_QUE_NO_DA_UN_ADMIN_DE_MARCA.includes(clave(rol));
}

interface RolLista {
  id: string;
  name?: string | null;
  slug?: string | null;
}

/** The slug of a role row (rows carry UUID ids; the slug or name says what it is). */
export function claveDeRolLista(r: RolLista): string {
  return clave(r.slug || r.name || r.id);
}

/**
 * The office roles a form offers, adjusted for brands:
 *   · with the module, «Administrador de marca» is offered (a built-in role:
 *     added by its slug when the company's role list does not carry it yet);
 *   · without it, it is not offered (unless the person already has it, so an
 *     edit never loses the value: `actual`);
 *   · someone limited to brands never offers admin, branch manager or brand
 *     admin (the server refuses it: `marca_roles`).
 */
export function rolesConMarca<R extends RolLista>(
  roles: R[],
  o: { modulo: boolean; restringido: boolean; actual?: string | null },
): R[] {
  const esActual = (r: R) =>
    !!o.actual && (String(r.id) === String(o.actual) || claveDeRolLista(r) === clave(o.actual));
  let out = roles.filter(
    (r) =>
      esActual(r) ||
      ((o.modulo || !esRolAdminDeMarca(claveDeRolLista(r))) &&
        rolQuePuedeDar(claveDeRolLista(r), o.restringido)),
  );

  if (
    o.modulo &&
    !o.restringido &&
    !out.some((r) => esRolAdminDeMarca(claveDeRolLista(r)))
  ) {
    out = [
      ...out,
      { id: ROL_ADMIN_DE_MARCA, name: ROL_ADMIN_DE_MARCA, slug: ROL_ADMIN_DE_MARCA } as R,
    ];
  }

  return out;
}
