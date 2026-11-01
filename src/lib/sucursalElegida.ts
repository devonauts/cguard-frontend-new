/**
 * La SUCURSAL elegida (módulo «Sucursales»), por empresa: el ESPACIO en el que
 * se trabaja. Vacía = «Vista global» (todas las que la persona puede ver).
 *
 * Viaja en cada petición como `x-cguard-branch`; el servidor acota con ella
 * todo lo que devuelve (y nunca amplía: elegir una que no te toca no enseña
 * nada nuevo).
 *
 * Sucursales 2.0 (fase 2, 2026-10-22): el espacio se ELIGE AL ENTRAR («¿dónde
 * trabajas ahora?») y la última elección se guarda también en la cuenta
 * (`PUT /branch/workspace`), así que se propone la misma en cualquier
 * dispositivo. Aquí queda la copia del navegador, que es la que manda en cada
 * petición, y la marca de «hay que preguntar» que pone el inicio de sesión.
 */
const clave = (tenantId: string) => `cguard.sucursal.${tenantId}`;
const PREGUNTAR = "cguard.preguntarEspacio";

/** El evento con el que cualquier botón abre el selector de espacio. */
export const EVENTO_ELEGIR_ESPACIO = "cg:elegir-espacio";

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

/** El espacio en el formato del servidor: 'global' o el id de la sucursal. */
export function espacioActual(): string {
  return sucursalElegida() || "global";
}

/** El inicio de sesión lo marca: la próxima pantalla del CRM pregunta el espacio. */
export function marcarQueHayQuePreguntarElEspacio(): void {
  try {
    localStorage.setItem(PREGUNTAR, "1");
  } catch {
    /* nada */
  }
}

export function hayQuePreguntarElEspacio(): boolean {
  try {
    return localStorage.getItem(PREGUNTAR) === "1";
  } catch {
    return false;
  }
}

/** Fired when the branch question is answered (the brand question waits for it). */
export const EVENTO_ESPACIO_PREGUNTADO = "cg:espacio-preguntado";

export function yaSePreguntoElEspacio(): void {
  try {
    localStorage.removeItem(PREGUNTAR);
  } catch {
    /* nada */
  }
  try {
    window.dispatchEvent(new Event(EVENTO_ESPACIO_PREGUNTADO));
  } catch {
    /* sin ventana (pruebas) */
  }
}

/** Abre el selector de espacio desde cualquier sitio (la barra, la pastilla del teléfono). */
export function abrirSelectorDeEspacio(): void {
  window.dispatchEvent(new Event(EVENTO_ELEGIR_ESPACIO));
}

/** La cabecera para una petición, o nada si no hay sucursal elegida. */
export function cabeceraDeSucursal(): Record<string, string> {
  const b = sucursalElegida();

  return b ? { "x-cguard-branch": b } : {};
}
