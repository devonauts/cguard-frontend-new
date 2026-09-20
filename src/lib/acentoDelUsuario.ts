/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL ACENTO, SIN REACT Y SIN RED
 *
 * Vivía dentro de `AccentContext`, que además habla con la cuenta y por tanto
 * arrastra el cliente de API. Cuando `WhiteLabelContext` necesitó devolverle el
 * acento al usuario tras soltar la variable CSS, ese import se llevó por
 * delante dos suites de pruebas que corren sin `localStorage`.
 *
 * Aquí queda lo que de verdad es: leer una preferencia y escribir dos variables
 * en el <html>. Sin React, sin red y sin estado.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * El acento: tono, croma y ACABADO.
 *
 * `metal` no es un color, es un sí/no: enciende la lámina de brillos y sombras
 * que convierte el relleno plano en metal (la explicación larga, con la
 * medición de contraste, está en `tokens.css`). Se guarda aparte del tono
 * porque es ortogonal — el oro es el tono 88 CON lámina, pero la misma lámina
 * sobre el violeta da violeta pulido.
 */
export type Accent = { h: number; c: number; metal?: boolean };

export const ACCENT_DEFAULT: Accent = { h: 88, c: 0.16 };

export const CLAVE = "cguard-accent";

/** Croma máximo. Por encima, los tonos amarillo/verde se salen de gamut y el
 *  navegador los recorta de forma desigual: dos acentos «igual de saturados»
 *  saldrían con intensidades distintas. */
export const CROMA_MAX = 0.2;

export const acota = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

export function leerGuardado(): Accent {
  try {
    const bruto = localStorage.getItem(CLAVE);

    if (bruto) {
      const v = JSON.parse(bruto);

      if (typeof v?.h === "number" && typeof v?.c === "number") {
        const a: Accent = {
          h: acota(v.h, 0, 360),
          c: acota(v.c, 0, CROMA_MAX),
        };

        if (v.metal === true) a.metal = true;

        return a;
      }
    }
  } catch {}

  return ACCENT_DEFAULT;
}

/** ¿Ha elegido esta persona un acento, o es el de fábrica? */
export function hayAccentElegido(): boolean {
  try {
    const bruto = localStorage.getItem(CLAVE);
    if (!bruto) return false;
    const v = JSON.parse(bruto);
    return typeof v?.h === "number" && typeof v?.c === "number";
  } catch {
    return false;
  }
}

/** Escribe en el <html>. Fuera del ciclo de React a propósito: se llama también
 *  antes del primer render para que no haya un parpadeo con el acento por
 *  defecto. */
export function aplicarAccent(a: Accent) {
  const raiz = document.documentElement;

  /* ── EL DE FÁBRICA NO PISA LA MARCA DE UN ANFITRIÓN ─────────────────────
     Si esta persona NO ha elegido acento y el anfitrión trae el suyo (lo marca
     `WhiteLabelProvider`), se deja el del anfitrión. El acento de fábrica es la
     ausencia de una preferencia, no una preferencia: dejarlo ganar pintaba el
     CRM de un socio con el verde de CGuardPro, y justo antes de entrar, que es
     cuando no hay ningún usuario cuyo gusto respetar.
     Un acento ELEGIDO sigue mandando, que es el orden correcto: la marca
     identifica el producto, el acento es de quien lo usa. */
  if (!hayAccentElegido() && raiz.dataset.marcaDeAnfitrion === "1") return;

  raiz.style.setProperty("--brand-h", String(a.h));
  raiz.style.setProperty("--brand-c", String(a.c));

  /* El acabado es un atributo y no una variable porque lo que cambia no es un
     valor sino QUÉ valen dos variables a la vez (`--brand-sheen` y
     `--brand-fill`); eso en CSS se hace con un selector.

     Y se BORRA cuando está apagado, no se pone a "plano": si se quedara puesto,
     pasar de «Oro metálico» a «Violeta» dejaría un violeta con lámina — se
     cambió el color y el acabado se quedó del anterior. */
  if (a.metal) raiz.dataset.acabado = "metal";
  else delete raiz.dataset.acabado;
}

/** ¿Está encendido el acabado metálico ahora mismo? Lo lee la interfaz para
 *  marcar el conmutador sin volver a pasar por la cuenta. */
export function esMetal(a: Accent): boolean {
  return a.metal === true;
}

/**
 * ¿Son el mismo acento? Lo comparaban a mano tres pantallas —Apariencia, el
 * panel del centro de mando y la guía de estilo— cada una con su copia del
 * mismo `Math.abs(...) < 0.005`, y ninguna miraba el acabado: con el oro puesto,
 * «Mostaza oro» y «Oro metálico» se marcaban las dos como activas.
 */
export function mismoAcento(a: Accent, b: Accent): boolean {
  return (
    Math.abs(a.h - b.h) < 1 &&
    Math.abs(a.c - b.c) < 0.005 &&
    esMetal(a) === esMetal(b)
  );
}

