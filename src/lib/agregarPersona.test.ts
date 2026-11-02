import { describe, expect, it } from "vitest";

import { presetLunesAViernes, copiarLunesATodos } from "./jornadaSemanal";
import {
  cuerpoDeAsignacion,
  cuerpoDeHorarioDeOficina,
  cuerpoDeOficina,
  cuerpoDePuesto,
  cuerpoDeSupervisor,
  cuerpoDeUbicacion,
  cuerpoDeVigilante,
  datosVacios,
  dondeTerminarHorario,
  enlaceDeWhatsApp,
  fichaDe,
  horasDe,
  mensajeDeAcceso,
  mitadDelDia,
  pendientes,
  plazaEnPalabras,
  puedeSeguir,
  rolesDeOficina,
  rolVeTodo,
  rotacionDePlaza,
  rotacionEnPalabras,
  semanaEnPalabras,
  tipoDeParam,
  turnoEnPalabras,
  validarDatos,
  validarLugar,
  type Datos,
  type Resultado,
} from "./agregarPersona";

/** i18next stand-in: the default value with {{x}} filled in. */
const t = (_k: string, o?: any) =>
  String(o?.defaultValue ?? _k).replace(/\{\{(\w+)\}\}/g, (_m, v) =>
    String(o?.[v] ?? ""),
  );

const ana = (p: Partial<Datos> = {}): Datos => ({
  ...datosVacios(),
  nombres: " Ana ",
  apellidos: "Pérez",
  correo: "ana@empresa.com",
  ...p,
});

describe("agregarPersona · step 1", () => {
  it("reads the type from the URL, Spanish or English", () => {
    expect(tipoDeParam("vigilante")).toBe("vigilante");
    expect(tipoDeParam("Guard")).toBe("vigilante");
    expect(tipoDeParam("supervisor")).toBe("supervisor");
    expect(tipoDeParam("office")).toBe("oficina");
    expect(tipoDeParam("cliente")).toBeNull();
    expect(tipoDeParam(undefined)).toBeNull();
  });

  it("cannot go on without a type", () => {
    expect(puedeSeguir(1, null, datosVacios(), null)).toBe(false);
    expect(puedeSeguir(1, "oficina", datosVacios(), null)).toBe(true);
  });
});

describe("agregarPersona · step 2 (who)", () => {
  it("names and an e-mail are required; a bad e-mail says so", () => {
    expect(validarDatos("vigilante", datosVacios())).toEqual({
      nombres: "requerido",
      apellidos: "requerido",
      correo: "requerido",
    });
    expect(validarDatos("vigilante", ana({ correo: "ana@" })).correo).toBe(
      "correoInvalido",
    );
    expect(validarDatos("vigilante", ana())).toEqual({});
  });

  it("guards and supervisors may have no e-mail; office people may not", () => {
    expect(
      validarDatos("vigilante", ana({ correo: "", sinCorreo: true })),
    ).toEqual({});
    expect(
      validarDatos("supervisor", ana({ correo: "", sinCorreo: true })),
    ).toEqual({});
    expect(
      validarDatos("oficina", ana({ correo: "", sinCorreo: true, rol: "r1" }))
        .correo,
    ).toBe("requerido");
  });

  it("a phone, when given, has at least 7 digits", () => {
    expect(validarDatos("vigilante", ana({ celular: "12-34" })).celular).toBe(
      "celularInvalido",
    );
    expect(
      validarDatos("vigilante", ana({ celular: "+593 99 123 4567" })),
    ).toEqual({});
    // One phone only: two pasted together were cut at 24 characters (QA N3).
    for (const malo of ["+593 99 000 0611+593 99 000 0612", "099 abc 1234", "1234567890123456"])
      expect(validarDatos("vigilante", ana({ celular: malo })).celular).toBe(
        "celularInvalido",
      );
    for (const bueno of ["(02) 245-6789", "0991234567", "+1 512.555.0100"])
      expect(validarDatos("vigilante", ana({ celular: bueno }))).toEqual({});
  });

  it("office: the role has no default, and «only some sites» needs a site", () => {
    expect(validarDatos("oficina", ana()).rol).toBe("requerido");
    expect(
      validarDatos("oficina", ana({ rol: "r1", alcance: "sedes" })).sedes,
    ).toBe("sedesVacias");
    expect(
      validarDatos(
        "oficina",
        ana({ rol: "r1", alcance: "sedes", sedes: ["s1"] }),
      ),
    ).toEqual({});
  });
});

