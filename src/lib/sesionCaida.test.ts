import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { cerrarSesionDeCodigo, sacarDeLaSesion } = vi.hoisted(() => ({
  cerrarSesionDeCodigo: vi.fn(async () => {}),
  sacarDeLaSesion: vi.fn(async () => {}),
}));

vi.mock("./sesionDeCodigo", () => ({ cerrarSesionDeCodigo }));
vi.mock("./accesoBloqueado", () => ({
  RUTA_ACCESO_BLOQUEADO: "/acceso-bloqueado",
  esAccesoBloqueado: (d: any) => d?.code === "auth.accessBlocked",
  sacarDeLaSesion,
}));

const { cerrarPorSesionCaida } = await import("./sesionCaida");

function almacen() {
  const m = new Map<string, string>();

  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    _m: m,
  };
}

let local: ReturnType<typeof almacen>;
let sesion: ReturnType<typeof almacen>;
let replace: ReturnType<typeof vi.fn>;

function en(ruta: string) {
  replace = vi.fn();
  vi.stubGlobal("window", { location: { pathname: ruta, replace } });
}

beforeEach(() => {
  local = almacen();
  sesion = almacen();
  local.setItem("authToken", "TOK");
  local.setItem("authUserCache", "{}");
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", sesion);
  cerrarSesionDeCodigo.mockClear();
  sacarDeLaSesion.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("401 con sesión: un solo cierre para los dos clientes HTTP", () => {
  it("sesión superada: borra la sesión, guarda el motivo y va al login", () => {
    en("/dashboard");
    expect(cerrarPorSesionCaida({ code: "auth.sessionSuperseded" }, "Tu sesión se abrió en otro equipo")).toBe(true);
    expect(local.getItem("authToken")).toBeNull();
    expect(local.getItem("authUserCache")).toBeNull();
    expect(sesion.getItem("authExitReason")).toBe("Tu sesión se abrió en otro equipo");
    expect(cerrarSesionDeCodigo).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("acceso bloqueado: va por su propio cierre, no al login", () => {
    en("/dashboard");
    expect(cerrarPorSesionCaida({ code: "auth.accessBlocked" }, "x")).toBe(true);
    expect(sacarDeLaSesion).toHaveBeenCalledWith({ motivo: "bloqueo" });
    expect(replace).not.toHaveBeenCalled();
    expect(local.getItem("authToken")).toBe("TOK");
  });

  it("ya en /login o en «Acceso bloqueado» no hace nada (sin bucle)", () => {
    en("/login");
    expect(cerrarPorSesionCaida({ code: "auth.sessionSuperseded" }, "x")).toBe(false);
    en("/acceso-bloqueado");
    expect(cerrarPorSesionCaida({ code: "auth.accessBlocked" }, "x")).toBe(false);
    expect(replace).not.toHaveBeenCalled();
    expect(local.getItem("authToken")).toBe("TOK");
  });
});
