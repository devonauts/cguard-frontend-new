import { describe, expect, it } from "vitest";

import { coincide, enFiltro, sinLeerPorFiltro, tipoDe } from "./bandeja";

const vig = { recipientType: "guard", recipientName: "José Pérez", lastMessagePreview: "Llegué al puesto" };
const eq = { recipientType: "staff", recipientName: "Carla Central" };
const cli = { recipientType: "client", recipientName: "Edificio Modigliani" };
const grp = { isGroup: true, kind: "group", recipientType: "guard", recipientName: "Bravo 15" };

describe("bandeja de Messaging", () => {
  it("clasifica cada hilo", () => {
    expect([vig, eq, cli, grp].map(tipoDe)).toEqual(["guard", "staff", "client", "grupo"]);
  });

  it("Equipo junta vigilantes y oficina; un grupo no es un directo", () => {
    const todos = [vig, eq, cli, grp];

    expect(todos.filter((c) => enFiltro(c, "equipo"))).toEqual([vig, eq]);
    expect(todos.filter((c) => enFiltro(c, "clientes"))).toEqual([cli]);
    expect(todos.filter((c) => enFiltro(c, "grupos"))).toEqual([grp]);
    expect(todos.filter((c) => enFiltro(c, "todos"))).toHaveLength(4);
  });

  it("busca por nombre o por el último mensaje, sin tildes ni mayúsculas", () => {
    expect(coincide(vig, "jose")).toBe(true);
    expect(coincide(vig, "LLEGUE")).toBe(true);
    expect(coincide(vig, "modigliani")).toBe(false);
    expect(coincide(cli, "  ")).toBe(true);
  });

  it("cuenta los hilos sin leer de cada pestaña", () => {
    const r = sinLeerPorFiltro([
      { ...vig, unreadCount: 2 },
      { ...cli, unreadCount: 1 },
      { ...grp, unreadCount: 0 },
    ]);

    expect(r).toEqual({ todos: 2, equipo: 1, clientes: 1, grupos: 0 });
  });
});
