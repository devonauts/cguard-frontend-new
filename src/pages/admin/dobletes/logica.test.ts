import { describe, expect, it, vi } from "vitest";

// The service module reads the session token from localStorage on import;
// the test runner (node) has none.
vi.hoisted(() => {
  const g = globalThis as { localStorage?: unknown };

  g.localStorage ??= {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
});

import {
  mergeSettings,
  sinModulo,
  DEFAULT_SETTINGS,
  normalizarBanca,
  normalizarEstadisticas,
  normalizarBusqueda,
  pendientesDe,
  decimalesDe,
} from "../../../lib/api/dobletesService";

import {
  estadoDeCampana,
  mesActual,
  minutosHasta,
  rellenar,
  rutaDeLaAppValida,
} from "./logica";

/**
 * Dobletes — the rules the screens rely on. The server is the authority for
 * everything else (waves, who wins, limits); these are what the CRM decides
 * on its own: what a campaign is called, what the guard reads, what the
 * company's settings look like when the server omits a field.
 */
const AHORA = Date.parse("2026-10-26T15:00:00Z");

describe("dobletes · estado de una campaña", () => {
  it("sin publicar es un borrador, aunque tenga fechas", () => {
    expect(
      estadoDeCampana({ active: false, startsAt: null, endsAt: null }, AHORA),
    ).toBe("borrador");
    expect(
      estadoDeCampana(
        {
          active: false,
          startsAt: "2026-10-01T00:00:00Z",
          endsAt: "2026-12-01T00:00:00Z",
        },
        AHORA,
      ),
    ).toBe("borrador");
  });

  it("publicada: programada, activa o terminada según sus fechas", () => {
    expect(
      estadoDeCampana(
        { active: true, startsAt: "2026-10-27T00:00:00Z", endsAt: null },
        AHORA,
      ),
    ).toBe("programada");
    expect(
      estadoDeCampana({ active: true, startsAt: null, endsAt: null }, AHORA),
    ).toBe("activa");
    expect(
      estadoDeCampana(
        {
          active: true,
          startsAt: "2026-10-01T00:00:00Z",
          endsAt: "2026-10-26T14:59:00Z",
        },
        AHORA,
      ),
    ).toBe("terminada");
  });
});

describe("dobletes · el texto que lee el vigilante", () => {
  it("rellena {{empresa}} y {{bono}}, con o sin espacios, todas las veces", () => {
    expect(
      rellenar(
        "Únete a {{empresa}}: {{ bono }} por doblete. {{empresa}}",
        "Andina",
        "$15",
      ),
    ).toBe("Únete a Andina: $15 por doblete. Andina");
  });

  it("no toca otras llaves ni falla sin texto", () => {
    expect(rellenar("Hola {{nombre}}", "A", "B")).toBe("Hola {{nombre}}");
    expect(rellenar(undefined as unknown as string, "A", "B")).toBe("");
  });
});

describe("dobletes · el botón de una campaña sólo abre pantallas de la app", () => {
  it("acepta /guard/… y nada más", () => {
    expect(rutaDeLaAppValida("/guard/ofertas")).toBe(true);
    expect(rutaDeLaAppValida("/guard/me/availability")).toBe(true);
    expect(rutaDeLaAppValida("https://otro.sitio/guard/x")).toBe(false);
    expect(rutaDeLaAppValida("/admin")).toBe(false);
    expect(rutaDeLaAppValida("/guard/../admin?x=1")).toBe(false);
    expect(rutaDeLaAppValida(null)).toBe(false);
  });
});

describe("dobletes · relojes", () => {
  it("minutos hasta la siguiente oleada, nunca negativos", () => {
    expect(minutosHasta("2026-10-26T15:09:30Z", AHORA)).toBe(10);
    expect(minutosHasta("2026-10-26T14:00:00Z", AHORA)).toBe(0);
    expect(minutosHasta(null, AHORA)).toBeNull();
  });

  it("el mes de un día", () => {
    expect(mesActual("2026-10-26")).toBe("2026-10");
  });
});

describe("dobletes · ajustes de la empresa", () => {
  it("lo que el servidor no manda sale de fábrica: oleadas de 3 y 5 cada 15 min", () => {
    const s = mergeSettings({});

    expect(s.waveSizes).toEqual([3, 5]);
    expect(s.waveMinutes).toBe(15);
    expect(s.autoLaunchWithVigiaPro).toBe(false);
    expect(s.voiceAsLastChannel).toBe(false);
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it("respeta lo guardado y completa las reglas de niveles a medias", () => {
    const s = mergeSettings({
      waveSizes: [2],
      levels: { enabled: false, rules: { oro: { minCovered: 8 } } as never },
    });

    expect(s.waveSizes).toEqual([2]);
    expect(s.levels).toEqual({
      enabled: false,
      rules: {
        plata: { minCovered: 1, minAttendancePct: 90 },
        oro: { minCovered: 8, minAttendancePct: 95 },
      },
    });
  });

  it("acepta la forma vieja (sólo el número de dobletes)", () => {
    const s = mergeSettings({
      levels: { enabled: true, rules: { plata: 2 } as never },
    });

    expect(s.levels.rules.plata).toEqual({
      minCovered: 2,
      minAttendancePct: 90,
    });
  });

  it("una lista de oleadas vacía no deja a la empresa sin oleadas", () => {
    expect(mergeSettings({ waveSizes: [] }).waveSizes).toEqual([3, 5]);
  });
});

describe("dobletes · sin el módulo", () => {
  it("un 402 o addon_required significa que la empresa no lo tiene", () => {
    expect(sinModulo({ status: 402 })).toBe(true);
    expect(sinModulo({ status: 403, code: "addon_required" })).toBe(true);
    expect(sinModulo({ status: 500 })).toBe(false);
    expect(sinModulo(null)).toBe(false);
  });
});

describe("dobletes · lo que manda el servidor", () => {
  it("la banca usa la lista del servidor: todos los puestos, con count y short, sin repetir", () => {
    const b = normalizarBanca({
      members: [
        {
          userId: "u1",
          name: "Pedro",
          level: "plata",
          weekly: [{ weekday: 1, slots: ["D", "N"] }],
        },
      ],
      grid: [
        {
          date: "2026-10-26",
          weekday: 1,
          slots: { D: ["u1", "u2"], T: [], N: ["u1"] },
        },
        { date: "2026-10-27", weekday: 2, slots: { D: [], T: ["u2"], N: [] } },
      ],
      posts: [
        {
          stationId: "s2",
          stationName: "Puerta",
          relief: [],
          qualified: [],
          count: 0,
          short: true,
        },
        {
          stationId: "s1",
          stationName: "Garita",
          relief: ["g9", "u1"],
          qualified: ["u1"],
          count: 2,
          short: false,
        },
        {
          stationId: "s1",
          stationName: "Garita",
          relief: [],
          qualified: [],
          count: 9,
          short: false,
        },
      ],
      names: {},
    });

    expect(b.stations.map((p) => [p.stationId, p.suplentes, p.short])).toEqual([
      ["s2", 0, true],
      ["s1", 2, false],
    ]);
    expect(b.grid.find((g) => g.weekday === 1 && g.slot === "D")?.count).toBe(
      2,
    );
    expect(b.grid.find((g) => g.weekday === 2 && g.slot === "T")?.count).toBe(
      1,
    );
    expect(b.grid).toHaveLength(21);
    expect(b.members[0]).toMatchObject({ active: true, level: "plata" });
    expect(b.healthThreshold).toBe(2);
  });

  it("sin `short` del servidor, un puesto con menos de 2 suplentes está corto", () => {
    const b = normalizarBanca({
      posts: [{ stationId: "s1", relief: ["a"], qualified: [] }],
    });

    expect(b.stations[0]).toMatchObject({ suplentes: 1, short: true });
  });

  it("una búsqueda de la lista trae conteos; el detalle, las ofertas", () => {
    const lista = normalizarBusqueda({
      id: "b1",
      status: "active",
      source: "office",
      coverageEventId: "e1",
      event: {
        id: "e1",
        stationId: "s1",
        stationName: "Garita",
        windowStart: "x",
        windowEnd: "y",
      },
      startedById: "u9",
      startedByName: "Carlos",
      counts: { pending: 3 },
      createdAt: "2026-10-26T10:00:00Z",
      filledAt: null,
    });

    expect(lista.event?.station).toEqual({
      id: "s1",
      stationName: "Garita",
      nickname: null,
    });
    expect(lista.startedBy).toEqual({ id: "u9", name: "Carlos" });
    expect(lista.offers).toBeUndefined();
    expect(pendientesDe(lista)).toBe(3);

    const detalle = normalizarBusqueda({
      id: "b1",
      status: "filled",
      createdAt: "2026-10-26T10:00:00Z",
      filledAt: "2026-10-26T10:07:00Z",
      offers: [
        {
          id: "o1",
          guardUserId: "g1",
          status: "accepted",
          reasons: ["level_oro"],
        },
        { id: "o2", guardUserId: "g2", status: "pending" },
      ],
    });

    expect(detalle.updatedAt).toBe("2026-10-26T10:07:00Z");
    expect(detalle.offers?.[0].level).toBe("oro");
    expect(pendientesDe(detalle)).toBe(1);
  });

  it("las cifras de una campaña: personas y turnos cubiertos gracias a ella", () => {
    const st = normalizarEstadisticas({
      people: { shown: 40, seen: 30, dismissed: 5, cta: 9, converted: 4 },
      total: { shown: 90 },
      conversionPct: 10,
      coveredShifts: {
        windowDays: 30,
        people: 3,
        accepted: 5,
        confirmed: 4,
        bonusCents: 7500,
      },
    });

    expect(st).toMatchObject({
      shown: 40,
      cta: 9,
      converted: 4,
      conversionPct: 10,
    });
    expect(st.coveredShifts).toEqual({
      windowDays: 30,
      people: 3,
      accepted: 5,
      confirmed: 4,
      bonusCents: 7500,
    });
    expect(
      normalizarEstadisticas({ people: { shown: 1 } }).coveredShifts,
    ).toBeNull();
  });

  it("monedas sin centavos", () => {
    expect(decimalesDe("CLP")).toBe(0);
    expect(decimalesDe("mxn")).toBe(2);
  });
});
