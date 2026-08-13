/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — CHINCHETAS DE CRISTAL
 *
 * Las chinchetas son FICHAS FLOTANTES: un cuadrado de color con el icono, el
 * nombre del puesto y la cifra grande, colgando de un tallo fino que cae sobre
 * la coordenada exacta. Es la traducción del cristal del CRM al mapa.
 *
 * ── POR QUÉ SVG Y NO HTML ──────────────────────────────────────────────────
 * Un marcador con DOM real (`AdvancedMarkerElement`) permitiría `.glass` tal
 * cual… pero EXIGE que el mapa lleve un `mapId` de Google Cloud, y un mapa con
 * `mapId` IGNORA el array `styles`. O tenemos teselas acromáticas propias o
 * tenemos chinchetas de HTML: no las dos. Gana el estilo del mapa, así que la
 * ficha se dibuja en SVG imitando la receta del cristal — superficie
 * translúcida, filo superior iluminado y sombra que la despega.
 *
 * `backdrop-filter` no existe aquí, y es lo correcto: son marcadores que se
 * repiten decenas de veces y desenfocar el mapa detrás de cada uno tiraría el
 * desplazamiento (misma razón por la que `.glass-flat` existe en glass.css).
 *
 * ── COLOR ──────────────────────────────────────────────────────────────────
 * Ningún color escrito a mano: todos entran ya resueltos desde `mapTheme.ts`,
 * que los lee de las variables del sistema en tiempo de ejecución.
 *
 * ── MOVIMIENTO ─────────────────────────────────────────────────────────────
 * Lo poco que se mueve DENTRO de la chincheta —el latido del punto— va en SMIL
 * (`<animate>`), que es lo único que un SVG-imagen sabe animar por su cuenta. Lo
 * demás (deslizar entre pings, la onda de un evento, la cámara) NO se hace aquí:
 * un icono regenerado por fotograma es lo que arrastra un mapa con trescientos
 * vigilantes. Eso vive en `mapMotion.ts`, que mueve el marcador entero.
 *
 * El RUMBO es el caso de en medio: girar sí obliga a regenerar el icono, pero
 * `mapMotion` cuantiza el ángulo a escalones de `PASO_RUMBO`, así que las
 * variantes son 24 y salen todas de la caché de aquí abajo.
 *
 * Con `prefers-reduced-motion` no se emite NINGÚN `<animate>`: el SVG se sirve
 * como imagen y no ve el `@media` del documento, así que la preferencia se
 * consulta en JavaScript y entra en la clave de caché.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { calma, PASO_RUMBO } from "./mapMotion";

/** Descriptor listo para `new google.maps.Marker({ icon })`. */
export interface PinAsset {
  url: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
}

/** Colores ya resueltos que necesita una ficha. Vienen de `leerPaleta()`. */
export interface PinSkin {
  /** Superficie de la ficha (opaca; se le aplica alfa aquí). */
  placa: string;
  /** Filo/borde de 1 px. */
  filo: string;
  /** Filo superior iluminado. */
  filoLuz: string;
  /** Tinta del texto. */
  tinta: string;
  /** Tinta secundaria. */
  tintaSuave: string;
  /** Tinta sobre un relleno de color (casi negra). */
  tintaSobreColor: string;
  /** true en modo oscuro — ajusta las alfas de la placa. */
  oscuro: boolean;
}

/* ── Medición de texto ───────────────────────────────────────────────────── */

/**
 * Un SVG servido como data-URL se pinta como IMAGEN: no ve las fuentes web del
 * documento, sólo las del sistema. Por eso la ficha se declara con la pila del
 * sistema y se mide con esa MISMA pila — medir con Poppins daría anchos que no
 * corresponden a lo que se acaba dibujando.
 */
const PILA = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

let ctx: CanvasRenderingContext2D | null | undefined;
const cacheMedidas = new Map<string, number>();

function medir(texto: string, fuente: string): number {
  const clave = `${fuente}|${texto}`;
  const previo = cacheMedidas.get(clave);
  if (previo != null) return previo;
  let ancho = texto.length * 6.4; // respaldo si no hay canvas
  try {
    if (ctx === undefined) ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = fuente;
      ancho = ctx.measureText(texto).width;
    }
  } catch {
    /* respaldo ya calculado */
  }
  if (cacheMedidas.size > 500) cacheMedidas.clear();
  cacheMedidas.set(clave, ancho);
  return ancho;
}

