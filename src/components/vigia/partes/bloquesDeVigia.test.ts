import { describe, it, expect } from "vitest";

import { partirMensaje, partirNegritas } from "./bloquesDeVigia";

const BIENVENIDA = `¡Bienvenido! Soy Vigia AI, tu asistente. Ya quedó configurada tu empresa — el siguiente paso es tu primer cliente. Dime su nombre y su dirección y te lo creo aquí mismo.

Así amanece tu operación:
· Vigilantes en plantilla: 0
· Con fichaje abierto (aprox.): 0
· Supervisores: 0
· Clientes: 3
· Puestos sin cubrir (novedades abiertas): 0`;

describe("el texto de VigIA, en bloques", () => {
  it("la bienvenida: párrafo, título y una cuadrícula de cifras", () => {
    const b = partirMensaje(BIENVENIDA);

    expect(b.map((x) => x.tipo)).toEqual(["parrafo", "titulo", "cifras"]);
    expect(b[1]).toEqual({ tipo: "titulo", texto: "Así amanece tu operación" });
    const cifras = (b[2] as any).items;

    expect(cifras).toHaveLength(5);
    expect(cifras[1]).toEqual({ etiqueta: "Con fichaje abierto (aprox.)", valor: "0", numero: 0 });
    expect(cifras[3].numero).toBe(3);
  });

  it("viñetas que no son cifras quedan como lista", () => {
    const b = partirMensaje("Puedo ayudarte con:\n• Turnos\n- Rondas con QR\n* Incidentes");

    expect(b).toEqual([
      { tipo: "titulo", texto: "Puedo ayudarte con" },
      { tipo: "lista", items: ["Turnos", "Rondas con QR", "Incidentes"] },
    ]);
  });

  it("una sola cifra no hace cuadrícula", () => {
    const b = partirMensaje("· Clientes: 4");

    expect(b).toEqual([{ tipo: "lista", items: ["Clientes: 4"] }]);
  });

  it("líneas seguidas sin viñeta forman un párrafo; una línea larga con «:» no es título", () => {
    const b = partirMensaje("Hola.\nTe cuento:\n\nEsto es una frase bastante larga que termina explicando algo importante:");

    expect(b[0]).toEqual({ tipo: "parrafo", texto: "Hola. Te cuento:" });
    expect(b[1].tipo).toBe("parrafo");
  });

  it("porcentajes y miles", () => {
    const b = partirMensaje("· Cobertura: 87 %\n· Rondas: 1.234");
    const items = (b[0] as any).items;

    expect(items[0].numero).toBe(87);
    expect(items[1].numero).toBe(1234);
  });

  it("negritas: **así** y *así*", () => {
    expect(partirNegritas("Tu **primer cliente** ya *está* listo")).toEqual([
      { texto: "Tu ", negrita: false },
      { texto: "primer cliente", negrita: true },
      { texto: " ya ", negrita: false },
      { texto: "está", negrita: true },
      { texto: " listo", negrita: false },
    ]);
    expect(partirNegritas("sin marcas")).toEqual([{ texto: "sin marcas", negrita: false }]);
  });
});