describe("agregarPersona · step 3 (where and when)", () => {
  it("«Lo hago después» is always valid", () => {
    expect(validarLugar(null)).toBeNull();
    expect(puedeSeguir(3, "vigilante", ana(), null)).toBe(true);
  });

  it("a seat without a rotation asks for one, and the assignment carries it", () => {
    const sinRot = {
      tipo: "vigilante" as const,
      stationId: "st",
      positionId: "p",
      desde: "",
      sinRotacion: true,
      rotationStyleId: null,
    };

    expect(validarLugar(sinRot)).toBe("eligeRotacion");
    expect(validarLugar({ ...sinRot, rotationStyleId: "r1" })).toBeNull();
    expect(
      cuerpoDeAsignacion("u1", { ...sinRot, rotationStyleId: "r1" }),
    ).toEqual({
      guardId: "u1",
      stationId: "st",
      positionId: "p",
      rotationStyleId: "r1",
    });
    // A seat that has its rotation never sends one (the station's wins).
    expect(
      cuerpoDeAsignacion("u1", {
        ...sinRot,
        sinRotacion: false,
        rotationStyleId: "r1",
      }),
    ).not.toHaveProperty("rotationStyleId");
  });

  it("a guard needs a seat; a supervisor needs a post", () => {
    expect(
      validarLugar({
        tipo: "vigilante",
        stationId: "st",
        positionId: "",
        desde: "",
      }),
    ).toBe("eligePlaza");
    expect(
      validarLugar({
        tipo: "vigilante",
        stationId: "st",
        positionId: "p",
        desde: "2026-11-02",
      }),
    ).toBeNull();
    expect(
      validarLugar({ tipo: "supervisor", positionId: "", desde: "" }),
    ).toBe("eligePuesto");
    expect(
      validarLugar({
        tipo: "supervisor",
        positionId: "p1",
        desde: "",
        sinRotacion: true,
      }),
    ).toBe("puestoSinRotacion");
    expect(
      validarLugar({
        tipo: "supervisor",
        positionId: "p",
        desde: "02/11/2026",
      }),
    ).toBe("fechaInvalida");
  });

  it("a start before the company's today is refused (it would invent past shifts)", () => {
    const h = { tipo: "supervisor" as const, positionId: "p", desde: "2026-10-01" };

    expect(validarLugar(h, "2026-11-01")).toBe("fechaPasada");
    expect(validarLugar({ ...h, desde: "2026-11-01" }, "2026-11-01")).toBeNull();
    expect(validarLugar({ ...h, desde: "" }, "2026-11-01")).toBeNull();
    expect(validarLugar(h)).toBeNull();
  });

  it("office: the week must be valid and the location sensible", () => {
    const jornada = presetLunesAViernes();

    expect(
      validarLugar({ tipo: "oficina", jornada, desde: "", oficina: null }),
    ).toBeNull();
    const sinDias = jornada.map((d) => ({ ...d, activo: false }));

    expect(
      validarLugar({
        tipo: "oficina",
        jornada: sinDias,
        desde: "",
        oficina: null,
      }),
    ).toBe("jornadaInvalida");
    expect(
      validarLugar({
        tipo: "oficina",
        jornada,
        desde: "",
        oficina: { direccion: "Av. 1", lat: "120", lng: "-99", radio: "150" },
      }),
    ).toBe("ubicacionInvalida");
    expect(
      validarLugar({
        tipo: "oficina",
        jornada,
        desde: "",
        oficina: { direccion: "Av. 1", lat: "", lng: "", radio: "" },
      }),
    ).toBeNull();
  });
});

