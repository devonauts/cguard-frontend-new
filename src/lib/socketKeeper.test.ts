import { describe, expect, it } from "vitest";

import {
  backoffMs,
  isRejection,
  ReconnectFanout,
  SocketKeeper,
  type KeeperCommand,
} from "./socketKeeper";

/**
 * The reconnect supervisor of the CRM's live socket. Pure: a fake clock and a
 * fake socket drive it. Same cases as the field apps' `socketKeeper.test.ts`,
 * plus the CRM's spread-out catch-up after a reconnection.
 */

/** A fake clock with timers that fire in order when time advances. */
function clock() {
  let now = 1_000_000;
  let id = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();

  return {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const t = ++id;

      timers.set(t, { at: now + ms, fn });

      return t;
    },
    clearTimer: (t: unknown) => {
      timers.delete(t as number);
    },
    pending: () => timers.size,
    advance(ms: number) {
      const end = now + ms;

      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];

        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}

function harness(opts: { active?: boolean; connected?: boolean } = {}) {
  const c = clock();
  const commands: KeeperCommand[] = [];
  const sock = {
    active: opts.active ?? false,
    connected: opts.connected ?? false,
  };
  let verifies = 0;
  const k = new SocketKeeper({
    now: c.now,
    setTimer: c.setTimer,
    clearTimer: c.clearTimer,
    rnd: () => 0.5,
    command: (cmd) => commands.push(cmd),
    isActive: () => sock.active,
    isConnected: () => sock.connected,
    verifySession: () => {
      verifies++;
    },
  });

  return { k, sock, commands, c, verifies: () => verifies };
}

