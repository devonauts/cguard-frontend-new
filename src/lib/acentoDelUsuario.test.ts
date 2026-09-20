import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACCENT_DEFAULT,
  CROMA_MAX,
  esMetal,
  mismoAcento,
  muestraDeAcento,
} from "./acentoDelUsuario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL ACABADO METÁLICO — ORO DE VERDAD, NO MOSTAZA
 *
 * Un dorado plano se lee como mostaza. Lo que hace que parezca metal es que la
 * luz REBOTE: un brillo, una banda en sombra, otro destello. Eso es la lámina
 * (`--sheen` en tokens.css), y estas pruebas fijan las tres cosas que la
 * sostienen:
 *
 *   1. LA LÁMINA NO PUEDE DEJAR EL TEXTO ILEGIBLE. La tinta de encima es casi
 *      negra; cada punto de sombra que se añade baja el contraste. Aquí se
 *      RECALCULA sobre los 360 tonos leyendo la lámina del propio CSS, así que
 *      subir la sombra «un poquito para que brille más» rompe la prueba en vez
 *      de romper un botón.
 *   2. `--brand` SIGUE SIENDO UN COLOR PLANO. Media aplicación lo usa como
 *      texto, borde, anillo de foco y parada de gráfico; un degradado ahí no es
 *      un color y esos sitios dejarían de pintar. La lámina va SIEMPRE aparte.
 *   3. APAGADO ES NO HACER NADA. Con el acabado plano las dos variables valen
 *      «nada» y «el acento», y el sistema se comporta igual que antes de que
 *      esto existiera.
 *
 * No hay entorno DOM en las pruebas de este repo, así que lo que toca el <html>
 * se comprueba sobre la fuente — el mismo trato que `WhiteLabelContext.test.ts`.
 * ════════════════════════════════════════════════════════════════════════════
 */

const raiz = path.resolve(__dirname, "../..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

const TOKENS = leer("src/styles/tokens.css");
const GLASS = leer("src/styles/glass.css");
const ACENTO = leer("src/lib/acentoDelUsuario.ts");

/* ── COLOR: lo justo para medir contraste ─────────────────────────────────── */

const aGamma = (v: number) =>
  v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const aLineal = (v: number) =>
  v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);

/** oklch → sRGB lineal, recortado a gamut como hace el navegador. */
function oklchARgb(L: number, C: number, H: number): number[] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.max(0, Math.min(1, v)));
}

const luminancia = (rgb: number[]) =>
  0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

function contraste(a: number[], b: number[]): number {
  const [alto, bajo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);

  return (alto + 0.05) / (bajo + 0.05);
}

/** Composición alfa como la hace el navegador: en sRGB con gamma, no en lineal. */
function componer(base: number[], capa: number[], alfa: number): number[] {
  return base.map((v, i) =>
    aLineal(aGamma(v) * (1 - alfa) + aGamma(capa[i]) * alfa),
  );
}

const NEGRO = [0, 0, 0];
/** `--brand-ink`: oklch(0.16 0 0) en claro, 0.15 en oscuro. El peor es el claro. */
const TINTA = oklchARgb(0.16, 0, 0);

/**
 * La sombra más fuerte de la lámina, leída del CSS.
 *
 * Se busca a propósito en el archivo y no en una constante de aquí: si alguien
 * oscurece una parada para que «brille más», esta prueba lo ve. Los brillos no
 * se miran — aclaran el fondo, así que sólo SUBEN el contraste.
 */
function sombraMaximaDeLaLamina(): number {
  const bloque = TOKENS.slice(
    TOKENS.indexOf("--sheen:"),
    TOKENS.indexOf("--brand-sheen:"),
  );
  const negros = [...bloque.matchAll(/oklch\(0 0 0 \/ ([\d.]+)\)/g)].map((m) =>
    Number(m[1]),
  );

  expect(negros.length, "la lámina tiene que llevar sombras").toBeGreaterThan(
    0,
  );

  return Math.max(...negros);
}

