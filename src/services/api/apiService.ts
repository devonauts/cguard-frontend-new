import { avisarSiFueraDeDisponibilidad } from "@/lib/avisoDeDisponibilidad";
import { cerrarSesionDeCodigo } from "@/lib/sesionDeCodigo";
import { toast } from "sonner";
import i18n from "@/i18n";
import {
  reportRequestOk,
  reportNetworkFailure,
} from "@/lib/offline/networkStatus";
import { autoInvalidateForMutation } from "@/lib/queryClient";
import { anotarPeticion } from "@/lib/diagnosticoDeRed";
import { manejarPagoRequerido } from "@/lib/pagoRequerido";
import { announceAddonRequired } from "@/lib/addonRequired";
import { isFreeTierSession } from "@/lib/freeTier";
import { cabeceraDeSucursal } from "@/lib/sucursalElegida";
import { resolveApiBase } from "@/lib/apiBase";
import {
  esAccesoBloqueado,
  RUTA_ACCESO_BLOQUEADO,
  sacarDeLaSesion,
} from "@/lib/accesoBloqueado";
const API_BASE_URL = (
  resolveApiBase() ?? "http://localhost:3001/api"
).replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * El idioma ELEGIDO en el CRM, no el del navegador. Sin esto el servidor
 * contestaba en el idioma del sistema operativo: quien eligió italiano en un
 * portátil en español leía la bitácora —y cualquier texto del servidor— en
 * español. `Accept-Language` es una cabecera que el navegador deja mandar sin
 * permiso previo (no añade preflight de CORS).
 */
function cabeceraDeIdioma(): Record<string, string> {
  try {
    const lang =
      i18n?.language ||
      localStorage.getItem("app_language") ||
      localStorage.getItem("language") ||
      "";
    return lang ? { "Accept-Language": lang } : {};
  } catch {
    return {};
  }
}

export class ApiService {
  static async request(endpoint: string, options: any = {}) {
    // Global client-side rate-limit pause timestamp (ms since epoch).
    // When backend returns 429 we set this so subsequent immediate requests
    // fail fast until the pause expires (prevents request storms).
    // Keep as property on the class to persist across HMR reloads.
    if ((this as any)._rateLimitPausedUntil === undefined)
      (this as any)._rateLimitPausedUntil = 0;
    const rateLimitPausedUntil: number =
      (this as any)._rateLimitPausedUntil || 0;
    if (Date.now() < rateLimitPausedUntil) {
      throw new ApiError(
        "Client rate-limited: temporarily paused requests",
        429,
        { pausedUntil: rateLimitPausedUntil },
      );
    }
    const token = localStorage.getItem("authToken");

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...cabeceraDeSucursal(),
      ...cabeceraDeIdioma(),
      ...(options.headers || {}),
    };

    const isFormData = options.body instanceof FormData;
    if (isFormData) delete headers["Content-Type"];

    if (token && !options.skipAuth) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Si tu backend es multi-tenant y exige header, descomenta:
    // const tenantId = localStorage.getItem("tenantId");
    // if (tenantId) headers["X-Tenant-Id"] = tenantId;

