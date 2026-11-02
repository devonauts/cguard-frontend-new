import { describe, expect, it } from "vitest";

import {
  accesoDeLaSesion,
  accesoParaGuardar,
  errorDeAcceso,
  mensajeDeAccesoDeMarca,
  motivoDeMarca,
  normalizarAcceso,
  rolQuePuedeDar,
  rolesConMarca,
  textoDeError,
} from "./accesoDeMarca";

const T = "tenant-1";
const sesion = (roles: string[], extra: Record<string, unknown> = {}) => ({
  tenants: [{ tenant: { id: T }, roles }],
  ...extra,
});

describe("brand access of the session", () => {
  it("an admin is never limited, whatever brandAccess says", () => {
    const a = accesoDeLaSesion(sesion(["admin"], { brandAccess: ["b1"] }), T);

    expect(a).toMatchObject({ esAdmin: true, restringido: false, brandAccess: null });
  });

  it("a brand admin with brands is limited to them", () => {
    const a = accesoDeLaSesion(
      sesion(["brandAdmin"], { brandAccess: ["b1", "b2", "b1"], isBrandAdmin: true }),
      T,
    );

    expect(a).toEqual({
      brandAccess: ["b1", "b2"],
      esAdminDeMarca: true,
      esAdmin: false,
      restringido: true,
    });
  });

  it("a brand admin with no brands sees nothing (fails closed)", () => {
    const a = accesoDeLaSesion(sesion(["brandAdmin"], { brandAccess: null }), T);

    expect(a.brandAccess).toEqual([]);
    expect(a.restringido).toBe(true);
  });

  it("other roles: null = every brand, a list narrows them", () => {
    expect(accesoDeLaSesion(sesion(["dispatcher"]), T).restringido).toBe(false);
    expect(
      accesoDeLaSesion(sesion(["dispatcher"], { brandAccess: '["b2"]' }), T),
    ).toMatchObject({ restringido: true, brandAccess: ["b2"], esAdminDeMarca: false });
  });

  it("an empty list does not narrow an ordinary role", () => {
    expect(
      accesoDeLaSesion(sesion(["dispatcher"], { brandAccess: [] }), T),
    ).toMatchObject({ restringido: false, brandAccess: null });
  });

  it("reads brandAccess from the tenant entry of an older profile", () => {
    const u = { tenants: [{ tenantId: T, roles: ["dispatcher"], brandAccess: ["b9"] }] };

    expect(accesoDeLaSesion(u, T).brandAccess).toEqual(["b9"]);
  });

  it("normalizes odd shapes", () => {
    expect(normalizarAcceso(undefined)).toBeNull();
    expect(normalizarAcceso("")).toBeNull();
    expect(normalizarAcceso("not json")).toBeNull();
    expect(normalizarAcceso([])).toEqual([]);
  });
});

describe("what is stored for a person", () => {
  it("admin: nothing is sent", () => {
    expect(accesoParaGuardar("admin", ["b1"])).toBeUndefined();
  });

  it("brand admin: the list, never null", () => {
    expect(accesoParaGuardar("brandAdmin", ["b1"])).toEqual(["b1"]);
    expect(accesoParaGuardar("brandadmin", null)).toEqual([]);
  });

  it("other roles: no brand ticked means every brand", () => {
    expect(accesoParaGuardar("dispatcher", [])).toBeNull();
    expect(accesoParaGuardar("dispatcher", null)).toBeNull();
    expect(accesoParaGuardar("dispatcher", ["b2"])).toEqual(["b2"]);
  });

  it("a brand admin without brands cannot be saved", () => {
    expect(errorDeAcceso("brandAdmin", [])).toBe("sinMarcas");
    expect(errorDeAcceso("brandAdmin", null)).toBe("sinMarcas");
    expect(errorDeAcceso("brandAdmin", ["b1"])).toBeNull();
    expect(errorDeAcceso("dispatcher", [])).toBeNull();
  });
});

describe("the roles a form offers", () => {
  const filas = [
    { id: "u-admin", slug: "admin" },
    { id: "u-disp", slug: "dispatcher" },
    { id: "u-bm", slug: "branchManager" },
  ];

  it("adds the brand admin with the module", () => {
    const r = rolesConMarca(filas, { modulo: true, restringido: false });

    expect(r.map((x) => x.slug)).toEqual(["admin", "dispatcher", "branchManager", "brandAdmin"]);
  });

  it("does not duplicate it when the company's rows carry it", () => {
    const r = rolesConMarca([...filas, { id: "u-ba", slug: "brandAdmin" }], {
      modulo: true,
      restringido: false,
    });

    expect(r.filter((x) => x.slug === "brandAdmin")).toHaveLength(1);
  });

  it("without the module it is not offered, unless the person has it", () => {
    const filasConBa = [...filas, { id: "u-ba", slug: "brandAdmin" }];

    expect(
      rolesConMarca(filasConBa, { modulo: false, restringido: false }).map((x) => x.slug),
    ).not.toContain("brandAdmin");
    expect(
      rolesConMarca(filasConBa, { modulo: false, restringido: false, actual: "u-ba" }).map(
        (x) => x.slug,
      ),
    ).toContain("brandAdmin");
  });

  it("someone limited to brands never offers admin-level roles", () => {
    const r = rolesConMarca(filas, { modulo: true, restringido: true });

    expect(r.map((x) => x.slug)).toEqual(["dispatcher"]);
    expect(rolQuePuedeDar("brandAdmin", true)).toBe(false);
    expect(rolQuePuedeDar("hrManager", true)).toBe(true);
  });
});

describe("marca_* refusals", () => {
  it("finds the code in reason, code or messageCode", () => {
    expect(motivoDeMarca({ reason: "marca_pago", code: 403 })).toBe("marca_pago");
    expect(motivoDeMarca({ data: { code: "marca_fuera_de_alcance" } })).toBe(
      "marca_fuera_de_alcance",
    );
    expect(motivoDeMarca({ reason: "gerente_pago" })).toBeNull();
    expect(motivoDeMarca(null)).toBeNull();
  });

  it("replaces the server text only for marca_* refusals", () => {
    expect(textoDeError({ reason: "marca_roles" }, "Forbidden")).toBe(
      mensajeDeAccesoDeMarca("marca_roles"),
    );
    expect(textoDeError({ reason: "other" }, "Forbidden")).toBe("Forbidden");
  });

  it("every motive has its own words, unknown ones the general line", () => {
    const motivos = [
      "marca_pago",
      "marca_cuenta",
      "marca_estructura",
      "marca_roles",
      "marca_empresa",
      "marca_fuera_de_alcance",
    ];
    const textos = new Set(motivos.map(mensajeDeAccesoDeMarca));

    expect(textos.size).toBe(motivos.length);
    expect(mensajeDeAccesoDeMarca("marca_nuevo")).toBe(mensajeDeAccesoDeMarca(null));
  });
});
