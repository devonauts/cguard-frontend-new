/**
 * Reserva de instancias de `google.maps.Map`.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Google factura CADA `new google.maps.Map(...)` como una "carga de mapa
 * dinámico" (SKU Dynamic Maps). No factura el script, ni el desplazamiento, ni
 * el zoom: factura el constructor. Eso convierte en dinero cosas que en React
 * parecen gratis — cambiar de pestaña, volver a un paso del asistente, cerrar y
 * reabrir un modal, o simplemente un efecto con una dependencia de más.
 *
 * La reserva rompe esa relación: el mapa vive en un `<div>` propio que se ADOPTA
 * dentro del contenedor de quien lo pide y se DEVUELVE (desenganchado del DOM,
 * no destruido) al desmontar. El siguiente que pida un mapa con la misma
 * configuración se lleva ese mismo objeto y no se construye nada.
 *
 * ── POR QUÉ SE AGRUPA POR `mapId` ───────────────────────────────────────────
 * `mapId` no se puede cambiar después de construir el mapa: decide si el mapa es
 * vectorial (y por tanto si `AdvancedMarkerElement` pinta algo) o ráster. Un
 * mapa con `mapId` prestado a quien dibuja overlays clásicos rendería en blanco
 * — que es exactamente el fallo que ya costó una tarde en
 * `StationGeofencePolygon`. Por eso la reserva se parte por `mapId`.
 *
 * ── SEGURIDAD ANTE FALLOS ───────────────────────────────────────────────────
 * Esto está en el camino del alta de clientes y de puestos: si alguna vez
 * fallara, no puede quedarse sin mapa. Todo va en `try/catch` y ante cualquier
 * error se construye un mapa nuevo, que es el comportamiento de antes. Además
 * `VITE_MAP_POOL=0` lo desactiva entero sin tocar código.
 */

export interface PooledMap {
  /** La instancia de `google.maps.Map` lista para usar. */
  map: any;
  /** Devuélvela al desmontar. Desengancha el `<div>`; NO destruye el mapa. */
  release: () => void;
}

type Idle = { host: HTMLDivElement; map: any };

/** Mapas libres, agrupados por `mapId` (o `'__none__'`). */
const idle = new Map<string, Idle[]>();

/** Tope por grupo: más allá de esto la memoria retenida ya no compensa. */
const MAX_IDLE_PER_KEY = 3;

function poolEnabled(): boolean {
  return (import.meta as any).env?.VITE_MAP_POOL !== "0";
}

function groupKey(options: any): string {
  return String(options?.mapId ?? "__none__");
}

function makeHost(): HTMLDivElement {
  const host = document.createElement("div");

  host.style.width = "100%";
  host.style.height = "100%";

  return host;
}

/**
 * Devuelve un mapa montado dentro de `container`.
 *
 * `options` se aplica siempre (también al reutilizar), así que el centro, el
 * zoom y los controles quedan como los pide quien llama, venga el mapa de la
 * reserva o recién construido.
 */
export function acquireMap(container: HTMLElement, options: any): PooledMap {
  const google = (window as any).google;
  const key = groupKey(options);

  if (poolEnabled()) {
    const libres = idle.get(key);
    const reutilizado = libres && libres.pop();

    if (reutilizado) {
      try {
        container.appendChild(reutilizado.host);
        // `setOptions` no acepta `mapId` (es inmutable) y pasarlo sólo genera un
        // aviso en consola; se quita porque el grupo ya garantiza que coincide.
        const { mapId, ...resto } = options || {};

        reutilizado.map.setOptions(resto);
        // Re-fijar el centro fuerza el repintado tras volver a engancharse.
        if (resto.center) reutilizado.map.setCenter(resto.center);

        return {
          map: reutilizado.map,
          release: () => giveBack(key, reutilizado),
        };
      } catch (err) {
        console.warn(
          "[mapPool] no se pudo reutilizar el mapa; se construye uno nuevo",
          err,
        );
        try {
          reutilizado.host.remove();
        } catch {
          /* ignorar */
        }
      }
    }
  }

  const host = makeHost();

  container.appendChild(host);
  const map = new google.maps.Map(host, options);
  const entry: Idle = { host, map };

  return { map, release: () => giveBack(key, entry) };
}

function giveBack(key: string, entry: Idle): void {
  try {
    const google = (window as any).google;

    // Los oyentes los pone quien lo usa; se limpian aquí para que el siguiente
    // no herede reacciones ajenas (un `click` de la geocerca anterior, p. ej.).
    google?.maps?.event?.clearInstanceListeners?.(entry.map);
  } catch {
    /* ignorar */
  }

  try {
    entry.host.remove();
  } catch {
    /* ignorar */
  }

  if (!poolEnabled()) return;

  const libres = idle.get(key) || [];

  if (libres.length >= MAX_IDLE_PER_KEY) return; // se deja morir; el GC lo recoge
  libres.push(entry);
  idle.set(key, libres);
}

/** Sólo para pruebas o para liberar memoria a propósito. */
export function drainMapPool(): void {
  idle.clear();
}
