import { describe, expect, it } from "vitest";

import { repartir, SIN_SUCURSAL } from "./repartir";

const GYE = { lat: -2.17, lng: -79.92 };
const UIO = { lat: -0.18, lng: -78.47 };
const lista: any = {
  sucursales: [
    { id: "gye", sedes: [{ id: "s1", ...GYE }] },
    { id: "uio", sedes: [{ id: "s2", ...UIO }] },
  ],
  sinSucursal: [{ id: "s3", lat: null, lng: null }],
};
const e = (id: string, kind: any, p: { lat: number; lng: number }, meta: any = {}) =>
  ({ id, kind, status: "online", label: id, ...p, meta }) as any;

describe("sucursales · a qué sucursal va cada punto del mapa", () => {
  it("estaciones y sedes por su sede; el resto por la sede más cercana", () => {
    const r = repartir(
      [
        e("st-1", "station", GYE, { postSiteId: "s1" }),
        e("cl-s2", "client", UIO, { entityId: "s2" }),
        e("g-1", "guard", { lat: -2.2, lng: -79.9 }),
        e("inc-1", "incident", { lat: -0.2, lng: -78.5 }),
        e("st-3", "station", GYE, { postSiteId: "s3" }),
        e("g-lejos", "guard", { lat: 40, lng: -3 }),
        e("tenant", "tenant", GYE),
      ],
      lista,
    );

    expect(r.get("gye")!.map((x) => x.id)).toEqual(["st-1", "g-1"]);
    expect(r.get("uio")!.map((x) => x.id)).toEqual(["cl-s2", "inc-1"]);
    expect(r.get(SIN_SUCURSAL)!.map((x) => x.id)).toEqual(["st-3", "g-lejos"]);
  });
});
