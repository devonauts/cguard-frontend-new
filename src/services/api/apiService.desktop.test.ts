import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The fetch client inside the desktop app: a `desktop.*` 401/403 goes to the
 * shell (`deviceProblem`) and does NOT sign out; any other 401 signs out
 * through the shell (`signedOut`), never through `/__sesion`.
 */

function almacen() {
  const m = new Map<string, string>();

  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

function respuesta(status: number, body: unknown) {
  return {
    ok: status < 400,
    status,
    statusText: "",
    headers: {
      get: (h: string) =>
        h.toLowerCase() === "content-type" ? "application/json" : null,
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone() {
      return this;
    },
  };
}

async function montar(fetchImpl: (...a: any[]) => any) {
  vi.resetModules();
  const puente = {
    getSession: vi.fn(),
    signedIn: vi.fn(),
    signedOut: vi.fn(),
    deviceProblem: vi.fn(),
    onUpdateReady: vi.fn(),
    setBadge: vi.fn(),
    onDeepLink: vi.fn(),
  };
  const replace = vi.fn();
  const ls = almacen();
  const ss = almacen();

  ls.setItem("authToken", "tok-dev");
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("sessionStorage", ss);
  vi.stubGlobal("window", {
    cguardDesktop: puente,
    location: {
      protocol: "app:",
      pathname: "/dashboard",
      origin: "app://crm",
      replace,
    },
    addEventListener: () => undefined,
    dispatchEvent: () => true,
  });
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  const { ApiService } = await import("./apiService");

  return { ApiService, puente, replace, ls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiService in the desktop app", { timeout: 30_000 }, () => {
  it("desktop.deviceRevoked (403) → deviceProblem, no sign-out, token kept", async () => {
    const { ApiService, puente, replace, ls } = await montar(async () =>
      respuesta(403, {
        code: 403,
        messageCode: "desktop.deviceRevoked",
        message: "x",
      }),
    );

    await expect(ApiService.get("/tenant/1/guard")).rejects.toMatchObject({
      status: 403,
    });
    expect(puente.deviceProblem).toHaveBeenCalledWith("desktop.deviceRevoked");
    expect(puente.signedOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(ls.getItem("authToken")).toBe("tok-dev");
  });

  it("desktop.deviceProofInvalid (401, `code` string) → deviceProblem, no sign-out", async () => {
    const { ApiService, puente, replace } = await montar(async () =>
      respuesta(401, { code: "desktop.deviceProofInvalid" }),
    );

    await expect(ApiService.get("/auth/me")).rejects.toMatchObject({
      status: 401,
    });
    expect(puente.deviceProblem).toHaveBeenCalledWith(
      "desktop.deviceProofInvalid",
    );
    expect(puente.signedOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("an ordinary 401 signs out through the shell, not through /__sesion", async () => {
    const llamadas: string[] = [];
    const { ApiService, puente, ls } = await montar(async (url: string) => {
      llamadas.push(String(url));

      return respuesta(401, {
        code: 401,
        messageCode: "auth.sessionSuperseded",
        message: "x",
      });
    });

    await expect(ApiService.get("/tenant/1/guard")).rejects.toMatchObject({
      status: 401,
    });
    expect(puente.signedOut).toHaveBeenCalledTimes(1);
    expect(puente.deviceProblem).not.toHaveBeenCalled();
    expect(ls.getItem("authToken")).toBeNull();
    expect(llamadas.some((u) => u.includes("__sesion"))).toBe(false);
  });
});
