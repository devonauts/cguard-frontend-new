import { describe, expect, it } from "vitest";

import {
  accionesPermitidas,
  debeBuscarEnServidor,
  deHallazgos,
  enOrden,
  filtrar,
  marca,
  moverCursor,
  secciones,
  type Destino,
} from "./buscadorGlobal";

const pagina = (id: string, label: string, contexto?: string): Destino => ({
  id,
  label,
  path: `/${id}`,
  grupo: "menu",
  contexto,
});

describe("buscador ⌘K · ranking", () => {
  it("starts-with beats word-start beats contains; accents and case don't matter", () => {
    expect(marca(pagina("a", "Horario"), "hor")).toBe(0);
    expect(marca(pagina("b", "Mi Horario"), "hor")).toBe(1);
    expect(marca(pagina("c", "Ahorro"), "hor")).toBe(2);
    expect(marca(pagina("d", "Ausencias", "personal"), "pers")).toBe(3);
    expect(marca(pagina("e", "Configuración"), "configuracion")).toBe(0);
    expect(marca(pagina("f", "Nada"), "zz")).toBe(99);
  });

  it("filtrar keeps the menu order among equals and caps", () => {
    const ps = [
      pagina("x", "Turnos A"),
      pagina("y", "Turnos B"),
      pagina("z", "Otros turnos"),
    ];

    expect(filtrar(ps, "tur", 2).map((d) => d.id)).toEqual(["x", "y"]);
    expect(filtrar(ps, "  ", 5)).toEqual([]);
  });
});

describe("buscador ⌘K · sources", () => {
  it("server hits keep their order and drop broken rows", () => {
    const d = deHallazgos([
      {
        kind: "guard",
        id: "1",
        label: "José Pérez",
        detail: "0912",
        path: "/guards/1/resumen",
      },
      { kind: "station", id: "2", label: "", detail: null, path: "/x" },
      {
        kind: "client",
        id: "3",
        label: "Andina",
        detail: null,
        path: "/clients/3/overview",
      },
    ]);

    expect(d.map((x) => x.id)).toEqual(["guard:1", "client:3"]);
    expect(d[0]).toMatchObject({
      grupo: "hallazgo",
      tipo: "guard",
      contexto: "0912",
    });
  });

  it("actions only for who may do them; keywords find them", () => {
    const acc = accionesPermitidas(
      [
        {
          id: "nuevo",
          label: "Nuevo vigilante",
          path: "/personal/nueva?tipo=vigilante",
          permisos: ["securityGuardCreate"],
          claves: ["agregar", "crear"],
        },
        {
          id: "horario",
          label: "Ir a Horario",
          path: "/schedule",
          permisos: ["stationRead"],
        },
        { id: "todos", label: "Ayuda", path: "/ayuda" },
      ],
      (p) => p === "stationRead",
    );

    expect(acc.map((a) => a.id)).toEqual(["accion:horario", "accion:todos"]);
    const conCrear = accionesPermitidas(
      [
        {
          id: "nuevo",
          label: "Nuevo vigilante",
          path: "/n",
          permisos: ["securityGuardCreate"],
          claves: ["agregar"],
        },
      ],
      () => true,
    );

    expect(filtrar(conCrear, "agreg", 3)).toHaveLength(1);
  });

  it("sections: people first, then actions, then pages; each capped", () => {
    const hits = Array.from({ length: 12 }, (_, i) => ({
      kind: "guard" as const,
      id: String(i),
      label: `Garita ${i}`,
      detail: null,
      path: `/g/${i}`,
    }));
    const s = secciones("gar", hits, [], [pagina("p", "Garitas (página)")]);

    expect(s.hallazgos).toHaveLength(8);
    expect(enOrden(s).at(-1)!.id).toBe("p");
  });
});

describe("buscador ⌘K · keyboard", () => {
  it("arrows wrap around and survive an empty list", () => {
    expect(moverCursor(0, 1, 3)).toBe(1);
    expect(moverCursor(2, 1, 3)).toBe(0);
    expect(moverCursor(0, -1, 3)).toBe(2);
    expect(moverCursor(5, 1, 0)).toBe(0);
  });

  it("asks the server from two letters on", () => {
    expect(debeBuscarEnServidor("j")).toBe(false);
    expect(debeBuscarEnServidor(" jo ")).toBe(true);
    expect(debeBuscarEnServidor("é")).toBe(false);
  });
});
