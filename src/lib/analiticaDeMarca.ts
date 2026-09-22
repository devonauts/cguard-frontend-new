/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA MEDICIÓN DE QUIEN SIRVE ESTA PÁGINA
 *
 * Cada anfitrión mide SU embudo: quién se registra aquí y quién acaba pagando
 * un plan. En el dominio de un socio, el socio, con los identificadores que
 * puso en su panel. En el nuestro, CGuard Pro, con los que hay guardados en el
 * superadmin. Los dos llegan por la misma vía: el contexto público.
 *
 * ── SE COMPONE EL SCRIPT, NO SE PEGA UNO ──────────────────────────────────
 * Del servidor viene `G-…` o `GTM-…` y nada más: una cadena validada por
 * forma. El `<script>` se construye aquí. Aceptar del socio una etiqueta
 * entera sería dejarle inyectar el código que quiera en un anfitrión que
 * servimos nosotros, por el que pasan las sesiones de sus clientes — y un
 * `innerHTML` con eso dentro es exactamente la vía que el aviso de política de
 * contenido existe para cazar.
 *
 * ── NUNCA LAS DOS A LA VEZ ────────────────────────────────────────────────
 * Aquí no se decide de quién es la medición: se pinta la que venga en el
 * contexto, y el contexto trae UNA. Quien decide es el resolutor del backend, y
 * lo hace por anfitrión — mezclarlas contaría las visitas de un socio en
 * nuestra cuenta y las nuestras en la suya.
 *
 * En un anfitrión que no resuelve a nadie —uno desconocido, uno de un socio
 * terminado— los dos vienen en `null` y aquí no se carga nada.
 *
 * ── UNA SOLA VEZ POR CARGA ────────────────────────────────────────────────
 * `aplicarMarca` puede volver a correr cuando se sabe de qué empresa es la
 * sesión. Cargar el mismo contenedor dos veces duplica cada evento, y un
 * embudo con los números al doble es peor que uno vacío: parece que funciona.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface AnaliticaDeMarca {
  ga4: string | null;
  gtm: string | null;
}

/** Lo ya cargado en esta página, para no repetirlo. */
const cargados = new Set<string>();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** La cola de `gtag` tiene que existir ANTES de que llegue el script. */
function prepararCola(): void {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = function gtag() {
      // `arguments` a propósito: es lo que la librería de Google espera leer.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }
}

function inyectar(src: string, id: string): void {
  if (cargados.has(id)) return;
  cargados.add(id);
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/**
 * Carga la medición del socio, si la tiene.
 *
 * Es idempotente y no lanza nunca: un bloqueador de anuncios, una red caída o
 * un identificador retirado no pueden dejar sin CRM a nadie.
 */
export function cargarAnaliticaDeMarca(analitica: AnaliticaDeMarca | null | undefined): void {
  if (!analitica) return;
  try {
    const { ga4, gtm } = analitica;

    if (ga4) {
      prepararCola();
      inyectar(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`, ga4);
      window.gtag!("js", new Date());
      /* `send_page_view` por defecto: el CRM es una aplicación de una sola
         página y las vistas las manda el enrutador, no la carga inicial. */
      window.gtag!("config", ga4);
    }

    if (gtm) {
      prepararCola();
      window.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js" });
      inyectar(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`, gtm);
    }
  } catch {
    /* Medir es accesorio: si falla, el CRM sigue. */
  }
}

/* ── LOS EVENTOS ─────────────────────────────────────────────────────────── */

/**
 * Los nombres son los que Google ya entiende.
 *
 * `sign_up` y `purchase` son eventos RECOMENDADOS de GA4: con ellos, los
 * informes de conversión y el embudo salen solos. Inventarse `registro_ok` o
 * `pago_hecho` obliga a cada socio a configurar a mano lo que ya viene hecho, y
 * a que los informes estándar salgan vacíos.
 */
export const EVENTOS = {
  registro: "sign_up",
  compra: "purchase",
  inicioDePago: "begin_checkout",
} as const;

/**
 * Manda un evento a la medición del socio.
 *
 * Si no hay ninguna configurada, no hace nada: no se acumula en una cola que
 * nadie va a vaciar.
 */
export function medir(evento: string, datos: Record<string, unknown> = {}): void {
  try {
    if (!window.dataLayer) return;
    if (window.gtag) window.gtag("event", evento, datos);
    else window.dataLayer.push({ event: evento, ...datos });
  } catch {
    /* nunca rompe la acción que lo dispara */
  }
}
