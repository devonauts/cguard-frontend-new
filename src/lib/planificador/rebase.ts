/**
 * KEEP THE DRAFT WHEN THE SCHEDULE UNDER IT CHANGES (phase 2, 2026-10-31).
 *
 * The draft is shared and lives on the server, so two things can move under
 * it while someone works:
 *   · the LIVE schedule (a direct change, another manager in Horario, the app);
 *   · the DRAFT itself (another manager saved first).
 *
 * Both are the same three-way merge: `base` is what my changes were made
 * against, `mine` is my plan, `theirs` is the newer copy. Everything I did not
 * touch takes their value; what I touched keeps mine. When both sides changed
 * the same thing, mine wins and it is listed so the screen can say so
 * («also changed by someone else»). The unit is a person, a post, and one
 * coverage cell (post|shift|day): two managers covering different days of the
 * same post never collide.
 */
import { jsonEstable } from "./borrador";
import type { Persona, Plan, Puesto } from "./motor";

export interface RebaseResult {
  plan: Plan;
  /** How many of my changes were carried over. */
  kept: number;
  /** Names of what both sides changed (mine was kept). */
  conflicts: string[];
  /** Names of what I changed but no longer exists on their side (dropped). */
  dropped: string[];
}

// Key order does not count: the server's JSON column reorders keys.
const same = (a: unknown, b: unknown) => jsonEstable(a) === jsonEstable(b);

function byId<T extends { id: string }>(list: T[] | undefined): Map<string, T> {
  return new Map((list || []).map((x) => [x.id, x]));
}

function mergeList<T extends { id: string }>(
  base: T[],
  mine: T[],
  theirs: T[],
  label: (x: T) => string,
  out: RebaseResult,
): T[] {
  const b = byId(base);
  const m = byId(mine);
  const result = new Map(byId(theirs));

  for (const [id, mineItem] of m) {
    const baseItem = b.get(id);

    if (baseItem && same(baseItem, mineItem)) continue; // I did not touch it
    const theirItem = result.get(id);

    if (!baseItem) {
      // New in my draft (a person or post the live schedule does not have yet).
      if (!theirItem) result.set(id, mineItem);
      out.kept++;
      continue;
    }
    if (!theirItem) {
      // I changed it, they removed it: it is gone, say so.
      out.dropped.push(label(mineItem));
      continue;
    }
    if (!same(theirItem, baseItem) && !same(theirItem, mineItem))
      out.conflicts.push(label(mineItem));
    result.set(id, mineItem);
    out.kept++;
  }
  // Removed in my draft and untouched on their side: stays removed.
  for (const [id, baseItem] of b) {
    if (m.has(id)) continue;
    const theirItem = result.get(id);

    if (theirItem && same(theirItem, baseItem)) {
      result.delete(id);
      out.kept++;
    }
  }
  // Their order first (it is the newest), then anything only I have.
  const order = [...theirs.map((x) => x.id), ...mine.map((x) => x.id)];
  const seen = new Set<string>();
  const list: T[] = [];

  for (const id of order) {
    if (seen.has(id) || !result.has(id)) continue;
    seen.add(id);
    list.push(result.get(id)!);
  }

  return list;
}

function mergeMap<V>(
  base: Record<string, V> | undefined,
  mine: Record<string, V> | undefined,
  theirs: Record<string, V> | undefined,
  label: (k: string) => string,
  out: RebaseResult,
): Record<string, V> {
  const b = base || {};
  const m = mine || {};
  const result: Record<string, V> = { ...(theirs || {}) };
  const keys = new Set([...Object.keys(b), ...Object.keys(m)]);

  for (const k of keys) {
    const inBase = Object.prototype.hasOwnProperty.call(b, k);
    const inMine = Object.prototype.hasOwnProperty.call(m, k);

    if (inBase === inMine && same(b[k], m[k])) continue; // untouched by me
    const inTheirs = Object.prototype.hasOwnProperty.call(theirs || {}, k);
    const theirsChanged = inBase !== inTheirs || !same(b[k], (theirs || {})[k]);

    if (theirsChanged && !(inMine === inTheirs && same(m[k], (theirs || {})[k])))
      out.conflicts.push(label(k));
    if (inMine) result[k] = m[k];
    else delete result[k];
    out.kept++;
  }

  return result;
}

/**
 * Three-way merge of a schedule plan. Pure: no input is modified.
 * `theirs` must be laid out on the same base Monday as `base` and `mine`.
 */
