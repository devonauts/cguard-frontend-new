/**
 * The icon that browser/OS notifications carry (`notifyNative` in
 * `lib/desktop.ts`, which lives outside React and cannot call
 * `useWhiteLabel()`).
 *
 * `aplicarMarca` sets it every time an identity is painted — at boot and again
 * when the effective identity of the session is known — so it always follows
 * the brand on screen: our app icon on our hosts, the partner's icon (rendered
 * square per host by the server) on theirs, and NO icon when the partner has
 * no art or before any brand is known. A bare notification is fine; our logo
 * popping up on a partner company's desktop is not.
 */
let icono: string | undefined;

export function fijarIconoDeAvisos(url: string | null | undefined): void {
  icono = url || undefined;
}

export function iconoDeAvisos(): string | undefined {
  return icono;
}
