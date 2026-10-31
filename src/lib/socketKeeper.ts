/**
 * ════════════════════════════════════════════════════════════════════════════
 * THE SOCKET ALWAYS COMES BACK — reconnect supervisor for the CRM's live socket
 *
 * socket.io-client reconnects on its own after a TRANSPORT failure (server
 * restart, network drop, ping timeout). It deliberately does NOT reconnect in
 * two cases, and both happen in production:
 *
 *   · the server refuses the handshake (`connect_error` from the auth
 *     middleware: "unauthorized" / "forbidden" / "server_error"). After an API
 *     restart every CRM tab reconnects in the same seconds; one refusal in that
 *     stampede (the database not ready yet) and socket.io-client never tries
 *     again — the CRM went without panic alerts, entries and alarms until the
 *     page was reloaded;
 *   · the server closes the socket on purpose (`disconnect` with reason
 *     "io server disconnect": token expiry timer, session check).
 *
 * `SocketKeeper` covers exactly those gaps: when socket.io has given up
 * (`isActive() === false`) it schedules a manual `connect` with exponential
 * backoff + jitter. Session refusals back off slower (they may be real) and ask
 * the app to verify the session over REST (a 401 there signs the person out
 * through the normal path). It also wakes the socket immediately when the tab
 * becomes visible or the network comes back, and replaces a "zombie" socket
 * (connected on paper, but no heartbeat for a long time — a laptop that slept).
 *
 * `ReconnectFanout` spreads the "catch up after a reconnection" work of every
 * screen (re-read the bell, the dashboard, the schedule…) instead of firing it
 * all in the same tick right when the freshly restarted server is busiest.
 *
 * Same logic as the field apps' `socketKeeper.ts` (worker-app branch
 * fix/socket-siempre). Pure on purpose (no socket.io, no DOM): every effect
 * goes through injected deps, so it is unit-tested with fake timers.
 * ════════════════════════════════════════════════════════════════════════════
 */

/* ── Backoff with jitter ─────────────────────────────────────────────────── */

export interface BackoffOptions {
  /** First step before jitter (ms). */
  baseMs?: number;
  /** Ceiling (ms). */
  maxMs?: number;
  /** Random source in [0, 1) (injectable for tests). */
  rnd?: () => number;
}

/**
 * Wait before retry number `attempt` (1 = the first one).
 *
 * Exponential with a ceiling and "equal jitter": half fixed, half random, i.e.
 * between 50 % and 100 % of the step. Never zero (that would bring every tab
 * back at once) and never above the ceiling.
 */
export function backoffMs(attempt: number, o: BackoffOptions = {}): number {
  const base = o.baseMs ?? 1000;
  const max = o.maxMs ?? 60_000;
  const rnd = o.rnd ?? Math.random;
  const n = Math.max(1, Math.floor(attempt));
  const step = Math.min(max, base * 2 ** Math.min(n - 1, 30));

  return Math.max(1, Math.round(step / 2 + rnd() * (step / 2)));
}

/* ── The keeper ──────────────────────────────────────────────────────────── */

export type KeeperCommand =
  /** `socket.connect()` — open a new attempt (the auth payload is re-read). */
  | "connect"
  /** Drop the current connection/attempt and open a fresh one now. */
  | "restart";

export interface KeeperDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
  /** Random source in [0, 1) (injectable for tests). */
  rnd?(): number;
  /** Perform a connection command on the real socket. */
  command(c: KeeperCommand): void;
  /** socket.io is still running its own reconnection loop (`socket.active`). */
  isActive(): boolean;
  /** The socket is connected right now (`socket.connected`). */
  isConnected(): boolean;
  /** A handshake was refused: verify the session over REST (rate-limited here). */
  verifySession?(): void;
}

export interface KeeperOptions {
  /** First retry step after socket.io gave up (ms). */
  baseMs?: number;
  /** Ceiling for transient failures (ms). */
  maxMs?: number;
  /** First retry step after a session REFUSAL (ms). */
  rejectedBaseMs?: number;
  /** Ceiling after refusals (ms). */
  rejectedMaxMs?: number;
  /** Connected but no heartbeat for this long = zombie (ms). Default 70 s (ping 25 s + timeout 20 s + margin). */
  staleMs?: number;
  /** Ask the app to verify the session at most this often (ms). */
  verifyEveryMs?: number;
}

export type KeeperPhase = "idle" | "up" | "down" | "waiting" | "stopped";

