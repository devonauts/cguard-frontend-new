/**
 * THE SHARED SCHEDULE DRAFT, ON THE SERVER (phase 2, 2026-10-31).
 *
 * Thin client of `/tenant/:t/schedule-draft*` (backend
 * services/scheduling/scheduleDraftService). Every call answers in the
 * server's words; a 409 comes back as a typed `DraftConflict` so the editor
 * can merge (`rebase.ts`) instead of showing an error.
 */
import { ApiService } from "@/services/api/apiService";

import type { Plan } from "./motor";
import type { CambioEnVivo } from "./avisoEnVivo";

export interface Editor {
  id: string;
  name: string;
  at: string;
}

export interface ServerDraft {
  id: string;
  version: number;
  plan: Plan;
  original: Plan | null;
  base: string | null;
  baseAt: string | null;
  signature: string | null;
  touches: number;
  /** Live edits on what this draft changes, made after its live read (phase 5). */
  liveChanges?: CambioEnVivo[];
  updatedAt: string | null;
  updatedById: string | null;
  updatedBy?: string | null;
  editors: Editor[];
}

export interface DraftRead {
  /** Server clock when the read started: the live schedule is read after it. */
  now: string;
  draft: ServerDraft | null;
  editors: Editor[];
}

export interface Conflict {
  kind: "shift" | "assignment" | "mark";
  guard: string | null;
  station: string | null;
  day: string | null;
  by: string | null;
  at: string;
}

/** A 409/4xx the editor understands. */
export class DraftConflict extends Error {
  status: number;
  reason: string;
  draft: ServerDraft | null;
  conflicts: Conflict[];
  change: { index: number; text: string } | null;
  detail: string | null;
  constructor(status: number, body: any, fallback: string) {
    super(String(body?.message || fallback));
    this.status = status;
    this.reason = String(body?.reason || "");
    this.draft = body?.draft || null;
    this.conflicts = Array.isArray(body?.conflicts) ? body.conflicts : [];
    this.change = body?.change || null;
    this.detail = body?.detail || null;
  }
}

const ruta = (tenantId: string, rest = "") =>
  `/tenant/${tenantId}/schedule-draft${rest}`;

function rethrow(e: any): never {
  const status = Number(e?.status) || 0;

  if (status >= 400 && status < 500 && e?.data && typeof e.data === "object")
    throw new DraftConflict(status, e.data, e?.message || "");
  throw e;
}

/** The API answers the payload itself; some proxies wrap it in `data`. */
const unwrap = (r: any) => (r && typeof r === "object" && r.data && typeof r.data === "object" && !Array.isArray(r.data) && Object.keys(r).length === 1 ? r.data : r);

export async function leerBorradorDelServidor(tenantId: string): Promise<DraftRead> {
  const r = unwrap(await ApiService.get(ruta(tenantId)));

  return {
    now: String(r?.now || new Date().toISOString()),
    draft: r?.draft || null,
    editors: Array.isArray(r?.editors) ? r.editors : [],
  };
}

export interface DraftToSave {
  version: number;
  plan: Plan;
  original: Plan;
  base: string;
  baseAt: string | null;
  signature: string;
  touches: number;
  /** The guards and stations it changes: live edits on them are told to the draft. */
  touched?: { guardIds: string[]; stationIds: string[] };
}

export async function guardarBorradorEnElServidor(
  tenantId: string,
  input: DraftToSave,
): Promise<ServerDraft> {
  try {
    const r = unwrap(await ApiService.put(ruta(tenantId), { data: input }));

    return r?.draft;
  } catch (e) {
    rethrow(e);
  }
}

export async function descartarBorradorDelServidor(
  tenantId: string,
  version: number,
): Promise<void> {
  try {
    await ApiService.delete(ruta(tenantId, `?version=${version}`));
  } catch (e) {
    rethrow(e);
  }
}

export async function seguirEditando(tenantId: string): Promise<Editor[]> {
  try {
    const r = unwrap(await ApiService.post(ruta(tenantId, "/presence"), {}));

    return Array.isArray(r?.editors) ? r.editors : [];
  } catch {
    return [];
  }
}

export interface PublishInput {
  version: number;
  baseAt: string | null;
  touched: { guardIds: string[]; stationIds: string[] };
  changes: Array<{ text: string; calls: Array<{ method: string; path: string; body?: any }> }>;
}

export interface Publicado {
  applied: number;
  /** Changes left out because their shift already has a clock-in (it stays). */
  kept: Array<{ text: string; detail: string }>;
}

export async function publicarEnElServidor(
  tenantId: string,
  input: PublishInput,
): Promise<Publicado> {
  try {
    const r = unwrap(
      await ApiService.post(ruta(tenantId, "/publish"), { data: input }),
    );

    return {
      applied: Number(r?.applied) || 0,
      kept: Array.isArray(r?.kept) ? r.kept : [],
    };
  } catch (e) {
    rethrow(e);
  }
}

/**
 * Several schedule calls applied all or nothing on the server (drag-to-move an
 * assignment, move a coverage block). Throws `DraftConflict` naming the change
 * that failed; nothing was written then.
 */
export async function aplicarDeUnaVez(
  tenantId: string,
  changes: PublishInput["changes"],
): Promise<number> {
  try {
    const r = unwrap(
      await ApiService.post(`/tenant/${tenantId}/schedule/batch`, { data: { changes } }),
    );

    return Number(r?.applied) || 0;
  } catch (e) {
    rethrow(e);
  }
}
