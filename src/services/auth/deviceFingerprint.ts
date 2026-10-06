/**
 * Browser device signals sent with sign-in / sign-up.
 *
 * WHY: the backend already records the client IP and resolves it to a country
 * offline (superadmin → "Origen y ubicación"). An IP answers *where*; it does
 * not answer *which device* — and residential IPs rotate, so one person opening
 * several accounts looks like several people. FingerprintJS (OSS build, MIT)
 * gives a stable per-browser id that closes that gap, plus the browser's OWN
 * timezone/locale, which is what exposes a proxied signup (IP resolves to one
 * country, browser insists it is in another).
 *
 * These values are a REVIEW SIGNAL ONLY. They are computed in the browser and
 * therefore forgeable — the backend stores them for a human to look at and
 * never uses them for authentication or authorisation.
 *
 * Cost control: the library (~35 KB) is dynamically imported, so it stays out of
 * the main bundle and is only fetched on the auth screens. Everything is wrapped
 * so that a blocked/failed fingerprint NEVER delays or breaks a login.
 */

const CACHE_KEY = "cg.deviceId";
/** Never let fingerprinting hold up a login by more than this. */
const TIMEOUT_MS = 1500;

export interface DeviceSignals {
  deviceId?: string;
  /**
   * La identificación de Prynt de ESTA petición. El servidor la verifica con su
   * llave secreta y saca de ahí el dispositivo: lo que diga la página no cuenta.
   */
  pryntRequestId?: string;
  clientTimezone?: string;
  clientLocale?: string;
}

let inFlight: Promise<string | null> | null = null;

/** The browser's own timezone/locale — free, synchronous, never fails. */
function localeSignals(): DeviceSignals {
  const out: DeviceSignals = {};

  try {
    out.clientTimezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    /* older browsers */
  }
  try {
    out.clientLocale = navigator.language || undefined;
  } catch {
    /* ignore */
  }

  return out;
}

/**
 * Resolve the visitor id: cached value first (so repeat logins cost nothing),
 * otherwise load FingerprintJS once and cache the result.
 */
async function resolveDeviceId(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);

    if (cached) return cached;
  } catch {
    /* storage disabled — fall through and compute it fresh */
  }

  if (!inFlight) {
    inFlight = (async () => {
      const FingerprintJS = await import("@fingerprintjs/fingerprintjs");
      const agent = await FingerprintJS.load();
      const result = await agent.get();
      const id = result?.visitorId || null;

      if (id) {
        try {
          localStorage.setItem(CACHE_KEY, id);
        } catch {
          /* ignore */
        }
      }

      return id;
    })().catch(() => null);
  }

  return inFlight;
}

/**
 * PRYNT (pryntid.com, producto de la casa): una identificación por cada alta o
 * ingreso. Se pide la llave pública al servidor una vez y el agente se carga
 * sólo en estas pantallas (va en su propio trozo del build). Igual que la
 * huella de arriba: si tarda o falla, el ingreso sigue sin ella.
 */
let configPrynt: Promise<{ publicKey: string | null; endpoint: string } | null> | null = null;

async function pryntRequestId(): Promise<string | null> {
  try {
    if (!configPrynt) {
      const { resolveApiBase } = await import("@/lib/apiBase");
      const base = String(resolveApiBase() || "/api").replace(/\/+$/, "");
      configPrynt = fetch(`${base}/public/prynt`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    const cfg = await configPrynt;

    if (!cfg || !cfg.publicKey) return null;
    const { default: Prynt } = await import("@/vendor/prynt.mjs");
    const agente = await Prynt.load({ apiKey: cfg.publicKey, endpoint: cfg.endpoint, timeout: TIMEOUT_MS });
    const r = await agente.identify({ tag: { app: "crm" } });

    return r?.requestId || null;
  } catch {
    return null;
  }
}

/**
 * Device signals to merge into an auth payload. Resolves within TIMEOUT_MS no
 * matter what — on timeout you still get the timezone/locale, just no id.
 */
export async function deviceSignals(): Promise<DeviceSignals> {
  const base = localeSignals();

  try {
    const plazo = <T,>(p: Promise<T | null>) =>
      Promise.race<T | null>([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS))]);
    // Las dos a la vez: el ingreso espera, como mucho, lo mismo que antes.
    const [deviceId, prynt] = await Promise.all([plazo(resolveDeviceId()), plazo(pryntRequestId())]);

    return {
      ...base,
      ...(deviceId ? { deviceId } : {}),
      ...(prynt ? { pryntRequestId: prynt } : {}),
    };
  } catch {
    return base;
  }
}
