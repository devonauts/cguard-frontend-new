/**
 * La SUCURSAL elegida en la barra superior (módulo «Sucursales»), por empresa.
 *
 * Viaja en cada petición como `x-cguard-branch`; el servidor acota con ella
 * todo lo que devuelve (y nunca amplía: elegir una que no te toca no enseña
 * nada nuevo). Vacía = todas las que la persona puede ver.
 *
 * Vive en el navegador, no en la cuenta: es una vista de trabajo de ahora,
 * como la pestaña abierta, no una preferencia.
 */
const clave = (tenantId: string) => `cguard.sucursal.${tenantId}`;

export function sucursalElegida(): string | null {
  try {
    const t = localStorage.getItem("tenantId");

    if (!t) return null;

    return localStorage.getItem(clave(t)) || null;
  } catch {
    return null;
  }
}

export function elegirSucursal(branchId: string | null): void {
  try {
    const t = localStorage.getItem("tenantId");

    if (!t) return;
    if (branchId) localStorage.setItem(clave(t), branchId);
    else localStorage.removeItem(clave(t));
  } catch {
    /* sin almacenamiento: se queda en «todas» */
  }
}

/** La cabecera para una petición, o nada si no hay sucursal elegida. */
export function cabeceraDeSucursal(): Record<string, string> {
  const b = sucursalElegida();

  return b ? { "x-cguard-branch": b } : {};
}
