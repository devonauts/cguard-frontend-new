import { describe, expect, it } from "vitest";

import { tituloConMarca } from "./usePageTitle";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA PESTAÑA TAMBIÉN ES DEL ANFITRIÓN
 *
 * Las pantallas de acceso traen su título de i18n con el nombre ya pegado
 * («Iniciar sesión | Cguard», y su equivalente en los ocho idiomas), así que en
 * el anfitrión de un socio la pestaña seguía diciendo el nuestro por bien que
 * estuviera la página. La pestaña es lo que se ve todo el día.
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("tituloConMarca", () => {

  it("LA QUE IMPORTA · cambia nuestro nombre por el del socio", () => {
    expect(tituloConMarca("Iniciar sesión | Cguard", "CGuard Internal Pilot"))
      .toBe("Iniciar sesión | CGuard Internal Pilot");
  });

  it("vale para los ocho idiomas, que llevan todos la misma forma", () => {
    const casos: Array<[string, string]> = [
      ["Sign in | Cguard", "Sign in | Alfa"],
      ["Anmelden | Cguard", "Anmelden | Alfa"],
      ["Connexion | Cguard", "Connexion | Alfa"],
      ["Accedi | Cguard", "Accedi | Alfa"],
      ["Inloggen | Cguard", "Inloggen | Alfa"],
      ["Logowanie | Cguard", "Logowanie | Alfa"],
      ["Entrar | Cguard", "Entrar | Alfa"],
      ["Activa tu cuenta | CGuard Pro", "Activa tu cuenta | Alfa"],
    ];
    for (const [entrada, esperado] of casos) {
      expect(tituloConMarca(entrada, "Alfa")).toBe(esperado);
    }
  });

  it("un título SIN sufijo también recibe la marca", () => {
    expect(tituloConMarca("¿Olvidaste tu contraseña?", "Alfa"))
      .toBe("¿Olvidaste tu contraseña? | Alfa");
  });

  it("sin marca publicada se deja SÓLO la etiqueta, nunca la nuestra", () => {
    /* Un socio sin nombre publicado no hereda «Cguard» de la traducción. */
    expect(tituloConMarca("Iniciar sesión | Cguard", "")).toBe("Iniciar sesión");
  });

  it("en la plataforma el nombre lo pone el proveedor, y queda igual que antes", () => {
    expect(tituloConMarca("Iniciar sesión | Cguard", "CGuard Pro")).toBe("Iniciar sesión | CGuard Pro");
  });

  it("una entrada vacía no revienta", () => {
    expect(tituloConMarca("", "Alfa")).toBe("Alfa");
  });
});
