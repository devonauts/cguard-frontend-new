import { beforeAll, describe, expect, it } from "vitest";

/**
 * Signing out empties both storages, but the one sentence for the login screen
 * («Cambiaste tu contraseña. Inicia sesión con la nueva.») must survive it:
 * the change-password page stores it right before signOut().
 */
function memoria() {
  const m = new Map<string, string>();

  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    get length() {
      return m.size;
    },
  };
}

let borrar: () => void;

beforeAll(async () => {
  (globalThis as any).localStorage = memoria();
  (globalThis as any).sessionStorage = memoria();
  borrar = (await import("./AuthContext")).borrarAlmacenamientoDeSesion;
});

describe("borrarAlmacenamientoDeSesion", () => {
  it("clears the session but keeps the sign-out reason", () => {
    sessionStorage.setItem("authExitReason", "Cambiaste tu contraseña.");
    sessionStorage.setItem("authToken", "secret");
    localStorage.setItem("authToken", "secret");

    borrar();

    expect(sessionStorage.getItem("authToken")).toBeNull();
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(sessionStorage.getItem("authExitReason")).toBe("Cambiaste tu contraseña.");
  });

  it("does not invent a reason when there was none", () => {
    sessionStorage.clear();
    borrar();
    expect(sessionStorage.getItem("authExitReason")).toBeNull();
  });
});