export function escaparXml(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string),
  );
}

function recortar(s: string, max: number): string {
  const t = String(s ?? "").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function url(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg.replace(/\s{2,}/g, " "))}`;
}

const cacheAssets = new Map<string, PinAsset>();
function memo(clave: string, construir: () => PinAsset): PinAsset {
  const previo = cacheAssets.get(clave);
  if (previo) return previo;
  const a = construir();
  if (cacheAssets.size > 400) cacheAssets.clear();
  cacheAssets.set(clave, a);
  return a;
}

/* ── Piezas compartidas ──────────────────────────────────────────────────── */

/**
 * El tallo + el punto sobre la coordenada exacta.
 *
 * `vivo` le pone el latido, y el latido SIGNIFICA algo: se reserva para lo que
 * tiene señal en vivo de verdad. Si late todo, no informa nada. Con movimiento
 * reducido queda el halo quieto — la misma lectura, sin pulso.
 */
function tallo(x: number, arriba: number, y: number, color: string, filo: string, vivo: boolean): string {
  const latido = !vivo
    ? ""
    : calma()
      ? `<circle cx="${x}" cy="${y}" r="9" fill="${color}" opacity="0.22"/>`
      : `<circle cx="${x}" cy="${y}" r="6" fill="${color}" opacity="0.45">
           <animate attributeName="r" values="6;13" dur="1.9s" repeatCount="indefinite"/>
           <animate attributeName="opacity" values="0.45;0" dur="1.9s" repeatCount="indefinite"/>
         </circle>`;
  return `
    <line x1="${x}" y1="${arriba}" x2="${x}" y2="${y - 4}" stroke="${color}" stroke-width="1.5" opacity="0.75"/>
    ${latido}
    <circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="${filo}" stroke-width="1.25"/>`;
}

/** El cuadrado de color con el icono dentro — el `IconTile` del kit, en SVG. */
function baldosa(x: number, y: number, lado: number, color: string, glifo?: string, texto?: string): string {
  const r = Math.round(lado * 0.32);
  const escala = (lado * 0.62) / 24;
  const dentro = glifo
    ? `<g transform="translate(${x + lado / 2 - (24 * escala) / 2},${y + lado / 2 - (24 * escala) / 2}) scale(${escala.toFixed(3)})"
          fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${glifo}</g>`
    : `<text x="${x + lado / 2}" y="${y + lado / 2}" text-anchor="middle" dominant-baseline="central"
             font-family='${PILA}' font-size="${Math.round(lado * 0.5)}" font-weight="700" fill="${color}">${escaparXml(texto || "")}</text>`;
  return `
    <rect x="${x}" y="${y}" width="${lado}" height="${lado}" rx="${r}"
          fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-opacity="0.45" stroke-width="1"/>
    ${dentro}`;
}

/**
 * La superficie de cristal: sombra que la despega, placa translúcida, filo de
 * 1 px y realce iluminado ARRIBA. Ese último es el que hace que se lea como
 * vidrio y no como un rectángulo con opacidad (ver la cabecera de glass.css).
 *
 * El negro de la sombra es el único literal, y es el mismo valor que usan las
 * sombras del sistema: `--lift-*` en tokens.css son todas `oklch(0 0 0 / α)`.
 * No hay una variable que valga aquí porque `box-shadow` no existe en SVG.
 */
function placa(w: number, h: number, s: PinSkin, color: string): string {
  const alfa = s.oscuro ? 0.9 : 0.86;
  const r = 12;
  return `
    <rect x="1.5" y="3" width="${w - 3}" height="${h - 1}" rx="${r}" fill="#000000" opacity="${s.oscuro ? 0.45 : 0.14}"/>
    <rect x="1" y="0.5" width="${w - 2}" height="${h - 1}" rx="${r}" fill="${s.placa}" fill-opacity="${alfa}"
          stroke="${s.filo}" stroke-width="1"/>
    <path d="M ${1 + r} 1.5 H ${w - 1 - r}" stroke="${s.filoLuz}" stroke-width="1" fill="none" opacity="0.9"/>
    <rect x="1" y="0.5" width="${w - 2}" height="${h - 1}" rx="${r}" fill="none"
          stroke="${color}" stroke-opacity="0.28" stroke-width="1"/>`;
}

/* ── Ficha completa ──────────────────────────────────────────────────────── */

export interface ChipOpts {
  /** Nombre del puesto. */
  etiqueta: string;
  /** La cifra grande — p. ej. cuántos vigilantes hay. */
  cifra?: string | number;
  /** Color semántico del estado (cubierto / en riesgo / sin cubrir). */
  color: string;
  /** Geometría interna del icono lucide (24×24), o un texto corto. */
  glifo?: string;
  insignia?: string;
  /** Punto latiendo = dato en vivo. */
  vivo?: boolean;
  piel: PinSkin;
  /** Clave extra para el cacheo (tema/acento). */
  version?: string;
}

const CHIP_ALTO = 36;
const CHIP_CAIDA = 14; // tallo
const BALDOSA = 22;
const F_ETIQUETA = `600 11.5px ${PILA}`;
const F_CIFRA = `700 15px ${PILA}`;

/**
 * La chincheta principal: ficha de cristal flotando sobre su coordenada.
 * Ancho variable — se mide el texto de verdad para que no quede ni apretado ni
 * con un hueco a la derecha.
 */
export function chipPin(o: ChipOpts): PinAsset {
  // 18 caracteres: por encima, dos fichas vecinas se solapan antes de que el
  // nombre aporte nada — el nombre completo sigue en el globo y en el `title`.
  const etiqueta = recortar(o.etiqueta || "Puesto", 18);
  const cifra = o.cifra == null || o.cifra === "" ? "" : String(o.cifra);
  const clave = `chip|${etiqueta}|${cifra}|${o.color}|${o.glifo ? "g" : o.insignia || ""}|${o.vivo ? 1 : 0}|${o.version || ""}|${o.piel.oscuro ? "d" : "l"}|${calma() ? "q" : "m"}`;

  return memo(clave, () => {
    const anchoEtiqueta = Math.ceil(medir(etiqueta, F_ETIQUETA));
    const anchoCifra = cifra ? Math.ceil(medir(cifra, F_CIFRA)) : 0;
    const w = 8 + BALDOSA + 8 + anchoEtiqueta + (cifra ? 10 + anchoCifra : 0) + 11;
    const h = CHIP_ALTO;
    const total = h + CHIP_CAIDA + 14;
    const puntoY = h + CHIP_CAIDA;
    const cx = Math.round(w / 2);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${total}" viewBox="0 0 ${w} ${total}">
      ${tallo(cx, h, puntoY, o.color, o.piel.filo, !!o.vivo)}
      ${placa(w, h, o.piel, o.color)}
      ${baldosa(8, (h - BALDOSA) / 2, BALDOSA, o.color, o.glifo, o.insignia)}
      <text x="${8 + BALDOSA + 8}" y="${h / 2}" dominant-baseline="central" font-family='${PILA}'
            font-size="11.5" font-weight="600" fill="${o.piel.tinta}">${escaparXml(etiqueta)}</text>
      ${cifra
        ? `<text x="${w - 11}" y="${h / 2}" text-anchor="end" dominant-baseline="central" font-family='${PILA}'
                 font-size="15" font-weight="700" fill="${o.color}">${escaparXml(cifra)}</text>`
        : ""}
    </svg>`;

    return { url: url(svg), width: w, height: total, anchorX: cx, anchorY: puntoY };
  });
}

