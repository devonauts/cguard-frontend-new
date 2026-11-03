import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CODIGO_VERIFICACION_REQUERIDA,
  callarPorVerificacion,
  estadoDeVerificacionConocido,
  marcarVerificacionPendiente,
  notarPerfil,
  seguirLecturaDePerfil,
  verificacionPendiente,
} from "./verificacionPendiente";

afterEach(() => marcarVerificacionPendiente(false));

const rechazo = { messageCode: CODIGO_VERIFICACION_REQUERIDA, code: 403 };

describe("verificacionPendiente", () => {
  // N9 (r4): the dashboard prefetch answers before /auth/me does.
  it("a 403 that beats /auth/me waits for it, then knows the answer", async () => {
    let responder: (p: any) => void = () => {};
    const me = seguirLecturaDePerfil(new Promise((r) => (responder = r)));
    let settled = false;
    const wait = estadoDeVerificacionConocido(4000).then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    responder({ id: "u1", emailVerified: false, tenants: [{ roles: ["admin"] }] });
    await me;
    await wait;
    expect(settled).toBe(true);
    expect(callarPorVerificacion(403, { message: "Prohibido" })).toBe(true);
  });

  it("no /auth/me in flight: no waiting; a read that never answers waits at most maxMs", async () => {
    await expect(estadoDeVerificacionConocido(1)).resolves.toBeUndefined();
    vi.useFakeTimers();
    void seguirLecturaDePerfil(new Promise(() => {}));
    let settled = false;
    const wait = estadoDeVerificacionConocido(4000).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(3999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await wait;
    expect(settled).toBe(true);
    vi.useRealTimers();
  });

  it("a failed /auth/me releases the wait", async () => {
    const me = seguirLecturaDePerfil(Promise.reject(new Error("503")));
    await expect(me).rejects.toThrow("503");
    await expect(estadoDeVerificacionConocido(10_000)).resolves.toBeUndefined();
  });

  it("silences only 403s, and only while the verify-email screen is up", () => {
    expect(callarPorVerificacion(403)).toBe(false);
    marcarVerificacionPendiente(true);
    expect(callarPorVerificacion(403)).toBe(true);
    expect(callarPorVerificacion(500)).toBe(false);
    expect(callarPorVerificacion(400)).toBe(false);
    marcarVerificacionPendiente(false);
    expect(callarPorVerificacion(403)).toBe(false);
  });

  // N9 (r4): the dashboard prefetch answers before any screen exists.
  it("the server's own «verify your email» 403 is silent with no screen yet, and quiets the rest", () => {
    expect(callarPorVerificacion(403, rechazo)).toBe(true);
    expect(verificacionPendiente()).toBe(true);
    // A bare 403 of the same burst (endpoints that refuse on their own).
    expect(callarPorVerificacion(403, { message: "Prohibido" })).toBe(true);
  });

  it("a plain 403 with no pending verification still toasts", () => {
    expect(callarPorVerificacion(403, { messageCode: "auth.forbidden" })).toBe(false);
    expect(callarPorVerificacion(403, null)).toBe(false);
  });

  it("/auth/me decides it as soon as it answers", () => {
    notarPerfil({ id: "u1", emailVerified: false, tenants: [{ roles: ["admin"] }] });
    expect(verificacionPendiente()).toBe(true);
    notarPerfil({ id: "u1", emailVerified: true, tenants: [{ roles: ["admin"] }] });
    expect(verificacionPendiente()).toBe(false);
  });

  it("a platform superadmin never gets the screen, so nothing is silenced", () => {
    notarPerfil({ id: "s1", emailVerified: false, isSuperadmin: true });
    expect(verificacionPendiente()).toBe(false);
  });

  it("an empty profile changes nothing", () => {
    marcarVerificacionPendiente(true);
    notarPerfil(null);
    expect(verificacionPendiente()).toBe(true);
  });
});
