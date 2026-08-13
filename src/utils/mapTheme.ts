/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — MAPAS: PUENTE DE COLOR CON LA API DE GOOGLE
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
 * El CRM no escribe colores a mano: todo sale de `tokens.css`, donde el usuario
 * elige UN acento (`--brand-h` en el <html>) y la superficie es acromática y
 * cambia con el tema. La API de Google Maps es la ÚNICA excepción legítima: sus
 * campos de color (`styles[].stylers[].color`, `strokeColor`, `fillColor`,
 * `backgroundColor`) reciben CADENAS y no aceptan `var(--brand)`. Sin puente, el
 * mapa sería lo único de la aplicación que ignora el acento elegido.
 *
 * El puente: LEER la variable CSS en tiempo de ejecución y convertirla a
 * `#rrggbb` antes de dársela a Google.
 *
 * ── POR QUÉ CON UNA SONDA Y NO CON getPropertyValue ─────────────────────────
 * `getComputedStyle(html).getPropertyValue('--brand-wash')` devuelve
 * `oklch(0.26 calc(0.16 * 0.35) 88)`: el valor calculado de una propiedad
 * PERSONALIZADA sustituye `var()` pero NO evalúa `calc()`, porque la propiedad
 * no tiene tipo. Eso no hay forma de convertirlo.
 * Asignando la variable a una propiedad TIPADA de un elemento real
 * (`sonda.style.color = 'var(--brand-wash)'`) el navegador sí resuelve `var()`
 * Y `calc()`, y `getComputedStyle(sonda).color` devuelve un color parseable.
 *
 * ── DE DÓNDE SALEN LOS GRISES DEL MAPA ──────────────────────────────────────
 * No se inventan: son las mismas superficies del sistema de cristal compuestas
 * sobre el lienzo. Tierra = `--canvas`; agua = el hueco (`--glass-sunken`)
 * sobre el lienzo; calles = la superficie (`--glass`); vías rápidas = la
 * superficie elevada; fronteras = `--hairline`. Así el mapa se oscurece y se
 * aclara con el tema por construcción, y el ÚNICO color en pantalla sigue
 * siendo el acento y los semánticos.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { useEffect, useState } from "react";

export interface Rgba { r: number; g: number; b: number; a: number }

/* ── Conversión de color ─────────────────────────────────────────────────── */

