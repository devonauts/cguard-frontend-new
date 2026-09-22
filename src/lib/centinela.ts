/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CENTINELA — lo que la página cuenta de sí misma.
 *
 * Fase 2 del plan anti-copia. La política de contenido (Fase 1) la impone el
 * NAVEGADOR desde una cabecera; esto lo hace la APLICACIÓN desde dentro del
 * paquete. Hacen falta las dos, y el motivo es concreto: una cabecera se pierde
 * cuando el documento sale de la caché del service worker —que es exactamente
 * lo que pasa en el CRM— y esto viaja DENTRO del paquete, así que llega siempre.
 *
 * ── LO QUE MIRA, Y SÓLO ESO ────────────────────────────────────────────────
 *  1. ¿Estamos en un dominio nuestro? Si no, alguien está sirviendo nuestro
 *     paquete desde otro sitio. Es la única señal de COPIA de las cuatro, y la
 *     que más vale.
 *  2. ¿El `index.html` conserva los sellos de integridad que le pone el build?
 *     Si no están, el documento fue reescrito por el camino.
 *  3. ¿Aparecen <script> o <iframe> ajenos después de cargar? Casi siempre es
 *     una extensión del navegador. Alguna vez, no.
 *
 * ── LO QUE **NO** HACE, Y ES IMPORTANTE QUE NO LO HAGA ─────────────────────
 *  · NO detecta las herramientas de desarrollo. Está decidido en el plan y no
 *    es un olvido: quien las abre en un CRM de seguridad es sobre todo el
 *    informático del cliente y el propio soporte. Es la señal más ruidosa que
 *    existe y castigar por ella es castigar a clientes.
 *  · NO bloquea, NO ralentiza y NO avisa al usuario de nada. Observa y cuenta.
 *  · NO manda nada cuando todo está en orden. El silencio es el caso normal;
 *    si mandara un «hola» por carga, serían millones de peticiones para decir
 *    que no pasa nada.
 *
 * ── Y NO PRETENDE SER INVIOLABLE ───────────────────────────────────────────
 * Quien se descargue el paquete y lo parchee con calma también parchea esto.
 * Es inevitable y está escrito en el plan: lo que de verdad protege es que el
 * valor viva en el servidor. Esto cubre la inyección y la clonación, que son
 * baratas de detectar y caras de disimular.
 * ════════════════════════════════════════════════════════════════════════════
 */

type TipoDeAviso = 'script-inyectado' | 'marco-inyectado' | 'origen-ajeno' | 'sello-ausente';

interface Aviso {
  tipo: TipoDeAviso;
  detalle: string;
}

/** Los anfitriones donde este paquete tiene derecho a estar. */
const ANFITRIONES_PROPIOS = [
  'app.cguardpro.com',
  'partners.cguardpro.com',
  'cguardpro.com',
  'www.cguardpro.com',
];

/**
 * Los ESQUEMAS donde este mismo paquete también corre con todo el derecho, sin
 * anfitrión que valga.
 *
 * ESTO FALTABA Y ERA GRAVE. El CRM de escritorio (Electron) sirve el paquete en
 * `app://crm`, así que su `hostname` es «crm»: ni está en la lista de arriba ni
 * acaba en `.cguardpro.com`. Sin esta comprobación, cada usuario de escritorio
 * se anotaba como `origen-ajeno` — que es precisamente la señal de «nuestro
 * paquete corriendo en un dominio que no es el nuestro», la única que significa
 * COPIA. La señal más valiosa del plan disparando contra clientes.
 *
 * La lista es la MISMA que ya tiene el backend en su filtro de CORS
 * (`api/index.ts`): `app:` para el escritorio, `capacitor:` e `ionic:` para las
 * vistas web de las apps móviles. Si allí se añade un esquema, aquí también.
 */
const ESQUEMAS_PROPIOS = ['app:', 'capacitor:', 'ionic:'];

/**
 * ¿Este paquete está donde debe? Se saca aparte y se exporta para poder
 * probarlo: es la decisión que dispara la única señal de copia que hay, y
 * equivocarse acusa a un cliente.
 */
export function esOrigenPropio(loc: { hostname: string; protocol: string }): boolean {
  if (ESQUEMAS_PROPIOS.includes(loc.protocol)) return true;
  if (ANFITRIONES_PROPIOS.includes(loc.hostname)) return true;
  if (loc.hostname.endsWith('.cguardpro.com')) return true;

  // Desarrollo, no una copia.
  return loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
}

/**
 * Orígenes que meten cosas en la página con permiso. No se avisan porque
 * serían una fila con un contador enorme por cada carga de cada usuario, y eso
 * tapa lo que sí importa. La lista es corta a propósito.
 */
const CONOCIDOS = [
  'https://challenges.cloudflare.com',
  'https://maps.googleapis.com',
  'https://maps.gstatic.com',
  'https://static.cloudflareinsights.com',
  'https://sdk.twilio.com',
];

const RUTA = '/api/security/integridad';

