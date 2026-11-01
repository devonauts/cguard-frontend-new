import { describe, expect, it } from "vitest";

import {
  accionesPermitidas,
  debeBuscarEnServidor,
  deHallazgos,
  enOrden,
  filtrar,
  gruposQueFaltan,
  inicioDeSeccion,
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

describe("buscador ⌘K · vehicles and incidents (phase 4)", () => {
  const hit = (kind: any, i: number, extra: any = {}) => ({
    kind,
    id: String(i),
    label: `${kind} ${i}`,
    detail: null,
    path: `/${kind}/${i}`,
    ...extra,
  });

  it("each kind goes to its own section, capped, in the server's order", () => {
    const hits = [
      ...Array.from({ length: 3 }, (_, i) => hit("guard", i)),
      ...Array.from({ length: 7 }, (_, i) => hit("vehicle", i)),
      ...Array.from({ length: 9 }, (_, i) =>
        hit("incident", i, {
          at: `2026-10-${String(20 - i).padStart(2, "0")}T12:00:00.000Z`,
        }),
      ),
    ];
    const s = secciones("x", hits, [], [pagina("p", "x página")]);

    expect(s.hallazgos.map((d) => d.tipo)).toEqual(["guard", "guard", "guard"]);
    expect(s.vehiculos).toHaveLength(5);
    expect(s.incidentes).toHaveLength(6);
    expect(s.incidentes[0]).toMatchObject({
      id: "incident:0",
      cuando: "2026-10-20T12:00:00.000Z",
    });
    // Keyboard order = display order: people, vehicles, incidents, actions, pages.
    const orden = enOrden(s).map((d) => d.tipo ?? d.grupo);

    expect(orden.slice(0, 3)).toEqual(["guard", "guard", "guard"]);
    expect(orden[3]).toBe("vehicle");
    expect(orden[8]).toBe("incident");
    expect(orden.at(-1)).toBe("menu");
    expect(inicioDeSeccion(s, "hallazgos")).toBe(0);
    expect(inicioDeSeccion(s, "vehiculos")).toBe(3);
    expect(inicioDeSeccion(s, "incidentes")).toBe(8);
    expect(inicioDeSeccion(s, "paginas")).toBe(14);
  });

  it("says which groups the role can't search; unknown says nothing", () => {
    expect(gruposQueFaltan(["people", "places"])).toEqual([
      "vehicles",
      "incidents",
    ]);
    expect(gruposQueFaltan([])).toHaveLength(4);
    expect(
      gruposQueFaltan(["people", "places", "vehicles", "incidents"]),
    ).toEqual([]);
    expect(gruposQueFaltan(null)).toEqual([]);
    expect(gruposQueFaltan(undefined)).toEqual([]);
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
