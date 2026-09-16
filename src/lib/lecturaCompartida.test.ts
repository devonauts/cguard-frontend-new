import { describe, it, expect, vi } from "vitest";

import { crearLecturaCompartida } from "./lecturaCompartida";

/**
 * El contrato que arregló las TRES peticiones a `/auth/me` por arranque y la
 * doble siembra del histórico de avisos. Si alguien rompe el compartir, o
 * empieza a memorizar los fallos, estas pruebas lo cazan.
 */
describe("crearLecturaCompartida", () => {
  it("tres lectores en el mismo tic = UNA petición", async () => {
    const pedir = vi.fn().mockResolvedValue({ id: "u1" });
    const { leer } = crearLecturaCompartida(pedir);

    // Auth, Apariencia e Idioma montan en el mismo commit de React.
    const [a, b, c] = await Promise.all([leer(), leer(), leer()]);

    expect(pedir).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("el que llega TARDE tampoco vuelve a pedir — el agujero del in-flight", async () => {
    const pedir = vi.fn().mockResolvedValue({ id: "u1" });
    const { leer } = crearLecturaCompartida(pedir);

    await leer(); // la petición ya terminó
    await leer(); // 91 ms después, como la campana de avisos

    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("pasada la ventana de frescura vuelve a preguntar", async () => {
    let reloj = 1_000;
    const pedir = vi.fn().mockResolvedValue({ id: "u1" });
    const { leer } = crearLecturaCompartida(pedir, 15_000, () => reloj);

    await leer();
    reloj += 14_000;
    await leer();
    expect(pedir).toHaveBeenCalledTimes(1); // todavía fresco

    reloj += 2_000; // 16 s en total
    await leer();
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("un fallo NO se memoriza: el reintento vuelve a preguntar de verdad", async () => {
    const pedir = vi
      .fn()
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce({ id: "u1" });
    const { leer } = crearLecturaCompartida(pedir);

    await expect(leer()).rejects.toMatchObject({ status: 503 });

    // Es el reintento con retroceso de `checkAuth`: tiene que poder pasar.
    await expect(leer()).resolves.toMatchObject({ id: "u1" });
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("olvidar() impide que la siguiente sesión herede la anterior", async () => {
    const pedir = vi.fn().mockResolvedValue({ id: "primero" });
    const { leer, olvidar } = crearLecturaCompartida(pedir);

    expect((await leer()).id).toBe("primero");

    // Cerrar sesión y entrar con otra cuenta SIN recargar: es una navegación
    // del SPA, que es justo donde esto se notaría.
    olvidar();
    pedir.mockResolvedValue({ id: "segundo" });

    expect((await leer()).id).toBe("segundo");
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("los que esperan una lectura fallida reciben todos el error", async () => {
    const pedir = vi.fn().mockRejectedValue({ status: 500 });
    const { leer } = crearLecturaCompartida(pedir);

    const r = await Promise.allSettled([leer(), leer(), leer()]);

    expect(pedir).toHaveBeenCalledTimes(1);
    expect(r.every((x) => x.status === "rejected")).toBe(true);
  });
});