/**
 * El identificador del build. Lo pone `scripts/sellar-integridad.mjs` en el
 * index.html, derivado de los hashes de los ficheros que se sirven de verdad —
 * no de una variable de entorno que alguien puede olvidarse de pasar.
 *
 * Que falte NO es lo mismo que que sea desconocido: significa que el documento
 * no pasó por el sellado, o que lo reescribieron. Por eso alimenta también el
 * aviso `sello-ausente`.
 */
function buildDelDocumento(): string | null {
  const meta = document.querySelector('meta[name="cg-build"]');

  return meta?.getAttribute('content')?.trim() || null;
}


/** Tope de avisos por sesión: sin él, una extensión chillona manda sin parar. */
const TOPE_POR_SESION = 12;

/** Lo que se ve en el primer segundo se manda junto, no en cinco peticiones. */
const AGRUPAR_MS = 1000;

const pendientes: Aviso[] = [];
const yaVisto = new Set<string>();
let enviados = 0;
let temporizador: ReturnType<typeof setTimeout> | null = null;

function esNuestro(u: string): boolean {
  try {
    const url = new URL(u, location.href);

    if (url.origin === location.origin) return true;
    if (ANFITRIONES_PROPIOS.includes(url.hostname)) return true;
    if (url.hostname.endsWith('.cguardpro.com')) return true;

    return CONOCIDOS.includes(url.origin);
  } catch {
    /* `data:`, `blob:` y los src vacíos caen aquí: los pone la propia app. */
    return true;
  }
}

function anotar(tipo: TipoDeAviso, detalle: string): void {
  if (enviados >= TOPE_POR_SESION) return;

  const clave = `${tipo}|${detalle}`;

  if (yaVisto.has(clave)) return;
  yaVisto.add(clave);
  pendientes.push({ tipo, detalle });

  if (temporizador) return;
  temporizador = setTimeout(enviar, AGRUPAR_MS);
}

function enviar(): void {
  temporizador = null;

  const avisos = pendientes.splice(0, pendientes.length);

  if (!avisos.length) return;
  enviados += avisos.length;

  /* El ANFITRIÓN va delante, no sólo la ruta — desde el 2026-09-22. Sin él, un
     `origen-ajeno` (la señal de copia) no se distingue de tráfico legítimo en
     el backend, que sólo veía una ruta pelada como `/dashboard` igual de bien
     servida desde aquí que desde el dominio de un clon. La consulta y el
     fragmento SIGUEN sin mandarse — ahí es donde viajan testigos y búsquedas. */
  const cuerpo = JSON.stringify({
    ruta: location.origin + location.pathname,
    build: buildDelDocumento(),
    avisos,
  });

  /* `sendBeacon` para que el aviso sobreviva a que la pestaña se cierre justo
     después — que es cuando más interesa que salga. Si no está, un `fetch`
     con `keepalive`, y si tampoco, se calla: esto nunca puede romper la app. */
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(RUTA, new Blob([cuerpo], { type: 'application/json' }));

      return;
    }

    void fetch(RUTA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* nunca */
  }
}

function mirarElDocumento(): void {
  // 1. ¿Estamos donde debemos?
  if (!esOrigenPropio(location)) anotar('origen-ajeno', location.origin);

  /* 2. ¿El documento conserva los sellos que le puso el build?
        Se mira el `integrity` del módulo de entrada Y el <meta> del build. Si
        falta cualquiera de los dos, el index.html que llegó no es el que
        salió del sellado. */
  const hayModulo = document.querySelector('script[type="module"][src]');
  const conSello = document.querySelector('script[type="module"][integrity]');

  if (hayModulo && (!conSello || !buildDelDocumento())) anotar('sello-ausente', 'sin sello');

  // 3. Lo ajeno que ya estuviera en el documento al arrancar.
  document.querySelectorAll('script[src]').forEach((s) => {
    const src = (s as HTMLScriptElement).src;

    if (!esNuestro(src)) anotar('script-inyectado', src);
  });
}

function vigilarLoQueLlegueDespues(): void {
  const observador = new MutationObserver((cambios) => {
    for (const c of cambios) {
      c.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;

        if (n.tagName === 'SCRIPT') {
          const src = (n as HTMLScriptElement).src;

          if (src && !esNuestro(src)) anotar('script-inyectado', src);
        } else if (n.tagName === 'IFRAME') {
          const src = (n as HTMLIFrameElement).src;

          if (src && !esNuestro(src)) anotar('marco-inyectado', src);
        }
      });
    }
  });

  observador.observe(document.documentElement, { childList: true, subtree: true });
}

let arrancado = false;

/**
 * Se llama una vez desde el arranque de la aplicación. Todo va dentro de un
 * `try`: un fallo aquí no puede impedir que la aplicación se pinte. Una
 * herramienta de seguridad que tumba el producto es peor que no tenerla.
 */
export function iniciarCentinela(): void {
  if (arrancado) return;
  arrancado = true;

  try {
    mirarElDocumento();
    vigilarLoQueLlegueDespues();
  } catch {
    /* nunca */
  }
}
