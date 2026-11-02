import { afterEach, describe, expect, it } from "vitest";

import {
  callarPorVerificacion,
  marcarVerificacionPendiente,
} from "./verificacionPendiente";

afterEach(() => marcarVerificacionPendiente(false));

describe("verificacionPendiente", () => {
  it("silences only 403s, and only while the verify-email screen is up", () => {
    expect(callarPorVerificacion(403)).toBe(false);
    marcarVerificacionPendiente(true);
    expect(callarPorVerificacion(403)).toBe(true);
    expect(callarPorVerificacion(500)).toBe(false);
    expect(callarPorVerificacion(400)).toBe(false);
    marcarVerificacionPendiente(false);
    expect(callarPorVerificacion(403)).toBe(false);
  });
});