describe("SocketKeeper", () => {
  it("retries a refused handshake (the 2026-10-30 reproduction), never abandons it", () => {
    const h = harness();

    h.k.onConnect();
    h.sock.active = true; // server restart: socket.io retries by itself…
    h.k.onDisconnect("transport close");
    expect(h.c.pending()).toBe(0);
    h.sock.active = false; // …until the middleware refuses the handshake
    h.k.onConnectError("unauthorized");
    expect(h.k.phase).toBe("waiting");
    expect(h.verifies()).toBe(1);
    h.c.advance(10_000);
    expect(h.commands).toEqual(["connect"]);
    // Still refused: keeps going, slower, but never stops.
    for (let i = 0; i < 20; i++) {
      h.k.onConnectError("unauthorized");
      h.c.advance(5 * 60_000);
    }
    expect(h.commands).toHaveLength(21);
    // The session check is rate-limited (at most once a minute).
    expect(h.verifies()).toBeLessThanOrEqual(21);
  });

  it("backs off exponentially after refusals, up to 5 minutes", () => {
    const h = harness();
    const waits: number[] = [];

    for (let i = 0; i < 10; i++) {
      h.k.onConnectError("unauthorized");
      waits.push((h.k.nextAt as number) - h.c.now());
      h.c.advance(waits[i]);
    }
    for (let i = 1; i < waits.length; i++)
      expect(waits[i]).toBeGreaterThanOrEqual(waits[i - 1]);
    expect(waits[0]).toBeGreaterThanOrEqual(2500);
    expect(waits[0]).toBeLessThanOrEqual(5000);
    expect(Math.max(...waits)).toBeLessThanOrEqual(5 * 60_000);
  });

  it("retries a server-initiated disconnect (token expiry, session check)", () => {
    const h = harness({ active: false });

    h.k.onConnect();
    h.k.onDisconnect("io server disconnect");
    expect(h.k.phase).toBe("waiting");
    h.c.advance(2000);
    expect(h.commands).toEqual(["connect"]);
  });

  it("leaves transport failures to socket.io's own loop", () => {
    const h = harness({ active: true });

    h.k.onConnect();
    h.k.onDisconnect("ping timeout");
    h.k.onConnectError("websocket error");
    expect(h.c.pending()).toBe(0);
    expect(h.commands).toEqual([]);
  });

  it("never schedules anything after our own disconnect", () => {
    const h = harness();

    h.k.onConnect();
    h.k.onDisconnect("io client disconnect");
    expect(h.c.pending()).toBe(0);
  });

  it("wakes the socket at once when the tab is visible again / the network is back", () => {
    const h = harness();

    h.k.onConnectError("unauthorized");
    expect(h.c.pending()).toBe(1);
    h.k.wake();
    expect(h.c.pending()).toBe(0);
    expect(h.commands).toEqual(["connect"]);
    h.sock.active = true; // socket.io sleeping in its own backoff
    h.k.wake();
    expect(h.commands).toEqual(["connect", "restart"]);
  });

  it("replaces a zombie socket (connected, no heartbeat) on wake", () => {
    const h = harness({ connected: true });

    h.k.onConnect();
    h.c.advance(30_000);
    h.k.wake();
    expect(h.commands).toEqual([]);
    h.c.advance(60_000);
    expect(h.k.isStale()).toBe(true);
    h.k.wake();
    expect(h.commands).toEqual(["restart"]);
    h.k.onBeat();
    expect(h.k.isStale()).toBe(false);
  });

  it("stop() (sign-out / teardown) ends everything for good", () => {
    const h = harness();

    h.k.onConnectError("unauthorized");
    h.k.stop();
    expect(h.k.stopped).toBe(true);
    expect(h.c.pending()).toBe(0);
    h.k.onDisconnect("io server disconnect");
    h.k.onConnectError("unauthorized");
    h.k.wake();
    h.c.advance(10 * 60_000);
    expect(h.commands).toEqual([]);
  });

  it("retries `server_error` at the normal pace, without a session check", () => {
    const h = harness();

    h.k.onConnectError("server_error");
    expect(h.verifies()).toBe(0);
    expect((h.k.nextAt as number) - h.c.now()).toBeLessThanOrEqual(1000);
    h.c.advance(1000);
    expect(h.commands).toEqual(["connect"]);
  });

  it("resets the backoff on a successful connect", () => {
    const h = harness();

    for (let i = 0; i < 6; i++) {
      h.k.onConnectError("server_error");
      h.c.advance(10 * 60_000);
    }
    expect(h.k.retries).toBeGreaterThanOrEqual(6);
    h.k.onConnect();
    expect(h.k.retries).toBe(0);
    h.k.onDisconnect("io server disconnect");
    expect((h.k.nextAt as number) - h.c.now()).toBeLessThanOrEqual(1000);
  });

  it("keeps a single pending attempt however many failures arrive", () => {
    const h = harness();

    h.k.onConnectError("server_error");
    h.k.onConnectError("server_error");
    h.k.onDisconnect("io server disconnect");
    expect(h.c.pending()).toBe(1);
  });

  it("does not reconnect from a timer when the socket is already connected", () => {
    const h = harness();

    h.k.onConnectError("server_error");
    h.sock.connected = true;
    h.c.advance(5000);
    expect(h.commands).toEqual([]);
  });
});

describe("isRejection", () => {
  it("recognises the session refusals of the auth middleware only", () => {
    for (const m of ["unauthorized", "forbidden", "Unauthorised"])
      expect(isRejection(m)).toBe(true);
    for (const m of [
      "server_error",
      "websocket error",
      "timeout",
      "xhr poll error",
      "",
    ])
      expect(isRejection(m)).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows exponentially with equal jitter and a ceiling, never zero", () => {
    const lo = () => 0;
    const hi = () => 0.999999;

    expect(backoffMs(1, { baseMs: 1000, rnd: lo })).toBe(500);
    expect(backoffMs(1, { baseMs: 1000, rnd: hi })).toBe(1000);
    expect(backoffMs(3, { baseMs: 1000, rnd: lo })).toBe(2000);
    expect(backoffMs(50, { baseMs: 1000, maxMs: 60_000, rnd: hi })).toBe(
      60_000,
    );
    expect(backoffMs(1, { baseMs: 0, rnd: lo })).toBe(1);
    expect(backoffMs(0, { baseMs: 1000, rnd: lo })).toBe(500);
  });
});

