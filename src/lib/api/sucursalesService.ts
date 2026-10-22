import { ApiService } from "@/services/api/apiService";

/**
 * SUCURSALES (módulo adicional) — dividir la operación por ciudad o región.
 * Backend: `api/sucursales`. Todo responde 402 `addon_required` sin el módulo.
 */
const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t) throw new Error("tenant");

  return t;
};
const base = () => `/tenant/${tenantId()}/branch`;

export interface SedeDeSucursal {
  id: string;
  nombre: string;
  ciudad: string | null;
  lat: number | null;
  lng: number | null;
  clientId: string | null;
}

export interface Sucursal {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  kind: "city" | "region";
  cities: string[];
  managerId: string | null;
  sortOrder: number;
  archivedAt: string | null;
  /** La sucursal principal (la matriz). Hay una y no se archiva. */
  isHeadquarters?: boolean;
  /** Centro guardado de su zona (cuando sus sedes no tienen coordenadas). */
  centerLat?: number | string | null;
  centerLng?: number | string | null;
  /** Identidad propia (opcional; vacía = la de la empresa). */
  legalName?: string | null;
  taxId?: string | null;
  country?: string | null;
  address?: string | null;
  establishmentCode?: string | null;
  email?: string | null;
  sedes: SedeDeSucursal[];
  personas: number;
}

export interface ListaDeSucursales {
  sucursales: Sucursal[];
  sinSucursal: SedeDeSucursal[];
}

export interface CifrasDeSucursal {
  branchId: string | null;
  estaciones: number;
  covered: number;
  at_risk: number;
  uncovered: number;
  idle: number;
  enTurno: number;
  incidentesAbiertos: number;
}

export interface ResumenDeSucursales {
  at: string;
  total: Record<string, number>;
  porSucursal: CifrasDeSucursal[];
}

export interface GrupoPropuesto {
  clave: string;
  nombre: string;
  ciudades: string[];
  siteIds: string[];
  sedes: number;
  estaciones: number;
  vigilantes: number;
  centro: { lat: number; lng: number } | null;
  cercaDe: string[];
}

export interface Propuesta {
  grupos: GrupoPropuesto[];
  sinUbicar: Array<{ id: string; nombre: string }>;
  totalSedes: number;
}

export const sucursalesService = {
  listar: (): Promise<ListaDeSucursales> => ApiService.get(base()),
  resumen: (): Promise<ResumenDeSucursales> =>
    ApiService.get(`${base()}/summary`),
  propuesta: (): Promise<Propuesta> => ApiService.get(`${base()}/proposal`),
  aplicarDivision: (
    grupos: Array<{ nombre: string; ciudades: string[]; siteIds: string[] }>,
  ): Promise<{ sucursales: number; sedes: number; personas: number }> =>
    ApiService.post(`${base()}/apply-division`, { grupos }),
  crear: (d: Partial<Sucursal>): Promise<Sucursal> =>
    ApiService.post(base(), d),
  actualizar: (id: string, d: Partial<Sucursal>): Promise<Sucursal> =>
    ApiService.put(`${base()}/${id}`, d),
  archivar: (id: string): Promise<{ archivada: boolean }> =>
    ApiService.post(`${base()}/${id}/archive`, {}),
  asignarSedes: (
    siteIds: string[],
    branchId: string | null,
  ): Promise<{ movidas: number }> =>
    ApiService.post(`${base()}/assign-sites`, { siteIds, branchId }),
  /** Crea o sincroniza el canal de radio de la sucursal (sus puestos y su gente). */
  canalDeRadio: (
    id: string,
  ): Promise<{ channelId: string; estaciones: number; personas: number }> =>
    ApiService.post(`${base()}/${id}/radio`, {}),
};

// ── Reglas que el panel necesita, sin red ────────────────────────────────

/** Espejo de `normalizarCiudad` del backend: «GYE» = «Guayaquil». */
const ALIAS: Record<string, string> = {
  gye: "guayaquil",
  uio: "quito",
  cdmx: "ciudad de mexico",
  "mexico df": "ciudad de mexico",
  df: "ciudad de mexico",
  "ciudad de guayaquil": "guayaquil",
  "san francisco de quito": "quito",
  bog: "bogota",
  "bogota dc": "bogota",
  "lima metropolitana": "lima",
};

export function normalizarCiudad(c: unknown): string {
  let s = String(c ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.]/g, "")
    .split(",")[0]
    .replace(/\s+/g, " ")
    .trim();

  if (ALIAS[s]) s = ALIAS[s];

  return s;
}

/** La sucursal que le toca a una sede suelta por su ciudad, si alguna la tiene. */
export function sucursalSugerida(
  ciudad: string | null,
  sucursales: Sucursal[],
): string | null {
  const c = normalizarCiudad(ciudad);

  if (!c) return null;
  const b = sucursales.find((s) =>
    [...(s.cities || []), s.name].map(normalizarCiudad).includes(c),
  );

  return b ? b.id : null;
}

/** Cobertura en % con la misma regla que el panel (fuera de turno no cuenta). */
export function coberturaDe(c: CifrasDeSucursal | undefined): number | null {
  if (!c) return null;
  const tocan = c.covered + c.at_risk + c.uncovered;

  return tocan > 0
    ? Math.min(100, Math.round((c.covered / tocan) * 100))
    : null;
}

export function distanciaKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Fase 4: quién ve qué ─────────────────────────────────────────────────

export interface MisSucursales {
  /** true = la persona puede ver todas. */
  todas: boolean;
  sucursales: Array<{
    id: string;
    name: string;
    code: string | null;
    color: string | null;
    isHeadquarters?: boolean;
  }>;
  /** El espacio guardado en la cuenta: 'global', el id de una sucursal, o null. */
  espacio?: string | null;
}

export interface AccesoDePersona {
  userId: string;
  nombre: string;
  email: string | null;
  roles: string[];
  esAdmin: boolean;
  /** Gerente de sucursal: tiene que tener sucursales (sin ellas no ve nada). */
  esGerente?: boolean;
  /** null = todas. */
  acceso: string[] | null;
}

export const accesoService = {
  mias: (): Promise<MisSucursales> => ApiService.get(`${base()}/mine`),
  listar: (): Promise<{ rows: AccesoDePersona[] }> =>
    ApiService.get(`${base()}/access`),
  fijar: (
    userId: string,
    branchIds: string[] | null,
  ): Promise<{ acceso: string[] | null }> =>
    ApiService.put(`${base()}/access/${userId}`, { branchIds }),
};

/** El espacio de trabajo guardado en la cuenta (Sucursales 2.0). */
export const espacioService = {
  leer: (): Promise<{ espacio: string | null }> =>
    ApiService.get(`${base()}/workspace`),
  fijar: (espacio: string | null): Promise<{ espacio: string | null }> =>
    ApiService.put(`${base()}/workspace`, { espacio }),
};
