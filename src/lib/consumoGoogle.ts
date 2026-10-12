/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONSUMO DE GOOGLE MAPS — EL CONTADOR DEL NAVEGADOR
 *
 * La capa de mapas avisa con tres eventos en `window` (ver `utils/mapPool`):
 *   · `cg:mapa-creado`      { area, grupo } — una carga de mapa FACTURABLE.
 *   · `cg:mapa-reutilizado` { area, grupo } — un préstamo, gratis (se cuenta
 *                                              para ver el ahorro).
 *   · `cg:google-uso`       { sku, area }   — otra llamada de pago a Google
 *                                              (autocompletar, detalle de un
 *                                              lugar, geocodificar…).
 *
 * Este módulo sólo ESCUCHA: los junta en memoria por (sku, área) y los manda
 * al servidor cada minuto, y al ocultar o cerrar la pestaña. Nunca bloquea la
 * pantalla, nunca enseña un error y, si algo falla, se pierde ese minuto y ya:
 * medir no puede costarle nada a quien está trabajando.
 *
 * ── CÓMO SE AUTENTICA ───────────────────────────────────────────────────────
 * El CRM guarda su sesión como token (no cookie), y `navigator.sendBeacon` no
 * puede llevar cabeceras. Por eso:
 *   1. Siempre que se puede: `fetch(…, { keepalive: true })` con la cabecera
 *      `Authorization` de siempre. `keepalive` hace que el envío sobreviva al
 *      cierre de la pestaña en los navegadores actuales.
 *   2. Sólo si el navegador no tiene `keepalive`: `sendBeacon` a la ruta de la
 *      baliza con el PASE que devolvió el último envío normal — una firma de
 *      15 minutos que sólo sirve para apuntar consumo, nunca como sesión.
 *      Sin pase, no se manda nada.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { resolveApiBase } from "@/lib/apiBase";

export const SKU_MAPA = "dynamic_maps";
const INTERVALO_MS = 60_000;
/** Pares (sku, área) distintos que se guardan entre envíos; el resto se ignora. */
const MAX_CLAVES = 50;
/** Tope por par y envío (el servidor también acota). */
const MAX_POR_PAR = 5000;

export interface EntradaPendiente {
  sku: string;
  area: string;
  count: number;
  reused: number;
}

export interface Dependencias {
  fetch?: typeof fetch;
  beacon?: (url: string, cuerpo: Blob) => boolean;
  token: () => string | null;
  tenantId: () => string | null;
  base: () => string;
  keepaliveDisponible?: () => boolean;
}

const texto = (v: unknown, def: string) => {
  const s = typeof v === "string" ? v.trim().toLowerCase().slice(0, 40) : "";

  return s || def;
};

/** El contador en sí, sin `window`: se prueba con dobles. */
export function crearContador(deps: Dependencias) {
  const pendientes = new Map<string, EntradaPendiente>();
  let pase: string | null = null;
  let enVuelo = false;

  function anotar(sku: string, area: string, count: number, reused: number) {
    const s = texto(sku, "");

    if (!s) return;
    const a = texto(area, "otro");
    const clave = `${s}|${a}`;
    const previa = pendientes.get(clave);

    if (previa) {
      previa.count = Math.min(previa.count + count, MAX_POR_PAR);
      previa.reused = Math.min(previa.reused + reused, MAX_POR_PAR);
    } else if (pendientes.size < MAX_CLAVES) {
      pendientes.set(clave, { sku: s, area: a, count, reused });
    }
  }

  /** Saca lo pendiente y lo manda. `alCerrar` = la pestaña se oculta o se va. */
  function enviar(alCerrar: boolean): void {
    if (!pendientes.size) return;
    // Un envío normal en vuelo: el siguiente tic lo recoge (al cerrar no se espera).
    if (enVuelo && !alCerrar) return;
    const tenantId = deps.tenantId();
    const token = deps.token();
    const items = [...pendientes.values()];

    pendientes.clear();
    if (!tenantId) return;

    const base = deps.base().replace(/\/+$/, "");
    const cuerpo = JSON.stringify({ app: "crm", items });
    const conKeepalive = deps.keepaliveDisponible
      ? deps.keepaliveDisponible()
      : true;

    try {
      if (token && deps.fetch && (!alCerrar || conKeepalive)) {
        enVuelo = !alCerrar;
        const p = deps.fetch(
          `${base}/tenant/${encodeURIComponent(tenantId)}/consumo-google`,
          {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: cuerpo,
          },
        );

        Promise.resolve(p)
          .then(async (r: any) => {
            if (!r?.ok) return;
            const d = await r.json().catch(() => null);

            if (d && typeof d.pase === "string") pase = d.pase;
          })
          .catch(() => {
            /* se pierde este minuto */
          })
          .finally(() => {
            enVuelo = false;
          });

        return;
      }
      if (alCerrar && pase && deps.beacon) {
        deps.beacon(
          `${base}/consumo-google/baliza`,
          new Blob([JSON.stringify({ pase, items })], { type: "text/plain" }),
        );
      }
    } catch {
      enVuelo = false;
    }
  }

  return {
    anotar,
    enviar,
    pendientes: () => [...pendientes.values()],
    pase: () => pase,
  };
}

let iniciado = false;

/** Se llama UNA vez en el arranque (main.tsx). */
export function iniciarConsumoGoogle(): void {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  try {
    const contador = crearContador({
      fetch: window.fetch?.bind(window),
      beacon:
        typeof navigator !== "undefined" && navigator.sendBeacon
          ? (url, cuerpo) => navigator.sendBeacon(url, cuerpo)
          : undefined,
      // La misma clave que escribe `lib/api` (setAuthToken). Se lee de ahí y
      // no importando `lib/api`, para no arrastrar axios y sus interceptores.
      token: () => {
        try {
          return localStorage.getItem("authToken");
        } catch {
          return null;
        }
      },
      tenantId: () => {
        try {
          return localStorage.getItem("tenantId");
        } catch {
          return null;
        }
      },
      base: () => resolveApiBase() || "/api",
      keepaliveDisponible: () => {
        try {
          return (
            typeof Request !== "undefined" &&
            "keepalive" in Request.prototype
          );
        } catch {
          return false;
        }
      },
    });

    const detalle = (e: Event) => ((e as CustomEvent).detail || {}) as any;

    window.addEventListener("cg:mapa-creado", (e) =>
      contador.anotar(SKU_MAPA, detalle(e).area, 1, 0),
    );
    window.addEventListener("cg:mapa-reutilizado", (e) =>
      contador.anotar(SKU_MAPA, detalle(e).area, 0, 1),
    );
    window.addEventListener("cg:google-uso", (e) =>
      contador.anotar(detalle(e).sku, detalle(e).area, 1, 0),
    );

    window.setInterval(() => contador.enviar(false), INTERVALO_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") contador.enviar(true);
    });
    window.addEventListener("pagehide", () => contador.enviar(true));
  } catch {
    /* sin contador: los mapas siguen funcionando igual */
  }
}