describe("agregarPersona · the rotation in words", () => {
  it("says the cycle, never the stored name", () => {
    expect(
      rotacionEnPalabras({ dayShifts: 2, nightShifts: 2, restDays: 2 }, t),
    ).toBe("2 días, 2 noches, 2 libres");
    expect(
      rotacionEnPalabras({ dayShifts: 5, nightShifts: 0, restDays: 2 }, t),
    ).toBe("5 días, 2 libres");
    expect(rotacionEnPalabras({ sequence: "DLLDDLL" }, t)).toBe(
      "Secuencia 1-2-2-2",
    );
    expect(rotacionEnPalabras(null, t)).toBe("Sin rotación definida");
    expect(
      rotacionEnPalabras({ dayShifts: 0, nightShifts: 0, restDays: 0 }, t),
    ).toBe("Sin rotación definida");
  });

  it("a weekly style is named by its days", () => {
    expect(
      rotacionEnPalabras(
        { weekly: true, sequence: "DDDDDLL" },
        t,
      ).toLowerCase(),
    ).toContain("lun");
  });

  it("joins the cycle and the hours", () => {
    expect(horasDe("07:00:00", "19:00")).toBe("07:00–19:00");
    expect(horasDe(null, null)).toBe("");
    expect(
      turnoEnPalabras(
        { dayShifts: 2, nightShifts: 2, restDays: 2 },
        "07:00",
        "19:00",
        t,
      ),
    ).toBe("2 días, 2 noches, 2 libres · 07:00–19:00");
  });

  it("the seat's own cycle wins over the station's", () => {
    const estilos = [{ id: "a" }, { id: "b" }];

    expect(
      rotacionDePlaza(
        { rotationStyleId: "b" },
        { rotationStyleId: "a" },
        estilos,
      )?.id,
    ).toBe("b");
    expect(
      rotacionDePlaza(
        { rotationStyleId: null },
        { rotationStyleId: "a" },
        estilos,
      )?.id,
    ).toBe("a");
    expect(rotacionDePlaza({}, {}, estilos)).toBeNull();
  });
});

describe("agregarPersona · the office week in words", () => {
  it("groups the days that share hours and lunch", () => {
    const j = presetLunesAViernes().map((d, i) =>
      i < 5
        ? {
            ...d,
            start: "09:00",
            end: "18:00",
            almuerzo: true,
            breakStart: "13:00",
            breakMinutes: 60,
          }
        : d,
    );

    expect(semanaEnPalabras(j, t)).toEqual([
      "Lunes a viernes 09:00–18:00 · almuerzo 13:00–14:00",
    ]);
    const conSabado = j.map((d, i) =>
      i === 5
        ? { ...d, activo: true, start: "08:00", end: "12:00", almuerzo: false }
        : d,
    );

    expect(semanaEnPalabras(conSabado, t)).toEqual([
      "Lunes a viernes 09:00–18:00 · almuerzo 13:00–14:00",
      "Sábado 08:00–12:00",
    ]);
  });
});

describe("agregarPersona · office roles", () => {
  const roles = [
    { id: "1", slug: "admin", permissions: new Array(350) },
    { id: "2", slug: "secretary", permissions: new Array(110) },
    { id: "3", slug: "securityGuard", permissions: new Array(120) },
    { id: "4", slug: "dispatcher", permissions: new Array(170) },
    { id: "5", slug: "administrativeAssistant", permissions: new Array(110) },
    { id: "6", slug: "customer", permissions: [] },
  ];

  it("least privileged first, without the roles that have their own flow", () => {
    expect(rolesDeOficina(roles).map((r) => r.slug)).toEqual([
      "administrativeAssistant",
      "secretary",
      "dispatcher",
      "admin",
    ]);
  });

  it("administrator and operations manager see everything", () => {
    expect(rolVeTodo({ id: "1", slug: "admin" })).toBe(true);
    expect(rolVeTodo({ id: "x", slug: "operationsManager" })).toBe(true);
    expect(rolVeTodo({ id: "2", slug: "secretary" })).toBe(false);
    expect(rolVeTodo(null)).toBe(false);
  });
});

