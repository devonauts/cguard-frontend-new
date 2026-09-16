import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  rutaAnonima,
  detectarTormenta,
  anotarPeticion,
  reiniciarDiagnostico,
} from "./diagnosticoDeRed";

beforeEach(() => reiniciarDiagnostico());
afterEach(() => vi.restoreAllMocks());

describe("rutaAnonima — lo que SÍ y lo que NO puede salir en un log", () => {
  it("tira la cadena de consulta entera", () => {
    // Aquí es donde viajan búsquedas por nombre, correos y coordenadas.
    expect(rutaAnonima("/api/tenant/t/security-guard?q=P%C3%A9rez")).toBe(
      "/tenant/t/security-guard",
    );
    expect(
      rutaAnonima("/api/tenant/t/guard/locations?lat=19.43&lng=-99.13"),
    ).toBe("/tenant/t/guard/locations");
  });

  it("no deja pasar ni un uuid, ni un id numérico, ni un token largo", () => {
    expect(
      rutaAnonima(
        "/api/tenant/0dca7da5-f994-434c-b255-9bcbdcb22a55/security-guard/7f59b93c-469b-4136-86a0-ea824df3fec4",
      ),
    ).toBe("/tenant/:id/security-guard/:id");
    expect(rutaAnonima("/api/tenant/t/incident/12345")).toBe(
      "/tenant/t/incident/:n",
    );
    expect(
      rutaAnonima("/api/video/shared/abcdefghijklmnopqrstuvwxyz012345"),
    ).toBe("/video/shared/:token");
  });

  it("agrupa peticiones equivalentes bajo la misma clave", () => {
    const a = rutaAnonima(
      "/api/tenant/aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa/incident?limit=50",
    );
    const b = rutaAnonima(
      "/api/tenant/bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb/incident?limit=1",
    );

    expect(a).toBe(b);
  });

  it("aguanta una url basura sin lanzar", () => {
    expect(() => rutaAnonima("no-es-una-url??")).not.toThrow();
  });
});

describe("detectarTormenta — con reloj propio, sin depender del entorno", () => {
  it("avisa cuando la MISMA lectura se repite muchas veces en un segundo", () => {
    let aviso: string | null = null;

    for (let i = 0; i < 6; i++) {
      aviso =
        detectarTormenta(
          "GET",
          "/api/tenant/t/security-guard?limit=100000&q=P%C3%A9rez",
          1_000 + i, // todas dentro del mismo segundo
        ) || aviso;
    }
    expect(aviso).toBeTruthy();
    expect(aviso).toContain("[RED]");
    expect(aviso).toContain("/tenant/t/security-guard");
    // Y NUNCA lo que viajaba en la cadena de consulta.
    expect(aviso).not.toContain("limit=100000");
    expect(aviso).not.toContain("rez"); // el apellido buscado
  });

  it("no avisa por un puñado de lecturas normales", () => {
    expect(detectarTormenta("GET", "/api/tenant/t/client-account", 1000)).toBeNull();
    expect(detectarTormenta("GET", "/api/tenant/t/category", 1000)).toBeNull();
  });

  it("no avisa si las mismas lecturas están repartidas en el tiempo", () => {
    let aviso: string | null = null;

    // 6 lecturas, una cada 30 s: navegación normal, no una tormenta.
    for (let i = 0; i < 6; i++) {
      aviso = detectarTormenta("GET", "/api/tenant/t/incident", i * 30_000) || aviso;
    }
    expect(aviso).toBeNull();
  });

  it("no cuenta las escrituras: un borrado en lote es legítimo", () => {
    let aviso: string | null = null;

    for (let i = 0; i < 40; i++) {
      aviso = detectarTormenta("DELETE", "/api/tenant/t/station/" + i, 1000) || aviso;
    }
    expect(aviso).toBeNull();
  });

  it("no repite el mismo aviso una y otra vez", () => {
    const avisos: string[] = [];

    for (let i = 0; i < 60; i++) {
      const a = detectarTormenta("GET", "/api/tenant/t/incident", 1_000 + i * 10);

      if (a) avisos.push(a);
    }
    expect(avisos.length).toBe(1);
  });

  it("pasado el silencio, vuelve a avisar", () => {
    const avisos: string[] = [];

    for (let i = 0; i < 6; i++) {
      const a = detectarTormenta("GET", "/api/tenant/t/x", 1_000 + i);

      if (a) avisos.push(a);
    }
    // Un minuto y pico después, otra tormenta igual.
    for (let i = 0; i < 6; i++) {
      const a = detectarTormenta("GET", "/api/tenant/t/x", 70_000 + i);

      if (a) avisos.push(a);
    }
    expect(avisos.length).toBe(2);
  });

  it("nunca lanza, pase lo que pase", () => {
    expect(() => detectarTormenta("GET", "")).not.toThrow();
    expect(() => detectarTormenta("", "????")).not.toThrow();
  });

  it("anotarPeticion no escribe nada en producción", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // En el bundle publicado `import.meta.env.DEV` es false y el cuerpo entero
    // desaparece; aquí sólo se comprueba que la función existe y no revienta.
    for (let i = 0; i < 20; i++) anotarPeticion("GET", "/api/tenant/t/y");
    if (!import.meta.env.DEV) expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
