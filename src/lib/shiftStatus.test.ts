/**
 * Unit tests — QUÉ TURNO CUENTA COMO COBERTURA.
 *
 * Lo que se rompió (Seguridad B.A.S., 2026-09-08): a Edgardo Torres, sacafranco
 * que cubría la noche del 8, se le dio el día libre. El servidor dejó su turno
 * en `absent`, pero la píldora de cobertura del Horario salía de TODOS los
 * turnos sin mirar el estado, así que la casilla del puesto seguía enseñando
 * «N ET». El puesto se veía cubierto y nadie mandó a nadie.
 */

import { describe, it, expect } from "vitest";

import {
  cuentaComoCobertura,
  sigueEnPie,
  esNovedad,
  ESTADOS_ANULADOS,
} from "./shiftStatus";

describe("cuentaComoCobertura", () => {
  it("un turno marcado como ausente NO cubre — es el fallo que se arregla", () => {
    expect(cuentaComoCobertura({ status: "absent" })).toBe(false);
  });

  it("tampoco cubren el anulado ni el trasladado", () => {
    expect(cuentaComoCobertura({ status: "cancelled" })).toBe(false);
    expect(cuentaComoCobertura({ status: "transferred_out" })).toBe(false);
  });

  it("los turnos en pie sí cubren", () => {
    for (const status of ["planned", "covered", "reinforcement", "extension"]) {
      expect(cuentaComoCobertura({ status })).toBe(true);
    }
  });

  it("el acompañamiento NO cubre, aunque esté en pie", () => {
    // Un aprendiz es una persona real que ficha y cobra, y precisamente por eso
    // el estado existe: si el titular falta y sólo aparece él, el puesto está
    // DESCUBIERTO. Este espejo decía que sí cubría.
    expect(cuentaComoCobertura({ status: "training" })).toBe(false);
    // Pero la fila sigue en pie: es su cuadrante, no una anulación.
    expect(sigueEnPie({ status: "training" })).toBe(true);
  });

  it("sin estado cuenta como cobertura — es el turno de siempre", () => {
    // La mayoría de las filas de empresas antiguas no tienen estado. Tratarlas
    // como anuladas las borraría del cuadrante de golpe.
    expect(cuentaComoCobertura({ status: null })).toBe(true);
    expect(cuentaComoCobertura({})).toBe(true);
  });

  it("un estado NUEVO cuenta como cobertura por defecto", () => {
    // Lista negra, no blanca: que algo desaparezca del cuadrante sin que nadie
    // se entere es el fallo caro; que sobre, se ve y se corrige.
    expect(cuentaComoCobertura({ status: "algo_que_aun_no_existe" })).toBe(
      true,
    );
  });

  it("sin turno no hay cobertura", () => {
    expect(cuentaComoCobertura(null)).toBe(false);
    expect(cuentaComoCobertura(undefined)).toBe(false);
  });
});

describe("esNovedad", () => {
  it("separa «no viene» de «el turno ya no existe»", () => {
    // Los tres dejan el puesto vacío, pero sólo `absent` es una persona que
    // estaba programada: es la única que el historial tiene que contar.
    expect(esNovedad({ status: "absent" })).toBe(true);
    expect(esNovedad({ status: "cancelled" })).toBe(false);
    expect(esNovedad({ status: "transferred_out" })).toBe(false);
    expect(esNovedad({ status: "planned" })).toBe(false);
  });

  it("todo lo que es novedad está también entre los anulados", () => {
    expect(ESTADOS_ANULADOS).toContain("absent");
  });
});
