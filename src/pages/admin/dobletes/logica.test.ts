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
      levels: { enabled: false, rules: { oro: 8 } as never },
    });

    expect(s.waveSizes).toEqual([2]);
    expect(s.levels).toEqual({ enabled: false, rules: { plata: 2, oro: 8 } });
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
