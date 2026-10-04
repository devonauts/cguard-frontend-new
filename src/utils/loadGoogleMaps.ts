/**
 * Singleton Google Maps script loader.
 * Guarantees the Maps JS API is injected only once per page, regardless of
 * how many components call this function concurrently.
 * Uses the new Places API (PlaceAutocompleteElement) — no Geocoding API required.
 */
let _promise: Promise<void> | null = null;
let _places: Promise<void> | null = null;

/**
 * QUÉ SE LE PIDE A GOOGLE — y qué no.
 *
 * Medido en un refresco del dashboard: 35 peticiones a Google. De ellas:
 *   · las teselas (las imágenes del mapa) son el mapa mismo: no se quitan;
 *   · `places` (2 guiones) sólo sirve para autocompletar direcciones, y el
 *     mapa del dashboard no autocompleta nada → ahora se trae BAJO DEMANDA;
 *   · Roboto (2 hojas + 2 fuentes): Google la inyecta para sus controles. El
 *     panel usa Urbanist, así que no se descarga.
 *
 * `loadGoogleMaps()` sigue garantizando mapa + Places, como siempre: quien
 * tenga un campo de dirección no cambia nada. Quien sólo pinta un mapa pide
 * `loadGoogleMaps({ soloMapa: true })`.
 */
export function loadGoogleMaps(opts?: { soloMapa?: boolean }): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  const base = cargarBase();

  if (opts?.soloMapa) return base;
  if (!_places) {
    _places = base.then(cargarPlaces).catch((e) => {
      _places = null;
      throw e;
    });
  }

  return _places;
}

function cargarBase(): Promise<void> {
  // Already fully loaded — resolve immediately.
  if (isMapsReady()) return Promise.resolve();

  // Loading already in progress — return the same Promise.
  if (_promise) return _promise;

  _promise = new Promise<void>((resolve, reject) => {
    const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string;

    if (!apiKey) {
      _promise = null;

      return reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set"));
    }

    // If ANY Maps script tag is already in the DOM (loaded by a previous
    // hot-reload cycle or another component), just wait for the global.
    const existing = document.querySelector(
      'script[src*="maps.googleapis.com/maps/api/js"]',
    );

    if (existing) {
      poll(resolve, reject);

      return;
    }

    sinFuentesDeGoogle();
    const script = document.createElement("script");

    // `loading=async` is Google's recommended bootstrap hint (removes the
    // "loaded without loading=async" console warning + defers the library work
    // off the critical path); it pairs with the async/defer attributes below.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=marker&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => poll(resolve, reject);
    script.onerror = () => {
      _promise = null;
      reject(new Error("Failed to load Google Maps API"));
    };
    document.head.appendChild(script);
  });

  return _promise;
}

function isMapsReady(): boolean {
  const g = (window as any).google;

  return !!(g?.maps?.Map && g?.maps?.marker);
}

function isPlacesReady(): boolean {
  const p = (window as any).google?.maps?.places;

  return !!(p && (p.PlaceAutocompleteElement || p.Autocomplete));
}

/** Places, cuando alguien lo necesita de verdad (un campo de dirección). */
async function cargarPlaces(): Promise<void> {
  if (isPlacesReady()) return;
  const g = (window as any).google;

  if (typeof g?.maps?.importLibrary === "function") {
    await g.maps.importLibrary("places");
  }
  const inicio = Date.now();

  while (!isPlacesReady()) {
    if (Date.now() - inicio > 10000) {
      throw new Error("Google Places timed out");
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Google Maps inyecta en <head> la hoja de Roboto / Google Sans para sus
 * controles. Se le deja pasar todo MENOS eso. Sólo esa hoja: las fuentes de
 * marca de los socios (`fuentesDeMarca`, css2) entran como siempre.
 */
let _sinFuentes = false;

function sinFuentesDeGoogle(): void {
  if (_sinFuentes) return;
  _sinFuentes = true;
  const head = document.head;
  const esDeMaps = (n: any) =>
    n?.tagName === "LINK" &&
    /fonts\.googleapis\.com\/css\?family=(Roboto|Google)/.test(
      String(n.href || ""),
    );
  const insertBefore = head.insertBefore.bind(head);
  const appendChild = head.appendChild.bind(head);

  head.insertBefore = ((n: any, ref: any) =>
    esDeMaps(n) ? n : insertBefore(n, ref)) as any;
  head.appendChild = ((n: any) => (esDeMaps(n) ? n : appendChild(n))) as any;
}

function poll(
  resolve: () => void,
  reject: (e: Error) => void,
  start = Date.now(),
): void {
  if (isMapsReady()) {
    resolve();

    return;
  }
  if (Date.now() - start > 10000) {
    reject(new Error("Google Maps API timed out"));

    return;
  }
  setTimeout(() => poll(resolve, reject, start), 200);
}