const acota = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function parseHex(s: string): Rgba | null {
  const h = s.replace("#", "").trim();
  const exp = h.length === 3 || h.length === 4
    ? h.split("").map((c) => c + c).join("")
    : h;
  if (exp.length !== 6 && exp.length !== 8) return null;
  const n = Number.parseInt(exp.slice(0, 6), 16);
  if (Number.isNaN(n)) return null;
  const a = exp.length === 8 ? Number.parseInt(exp.slice(6, 8), 16) / 255 : 1;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

/** Números de una función CSS, resolviendo porcentajes con su escala. */
function nums(s: string, pctScale: number[]): number[] {
  const raw = s.match(/-?\d*\.?\d+(?:e[-+]?\d+)?%?/gi) || [];
  return raw.map((t, i) => {
    if (t.endsWith("%")) return (Number.parseFloat(t) / 100) * (pctScale[i] ?? 1);
    return Number.parseFloat(t);
  });
}

/** sRGB con gamma a partir del canal lineal. */
function gamma(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(acota(v, 0, 1) * 255);
}

/** OKLab → sRGB (matrices estándar de Björn Ottosson). */
function oklabToRgb(L: number, a: number, b: number): { r: number; g: number; b: number } {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return {
    r: gamma(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

let ctx2d: CanvasRenderingContext2D | null | undefined;
/** Último recurso: dejar que el navegador normalice el color. */
function porLienzo(s: string): Rgba | null {
  try {
    if (ctx2d === undefined) ctx2d = document.createElement("canvas").getContext("2d");
    if (!ctx2d) return null;
    const centinela = "#010203";
    ctx2d.fillStyle = centinela;
    ctx2d.fillStyle = s;
    const salida = String(ctx2d.fillStyle);
    if (salida.toLowerCase() === centinela) return null; // no lo entendió
    return salida.startsWith("#") ? parseHex(salida) : parseFuncion(salida);
  } catch {
    return null;
  }
}

function parseFuncion(s: string): Rgba | null {
  const v = nums(s, [255, 255, 255, 1]);
  if (v.length < 3) return null;
  return { r: acota(v[0], 0, 255), g: acota(v[1], 0, 255), b: acota(v[2], 0, 255), a: v[3] ?? 1 };
}

/** Cualquier cadena de color CSS → RGBA. */
export function parseCssColor(raw: string): Rgba | null {
  const s = String(raw || "").trim().toLowerCase();
  if (!s || s === "transparent") return null;
  if (s.startsWith("#")) return parseHex(s);

  if (s.startsWith("oklch")) {
    const v = nums(s, [1, 0.4, 360, 1]);
    if (v.length < 3 || v.some((n) => Number.isNaN(n))) return porLienzo(s);
    const [L, C, H] = v;
    const rad = (H * Math.PI) / 180;
    const { r, g, b } = oklabToRgb(L, C * Math.cos(rad), C * Math.sin(rad));
    return { r, g, b, a: v[3] ?? 1 };
  }

  if (s.startsWith("oklab")) {
    const v = nums(s, [1, 0.4, 0.4, 1]);
    if (v.length < 3 || v.some((n) => Number.isNaN(n))) return porLienzo(s);
    const { r, g, b } = oklabToRgb(v[0], v[1], v[2]);
    return { r, g, b, a: v[3] ?? 1 };
  }

  if (s.startsWith("rgb")) return parseFuncion(s);

  if (s.startsWith("color(")) {
    // color(srgb r g b / a) — canales 0..1
    const v = nums(s, [1, 1, 1, 1]);
    if (v.length >= 3 && s.includes("srgb")) {
      return { r: Math.round(acota(v[0], 0, 1) * 255), g: Math.round(acota(v[1], 0, 1) * 255), b: Math.round(acota(v[2], 0, 1) * 255), a: v[3] ?? 1 };
    }
    return porLienzo(s);
  }

  return porLienzo(s);
}

export function toHex({ r, g, b }: Rgba): string {
  const h = (n: number) => Math.round(acota(n, 0, 255)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function toRgba({ r, g, b, a }: Rgba, alfa?: number): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${(alfa ?? a).toFixed(3)})`;
}

/** Compone una capa con alfa sobre un fondo opaco. */
export function componer(capa: Rgba, fondo: Rgba): Rgba {
  const a = acota(capa.a, 0, 1);
  return {
    r: capa.r * a + fondo.r * (1 - a),
    g: capa.g * a + fondo.g * (1 - a),
    b: capa.b * a + fondo.b * (1 - a),
    a: 1,
  };
}

/** Mezcla lineal de dos colores opacos. */
export function mezclar(a: Rgba, b: Rgba, t: number): Rgba {
  const k = acota(t, 0, 1);
  return { r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k, a: 1 };
}

/** La misma capa con la opacidad escalada. */
function conAlfa(c: Rgba, k: number): Rgba {
  return { ...c, a: acota(c.a * k, 0, 1) };
}

/* ── Lectura de las variables del sistema ────────────────────────────────── */

let sonda: HTMLElement | null = null;
function obtenerSonda(forzarOscuro: boolean): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (!sonda || !sonda.isConnected) {
    const el = document.createElement("span");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:absolute;left:-9999px;top:0;width:0;height:0;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    sonda = el;
  }
  // Ponerle la clase `dark` A LA PROPIA SONDA hace que el bloque `.dark` de
  // tokens.css la seleccione: sus variables quedan definidas EN el elemento y
  // ganan a las heredadas del <html>. Es lo que permite leer la paleta oscura
  // con la aplicación en claro, para el ajuste «Tema del mapa: Noche».
  sonda.classList.toggle("dark", forzarOscuro);
  return sonda;
}

/**
 * Valor RESUELTO de una variable del sistema de diseño, en RGBA.
 * Ver la cabecera: se pasa por una propiedad tipada para que el navegador
 * evalúe `calc()` además de `var()`.
 */
export function leerToken(nombre: string, respaldo = "#808080", forzarOscuro = false): Rgba {
  try {
    const el = obtenerSonda(forzarOscuro);
    if (el) {
      el.style.color = "";
      el.style.color = `var(${nombre})`;
      const calculado = getComputedStyle(el).color;
      const c = calculado ? parseCssColor(calculado) : null;
      if (c) return c;
    }
  } catch {
    /* sin DOM o variable inexistente — cae al respaldo */
  }
  return parseCssColor(respaldo) || { r: 128, g: 128, b: 128, a: 1 };
}

/** La variable, ya en `#rrggbb` — el formato que exige Google Maps. */
export function tokenHex(nombre: string, respaldo = "#808080", forzarOscuro = false): string {
  return toHex(leerToken(nombre, respaldo, forzarOscuro));
}

/** La variable como `rgba(...)`, con alfa propia o forzada. Para los SVG. */
export function tokenRgba(nombre: string, alfa?: number, respaldo = "#808080", forzarOscuro = false): string {
  return toRgba(leerToken(nombre, respaldo, forzarOscuro), alfa);
}

/* ── Paleta del mapa ─────────────────────────────────────────────────────── */

export interface MapPalette {
  oscuro: boolean;
  /** Acento configurable y sus variantes. */
  brand: string; brandInk: string; brandText: string; brandLine: string;
  /** Tinta. */
  ink: string; inkSoft: string; inkFaint: string;
  /** Superficies del cristal (ya compuestas y opacas donde el mapa las exige). */
  canvas: string; glassSolid: string; hairline: string; hairlineLit: string;
  /** Semánticos — fijos, no dependen del acento. */
  ok: string; warn: string; bad: string; info: string;
  /** Teselas del mapa, derivadas de las superficies. */
  tierra: string; agua: string; calle: string; via: string; frontera: string; edificio: string;
}

/** `modo: "noche"` lee la paleta oscura aunque la aplicación esté en claro. */
export function leerPaleta(modo: "auto" | "noche" = "auto"): MapPalette {
  const temaOscuro = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const oscuro = modo === "noche" ? true : temaOscuro;
  const forzar = modo === "noche" && !temaOscuro;

  const tokenHex = (n: string, r?: string) => toHex(leerToken(n, r, forzar));
  const tokenRgba = (n: string, a?: number, r?: string) => toRgba(leerToken(n, r, forzar), a);

  const canvas = leerToken("--canvas", oscuro ? "#111111" : "#f2f2f2", forzar);
  const sunken = leerToken("--glass-sunken", "#00000055", forzar);
  const superficie = leerToken("--glass", "#ffffff22", forzar);
  const elevada = leerToken("--glass-raised", "#ffffff33", forzar);
  const hairline = leerToken("--hairline", "#88888833", forzar);

  // ── LA ESCALERA DE GRISES DEL MAPA ────────────────────────────────────────
  // Se construye HACIA ARRIBA desde el lienzo, nunca hacia abajo, y ese detalle
  // es lo que la hace funcionar en los dos temas: en oscuro `--canvas` ya está
  // pegado al negro (L 0.09 ≈ #020202), así que oscurecer el agua no la mueve —
  // toca el suelo y queda idéntica a la tierra. Apilando superficies claras cada
  // escalón se separa del anterior con el tema que sea.
  //
  //   agua  = el lienzo desnudo — el fondo del mapa
  //   tierra= media superficie encima
  //   calle = una superficie entera
  //   vía   = superficie + elevada
  const agua = componer(sunken, componer(sunken, canvas));
  // En OSCURO la tierra necesita DOS superficies, no media. `--glass` es blanco
  // al 5,5 %: media capa sobre un lienzo ya pegado al negro dejaba la tierra en
  // #0a0a0a contra un agua de #010101 — nueve niveles de separación, y la
  // geografía no se leía. En CLARO media capa basta y sobra: ahí el lienzo es
  // gris perla y una capa entera dejaría la tierra en blanco puro, sin sitio
  // para que las calles se separen por encima.
  const tierra = oscuro
    ? componer(superficie, componer(conAlfa(superficie, 0.6), canvas))
    : componer(conAlfa(superficie, 0.55), canvas);
  const calle = componer(superficie, tierra);
  const via = componer(elevada, calle);

  return {
    oscuro,
    brand: tokenHex("--brand", "#c8a020"),
    brandInk: tokenHex("--brand-ink", "#161616"),
    brandText: tokenHex("--brand-text", "#c8a020"),
    brandLine: tokenHex("--brand-line", "#6b5a12"),
    ink: tokenHex("--ink", oscuro ? "#f7f7f7" : "#2b2b2b"),
    inkSoft: tokenHex("--ink-soft", "#8a8a8a"),
    inkFaint: tokenHex("--ink-faint", "#6f6f6f"),
    canvas: toHex(canvas),
    glassSolid: tokenHex("--glass-solid", oscuro ? "#242424" : "#ffffff"),
    hairline: toHex(componer(hairline, canvas)),
    hairlineLit: tokenRgba("--hairline-lit", undefined, "#ffffff33"),
    ok: tokenHex("--ok", "#3f9e6b"),
    warn: tokenHex("--warn", "#c98a2a"),
    bad: tokenHex("--bad", "#c04a3d"),
    info: tokenHex("--info", "#4a7fc0"),
    tierra: toHex(tierra),
    agua: toHex(agua),
    calle: toHex(calle),
    via: toHex(via),
    frontera: toHex(componer(hairline, calle)),
    edificio: toHex(mezclar(tierra, calle, 0.5)),
  };
}

/**
 * El array `styles` de Google Maps, ACROMÁTICO por diseño.
 * Ni el agua ni la tierra llevan tono: así lo único con color sobre el mapa son
 * las chinchetas (semánticas) y las rutas (el acento). Un mapa con agua azul y
 * parques verdes se pelea con la mitad de los acentos posibles.
 */
export function estiloMapa(p: MapPalette): any[] {
  return [
    { elementType: "geometry", stylers: [{ color: p.tierra }] },
    { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
    { elementType: "labels.text.fill", stylers: [{ color: p.inkFaint }] },
    // El contorno del texto tiene que ser GRUESO: sobre teselas casi negras un
    // topónimo sin halo se pierde en cuanto pasa por encima de una calle.
    { elementType: "labels.text.stroke", stylers: [{ color: p.tierra }, { weight: 3 }] },

    // Sin ruido: puntos de interés y transporte fuera. El mapa es un tablero de
    // operaciones, no una guía turística.
    { featureType: "poi", stylers: [{ visibility: "off" }] },
    { featureType: "transit", stylers: [{ visibility: "off" }] },
    { featureType: "administrative.land_parcel", stylers: [{ visibility: "off" }] },
    { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },

    { featureType: "administrative", elementType: "geometry", stylers: [{ color: p.frontera }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: p.inkSoft }] },
    { featureType: "administrative.province", elementType: "labels.text.fill", stylers: [{ color: p.inkFaint }] },

    { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: p.tierra }] },
    { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: p.edificio }] },

    { featureType: "road", elementType: "geometry", stylers: [{ color: p.calle }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: p.frontera }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: p.inkFaint }] },
    { featureType: "road", elementType: "labels.text.stroke", stylers: [{ color: p.tierra }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: p.via }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: p.frontera }] },
    { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "simplified" }] },

    { featureType: "water", elementType: "geometry", stylers: [{ color: p.agua }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: p.inkFaint }] },
    { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: p.agua }] },
  ];
}