describe("agregarPersona · request bodies", () => {
  it("guard by e-mail, by phone (link for WhatsApp) and without either", () => {
    expect(cuerpoDeVigilante(ana({ documento: " 0912 " }))).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
      governmentId: "0912",
      inviteBy: "Correo Electrónico",
      contact: "ana@empresa.com",
      email: "ana@empresa.com",
      clientIds: [],
      stationIds: [],
    });
    // Invited by e-mail, the phone typed goes along (it was lost).
    expect(
      cuerpoDeVigilante(ana({ celular: " +593 99 000 0301 " })),
    ).toMatchObject({
      contact: "ana@empresa.com",
      phoneNumber: "+593 99 000 0301",
    });
    expect(
      cuerpoDeVigilante(
        ana({ correo: "", sinCorreo: true, celular: "0991234567" }),
      ),
    ).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
      inviteBy: "SMS",
      contact: "0991234567",
      phoneNumber: "0991234567",
    });
    expect(
      cuerpoDeVigilante(
        ana({
          correo: "",
          sinCorreo: true,
          celular: "0991234567",
          usuario: "aperez",
        }),
      ),
    ).toMatchObject({ inviteBy: "SMS", username: "aperez" });
    expect(
      cuerpoDeVigilante(
        ana({ correo: "", sinCorreo: true, usuario: "aperez" }),
      ),
    ).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
      sinCorreo: true,
      username: "aperez",
    });
  });

  it("supervisor with and without e-mail", () => {
    expect(cuerpoDeSupervisor(ana({ celular: "0991234567" }))).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@empresa.com",
      phoneNumber: "0991234567",
    });
    expect(cuerpoDeSupervisor(ana({ correo: "", sinCorreo: true }))).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
      sinCorreo: true,
    });
  });

  it("office: whole operation, or some sites with their clients", () => {
    const sedes = [
      { id: "s1", clientIds: ["c1"] },
      { id: "s2", clientIds: ["c1", "c2"] },
      { id: "s3", clientIds: ["c3"] },
    ];

    expect(cuerpoDeOficina(ana({ rol: "r1" }), sedes)).toMatchObject({
      name: "Ana Pérez",
      firstName: "Ana",
      lastName: "Pérez",
      email: "ana@empresa.com",
      role: "r1",
      postSiteIds: [],
      clientIds: [],
      invited: true,
    });
    const acotada = cuerpoDeOficina(
      ana({ rol: "r1", alcance: "sedes", sedes: ["s1", "s2"] }),
      sedes,
      {
        id: "r1",
        slug: "secretary",
      },
    );

    expect(acotada.postSiteIds).toEqual(["s1", "s2"]);
    expect(acotada.clientIds).toEqual(["c1", "c2"]);
    // An administrator ignores the scope: nothing is sent.
    expect(
      cuerpoDeOficina(
        ana({ rol: "r0", alcance: "sedes", sedes: ["s1"] }),
        sedes,
        { id: "r0", slug: "admin" },
      ).postSiteIds,
    ).toEqual([]);
  });

  it("schedule writes", () => {
    expect(
      cuerpoDeAsignacion("u1", {
        tipo: "vigilante",
        stationId: "st",
        positionId: "p",
        desde: "2026-11-02",
      }),
    ).toEqual({
      guardId: "u1",
      stationId: "st",
      positionId: "p",
      startDate: "2026-11-02",
    });
    expect(
      cuerpoDeAsignacion("u1", {
        tipo: "vigilante",
        stationId: "st",
        positionId: "p",
        desde: "",
      }),
    ).not.toHaveProperty("startDate");
    expect(
      cuerpoDePuesto("u2", { tipo: "supervisor", positionId: "p", desde: "" }),
    ).toEqual({ supervisorUserId: "u2" });

    const jornada = copiarLunesATodos(
      presetLunesAViernes().map((d, i) =>
        i === 0
          ? {
              ...d,
              start: "09:00",
              end: "18:00",
              almuerzo: true,
              breakStart: "13:00",
              breakMinutes: 60,
            }
          : d,
      ),
    );
    const cuerpo = cuerpoDeHorarioDeOficina({
      tipo: "oficina",
      jornada,
      desde: "2026-11-02",
      oficina: null,
    });

    expect(cuerpo.effectiveFrom).toBe("2026-11-02");
    expect(Object.keys(cuerpo.schedule)).toEqual([
      "mon",
      "tue",
      "wed",
      "thu",
      "fri",
    ]);
    expect(cuerpo.schedule.fri).toEqual({
      start: "09:00",
      end: "18:00",
      breakStart: "13:00",
      breakMinutes: 60,
    });
  });

  it("office location: coordinates with a 150 m default, address alone, or nothing", () => {
    expect(
      cuerpoDeUbicacion({
        direccion: "Av. 1",
        lat: "19.43",
        lng: "-99.13",
        radio: "",
      }),
    ).toEqual({
      officeAddress: "Av. 1",
      officeLatitude: 19.43,
      officeLongitude: -99.13,
      officeGeofenceRadiusM: 150,
    });
    expect(
      cuerpoDeUbicacion({ direccion: "Av. 1", lat: "", lng: "", radio: "" }),
    ).toEqual({
      officeAddress: "Av. 1",
      officeLatitude: null,
      officeLongitude: null,
      officeGeofenceRadiusM: null,
    });
    expect(
      cuerpoDeUbicacion({ direccion: " ", lat: "", lng: "", radio: "" }),
    ).toBeNull();
    expect(cuerpoDeUbicacion(null)).toBeNull();
  });
});

