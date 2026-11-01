import { afterEach, describe, expect, it, vi } from "vitest";

/* Prynt only computes its Pro signals (VPN, Tor, incognito, tampering, risk
   and the allow/challenge/block decision) when the agent asks for them with
   `extendedResult: true`. Without the flag a Pro tenant gets identification
   only — which is how CGuard went 8 days with 0 events carrying `vpn`.
   (Mocked by relative path: the test files sit outside tsconfig `paths`.) */
const { load } = vi.hoisted(() => ({
  load: vi.fn(async (_config: Record<string, unknown>) => ({
    identify: async () => ({ requestId: "req-1", visitorId: "vis-1" }),
  })),
}));

vi.mock("../../vendor/prynt.mjs", () => ({ default: { load, version: "test" } }));
vi.mock("@fingerprintjs/fingerprintjs", () => ({
  default: { load: async () => ({ get: async () => ({ visitorId: "fp-1" }) }) },
}));
vi.mock("../../lib/apiBase", () => ({
  resolveApiBase: () => "https://api.example.test/api",
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Prynt on the auth screens", () => {
  it("asks Prynt for the Pro signal set and returns the request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ publicKey: "pk_test", endpoint: "https://api.pryntid.com" }),
      })),
    );
    const { deviceSignals } = await import("./deviceFingerprint");
    const s = await deviceSignals();

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "pk_test",
        endpoint: "https://api.pryntid.com",
        extendedResult: true,
      }),
    );
    expect(s.pryntRequestId).toBe("req-1");
  });
});