describe("ReconnectFanout", () => {
  function fanout(rnd = 0.5) {
    const c = clock();
    const errors: unknown[] = [];
    const f = new ReconnectFanout({
      now: c.now,
      setTimer: c.setTimer,
      clearTimer: c.clearTimer,
      rnd: () => rnd,
      onError: (e) => errors.push(e),
    });
    const calls: Array<[string, number]> = [];
    const handler = (name: string) => () => calls.push([name, c.now()]);

    return { f, c, calls, handler, errors };
  }

  it("runs every handler at once on the FIRST connection", () => {
    const h = fanout();

    h.f.add(h.handler("bell"));
    h.f.add(h.handler("map"));
    h.f.onConnect();
    expect(h.calls.map(([n]) => n)).toEqual(["bell", "map"]);
    expect(new Set(h.calls.map(([, t]) => t)).size).toBe(1);
  });

  it("spreads the catch-up after a short outage (a deploy) over a random window, one by one", () => {
    const h = fanout(0.5);
    const names = ["bell", "map", "schedule", "coverage"];

    for (const n of names) h.f.add(h.handler(n));
    h.f.onConnect();
    h.calls.length = 0;
    h.f.onDisconnect();
    h.c.advance(8000); // server down 8 s
    const back = h.c.now();

    h.f.onConnect();
    expect(h.calls).toEqual([]); // nothing in the reconnect tick
    h.c.advance(10_000);
    expect(h.calls.map(([n]) => n)).toEqual(names);
    expect(h.calls[0][1] - back).toBe(2500); // rnd 0.5 × 5 s window
    for (let i = 1; i < h.calls.length; i++)
      expect(h.calls[i][1] - h.calls[i - 1][1]).toBe(150);
  });

  it("starts the catch-up at once after a long outage, still one by one", () => {
    const h = fanout(0.9);

    h.f.add(h.handler("a"));
    h.f.add(h.handler("b"));
    h.f.onConnect();
    h.calls.length = 0;
    h.f.onDisconnect();
    h.c.advance(5 * 60_000);
    const back = h.c.now();

    h.f.onConnect();
    h.c.advance(0);
    expect(h.calls).toEqual([["a", back]]);
    h.c.advance(150);
    expect(h.calls.map(([n]) => n)).toEqual(["a", "b"]);
  });

  it("measures the outage from the FIRST failure (refused attempts do not reset it)", () => {
    const h = fanout(0.5); // a short outage would wait 2.5 s

    h.f.add(h.handler("a"));
    h.f.onConnect();
    h.calls.length = 0;
    h.f.onDisconnect();
    h.c.advance(50_000);
    h.f.onDisconnect(); // a refused attempt
    h.c.advance(20_000); // 70 s in total: long
    h.f.onConnect();
    h.c.advance(0);
    expect(h.calls).toHaveLength(1);
  });

  it("skips handlers removed while waiting, and a new disconnection cancels the rest", () => {
    const h = fanout(0);
    const b = h.handler("b");

    h.f.add(h.handler("a"));
    h.f.add(b);
    h.f.add(h.handler("c"));
    h.f.onConnect();
    h.calls.length = 0;
    h.f.onDisconnect();
    h.c.advance(1000);
    h.f.onConnect();
    h.f.delete(b);
    h.c.advance(0);
    expect(h.calls.map(([n]) => n)).toEqual(["a"]);
    h.f.onDisconnect();
    h.c.advance(10_000);
    expect(h.calls.map(([n]) => n)).toEqual(["a"]);
    expect(h.f.pending).toBe(false);
    h.f.onConnect();
    h.c.advance(10_000);
    expect(h.calls.map(([n]) => n)).toEqual(["a", "a", "c"]);
  });

  it("a failing handler never stops the others", () => {
    const h = fanout();

    h.f.add(() => {
      throw new Error("boom");
    });
    h.f.add(h.handler("ok"));
    h.f.onConnect();
    expect(h.calls.map(([n]) => n)).toEqual(["ok"]);
    expect(h.errors).toHaveLength(1);
  });

  it("stop() drops every handler and ignores later connections", () => {
    const h = fanout();

    h.f.add(h.handler("a"));
    h.f.stop();
    h.f.add(h.handler("b"));
    h.f.onConnect();
    h.c.advance(10_000);
    expect(h.calls).toEqual([]);
    expect(h.f.size).toBe(0);
  });
});
