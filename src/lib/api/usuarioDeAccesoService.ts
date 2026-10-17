import i18n from "@/i18n";
import { ApiService } from "@/services/api/apiService";

/**
 * El USUARIO PARA ENTRAR (alias) de una persona: `jmiranda`, `jmiranda2`…
 *
 * Lo pone el sistema al crear la cuenta y lo cambia la empresa desde el CRM
 * (la persona no). Con él —o con su correo— se entra a la app. Es lo único
 * que tiene quien se dio de alta «sin correo».
 *
 *   GET   /tenant/:tenantId/user/username-availability   ¿libre? + sugerencia
 *   PATCH /tenant/:tenantId/user/:userId/username        cambiarlo
 */

const tid = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      i18n.t(
        "ui.apiService.noPudimosIdentificarTuEmpresa",
        "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
      ),
    );

  return t;
};

/** Por qué no vale un alias (lo dice el servidor). */
export type MotivoAliasInvalido = "formato" | "reservado" | "ocupado";

export interface DisponibilidadDeAlias {
  /** El alias ya normalizado (minúsculas, sin tildes), o null si vino vacío. */
  username: string | null;
  available: boolean;
  motivo: MotivoAliasInvalido | null;
  /** Sólo si se mandaron nombres: el alias libre que le tocaría. */
  sugerencia: string | null;
}

export interface ConsultaDeAlias {
  username?: string;
  /** La persona que se edita: su propio alias cuenta como libre. */
  userId?: string | null;
  firstName?: string;
  lastName?: string;
  fullName?: string;
}

export const usuarioDeAccesoService = {
  disponibilidad: (c: ConsultaDeAlias): Promise<DisponibilidadDeAlias> => {
    const qs = new URLSearchParams();

    for (const [k, v] of Object.entries(c)) {
      const s = v == null ? "" : String(v).trim();

      if (s) qs.append(k, s);
    }

    return ApiService.get(
      `/tenant/${tid()}/user/username-availability?${qs.toString()}`,
    );
  },
  cambiar: (
    userId: string,
    username: string,
  ): Promise<{ id: string; username: string }> =>
    ApiService.patch(`/tenant/${tid()}/user/${userId}/username`, { username }),
};

/**
 * Lo que se va escribiendo: sin espacios y en minúsculas, que es como lo
 * guarda el servidor. El resto (tildes, símbolos) lo normaliza él y lo
 * devuelve en `username`.
 */
export function limpiarAlias(texto: string): string {
  return String(texto ?? "")
    .replace(/\s+/g, "")
    .replace(/@/g, "")
    .toLowerCase();
}
