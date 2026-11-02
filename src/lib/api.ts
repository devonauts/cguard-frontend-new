import { avisarSiFueraDeDisponibilidad } from "@/lib/avisoDeDisponibilidad";
import { idiomaElegido } from "@/lib/idiomaElegido";
import { irAVerificacion } from "@/lib/seguridad/puertaEnVivo";
import { quizaDiagnosticoInterno } from "@/lib/seguridad/rutasInternas";
import i18n from "@/i18n";
import axios, { AxiosError, AxiosInstance } from "axios";
import { toast } from "sonner";

import {
  reportRequestOk,
  reportNetworkFailure,
} from "@/lib/offline/networkStatus";
import { autoInvalidateForMutation } from "@/lib/queryClient";
import { anotarPeticion } from "@/lib/diagnosticoDeRed";
import { manejarPagoRequerido } from "@/lib/pagoRequerido";
import { isFreeTierSession } from "@/lib/freeTier";
import { cabeceraDeSucursal } from "@/lib/sucursalElegida";
import { CABECERA_DE_MARCA, cabeceraDeMarca } from "@/lib/marcaElegida";
import {
  corregirMarcaFueraDeAlcance,
  textoDeError,
} from "@/lib/multimarca/accesoDeMarca";
import { resolveApiBase } from "@/lib/apiBase";
import { handleDesktopApiError } from "@/lib/desktop";

const API_URL = resolveApiBase() as string | undefined;

const TOKEN_KEY = "authToken";

let _token: string | null = localStorage.getItem(TOKEN_KEY);

export const setAuthToken = (token: string | null) => {
  _token = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export const getAuthToken = () => _token;

export const clearAuthToken = () => setAuthToken(null);

export type ApiError = {
  status?: number;
  code?: string;
  message: string;
  details?: unknown;
  url?: string;
  method?: string;
};

type MutableConfig = { __toastId?: string | number };

const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  // Ensure cookies (session) are sent so server-side auth middleware
  // can populate `req.currentUser` for permission checks.
  withCredentials: true,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
  },
});

// Simple in-memory dedupe for error toasts to avoid duplicate messages
let __lastErrorMsg: string | null = null;
let __lastErrorAt = 0;
const ERROR_DEDUPE_WINDOW = 3000; // ms

api.interceptors.request.use((config) => {
  // Contador de tormentas (sólo en desarrollo; en producción es un no-op que
  // el minificador elimina). Va lo primero para que cuente TODAS las salidas.
  try {
    anotarPeticion(config.method || "GET", String(config.url || ""));
  } catch {
    /* el diagnóstico jamás puede tumbar una petición */
  }
  const token = getAuthToken();

  // Módulo Sucursales: la sucursal elegida en la barra superior.
  try {
    const b = cabeceraDeSucursal()["x-cguard-branch"];

    if (b) {
      if (!config.headers) config.headers = {} as any;
      (config.headers as any)["x-cguard-branch"] = b;
    }
  } catch {
    /* sin sucursal elegida */
  }

  // Multimarca module: the brand chosen in the top bar (combines with the branch).
  try {
    const m = cabeceraDeMarca()[CABECERA_DE_MARCA];

    if (m) {
      if (!config.headers) config.headers = {} as any;
      (config.headers as any)[CABECERA_DE_MARCA] = m;
    }
  } catch {
    /* no brand chosen */
  }

  if (token) {
    if (!config.headers) config.headers = {} as any;
    try {
      // Axios headers may be a plain object; set Authorization reliably
      (config.headers as any)["Authorization"] = `Bearer ${token}`;
    } catch (e) {
      // fallback: ignore
    }
  }
  // Ensure backend can localize messages by sending the current UI language.
  try {
    // 'app_language' es la clave que escribe el selector de idioma
    // (LanguageContext). 'i18nextLng' no la escribía nadie: el backend
    // localizaba con el idioma del NAVEGADOR, no con el elegido.
    const lang = idiomaElegido();

    if (!config.headers) config.headers = {} as any;
    (config.headers as any)["Accept-Language"] = lang;
  } catch (e) {
    // ignore
  }
  // If sending FormData, remove Content-Type so browser sets the multipart boundary
  try {
    if (typeof FormData !== "undefined" && config.data instanceof FormData) {
      if (config.headers) {
        delete (config.headers as any)["Content-Type"];
      }
    }
  } catch (e) {
    // ignore environments without FormData
  }
  // Debug: log outgoing incident payloads for troubleshooting (dev only — the
  // payload may carry PII/location data and must never be logged in production).
  if (import.meta.env.DEV) {
    try {
      const method = (config.method || "").toLowerCase();
      const url = String(config.url || "");

      if (method === "post" && url.indexOf("/incident") !== -1) {
        // eslint-disable-next-line no-console
        console.debug("[api] outgoing incident POST", {
          url,
          data: config.data,
        });
      }
    } catch (e) {
      // ignore logging errors
    }
  }
  if (config.toast?.loading) {
    const id = toast.loading(config.toast.loading);

    (config as unknown as MutableConfig).__toastId = id;
  }

  return config;
});

