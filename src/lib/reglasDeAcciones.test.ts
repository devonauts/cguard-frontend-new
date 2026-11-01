import { describe, expect, it } from "vitest";

import { ACCIONES, motivoParaNo, NIVEL, type Contexto } from "./reglasDeAcciones";

const ctx = (perms: string[], nivel: number | null, conDinero: boolean | null = true): Contexto => ({
  esAdmin: false,
  tienePermiso: (p) => perms.includes(p),
  nivel,
  conDinero,
});

describe("reglasDeAcciones · the buttons mirror the server", () => {
  it("Registrar entrada: its own permission or attendanceEdit (roles not yet synced); a dispatcher neither", () => {
    const r = ACCIONES["cobertura.registrarEntrada"];
    expect(motivoParaNo(r, ctx(["coverageClockInOnBehalf"], NIVEL.SUPERVISION))).toBeNull();
    expect(motivoParaNo(r, ctx(["attendanceEdit"], NIVEL.SUPERVISION))).toBeNull();
    expect(motivoParaNo(r, ctx(["coverageCreate", "coverageRead"], NIVEL.CENTRAL))).toBe("permiso");
  });

  it("RR. HH. (attendanceRead, no attendanceApprove) does not see Novedades/Aprobaciones buttons", () => {
    const rrhh = ctx(["attendanceRead", "attendanceSettingsEdit"], NIVEL.RRHH);
    expect(motivoParaNo(ACCIONES["asistencia.resolverNovedad"], rrhh)).toBe("permiso");
    expect(motivoParaNo(ACCIONES["asistencia.aprobarSolicitud"], rrhh)).toBe("permiso");
  });

  it("RR. HH. is the payroll person: approves, reopens and exports cards", () => {
    const rrhh = ctx(["attendanceSettingsEdit", "attendanceRead"], NIVEL.RRHH);
    expect(motivoParaNo(ACCIONES["tarjetas.aprobar"], rrhh)).toBeNull();
    expect(motivoParaNo(ACCIONES["tarjetas.reabrir"], rrhh)).toBeNull();
    expect(motivoParaNo(ACCIONES["tarjetas.exportar"], rrhh)).toBeNull();
    // Reopening a CLOSED period is management (90) on the server.
    expect(motivoParaNo(ACCIONES["tarjetas.reabrirPeriodo"], rrhh)).toBe("nivel");
  });

  it("a supervisor approves hours through the alternative rule; a dispatcher does not", () => {
    const sup = ctx(["attendanceApprove"], NIVEL.SUPERVISION);
    const disp = ctx(["attendanceApprove"], NIVEL.CENTRAL);
    expect(motivoParaNo(ACCIONES["tarjetas.aprobar"], sup)).toBeNull();
    expect(motivoParaNo(ACCIONES["tarjetas.aprobar"], disp)).not.toBeNull();
  });

  it("money without Roles de pago or Gusto: «módulo», even for an admin", () => {
    const admin: Contexto = { esAdmin: true, tienePermiso: () => true, nivel: 100, conDinero: false };
    expect(motivoParaNo(ACCIONES["tarjetas.tarifas"], admin)).toBe("modulo");
    expect(motivoParaNo(ACCIONES["asistencia.aprobarParaPago"], admin)).toBe("modulo");
    // Hours stay available.
    expect(motivoParaNo(ACCIONES["tarjetas.generar"], admin)).toBeNull();
  });

  it("a custom role at OFFICE level edits the schedule when it holds stationEdit", () => {
    expect(motivoParaNo(ACCIONES["turnos.editarHorario"], ctx(["stationEdit"], NIVEL.OFICINA))).toBeNull();
    expect(motivoParaNo(ACCIONES["turnos.editarHorario"], ctx(["stationEdit"], NIVEL.VIGILANTE))).toBe("nivel");
    expect(motivoParaNo(ACCIONES["turnos.editarHorario"], ctx(["stationRead"], NIVEL.OFICINA))).toBe("permiso");
  });

  it("unknown level (old session) does not hide anything the permission allows", () => {
    expect(motivoParaNo(ACCIONES["cobertura.registrar"], ctx(["coverageCreate"], null))).toBeNull();
  });
});

describe("layout background reads · only for roles the server lets in (QA 2026-11-01)", () => {
  const ctx = (perms: string[], nivel: number) => ({
    esAdmin: false,
    tienePermiso: (p: string) => perms.includes(p),
    nivel,
    conDinero: null,
  });
  // The office assistant: settings readable, no alarm cases, no radio, level 52.
  const secretaria = ctx(["settingsRead", "attendanceRead"], 52);
  const admin = ctx(["settingsRead", "businessInfoRead", "radioCheckRead"], 100);

  it("the office assistant does not ask for alarm cases, the billing summary or the radio console", () => {
    expect(motivoParaNo(ACCIONES["alarmas.verCasos"], secretaria)).toBe("permiso");
    expect(motivoParaNo(ACCIONES["suscripcion.verResumen"], secretaria)).toBe("nivel");
    expect(motivoParaNo(ACCIONES["radio.verConsola"], secretaria)).toBe("permiso");
  });

  it("an admin asks for all three", () => {
    expect(motivoParaNo(ACCIONES["alarmas.verCasos"], admin)).toBeNull();
    expect(motivoParaNo(ACCIONES["suscripcion.verResumen"], admin)).toBeNull();
    expect(motivoParaNo(ACCIONES["radio.verConsola"], admin)).toBeNull();
  });
});
