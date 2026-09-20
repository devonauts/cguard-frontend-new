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
 */
export function muestraDeAcento(
  a: Accent,
  oscuro: boolean,
): { background: string; backgroundImage?: string } {
  const plano = `oklch(${oscuro ? 0.78 : 0.72} ${a.c} ${a.h})`;

  return esMetal(a)
    ? { background: plano, backgroundImage: "var(--sheen)" }
    : { background: plano };
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
