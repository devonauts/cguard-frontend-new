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
export interface UiAppearance {
  theme?: UiTheme;
  accent?: UiAccent | null;
  /** Personalización del centro de mando por empresa: `{ [tenantId]: prefs }`. */
  dashboards?: Record<string, any>;
  /** Capas visibles del mapa, por empresa. */
  mapLayers?: Record<string, any>;
  /** Cómo quiere ver el Horario esta persona. NO va por empresa: «prefiero la
   *  agenda» es un hábito suyo y de su pantalla, no de la empresa en la que
   *  esté. */
  scheduler?: { view?: string; panel?: boolean; sf?: boolean };
}

/** La empresa activa. Las preferencias del tablero se guardan por empresa: la
 *  misma persona puede llevar dos y no querer el mismo tablero en ambas. */
export function empresaActiva(): string {
  try { return localStorage.getItem('tenantId') || 'default'; } catch { return 'default'; }
}

/**
 * ⚠ LA VENTANA DE ECO. `/auth/me` se sirve desde una caché de identidad EN
 * MEMORIA DE CADA INSTANCIA (20 s, y en producción hay 4 procesos). Guardar
 * invalida la del proceso que atendió el PUT, pero otra instancia puede seguir
 * devolviendo la identidad vieja unos segundos.
 *
 * Sin protección eso se ve exactamente como el bug que veníamos a arreglar:
 * cambias el color, recargas para comprobar que se guardó, la cuenta te
 * responde con el valor ANTERIOR y el color se revierte solo.
 *
 * Por eso se marca la hora del último cambio hecho en este navegador: mientras
 * esté fresco, lo local gana y se vuelve a empujar a la cuenta. La ventana es
 * más ancha que el TTL, con margen.
 */
const CLAVE_SELLO = 'cguard-appearance-ts';
const VENTANA_ECO_MS = 45_000;

function marcarCambioLocal() {
  try { localStorage.setItem(CLAVE_SELLO, String(Date.now())); } catch { /* nada */ }
}

/** ¿Cambió algo en este navegador hace tan poco que la cuenta puede ir atrasada? */
export function cambioLocalReciente(): boolean {
  try {
    const t = Number(localStorage.getItem(CLAVE_SELLO) || 0);
    return Number.isFinite(t) && t > 0 && Date.now() - t < VENTANA_ECO_MS;
  } catch { return false; }
}

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
  marcarCambioLocal();
  acumulado = {
    ...acumulado,
    ...parcial,
    // Los mapas por empresa se FUSIONAN: mandar sólo la empresa activa borraría
    // del servidor la personalización que la persona tenga en las otras.
    ...(parcial.dashboards ? { dashboards: { ...acumulado.dashboards, ...parcial.dashboards } } : {}),
    ...(parcial.mapLayers ? { mapLayers: { ...acumulado.mapLayers, ...parcial.mapLayers } } : {}),
    // Igual que los mapas por empresa: el Horario manda `{view}` sola al cambiar
    // de estilo, y pisar el bloque entero borraría `panel` y `sf` antes incluso
    // de llegar al servidor.
    ...(parcial.scheduler ? { scheduler: { ...acumulado.scheduler, ...parcial.scheduler } } : {}),
  };
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

/**
 * Guarda un bloque de la EMPRESA ACTIVA (tablero o capas) sin pisar el de las
 * demás: primero se lee lo que la cuenta ya tiene y se fusiona.
 */
export async function guardarBloqueDeEmpresa(
  campo: 'dashboards' | 'mapLayers',
  bloque: any,
): Promise<void> {
  if (!haySesion()) return;
  const actual = (await leerAparienciaDeLaCuenta()) || {};
  const previos = (actual as any)[campo] || {};
  const fusionado = { ...previos, [empresaActiva()]: bloque };
  // La caché memorizada tiene que reflejarlo ya: si el usuario cambia dos veces
  // seguidas, la segunda debe fusionar sobre la primera, no sobre lo viejo.
  pendiente = Promise.resolve({ ...(actual as UiAppearance), [campo]: fusionado });
  guardarApariencia({ [campo]: fusionado } as UiAppearance);
}

/** El bloque de la empresa activa guardado en la cuenta, o null. */
export async function leerBloqueDeEmpresa(campo: 'dashboards' | 'mapLayers'): Promise<any | null> {
  const a = await leerAparienciaDeLaCuenta();
  const mapa = a && (a as any)[campo];
  const b = mapa && mapa[empresaActiva()];
  return b && typeof b === 'object' ? b : null;
}

export default {
  leerAparienciaDeLaCuenta, guardarApariencia, olvidarApariencia, haySesion,
  guardarBloqueDeEmpresa, leerBloqueDeEmpresa, empresaActiva,
};
