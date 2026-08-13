/**
 * ════════════════════════════════════════════════════════════════════════════
 * MAPA DE OPERACIONES — LA ARITMÉTICA
 *
 * Todo lo que el mapa CALCULA, sin tocar el DOM ni la API de Google: cobertura
 * de un puesto, geometría de una geocerca y agrupación de sedes cercanas.
 * Separado del componente porque es lo único de esta pantalla que se puede
 * razonar (y probar) leyendo veinte líneas.
 *
 * ── LA REGLA QUE NO SE NEGOCIA ──────────────────────────────────────────────
 * «Sin ningún vigilante posicionado» NO es «sin cubrir». Si en todo el negocio
 * no hay UNA sola posición de GPS, el mapa no sabe nada: pintar los puestos en
 * rojo diría que están abandonados, cuando lo que pasa es que nadie ha fichado
 * todavía o los teléfonos no están enviando posición. Eso es `sinDatos`, y se
 * pinta en tinta apagada.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { metrosEntre, type Punto } from "@/utils/mapMotion";
import type { MapEntity } from "../types";

/** Cobertura de un puesto — el eje semántico de su chincheta. */
export type Cobertura = "cubierto" | "riesgo" | "sinCubrir" | "sinDatos";

export const COBERTURA_LABEL: Record<Cobertura, string> = {
  cubierto: "Cubierto",
  riesgo: "En riesgo",
  sinCubrir: "Sin cubrir",
  sinDatos: "Sin datos de GPS",
};

export interface PuestoEstado {
  /** Vigilantes DENTRO de la geocerca ahora mismo. */
  n: number;
  estado: Cobertura;
  /** Radio efectivo en metros (el declarado, o el de respaldo). */
  radio: number;
  /** Quiénes están dentro — el globo los enumera. */
  dentro: MapEntity[];
}

/** Radio de respaldo cuando el puesto no declara geocerca. */
const RADIO_POR_DEFECTO = 150;
/** Suelo: una geocerca de 20 m daría «sin cubrir» por el error del propio GPS. */
const RADIO_MINIMO = 120;

/** ¿Está el punto dentro del polígono? Lanzamiento de rayo, el de toda la vida. */
export function dentroDePoligono(p: Punto, poly: Punto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const cruza = a.lng > p.lng !== b.lng > p.lng;
    if (!cruza) continue;
    const x = ((b.lat - a.lat) * (p.lng - a.lng)) / (b.lng - a.lng) + a.lat;
    if (p.lat < x) dentro = !dentro;
  }
  return dentro;
}

/** Radio efectivo de un puesto, en metros. */
export function radioDe(e: MapEntity): number {
  return Math.max(RADIO_MINIMO, Number(e.meta?.geofenceRadius) || RADIO_POR_DEFECTO);
}

/** ¿Cae `p` dentro de la geocerca del puesto? Manda el polígono si lo hay. */
function cubre(puesto: MapEntity, p: Punto): boolean {
  const poly = puesto.meta?.geofencePolygon;
  if (poly && poly.length >= 3) return dentroDePoligono(p, poly);
  return metrosEntre({ lat: puesto.lat, lng: puesto.lng }, p) <= radioDe(puesto);
}

/**
 * Cuántos vigilantes hay EN cada puesto y en qué estado está.
 *
 * El criterio es la geocerca real, no el nombre del sitio: dos puestos del mismo
 * cliente comparten `postSiteName` y contarían el doble.
 */
export function calcularCobertura(entities: MapEntity[]): Map<string, PuestoEstado> {
  const puestos = entities.filter((e) => e.kind === "station");
  const vigilantes = entities.filter((e) => e.kind === "guard" || e.kind === "supervisor");
  const incidentes = entities.filter((e) => e.kind === "incident");
  const hayPosiciones = vigilantes.length > 0;
  const salida = new Map<string, PuestoEstado>();

  puestos.forEach((p) => {
    const dentro: MapEntity[] = [];
    let alerta = false;

    vigilantes.forEach((v) => {
      if (!cubre(p, { lat: v.lat, lng: v.lng })) return;
      dentro.push(v);
      if (v.status === "delayed" || v.status === "incident" || v.status === "emergency" || v.status === "offline") alerta = true;
    });
    if (!alerta) alerta = incidentes.some((i) => cubre(p, { lat: i.lat, lng: i.lng }));

    const n = dentro.length;
    const estado: Cobertura = !hayPosiciones
      ? "sinDatos"
      : n === 0
      ? "sinCubrir"
      : alerta
      ? "riesgo"
      : "cubierto";
    salida.set(p.id, { n, estado, radio: radioDe(p), dentro });
  });

  return salida;
}

/* ── Agrupación de sedes ──────────────────────────────────────────────────── */

export interface Racimo {
  /** Identidad estable mientras no cambie el zoom — el marcador se reutiliza. */
  id: string;
  lat: number;
  lng: number;
  miembros: MapEntity[];
}

/**
 * Sedes cercanas → una sola chincheta con la cifra.
 *
 * Se agrupa en una REJILLA medida en píxeles de pantalla, no en metros: lo que
 * molesta no es que dos sedes estén cerca en el mundo, sino que sus fichas se
 * solapen a la vista. En la proyección de Mercator un píxel son
 * `360 / (256 · 2^zoom)` grados de longitud, así que la celda se deriva del zoom
 * y el racimo se deshace solo al acercarse.
 */
export function agruparPorRejilla(items: MapEntity[], zoom: number, px = 76): Racimo[] {
  if (items.length <= 1) {
    return items.map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, miembros: [e] }));
  }
  const paso = (px * 360) / (256 * Math.pow(2, Math.max(1, zoom)));
  const celdas = new Map<string, MapEntity[]>();

  items.forEach((e) => {
    const clave = `${Math.floor(e.lat / paso)}:${Math.floor(e.lng / paso)}`;
    const lista = celdas.get(clave);
    if (lista) lista.push(e);
    else celdas.set(clave, [e]);
  });

  const salida: Racimo[] = [];
  celdas.forEach((miembros, clave) => {
    if (miembros.length === 1) {
      const e = miembros[0];
      salida.push({ id: e.id, lat: e.lat, lng: e.lng, miembros });
      return;
    }
    // El centro del racimo es el centroide de lo que agrupa: colocarlo en el
    // centro de la celda haría que la ficha saltara al cruzar una frontera.
    let lat = 0, lng = 0;
    miembros.forEach((m) => { lat += m.lat; lng += m.lng; });
    salida.push({
      id: `racimo:${clave}`,
      lat: lat / miembros.length,
      lng: lng / miembros.length,
      miembros,
    });
  });

  return salida;
}
