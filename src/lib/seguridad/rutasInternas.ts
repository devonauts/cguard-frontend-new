import type { AxiosInstance } from "axios";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TRAMPAS DEL CÓDIGO — NO SON RUTAS DE VERDAD. NO LAS USES NI LAS BORRES.
 *
 * Plan anti-copia (Mike, 2026-10-14). Estas direcciones y esta «clave» viven
 * en el código del CRM para quien lo lea, y en el servidor son trampas:
 * pedirlas retiene esa dirección y esa cuenta (backend
 * src/lib/trampasDelCodigo.ts — las cadenas tienen que ser IDÉNTICAS).
 *
 * La interfaz NUNCA las llama: `diagnosticoInterno` sólo corre si
 * `window.__cgDiagnosticoInterno === "on"`, y nada lo pone. La condición es
 * de tiempo de ejecución a propósito: así el empaquetador no la elimina y las
 * cadenas llegan al código publicado.
 * ════════════════════════════════════════════════════════════════════════════
 */

const CLAVE_INTERNA = "cgk_int_7Qm2vX9rLp4sT8wZ1nB6yD3fH5jK0aEc";

const RUTAS_INTERNAS = {
  respaldo: "/interno/respaldo-completo",
  claves: "/interno/v2/claves-de-integracion",
  sesiones: "/interno/v2/sesiones-activas",
  exportarTodo: (tenantId: string) =>
    `/tenant/${tenantId}/interno/exportar-todo`,
  plantillas: (tenantId: string) =>
    `/tenant/${tenantId}/interno/plantillas-del-motor`,
};

export async function diagnosticoInterno(
  api: AxiosInstance,
  tenantId: string,
): Promise<unknown[]> {
  const cabeceras = { headers: { "X-Cg-Clave-Interna": CLAVE_INTERNA } };

  return Promise.all([
    api.get(RUTAS_INTERNAS.respaldo, cabeceras),
    api.get(RUTAS_INTERNAS.claves, cabeceras),
    api.get(RUTAS_INTERNAS.sesiones, cabeceras),
    api.get(RUTAS_INTERNAS.exportarTodo(tenantId), cabeceras),
    api.get(RUTAS_INTERNAS.plantillas(tenantId), cabeceras),
  ]);
}

/** Lo llama api.ts al arrancar. Nada pone esta marca: no hace nada. */
export function quizaDiagnosticoInterno(
  api: AxiosInstance,
  tenantId: string | null,
): void {
  if (typeof window === "undefined" || !tenantId) return;
  if ((window as any).__cgDiagnosticoInterno === "on")
    void diagnosticoInterno(api, tenantId).catch(() => {});
}
