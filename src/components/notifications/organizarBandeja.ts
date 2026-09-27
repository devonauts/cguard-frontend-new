/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA BANDEJA COMO EL CENTRO DE NOTIFICACIONES DE iOS
 *
 * Antes (2026-09-20) la bandeja iba por GRUPO y, dentro, por prioridad: un
 * pánico no quedaba enterrado, pero las horas saltaban en cada cambio de grupo
 * —«hace 4 h, ahora, hace 1 h, hace 4 h»— y 36 avisos parecían tirados al azar.
 * Lo que pidió el dueño (2026-09-27): que se lea como el de iOS.
 *
 * Tres reglas, en este orden:
 *
 *  1. REQUIERE ATENCIÓN arriba, fuera del tiempo: sólo lo de prioridad
 *     `emergency` sin leer (pánico, SOS, despacho). Es lo único que puede
 *     saltarse el orden, y por eso es lo único que lo hace.
 *  2. Lo demás, POR TIEMPO: secciones por día (hoy, ayer, y cada día anterior,
 *     en la zona de la EMPRESA) y dentro, lo más reciente primero.
 *  3. PILAS por familia dentro de cada día (como iOS agrupa por app): «Asistencia
 *     · 5» enseña el último y se despliega. Una pila se ordena por su aviso más
 *     reciente, así que la hora de arriba de cada pila siempre baja.
 *
 * Se ordena por `createdAt` —cuándo LLEGÓ—, que es la hora que se enseña. La
 * hora en que PASÓ (`occurredAt`) va aparte, en la fila: ordenar por una y
 * enseñar la otra es exactamente el desorden que se vino a quitar.
 *
 * Función pura: se prueba sin navegador (no hay jsdom en este repo).
 * ════════════════════════════════════════════════════════════════════════════
 */
import {
  familiaDe,
  prioridadDe,
  type FamiliaDeAviso,
} from "./catalogoDeAvisos";

export interface AvisoOrdenable {
  id: string;
  eventType: string;
  createdAt: string;
  occurredAt?: string;
}

export interface Pila<T extends AvisoOrdenable> {
  /** Clave estable para React y para recordar si está desplegada. */
  clave: string;
  familia: FamiliaDeAviso;
  /** Del más reciente al más antiguo. */
  avisos: T[];
}

export interface Seccion<T extends AvisoOrdenable> {
  /** `YYYY-MM-DD` en la zona de la empresa. */
  dia: string;
  tipo: "hoy" | "ayer" | "antes";
  pilas: Pila<T>[];
}

export interface BandejaOrganizada<T extends AvisoOrdenable> {
  atencion: T[];
  secciones: Seccion<T>[];
}

const ms = (v: string | undefined) => {
  const t = v ? new Date(v).getTime() : NaN;

  return Number.isFinite(t) ? t : 0;
};

/** `YYYY-MM-DD` de un instante en una zona. */
export function diaEnZona(instante: number | string | Date, zona: string): string {
  const d = new Date(instante);

  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zona,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** El día anterior a un `YYYY-MM-DD` (aritmética de calendario, sin husos). */
function diaAnterior(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);

  d.setUTCDate(d.getUTCDate() - 1);

  return d.toISOString().slice(0, 10);
}

export function esDeAtencion(eventType: string): boolean {
  return eventType === "panic.alert" || prioridadDe(eventType) === "emergency";
}

export function organizarBandeja<T extends AvisoOrdenable>(
  avisos: T[],
  opciones: { ahora: number; zona: string },
): BandejaOrganizada<T> {
  const recientes = [...avisos].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  const atencion = recientes.filter((a) => esDeAtencion(a.eventType));
  const resto = recientes.filter((a) => !esDeAtencion(a.eventType));

  const hoy = diaEnZona(opciones.ahora, opciones.zona);
  const ayer = diaAnterior(hoy);

  // Día → familia → avisos. `Map` conserva el orden de inserción, y como se
  // recorre de lo más reciente a lo más antiguo, días y pilas salen ya en orden.
  const porDia = new Map<string, Map<FamiliaDeAviso, T[]>>();

  for (const a of resto) {
    const dia = diaEnZona(a.createdAt, opciones.zona);
    const familia = familiaDe(a.eventType);

    if (!porDia.has(dia)) porDia.set(dia, new Map());
    const pilas = porDia.get(dia)!;

    if (!pilas.has(familia)) pilas.set(familia, []);
    pilas.get(familia)!.push(a);
  }

  const secciones: Seccion<T>[] = [...porDia.entries()].map(([dia, pilas]) => ({
    dia,
    tipo: dia === hoy ? "hoy" : dia === ayer ? "ayer" : "antes",
    pilas: [...pilas.entries()].map(([familia, lista]) => ({
      clave: `${dia}|${familia}`,
      familia,
      avisos: lista,
    })),
  }));

  return { atencion, secciones };
}

/**
 * ¿Merece la pena decir «pasó a las…»? Sólo si lo detectado llegó bastante
 * después de lo ocurrido (una falta a la media hora, un puesto que lleva rato
 * vacío). Por debajo de 5 min sería ruido en cada fila.
 */
export function pasoAntesDeLlegar(a: AvisoOrdenable, margenMin = 5): boolean {
  if (!a.occurredAt) return false;

  return ms(a.createdAt) - ms(a.occurredAt) >= margenMin * 60_000;
}