/**
 * Cómo pintar una MUESTRA de un acento que no es el activo — los círculos de
 * color del selector.
 *
 * No puede usar `var(--brand-fill)`, que siempre es el acento en uso: la
 * muestra tiene que enseñar OTRO color. La luminosidad es la misma que usa el
 * sistema (0,72 en claro / 0,78 en oscuro) para que la muestra sea el color de
 * verdad y no una aproximación, y la lámina se toma de `--sheen`, que está
 * declarada siempre — encendida o no — justo para esto.
 *
 * ── DOS PROPIEDADES LARGAS, NUNCA EL ATAJO ─────────────────────────────────
 * La primera versión devolvía `{ background, backgroundImage }` y la lámina
 * DESAPARECÍA al cambiar de color. Cuesta verlo porque al recargar la página
 * sale bien:
 *
 *   · React compara el objeto de estilo con el del render anterior y sólo
 *     escribe lo que cambió.
 *   · Al pasar de un acento a otro cambia `background` pero NO `backgroundImage`
 *     —sigue siendo `var(--sheen)`—, así que React reescribe sólo el atajo.
 *   · Y escribir el ATAJO `background` reinicia `background-image` a `none`.
 *
 * Resultado: la muestra «Metálico» se quedaba plana hasta que alguien recargaba,
 * porque en el primer montaje React sí escribe las dos. Con dos propiedades
 * largas —y un `none` EXPLÍCITO en el caso plano, para que el cambio de ida y
 * de vuelta sea simétrico— no hay atajo que pise nada.
 */
export function muestraDeAcento(
  a: Accent,
  oscuro: boolean,
): { backgroundColor: string; backgroundImage: string } {
  return {
    backgroundColor: `oklch(${oscuro ? 0.78 : 0.72} ${a.c} ${a.h})`,
    backgroundImage: esMetal(a) ? "var(--sheen)" : "none",
  };
}

/**
 * ── DEVOLVER EL ACENTO DESPUÉS DE QUE OTRO SUELTE LA VARIABLE ───────────────
 *
 * `WhiteLabelProvider` escribe `--brand-h` con el tono del anfitrión y, cuando
 * el anfitrión no tiene tono propio, la QUITA para devolver el mando a
 * `tokens.css`. El problema es que quitarla también borra el acento personal si
 * `AccentContext` ya lo había puesto, y los dos escriben en la misma variable
 * desde efectos que corren a destiempo.
 *
 * Medido con marca de tiempo en un navegador limpio: el acento de la cuenta se
 * aplicaba a los 361 ms y la marca blanca lo borraba a los 443 ms. Resultado:
 * quien entraba desde otro equipo veía el CRM con el color de fábrica aunque su
 * elección estuviera guardada en la base — que es exactamente el síntoma de
 * «se queda sólo en localStorage», sin serlo.
 *
 * Quitar la variable y volver a poner la del usuario son la misma operación:
 * «suelto el mando» no puede significar «borro lo tuyo».
 */
