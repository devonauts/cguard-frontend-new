/**
 * Singleton Google Maps script loader.
 * Guarantees the Maps JS API is injected only once per page, regardless of
 * how many components call this function concurrently.
 * Uses the new Places API (PlaceAutocompleteElement) — no Geocoding API required.
 */
let _promise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

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

    const script = document.createElement("script");

    // Use stable release with places and marker libraries. `loading=async` is
    // Google's recommended bootstrap hint (removes the "loaded without
    // loading=async" console warning + defers the library work off the critical
    // path); it pairs with the async/defer attributes below.
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,marker&loading=async`;
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

  // Ready when we have core Maps + Places (new or legacy)
  return !!(
    g?.maps?.Map &&
    g?.maps?.places &&
    (g.maps.places.PlaceAutocompleteElement || g.maps.places.Autocomplete)
  );
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
