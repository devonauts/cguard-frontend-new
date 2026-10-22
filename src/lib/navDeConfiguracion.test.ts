import { describe, expect, it } from "vitest";
import menu from "../data/sidebar-menu.json";
import { seccionesDeConfiguracion } from "./navDeConfiguracion";

/**
 * Un módulo de pago no se anuncia donde la empresa no lo tiene: ni en la
 * portada de Configuración, ni en su índice lateral, ni en el buscador (los
 * tres leen `seccionesDeConfiguracion`). El menú lateral lo filtra con `modulo`.
 */
const usuario = (planFeatures: string[] | null) => ({ tenants: [{ tenantId: "t1", planFeatures }] });
const ids = (u: any) => seccionesDeConfiguracion(u).flatMap((s) => s.items.map((i) => i.id));

describe("navegación de Configuración y módulos de pago", () => {
  it("sin el módulo «Roles de pago» su entrada no aparece", () => {
    expect(ids(usuario(["dashboard"]))).not.toContain("payroll-slips");
    expect(ids(usuario(null))).not.toContain("payroll-slips"); // sin datos del plan: cerrado
  });

  it("con el módulo aparece, y el resto de la navegación no cambia", () => {
    const con = ids(usuario(["payroll_slips"]));
    const sin = ids(usuario([]));

    expect(con).toContain("payroll-slips");
    expect(con.filter((i) => i !== "payroll-slips")).toEqual(sin);
  });

  it("cada entrada del menú lateral de Roles de pago lleva la marca del módulo", () => {
    const nomina: any = (menu as any[]).find((m) => m.id === "nomina");
    const deRoles = (nomina.subItems as any[]).filter((s) => String(s.path || "").startsWith("/nomina/roles"));

    expect(deRoles.length).toBeGreaterThan(0);
    for (const s of deRoles) expect(s.modulo).toBe("payroll_slips");
  });
});
