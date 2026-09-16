import { describe, it, expect, beforeEach } from "vitest";

import {
  queryClient,
  cachedFetch,
  invalidateEntity,
  autoInvalidateForMutation,
} from "./queryClient";

/**
 * EL CONTRATO DE LA CACHÉ DE LECTURA.
 *
 * Una caché sin invalidación correcta es peor que no tener caché: la pantalla
 * miente después de guardar. Estas pruebas fijan las dos mitades:
 *
 *   1. leer dos veces dentro de la ventana = UNA petición;
 *   2. cualquier escritura que toque esa entidad la tira, y la siguiente
 *      lectura vuelve a pedir.
 *
 * Y sobre todo fijan QUÉ URLs cuentan como escritura de cada entidad, que es
 * donde esto se rompe en silencio cuando alguien añade un endpoint nuevo.
 */
beforeEach(() => {
  queryClient.clear();
});

describe("cachedFetch", () => {
  it("dos lecturas dentro de la ventana = una sola petición", async () => {
    let n = 0;
    const leer = () =>
      cachedFetch(["demo", "t1"], async () => {
        n++;

        return { v: n };
      });

    await leer();
    await leer();
    expect(n).toBe(1);
  });

  it("claves distintas no se pisan", async () => {
    let n = 0;
    const leer = (t: string) =>
      cachedFetch(["demo", t], async () => {
        n++;

        return { t };
      });

    await leer("t1");
    await leer("t2");
    expect(n).toBe(2);
  });

  it("invalidateEntity obliga a volver a pedir", async () => {
    let n = 0;
    const leer = () =>
      cachedFetch(["demo", "t1"], async () => {
        n++;

        return { v: n };
      });

    await leer();
    invalidateEntity("demo");
    await leer();
    expect(n).toBe(2);
  });
});

describe("autoInvalidateForMutation — qué escritura tira qué caché", () => {
  /** Devuelve las entidades que quedarían invalidadas por esa petición. */
  const tocadas = (method: string, url: string): string[] => {
    const marcadas: string[] = [];

    for (const e of ["stations", "clients", "categories", "security-guards"]) {
      queryClient.setQueryData([e, "sonda"], { x: 1 });
    }
    autoInvalidateForMutation(method, url);
    for (const e of ["stations", "clients", "categories", "security-guards"]) {
      const st = queryClient.getQueryState([e, "sonda"]);

      if (st?.isInvalidated) marcadas.push(e);
    }
    queryClient.clear();

    return marcadas;
  };

  it("una LECTURA no invalida nada", () => {
    expect(tocadas("GET", "/tenant/t/security-guard?limit=10")).toEqual([]);
    expect(tocadas("HEAD", "/tenant/t/client-account")).toEqual([]);
  });

  it("alta, cambio y baja de un vigilante tiran el censo", () => {
    // Éstas son literalmente las URLs de securityGuardService.
    expect(tocadas("POST", "/tenant/t/security-guard")).toContain(
      "security-guards",
    );
    expect(tocadas("PATCH", "/tenant/t/security-guard/abc")).toContain(
      "security-guards",
    );
    expect(tocadas("DELETE", "/tenant/t/security-guard")).toContain(
      "security-guards",
    );
    expect(tocadas("POST", "/tenant/t/security-guard/archive")).toContain(
      "security-guards",
    );
    expect(tocadas("POST", "/tenant/t/security-guard/restore")).toContain(
      "security-guards",
    );
    expect(tocadas("POST", "/tenant/t/security-guard/invite")).toContain(
      "security-guards",
    );
  });

  it("los puestos de servicio comparten caché con las estaciones", () => {
    // `/post-site` es un alias literal de `/business-info` en el backend, y
    // `postSiteService` + `stationService` comparten la clave ["stations"].
    for (const u of [
      "/tenant/t/business-info",
      "/tenant/t/business-info/abc",
      "/tenant/t/post-site",
      "/tenant/t/station?ids=a,b",
      "/tenant/t/station/abc",
    ]) {
      expect(tocadas("DELETE", u), u).toContain("stations");
    }
  });

  it("un cambio de horario refresca las estaciones", () => {
    for (const u of [
      "/tenant/t/shift?ids=a,b",
      "/tenant/t/schedule-overrides",
      "/tenant/t/guard-assignment/abc",
      "/tenant/t/scheduler/optimize",
    ]) {
      expect(tocadas("POST", u), u).toContain("stations");
    }
  });

  it("cada entidad tira SÓLO lo suyo", () => {
    expect(tocadas("POST", "/tenant/t/client-account")).toEqual(["clients"]);
    expect(tocadas("POST", "/tenant/t/category")).toEqual(["categories"]);
    // Un vigilante no invalida clientes ni categorías.
    expect(tocadas("POST", "/tenant/t/security-guard")).toEqual([
      "security-guards",
    ]);
  });

  it("la lectura de posiciones en vivo no invalida el censo", () => {
    // `/security-guard/active-locations` es un GET; si alguna vez alguien lo
    // convierte en POST, esta prueba avisa antes de que tire la caché 15 veces
    // por minuto.
    expect(tocadas("GET", "/tenant/t/security-guard/active-locations")).toEqual(
      [],
    );
  });
});
