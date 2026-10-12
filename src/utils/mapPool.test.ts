import { beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * El mapa compartido: 1 construcción por grupo, reutilización al volver,
 * traspaso limpio y telemetría. Google y el DOM van simulados (entorno node).
 */

const eventos: Array<{ type: string; detail: any }> = [];
let construidos = 0;

class Escucha {
  constructor(
    private lista: Escucha[],
    public ev: string,
    public fn: () => void,
  ) {}
  remove() {
    const i = this.lista.indexOf(this);

    if (i >= 0) this.lista.splice(i, 1);
  }
}

class MVC {
  escuchas: Escucha[] = [];
  addListener(ev: string, fn: () => void) {
    const l = new Escucha(this.escuchas, ev, fn);

    this.escuchas.push(l);

    return l;
  }
  disparar(ev: string) {
    this.escuchas.filter((l) => l.ev === ev).forEach((l) => l.fn());
  }
}

class FakeMap extends MVC {
  opts: Record<string, any>;
  controls: Record<number, { items: any[]; clear: () => void }> = {};
  constructor(_host: any, opts: any) {
    super();
    construidos += 1;
    this.opts = { ...opts };
    [1, 2, 3].forEach((p) => {
      const c = { items: [] as any[], clear: () => (c.items = []) };

      this.controls[p] = c;
    });
  }
  setOptions(o: any) {
    Object.assign(this.opts, o);
  }
  setCenter(c: any) {
    this.opts.center = c;
  }
  getCenter() {
    const c = this.opts.center;

    return { lat: () => c.lat, lng: () => c.lng };
  }
  getZoom() {
    return this.opts.zoom;
  }
}

class FakeMarker extends MVC {
  map: any;
  constructor(o: any) {
    super();
    this.map = o.map;
  }
  getMap() {
    return this.map;
  }
  setMap(m: any) {
    this.map = m;
    this.disparar("map_changed");
  }
}

function elemento(): any {
  const el: any = {
    style: {},
    hijos: [] as any[],
    padre: null,
    appendChild(h: any) {
      h.padre = el;
      el.hijos.push(h);
    },
    remove() {
      if (el.padre) el.padre.hijos = el.padre.hijos.filter((x: any) => x !== el);
      el.padre = null;
    },
  };

  return el;
}

let pool: typeof import("./mapPool");

beforeAll(async () => {
  const g: any = globalThis;

  g.window = {
    google: {
      maps: {
        Map: FakeMap,
        ControlPosition: { TOP_LEFT: 1, TOP_RIGHT: 2, BOTTOM: 3 },
        event: {
          clearInstanceListeners: (o: any) => (o.escuchas = []),
          addListener: (o: any, ev: string, fn: () => void) => o.addListener(ev, fn),
        },
      },
    },
    dispatchEvent: (e: any) => eventos.push({ type: e.type, detail: e.detail }),
  };
  g.document = { createElement: () => elemento() };
  pool = await import("./mapPool");
});

beforeEach(() => {
  pool.drainMapPool();
  eventos.length = 0;
  construidos = 0;
});

describe("mapPool", () => {
  it("construye una vez y reutiliza entre pantallas", () => {
    const a = pool.acquireMap(elemento(), { center: { lat: 1, lng: 1 }, zoom: 5 }, { area: "trail" });

    a.release();
    const b = pool.acquireMap(elemento(), { center: { lat: 2, lng: 2 }, zoom: 9 }, { area: "route-map" });

    expect(construidos).toBe(1);
    expect(b.map).toBe(a.map);
    expect(b.reutilizado).toBe(true);
    expect(eventos.map((e) => e.type)).toEqual(["cg:mapa-creado", "cg:mapa-reutilizado"]);
    expect(eventos[1].detail).toEqual({ area: "route-map", grupo: "raster" });
    b.release();
  });

  it("dos mapas a la vez son dos instancias, y luego se reutilizan las dos", () => {
    const a = pool.acquireMap(elemento(), { zoom: 1 }, { area: "timesheet" });
    const b = pool.acquireMap(elemento(), { zoom: 1 }, { area: "timesheet" });

    expect(a.map).not.toBe(b.map);
    a.release();
    b.release();
    const c = pool.acquireMap(elemento(), { zoom: 1 }, { area: "x" });
    const d = pool.acquireMap(elemento(), { zoom: 1 }, { area: "x" });

    expect(construidos).toBe(2);
    expect(new Set([c.map, d.map])).toEqual(new Set([a.map, b.map]));
  });

  it("separa vectorial (mapId + colorScheme) de ráster", () => {
    pool.acquireMap(elemento(), { mapId: "abc", colorScheme: "DARK" }, { area: "a" }).release();
    pool.acquireMap(elemento(), { mapId: "abc", colorScheme: "LIGHT" }, { area: "a" }).release();
    pool.acquireMap(elemento(), {}, { area: "a" }).release();
    expect(construidos).toBe(3);
    pool.acquireMap(elemento(), { mapId: "abc", colorScheme: "DARK" }, { area: "a" });
    expect(construidos).toBe(3);
  });

  it("al devolver quita overlays, oyentes y controles; y repone la base", () => {
    const a = pool.acquireMap(elemento(), { styles: [1], mapTypeId: "satellite" }, { area: "a" });
    const m1 = a.track(new FakeMarker({ map: a.map }));
    const m2 = a.track(new FakeMarker({ map: a.map }));

    m2.setMap(null); // el consumidor lo quitó por su cuenta
    a.map.addListener("click", () => {});
    a.map.controls[2].items.push({});
    a.release();
    expect(m1.getMap()).toBeNull();
    expect(a.map.escuchas).toHaveLength(0);
    expect(a.map.controls[2].items).toHaveLength(0);

    const b = pool.acquireMap(elemento(), { zoom: 3 }, { area: "b" });

    expect(b.map.opts.styles).toBeNull();
    expect(b.map.opts.mapTypeId).toBe("roadmap");
    // Lo que llega tarde a un préstamo devuelto no pinta en el siguiente.
    const tarde = a.track(new FakeMarker({ map: b.map }));

    expect(tarde.getMap()).toBeNull();
  });

  it("recuerda la vista por área", () => {
    const a = pool.acquireMap(elemento(), { center: { lat: 1, lng: 1 }, zoom: 4 }, { area: "cc", vista: "cc" });

    a.map.setCenter({ lat: 7, lng: 8 });
    a.map.opts.zoom = 13;
    a.release();
    const b = pool.acquireMap(elemento(), { center: { lat: 0, lng: 0 }, zoom: 2 }, { area: "cc", vista: "cc" });

    expect(b.vistaRestaurada).toBe(true);
    expect(b.map.opts.center).toEqual({ lat: 7, lng: 8 });
    expect(b.map.opts.zoom).toBe(13);
  });

  it("avisa del uso facturable de servicios de Google", () => {
    pool.avisarUsoGoogle("geocoding", "incident");
    expect(eventos.at(-1)).toEqual({
      type: "cg:google-uso",
      detail: { sku: "geocoding", area: "incident" },
    });
  });
});
