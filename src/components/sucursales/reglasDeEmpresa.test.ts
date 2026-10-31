import { describe, expect, it } from "vitest";

import { esRutaDeReglaDeEmpresa } from "./reglasDeEmpresa";

describe("reglasDeEmpresa · qué páginas son reglas de toda la empresa", () => {
  it("las reglas de asistencia, nómina y configuración general", () => {
    for (const r of [
      "/nomina/settings",
      "/nomina/roles/configuracion",
      "/setting/festivos",
      "/setting/politicas",
      "/setting/integraciones/gusto",
      "/setting/seguridad",
      "/setting/marca",
      "/setting/comunicaciones",
    ]) {
      expect(esRutaDeReglaDeEmpresa(r), r).toBe(true);
    }
  });

  it("lo operativo de la sucursal no", () => {
    for (const r of [
      "/nomina",
      "/nomina/roles",
      "/setting/user-roles",
      "/setting/notifications",
      "/dobletes",
      "/programador",
    ]) {
      expect(esRutaDeReglaDeEmpresa(r), r).toBe(false);
    }
  });
});