describe("agregarPersona · after «Crear»", () => {
  const base: Resultado = {
    tipo: "vigilante",
    nombre: "Ana Pérez",
    userId: "u1",
    fichaId: "sg1",
    acceso: { username: null, link: null, correo: "ana@empresa.com" },
    horario: "hecho",
    ubicacion: "despues",
  };

  it("lists what is still missing", () => {
    expect(pendientes(base)).toEqual([]);
    expect(pendientes({ ...base, horario: "despues" })).toEqual(["horario"]);
    expect(
      pendientes({
        ...base,
        tipo: "oficina",
        horario: "fallo",
        ubicacion: "fallo",
      }),
    ).toEqual(["horario", "ubicacion"]);
  });

  it("knows each sheet and where to finish the schedule", () => {
    expect(fichaDe("vigilante", "u1")).toBe("/guards/u1/resumen");
    expect(fichaDe("supervisor", "u2")).toBe("/supervisors/u2");
    expect(fichaDe("oficina", "u3")).toBe("/back-office/u3");
    expect(fichaDe("oficina", null)).toBeNull();
    expect(dondeTerminarHorario("vigilante", "u1")).toBe(
      "/guards/u1/asignar-sitios",
    );
    expect(dondeTerminarHorario("supervisor", "u2")).toBe(
      "/supervisor-positions",
    );
    expect(dondeTerminarHorario("oficina", "u3")).toBe("/schedule");
  });

  it("writes the WhatsApp message with the first name, username and link", () => {
    const m = mensajeDeAcceso(
      { nombre: "Ana Pérez", username: "aperez", link: "https://x/y" },
      t,
    );

    expect(m).toBe(
      "Hola Ana. Tu usuario para entrar a la app es: aperez. Crea tu contraseña aquí: https://x/y",
    );
    expect(enlaceDeWhatsApp("a b")).toBe("https://wa.me/?text=a%20b");
  });
});

describe("seat half of the day", () => {
  it("day from 05:00 to 16:59, night otherwise, 24 h when start equals end", () => {
    expect(mitadDelDia("07:00", "19:00")).toBe("dia");
    expect(mitadDelDia("05:00:00", "13:00")).toBe("dia");
    expect(mitadDelDia("16:59", "23:00")).toBe("dia");
    expect(mitadDelDia("17:00", "05:00")).toBe("noche");
    expect(mitadDelDia("19:00", "07:00")).toBe("noche");
    expect(mitadDelDia("00:00", "08:00")).toBe("noche");
    expect(mitadDelDia("07:00", "07:00:00")).toBe("24h");
    expect(mitadDelDia(null, null)).toBeNull();
    expect(mitadDelDia("", "19:00")).toBeNull();
  });

  it("keeps the clients' word «Fijo» and adds the half", () => {
    expect(plazaEnPalabras("Fijo 1", "07:00", "19:00", t)).toBe(
      "Fijo 1 · de día",
    );
    expect(plazaEnPalabras("Fijo 2", "19:00", "07:00", t)).toBe(
      "Fijo 2 · de noche",
    );
    expect(plazaEnPalabras("Fijo 1", "07:00", "07:00", t)).toBe(
      "Fijo 1 · 24 h",
    );
    expect(plazaEnPalabras("Fijo 1", null, null, t)).toBe("Fijo 1");
    expect(plazaEnPalabras("", "07:00", "19:00", t)).toBe("de día");
  });

  it("a rotation through nights has no fixed half of the day", () => {
    expect(
      plazaEnPalabras("Fijo 1", "07:00", "19:00", t, {
        dayShifts: 2,
        nightShifts: 2,
        restDays: 2,
      } as any),
    ).toBe("Fijo 1");
    expect(
      plazaEnPalabras("Fijo 2", "19:00", "07:00", t, {
        dayShifts: 5,
        nightShifts: 0,
        restDays: 2,
      } as any),
    ).toBe("Fijo 2 · de noche");
    expect(
      plazaEnPalabras("Fijo 1", "07:00", "19:00", t, {
        sequence: "DLLNNLL",
      } as any),
    ).toBe("Fijo 1");
  });
});
