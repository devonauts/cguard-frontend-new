import { useWhiteLabel } from "@/contexts/WhiteLabelContext";

/**
 * THE CUSTOMER APP'S NAME, PER HOST (2026-10-30)
 *
 * "Mi Seguridad" is OUR customer app (in the stores as "Mi Seguridad by
 * C-Guard Pro"). On a partner's host the owner's rule is absolute: its staff
 * and its client companies never read our name or our products' names. So the
 * screens that talk about the customer app print the HOST's name instead:
 * "Mi Seguridad" where our art may show, the partner's published name on its
 * host, and nothing (an empty slot the sentence survives) when the partner
 * has no name yet.
 *
 * The catalogs carry an `{{app}}` slot for it (see
 * `src/locales/marcaEnLosTextos.test.ts`); never write the name by hand.
 */
export const APP_DEL_CLIENTE_DE_PLATAFORMA = "Mi Seguridad";

export function nombreDeLaAppDelCliente(marca: {
  puedeUsarArteDePlataforma: boolean;
  platformName: string;
}): string {
  return marca.puedeUsarArteDePlataforma
    ? APP_DEL_CLIENTE_DE_PLATAFORMA
    : String(marca.platformName || "").trim();
}

/** The customer app's name on this host (see `nombreDeLaAppDelCliente`). */
export function useAppDelCliente(): string {
  return nombreDeLaAppDelCliente(useWhiteLabel());
}
