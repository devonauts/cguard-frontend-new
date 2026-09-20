/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA HORA ES LA DE LA EMPRESA
 *
 * Un CRM de seguridad se mide en turnos, y un turno pertenece al día de la
 * EMPRESA, no al del navegador que lo está mirando ni al de Greenwich. El dueño
 * elige su zona en Ajustes › Perfil de la empresa y esa elección tiene que
 * mandar en todo: a qué hora salió la ronda, en qué día cae el turno de noche,
 * qué entra en el informe de «hoy», qué significa «hoy» en el Horario.
 *
 * Tres cosas distintas que se confundían por todo el código:
 *
 *   1. UN INSTANTE (`2026-09-20T02:09:00Z`). Existe una sola vez en el mundo;
 *      lo que cambia es cómo se escribe. Se PINTA con `fechaYHora`, que aplica
 *      la zona de la empresa. Sin ella, una ronda de las 21:09 en México se leía
 *      como las 03:09 desde un portátil en otra zona.
 *
 *   2. UN DÍA CIVIL (`2026-09-21`: fecha de nacimiento, fin de contrato). NO es
 *      un instante y no se mueve nunca. `new Date("2026-09-21")` lo interpreta
 *      como medianoche UTC, así que pintarlo en cualquier zona al oeste de
 *      Greenwich lo retrasa un día: el vigilante nacía el 20. Se pinta con
 *      `soloFechaCivil`, que no toca la zona.
 *
 *   3. «HOY». `new Date().toISOString().slice(0,10)` es el día de GREENWICH.
 *      A las 19:00 de México ya es el día siguiente en UTC, así que los
 *      informes y los formularios se adelantaban un día cada tarde. «Hoy» es
 *      `hoyEnLaEmpresa()`.
 *
 * Con la zona sin configurar se usa la del dispositivo, que es lo que esperaría
 * quien está mirando. Ver [[reportFormat]], que fue donde se descubrió el
 * problema del rango de días, y `ventanaDeEdicion`, que ya medía así.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { localeActual } from "@/lib/localeActual";
import { getTenantTimezone } from "@/utils/tenantLocation";

/** La zona de la empresa; si no está configurada, la del dispositivo. */
export function zonaDeLaEmpresa(): string {
  return (
    getTenantTimezone() ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC"
  );
}

/** Convierte lo que llegue (ISO, Date, epoch) en Date, o null si no vale. */
function aFecha(valor: string | number | Date | null | undefined): Date | null {
  if (valor == null || valor === "") return null;
  const d = valor instanceof Date ? valor : new Date(valor);

  return Number.isNaN(d.getTime()) ? null : d;
}

// ── 1. INSTANTES ────────────────────────────────────────────────────────────

