import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The desktop bridge (shell 1.1.0): session from the shell, sign-out, the
 * `desktop.*` error routing, and that the web keeps its behaviour when the
 * bridge is missing. Node environment: `window` is stubbed per test.
 */

type Puente = Record<string, any>;

function puenteFalso(extra: Puente = {}): Puente {
  return {
    version: "1.1.0",
    getSession: vi.fn(async () => ({ token: "tok-dev" })),
    signedIn: vi.fn(async () => undefined),
    signedOut: vi.fn(async () => undefined),
    deviceProblem: vi.fn(),
    onUpdateReady: vi.fn(() => () => undefined),
    setBadge: vi.fn(),
    onDeepLink: vi.fn(),
    ...extra,
  };
}

async function cargar(puente: Puente | null) {
  vi.resetModules();
  (globalThis as any).window = puente ? { cguardDesktop: puente } : {};
  const m = await import("./desktop");

  m._resetDesktopForTests();

  return m;
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  delete (globalThis as any).window;
});

describe("desktop bridge · session", { timeout: 30_000 }, () => {
  it("web (no bridge): nothing changes, boot mounts without touching storage", async () => {
    const m = await cargar(null);
    const apply = vi.fn();

    expect(m.isDesktop()).toBe(false);
    expect(await m.loadDesktopSession()).toBeUndefined();
    expect(await m.bootDesktopSession(apply)).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(m.notifyDesktopSignedOut("/login")).toBe(false);
    expect(await m.handOffToDesktop("tok")).toBe(false);
  });

  it("a pre-1.1 shell (no getSession) keeps the old localStorage path", async () => {
    const m = await cargar({ setBadge: vi.fn(), onDeepLink: vi.fn() });
    const apply = vi.fn();

    expect(m.isDesktop()).toBe(true);
    expect(await m.bootDesktopSession(apply)).toBe(true);
    expect(apply).not.toHaveBeenCalled();
  });

  it("boot clears the stored token first, then applies the shell's", async () => {
    const p = puenteFalso({
      getSession: vi.fn(async () => ({ token: "  tok-dev  " })),
    });
    const m = await cargar(p);
    const apply = vi.fn();

    expect(await m.bootDesktopSession(apply)).toBe(true);
    expect(apply.mock.calls).toEqual([[null], ["tok-dev"]]);
    expect(p.signedOut).not.toHaveBeenCalled();
  });

  it("no session → signedOut(), no mount", async () => {
    const p = puenteFalso({ getSession: vi.fn(async () => null) });
    const m = await cargar(p);
    const apply = vi.fn();

    expect(await m.bootDesktopSession(apply)).toBe(false);
    expect(apply.mock.calls).toEqual([[null]]);
    expect(p.signedOut).toHaveBeenCalledWith();
  });

  it("a failing or hanging getSession is treated as no session", async () => {
    const roto = puenteFalso({
      getSession: vi.fn(async () => Promise.reject(new Error("x"))),
    });
    const m1 = await cargar(roto);

    expect(await m1.bootDesktopSession(vi.fn())).toBe(false);

    const colgado = puenteFalso({
      getSession: vi.fn(() => new Promise(() => undefined)),
    });
    const m2 = await cargar(colgado);

    expect(await m2.bootDesktopSession(vi.fn(), 20)).toBe(false);
    expect(colgado.signedOut).toHaveBeenCalledWith();
  });

  it("signedOut is sent once per page, with no arguments", async () => {
    const p = puenteFalso();
    const m = await cargar(p);

    expect(m.notifyDesktopSignedOut("/login")).toBe(true);
    expect(m.notifyDesktopSignedOut("/acceso-bloqueado?ref=ABC-123")).toBe(
      true,
    );
    expect(p.signedOut).toHaveBeenCalledTimes(1);
    expect(p.signedOut).toHaveBeenCalledWith();
  });

  it("hand-off: signedIn(token); a refusal is reported as false", async () => {
    const p = puenteFalso();
    const m = await cargar(p);

    expect(await m.handOffToDesktop("tok-pending")).toBe(true);
    expect(p.signedIn).toHaveBeenCalledWith("tok-pending");

    p.signedIn.mockRejectedValueOnce(new Error("not a desktop token"));
    expect(await m.handOffToDesktop("tok-x")).toBe(false);
  });

  it("a rotated token goes to the shell through signedIn", async () => {
    const p = puenteFalso();
    const m = await cargar(p);

    m.notifyDesktopSessionUpdated("t2");
    expect(p.signedIn).toHaveBeenCalledWith("t2");
    expect(() => m.notifyDesktopSessionUpdated("")).not.toThrow();
  });

  it("apiBase and locale from the shell (https only)", async () => {
    const m = await cargar(
      puenteFalso({
        apiBase: "https://api.example.test/api/",
        locale: " es-EC ",
      }),
    );

    expect(m.desktopApiBase()).toBe("https://api.example.test/api");
    expect(m.desktopLocale()).toBe("es-EC");

    const m2 = await cargar(puenteFalso({ apiBase: "http://evil.test/api" }));

    expect(m2.desktopApiBase()).toBeNull();
    expect(m2.desktopLocale()).toBeNull();
  });

  it("applyDesktopUpdate prefers the shell's applyUpdate", async () => {
    const applyUpdate = vi.fn(async () => undefined);
    const m = await cargar(puenteFalso({ applyUpdate }));

    await m.applyDesktopUpdate();
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("desktop bridge · desktop.* errors", () => {
  it("reads the code from `code` or from `messageCode`, only on 401/403", async () => {
    const m = await cargar(puenteFalso());

    expect(m.desktopErrorCode(403, { code: "desktop.deviceNotApproved" })).toBe(
      "desktop.deviceNotApproved",
    );
    expect(
      m.desktopErrorCode(401, {
        code: 401,
        messageCode: "desktop.deviceProofInvalid",
      }),
    ).toBe("desktop.deviceProofInvalid");
    expect(
      m.desktopErrorCode(500, { code: "desktop.deviceRevoked" }),
    ).toBeNull();
    expect(
      m.desktopErrorCode(401, { messageCode: "auth.accessBlocked" }),
    ).toBeNull();
    expect(m.desktopErrorCode(403, "desktop.deviceRevoked")).toBeNull();
  });

  it("never in a browser: the normal 401 path stays", async () => {
    const m = await cargar(null);

    expect(
      m.desktopErrorCode(403, { code: "desktop.deviceRevoked" }),
    ).toBeNull();
    expect(
      m.handleDesktopApiError(403, { code: "desktop.deviceRevoked" }),
    ).toBe(false);
  });

  it("hands the code to the shell, once per 10 s per code", async () => {
    const p = puenteFalso();
    const m = await cargar(p);

    expect(
      m.handleDesktopApiError(403, { code: "desktop.deviceRevoked" }),
    ).toBe(true);
    expect(
      m.handleDesktopApiError(403, { code: "desktop.deviceRevoked" }),
    ).toBe(true);
    expect(
      m.handleDesktopApiError(401, {
        messageCode: "desktop.deviceProofInvalid",
      }),
    ).toBe(true);
    expect(p.deviceProblem.mock.calls).toEqual([
      ["desktop.deviceRevoked"],
      ["desktop.deviceProofInvalid"],
    ]);
    expect(
      m.reportDeviceProblem("desktop.deviceRevoked", Date.now() + 11_000),
    ).toBe(true);
    expect(p.deviceProblem).toHaveBeenCalledTimes(3);
  });
});

describe("desktop bridge · new build", () => {
  it("normalises the shell's notice and returns an unsubscribe", async () => {
    let avisar: (i: any) => void = () => undefined;
    const off = vi.fn();
    const p = puenteFalso({
      onUpdateReady: vi.fn((cb: any) => {
        avisar = cb;

        return off;
      }),
    });
    const m = await cargar(p);
    const cb = vi.fn();
    const quitar = m.onDesktopUpdateReady(cb);

    avisar({ buildId: 42, required: "yes" });
    expect(cb).toHaveBeenCalledWith({ buildId: "42", required: false });
    quitar();
    expect(off).toHaveBeenCalled();
  });

  it("web: a no-op", async () => {
    const m = await cargar(null);

    expect(typeof m.onDesktopUpdateReady(vi.fn())).toBe("function");
  });
});

describe("session-cookie module in the desktop", () => {
  it("closing the session tells the shell and never calls /__sesion", async () => {
    const p = puenteFalso();

    vi.resetModules();
    (globalThis as any).window = {
      cguardDesktop: p,
      location: { protocol: "app:" },
    };
    const f = vi.fn();

    vi.stubGlobal("fetch", f);
    const d = await import("./desktop");

    d._resetDesktopForTests();
    const s = await import("./sesionDeCodigo");

    await s.cerrarSesionDeCodigo();
    expect(p.signedOut).toHaveBeenCalledTimes(1);
    expect(await s.abrirSesionDeCodigo("tok")).toBe("fallo");
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
