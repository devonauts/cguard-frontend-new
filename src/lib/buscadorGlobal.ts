/**
 * ⌘K — what the header search offers, as pure functions (phase 3).
 *
 * Three sources, one list the keyboard walks:
 *   1. «Personas y lugares» — what the server found (`GET /search`): guards,
 *      supervisors, office staff, stations, post sites, clients. Already
 *      scoped to the company, the branch and what the user may read.
 *   2. «Acciones» — a few shortcuts («Nuevo vigilante», «Ir a Horario»,
 *      «Sin cubrir»…), only the ones the user's permissions allow.
 *   3. «Páginas» — the side menu and Configuración, as before.
 *
 * Kept free of React so the ranking and the keyboard are tested on their own.
 */

export type TipoDeHallazgo =
  "guard" | "supervisor" | "office" | "station" | "postSite" | "client";
export type GrupoDeDestino = "menu" | "config" | "accion" | "hallazgo";

export interface Destino {
  id: string;
  label: string;
  path: string;
  grupo: GrupoDeDestino;
  /** Second line (menu group, station's site, client code…). */
  contexto?: string;
  /** Only for server hits. */
  tipo?: TipoDeHallazgo;
  /** Extra words an action answers to («crear», «agregar», «turnos»…). */
  claves?: string[];
}

export interface Hallazgo {
  kind: TipoDeHallazgo;
  id: string;
  label: string;
  detail: string | null;
  path: string;
  rank?: number;
}

/** No accents, lower case: «vigilancia» finds «Vigilância» and «RONDAS». */
export const plano = (s: string) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** 0 starts with, 1 a word starts with, 2 contains, 3 context/keyword, 99 none. */
export function marca(d: Destino, q: string): number {
  const l = plano(d.label);

  if (!q) return 99;
  if (l.startsWith(q)) return 0;
  if (l.split(/[\s·,./()-]+/).some((w) => w.startsWith(q))) return 1;
  if (l.includes(q)) return 2;
  if (plano(d.contexto ?? "").includes(q)) return 3;
  if ((d.claves || []).some((k) => plano(k).startsWith(q))) return 3;

  return 99;
}

export function filtrar(
  destinos: Destino[],
  consulta: string,
  max: number,
): Destino[] {
  const q = plano(consulta.trim());

  if (!q) return [];

  return destinos
    .map((d, i) => ({ d, r: marca(d, q), i }))
    .filter((x) => x.r < 99)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .map((x) => x.d);
}

/** Server hits → destinations (their order is the server's ranking). */
export function deHallazgos(hits: Hallazgo[] | null | undefined): Destino[] {
  return (hits || [])
    .filter((h) => h && h.id && h.path && h.label)
    .map((h) => ({
      id: `${h.kind}:${h.id}`,
      label: h.label,
      path: h.path,
      grupo: "hallazgo" as const,
      tipo: h.kind,
      contexto: h.detail || undefined,
    }));
}

export interface AccionRapida {
  id: string;
  label: string;
  path: string;
  claves?: string[];
  /** Any of these permissions (empty = everyone in the CRM). */
  permisos?: string[];
}

export function accionesPermitidas(
  todas: AccionRapida[],
  tiene: (p: string) => boolean,
): Destino[] {
  return todas
    .filter((a) => !a.permisos?.length || a.permisos.some((p) => tiene(p)))
    .map((a) => ({
      id: `accion:${a.id}`,
      label: a.label,
      path: a.path,
      grupo: "accion" as const,
      claves: a.claves,
    }));
}

export interface Secciones {
  hallazgos: Destino[];
  acciones: Destino[];
  paginas: Destino[];
}

/**
 * The panel, in display order: people and places first (what you most likely
 * typed a name for), then actions, then pages. Each section is capped so a
 * long list of pages never pushes people out.
 */
export function secciones(
  consulta: string,
  hits: Hallazgo[] | null | undefined,
  acciones: Destino[],
  paginas: Destino[],
): Secciones {
  return {
    hallazgos: deHallazgos(hits).slice(0, 8),
    acciones: filtrar(acciones, consulta, 3),
    paginas: filtrar(paginas, consulta, 6),
  };
}

export const enOrden = (s: Secciones): Destino[] => [
  ...s.hallazgos,
  ...s.acciones,
  ...s.paginas,
];

/** Arrow keys wrap around; an empty list keeps the cursor at 0. */
export function moverCursor(
  cursor: number,
  delta: number,
  total: number,
): number {
  if (total <= 0) return 0;

  return (((cursor + delta) % total) + total) % total;
}

/** Ask the server only from this length on (matches the backend MIN_QUERY). */
export const MIN_SERVIDOR = 2;
export const debeBuscarEnServidor = (consulta: string) =>
  plano(consulta.trim()).length >= MIN_SERVIDOR;
