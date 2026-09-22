import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA MEDICIÓN DEL SOCIO NO PUEDE SER UNA VÍA DE ENTRADA
 *
 * Lo que se guarda es un identificador, pero acaba dentro de la URL de un
 * `<script>` que sirve NUESTRO anfitrión. Esto fija las dos cosas que no pueden
 * fallar: que sólo se carga lo que tiene forma de identificador de Google, y
 * que nunca se carga dos veces — un embudo con los números al doble parece que
 * funciona, y eso es peor que uno vacío.
 *
 * ── SIN JSDOM, A PROPÓSITO ────────────────────────────────────────────────
 * El CRM no lo usa y no se le añade una dependencia por una prueba. El módulo
 * toca cuatro cosas del navegador —`createElement`, `head.appendChild`,
 * `dataLayer` y `gtag`—, así que se simulan esas cuatro y nada más. Un doble
 * que implementa de más se comporta distinto del navegador justo donde nadie
 * mira.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface ScriptFalso { src: string; async: boolean }

function montarNavegador(): ScriptFalso[] {
  const puestos: ScriptFalso[] = [];
  (globalThis as any).document = {
    createElement: () => ({ src: "", async: false } as ScriptFalso),
    head: { appendChild: (s: ScriptFalso) => { puestos.push(s); } },
  };
  (globalThis as any).window = {};
  return puestos;
}

/**
 * Se reimporta en cada prueba porque el módulo RECUERDA lo ya cargado —esa
 * memoria es justo lo que impide cargar dos veces— y sin reiniciarla la segunda
 * prueba heredaría lo que hizo la primera. `vi.resetModules()` en `beforeEach`
 * es lo que lo hace posible.
 */
async function modulo() {
  return import("./analiticaDelSocio");
}

describe("la medición del socio", () => {
  let puestos: ScriptFalso[];

  beforeEach(() => {
    vi.resetModules();
    puestos = montarNavegador();
  });

  it("sin identificadores no carga nada", async () => {
    const { cargarAnaliticaDelSocio } = await modulo();
    cargarAnaliticaDelSocio({ ga4: null, gtm: null });
    expect(puestos).toHaveLength(0);
  });

  it("y con el contexto de plataforma tampoco", async () => {
    const { cargarAnaliticaDelSocio } = await modulo();
    cargarAnaliticaDelSocio(null);
    expect(puestos).toHaveLength(0);
  });

  it("carga GA4 cuando hay uno, y con su identificador en la URL", async () => {
    const { cargarAnaliticaDelSocio } = await modulo();
    cargarAnaliticaDelSocio({ ga4: "G-ABC1234567", gtm: null });
    expect(puestos).toHaveLength(1);
    expect(puestos[0].src).toContain("id=G-ABC1234567");
    expect(puestos[0].src.startsWith("https://www.googletagmanager.com/")).toBe(true);
  });

  it("carga GTM cuando hay uno", async () => {
    const { cargarAnaliticaDelSocio } = await modulo();
    cargarAnaliticaDelSocio({ ga4: null, gtm: "GTM-ABC1234" });
    expect(puestos[0].src).toContain("gtm.js?id=GTM-ABC1234");
  });

  it("NO lo carga dos veces aunque se vuelva a aplicar la marca", async () => {
    const { cargarAnaliticaDelSocio } = await modulo();
    cargarAnaliticaDelSocio({ ga4: "G-ABC1234567", gtm: null });
    cargarAnaliticaDelSocio({ ga4: "G-ABC1234567", gtm: null });
    expect(puestos.filter((s) => s.src.includes("G-ABC1234567"))).toHaveLength(1);
  });

  it("los eventos usan los nombres que GA4 ya entiende", async () => {
    /* `sign_up` y `purchase` son eventos RECOMENDADOS: con ellos los informes
       de conversión salen solos. Con nombres inventados, cada socio tendría que
       configurarlos a mano y los informes estándar saldrían vacíos. */
    const { EVENTOS } = await modulo();
    expect(EVENTOS.registro).toBe("sign_up");
    expect(EVENTOS.compra).toBe("purchase");
    expect(EVENTOS.inicioDePago).toBe("begin_checkout");
  });

  it("medir sin medición configurada no rompe ni acumula una cola muerta", async () => {
    const { medir, EVENTOS } = await modulo();
    expect(() => medir(EVENTOS.compra)).not.toThrow();
    expect((globalThis as any).window.dataLayer).toBeUndefined();
  });

  it("medir con la cola puesta manda el evento", async () => {
    const { cargarAnaliticaDelSocio, medir } = await modulo();
    cargarAnaliticaDelSocio({ ga4: "G-XYZ9876543", gtm: null });
    medir("sign_up", { method: "email" });
    expect(((globalThis as any).window.dataLayer as unknown[]).length).toBeGreaterThan(0);
  });

  it("un fallo del navegador no tumba la pantalla que lo llamó", async () => {
    const { cargarAnaliticaDelSocio } = await modulo();
    (globalThis as any).document.head.appendChild = () => { throw new Error("bloqueador"); };
    expect(() => cargarAnaliticaDelSocio({ ga4: "G-ABC1234567", gtm: null })).not.toThrow();
  });
});