/* ── Chincheta compacta ──────────────────────────────────────────────────── */

export interface OrbOpts {
  color: string;
  glifo?: string;
  insignia?: string;
  vivo?: boolean;
  piel: PinSkin;
  /** Diámetro del disco de color. */
  tamano?: "sm" | "md";
  /**
   * Rumbo en grados (0 = norte, 90 = este). Le saca una PROA que apunta hacia
   * donde se mueve. Sale del vector entre dos posiciones — se lo calcula
   * `mapMotion.seguir({ rumbo: true })` y lo entrega por `alRumbo`.
   *
   * Se cuantiza a escalones de `PASO_RUMBO` DENTRO de esta función: aunque
   * llegue un ángulo continuo, la caché no puede reventar.
   */
  rumbo?: number;
  version?: string;
}

/**
 * El orbe: disco de color con halo de cristal. Para lo que se repite mucho
 * (vigilantes, supervisores, incidentes) y para el zoom lejano, donde una ficha
 * con nombre taparía el mapa entero.
 *
 * Con `rumbo` le sale una proa. Gira SÓLO la proa, no el icono: rotar el glifo
 * entero deja al vigilante cabeza abajo cuando camina hacia el sur, y un icono
 * ilegible informa menos que uno quieto. Es la misma decisión que toma Uber con
 * el punto azul del pasajero.
 */
