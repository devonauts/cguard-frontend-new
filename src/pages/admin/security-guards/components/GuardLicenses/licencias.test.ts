import { describe, expect, it, vi } from "vitest";

// fileUrl pulls the HTTP client, which reads the browser's storage on load.
vi.hoisted(() => {
  const mem = new Map<string, string>();

  (globalThis as { localStorage?: unknown }).localStorage ??= {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
  };
});

import { enlaceDeImagen, licenciaIncompleta } from "./licencias";

describe("enlaceDeImagen", () => {
  it("opens the server download link, never the bare storage path", () => {
    const href = enlaceDeImagen({
      privateUrl: "tenant/t1/securityGuardLicenseImage/abc/front.png",
      downloadUrl: "https://api.example/api/file/download?fileToken=v2.x",
    });

    expect(href).toBe("https://api.example/api/file/download?fileToken=v2.x");
  });

  it("builds an API link when only the storage path came back", () => {
    const href = enlaceDeImagen({
      privateUrl: "tenant/t1/securityGuardLicenseImage/abc/front.png",
    });

    expect(href).toMatch(/\/file\/download\?privateUrl=tenant%2Ft1%2F/);
    expect(href).not.toMatch(/^tenant\//);
  });

  it("is null without a file", () => {
    expect(enlaceDeImagen(null)).toBeNull();
  });
});

describe("licenciaIncompleta", () => {
  const vacia = { licenseType: "", customLicenseName: "", licenseNumber: "" };

  it("refuses an empty license", () => {
    expect(licenciaIncompleta(vacia)).toBe("tipo");
  });

  it("asks for the number once the type is chosen", () => {
    expect(licenciaIncompleta({ ...vacia, licenseType: "lt1" })).toBe("numero");
    expect(
      licenciaIncompleta({ ...vacia, customLicenseName: "Porte de armas" }),
    ).toBe("numero");
  });

  it("«other» without a name is not a type", () => {
    expect(
      licenciaIncompleta({ ...vacia, licenseType: "other", licenseNumber: "1" }),
    ).toBe("tipo");
  });

  it("accepts type + number", () => {
    expect(
      licenciaIncompleta({ ...vacia, licenseType: "lt1", licenseNumber: " 9 " }),
    ).toBeNull();
  });
});
