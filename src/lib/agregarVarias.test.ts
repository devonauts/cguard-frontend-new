import { describe, expect, it } from "vitest";

import {
  buscarPlaza,
  buscarPuestoSup,
  buscarRol,
  claveDeDocumento,
  fechaDeCelda,
  leerEncabezado,
  leerFilas,
  normalizar,
  partirTabla,
  plantillaCsv,
  prepararFilas,
  revisarFilas,
  tipoDeCelda,
  type Catalogos,
  type PlazaDeLista,
} from "./agregarVarias";

const plazas: PlazaDeLista[] = [
  {
    stationId: "s1",
    positionId: "p1",
    puesto: "Charlie 3 · Estacionamiento",
    plaza: "Fijo 1",
    libres: 1,
    sinRotacion: false,
  },
  {
    stationId: "s1",
    positionId: "p2",
    puesto: "Charlie 3 · Estacionamiento",
    plaza: "Fijo 2",
    libres: 1,
    sinRotacion: false,
  },
  {
    stationId: "s2",
    positionId: "p3",
    puesto: "Alfa 1 · Acceso principal",
    plaza: "Fijo 1",
    libres: 0,
    sinRotacion: false,
  },
  {
    stationId: "s3",
    positionId: "p4",
    puesto: "Delta · Bodega",
    plaza: "Fijo 1",
    libres: 1,
    sinRotacion: true,
  },
];
const cat: Catalogos = {
  plazas,
  puestos: [
    {
      id: "sp1",
      titulo: "Aguila1 · Quito Norte",
      libre: true,
      sinRotacion: false,
    },
    { id: "sp2", titulo: "Halcón · Sur", libre: true, sinRotacion: true },
  ],
  roles: [
    { id: "r-asis", nombres: ["Asistente Administrativo", "assistant"] },
    { id: "r-desp", nombres: ["Despachador", "dispatcher"] },
  ],
};

