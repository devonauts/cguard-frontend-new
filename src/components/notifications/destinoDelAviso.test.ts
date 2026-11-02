/**
 * ════════════════════════════════════════════════════════════════════════════
 * TODO AVISO TIENE QUE LLEVAR A UNA PANTALLA QUE EXISTA
 *
 * Pulsar una notificación y aterrizar en «Extraviado» es la peor forma de
 * fallar que tiene esta función: el usuario ya ha dejado lo que estaba haciendo
 * y lo que encuentra es un 404 que no es culpa suya. Ya pasó una vez —el aviso
 * de «sin marcar salida» mandaba el id de la EXCEPCIÓN como si fuera el de un
 * turno y salía un «Extraviado» a pantalla completa, visto el 2026-08-27— y el
 * arreglo se quedó sin red.
 *
 * Esta prueba recorre TODOS los tipos de evento que el backend sabe emitir
 * (`catalogoDeAvisos.ts`, copiado del catálogo del servidor) y comprueba que el
 * destino que calcula `targetForNotification` casa con alguna ruta declarada en
 * `App.tsx`. Las rutas se leen del fichero, no de una lista a mano: si alguien
 * borra o renombra una pantalla, esto se entera.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, it, expect } from "vitest";

import { targetForNotification } from "./destinoDelAviso";
import { EVENTOS_DE_AVISO } from "./catalogoDeAvisos";

const aqui = dirname(fileURLToPath(import.meta.url));

/**
 * Las rutas declaradas en el router, con las ANIDADAS resueltas.
 *
 * No vale con recoger los `path="/..."`: media ficha del vigilante son hijos
 * relativos (`path="perfil"` dentro de `path="/guards/:id"`), y leyendo sólo los
 * absolutos esta prueba daba por rota una ruta que existe.
 *
 * No se parsea el JSX —los atributos llevan `>` dentro (`element={<X />}`) y
 * cualquier intento se rompe—: se recorren los `path=` en orden y cada relativo
 * se cuelga del último absoluto, que es como están escritos en el fichero.
 */
function rutasDeclaradas(): string[] {
  const app = readFileSync(resolve(aqui, "../../App.tsx"), "utf8");
  const fuera = new Set(["*", "/superadmin/*"]);
  const salida: string[] = [];
  let padre = "";

  for (const m of app.matchAll(/path="([^"]+)"/g)) {
    const valor = m[1];

    if (valor.startsWith("/")) {
      padre = valor;
      if (!fuera.has(valor)) salida.push(valor);
    } else if (valor !== "*" && padre) {
      salida.push(`${padre.replace(/\/+$/, "")}/${valor}`);
    }
  }

  return [...new Set(salida)];
}

/** ¿Casa un destino («/guards/abc/perfil») con una ruta («/guards/:id»)? */
function casa(destino: string, ruta: string): boolean {
  const camino = destino.split("?")[0].replace(/\/+$/, "") || "/";
  const patron = ruta.replace(/\/+$/, "") || "/";

  if (patron.endsWith("/*")) {
    return (
      camino === patron.slice(0, -2) || camino.startsWith(patron.slice(0, -1))
    );
  }
  const a = camino.split("/");
  const b = patron.split("/");

  if (a.length !== b.length) return false;

  return b.every((seg, i) => seg.startsWith(":") || seg === a[i]);
}

/**
 * Un aviso de ejemplo con los campos que el backend manda de verdad. El payload
 * se rellena a propósito: la mitad de las ramas de `targetForNotification`
 * eligen destino según lo que venga dentro, y probarlas con el payload vacío
 * sólo ejercitaría los respaldos.
 */
function avisoDe(eventType: string, payload: Record<string, unknown> = {}) {
  return {
    id: "n-1",
    eventType,
    title: "Aviso de prueba",
    body: "",
    createdAt: "2026-09-20T12:00:00.000Z",
    read: false,
    sourceEntityId: "11111111-1111-1111-1111-111111111111",
    sourceEntityType: null,
    payload,
  } as any;
}

const RUTAS = rutasDeclaradas();

const conDatos: Record<string, Record<string, unknown>> = {
  "panic.alert": { caseId: "c-1" },
  sos: { caseId: "c-1" },
  "alarm.case.new": { caseId: "c-1" },
  "message.new": { conversationId: "conv-1" },
  "guard.rated": { guardId: "g-1" },
  "patrol.missed": {
    postSiteId: "ps-1",
    stationId: "st-1",
    assignmentId: "a-1",
  },
  "patrol.completed": { postSiteId: "ps-1", stationId: "st-1" },
  "supervisor.route.updated": { runId: "r-1" },
  "attendance.missed_clockout": {
    guardShiftId: "gs-1",
    shiftDay: "2026-09-19",
  },
};

describe("el router declara las rutas que usan los avisos", () => {
  it("encuentra rutas en App.tsx", () => {
    expect(RUTAS.length).toBeGreaterThan(80);
  });

  /* Controles: sin esto, un fallo en `rutasDeclaradas` o en `casa` que
     devolviera «todo vale» haría pasar las 202 comprobaciones de abajo sin
     comprobar nada. */
  it("resuelve las rutas anidadas de la ficha del vigilante", () => {
    expect(RUTAS).toContain("/guards/:id/perfil");
  });

  it("no da por buena una pantalla que no existe", () => {
    expect(RUTAS.some((r) => casa("/pantalla-que-no-existe", r))).toBe(false);
    expect(RUTAS.some((r) => casa("/guards/g-1/inventado", r))).toBe(false);
  });
});

describe("cada tipo de aviso lleva a una pantalla que existe", () => {
  for (const ev of EVENTOS_DE_AVISO) {
    it(`${ev.evento} (${ev.familia})`, () => {
      const destino = targetForNotification(
        avisoDe(ev.evento, conDatos[ev.evento] || {}),
      );

      expect(
        RUTAS.some((r) => casa(destino, r)),
        `«${ev.evento}» lleva a «${destino}», que no casa con ninguna ruta del router`,
      ).toBe(true);
    });
  }
});

describe("cada tipo de aviso lleva a una pantalla que existe, también sin payload", () => {
  // Los avisos viejos no traen los campos nuevos. El respaldo tiene que valer.
  for (const ev of EVENTOS_DE_AVISO) {
    it(`${ev.evento} sin datos`, () => {
      const destino = targetForNotification(avisoDe(ev.evento));

      expect(
        RUTAS.some((r) => casa(destino, r)),
        `«${ev.evento}» sin payload lleva a «${destino}», que no casa con ninguna ruta`,
      ).toBe(true);
    });
  }
});

describe("un aviso de incidente abre ESE incidente", () => {
  it("lleva a la ficha del incidente, no al informe general", () => {
    const destino = targetForNotification({
      ...avisoDe("incident.created"),
      sourceEntityType: "incident",
      sourceEntityId: "inc-42",
    });

    expect(destino).toBe("/dispatch-tickets/inc-42");
  });
});