function normalizeError(error: AxiosError): ApiError {
  const status =
    error.response?.status ?? (error.code === "ECONNABORTED" ? 408 : 0);
  const data: any = error.response?.data;
  let message = error.message || "Error";

  if (data) {
    if (typeof data === "string") {
      // Backend returned plain text (localized message)
      message = data.trim();
    } else {
      message =
        data?.message ||
        data?.error ||
        (Array.isArray(data?.errors) ? data.errors.join(", ") : data?.errors) ||
        message;
    }
  }

  const code = (data?.code as string | undefined) ?? error.code;

  // Multimarca: a refusal of the brand access (`marca_*`) in the reader's
  // language; a top-bar brand outside access is corrected once.
  try {
    message = textoDeError(data, message);
    corregirMarcaFueraDeAlcance(
      status,
      data,
      String(error.config?.method || "GET"),
      !!(error.config?.headers as any)?.[CABECERA_DE_MARCA],
    );
  } catch {
    /* keep the server's text */
  }

  return {
    status,
    code,
    message,
    details: data,
    url: error.config?.url,
    method: error.config?.method?.toUpperCase(),
  };
}

api.interceptors.response.use(
  (response) => {
    // Señal de red viva para el modo offline (banner + flush de la cola).
    try {
      reportRequestOk();
    } catch {
      /* nunca romper la respuesta */
    }
    const cfg = response.config as any as MutableConfig & { toast?: any };

    if (cfg.__toastId) {
      toast.dismiss(cfg.__toastId);
      (cfg as MutableConfig).__toastId = undefined;
    }
    const successMsg = response.config.toast?.success;

    if (successMsg) toast.success(successMsg);
    avisarSiFueraDeDisponibilidad(response.config?.method, response.config?.url, response.data);
    // A successful mutation refreshes every cached list its URL touches so
    // schedule/station/client edits never serve a stale copy.
    try {
      autoInvalidateForMutation(response.config?.method, response.config?.url);
    } catch {
      /* never break the response */
    }

    return response;
  },
  async (error) => {
    const cfg = (error.config || {}) as any as MutableConfig & { toast?: any };

    if (cfg.__toastId) {
      toast.dismiss(cfg.__toastId);
      (cfg as MutableConfig).__toastId = undefined;
    }
    // Downloads ask for a Blob, so their error body arrives as a Blob too and
    // the user read "Request failed with status code 403". Read it first.
    const blobBody = error?.response?.data;

    if (
      typeof Blob !== "undefined" &&
      blobBody instanceof Blob &&
      /json|text/i.test(blobBody.type)
    ) {
      try {
        const text = await blobBody.text();

        try {
          error.response.data = JSON.parse(text);
        } catch {
          error.response.data = text;
        }
      } catch {
        /* keep the generic message */
      }
    }
    const apiError = normalizeError(error as AxiosError);

    // status 0 = la petición nunca llegó al servidor (red caída / DNS / timeout
    // duro). Alimenta el estado global de red; un 4xx/5xx en cambio PRUEBA que
    // hay red y lo reporta como OK.
    try {
      if (apiError.status === 0 || apiError.status === 408)
        reportNetworkFailure();
      else reportRequestOk();
    } catch {
      /* ignore */
    }

    // Desktop app: a `desktop.*` 401/403 goes to the shell, which shows its
    // own screen. No toast: the window is about to change.
    if (handleDesktopApiError(apiError.status, apiError.details)) {
      return Promise.reject(apiError);
    }

    // La puerta anti-copia: esta dirección o esta cuenta tiene que verificarse.
    if (apiError.status === 403 && apiError.code === "verificacionRequerida") {
      irAVerificacion();

      return Promise.reject(apiError);
    }

    // Subscription paywall: a blocked tenant gets a 402. Nudge them to billing.
    if (apiError.status === 402 && apiError.code === "subscription_required") {
      // Free tier («Plan gratis»): never paywalled by the server; a stale 402
      // must not push «activate your subscription» or a jump to billing.
      if (isFreeTierSession()) return Promise.reject(apiError);
      const now = Date.now();
      const msg = apiError.message ||
        i18n.t(
          "ui.api.activaTuSuscripcionParaContinuar",
          "Activa tu suscripción para continuar",
        );
      const isSilent = !!cfg.toast?.silentError;

      if (
        !isSilent &&
        !(__lastErrorMsg === msg && now - __lastErrorAt < ERROR_DEDUPE_WINDOW)
      ) {
        toast.error(msg);
        __lastErrorMsg = msg;
        __lastErrorAt = now;
      }
      try {
        if (
          typeof window !== "undefined" &&
          // Don't yank the user (and lose unsaved form state) on background/poll
          // requests — those pass `toast.silentError`. Only redirect on
          // foreground/user-initiated requests.
          !isSilent &&
          // Avoid redirect loops: the billing page itself may issue 402s.
          !String(window.location.pathname).includes("/setting/billing")
        ) {
          // Prefer router-level handling: dispatch an event a route guard can
          // listen for and navigate via the SPA router (no full reload / no lost
          // state). Fall back to a hard navigation only if nothing handled it.
          const evt = new CustomEvent("app:subscription-required", {
            cancelable: true,
          });
          const notHandled = window.dispatchEvent(evt);

          if (notHandled && !evt.defaultPrevented) {
            window.location.assign("/setting/billing");
          }
        }
      } catch {}

      return Promise.reject(apiError);
    }

    // Empresa de socio pausada por impago (o su socio sin pagar): aviso y, si
    // lo puede arreglar ella, a Facturación. Ver `lib/pagoRequerido`.
    if (
      manejarPagoRequerido(apiError.status, apiError.code, apiError.message, {
        silencioso: !!cfg.toast?.silentError,
      })
    ) {
      return Promise.reject(apiError);
    }

    const silentStatus = (cfg.toast?.silentStatuses || []).includes(apiError.status);

    if (!cfg.toast?.silentError && !silentStatus) {
      const custom = cfg.toast?.error;
      const msg = String(
        typeof custom === "function"
          ? custom(apiError)
          : custom || apiError.message || "Error",
      );
      const now = Date.now();

      if (
        !(
          msg &&
          __lastErrorMsg === msg &&
          now - __lastErrorAt < ERROR_DEDUPE_WINDOW
        )
      ) {
        toast.error(msg);
        __lastErrorMsg = msg;
        __lastErrorAt = now;
      }
      // Already shown (or deduped): callers that toast their own errors check
      // this so the same message never appears twice.
      try {
        (apiError as any).toastShown = true;
      } catch {
        /* frozen error object: harmless */
      }
    }

    return Promise.reject(apiError);
  },
);

// Trampas del código (plan anti-copia): no hace nada salvo que alguien las
// active a mano leyendo el código. Ver lib/seguridad/rutasInternas.
try {
  quizaDiagnosticoInterno(api, localStorage.getItem("tenantId"));
} catch {
  /* nunca rompe el arranque */
}

export default api;