export function orbPin(o: OrbOpts): PinAsset {
  const chico = o.tamano === "sm";
  const rumbo = o.rumbo == null || !Number.isFinite(o.rumbo)
    ? null
    : ((Math.round(o.rumbo / PASO_RUMBO) * PASO_RUMBO) % 360 + 360) % 360;
  const clave = `orb|${o.color}|${o.glifo ? "g" : o.insignia || ""}|${o.vivo ? 1 : 0}|${chico ? "s" : "m"}|${o.version || ""}|${o.piel.oscuro ? "d" : "l"}|${calma() ? "q" : "m"}|${rumbo ?? "-"}`;

  return memo(clave, () => {
    const lado = 46;
    const c = lado / 2;
    const rHalo = chico ? 12 : 15;
    const rNucleo = chico ? 8 : 10.5;
    // El glifo ocupa algo más que el radio del núcleo: escala = lado deseado / 24
    // (la caja nativa de un icono lucide).
    const escala = (rNucleo * 1.15) / 24;

    const latido = !o.vivo
      ? ""
      : calma()
        ? `<circle cx="${c}" cy="${c}" r="${rHalo + 3}" fill="${o.color}" opacity="0.16"/>`
        : `<circle cx="${c}" cy="${c}" r="${rHalo}" fill="${o.color}" opacity="0.35">
             <animate attributeName="r" values="${rHalo};${lado / 2 - 1}" dur="1.9s" repeatCount="indefinite"/>
             <animate attributeName="opacity" values="0.4;0" dur="1.9s" repeatCount="indefinite"/>
           </circle>`;

    // La proa: dibujada apuntando al NORTE y rotada al rumbo pedido. Va pegada
    // al filo del halo, fuera del disco, para no comerse el icono.
    const proa = rumbo == null
      ? ""
      : `<g transform="rotate(${rumbo} ${c} ${c})">
           <path d="M ${c} ${c - rHalo - 6.6} L ${c + 5.2} ${c - rHalo + 1.4} L ${c} ${c - rHalo - 0.6} L ${c - 5.2} ${c - rHalo + 1.4} Z"
                 fill="${o.color}" stroke="${o.piel.filo}" stroke-width="0.75" stroke-linejoin="round"/>
         </g>`;

    const dentro = o.glifo
      ? `<g transform="translate(${c - 12 * escala},${c - 12 * escala}) scale(${escala.toFixed(3)})"
            fill="none" stroke="${o.piel.tintaSobreColor}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${o.glifo}</g>`
      : `<text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-family='${PILA}'
               font-size="${chico ? 10 : 12}" font-weight="700" fill="${o.piel.tintaSobreColor}">${escaparXml(o.insignia || "")}</text>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
      ${latido}
      ${proa}
      <circle cx="${c}" cy="${c}" r="${rHalo}" fill="${o.piel.placa}" fill-opacity="${o.piel.oscuro ? 0.82 : 0.8}"
              stroke="${o.piel.filo}" stroke-width="1"/>
      <circle cx="${c}" cy="${c}" r="${rHalo}" fill="none" stroke="${o.color}" stroke-opacity="0.45" stroke-width="1"/>
      <circle cx="${c}" cy="${c}" r="${rNucleo}" fill="${o.color}"/>
      ${dentro}
    </svg>`;

    return { url: url(svg), width: lado, height: lado, anchorX: c, anchorY: c };
  });
}

/** `PinAsset` → las opciones `icon` de un `google.maps.Marker`. */
export function iconoDe(g: any, a: PinAsset) {
  return {
    url: a.url,
    scaledSize: new g.maps.Size(a.width, a.height),
    anchor: new g.maps.Point(a.anchorX, a.anchorY),
  };
}
