import { describe, expect, it } from "vitest";

import { filasDe, listarTodo, todosLosVigilantes, turnosEntre } from "./listarCompleto";

const roster = Array.from({ length: 1240 }, (_, i) => ({ guardId: `u${i}`, label: `V ${i}` }));

/** A server that honours limit/offset. */
const servidor = (url: string) => {
  const q = new URL(url, "http://x").searchParams;
  const limit = Number(q.get("limit"));
  const offset = Number(q.get("offset") || 0);

  return Promise.resolve(roster.slice(offset, offset + limit));
};

describe("no silent caps · listarCompleto", () => {
  it("walks the whole roster, past the old 200", async () => {
    const out = await todosLosVigilantes("t", { get: servidor, pagina: 500 });

    expect(out).toHaveLength(1240);
    expect(new Set(out.map((g) => g.guardId)).size).toBe(1240);
  });

  it("an old server that ignores offset does not loop forever", async () => {
    let llamadas = 0;
    const out = await todosLosVigilantes("t", {
      pagina: 100,
      get: () => {
        llamadas += 1;

        return Promise.resolve(roster.slice(0, 100));
      },
    });

    expect(out).toHaveLength(100);
    expect(llamadas).toBe(2);
  });

  it("listarTodo stops at count and keeps the total", async () => {
    const filas = Array.from({ length: 1001 }, (_, i) => ({ id: i }));
    const res = await listarTodo(({ limit, offset }) =>
      Promise.resolve({ rows: filas.slice(offset, offset + limit), count: filas.length }), { pagina: 500 });

    expect(res.rows).toHaveLength(1001);
    expect(res.count).toBe(1001);
  });

  it("turnosEntre asks the server for the window and the guard, not 999 rows of everyone", async () => {
    const urls: string[] = [];
    await turnosEntre("t", "2026-11-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z", {
      guardId: "g1",
      get: (u) => {
        urls.push(u);

        return Promise.resolve({ rows: [], count: 0 });
      },
    });
    const q = new URL(urls[0], "http://x").searchParams;

    expect(q.get("filter[guard]")).toBe("g1");
    expect(q.get("filter[startTimeRange][0]")).toBe("2026-11-01T00:00:00.000Z");
    expect(q.get("limit")).toBe("1000");
  });

  it("filasDe unwraps every shape the API uses", () => {
    expect(filasDe([1])).toEqual([1]);
    expect(filasDe({ rows: [2] })).toEqual([2]);
    expect(filasDe({ data: [3] })).toEqual([3]);
    expect(filasDe({ data: { rows: [4] } })).toEqual([4]);
    expect(filasDe(null)).toEqual([]);
  });
});