    const url = `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    try {
      anotarPeticion(String(options.method || "GET"), url);
    } catch {
      /* el diagnóstico jamás puede tumbar una petición */
    }

    // Transient-failure retry: ONLY for idempotent reads — retrying a
    // POST/PATCH/DELETE risks a double submit. A dropped connection or a 502/503/504
    // is almost always a brief backend/DB blip (e.g. connection-pool pressure); retry
    // with a short backoff so a hiccup is invisible to the user instead of an error
    // toast. (Backend now returns 503 — not 401 — on DB-infra failures, so this no
    // longer risks masking a real logout.)
    const method = String(options.method || "GET").toUpperCase();
    const idempotent = method === "GET" || method === "HEAD";
    const maxAttempts = idempotent ? 3 : 1;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let response!: Response;
    let data: any = null;
    for (let attempt = 1; ; attempt++) {
      try {
        // Ensure credentials (cookies) are sent so backend session auth works
        response = await fetch(url, {
          ...options,
          headers,
          credentials: "include",
          cache: options.cache ?? "no-store",
        });
        // Señal de red viva para el modo offline (banner + flush de la cola):
        // llegó UNA respuesta, del código que sea → hay red.
        try {
          reportRequestOk();
        } catch {
          /* ignore */
        }
      } catch {
        if (idempotent && attempt < maxAttempts) {
          await sleep(250 * attempt);
          continue;
        }
        try {
          reportNetworkFailure();
        } catch {
          /* ignore */
        }
        throw new ApiError(
          i18n.t(
            "errores.sinConexionServidor",
            "No se pudo conectar con el servidor.",
          ),
          0,
          null,
        );
      }

      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      data = null;
      try {
        if (response.status === 204 || response.status === 304) data = null;
        else if (isJson) {
          const text = await response.text();
          data = text ? JSON.parse(text) : null;
        } else {
          data = await response.text().catch(() => null);
        }
      } catch {
        data = null;
      }

      if (
        idempotent &&
        attempt < maxAttempts &&
        [502, 503, 504].includes(response.status)
      ) {
        await sleep(250 * attempt);
        continue;
      }
      break;
    }

    if (!response.ok && response.status !== 304) {
      // If server replied with 429, set client-side pause to avoid immediate retry storms.
      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        let pauseMs = 5000; // default 5s
        if (retryAfter) {
          const asInt = parseInt(retryAfter, 10);
          if (!Number.isNaN(asInt)) pauseMs = asInt * 1000;
          else {
            const parsed = Date.parse(retryAfter);
            if (!Number.isNaN(parsed))
              pauseMs = Math.max(1000, parsed - Date.now());
          }
        }
        // Exponential safety: if there's already a pause, extend it a bit
        const current = (this as any)._rateLimitPausedUntil || 0;
        const nextUntil = Math.max(current, Date.now() + pauseMs);
        (this as any)._rateLimitPausedUntil = nextUntil;
      }
      // Build a concise message. If the response is non-JSON and looks like an HTML error page,
      // avoid including the full HTML body in logs and thrown errors.
      let msgRaw =
        (data && (data.message || data.error || data.detail)) ||
        (typeof data === "string" && data) ||
        `Error: ${response.status} ${response.statusText}`;

      let msg = msgRaw;
      let fullResponse = data;
      if (typeof data === "string" && /<\s*!?doctype|<html/i.test(data)) {
        msg = `Error: ${response.status} ${response.statusText}`;
        fullResponse = null; // avoid logging large HTML blobs
      }
      // An authenticated request rejected with 401 → the token is no longer valid
      // (e.g. this session was ended by a login on another device — single active
      // session). Clear it and return to the login screen.
      // BLOQUEADO (401 auth.accessBlocked): no al login, a «Acceso bloqueado»,
      // con el cierre de sesión normal (ver lib/accesoBloqueado).
      if (
        response.status === 401 &&
        token &&
        esAccesoBloqueado(data) &&
        !window.location.pathname.startsWith(RUTA_ACCESO_BLOQUEADO)
      ) {
        void sacarDeLaSesion({ motivo: "bloqueo" });
      } else if (
        response.status === 401 &&
        token &&
        !window.location.pathname.startsWith("/login") &&
        !window.location.pathname.startsWith(RUTA_ACCESO_BLOQUEADO)
      ) {
        // POR QUÉ se cerró la sesión. Sin esto, al centralista que ficha salida
        // le aparecía la pantalla de login sin explicación y parecía una avería.
        // `sessionStorage`: vale para este arranque y no sobrevive al navegador.
        try {
          sessionStorage.setItem("authExitReason", String(msg || ""));
        } catch {}
        try {
          localStorage.removeItem("authToken");
        } catch {}
        // El perfil cacheado para la sesión offline pertenece a la sesión que
        // acaba de morir — sin esto, el próximo arranque sin red restauraría a
        // un usuario cuyo token ya fue invalidado (auditoría 2026-08-18).
        try {
          localStorage.removeItem("authUserCache");
        } catch {}
        void cerrarSesionDeCodigo();
        try {
          window.location.replace("/login");
        } catch {}
      }
      // 402 del cobro del socio: el mismo aviso y el mismo salto a Facturación
      // que en el cliente axios (`lib/pagoRequerido`).
      if (response.status === 402) {
        // A paid add-on module the company lacks: its gate swaps the screen
        // for the module's presentation (`components/modulos/ModuleGate`).
        announceAddonRequired(402, data);
        try {
          manejarPagoRequerido(
            402,
            data?.code,
            typeof msg === "string" ? msg : null,
          );
        } catch {
          /* ignore */
        }
        // Subscription paywall (trial over / last payment failed). The screens
        // that use this client catch the error and print their own generic
        // «Error guardando…», so the reason would be lost: say it once, with
        // the server's text (the axios client does the same). Only writes get
        // these 402s, so a background poll never raises it.
        const codigo402 = data?.code;

        if (
          (codigo402 === "subscription_required" ||
            codigo402 === "payment_past_due") &&
          // Free tier («Plan gratis»): never a «pay» notice.
          !isFreeTierSession()
        ) {
          try {
            toast.error(
              typeof msg === "string" && msg
                ? msg
                : i18n.t(
                    "ui.api.activaTuSuscripcionParaContinuar",
                    "Activa tu suscripción para continuar",
                  ),
              { id: `suscripcion:${codigo402}` },
            );
          } catch {
            /* ignore */
          }
        }
      }
      // Lanzar ApiError para que la UI decida mostrar toast
      throw new ApiError(msg, response.status, fullResponse);
    }

    // A successful mutation refreshes every cached list its URL touches so
    // schedule/station/client edits never serve a stale copy.
    if (!idempotent) {
      try {
        autoInvalidateForMutation(method, endpoint);
      } catch {
        /* never break the response */
      }
      avisarSiFueraDeDisponibilidad(method, endpoint, data);
    }

    return data;
  }

  static get(endpoint: string, options = {}) {
    return this.request(endpoint, { ...options, method: "GET" });
  }
  static post(endpoint: string, body?: any, options = {}) {
    const payload =
      body instanceof FormData ? body : JSON.stringify(body ?? {});
    return this.request(endpoint, {
      ...options,
      method: "POST",
      body: payload,
    });
  }
  static patch(endpoint: string, body?: any, options = {}) {
    const payload =
      body instanceof FormData ? body : JSON.stringify(body ?? {});
    return this.request(endpoint, {
      ...options,
      method: "PATCH",
      body: payload,
    });
  }
  static put(endpoint: string, body?: any, options = {}) {
    const payload =
      body instanceof FormData ? body : JSON.stringify(body ?? {});
    return this.request(endpoint, { ...options, method: "PUT", body: payload });
  }
  static delete(endpoint: string, options = {}) {
    return this.request(endpoint, { ...options, method: "DELETE" });
  }

  static async getBlob(endpoint: string, options: any = {}) {
    const token = localStorage.getItem("authToken");

    const headers: Record<string, string> = {
      ...cabeceraDeSucursal(),
      ...cabeceraDeIdioma(),
      ...(options.headers || {}),
    };

    if (token && !options.skipAuth) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        method: "GET",
        headers,
        credentials: "include",
      });
    } catch {
      throw new ApiError(
        i18n.t(
          "errores.sinConexionServidor",
          "No se pudo conectar con el servidor.",
        ),
        0,
        null,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => null);
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      let msg =
        (data && (data.message || data.error)) ||
        `Error: ${response.status} ${response.statusText}`;
      if (typeof text === "string" && /<\s*!?doctype|<html/i.test(text)) {
        msg = `Error: ${response.status} ${response.statusText}`;
      }
      throw new ApiError(msg, response.status, data);
    }

    const blob = await response.blob();
    return blob;
  }
}
