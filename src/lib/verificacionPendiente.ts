import { isPlatformSuperadmin } from "@/lib/access";

/**
 * «The account is waiting for its email to be verified».
 *
 * Behind the «Verifica tu correo» screen the server answers 403 to an
 * unverified account, and each of those requests raised a red «Prohibido»
 * toast over a screen that already says what to do. The API client stays
 * quiet about them.
 *
 * Deciding it when the screen MOUNTS was too late: the dashboard's lists are
 * prefetched at boot, in parallel with /auth/me (control-center/consultas), so
 * their 403s came back before React had rendered anything. Now:
 *   · the refusal itself can say it: the server tags it
 *     `auth.emailVerificationRequired` (PermissionChecker.validateHas);
 *   · every /auth/me read marks it the moment it answers, before the app
 *     shell renders (AuthService.getProfile → `seguirLecturaDePerfil`);
 *   · a 403 that arrives while /auth/me is in flight waits for it (bounded),
 *     so no refusal is toasted while the answer is still unknown — many
 *     endpoints refuse with a bare 403 that carries no reason.
 * The screen still clears the flag when it goes away (verified, signed out).
 */
export const CODIGO_VERIFICACION_REQUERIDA = "auth.emailVerificationRequired";

let pendiente = false;
let lecturaEnVuelo: Promise<void> | null = null;

export function marcarVerificacionPendiente(valor: boolean): void {
  pendiente = valor;
}

export function verificacionPendiente(): boolean {
  return pendiente;
}

/** /auth/me answered: an unverified tenant account will get the screen. */
export function notarPerfil(perfil: any): void {
  if (!perfil || typeof perfil !== "object") return;
  pendiente = perfil.emailVerified === false && !isPlatformSuperadmin(perfil);
}

/** Wraps a /auth/me read: notes its answer, and lets 403s wait for it. */
export function seguirLecturaDePerfil<T>(lectura: Promise<T>): Promise<T> {
  const conPerfil = lectura.then((perfil) => {
    notarPerfil(perfil);

    return perfil;
  });
  const fin = conPerfil.then(
    () => undefined,
    () => undefined,
  );

  lecturaEnVuelo = fin;
  void fin.then(() => {
    if (lecturaEnVuelo === fin) lecturaEnVuelo = null;
  });

  return conPerfil;
}

/**
 * Resolves when the /auth/me read in flight (if any) has answered, or after
 * `maxMs` — then the toast goes as before. No read in flight: at once.
 */
export function estadoDeVerificacionConocido(maxMs = 4000): Promise<void> {
  if (!lecturaEnVuelo) return Promise.resolve();

  return Promise.race([
    lecturaEnVuelo,
    new Promise<void>((resolve) => setTimeout(resolve, maxMs)),
  ]);
}

/** Is this the server saying «verify your email first»? */
export function esRechazoPorVerificacion(
  status: number | undefined,
  details: any,
): boolean {
  return (
    status === 403 &&
    !!details &&
    typeof details === "object" &&
    details.messageCode === CODIGO_VERIFICACION_REQUERIDA
  );
}

/**
 * Should a failed request stay silent? A 403 while verification is pending, or
 * one the server tagged as such (which also turns the flag on, so the other
 * refusals of the same burst stay quiet too).
 */
export function callarPorVerificacion(
  status: number | undefined,
  details?: any,
): boolean {
  if (esRechazoPorVerificacion(status, details)) {
    pendiente = true;

    return true;
  }

  return status === 403 && pendiente;
}
