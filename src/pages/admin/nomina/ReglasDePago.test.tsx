import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ReglasDePago, { type PayrollDeAjustes } from "./ReglasDePago";

// No network and no browser storage in a server render.
vi.hoisted(() => {
  const mem = new Map<string, string>();

  (globalThis as any).localStorage ??= {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
});
vi.mock("@/lib/api/attendanceService", () => ({ default: { payRulePresets: async () => ({ pais: null, presets: {} }) } }));
vi.mock("@/components/ui/confirmDialog", () => ({ confirmDialog: async () => false }));

/**
 * The pay rules page renders every phase-4 rule the company switched on —
 * weekly tiers, the period / 4-week cycle, the year, Saturday and the flat
 * pluses — and leaves them closed when they are off. Server render: no DOM.
 */
function html(payroll: PayrollDeAjustes): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });

  return renderToString(
    <QueryClientProvider client={qc}>
      <ReglasDePago payroll={payroll} onChange={() => {}} />
    </QueryClientProvider>,
  );
}

/** Same render, with the presets answer of a US company already in the cache. */
function htmlEEUU(payroll: PayrollDeAjustes): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  const preset = { politica: {}, fuentes: ["FLSA"], confirmar: [] };

  qc.setQueryData(["attendance", "pay-rule-presets"], {
    pais: "US",
    presets: { US: preset },
    regiones: { US: { CA: { ...preset, fuentes: ["Lab. Code §510"] }, AK: preset } },
  });

  return renderToString(
    <QueryClientProvider client={qc}>
      <ReglasDePago payroll={payroll} onChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("ReglasDePago · estado de EE. UU.", () => {
  it("the state saved in the settings is the one selected after a reload", () => {
    const h = htmlEEUU({ regionDeReglas: "CA", politica: { horasOrdinariasDia: 8 } });

    expect(h).toMatch(/<option value="CA" selected="">/);
    expect(h).toContain("Lab. Code §510");
  });

  it("no saved state (or one the country does not have) shows the federal option", () => {
    expect(htmlEEUU({ politica: {} })).toMatch(/<option value="" selected="">/);
    expect(htmlEEUU({ regionDeReglas: "ZZ", politica: {} })).toMatch(/<option value="" selected="">/);
  });
});

describe("ReglasDePago · fase 4", () => {
  it("with every new rule on, each one shows its fields and its line in the summary", () => {
    const h = html({
      periodType: "monthly",
      politica: {
        moneda: "EUR",
        horasOrdinariasDia: 0,
        horasOrdinariasSemana: 35,
        tramosExtra: [{ desdeHora: 0, recargoPct: 25 }],
        tramosExtraSemana: [{ desdeHora: 0, recargoPct: 25 }, { desdeHora: 8, recargoPct: 50 }],
        tramosSemanaCuentan: "extra",
        extraDelPeriodo: { horas: 152, recargoPct: 50, semanas: 4, ancla: "2026-09-07" },
        extraDelAnio: { horas: 100, tramos: [{ desdeHora: 0, recargoPct: 50 }, { desdeHora: 1, recargoPct: 75 }] },
        sabadoRecargoPct: 35,
        pluses: [
          { id: "nocturnidad", nombre: "Plus de nocturnidad", importeCentavos: 126, por: "hora", horas: "nocturnas", minimoHoras: 4, pagaTodas: true, topeHoras: 8, cotiza: true },
        ],
      },
    });

    expect(h).toContain("Escalones de la semana");
    expect(h).toContain("Escalones por semana: +25 %, +50 % (desde la 9.ª), contando las horas extra de la semana");
    expect(h).toContain("2026-09-07");
    expect(h).toContain("Más de 152 h ordinarias cada 4 semanas: extra al +50 %");
    expect(h).toContain("Pasadas 100 h extra en el año: +50 %, +75 % (desde la 2.ª)");
    expect(h).toContain("Sábado: +35 %");
    expect(h).toContain("Plus de nocturnidad");
    expect(h).toContain("Pluses fijos: Plus de nocturnidad 1.26 EUR/h");
    expect(h).toContain("Una hora de noche en sábado");
  });

  it("a company that set none of them sees them closed and no new summary lines", () => {
    const h = html({ politica: { horasOrdinariasDia: 8, tramosExtra: [{ desdeHora: 0, recargoPct: 50 }] } });

    expect(h).toContain("Escalones por semana");
    expect(h).not.toContain("Escalones de la semana");
    expect(h).not.toContain("Más de ");
    expect(h).not.toContain("Pasadas ");
    expect(h).not.toContain("Sábado: +");
    expect(h).not.toContain("Pluses fijos: ");
  });
});

/** Same render, with a country preset (El Salvador) in the cache. */
function htmlConPreset(payroll: PayrollDeAjustes): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  const preset = {
    politica: {
      horasOrdinariasDia: 8,
      tramosExtra: [{ desdeHora: 0, recargoPct: 100 }],
      nocturno: { desdeHora: 19, hastaHora: 6, recargoPct: 25 },
      extraNocturna: { desdeHora: 19, hastaHora: 6, recargoPct: 125 },
      domingoRecargoPct: 50,
    },
    fuentes: ["Código de Trabajo"],
    confirmar: [],
  };

  qc.setQueryData(["attendance", "pay-rule-presets"], { pais: "SV", presets: { SV: preset } });

  return renderToString(
    <QueryClientProvider client={qc}>
      <ReglasDePago payroll={payroll} onChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe("ReglasDePago · valores abiertos (Mike 2026-11-01)", () => {
  it("shows the law's value as a suggestion and offers «Volver al sugerido» where the company typed another", () => {
    const h = htmlConPreset({
      politica: {
        configuradaEl: "2026-11-01T00:00:00Z",
        horasOrdinariasDia: 8,
        tramosExtra: [{ desdeHora: 0, recargoPct: 100 }],
        nocturno: { desdeHora: 19, hastaHora: 6, recargoPct: 25 },
        // The company pays 100 % where the preset suggests 125 %.
        extraNocturna: { desdeHora: 19, hastaHora: 6, recargoPct: 100 },
        domingoRecargoPct: 50,
      },
    });

    // The company's own value is in the input…
    expect(h).toMatch(/value="100"/);
    // …and the suggestion is a hint, not a lock.
    expect(h).toContain("125 %");
    expect(h).toContain("Sugerido por ley");
    expect(h).toContain("Cada valor es de tu empresa");
    // Only the night-overtime % differs from the preset: one «Volver al sugerido».
    expect(h.match(/data-volver-al-sugerido/g)?.length).toBe(1);
  });

  it("equal values show the suggestion without the button; no preset, no hint", () => {
    const igual = htmlConPreset({
      politica: {
        configuradaEl: "2026-11-01T00:00:00Z",
        horasOrdinariasDia: 8,
        tramosExtra: [{ desdeHora: 0, recargoPct: 100 }],
        nocturno: { desdeHora: 19, hastaHora: 6, recargoPct: 25 },
        extraNocturna: { desdeHora: 19, hastaHora: 6, recargoPct: 125 },
        domingoRecargoPct: 50,
      },
    });

    expect(igual).toContain("data-sugerido");
    expect(igual).not.toContain("data-volver-al-sugerido");
    expect(html({ politica: { domingoRecargoPct: 80 } })).not.toContain("data-sugerido");
  });
});
