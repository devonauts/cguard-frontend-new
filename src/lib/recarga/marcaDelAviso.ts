/**
 * ════════════════════════════════════════════════════════════════════════════
 * DE PARTE DE QUIÉN HABLA EL AVISO DE RECARGA
 *
 * «Hay una versión nueva de {{marca}}» lo firma la PLATAFORMA de la empresa, no
 * el dominio por el que se entra: una empresa directa ve «CGuard Pro» y la de un
 * socio, el nombre de SU socio — también si entra por `app.cguardpro.com`, que
 * es donde el resto del CRM sigue pintando lo nuestro (2026-10-08, decisión del
 * dueño: «que sea dinámico y salga con el nombre de CGuardPro o del partner»).
 *
 * El aviso vive en `main.tsx`, FUERA de la sesión (sale también en la pantalla
 * de acceso). Por eso la sesión le deja el nombre aquí —lo publica
 * `IdentidadEfectivaProvider`, que ya sabe qué empresa está activa— y el aviso
 * lo lee. Sin sesión manda el anfitrión: la puerta de entrada es suya.
 *
 * El mensaje que escribe el SuperAdmin admite la etiqueta `{{marca}}`, que se
 * sustituye aquí por ese mismo nombre en cada empresa.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Lo justo de la empresa activa, tal como lo manda `/auth/me`. */
export interface EmpresaDeLaSesion {
  billingOwnership?: string | null;
  resellerPublicId?: string | null;
  resellerBrandName?: string | null;
}

/**
 * El nombre que firma, o `""` si no se puede decir ninguno.
 *
 * Una empresa de socio cuyo socio no tiene nombre publicado ni comercial NO cae
 * a «CGuard Pro»: el aviso sale sin nombre. Decir el nuestro ahí es justo la
 * fuga que esto viene a cerrar.
 */
export function marcaDeLaEmpresa(
  empresa: EmpresaDeLaSesion | null | undefined,
  nombreDePlataforma: string,
): string {
  if (!empresa) return "";
  const deSocio =
    !!empresa.resellerPublicId ||
    String(empresa.billingOwnership || "").toLowerCase() === "reseller";

  if (deSocio) return String(empresa.resellerBrandName || "").trim();

  return nombreDePlataforma;
}

/** La etiqueta, con o sin espacios dentro: `{{marca}}`, `{{ marca }}`, `{{MARCA}}`. */
const ETIQUETA = /\{\{\s*marca\s*\}\}/gi;

/** Sustituye `{{marca}}` en el mensaje del SuperAdmin. Sin nombre, quien llama pasa «la plataforma». */
export function personalizar(mensaje: string, marca: string): string {
  return mensaje
    .replace(ETIQUETA, marca)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/* ── El hilo entre la sesión y el aviso ──────────────────────────────────── */

/** `undefined` = no hay sesión (manda el anfitrión); `""` = sesión sin nombre que decir. */
let actual: string | undefined;
const oyentes = new Set<() => void>();

export function publicarMarcaDeLaSesion(valor: string | undefined): void {
  if (valor === actual) return;
  actual = valor;
  oyentes.forEach((f) => f());
}

export function leerMarcaDeLaSesion(): string | undefined {
  return actual;
}

export function suscribirMarcaDeLaSesion(f: () => void): () => void {
  oyentes.add(f);

  return () => {
    oyentes.delete(f);
  };
}