describe("la lámina no puede dejar el texto ilegible", () => {
  const sombra = sombraMaximaDeLaLamina();

  it("la sombra más fuerte no pasa del 18 %", () => {
    /* 0,18 es el ÚLTIMO valor que pasa AA en el peor tono al croma máximo
       (4,69:1); en 0,20 ya se cae a 4,49:1. La lámina usa 0,16 para no ir
       pegada al borde. */
    expect(sombra).toBeLessThanOrEqual(0.18);
  });

  it("el peor de los 360 tonos sigue pasando AA con la sombra encima", () => {
    let peor = { ct: Infinity, h: -1 };

    for (let h = 0; h < 360; h++) {
      // Modo claro (L 0,72), que es el que menos margen tiene de los dos.
      const conSombra = componer(oklchARgb(0.72, 0.16, h), NEGRO, sombra);
      const ct = contraste(conSombra, TINTA);

      if (ct < peor.ct) peor = { ct, h };
    }

    expect(
      peor.ct,
      `el tono ${peor.h}° se queda en ${peor.ct.toFixed(2)}:1 bajo la sombra`,
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("también en el croma máximo que se deja elegir", () => {
    let peor = Infinity;

    for (let h = 0; h < 360; h++) {
      const conSombra = componer(oklchARgb(0.72, CROMA_MAX, h), NEGRO, sombra);

      peor = Math.min(peor, contraste(conSombra, TINTA));
    }

    expect(peor).toBeGreaterThanOrEqual(4.5);
  });
});

describe("el contrato de las dos variables", () => {
  it("`--brand` sigue siendo un color plano, no un degradado", () => {
    /* Es lo que deja que siga valiendo como texto, borde, anillo de foco y
       parada de gráfico. Si algún día alguien mete el degradado aquí, esos
       sitios dejan de pintar sin que nadie vea un error. */
    const decls = [...TOKENS.matchAll(/^\s*--brand:\s*([^;]+);/gm)].map((m) =>
      m[1].trim(),
    );

    expect(decls.length, "claro y oscuro").toBeGreaterThanOrEqual(2);
    for (const d of decls) expect(d).not.toMatch(/gradient/);
  });

  it("apagado es literalmente no hacer nada", () => {
    expect(TOKENS).toMatch(/--brand-sheen:\s*none;/);
    expect(TOKENS).toMatch(/--brand-fill:\s*var\(--brand\);/);
  });

  it("el interruptor enciende las DOS a la vez", () => {
    const i = TOKENS.indexOf(':root[data-acabado="metal"]');

    expect(i, "falta el bloque del acabado metálico").toBeGreaterThan(0);
    const bloque = TOKENS.slice(i, i + 200);

    expect(bloque).toMatch(/--brand-sheen:\s*var\(--sheen\)/);
    expect(bloque).toMatch(/--brand-fill:\s*var\(--sheen\),\s*var\(--brand\)/);
  });

  it("`--sheen` está declarada SIEMPRE, no sólo con el acabado puesto", () => {
    /* Las muestras del selector la necesitan para enseñar cómo quedaría un
       acabado que todavía no está elegido. */
    const iRaiz = TOKENS.indexOf(":root {");
    const iMetal = TOKENS.indexOf(':root[data-acabado="metal"]');

    expect(TOKENS.indexOf("--sheen:")).toBeGreaterThan(iRaiz);
    expect(TOKENS.indexOf("--sheen:")).toBeLessThan(iMetal);
  });
});

describe("el atributo del <html>", () => {
  it("se pone con el acabado y se BORRA sin él", () => {
    /* Si se quedara puesto, pasar de «Oro metálico» a «Violeta» dejaría un
       violeta con lámina: se cambió el color y el acabado se quedó del otro. */
    expect(ACENTO).toMatch(/raiz\.dataset\.acabado = "metal"/);
    expect(ACENTO).toMatch(/delete raiz\.dataset\.acabado/);
  });

  it("va detrás de la guarda que respeta la marca del anfitrión", () => {
    const iGuarda = ACENTO.indexOf("marcaDeAnfitrion");
    const iAtributo = ACENTO.indexOf("raiz.dataset.acabado");

    expect(iGuarda).toBeGreaterThan(0);
    expect(iAtributo).toBeGreaterThan(iGuarda);
  });
});

describe("dónde se pinta la lámina", () => {
  it("las superficies grandes la llevan por `background-image`", () => {
    const i = GLASS.indexOf("EL ACABADO METÁLICO");

    expect(i, "falta el bloque de glass.css").toBeGreaterThan(0);
    const bloque = GLASS.slice(i);

    for (const sel of [".cg-btn-brand", ".brand-fill", ".cgsb-orb.is-on"]) {
      expect(bloque, `falta ${sel}`).toContain(sel);
    }
    expect(bloque).toMatch(/background-image:\s*var\(--brand-sheen\)/);
  });

  it("`.bg-primary` NO entra: la usan puntos de 12 px y la rejilla del Horario", () => {
    /* Es la traducción de `--brand` al vocabulario de Tailwind y por eso apetece
       ponerla, pero quien la usa son los tres puntos de la pantalla de carga, un
       cuadrito de leyenda, un punto de carrusel… y las celdas seleccionadas del
       Horario, que son miles. */
    const bloque = GLASS.slice(GLASS.indexOf("EL ACABADO METÁLICO"));
    const reglas = bloque.slice(bloque.indexOf(":root ."));

    expect(reglas).not.toMatch(/\.bg-primary\b/);
  });

  it("los selectores van colgados de :root para ganarle a la hoja del menú", () => {
    /* `sidebar.tsx` inyecta su CSS al montarse, o sea después de glass.css, y
       usa `background:` a secas — que reinicia la imagen de fondo. */
    const bloque = GLASS.slice(GLASS.indexOf("EL ACABADO METÁLICO"));
    const selectores = [...bloque.matchAll(/^(\.[a-z][^,{\n]*)[,{]/gim)];

    expect(
      selectores.map((m) => m[1]),
      "ningún selector del bloque puede empezar por clase suelta",
    ).toEqual([]);
  });
});

describe("comparar y mostrar acentos", () => {
  const oro = { h: 88, c: 0.18, metal: true };
  const mostaza = { h: 88, c: 0.16 };

  it("el acabado cuenta al comparar", () => {
    expect(mismoAcento(oro, oro)).toBe(true);
    expect(mismoAcento(oro, { ...oro, metal: false })).toBe(false);
    expect(mismoAcento(oro, mostaza)).toBe(false);
  });

  it("dos acentos iguales sin acabado siguen siendo el mismo", () => {
    expect(mismoAcento(mostaza, { h: 88.5, c: 0.162 })).toBe(true);
    expect(mismoAcento(ACCENT_DEFAULT, { ...ACCENT_DEFAULT })).toBe(true);
  });

  it("el de fábrica es plano", () => {
    expect(esMetal(ACCENT_DEFAULT)).toBe(false);
  });

  it("la muestra lleva lámina sólo si el acento la tiene", () => {
    const conLamina = muestraDeAcento(oro, false);
    const sinLamina = muestraDeAcento(mostaza, false);

    expect(conLamina.backgroundImage).toBe("var(--sheen)");
    expect(sinLamina.backgroundImage).toBeUndefined();
    /* El color de debajo es el mismo en los dos casos: el acabado no cambia el
       tono, sólo cómo le da la luz. */
    expect(conLamina.background).toContain("0.18 88");
    expect(sinLamina.background).toContain("0.16 88");
  });

  it("la muestra usa la claridad del sistema, no una inventada", () => {
    expect(muestraDeAcento(mostaza, false).background).toContain("oklch(0.72");
    expect(muestraDeAcento(mostaza, true).background).toContain("oklch(0.78");
  });
});
