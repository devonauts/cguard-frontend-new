import { describe, expect, it } from "vitest";

import { vistaDelPaso } from "./proximoPaso";

describe("estado vacío · el siguiente paso", () => {
  it("a step the person can take is a button", () => {
    expect(
      vistaDelPaso({ label: "Nuevo vigilante", to: "/personal/nueva" }, "x"),
    ).toEqual({
      modo: "boton",
      label: "Nuevo vigilante",
      to: "/personal/nueva",
      onClick: undefined,
    });
  });

  it("a step they can't take says why, or who can", () => {
    expect(
      vistaDelPaso(
        {
          label: "Crear",
          to: "/x",
          puede: false,
          porQueNo: "Necesitas el permiso «Crear estaciones».",
        },
        "Pídeselo a un administrador.",
      ),
    ).toEqual({
      modo: "aviso",
      texto: "Necesitas el permiso «Crear estaciones».",
    });
    expect(
      vistaDelPaso(
        { label: "Crear", to: "/x", puede: false },
        "Pídeselo a un administrador.",
      ),
    ).toEqual({ modo: "aviso", texto: "Pídeselo a un administrador." });
  });

  it("no step, or a step with nowhere to go, shows nothing", () => {
    expect(vistaDelPaso(null, "x")).toEqual({ modo: "nada" });
    expect(vistaDelPaso({ label: "Ir" }, "x")).toEqual({ modo: "nada" });
  });
});