export function rebasePlan(base: Plan, mine: Plan, theirs: Plan): RebaseResult {
  const out: RebaseResult = {
    plan: theirs,
    kept: 0,
    conflicts: [],
    dropped: [],
  };
  const nameOfPerson = (p: Persona) => p.nombre || p.id;
  const nameOfPost = (p: Puesto) => p.nombre || p.id;
  const posts = new Map(
    [...(theirs.puestos || []), ...(mine.puestos || [])].map((p) => [p.id, p]),
  );
  const cellName = (k: string) => {
    const [post, , day] = k.split("|");

    return `${posts.get(post)?.nombre || post} · ${day}`;
  };
  const plan: Plan = {
    ...theirs,
    franjas: same(base.franjas, mine.franjas) ? theirs.franjas : mine.franjas,
    reglas: same(base.reglas, mine.reglas) ? theirs.reglas : mine.reglas,
    puestos: mergeList(base.puestos, mine.puestos, theirs.puestos, nameOfPost, out),
    personas: mergeList(base.personas, mine.personas, theirs.personas, nameOfPerson, out),
    cubre: mergeMap(base.cubre, mine.cubre, theirs.cubre, cellName, out),
    auto: mergeMap(base.auto, mine.auto, theirs.auto, cellName, out),
    no: mergeMap(base.no, mine.no, theirs.no, cellName, out),
  };

  out.plan = JSON.parse(JSON.stringify(plan));
  out.conflicts = [...new Set(out.conflicts)];
  out.dropped = [...new Set(out.dropped)];

  return out;
}

/**
 * The guards and stations a draft changes, for the server's «did someone
 * else change this after you loaded it?» check. A post's id is its station id.
 */
export function touchedBy(
  original: Plan,
  plan: Plan,
  people: Record<string, { guardId: string; stationId: string }>,
): { guardIds: string[]; stationIds: string[] } {
  const guards = new Set<string>();
  const stations = new Set<string>();
  const before = byId(original.personas);
  const postsBefore = byId(original.puestos);
  const addPerson = (id: string) => {
    const link = people[id];

    if (link?.guardId) guards.add(link.guardId);
    if (link?.stationId) stations.add(link.stationId);
  };

  for (const p of plan.personas) {
    if (!same(before.get(p.id), p)) {
      addPerson(p.id);
      if (p.puesto) stations.add(p.puesto);
    }
  }
  for (const pu of plan.puestos)
    if (!same(postsBefore.get(pu.id), pu)) stations.add(pu.id);
  const keys = new Set([
    ...Object.keys(original.cubre || {}),
    ...Object.keys(plan.cubre || {}),
  ]);

  for (const k of keys) {
    const a = original.cubre?.[k] || [];
    const b = plan.cubre?.[k] || [];

    if (same(a, b)) continue;
    stations.add(k.split("|")[0]);
    for (const id of new Set([...a, ...b])) addPerson(id);
  }

  return { guardIds: [...guards].sort(), stationIds: [...stations].sort() };
}

/**
 * The guards and stations the publish CALLS write to. A draft also publishes
 * what it never «changed» against its own base (a fixed sacafranco's automatic
 * covers have no real shift yet), so the plan diff alone misses people; the
 * calls never do. Assignment ids map back to their guard and station.
 */
export function touchedByCalls(
  calls: Array<{ ruta: string; cuerpo?: any }>,
  people: Record<string, { guardId: string; stationId: string; assignmentId?: string }>,
): { guardIds: string[]; stationIds: string[] } {
  const guards = new Set<string>();
  const stations = new Set<string>();
  const byAssignment = new Map(
    Object.values(people)
      .filter((p) => p.assignmentId)
      .map((p) => [p.assignmentId as string, p]),
  );
  const add = (set: Set<string>, v: unknown) => {
    if (typeof v === "string" && v && !v.startsWith("$")) set.add(v);
  };

  for (const c of calls) {
    const body = c.cuerpo?.data ?? c.cuerpo ?? {};

    add(guards, body.guard);
    add(guards, body.guardId);
    add(guards, body.coveringGuardId);
    add(stations, body.station);
    add(stations, body.stationId);
    const st = /\/station\/([^/]+)/.exec(c.ruta);

    if (st) stations.add(st[1]);
    const as = /\/guard-assignment\/([^/?]+)/.exec(c.ruta);
    const link = as ? byAssignment.get(as[1]) : undefined;

    if (link) {
      add(guards, link.guardId);
      add(stations, link.stationId);
    }
  }

  return { guardIds: [...guards].sort(), stationIds: [...stations].sort() };
}