/* ── Reactividad al tema y al acento ─────────────────────────────────────── */

/**
 * La paleta viva. Se recalcula cuando cambia el tema (ThemeContext conmuta la
 * clase `dark` del <html>) Y cuando cambia el acento (AccentContext escribe
 * `--brand-h`/`--brand-c` en el atributo `style` del <html>): por eso el
 * observador mira los DOS atributos.
 */
export function useMapPalette(modo: "auto" | "noche" = "auto"): MapPalette {
  const [paleta, setPaleta] = useState<MapPalette>(() => leerPaleta(modo));

  useEffect(() => {
    let pendiente = 0;
    const recalcular = () => {
      cancelAnimationFrame(pendiente);
      // Un fotograma de margen: el navegador tiene que haber recalculado las
      // variables antes de que la sonda las lea.
      pendiente = requestAnimationFrame(() => {
        // Se devuelve la MISMA referencia cuando nada cambió. El observador
        // salta con cualquier escritura en el `style` del <html> (bloqueos de
        // desplazamiento, medidas de scrollbar…), y sin esta comparación cada
        // una regeneraría los SVG de todos los marcadores del mapa.
        setPaleta((previa) => {
          const nueva = leerPaleta(modo);
          return mismaPaleta(previa, nueva) ? previa : nueva;
        });
      });
    };
    recalcular();
    const obs = new MutationObserver(recalcular);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    return () => { obs.disconnect(); cancelAnimationFrame(pendiente); };
  }, [modo]);

  return paleta;
}

