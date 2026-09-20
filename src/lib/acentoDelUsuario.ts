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

export type Accent = { h: number; c: number };

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
        return { h: acota(v.h, 0, 360), c: acota(v.c, 0, CROMA_MAX) };
      }
    }
  } catch {}

  return ACCENT_DEFAULT;
}

/** Escribe en el <html>. Fuera del ciclo de React a propósito: se llama también
 *  antes del primer render para que no haya un parpadeo con el acento por
 *  defecto. */
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