/** `YYYY-MM-DD` del día en que cae un instante, EN LA ZONA DE LA EMPRESA. */
export function diaDeLaEmpresa(
  valor: string | number | Date,
  zona = zonaDeLaEmpresa(),
): string {
  const d = aFecha(valor);

  if (!d) return "";

  // `en-CA` da exactamente `YYYY-MM-DD`; es el truco estándar para no tener que
  // recomponer la fecha a mano a partir de las partes.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** El día de hoy, `YYYY-MM-DD`, en la zona de la empresa. */
export function hoyEnLaEmpresa(zona = zonaDeLaEmpresa()): string {
  return diaDeLaEmpresa(new Date(), zona);
}

/** `HH:MM` de un instante en la zona de la empresa (24 h, para comparar). */
export function horaDeLaEmpresa(
  valor: string | number | Date,
  zona = zonaDeLaEmpresa(),
): string {
  const d = aFecha(valor);

  if (!d) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zona,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Fecha y hora de un instante, para leer. El formato por defecto del CRM. */
export function fechaYHora(
  valor: string | number | Date | null | undefined,
  opciones: Intl.DateTimeFormatOptions = {},
  vacio = "—",
): string {
  const d = aFecha(valor);

  if (!d) return vacio;

  return d.toLocaleString(localeActual(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zonaDeLaEmpresa(),
    ...opciones,
  });
}

/** Sólo la fecha de un INSTANTE, en el día que le toca a la empresa. */
export function soloFecha(
  valor: string | number | Date | null | undefined,
  opciones: Intl.DateTimeFormatOptions = {},
  vacio = "—",
): string {
  const d = aFecha(valor);

  if (!d) return vacio;

  return d.toLocaleDateString(localeActual(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: zonaDeLaEmpresa(),
    ...opciones,
  });
}

/** Sólo la hora de un instante, en la zona de la empresa. */
export function soloHora(
  valor: string | number | Date | null | undefined,
  opciones: Intl.DateTimeFormatOptions = {},
  vacio = "—",
): string {
  const d = aFecha(valor);

  if (!d) return vacio;

  return d.toLocaleTimeString(localeActual(), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zonaDeLaEmpresa(),
    ...opciones,
  });
}

// ── 2. DÍAS CIVILES ─────────────────────────────────────────────────────────

/**
 * Una fecha que NO es un instante: nacimiento, fin de contrato, vencimiento de
 * una licencia. Llega como `YYYY-MM-DD` (a veces con una hora pegada que hay
 * que ignorar) y se pinta tal cual, sin mover el día.
 */
export function soloFechaCivil(
  valor: string | Date | null | undefined,
  opciones: Intl.DateTimeFormatOptions = {},
  vacio = "—",
): string {
  if (valor == null || valor === "") return vacio;

  const dia =
    valor instanceof Date
      ? diaDeLaEmpresa(valor)
      : String(valor).slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return vacio;

  const [a, m, d] = dia.split("-").map(Number);

  // Se construye en UTC y se pinta en UTC: así el día impreso es el día escrito,
  // pase lo que pase con la zona de quien mira.
  return new Date(Date.UTC(a, m - 1, d)).toLocaleDateString(localeActual(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
    ...opciones,
  });
}

/**
 * El día civil que representa un `Date` de un selector de calendario.
 *
 * Los calendarios (`<Calendar>`, `react-day-picker`) no devuelven un instante:
 * devuelven «el 21 de septiembre» construido como medianoche LOCAL. Pasarlo por
 * `toISOString().slice(0,10)` lo convierte a UTC y al este de Greenwich retrocede
 * un día —en Madrid, medianoche local son las 22:00Z del día anterior—, así que
 * la nota se guardaba con la fecha de ayer. Se leen las partes locales, que son
 * las que el usuario eligió.
 */
export function diaCivilDe(fecha: Date | null | undefined): string {
  if (!fecha || Number.isNaN(fecha.getTime())) return "";

  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");

  return `${fecha.getFullYear()}-${mm}-${dd}`;
}

/** Suma días a un `YYYY-MM-DD` sin salir del calendario. */
export function sumaDias(dia: string, n: number): string {
  const [a, m, d] = String(dia).slice(0, 10).split("-").map(Number);

  if (!a) return "";
  const t = new Date(Date.UTC(a, (m || 1) - 1, d || 1));

  t.setUTCDate(t.getUTCDate() + n);

  return t.toISOString().slice(0, 10);
}

// ── 3. DE UNA HORA DE PARED A UN INSTANTE ───────────────────────────────────

/** Desfase de una zona IANA respecto a UTC, en minutos, para un instante dado. */
function desfaseZona(fecha: Date, zona: string): number {
  const enZona = new Date(fecha.toLocaleString("en-US", { timeZone: zona }));
  const enUtc = new Date(fecha.toLocaleString("en-US", { timeZone: "UTC" }));

  return (enZona.getTime() - enUtc.getTime()) / 60000;
}

/**
 * El instante que corresponde a una hora de pared (`YYYY-MM-DD` + h:m:s) EN LA
 * ZONA DE LA EMPRESA. Es lo que hay que usar cuando el usuario escribe «el 21 a
 * las 18:00» y eso tiene que significar las 18:00 del puesto, no las del
 * portátil de quien lo escribe.
 *
 * El desfase se calcula sobre el instante tentativo y no sobre hoy, para que el
 * horario de verano se aplique con la regla del día consultado.
 */
export function instanteEnLaEmpresa(
  dia: string,
  h = 0,
  m = 0,
  s = 0,
  ms = 0,
  zona = zonaDeLaEmpresa(),
): Date {
  const [a, mes, d] = String(dia).slice(0, 10).split("-").map(Number);
  const tentativo = new Date(Date.UTC(a, (mes || 1) - 1, d || 1, h, m, s, ms));
  const off = desfaseZona(tentativo, zona);

  return new Date(tentativo.getTime() - off * 60000);
}

/** Las dos cotas ISO de un día completo de la empresa. */
export function limitesDelDia(
  desde: string,
  hasta: string = desde,
  zona = zonaDeLaEmpresa(),
): { start: string; end: string } {
  return {
    start: instanteEnLaEmpresa(desde, 0, 0, 0, 0, zona).toISOString(),
    end: instanteEnLaEmpresa(hasta, 23, 59, 59, 999, zona).toISOString(),
  };
}

// ── 4. CAMPOS DE FORMULARIO ─────────────────────────────────────────────────

/**
 * Lo que hay que meter en un `<input type="datetime-local">` para que enseñe un
 * instante en la hora de la empresa. El input no entiende zonas: sólo acepta
 * `YYYY-MM-DDTHH:MM` y lo muestra tal cual.
 */
export function paraInputFechaHora(
  valor: string | number | Date | null | undefined,
  zona = zonaDeLaEmpresa(),
): string {
  const d = aFecha(valor);

  if (!d) return "";

  return `${diaDeLaEmpresa(d, zona)}T${horaDeLaEmpresa(d, zona)}`;
}

/**
 * El camino de vuelta: lo que escribió el usuario en un `datetime-local` es
 * hora de pared DE LA EMPRESA, y esto lo convierte en el instante que se manda
 * al servidor. Sin esto, `new Date(valor)` lo interpretaba en la zona del
 * dispositivo y el turno se guardaba corrido.
 */
export function desdeInputFechaHora(
  valor: string | null | undefined,
  zona = zonaDeLaEmpresa(),
): string {
  const v = String(valor || "");
  const [dia, hora = "00:00"] = v.split("T");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return "";
  const [h, m] = hora.split(":").map(Number);

  return instanteEnLaEmpresa(dia, h || 0, m || 0, 0, 0, zona).toISOString();
}