function mismaPaleta(a: MapPalette, b: MapPalette): boolean {
  const claves = Object.keys(a) as Array<keyof MapPalette>;
  return claves.every((k) => a[k] === b[k]);
}

/** La piel de cristal de las chinchetas, sacada de la paleta. */
export function pielDe(p: MapPalette) {
  return {
    placa: p.glassSolid,
    filo: p.hairline,
    filoLuz: p.hairlineLit,
    tinta: p.ink,
    tintaSuave: p.inkSoft,
    tintaSobreColor: p.brandInk,
    oscuro: p.oscuro,
  };
}

/**
 * Huella de la paleta. Sirve de clave de caché de las chinchetas: cuando cambia
 * el tema o el acento cambia la huella y los SVG se regeneran; mientras no
 * cambie, se reutilizan (un marcador redibujado por fotograma es lo que hace que
 * un mapa con 300 vigilantes se arrastre).
 */
export function huella(p: MapPalette): string {
  return `${p.oscuro ? "d" : "l"}${p.brand}${p.canvas}${p.ink}`;
}

/** Sólo el modo oscuro, para quien no necesita la paleta entera. */
export function useIsDark(): boolean {
  const obtener = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const [oscuro, setOscuro] = useState(obtener);
  useEffect(() => {
    const obs = new MutationObserver(() => setOscuro(obtener()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return oscuro;
}
