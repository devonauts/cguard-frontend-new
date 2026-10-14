import api from "@/lib/api";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MARCA DE AGUA DE LA SESIÓN — Fase 4 del plan anti-copia (Mike, 2026-10-14).
 *
 * Al entrar, el CRM pide su SELLO (un código opaco: backend
 * services/seguridad/sellosDeSesionService) y lo esconde en tres sitios que
 * viajan con cualquier copia de la página guardada o clonada:
 *   · el atributo `data-cg-s` de <html>;
 *   · la variable CSS `--cg-s` del <body>;
 *   · un comentario al principio del <body>.
 * Si aparece una copia, el superadmin busca ese sello y sabe qué cuenta,
 * empresa e IP la sacaron, y cuándo.
 * ════════════════════════════════════════════════════════════════════════════
 */

let ultimo: string | null = null;

export function esconderSello(sello: string): void {
  if (typeof document === "undefined" || !/^[a-z0-9]{6,16}$/.test(sello))
    return;
  document.documentElement.setAttribute("data-cg-s", sello);
  document.body?.style.setProperty("--cg-s", `"${sello}"`);
  const marca = `cg:${sello}`;
  const primero = document.body?.firstChild;

  if (
    primero &&
    primero.nodeType === Node.COMMENT_NODE &&
    String(primero.nodeValue || "").startsWith("cg:")
  ) {
    primero.nodeValue = marca;
  } else {
    document.body?.insertBefore(document.createComment(marca), primero || null);
  }
}

/** Pide el sello de esta sesión y lo esconde. Una vez por empresa. */
export async function sellarSesion(
  tenantId: string | null | undefined,
): Promise<void> {
  if (!tenantId || ultimo === tenantId) return;
  ultimo = tenantId;
  try {
    const { data } = await api.get(`/tenant/${tenantId}/sello-de-sesion`, {
      toast: { silentError: true },
    } as any);
    const sello = String((data as any)?.sello || "");

    if (sello) esconderSello(sello);
  } catch {
    ultimo = null; // se intentará en la próxima carga
  }
}
