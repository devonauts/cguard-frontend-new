import { describe, it, expect } from "vitest";

import { iniciarSondeoVisible } from "./sondeoVisible";

/**
 * Un banco de pruebas con relojes y visibilidad de mentira, para poder
 * comprobar el comportamiento sin navegador: `avanzar(ms)` dispara los tics
 * que tocarían y `ocultar()/mostrar()` emiten el evento de visibilidad.
 */
function banco(activo = true) {
  let ahora = 0;
  let seq = 0;
  const timers = new Map<number, { fn: () => void; cada: number; prox: number }>();
  const escuchas: Array<() => void> = [];

  let visible = true;
  let llamadas = 0;

  const sondeo = iniciarSondeoVisible({
    activo,
    tarea: () => {
      llamadas++;
    },
    cadaMs: 1000,
    visible: () => visible,
    alCambiarVisibilidad: (fn) => {
      escuchas.push(fn);

      return () => {
        const i = escuchas.indexOf(fn);

        if (i >= 0) escuchas.splice(i, 1);
      };
    },
    armar: (fn, ms) => {
      const id = ++seq;

      timers.set(id, { fn, cada: ms, prox: ahora + ms });

      return id;
    },
    desarmar: (id) => {
      timers.delete(id as number);
    },
  });

  return {
    sondeo,
    get llamadas() {
      return llamadas;
    },
    get temporizadores() {
      return timers.size;
    },
    get escuchas() {
      return escuchas.length;
    },
    avanzar(ms: number) {
      const fin = ahora + ms;

      // Repetir hasta agotar los vencimientos dentro de la ventana.
      for (;;) {
        let siguiente: { id: number; t: number } | null = null;

        for (const [id, t] of timers) {
          if (t.prox <= fin && (!siguiente || t.prox < siguiente.t))
            siguiente = { id, t: t.prox };
        }
        if (!siguiente) break;
        const t = timers.get(siguiente.id)!;

        ahora = t.prox;
        t.prox = ahora + t.cada;
        t.fn();
      }
      ahora = fin;
    },
    ocultar() {
      visible = false;
      escuchas.slice().forEach((f) => f());
    },
    mostrar() {
      visible = true;
      escuchas.slice().forEach((f) => f());
    },
  };
}

describe("iniciarSondeoVisible", () => {
  it("con la pestaña a la vista, sondea al ritmo pedido", () => {
    const b = banco();

    b.avanzar(3000);
    expect(b.llamadas).toBe(3);
    b.sondeo.detener();
  });

  it("al ocultar la pestaña deja de pedir — el fallo que buscábamos", () => {
    const b = banco();

    b.avanzar(2000);
    expect(b.llamadas).toBe(2);

    b.ocultar();
    b.avanzar(60_000); // una noche entera en miniatura
    expect(b.llamadas).toBe(2); // ni una más
    expect(b.temporizadores).toBe(0);
    b.sondeo.detener();
  });

  it("al volver a verse recarga en el acto y sigue sondeando", () => {
    const b = banco();

    b.ocultar();
    b.avanzar(5000);
    expect(b.llamadas).toBe(0);

    b.mostrar();
    expect(b.llamadas).toBe(1); // inmediata, no se espera al siguiente tic
    b.avanzar(2000);
    expect(b.llamadas).toBe(3);
    b.sondeo.detener();
  });

  it("mostrar dos veces seguidas no deja dos relojes corriendo", () => {
    const b = banco();

    b.mostrar();
    b.mostrar();
    expect(b.temporizadores).toBe(1);

    const antes = b.llamadas;

    b.avanzar(1000);
    expect(b.llamadas - antes).toBe(1); // un tic, no dos
    b.sondeo.detener();
  });

  it("detener() suelta el temporizador y la escucha", () => {
    const b = banco();

    expect(b.temporizadores).toBe(1);
    expect(b.escuchas).toBe(1);

    b.sondeo.detener();
    expect(b.temporizadores).toBe(0);
    expect(b.escuchas).toBe(0);

    b.avanzar(10_000);
    expect(b.llamadas).toBe(0);
  });

  it("no arma nada si la pestaña ya estaba oculta al montar", () => {
    const b = banco();

    b.sondeo.detener();

    // Un segundo sondeo que nace oculto.
    const b2 = banco();

    b2.ocultar();
    expect(b2.temporizadores).toBe(0);
    b2.sondeo.detener();
  });

  /* ── EL RESPALDO DE LA RUTA EN CURSO ───────────────────────────────────
     `activo` es lo que hace que el sondeo de `RouteRunDetailPage` exista SÓLO
     mientras la ruta sigue abierta y el socket está caído. Con el socket sano
     no puede haber ningún reloj. */
  it("con activo=false no arma NADA, ni aunque la pestaña se vea", () => {
    const b = banco(false);

    expect(b.temporizadores).toBe(0);
    b.avanzar(60_000);
    expect(b.llamadas).toBe(0);
    b.sondeo.detener();
  });

  it("con activo=false, volver a la pestaña tampoco dispara nada", () => {
    const b = banco(false);

    b.ocultar();
    b.mostrar();
    expect(b.llamadas).toBe(0);
    expect(b.temporizadores).toBe(0);
    b.sondeo.detener();
  });

  it("apagado y encendido: el socket cae → arranca, el socket vuelve → para", () => {
    // El socket está SANO: no hay reloj.
    const sano = banco(false);

    sano.avanzar(10_000);
    expect(sano.llamadas).toBe(0);
    sano.sondeo.detener();

    // El socket SE CAE: React vuelve a montar el hook con activo=true.
    const caido = banco(true);

    caido.avanzar(3_000);
    expect(caido.llamadas).toBe(3); // ahora sí cubre el hueco
    caido.sondeo.detener();

    // Y al recuperarse, el hook se desmonta: ni un tic más.
    caido.avanzar(60_000);
    expect(caido.llamadas).toBe(3);
  });
});
