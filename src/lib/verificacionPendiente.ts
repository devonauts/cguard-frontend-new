/**
 * «The account is waiting for its email to be verified» — set while the
 * «Verifica tu correo» screen is up.
 *
 * Behind that screen the app-wide providers (settings, add-ons, alarm queue,
 * unread messages, radio console) keep polling, and the server answers 403
 * to an unverified account; each one raised a red «Prohibido» toast over a
 * screen that already says what to do. The API client stays quiet about those
 * 403s while this is on.
 */
let pendiente = false;

export function marcarVerificacionPendiente(valor: boolean): void {
  pendiente = valor;
}

export function verificacionPendiente(): boolean {
  return pendiente;
}

/** Should a failed request stay silent? Only a 403 while verification is pending. */
export function callarPorVerificacion(status: number | undefined): boolean {
  return status === 403 && pendiente;
}
