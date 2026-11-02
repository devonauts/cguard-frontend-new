import { describe, expect, it } from "vitest";

import { nombreDeRol, nombreDeRolRef } from "./nombreDeRol";

const t = (key: string, o: { defaultValue: string }) =>
  key === "adminOfficeUsers.roleNames.dispatcher"
    ? "Despachador"
    : key === "adminOfficeUsers.roleNames.administrativeAssistant"
      ? "Asistente Administrativo"
      : o.defaultValue;

describe("nombreDeRol", () => {
  it("translates built-in slugs, whatever their case", () => {
    expect(nombreDeRol("dispatcher", t)).toBe("Despachador");
    expect(nombreDeRol("administrativeAssistant", t)).toBe(
      "Asistente Administrativo",
    );
  });

  it("keeps a custom role's own name", () => {
    expect(nombreDeRol("Jefe de turno", t)).toBe("Jefe de turno");
  });

  it("reads the role whether it comes as a slug or as an object", () => {
    expect(nombreDeRolRef({ id: "uuid", name: "dispatcher" }, t)).toBe(
      "Despachador",
    );
    expect(
      nombreDeRolRef({ id: "uuid", slug: "administrativeAssistant" }, t),
    ).toBe("Asistente Administrativo");
    expect(nombreDeRolRef(null, t)).toBeNull();
  });
});
