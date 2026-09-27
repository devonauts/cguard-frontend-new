import { describe, expect, it, vi } from "vitest";

import { crearRafaga } from "./rafaga";

describe("crearRafaga", () => {
  it("diecisiete en el mismo instante salen como UN lote", () => {
    vi.useFakeTimers();
    const lotes: number[][] = [];
    const r = crearRafaga<number>(1200, (l) => lotes.push(l));

    for (let i = 0; i < 17; i++) r.meter(i);
    expect(lotes).toEqual([]);
    vi.advanceTimersByTime(1200);
    expect(lotes.length).toBe(1);
    expect(lotes[0].length).toBe(17);
    vi.useRealTimers();
  });

  it("uno suelto sale solo, y lo siguiente abre otra ventana", () => {
    vi.useFakeTimers();
    const lotes: number[][] = [];
    const r = crearRafaga<number>(1200, (l) => lotes.push(l));

    r.meter(1);
    vi.advanceTimersByTime(1200);
    r.meter(2);
    r.meter(3);
    vi.advanceTimersByTime(1200);
    expect(lotes).toEqual([[1], [2, 3]]);
    vi.useRealTimers();
  });

  it("una lluvia continua no retrasa el primero más de la ventana", () => {
    vi.useFakeTimers();
    const lotes: number[][] = [];
    const r = crearRafaga<number>(1200, (l) => lotes.push(l));

    r.meter(1);
    vi.advanceTimersByTime(1000);
    r.meter(2);
    vi.advanceTimersByTime(200);
    expect(lotes).toEqual([[1, 2]]);
    vi.useRealTimers();
  });

  it("cancelar descarta lo pendiente", () => {
    vi.useFakeTimers();
    const lotes: number[][] = [];
    const r = crearRafaga<number>(1200, (l) => lotes.push(l));

    r.meter(1);
    r.cancelar();
    vi.advanceTimersByTime(5000);
    expect(lotes).toEqual([]);
    vi.useRealTimers();
  });
});
