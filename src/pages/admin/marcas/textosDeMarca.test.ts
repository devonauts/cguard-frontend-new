import { describe, expect, it } from "vitest";

import { cuantosTextos, datosDeTextos, textosDe, tieneMetodosPropios } from "./textosDeMarca";

import { seccionesConMultimarca } from "../../../config/reportesDeMultimarca";

describe("phase 5 · a brand's invoice texts", () => {
  it("starts from the brand: empty strings, every built-in method in order", () => {
    const b = textosDe({
      billingTexts: {
        invoiceTitle: null, invoiceDefaultNotes: null, invoiceTerms: "15 días", invoiceFooter: "Gracias",
        paymentInstructions: null, quoteTitle: null, quoteDefaultIntro: null, quoteTerms: null, quoteClosing: null,
        quoteFooter: null, reportFooterText: null,
        paymentMethods: [{ method: "check", enabled: true, description: "A nombre de Beta" }],
      },
    });

    expect(b.invoiceTerms).toBe("15 días");
    expect(b.invoiceTitle).toBe("");
    expect(b.metodos.map((m) => m.method)).toEqual(["transfer", "directDeposit", "wire", "check", "card", "cash"]);
    expect(b.metodos.find((m) => m.method === "check")?.description).toBe("A nombre de Beta");
    expect(cuantosTextos(b)).toBe(3);
  });

  it("to the server: empty = null, one-line titles, methods only when set", () => {
    const b = textosDe(null);

    b.invoiceTitle = "  Factura\n de servicios ";
    b.invoiceFooter = "   ";
    const d = datosDeTextos(b);

    expect(d.invoiceTitle).toBe("Factura de servicios");
    expect(d.invoiceFooter).toBeNull();
    expect(d.paymentMethods).toBeNull();
    expect(tieneMetodosPropios(b.metodos)).toBe(false);
    b.metodos[0] = { ...b.metodos[0], enabled: true, description: " Banco Bolivariano 9900-77 " };
    const d2 = datosDeTextos(b);

    expect(d2.paymentMethods?.[0]).toEqual({
      method: "transfer", builtin: true, label: null, enabled: true, description: "Banco Bolivariano 9900-77", note: null,
    });
    expect(d2.paymentMethods).toHaveLength(6);
  });
});

describe("phase 5 · the reports center card", () => {
  it("«Horas entre marcas» joins the payroll section only with the module", () => {
    const base = [
      { id: "general", title: "G", reports: [] },
      { id: "payroll", title: "P", reports: [{ id: "x", title: "X", description: "", href: "/x" }] },
    ];

    expect(seccionesConMultimarca(base, false)).toBe(base);
    const con = seccionesConMultimarca(base, true);

    expect(con[1].reports.map((r) => r.href)).toEqual(["/reports/horas-entre-marcas", "/x"]);
    expect(con[0].reports).toEqual([]);
  });
});
