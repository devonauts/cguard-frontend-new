import { beforeAll, describe, expect, it } from "vitest";

import es from "../locales/es.json";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EN EL CRM DE UN SOCIO NO SE ESCRIBE EL NOMBRE DE NUESTRO ASISTENTE
 *
 * «VigIA» estaba escrito a mano en diez cadenas del catálogo y en el escudo de
 * la burbuja. El cliente de un socio veía el nombre del proveedor de su
 * proveedor en la esquina de todas las pantallas, dentro de un producto que se
 * le vende como propio.
 *
 * Ahora esas cadenas llevan `{{agente}}` y cada pantalla le pasa el nombre que
 * el servidor resuelve por la EMPRESA. En una empresa nuestra sale «VigIA» y no
 * cambia nada; en la de un socio, el suyo.
 *
 * ── SIN JSDOM, IGUAL QUE SU VECINA ────────────────────────────────────────
 * El CRM no lo usa y no se le añade una dependencia por una prueba. El módulo
 * arrastra el cliente de API, que lee `localStorage` al cargarse, así que se le
 * pone un doble mínimo y se importa DESPUÉS. Ver `analiticaDeMarca.test.ts`.
 * ════════════════════════════════════════════════════════════════════════════
 */

let siglaDelAgente: (n: string) => string;
let AGENTE_POR_DEFECTO: { nombre: string };

beforeAll(async () => {
  const almacen = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (almacen.has(k) ? almacen.get(k)! : null),
    setItem: (k: string, v: string) => { almacen.set(k, String(v)); },
    removeItem: (k: string) => { almacen.delete(k); },
    clear: () => almacen.clear(),
  };
  const mod = await import("./agenteDeMarca");
  siglaDelAgente = mod.siglaDelAgente;
  AGENTE_POR_DEFECTO = mod.AGENTE_POR_DEFECTO;
});

function cadenasCon(objeto: unknown, patron: RegExp, ruta = ""): string[] {
  if (typeof objeto === "string") return patron.test(objeto) ? [ruta] : [];
  if (objeto && typeof objeto === "object") {
    return Object.entries(objeto as Record<string, unknown>).flatMap(([k, v]) =>
      cadenasCon(v, patron, ruta ? `${ruta}.${k}` : k),
    );
  }
  return [];
}

describe("el catálogo no nombra a nuestro asistente", () => {
  it("ninguna cadena escribe «VigIA»", () => {
    const culpables = cadenasCon(es, /VigIA/i);

    expect(
      culpables,
      "estas cadenas enseñan el nombre de NUESTRO asistente en el CRM de un socio",
    ).toEqual([]);
  });

  it("las cadenas del asistente llevan la ranura, no el nombre", () => {
    /* La lista concreta: si alguien añade una cadena nueva bajo `vigia.` que
       nombre al asistente sin ranura, la prueba de arriba la caza. Ésta fija
       que las que YA la llevan no la pierdan en una retraducción. */
    const conRanura = cadenasCon(es, /\{\{agente\}\}/);

    expect(conRanura).toContain("vigia.placeholder");
    expect(conRanura).toContain("vigia.openAria");
    expect(conRanura).toContain("vigia.working");
    expect(conRanura.length).toBeGreaterThanOrEqual(8);
  });
});

describe("la sigla del escudo", () => {
  it("un nombre corto cabe entero", () => {
    expect(siglaDelAgente("VigIA")).toBe("VigIA");
    expect(siglaDelAgente("Ana")).toBe("Ana");
    expect(siglaDelAgente("Sentry")).toBe("Sentry");
  });

  it("uno largo de varias palabras se hace siglas", () => {
    expect(siglaDelAgente("Sentinel Inteligencia Operativa")).toBe("SIO");
    expect(siglaDelAgente("Sentinel IA")).toBe("SI");
  });

  it("uno largo de una sola palabra se queda en tres letras, con su caja", () => {
    /* «SEN» en versalitas se lee peor que «Sen» cuando el nombre era
       «Sentinel»: la sigla tiene que parecer una marca, no un error. */
    expect(siglaDelAgente("Sentinela")).toBe("Sen");
  });

  it("nunca devuelve vacío: un escudo en blanco es un producto roto", () => {
    expect(siglaDelAgente("")).toBe(AGENTE_POR_DEFECTO.nombre);
    expect(siglaDelAgente("   ")).toBe(AGENTE_POR_DEFECTO.nombre);
  });

  it("no se descuadra con espacios de más", () => {
    expect(siglaDelAgente("  Sentinel   Security  IA ")).toBe("SSI");
  });

  it("se queda en tres letras como mucho, quepa lo que quepa", () => {
    expect(siglaDelAgente("Uno Dos Tres Cuatro Cinco").length).toBeLessThanOrEqual(3);
  });
});
