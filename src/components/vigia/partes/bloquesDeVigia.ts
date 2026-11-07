/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL TEXTO DE VIGIA, EN BLOQUES
 *
 * El modelo contesta en texto plano (el prompt le pide «sin markdown»), pero
 * con forma: párrafos, viñetas con «·» o «•», y listas de cifras del tipo
 * «· Clientes: 0». Pintado tal cual, con `white-space: pre-wrap`, parecía una
 * terminal (2026-11-06, «parece de los 80s»).
 *
 * Esto lo parte en bloques que la burbuja dibuja con su propio estilo:
 *   parrafo   texto corrido (con **negritas** si se colaron)
 *   titulo    una línea corta que termina en «:» y presenta lo que sigue
 *   lista     viñetas sueltas
 *   cifras    dos o más viñetas «Etiqueta: número» seguidas → cuadrícula
 *
 * Puro y sin React: se prueba solo (bloquesDeVigia.test.ts).
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface Cifra {
  etiqueta: string;
  valor: string;
  /** El número, para atenuar los ceros; null si no se pudo leer. */
  numero: number | null;
}

export type Bloque =
  | { tipo: "parrafo"; texto: string }
  | { tipo: "titulo"; texto: string }
  | { tipo: "lista"; items: string[] }
  | { tipo: "cifras"; items: Cifra[] };

const VINETA = /^\s*(?:[·•▪◦‣]|[-*](?=\s))\s*/;
// «Etiqueta: 12», «Etiqueta (aprox.): 3», «Etiqueta: 45 %», «Etiqueta: 1.234»
const CIFRA = /^(.{2,60}?)\s*:\s*([0-9][0-9.,]*\s*%?)\s*$/;

function numeroDe(valor: string): number | null {
  const limpio = valor.replace(/[%\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(limpio);

  return Number.isFinite(n) ? n : null;
}

/** «**hola**» y «*hola*» sin los asteriscos (se marcan aparte al pintar). */
export function limpiarResto(t: string): string {
  return t
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^#{1,4}\s+/gm, "");
}

export function partirMensaje(texto: string): Bloque[] {
  const lineas = limpiarResto(String(texto || "")).replace(/\r/g, "").split("\n");
  const bloques: Bloque[] = [];
  let parrafo: string[] = [];
  let vinetas: string[] = [];

  const cerrarParrafo = () => {
    if (parrafo.length) bloques.push({ tipo: "parrafo", texto: parrafo.join(" ").trim() });
    parrafo = [];
  };
  const cerrarVinetas = () => {
    if (!vinetas.length) return;
    const cifras = vinetas.map((v) => CIFRA.exec(v));

    if (vinetas.length >= 2 && cifras.every(Boolean)) {
      bloques.push({
        tipo: "cifras",
        items: cifras.map((m) => ({
          etiqueta: m![1].trim(),
          valor: m![2].trim(),
          numero: numeroDe(m![2]),
        })),
      });
    } else {
      bloques.push({ tipo: "lista", items: vinetas });
    }
    vinetas = [];
  };

  for (const cruda of lineas) {
    const linea = cruda.trim();

    if (!linea) {
      cerrarParrafo();
      cerrarVinetas();
      continue;
    }
    if (VINETA.test(cruda)) {
      cerrarParrafo();
      vinetas.push(linea.replace(VINETA, "").trim());
      continue;
    }
    cerrarVinetas();
    // Una línea corta que termina en «:» y no es una frase larga: título de sección.
    if (/:\s*$/.test(linea) && linea.length <= 60 && !parrafo.length) {
      bloques.push({ tipo: "titulo", texto: linea.replace(/:\s*$/, "") });
      continue;
    }
    parrafo.push(linea);
  }
  cerrarParrafo();
  cerrarVinetas();

  return bloques;
}

/** Trozos de una línea: texto normal y **negritas**. */
export function partirNegritas(t: string): Array<{ texto: string; negrita: boolean }> {
  const out: Array<{ texto: string; negrita: boolean }> = [];
  const re = /\*\*(.+?)\*\*|(^|[\s(])\*([^*\n]+)\*(?=[\s.,;:!?)]|$)/g;
  let desde = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(t))) {
    const inicio = m.index + (m[2] ? m[2].length : 0);

    if (inicio > desde) out.push({ texto: t.slice(desde, inicio), negrita: false });
    out.push({ texto: m[1] ?? m[3], negrita: true });
    desde = m.index + m[0].length;
  }
  if (desde < t.length) out.push({ texto: t.slice(desde), negrita: false });

  return out.length ? out : [{ texto: t, negrita: false }];
}