export function restaurarAccentDelUsuario(): void {
  if (!hayAccentElegido()) return;
  aplicarAccent(leerGuardado());
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CUANDO EL COLOR DE LA EMPRESA CHOCA CON EL DE LAS ALERTAS
 *
 * Los cuatro colores de estado —todo correcto, advertencia, peligro,
 * informativo— son FIJOS a propósito: un pánico no puede cambiar de color
 * porque a alguien le guste el rojo (ver la nota en `tokens.css`).
 *
 * El efecto secundario es que hay acentos que se parecen tanto a uno de ellos
 * que en pantalla no se distinguen. Medida la paleta contra los cuatro estados,
 * cuatro presets de doce caen dentro de 10°:
 *
 *     Ámbar      →  5° de «advertencia»
 *     Esmeralda  →  5° de «todo correcto»
 *     Carmesí    →  5° de «peligro»
 *     Azul       → 10° de «informativo»
 *
 * Quien elija Carmesí se queda con un CRM donde su marca y «peligro» son el
 * mismo color. No se le prohíbe —es su empresa y su color— pero se le dice.
 * Los deslizadores de ajuste fino son donde más fácil se cae aquí sin querer.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Los tonos de los colores de estado, copiados de `tokens.css`.
 *
 *  Se toman los del MODO CLARO. El oscuro mueve dos de ellos un par de grados
 *  (advertencia 65→70, peligro 27→25) y eso no cambia ningún veredicto: la
 *  distancia a la que se avisa es de 15°. `acentoDelUsuario.test.ts` comprueba
 *  que estos números siguen siendo los del CSS, que es lo que evita que el
 *  aviso se quede obsoleto en silencio si alguien retoca un estado. */
export const TONOS_DE_ESTADO = {
  ok: 150,
  warn: 65,
  bad: 27,
  info: 240,
} as const;

export type ClaveDeEstado = keyof typeof TONOS_DE_ESTADO;

/** A partir de aquí dos colores del mismo croma y claridad se leen como «el
 *  mismo color con otra luz». Por debajo de 15° el aviso sobra: Mostaza está a
 *  23° de advertencia y nadie los confunde. */
export const GRADOS_DE_CHOQUE = 15;

/** Por debajo de este croma el acento es un gris y no se parece a nada. Sin
 *  esta puerta, Acero —que está a 10° del informativo— avisaría, y Acero es
 *  gris: no hay forma de confundirlo con el azul de un aviso. */
export const CROMA_MINIMO_DE_CHOQUE = 0.08;

/** Distancia entre dos tonos por el lado corto de la rueda (0-180). */
export function distanciaDeTono(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;

  return Math.min(d, 360 - d);
}

/**
 * ¿Este acento se confunde con algún color de estado? Devuelve con cuál y a
 * cuántos grados, o `null` si no hay problema.
 */
export function choqueConEstado(
  a: Accent,
): { estado: ClaveDeEstado; grados: number } | null {
  if (a.c < CROMA_MINIMO_DE_CHOQUE) return null;

  let peor: { estado: ClaveDeEstado; grados: number } | null = null;

  for (const clave of Object.keys(TONOS_DE_ESTADO) as ClaveDeEstado[]) {
    const grados = distanciaDeTono(a.h, TONOS_DE_ESTADO[clave]);

    if (grados <= GRADOS_DE_CHOQUE && (!peor || grados < peor.grados)) {
      peor = { estado: clave, grados };
    }
  }

  return peor;
}

/** Tono y croma; el nombre es sólo para la interfaz.
 *  `labelKey` es la clave i18n: este array se evalúa al cargar el módulo, así
 *  que el texto se traduce DONDE SE PINTA (`t(p.labelKey ?? "", p.label)`). */
export const ACCENT_PRESETS: Array<{
  id: string;
  label: string;
  labelKey?: string;
  h: number;
  c: number;
  /** Con lámina metálica. Ver `--sheen` en tokens.css. */
  metal?: boolean;
}> = [
  {
    /* ── ORO DE VERDAD ─────────────────────────────────────────────────────
       Va PRIMERO porque es lo que la gente busca cuando piensa «dorado».

       Mismo tono que el mostaza (88° es exactamente el tono del #FFC800, el oro
       de las paletas) y un croma un punto más alto; lo que lo separa no es el
       color sino el ACABADO. El mostaza plano se queda: hay quien lo prefiere, y
       es el de fábrica desde el principio. */
    id: "oro",
    label: "Oro metálico",
    labelKey: "appearance.accent.oro",
    h: 88,
    c: 0.18,
    metal: true,
  },
  {
    /* ── LA OTRA MITAD DE LA PLACA ─────────────────────────────────────────
       Una placa de seguridad es de oro o de PLATA; tener sólo el oro quedaba
       cojo. No hace falta ningún color nuevo: es el gris azulado del acero con
       la lámina puesta, y sale metal cepillado.

       El croma va a 0,02 y no al 0,04 del Acero para que quede más neutro —la
       plata tira a frío pero no a azul— y de paso los separa el comparador,
       que considera iguales dos acentos a menos de 0,005. */
    id: "plata",
    label: "Plata",
    labelKey: "appearance.accent.plata",
    h: 250,
    c: 0.02,
    metal: true,
  },
  {
    id: "mostaza",
    label: "Mostaza oro",
    labelKey: "appearance.accent.mostaza",
    h: 88,
    c: 0.16,
  },
  {
    id: "ambar",
    label: "Ámbar",
    labelKey: "appearance.accent.ambar",
    h: 70,
    c: 0.16,
  },
  {
    id: "lima",
    label: "Lima",
    labelKey: "appearance.accent.lima",
    h: 125,
    c: 0.16,
  },
  {
    id: "esmeralda",
    label: "Esmeralda",
    labelKey: "appearance.accent.esmeralda",
    h: 155,
    c: 0.15,
  },
  {
    /* ── EL ÚNICO HUECO DE TONO QUE QUEDABA ────────────────────────────────
       Medida la rueda entera, entre Esmeralda (155°) y Cian (205°) había 50°
       vacíos — el hueco más grande de la paleta. Y es el único sitio libre que
       además no se parece a ningún color de estado: queda a 35° del verde de
       «todo correcto».

       Croma 0,12 y no más: a 0,13 el turquesa se sale del sRGB y el navegador
       lo recorta, que es como dos pantallas enseñan colores distintos. */
    id: "turquesa",
    label: "Turquesa",
    labelKey: "appearance.accent.turquesa",
    h: 185,
    c: 0.12,
  },
  {
    id: "cian",
    label: "Cian",
    labelKey: "appearance.accent.cian",
    h: 205,
    c: 0.14,
  },
  {
    id: "azul",
    label: "Azul",
    labelKey: "appearance.accent.azul",
    h: 250,
    c: 0.15,
  },
  {
    id: "violeta",
    label: "Violeta",
    labelKey: "appearance.accent.violeta",
    h: 295,
    c: 0.16,
  },
  {
    id: "magenta",
    label: "Magenta",
    labelKey: "appearance.accent.magenta",
    h: 340,
    c: 0.16,
  },
  {
    id: "carmesi",
    label: "Carmesí",
    labelKey: "appearance.accent.carmesi",
    h: 22,
    c: 0.17,
  },
  {
    id: "acero",
    label: "Acero",
    labelKey: "appearance.accent.acero",
    h: 250,
    c: 0.04,
  },
];
