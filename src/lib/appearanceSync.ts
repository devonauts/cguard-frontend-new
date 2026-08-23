/**
 * La apariencia (acento + claro/oscuro) sincronizada con la CUENTA.
 *
 * Antes vivía sólo en `localStorage`: sobrevivía a un refresco pero no a cambiar
 * de navegador, así que la misma persona veía un CRM distinto en cada máquina.
 * Ahora la fuente de verdad es `users.appearance` en la base, y el almacenamiento
 * local se queda como CACHÉ DE PINTADO: es lo que evita el parpadeo con el acento
 * de fábrica durante el ida y vuelta al servidor.
 *
 * Dos detalles que explican la forma de este archivo:
 *
 *  · `ThemeProvider` y `AccentProvider` se montan POR ENCIMA de `AuthProvider`
 *    (App.tsx), así que no pueden usar `useAuth()`. Miran el token igual que
 *    hace `LanguageContext`, y la petición a `/auth/me` se comparte entre los dos
 *    con una promesa memorizada: una sola llamada, no una por contexto.
 *  · La escritura va con retardo. Arrastrar el deslizador del tono dispara
 *    decenas de cambios por segundo; sin agrupar, serían decenas de PUT.
 */
import api from '@/lib/api';

export type UiTheme = 'light' | 'dark';
export interface UiAccent { h: number; c: number }
export interface UiAppearance { theme?: UiTheme; accent?: UiAccent | null }

/** Sesión iniciada = hay token. En el login no hay a quién preguntarle. */
export function haySesion(): boolean {
  try { return !!localStorage.getItem('authToken'); } catch { return false; }
}

let pendiente: Promise<UiAppearance | null> | null = null;

/**
 * La apariencia guardada en la cuenta. Memorizada: los dos proveedores la piden
 * a la vez al montar y sale UNA sola petición. `null` = sin sesión, error, o la
 * cuenta no tiene preferencia guardada todavía.
 */
export function leerAparienciaDeLaCuenta(): Promise<UiAppearance | null> {
  if (pendiente) return pendiente;
  if (!haySesion()) return Promise.resolve(null);

  pendiente = api
    .get('/auth/me', { toast: { silentError: true } } as any)
    .then((resp: any) => {
      const d = resp && resp.data !== undefined ? resp.data : resp;
      let a = d?.appearance ?? null;
      if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } }
      return a && typeof a === 'object' ? (a as UiAppearance) : null;
    })
    .catch(() => null);

  return pendiente;
}

/** Olvida la respuesta memorizada (cambio de sesión). */
export function olvidarApariencia() {
  pendiente = null;
}

// ── Escritura agrupada ──────────────────────────────────────────────────────
// Se acumulan los campos que fueron cambiando y se manda UN PUT con todo.
let temporizador: any = null;
let acumulado: UiAppearance = {};
const RETARDO_MS = 800;

/** Guarda en la cuenta, agrupando ráfagas. Silencioso: jamás rompe la interfaz. */
export function guardarApariencia(parcial: UiAppearance) {
  acumulado = { ...acumulado, ...parcial };
  if (!haySesion()) return;

  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(() => {
    const carga = acumulado;
    acumulado = {};
    temporizador = null;
    api
      .put('/auth/profile', { data: { appearance: carga }, toast: { silentError: true } } as any)
      .catch(() => { /* mejor esfuerzo: la caché local ya tiene el valor */ });
  }, RETARDO_MS);
}

export default { leerAparienciaDeLaCuenta, guardarApariencia, olvidarApariencia, haySesion };
