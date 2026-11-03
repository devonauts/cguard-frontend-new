import { describe, expect, it } from "vitest";

import { DevtoolsClock } from "./puertaEnVivo";

// One tick per second, as the page does; `respuesta` = when the worker last answered.
function run(
  clock: DevtoolsClock,
  desde: number,
  segundos: number,
  opts: { visible?: boolean; callado?: boolean } = {},
) {
  let ultima = desde;
  let reporte: number | null = null;

  for (let i = 1; i <= segundos && reporte === null; i++) {
    const ahora = desde + i * 1000;

    if (!opts.callado) ultima = ahora;
    const r = clock.tick(ahora, opts.visible ?? true, ultima);

    ultima = r.ultimaRespuesta;
    reporte = r.segundos;
  }

  return reporte;
}

describe("DevtoolsClock", () => {
  it("reports after 30 s of a silent worker on a visible sign-in page", () => {
    const c = new DevtoolsClock("entrada", 0);

    expect(run(c, 0, 40, { callado: true })).toBeGreaterThanOrEqual(30);
  });

  it("waits 60 s with a session", () => {
    const c = new DevtoolsClock("sesion", 0);

    expect(run(c, 0, 45, { callado: true })).toBeNull();
  });

  it("never reports while the worker answers", () => {
    const c = new DevtoolsClock("entrada", 0);

    expect(run(c, 0, 120)).toBeNull();
  });

  it("never reports on a hidden tab", () => {
    const c = new DevtoolsClock("entrada", 0);

    expect(run(c, 0, 120, { callado: true, visible: false })).toBeNull();
  });

  it("a sleeping computer does not count as hours open (ENTEC 2026-11-03)", () => {
    const c = new DevtoolsClock("entrada", 0);

    // One slow tick before sleeping starts the count...
    expect(c.tick(1000, true, -1000).segundos).toBeNull();
    // ...then 5.6 h without ticks; the first tick on waking comes before the
    // worker's answer.
    const despierta = 1000 + 20_379_000;
    const r = c.tick(despierta, true, -1000);

    expect(r.segundos).toBeNull();
    expect(r.ultimaRespuesta).toBe(despierta);
    // And the worker answering right after keeps it closed.
    expect(run(c, despierta, 60)).toBeNull();
  });
});