/** Disconnect reasons after which socket.io-client does NOT retry by itself. */
const NO_AUTO_RETRY = new Set(["io server disconnect"]);

/**
 * Handshake refusals about the SESSION (the server's auth middleware answers
 * "unauthorized" for no_token / no_tenant / invalid_token / expired_token /
 * session_ended and "forbidden" for forbidden_tenant / reseller_forbidden /
 * door_limit). They back off slower and trigger a REST session check.
 * `server_error` (the server failed, e.g. its DB) is not one: it is retried at
 * the normal pace.
 */
export function isRejection(message: string): boolean {
  return /unauthori[sz]ed|forbidden/i.test(message || "");
}

export class SocketKeeper {
  private readonly d: KeeperDeps;
  private readonly o: Required<KeeperOptions>;
  private timer: unknown = null;
  private attempts = 0;
  private rejected = false;
  private lastBeat = 0;
  private lastVerify = -Infinity;
  phase: KeeperPhase = "idle";
  /** When the pending manual attempt fires (ms epoch), or null. */
  nextAt: number | null = null;

  constructor(deps: KeeperDeps, opts: KeeperOptions = {}) {
    this.d = deps;
    this.o = {
      baseMs: opts.baseMs ?? 1000,
      maxMs: opts.maxMs ?? 60_000,
      rejectedBaseMs: opts.rejectedBaseMs ?? 5000,
      rejectedMaxMs: opts.rejectedMaxMs ?? 5 * 60_000,
      staleMs: opts.staleMs ?? 70_000,
      verifyEveryMs: opts.verifyEveryMs ?? 60_000,
    };
  }

  get retries(): number {
    return this.attempts;
  }

  get stopped(): boolean {
    return this.phase === "stopped";
  }

  /** The socket connected. */
  onConnect(): void {
    if (this.phase === "stopped") return;
    this.cancel();
    this.attempts = 0;
    this.rejected = false;
    this.lastBeat = this.d.now();
    this.phase = "up";
  }

  /** Any sign of life from the server (engine ping / packet). */
  onBeat(): void {
    this.lastBeat = this.d.now();
  }

  /** The socket disconnected with socket.io's `reason`. */
  onDisconnect(reason: string): void {
    if (this.phase === "stopped") return;
    this.phase = "down";
    // We closed it ourselves (restart in progress / teardown): nothing to do.
    if (reason === "io client disconnect") return;
    if (NO_AUTO_RETRY.has(reason) || !this.d.isActive()) this.schedule();
  }

  /** A connection attempt failed (`connect_error`). */
  onConnectError(message: string): void {
    if (this.phase === "stopped") return;
    this.phase = "down";
    if (isRejection(message)) {
      this.rejected = true;
      const now = this.d.now();

      if (
        this.d.verifySession &&
        now - this.lastVerify >= this.o.verifyEveryMs
      ) {
        this.lastVerify = now;
        try {
          this.d.verifySession();
        } catch {
          /* best effort */
        }
      }
    }
    // socket.io keeps retrying transport errors itself; a middleware refusal
    // leaves `active` false and nobody would ever try again.
    if (!this.d.isActive()) this.schedule();
  }

  /**
   * The tab became visible / the network is back: do not wait for a backoff
   * timer that may be minutes away. Also replaces a zombie socket.
   */
  wake(): void {
    if (this.phase === "stopped") return;
    if (this.d.isConnected()) {
      if (this.d.now() - this.lastBeat > this.o.staleMs) {
        this.attempts = 0;
        this.d.command("restart");
      }

      return;
    }
    this.cancel();
    this.attempts = 0;
    this.phase = "down";
    // socket.io may be sleeping in its own (up to 30 s) backoff: restart skips it.
    this.d.command(this.d.isActive() ? "restart" : "connect");
  }

  /** Real sign-out / teardown: never reconnect again. */
  stop(): void {
    this.cancel();
    this.phase = "stopped";
  }

  /** Is the heartbeat older than `staleMs` while connected? */
  isStale(): boolean {
    return (
      this.d.isConnected() && this.d.now() - this.lastBeat > this.o.staleMs
    );
  }

