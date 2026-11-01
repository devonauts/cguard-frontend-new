import { describe, expect, it } from "vitest";

import {
  normalizarDescargas,
  normalizarDispositivo,
  normalizarLista,
  urlDeDescarga,
  type DesktopDevice,
} from "../../lib/api/desktopService";
import {
  chipDesdePistas,
  sistemaDesdeAgente,
  tamanoLegible,
} from "../../lib/sistemaDelEquipo";

import {
  accionesPermitidas,
  agrupar,
  clasificarFallo,
  completarCatalogo,
  describirSistema,
  elegirDescarga,
  estadoDelAsistente,
  sinDescargas,
} from "./computadoras";

const fila = (o: Partial<DesktopDevice> & { id: string }): DesktopDevice =>
  normalizarDispositivo({ userId: "u1", status: "pending", ...o })!;

describe("desktop computers · server shapes", () => {
  it("accepts an array or {rows|devices}, keeps canManage, drops junk", () => {
    expect(
      normalizarLista([{ id: "a" }, null, { nope: 1 }]).devices.map(
        (d) => d.id,
      ),
    ).toEqual(["a"]);
    expect(
      normalizarLista({ rows: [{ id: "b" }], canManage: true }),
    ).toMatchObject({
      canManage: true,
      devices: [{ id: "b" }],
    });
    expect(normalizarLista({ devices: [{ id: "c" }] }).canManage).toBeNull();
    expect(normalizarLista(null).devices).toEqual([]);
  });

  it("reads the person from flat fields or a nested user", () => {
    const d = normalizarDispositivo({
      id: "x",
      user: { id: 7, firstName: "Ana", lastName: "Paz", email: "a@x.test" },
      status: "weird",
    })!;

    expect(d).toMatchObject({
      userId: "7",
      userName: "Ana Paz",
      userEmail: "a@x.test",
      status: "pending",
    });
  });

  it("downloads: only the known platforms/archs, availability is explicit", () => {
    const r = normalizarDescargas({
      downloads: [
        {
          platform: "darwin",
          arch: "arm64",
          version: "1.1.0",
          size: 9e7,
          available: true,
        },
        { platform: "win32", arch: "x64", available: "true" },
        { platform: "linux", arch: "x64", available: true },
      ],
    });

    expect(r).toEqual([
      {
        platform: "darwin",
        arch: "arm64",
        version: "1.1.0",
        size: 9e7,
        available: true,
      },
      {
        platform: "win32",
        arch: "x64",
        version: null,
        size: null,
        available: false,
      },
    ]);
  });

  it("download link: relative to the API host, http(s) only", () => {
    expect(
      urlDeDescarga(
        "/api/public/desktop/download?t=abc",
        "https://api.example.test/api",
        "https://app.example.test",
      ),
    ).toBe("https://api.example.test/api/public/desktop/download?t=abc");
    expect(
      urlDeDescarga(
        "https://dl.example.test/x",
        "https://api.example.test/api",
        "https://app.example.test",
      ),
    ).toBe("https://dl.example.test/x");
    expect(
      urlDeDescarga(
        "javascript:alert(1)",
        "https://api.example.test/api",
        "https://app.example.test",
      ),
    ).toBeNull();
    expect(
      urlDeDescarga(
        "",
        "https://api.example.test/api",
        "https://app.example.test",
      ),
    ).toBeNull();
  });
});

describe("desktop computers · grouping and actions", () => {
  const lista = [
    fila({ id: "p-new", requestedAt: "2026-10-31T10:00:00Z" }),
    fila({ id: "p-old", requestedAt: "2026-10-30T10:00:00Z", userId: "u2" }),
    fila({ id: "ok", status: "approved", lastSeenAt: "2026-10-31T09:00:00Z" }),
    fila({
      id: "rv",
      status: "revoked",
      revokedAt: "2026-10-29T09:00:00Z",
      userId: "u2",
    }),
    fila({ id: "rj", status: "rejected", decidedAt: "2026-10-28T09:00:00Z" }),
  ];

  it("pending oldest first; mine = this user's rows", () => {
    const g = agrupar(lista, "u1");

    expect(g.pendientes.map((d) => d.id)).toEqual(["p-old", "p-new"]);
    expect(g.aprobadas.map((d) => d.id)).toEqual(["ok"]);
    expect(g.cerradas.map((d) => d.id)).toEqual(["rv", "rj"]);
    expect(g.mias.map((d) => d.id).sort()).toEqual(["ok", "p-new", "rj"]);
    expect(agrupar(lista, null).mias).toEqual([]);
  });

  it("only admins decide on requests; owners may revoke their approved computer", () => {
    const p = lista[0];
    const a = lista[2];

    expect(accionesPermitidas(p, { administra: true, esMia: false })).toEqual([
      "approve",
      "reject",
    ]);
    expect(accionesPermitidas(p, { administra: false, esMia: true })).toEqual(
      [],
    );
    expect(accionesPermitidas(a, { administra: false, esMia: true })).toEqual([
      "revoke",
    ]);
    expect(accionesPermitidas(a, { administra: false, esMia: false })).toEqual(
      [],
    );
    expect(
      accionesPermitidas(lista[3], { administra: true, esMia: true }),
    ).toEqual([]);
  });

  it("describes the machine", () => {
    expect(
      describirSistema({
        platform: "darwin",
        osVersion: "14.5",
        arch: "arm64",
      }),
    ).toBe("macOS 14.5 · Apple silicon");
    expect(
      describirSistema({ platform: "win32", osVersion: "11", arch: "x64" }),
    ).toBe("Windows 11 · x64");
    expect(
      describirSistema({ platform: null, osVersion: null, arch: null }),
    ).toBe("");
  });
});

