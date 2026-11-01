/**
 * NO SILENT CAPS (phase 3).
 *
 * Pickers and lists used to ask for one page — `?limit=200`, `{ limit: 1000 }`,
 * `/shift?limit=999` — and treat it as everything. A company past that number
 * simply lost people, posts or shifts from the screen, with no sign of it.
 * These helpers walk the endpoint page by page until it runs out.
 */
import { ApiService } from "@/services/api/apiService";

type Get = (url: string) => Promise<any>;

/** `[...]`, `{ rows }` or `{ data }` → the rows. */
export function filasDe(r: any): any[] {
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.rows)) return r.rows;
  if (Array.isArray(r?.data)) return r.data;
  if (Array.isArray(r?.data?.rows)) return r.data.rows;
  return [];
}

/** Hard stop against a server that ignores `offset` and repeats page one. */
const MAX_PAGINAS = 400;

/**
 * Every guard of the company, for the assignment pickers. Pages through
 * `security-guard/autocomplete` (one stable order on the server) and dedupes by
 * user id. A server that ignores `offset` repeats page one: the loop stops as
 * soon as a page brings nobody new.
 */
export async function todosLosVigilantes(
  tenantId: string,
  opciones: { query?: string; pagina?: number; get?: Get } = {},
): Promise<any> {
  const pagina = opciones.pagina ?? 500;
  const get: Get = opciones.get ?? ((u) => ApiService.get(u));
  const out: any[] = [];
  const vistos = new Set<string>();

  for (let i = 0; i < MAX_PAGINAS; i++) {
    const q = new URLSearchParams({ limit: String(pagina), offset: String(i * pagina) });

    if (opciones.query) q.set("query", opciones.query);
    const lote = filasDe(await get(`/tenant/${tenantId}/security-guard/autocomplete?${q.toString()}`));
    let nuevos = 0;

    for (const r of lote) {
      const k = String(r?.guardId || r?.id || r?.value || "");

      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      out.push(r);
      nuevos += 1;
    }
    if (lote.length < pagina || nuevos === 0) break;
  }

  return out;
}

/**
 * Every row of a `{ rows, count }` list endpoint, page by page. Stops at
 * `count` when the server gives it, else at the first short page.
 */
export async function listarTodo<T = any>(
  pedir: (pagina: { limit: number; offset: number }) => Promise<any>,
  opciones: { pagina?: number } = {},
): Promise<{ rows: T[]; count: number }> {
  const limit = opciones.pagina ?? 500;
  const rows: T[] = [];
  let count = -1;

  for (let i = 0; i < MAX_PAGINAS; i++) {
    const r = await pedir({ limit, offset: i * limit });
    const lote = filasDe(r) as T[];
    const total = Number(r?.count ?? r?.data?.count);

    if (Number.isFinite(total) && total >= 0) count = total;
    rows.push(...lote);
    if (lote.length < limit || (count >= 0 && rows.length >= count)) break;
  }

  return { rows, count: count >= 0 ? Math.max(count, rows.length) : rows.length };
}

/**
 * Shifts in a date window (optionally of one guard), all of them. Replaces
 * `/shift?limit=999`, which read the first 999 shifts of the company — any
 * company with a month of schedule had more — and filtered them in the browser.
 */
export async function turnosEntre(
  tenantId: string,
  desdeIso: string,
  hastaIso: string,
  opciones: { guardId?: string; pagina?: number; get?: Get } = {},
): Promise<any> {
  const get: Get = opciones.get ?? ((u) => ApiService.get(u));
  const { rows } = await listarTodo(({ limit, offset }) => {
    const q = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      "filter[startTimeRange][0]": desdeIso,
      "filter[startTimeRange][1]": hastaIso,
    });

    if (opciones.guardId) q.set("filter[guard]", opciones.guardId);

    return get(`/tenant/${tenantId}/shift?${q.toString()}`);
  }, { pagina: opciones.pagina ?? 1000 });

  return rows;
}
