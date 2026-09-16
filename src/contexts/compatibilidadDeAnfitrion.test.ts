import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { compatibilidad } from "./compatibilidadDeAnfitrion";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ETAPA E.1 · LA EMPRESA DE A NUNCA SE PINTA CON LA MARCA DE B
 *
 * La regla que de verdad importa es la última: ante cualquier duda se pinta la
 * marca de la plataforma. Es la única que no le cuenta nada a nadie sobre un
 * tercero.
 *
 * Y la que no puede romperse nunca: NADA de aquí niega el acceso. El anfitrión
 * no es una credencial.
 * ════════════════════════════════════════════════════════════════════════════
 */

const PLATAFORMA = { resellerPublicId: null };
const ANF_A = { resellerPublicId: "RSL-AAAA" };
const ANF_B = { resellerPublicId: "RSL-BBBB" };

const directa = { billingOwnership: "direct", resellerPublicId: null };
const deA = { billingOwnership: "reseller", resellerPublicId: "RSL-AAAA" };
const deB = { billingOwnership: "reseller", resellerPublicId: "RSL-BBBB" };

describe("Etapa E.1 · compatibilidad empresa ↔ anfitrión", () => {
  it("empresa DIRECTA en el anfitrión de plataforma → plataforma", () => {
    const v = compatibilidad(directa, PLATAFORMA);
    expect(v.identidad).toBe("plataforma");
    expect(v.desajuste).toBe(false);
  });

  it("empresa de un SOCIO en SU anfitrión → la marca del socio", () => {
    const v = compatibilidad(deA, ANF_A);
    expect(v.identidad).toBe("socio");
    expect(v.desajuste).toBe(false);
    expect(v.motivo).toBe("coinciden");
  });

  it("LA QUE IMPORTA · empresa DIRECTA en el anfitrión de un socio → NUNCA la del socio", () => {
    const v = compatibilidad(directa, ANF_A);
    expect(v.identidad).toBe("plataforma");
    expect(v.motivo).toBe("empresa-directa-en-anfitrion-de-socio");
  });

  it("LA QUE MÁS IMPORTA · empresa de A en el anfitrión de B → plataforma, y se marca el desajuste", () => {
    const v = compatibilidad(deA, ANF_B);
    expect(v.identidad).toBe("plataforma");
    expect(v.desajuste).toBe(true);
    expect(v.motivo).toBe("socios-distintos");
    // Y al revés, por si la comparación fuera en un solo sentido.
    expect(compatibilidad(deB, ANF_A).identidad).toBe("plataforma");
  });

  it("empresa de un socio en el anfitrión de plataforma → plataforma (política escrita)", () => {
    const v = compatibilidad(deA, PLATAFORMA);
    expect(v.identidad).toBe("plataforma");
    expect(v.desajuste).toBe(false);
    expect(v.motivo).toBe("empresa-de-socio-en-anfitrion-de-plataforma");
  });

  it("una empresa de socio SIN referencia pública no se da por buena", () => {
    /* No poder comprobar que coinciden no es haber comprobado que coinciden. */
    const v = compatibilidad({ billingOwnership: "reseller", resellerPublicId: null }, ANF_A);
    expect(v.identidad).toBe("plataforma");
    expect(v.desajuste).toBe(true);
  });

  it("valores FORJADOS desde el navegador no consiguen la marca ajena", () => {
    /* Lo que un atacante controlaría en el cliente son formas raras del campo.
       Ninguna puede producir «socio» contra un anfitrión que no es el suyo. */
    const forjados: any[] = [
      { billingOwnership: "reseller", resellerPublicId: "RSL-AAAA " },   // espacio
      { billingOwnership: "reseller", resellerPublicId: "rsl-aaaa" },    // minúsculas
      { billingOwnership: "RESELLER", resellerPublicId: { toString: () => "RSL-AAAA" } },
      { billingOwnership: "reseller", resellerPublicId: ["RSL-AAAA"] },
      { billingOwnership: "reseller", resellerPublicId: 0 },
      { billingOwnership: "reseller", resellerPublicId: true },
    ];
    for (const e of forjados) {
      expect(compatibilidad(e, ANF_B).identidad).toBe("plataforma");
    }
  });

  it("una empresa ausente o vacía no revienta ni concede nada", () => {
    for (const e of [null, undefined, {} as any]) {
      expect(compatibilidad(e, ANF_A).identidad).toBe("plataforma");
    }
  });

  it("un anfitrión de socio SIN referencia no pinta marca de socio", () => {
    const v = compatibilidad(deA, { resellerPublicId: null });
    expect(v.identidad).toBe("plataforma");
  });

  it("un anfitrión desconocido (plataforma) nunca hereda la marca de nadie", () => {
    for (const e of [directa, deA, deB]) {
      expect(compatibilidad(e, PLATAFORMA).identidad).toBe("plataforma");
    }
  });

  it("NINGÚN camino niega el acceso — esto sólo elige rótulo", () => {
    /* El veredicto no tiene forma de decir «no pasas». Si alguien añadiera un
       estado de denegación, esta prueba obliga a pensárselo dos veces: el
       anfitrión no puede convertirse en una credencial. */
    const todos = [
      compatibilidad(directa, PLATAFORMA), compatibilidad(directa, ANF_A),
      compatibilidad(deA, ANF_A), compatibilidad(deA, ANF_B),
      compatibilidad(deA, PLATAFORMA),
    ];
    for (const v of todos) {
      expect(["plataforma", "socio"]).toContain(v.identidad);
      expect(Object.keys(v).sort()).toEqual(["desajuste", "identidad", "motivo"]);
    }
  });

  it("la FUENTE no lee nada del navegador", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "./compatibilidadDeAnfitrion.ts"), "utf8",
    );
    for (const prohibido of [
      "localStorage", "sessionStorage", "location.search", "URLSearchParams",
      "document.cookie", "x-reseller", "window.location",
    ]) {
      expect(src.toLowerCase()).not.toContain(prohibido.toLowerCase());
    }
  });
});
