import type { MapEntity } from "@/pages/admin/dashboard/control-center/types";

import { describe, expect, it } from "vitest";

import { filtrarPorMarca, marcaDeEntidad } from "./marcaEnMapa";

const clientes: Record<string, string> = { c1: "A", c2: "B" };
const personas: Record<string, string> = { u1: "A", u2: "B" };
const deCliente = (id: unknown) => (clientes[String(id)] ? { id: clientes[String(id)] } : null);
const dePersona = (id: unknown) => (personas[String(id)] ? { id: personas[String(id)] } : null);
const e = (id: string, kind: MapEntity["kind"], meta: MapEntity["meta"] = {}): MapEntity => ({
  id,
  kind,
  lat: 0,
  lng: 0,
  label: id,
  status: "online" as MapEntity["status"],
  meta,
});

const mapa = [
  e("s1", "station", { clientId: "c1" }),
  e("s2", "station", { clientId: "c2" }),
  e("k2", "client", { entityId: "site-9", clientId: "c2" }),
  e("g1", "guard", { userId: "u1" }),
  e("g2", "guard", { userId: "u2" }),
  e("i1", "incident", {}),
  e("i2", "incident", { clientId: "c2" }),
  e("hq", "tenant"),
];
const marcaDe = (x: MapEntity) => marcaDeEntidad(x, deCliente, dePersona);

describe("brand of a map pin", () => {
  it("site → its client's brand, person → registration brand", () => {
    expect(marcaDe(mapa[0])).toBe("A");
    expect(marcaDe(mapa[2])).toBe("B");
    expect(marcaDe(mapa[4])).toBe("B");
    expect(marcaDe(mapa[5])).toBeNull();
  });

  it("filtering keeps the brand, the headquarters and unknown incidents", () => {
    expect(filtrarPorMarca(mapa, "A", marcaDe).map((x) => x.id)).toEqual(["s1", "g1", "i1", "hq"]);
    expect(filtrarPorMarca(mapa, null, marcaDe)).toHaveLength(mapa.length);
  });
});
