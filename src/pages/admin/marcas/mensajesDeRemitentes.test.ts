import type { TFunction } from "i18next";

import { describe, expect, it } from "vitest";

import { mensajeDeRemitente } from "./mensajesDeRemitentes";

// Returns the key, so the test sees which message was chosen.
const t = ((k: string) => k) as unknown as TFunction;

describe("multimarca phase 5 · sender refusals in plain words", () => {
  it("each server reason has its own message", () => {
    expect(mensajeDeRemitente(t, "brand_sender_number_taken")).toBe(
      "ui.RemitentesDeMarca.errores.ocupado",
    );
    expect(mensajeDeRemitente(t, "brand_sender_is_company_number")).toBe(
      "ui.RemitentesDeMarca.errores.esDeLaEmpresa",
    );
    expect(mensajeDeRemitente(t, "brand_sender_no_sms_account")).toBe(
      "ui.RemitentesDeMarca.errores.sinCuentaSms",
    );
    expect(mensajeDeRemitente(t, "NO_SUBACCOUNT")).toBe(
      "ui.RemitentesDeMarca.errores.sinCuentaSms",
    );
    expect(mensajeDeRemitente(t, "brand_sender_no_company_whatsapp")).toBe(
      "ui.RemitentesDeMarca.errores.sinWaEmpresa",
    );
  });

  it("brand and access refusals keep their own wording; anything else is generic", () => {
    expect(mensajeDeRemitente(t, "brand_slots_exhausted")).toBe(
      "ui.MarcasPage.errores.sinCupos",
    );
    expect(mensajeDeRemitente(t, "something_else")).toBe(
      "ui.RemitentesDeMarca.errores.generico",
    );
  });
});
