import type { LecturaHojaDeVida } from "./hojaDeVidaMapeo";

import api from "../api";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * HOJA DE VIDA → FORMULARIO DE ALTA.
 *
 * Sube el CV (PDF o foto), el servidor lo lee y aquí se traduce lo que devuelve
 * a los campos EXACTOS del formulario de «Crear perfil».
 *
 * Aquí sólo vive la SUBIDA. La traducción a los campos del formulario está en
 * `hojaDeVidaMapeo.ts`, que no toca la red y por eso se puede probar sola.
 * ════════════════════════════════════════════════════════════════════════════
 */

const getTenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
    );

  return t;
};

export const hojaDeVidaService = {
  /** Sube el CV y devuelve lo que se pudo leer. No crea nada. */
  async leer(archivo: File): Promise<LecturaHojaDeVida> {
    const tenantId = getTenantId();
    const form = new FormData();

    form.append("file", archivo, archivo.name);
    // Leer un PDF escaneado pasa por el OCR del proveedor: tarda bastante más
    // que cualquier otra llamada del CRM y el tiempo de espera por defecto lo
    // cortaría a mitad.
    const resp = await api.post(
      `/tenant/${tenantId}/assistant/hoja-de-vida`,
      form,
      {
        timeout: 90000,
      },
    );

    return resp && (resp as any).data !== undefined
      ? (resp as any).data
      : (resp as any);
  },
};

// Se reexporta para que quien consuma el servicio no tenga que importar de dos
// sitios; la lógica sigue viviendo en el archivo puro.
export * from "./hojaDeVidaMapeo";

export default hojaDeVidaService;