describe("desktop computers · the 3-step guide follows the person's state", () => {
  it("nothing yet → step 1", () => {
    expect(estadoDelAsistente([]).pasos).toEqual([
      "actual",
      "pendiente",
      "pendiente",
    ]);
  });

  it("inside the app without approval → step 2", () => {
    expect(estadoDelAsistente([], true).pasos).toEqual([
      "hecho",
      "actual",
      "pendiente",
    ]);
  });

  it("a waiting request → step 3 with its code", () => {
    const p = fila({ id: "p", pairingCode: "K7QM-2XPA" });
    const a = estadoDelAsistente([fila({ id: "r", status: "rejected" }), p]);

    expect(a.pasos).toEqual(["hecho", "hecho", "actual"]);
    expect(a.pendiente?.pairingCode).toBe("K7QM-2XPA");
  });

  it("an approved computer → all done", () => {
    const a = estadoDelAsistente([
      fila({ id: "p" }),
      fila({ id: "a", status: "approved" }),
    ]);

    expect(a).toMatchObject({
      pasos: ["hecho", "hecho", "hecho"],
      lista: true,
      pendiente: null,
    });
  });
});

describe("desktop computers · which installer to offer", () => {
  const mac = {
    platform: "darwin" as const,
    version: "1.1.0",
    size: 1,
    available: true,
  };
  const descargas = [
    { ...mac, arch: "arm64" as const },
    { ...mac, arch: "x64" as const },
    {
      platform: "win32" as const,
      arch: "x64" as const,
      version: null,
      size: null,
      available: false,
    },
  ];

  it("Mac with a known chip → that one first, the rest as options", () => {
    const e = elegirDescarga(descargas, "mac", "x64");

    expect(e.principal?.arch).toBe("x64");
    expect(e.alternativa).toBeNull();
    expect(e.otras.map((d) => `${d.platform}/${d.arch}`)).toEqual([
      "darwin/arm64",
      "win32/x64",
    ]);
  });

  it("Mac with an unknown chip → both, Apple silicon first", () => {
    const e = elegirDescarga(descargas, "mac", null);

    expect([e.principal?.arch, e.alternativa?.arch]).toEqual(["arm64", "x64"]);
    expect(e.otras.map((d) => d.platform)).toEqual(["win32"]);
  });

  it("Windows → the Windows entry even when it is still «coming soon»", () => {
    const e = elegirDescarga(descargas, "windows", "x64");

    expect(e.principal).toMatchObject({ platform: "win32", available: false });
  });

  it("other devices → no main choice; the catalog is always complete", () => {
    expect(elegirDescarga([], "otro", null).principal).toBeNull();
    expect(completarCatalogo([]).every((d) => !d.available)).toBe(true);
    expect(sinDescargas([])).toBe(true);
    expect(sinDescargas(descargas)).toBe(false);
  });

  it("why downloads are refused", () => {
    expect(clasificarFallo(402)).toBe("suspendida");
    expect(clasificarFallo(403, "subscription_required")).toBe("suspendida");
    expect(clasificarFallo(403)).toBe("noElegible");
    expect(clasificarFallo(0)).toBe("red");
    expect(clasificarFallo(500)).toBe("red");
  });
});

describe("this computer", () => {
  it("operating system from the user agent", () => {
    expect(
      sistemaDesdeAgente(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        "MacIntel",
      ),
    ).toBe("mac");
    expect(
      sistemaDesdeAgente("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Win32"),
    ).toBe("windows");
    expect(
      sistemaDesdeAgente(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)",
        "MacIntel",
      ),
    ).toBe("otro");
    expect(
      sistemaDesdeAgente("Mozilla/5.0 (X11; Linux x86_64)", "Linux x86_64"),
    ).toBe("otro");
  });

  it("the Mac's chip from the hints", () => {
    expect(chipDesdePistas("arm", null)).toBe("arm64");
    expect(chipDesdePistas("x86", "Intel(R) Iris(TM) Plus Graphics")).toBe(
      "x64",
    );
    expect(chipDesdePistas("x86", "Apple M2")).toBe("arm64");
    expect(
      chipDesdePistas(
        null,
        "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro)",
      ),
    ).toBe("arm64");
    expect(chipDesdePistas("", "")).toBeNull();
  });

  it("installer sizes", () => {
    expect(tamanoLegible(95 * 1024 * 1024, "en")).toBe("95 MB");
    expect(tamanoLegible(null)).toBeNull();
  });
});
