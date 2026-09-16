import { describe, it, expect, vi } from "vitest";

import { enLotes } from "./enLotes";

/** Una tarea que se puede resolver a mano, para observar cuántas hay en vuelo. */
function diferida<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => {
    resolver = res;
    rechazar = rej;
  });

  return { promesa, resolver, rechazar };
}

describe("enLotes", () => {
  it("nunca tiene más de `limite` peticiones en vuelo", async () => {
    let enVuelo = 0;
    let pico = 0;

    const items = Array.from({ length: 50 }, (_, i) => i);
    const res = await enLotes(
      items,
      async (n) => {
        enVuelo++;
        pico = Math.max(pico, enVuelo);
        await new Promise((r) => setTimeout(r, 1));
        enVuelo--;

        return n * 2;
      },
      6,
    );

    expect(pico).toBeLessThanOrEqual(6);
    expect(res).toHaveLength(50);
    expect(res[7]).toEqual({ status: "fulfilled", value: 14 });
  });

  it("respeta el orden de los resultados aunque acaben desordenados", async () => {
    const res = await enLotes(
      [30, 10, 20],
      async (ms) => {
        await new Promise((r) => setTimeout(r, ms));

        return ms;
      },
      3,
    );

    expect(res.map((r) => (r as PromiseFulfilledResult<number>).value)).toEqual([
      30, 10, 20,
    ]);
  });

  it("un fallo no cancela a los demás — como allSettled", async () => {
    const res = await enLotes(
      [1, 2, 3],
      async (n) => {
        if (n === 2) throw new Error("boom");

        return n;
      },
      2,
    );

    expect(res[0].status).toBe("fulfilled");
    expect(res[1].status).toBe("rejected");
    expect(res[2].status).toBe("fulfilled");
  });

  it("arranca sólo tantos trabajadores como items haya", async () => {
    const fn = vi.fn().mockResolvedValue(null);

    await enLotes([1, 2], fn, 10);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("una lista vacía no lanza nada", async () => {
    const fn = vi.fn();

    expect(await enLotes([], fn, 6)).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("de verdad hace ESPERAR: con limite 1 la segunda no empieza hasta que acaba la primera", async () => {
    const a = diferida<string>();
    const b = diferida<string>();
    const empezadas: number[] = [];

    const corriendo = enLotes(
      [a, b],
      async (d, i) => {
        empezadas.push(i);

        return d.promesa;
      },
      1,
    );

    await Promise.resolve();
    expect(empezadas).toEqual([0]); // la segunda ni se ha tocado

    a.resolver("ok");
    await Promise.resolve();
    await Promise.resolve();
    expect(empezadas).toEqual([0, 1]);

    b.resolver("ok");
    await corriendo;
  });
});
