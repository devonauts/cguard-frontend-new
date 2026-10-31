import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/socket` wired to a fake socket.io: the shared socket must come back by
 * itself after the server refuses a handshake or cuts the socket, keep every
 * screen's listeners, read the token fresh, and spread the screens' catch-up
 * after a reconnection. Reproduces the 2026-10-30 failure (one `server_error`
 * refusal during the reconnect stampede after an API restart = no live
 * notices until a reload).
 */

type Fn = (...a: any[]) => void;

const h = vi.hoisted(() => {
  class FakeManager {
    delay = 0;
    private ls = new Map<string, Set<Fn>>();
    reconnectionDelay(v: number) {
      this.delay = v;

      return this;
    }
    on(e: string, f: Fn) {
      if (!this.ls.has(e)) this.ls.set(e, new Set());
      this.ls.get(e)!.add(f);

      return this;
    }
    off(e: string, f: Fn) {
      this.ls.get(e)?.delete(f);

      return this;
    }
    fire(e: string, ...a: any[]) {
      for (const f of Array.from(this.ls.get(e) || [])) f(...a);
    }
  }

  class FakeSocket {
    connected = false;
    active = true;
    io = new FakeManager();
    connects = 0;
    disconnects = 0;
    handshakes: any[] = [];
    private ls = new Map<string, Fn[]>();
    private any: Fn[] = [];
    constructor(
      public url: string,
      public opts: any,
    ) {
      this.handshake();
    }
    on(e: string, f: Fn) {
      if (!this.ls.has(e)) this.ls.set(e, []);
      this.ls.get(e)!.push(f);

      return this;
    }
    once(e: string, f: Fn) {
      const w: any = (...a: any[]) => {
        this.off(e, w);
        f(...a);
      };

      w.fn = f;

      return this.on(e, w);
    }
    off(e?: string, f?: Fn) {
      if (!e) this.ls.clear();
      else if (!f) this.ls.delete(e);
      else
        this.ls.set(
          e,
          (this.ls.get(e) || []).filter((x: any) => x !== f && x.fn !== f),
        );

      return this;
    }
    removeAllListeners() {
      this.ls.clear();

      return this;
    }
    onAny(f: Fn) {
      this.any.push(f);

      return this;
    }
    emit() {
      return this;
    }
    listeners(e: string) {
      return this.ls.get(e) || [];
    }
    connect() {
      this.connects++;
      this.active = true;
      this.handshake();

      return this;
    }
    disconnect() {
      this.disconnects++;
      const was = this.connected;

      this.connected = false;
      this.active = false;
      if (was) this.fire("disconnect", "io client disconnect");

      return this;
    }
    private handshake() {
      const a = this.opts?.auth;

      if (typeof a === "function") a((d: any) => this.handshakes.push(d));
      else this.handshakes.push(a);
    }
    // ── what the server does ──
    accept() {
      this.connected = true;
      this.active = true;
      this.fire("connect");
    }
    refuse(message: string, reason = message) {
      // A middleware refusal: socket.io-client destroys the socket (active = false).
      this.connected = false;
      this.active = false;
      const err: any = new Error(message);

      err.data = { reason };
      this.fire("connect_error", err);
    }
    cut() {
      this.connected = false;
      this.active = false;
      this.fire("disconnect", "io server disconnect");
    }
    event(name: string, ...a: any[]) {
      for (const f of this.any) f(name, ...a);
      this.fire(name, ...a);
    }
    fire(e: string, ...a: any[]) {
      for (const f of Array.from(this.ls.get(e) || [])) f(...a);
    }
  }

  return {
    FakeSocket,
    sockets: [] as InstanceType<typeof FakeSocket>[],
    authMe: { calls: 0 },
  };
});

vi.mock("socket.io-client", () => ({
  io: (url: string, opts: any) => {
    const s = new h.FakeSocket(url, opts);

    h.sockets.push(s);

    return s;
  },
}));
vi.mock("./apiBase", () => ({
  resolveApiBase: () => "http://api.test/api",
}));
vi.mock("./recarga/recarga", () => ({ pedirRecarga: () => {} }));
vi.mock("./seguridad/puertaEnVivo", () => ({
  engancharPuerta: () => () => {},
}));
vi.mock("../services/api/apiService", () => ({
  ApiService: {
    get: (path: string) => {
      if (path === "/auth/me") h.authMe.calls++;

      return Promise.resolve({});
    },
  },
}));

/* ── a minimal browser ── */
const store = new Map<string, string>();
const win = Object.assign(new EventTarget(), {
  location: { origin: "http://crm.test", pathname: "/dashboard" },
});
const doc = Object.assign(new EventTarget(), {
  visibilityState: "visible" as "visible" | "hidden",
});

async function cargar() {
  vi.resetModules();

  return await import("./socket");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  store.clear();
  store.set("authToken", "tok-1");
  h.sockets.length = 0;
  h.authMe.calls = 0;
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the CRM live socket always comes back", () => {
  it("retries a refused handshake on the SAME socket and keeps every screen's listeners", async () => {
    const m = await cargar();
    const bell = m.crearSocket("tok-1", "t1");
    const avisos: any[] = [];

    bell.on("notification", (n: any) => avisos.push(n));
    const s = h.sockets[0];

    s.accept();
    // API restart: the first reconnect hits the DB before it is ready.
    s.refuse("server_error");
    expect(s.connects).toBe(0);
    await vi.advanceTimersByTimeAsync(1000); // server_error: normal pace (≤ 1 s)
    expect(s.connects).toBe(1);
    expect(h.authMe.calls).toBe(0); // not a session problem
    s.accept();
    s.event("notification", { id: "panic-1" });
    expect(avisos).toEqual([{ id: "panic-1" }]);
    expect(h.sockets).toHaveLength(1);
  });

  it("a screen mounting while the socket is down reuses it instead of wiping it", async () => {
    const m = await cargar();
    const bell = m.crearSocket("tok-1", "t1");
    const avisos: any[] = [];

    bell.on("notification", (n: any) => avisos.push(n));
    h.sockets[0].accept();
    h.sockets[0].refuse("server_error");
    const panel = m.crearSocket("tok-1", "t1"); // the old code closed + replaced here

    expect(h.sockets).toHaveLength(1);
    expect((panel as any).__target).toBe(h.sockets[0]);
    await vi.advanceTimersByTimeAsync(1000);
    h.sockets[0].accept();
    h.sockets[0].event("notification", { id: "n2" });
    expect(avisos).toEqual([{ id: "n2" }]);
  });

  it("a session refusal backs off slower and checks the session over REST", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    const s = h.sockets[0];

    s.refuse("unauthorized", "session_ended");
    await vi.waitFor(() => expect(h.authMe.calls).toBe(1));
    expect(s.connects).toBe(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.connects).toBe(0);
    await vi.advanceTimersByTimeAsync(3000); // first step 2.5–5 s
    expect(s.connects).toBe(1);
  });

  it("reconnects after the server cuts the socket (io server disconnect)", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    const s = h.sockets[0];

    s.accept();
    s.cut();
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.connects).toBe(1);
  });

  it("reads the token fresh on every attempt", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    const s = h.sockets[0];

    expect(s.handshakes[0]).toEqual({ token: "tok-1", tenantId: "t1" });
    store.set("authToken", "tok-2");
    s.refuse("server_error");
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.handshakes[1]).toEqual({ token: "tok-2", tenantId: "t1" });
  });

  it("does not try to reconnect once signed out", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    const s = h.sockets[0];

    s.accept();
    store.delete("authToken");
    s.cut();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(s.connects).toBe(0);
  });

  it("reconnects at once when the tab becomes visible or the network comes back", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    const s = h.sockets[0];

    s.refuse("unauthorized");
    expect(s.connects).toBe(0);
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(s.connects).toBe(1);
    s.refuse("unauthorized");
    win.dispatchEvent(new Event("online"));
    expect(s.connects).toBe(2);
  });

  it("replaces a zombie socket (connected, no heartbeat for minutes)", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    const s = h.sockets[0];

    s.accept();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.disconnects).toBe(0);
    await vi.advanceTimersByTimeAsync(30_000); // > 70 s without a beat
    expect(s.disconnects).toBe(1);
    expect(s.connects).toBe(1);
  });

  it("a heartbeat keeps a quiet socket alive", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    const s = h.sockets[0];

    s.accept();
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(25_000);
      s.io.fire("ping");
    }
    expect(s.disconnects).toBe(0);
  });

  it("stops for good when the last screen lets go", async () => {
    const m = await cargar();
    const a = m.crearSocket("tok-1", "t1");

    h.sockets[0].accept();
    m.cerrarSocket(a);
    const s = h.sockets[0];

    expect(s.disconnects).toBe(1);
    s.cut();
    doc.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(s.connects).toBe(0);
  });

  it("a new session in the tab re-handshakes the same socket, listeners kept", async () => {
    const m = await cargar();
    const root = m.crearSocket("tok-1", "t1"); // co-browse, mounted at the root
    const recibidos: string[] = [];

    root.on("cobrowse:start", () => recibidos.push("start"));
    const s = h.sockets[0];

    s.accept();
    store.set("authToken", "tok-2"); // signed in again in this tab
    m.crearSocket("tok-2", "t1");
    expect(h.sockets).toHaveLength(1);
    expect(s.disconnects).toBe(1);
    expect(s.connects).toBe(1);
    expect(s.handshakes[s.handshakes.length - 1]).toEqual({ token: "tok-2", tenantId: "t1" });
    s.accept();
    s.event("cobrowse:start", {});
    expect(recibidos).toEqual(["start"]);
  });

  it("server:restarting stretches socket.io's delay; the next connect restores it", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    const s = h.sockets[0];

    s.accept();
    s.event("server:restarting", { reintentarEnMs: { min: 1000, max: 9000 } });
    expect(s.io.delay).toBe(5000); // random 0.5 within [1 s, 9 s]
    s.accept();
    expect(s.io.delay).toBe(2000);
  });

  it("session:expired asks the server about the session", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    h.sockets[0].event("session:expired", {});
    await vi.waitFor(() => expect(h.authMe.calls).toBe(1));
  });
});

describe("the screens' catch-up after a reconnection", () => {
  it("runs at once on the first connection and spread out after a reconnection", async () => {
    const m = await cargar();
    const llamadas: Array<[string, number]> = [];
    const t0 = Date.now();

    for (const n of ["bell", "dashboard", "schedule"]) {
      m.crearSocket("tok-1", "t1").on("connect", () =>
        llamadas.push([n, Date.now() - t0]),
      );
    }
    const s = h.sockets[0];

    s.accept();
    expect(llamadas.map(([n]) => n)).toEqual(["bell", "dashboard", "schedule"]);
    llamadas.length = 0;
    // A deploy: down a few seconds, back.
    s.fire("disconnect", "transport close");
    await vi.advanceTimersByTimeAsync(4000);
    s.accept();
    expect(llamadas).toEqual([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(llamadas.map(([n]) => n)).toEqual(["bell", "dashboard", "schedule"]);
    const tiempos = llamadas.map(([, t]) => t);

    expect(tiempos[1] - tiempos[0]).toBe(150);
    expect(tiempos[2] - tiempos[1]).toBe(150);
  });

  it("off('connect') removes only the caller's handler; the keeper keeps watching", async () => {
    const m = await cargar();
    const a = m.crearSocket("tok-1", "t1");
    const b = m.crearSocket("tok-1", "t1");
    let llamadasB = 0;
    const fa = () => {};

    a.on("connect", fa);
    b.on("connect", () => llamadasB++);
    a.off("connect", fa);
    a.off("connect");
    const s = h.sockets[0];

    s.accept();
    expect(llamadasB).toBe(1);
    s.refuse("server_error");
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.connects).toBe(1); // the keeper's own listeners are intact
  });

  it("a screen that unmounts takes its catch-up handler with it", async () => {
    const m = await cargar();
    const a = m.crearSocket("tok-1", "t1");
    const b = m.crearSocket("tok-1", "t1");
    const quien: string[] = [];

    a.on("connect", () => quien.push("a"));
    b.on("connect", () => quien.push("b"));
    const s = h.sockets[0];

    s.accept();
    m.cerrarSocket(a);
    quien.length = 0;
    s.fire("disconnect", "transport close");
    s.accept();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(quien).toEqual(["b"]);
  });

  it("a different company is a different socket", async () => {
    const m = await cargar();

    m.crearSocket("tok-1", "t1");
    h.sockets[0].accept();
    m.crearSocket("tok-1", "t2");
    expect(h.sockets).toHaveLength(2);
    expect(h.sockets[0].disconnects).toBe(1);
  });
});
