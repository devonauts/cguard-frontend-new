/**
 * ════════════════════════════════════════════════════════════════════════════
 * LOS CORREOS QUE NO SON DE NADIE
 *
 * Una cuenta sin buzón (alta «sin correo», sólo con su usuario para entrar)
 * lleva un correo inventado, porque `users.email` es obligatorio:
 * `u-<uuid>@sin-correo.local`. Las altas por teléfono antiguas llevan
 * `<dígitos>@phone.local` y las bajas `…@cguardpro.invalid`.
 *
 * Ninguno de ellos se enseña como correo: no lleva a ningún sitio y confunde
 * («¿le mando la invitación a u-3f9a…?»). En su lugar se muestra el usuario
 * para entrar, o «Sin correo». Es el mismo criterio que `correoReal` del
 * servidor (services/user/aliasParaEntrar).
 * ════════════════════════════════════════════════════════════════════════════
 */

const SIN_BUZON = /\.(?:local|invalid)$/i;

/** ¿Es uno de los correos inventados (sin buzón)? */
export function esCorreoSinBuzon(correo?: string | null): boolean {
  return SIN_BUZON.test(String(correo ?? "").trim());
}

/** El correo para enseñar, o `null` si no hay ninguno de verdad. */
export function correoVisible(correo?: string | null): string | null {
  const c = String(correo ?? "").trim();

  return c && !esCorreoSinBuzon(c) ? c : null;
}