  private schedule(): void {
    if (this.timer != null) return; // one pending attempt at a time
    this.attempts++;
    const base = this.rejected ? this.o.rejectedBaseMs : this.o.baseMs;
    const max = this.rejected ? this.o.rejectedMaxMs : this.o.maxMs;
    const wait = backoffMs(this.attempts, {
      baseMs: base,
      maxMs: max,
      rnd: this.d.rnd,
    });

    this.phase = "waiting";
    this.nextAt = this.d.now() + wait;
    this.timer = this.d.setTimer(() => {
      this.timer = null;
      this.nextAt = null;
      if (this.phase === "stopped" || this.d.isConnected()) return;
      this.phase = "down";
      this.d.command(this.d.isActive() ? "restart" : "connect");
    }, wait);
  }

  private cancel(): void {
    if (this.timer != null) {
      this.d.clearTimer(this.timer);
      this.timer = null;
    }
    this.nextAt = null;
  }
}

/* ── Catching up after a reconnection, without a stampede ─────────────────── */

export interface FanoutDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(t: unknown): void;
  rnd?(): number;
  /** A handler threw: report it (never rethrown). */
  onError?(e: unknown): void;
}

export interface FanoutOptions {
  /** Handlers run one by one, this far apart (ms). */
  staggerMs?: number;
  /** After a SHORT outage the first handler waits a random time within this window (ms). */
  windowMs?: number;
  /** An outage shorter than this is treated as a server restart (ms). */
  shortOutageMs?: number;
}

/**
 * The screens' `connect` handlers. Each one re-reads its data, because a
 * websocket cannot tell what happened while it was down. Called all in the
 * same tick, a CRM with the dashboard open fired a dozen reads at the server
 * the very second it came back from a restart — times every open tab.
 *
 *   · the FIRST connection runs every handler at once (the screens just loaded,
 *     nothing is being caught up; this keeps the original behaviour);
 *   · a reconnection runs them one by one, `staggerMs` apart;
 *   · after a SHORT outage (a deploy: every tab reconnects in the same seconds)
 *     the first one waits a random time within `windowMs`; after a long one the
 *     data is old, so the catch-up starts at once;
 *   · a new disconnection cancels what is left: the next connection runs the
 *     whole list again.
 */
export class ReconnectFanout {
  private readonly d: FanoutDeps;
  private readonly o: Required<FanoutOptions>;
  private readonly handlers = new Set<() => void>();
  private connectedOnce = false;
  private downSince = 0;
  private timer: unknown = null;
  private stoppedFlag = false;

  constructor(deps: FanoutDeps, opts: FanoutOptions = {}) {
    this.d = deps;
    this.o = {
      staggerMs: opts.staggerMs ?? 150,
      windowMs: opts.windowMs ?? 5000,
      shortOutageMs: opts.shortOutageMs ?? 60_000,
    };
  }

  get size(): number {
    return this.handlers.size;
  }

  /** Is a catch-up still being handed out? */
  get pending(): boolean {
    return this.timer != null;
  }

  add(fn: () => void): void {
    if (!this.stoppedFlag) this.handlers.add(fn);
  }

  delete(fn: () => void): void {
    this.handlers.delete(fn);
  }

  has(fn: () => void): boolean {
    return this.handlers.has(fn);
  }

  onDisconnect(): void {
    if (!this.downSince) this.downSince = this.d.now();
    this.cancel();
  }

  onConnect(): void {
    if (this.stoppedFlag) return;
    this.cancel();
    if (!this.connectedOnce) {
      this.connectedOnce = true;
      this.downSince = 0;
      for (const fn of Array.from(this.handlers)) this.run(fn);

      return;
    }
    const short =
      this.downSince > 0 && this.d.now() - this.downSince < this.o.shortOutageMs;

    this.downSince = 0;
    const queue = Array.from(this.handlers);
    const rnd = this.d.rnd ?? Math.random;
    const next = () => {
      this.timer = null;
      // Unsubscribed while waiting (the screen closed): skip it.
      let fn = queue.shift();

      while (fn && !this.handlers.has(fn)) fn = queue.shift();
      if (!fn) return;
      this.run(fn);
      if (queue.length) this.timer = this.d.setTimer(next, this.o.staggerMs);
    };

    this.timer = this.d.setTimer(
      next,
      short ? Math.round(rnd() * this.o.windowMs) : 0,
    );
  }

  stop(): void {
    this.cancel();
    this.handlers.clear();
    this.stoppedFlag = true;
  }

  private run(fn: () => void): void {
    try {
      fn();
    } catch (e) {
      try {
        this.d.onError?.(e);
      } catch {
        /* */
      }
    }
  }

  private cancel(): void {
    if (this.timer != null) {
      this.d.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
