import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ApiService } from "../services/api/apiService";

import { pedirPrimerosPasos, olvidarPrimerosPasos } from "./usePrimerosPasos";

/** QA 2026-11-01: the Panel asked for getting-started twice per load. */
describe("usePrimerosPasos · one request at a time", () => {
  let get: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    olvidarPrimerosPasos();
    get = vi.spyOn(ApiService, "get");
  });
  afterEach(() => vi.restoreAllMocks());

  it("a request on its way answers every reader, «fresco» included", async () => {
    let soltar: (v: unknown) => void = () => undefined;

    get.mockImplementation(() => new Promise((r) => { soltar = r; }) as never);
    const a = pedirPrimerosPasos("t-1", true);
    const b = pedirPrimerosPasos("t-1", true);
    const c = pedirPrimerosPasos("t-1");

    await new Promise((r) => setTimeout(r, 0));
    expect(get).toHaveBeenCalledTimes(1);
    soltar({ steps: [] });
    await Promise.all([a, b, c]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("once answered, «fresco» asks again and the cached read does not", async () => {
    get.mockResolvedValue({ steps: [] } as never);
    await pedirPrimerosPasos("t-1", true);
    await pedirPrimerosPasos("t-1");
    expect(get).toHaveBeenCalledTimes(1);
    await pedirPrimerosPasos("t-1", true);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