describe("partirTabla", () => {
  it("reads a paste from Excel (tabs)", () => {
    expect(partirTabla("Tipo\tNombres\nVigilante\tLuis\n\n")).toEqual([
      ["Tipo", "Nombres"],
      ["Vigilante", "Luis"],
    ]);
  });
  it("reads a Spanish CSV with «;», quotes and a BOM", () => {
    const csv =
      '﻿Tipo;Nombres;Puesto\r\nVigilante;"Ortega; Luis";"Charlie 3 · ""Fijo"" 1"\r\n';

    expect(partirTabla(csv)).toEqual([
      ["Tipo", "Nombres", "Puesto"],
      ["Vigilante", "Ortega; Luis", 'Charlie 3 · "Fijo" 1'],
    ]);
  });
  it("reads a comma CSV", () => {
    expect(partirTabla("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("columns", () => {
  it("finds columns by header, ignoring accents, case and order", () => {
    const e = leerEncabezado([
      ["CÉDULA", "e-mail", "Apellido", "nombre", "TIPO", "Estación"],
    ]);

    expect(e.conEncabezado).toBe(true);
    expect(e.indices).toMatchObject({
      documento: 0,
      correo: 1,
      apellidos: 2,
      nombres: 3,
      tipo: 4,
      puesto: 5,
    });
  });
  it("without a header, the template's order is assumed", () => {
    const e = leerEncabezado([["Vigilante", "Luis", "Ortega"]]);

    expect(e.conEncabezado).toBe(false);
    expect(e.indices.nombres).toBe(1);
  });
});

describe("cells", () => {
  it("kinds by their everyday names", () => {
    expect(tipoDeCelda("Guardia")).toBe("vigilante");
    expect(tipoDeCelda("SUPERVISORA")).toBe("supervisor");
    expect(tipoDeCelda("Administrativo")).toBe("oficina");
    expect(tipoDeCelda("chofer")).toBeNull();
  });
  it("dates day-first, ISO and Excel serials", () => {
    expect(fechaDeCelda("02/11/2026")).toBe("2026-11-02");
    expect(fechaDeCelda("2/11/26")).toBe("2026-11-02");
    expect(fechaDeCelda("2026-11-02")).toBe("2026-11-02");
    expect(fechaDeCelda("46328")).toBe("2026-11-02");
    expect(fechaDeCelda("")).toBeNull();
    expect(fechaDeCelda("31/02/2026")).toBe("invalida");
    expect(fechaDeCelda("mañana")).toBe("invalida");
  });
  it("normalizes text and documents", () => {
    expect(normalizar("  Estación   NORTE · Fijo 1 ")).toBe(
      "estacion norte fijo 1",
    );
    expect(claveDeDocumento("09.123-456 7")).toBe("091234567");
  });
  it("a guard without e-mail enters with a username; office never", () => {
    const f = leerFilas([
      ["Tipo", "Nombres", "Apellidos", "Correo"],
      ["Vigilante", "Luis", "Ortega", ""],
      ["Oficina", "Sofía", "Paredes", ""],
    ]);

    expect(f[0].datos.sinCorreo).toBe(true);
    expect(f[1].datos.sinCorreo).toBe(false);
    expect(f[0].linea).toBe(2);
  });
});

describe("matching", () => {
  it("a seat by station + seat, by station alone (first vacant) or by a unique part", () => {
    expect(
      buscarPlaza("charlie 3 estacionamiento fijo 2", plazas).plaza?.positionId,
    ).toBe("p2");
    expect(
      buscarPlaza("Charlie 3 · Estacionamiento", plazas).plaza?.positionId,
    ).toBe("p1");
    expect(buscarPlaza("estacionamiento", plazas).plaza?.stationId).toBe("s1");
    expect(buscarPlaza("Fijo 1", plazas).motivo).toBe("ambiguo");
    expect(buscarPlaza("Torre 9", plazas).motivo).toBe("noEncontrado");
    expect(buscarPlaza("", plazas).motivo).toBe("vacio");
  });
  it("a supervisor post by name, with or without the zone", () => {
    expect(buscarPuestoSup("aguila1", cat.puestos).puesto?.id).toBe("sp1");
    expect(buscarPuestoSup("Halcon · Sur", cat.puestos).puesto?.id).toBe("sp2");
    expect(buscarPuestoSup("Lobo", cat.puestos).motivo).toBe("noEncontrado");
  });
  it("a role by its shown name, slug or a unique beginning", () => {
    expect(buscarRol("asistente administrativo", cat.roles)?.id).toBe("r-asis");
    expect(buscarRol("dispatcher", cat.roles)?.id).toBe("r-desp");
    expect(buscarRol("desp", cat.roles)?.id).toBe("r-desp");
    expect(buscarRol("gerente", cat.roles)).toBeNull();
  });
});

describe("checks", () => {
  const leer = (filas: string[][]) =>
    prepararFilas(
      leerFilas([
        [
          "Tipo",
          "Nombres",
          "Apellidos",
          "Documento",
          "Correo",
          "Rol",
          "Puesto",
          "Empieza",
        ],
        ...filas,
      ]),
      cat,
    );

  it("a complete row is ready", () => {
    const f = leer([
      [
        "Vigilante",
        "Luis",
        "Ortega",
        "0912",
        "",
        "",
        "Charlie 3 Estacionamiento Fijo 1",
        "02/11/2026",
      ],
    ]);
    const p = revisarFilas(f, cat);

    expect(p.get(f[0].id)).toEqual([]);
    expect(f[0].destino).toEqual({
      tipo: "plaza",
      stationId: "s1",
      positionId: "p1",
    });
    expect(f[0].empieza).toBe("2026-11-02");
  });
  it("missing data, bad e-mail, unknown kind and role, bad date", () => {
    const f = leer([
      ["Chofer", "", "Ortega", "", "", "", "", ""],
      ["Oficina", "Ana", "Ruiz", "", "ana@", "Gerente", "", "30/02/2026"],
      ["Oficina", "Eva", "Paz", "", "", "", "", ""],
    ]);
    const p = revisarFilas(f, cat);

    expect(p.get(f[0].id)).toEqual(expect.arrayContaining(["tipo", "nombres"]));
    expect(p.get(f[1].id)).toEqual(
      expect.arrayContaining([
        "correoInvalido",
        "rolDesconocido",
        "fechaInvalida",
      ]),
    );
    expect(p.get(f[2].id)).toEqual(
      expect.arrayContaining(["correoRequerido", "rolRequerido"]),
    );
  });
  it("a start date before today is refused", () => {
    const f = leer([
      ["Oficina", "Ana", "Ruiz", "", "ana@example.test", "Gerente", "", "01/10/2026"],
      ["Oficina", "Eva", "Paz", "", "eva@example.test", "Gerente", "", "02/11/2026"],
    ]);
    const p = revisarFilas(f, cat, undefined, "2026-11-01");

    expect(p.get(f[0].id)).toContain("fechaPasada");
    expect(p.get(f[1].id) || []).not.toContain("fechaPasada");
  });
  it("two rows for one vacant seat: the second is refused; an occupied seat too", () => {
    const f = leer([
      [
        "Vigilante",
        "A",
        "Uno",
        "",
        "",
        "",
        "Charlie 3 Estacionamiento Fijo 1",
        "",
      ],
      [
        "Vigilante",
        "B",
        "Dos",
        "",
        "",
        "",
        "Charlie 3 Estacionamiento Fijo 1",
        "",
      ],
      [
        "Vigilante",
        "C",
        "Tres",
        "",
        "",
        "",
        "Alfa 1 Acceso principal Fijo 1",
        "",
      ],
    ]);
    const p = revisarFilas(f, cat);

    expect(p.get(f[0].id)).toEqual([]);
    expect(p.get(f[1].id)).toContain("plazaOcupada");
    expect(p.get(f[2].id)).toContain("plazaOcupada");
  });
  it("seats and posts without rotation, and puestos not found", () => {
    const f = leer([
      ["Vigilante", "A", "Uno", "", "", "", "Delta Bodega", ""],
      ["Supervisor", "B", "Dos", "", "", "", "Halcón", ""],
      ["Supervisor", "C", "Tres", "", "", "", "Lobo", ""],
    ]);
    const p = revisarFilas(f, cat);

    expect(p.get(f[0].id)).toContain("puestoSinRotacion");
    expect(p.get(f[1].id)).toContain("puestoSinRotacion");
    expect(p.get(f[2].id)).toContain("puestoNoEncontrado");
    expect(f[2].destino).toBeNull();
  });
  it("repeated inside the list and already in the company", () => {
    const f = leer([
      ["Vigilante", "A", "Uno", "09-12", "a@x.com", "", "", ""],
      ["Vigilante", "B", "Dos", "0912", "A@X.com", "", "", ""],
      ["Supervisor", "C", "Tres", "777", "c@x.com", "", "", ""],
    ]);
    const p = revisarFilas(f, cat, {
      documentos: new Set(["777"]),
      correos: new Set(["c@x.com"]),
    });

    expect(p.get(f[0].id)).toEqual(
      expect.arrayContaining(["documentoRepetido", "correoRepetido"]),
    );
    expect(p.get(f[2].id)).toEqual(
      expect.arrayContaining(["documentoExiste", "correoExiste"]),
    );
  });
  it("no puesto in the paste is not a problem: «sin horario por ahora»", () => {
    const f = leer([["Supervisor", "C", "Tres", "", "", "", "", ""]]);

    expect(revisarFilas(f, cat).get(f[0].id)).toEqual([]);
    expect(f[0].destino).toBeNull();
  });
});

describe("template", () => {
  it("is a «;» CSV with a BOM that reads back as the same columns", () => {
    const csv = plantillaCsv();

    expect(csv.startsWith("﻿")).toBe(true);
    const filas = leerFilas(partirTabla(csv));

    expect(filas).toHaveLength(2);
    expect(filas[0].tipo).toBe("vigilante");
    expect(filas[1].rolTexto).toBe("Asistente Administrativo");
    expect(filas[0].empiezaTexto).toBe("02/11/2026");
  });
});
