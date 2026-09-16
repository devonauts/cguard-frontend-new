/**
 * MUCHAS PETICIONES, PERO NO TODAS A LA VEZ.
 *
 * `Promise.all(cosas.map(pedir))` es cómodo y miente: parece «espera a que
 * terminen» pero lo que hace es LANZARLAS TODAS EN EL MISMO INSTANTE. Con una
 * selección grande del Horario eso son miles de peticiones simultáneas contra
 * las mismas tablas — el navegador las encola de seis en seis, pero el servidor
 * recibe la avalancha entera y el limitador de peticiones corta la sesión.
 *
 * Aquí se mantiene un número fijo de peticiones EN VUELO: cuando una termina
 * entra la siguiente. Mismo resultado, misma forma que `Promise.allSettled`,
 * sin la avalancha.
 *
 * El límite por defecto es 6 porque es el máximo de conexiones que el navegador
 * abre por origen: pasar de ahí no acelera nada, sólo llena una cola invisible.
 */
export async function enLotes<T, R>(
  items: readonly T[],
  fn: (item: T, indice: number) => Promise<R>,
  limite = 6,
): Promise<PromiseSettledResult<R>[]> {
  const resultados: PromiseSettledResult<R>[] = new Array(items.length);

  if (items.length === 0) return resultados;

  const tope = Math.max(1, Math.min(limite, items.length));
  let siguiente = 0;

  async function trabajador() {
    for (;;) {
      const i = siguiente++;

      if (i >= items.length) return;
      try {
        resultados[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        // Igual que `allSettled`: un fallo no cancela a los demás. Quien llama
        // cuenta los rechazados y decide qué decirle a la persona.
        resultados[i] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: tope }, () => trabajador()));

  return resultados;
}
