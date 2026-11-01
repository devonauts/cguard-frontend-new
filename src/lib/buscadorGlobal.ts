/**
 * ⌘K — what the header search offers, as pure functions (phase 3).
 *
 * Three sources, one list the keyboard walks:
 *   1. What the server found (`GET /search`), already scoped to the company,
 *      the branch and what the user may read, in three groups: «Personas y
 *      lugares» (guards, supervisors, office staff, stations, post sites,
 *      clients), «Vehículos» and «Incidentes» (phase 4, newest first).
 *   2. «Acciones» — a few shortcuts («Nuevo vigilante», «Ir a Horario»,
 *      «Sin cubrir»…), only the ones the user's permissions allow.
 *   3. «Páginas» — the side menu and Configuración, as before.
 *
 * Kept free of React so the ranking and the keyboard are tested on their own.
 */

export type TipoDeHallazgo =
  | "guard"
  | "supervisor"
  | "office"
  | "station"
  | "postSite"
  | "client"
  | "vehicle"
  | "incident";
/** What a role may search on the server (the response's `groups`). */
export type GrupoDeBusqueda = "people" | "places" | "vehicles" | "incidents";
export const GRUPOS_DE_BUSQUEDA: GrupoDeBusqueda[] = [
  "people",
  "places",
  "vehicles",
  "incidents",
];
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
  /** Incidents: when it happened (ISO). */
  cuando?: string;
}

export interface Hallazgo {
  kind: TipoDeHallazgo;
  id: string;
  label: string;
  detail: string | null;
  path: string;
  rank?: number;
  at?: string | null;
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
      cuando: h.at || undefined,
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
  vehiculos: Destino[];
  incidentes: Destino[];
  acciones: Destino[];
  paginas: Destino[];
}

/** Display order of the sections, which is also the keyboard's order. */
export const ORDEN_DE_SECCIONES = [
  "hallazgos",
  "vehiculos",
  "incidentes",
  "acciones",
  "paginas",
] as const;
export type ClaveDeSeccion = (typeof ORDEN_DE_SECCIONES)[number];

/**
 * The panel, in display order: people and places first (what you most likely
 * typed a name for), then vehicles and incidents, then actions, then pages.
 * Each section is capped so a long list never pushes another out.
 */
export function secciones(
  consulta: string,
  hits: Hallazgo[] | null | undefined,
  acciones: Destino[],
  paginas: Destino[],
): Secciones {
  const del = deHallazgos(hits);

  return {
    hallazgos: del
      .filter((d) => d.tipo !== "vehicle" && d.tipo !== "incident")
      .slice(0, 8),
    vehiculos: del.filter((d) => d.tipo === "vehicle").slice(0, 5),
    incidentes: del.filter((d) => d.tipo === "incident").slice(0, 6),
    acciones: filtrar(acciones, consulta, 3),
    paginas: filtrar(paginas, consulta, 6),
  };
}

export const enOrden = (s: Secciones): Destino[] =>
  ORDEN_DE_SECCIONES.flatMap((k) => s[k]);

/** Index in `enOrden(s)` of the first row of section `clave`. */
export function inicioDeSeccion(s: Secciones, clave: ClaveDeSeccion): number {
  let n = 0;

  for (const k of ORDEN_DE_SECCIONES) {
    if (k === clave) return n;
    n += s[k].length;
  }

  return n;
}

/**
 * The server groups this role may NOT search, for the «your role can't search
 * …» note. Unknown (no answer yet, or an old server) → nothing to say.
 */
export function gruposQueFaltan(
  grupos: GrupoDeBusqueda[] | null | undefined,
): GrupoDeBusqueda[] {
  if (!Array.isArray(grupos)) return [];

  return GRUPOS_DE_BUSQUEDA.filter((g) => !grupos.includes(g));
}

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
