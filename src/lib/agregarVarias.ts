/**
 * ════════════════════════════════════════════════════════════════════════════
 * «AGREGAR VARIAS PERSONAS» — the pure part of adding a whole list at once
 * (Mike 2026-10-31: «agregar varias personas a la vez», with their schedule).
 *
 * A list pasted from Excel / Google Sheets (or a .csv / .xlsx) becomes one row
 * per person. Each row is checked here, without React and without the network:
 * the columns are found by their header (accents, case and synonyms don't
 * matter), the role and the puesto are matched against the company's own
 * catalogues, and two rows asking for the same vacant seat don't both get it.
 *
 * Creating them reuses the «Agregar persona» request bodies
 * (`@/lib/agregarPersona`) through the same create step, one person at a time.
 * ════════════════════════════════════════════════════════════════════════════
 */
import {
  celularValido,
  correoValido,
  datosVacios,
  tipoDeParam,
  type Datos,
  type TipoDePersona,
} from "@/lib/agregarPersona";

// ── Text helpers ────────────────────────────────────────────────────────────

/** Lower case, no accents, single spaces: «  Estación   NORTE » → «estacion norte». */
export function normalizar(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.+\-_ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── 1 · Text → rows ─────────────────────────────────────────────────────────

/**
 * Splits a pasted block or a CSV file into rows of cells. Excel and Google
 * Sheets paste with tabs; a CSV may use «;» (Spanish Excel) or «,». Quoted
 * cells keep their separators and line breaks; empty lines are dropped.
 */
export function partirTabla(texto: string): string[][] {
  const limpio = String(texto ?? "")
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n");
  const primera = limpio.split("\n").find((l) => l.trim()) || "";
  const sep = primera.includes("\t")
    ? "\t"
    : (primera.match(/;/g) || []).length >=
          (primera.match(/,/g) || []).length && primera.includes(";")
      ? ";"
      : ",";

  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];

    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') comillas = false;
      else celda += c;
      continue;
    }
    if (c === '"' && celda.trim() === "") {
      comillas = true;
      celda = "";
    } else if (c === sep) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  fila.push(celda);
  filas.push(fila);

  return filas
    .map((f) => f.map((x) => x.trim()))
    .filter((f) => f.some((x) => x !== ""));
}

// ── 2 · Columns ─────────────────────────────────────────────────────────────

export type Columna =
  | "tipo"
  | "nombres"
  | "apellidos"
  | "documento"
  | "celular"
  | "correo"
  | "rol"
  | "puesto"
  | "empieza";

/** The template's order; also the order assumed when there is no header row. */
export const COLUMNAS: readonly Columna[] = [
  "tipo",
  "nombres",
  "apellidos",
  "documento",
  "celular",
  "correo",
  "rol",
  "puesto",
  "empieza",
];

/** Header words per column (already normalised). */
const SINONIMOS: Record<Columna, string[]> = {
  tipo: ["tipo", "que hace", "cargo", "type", "kind"],
  nombres: [
    "nombres",
    "nombre",
    "primer nombre",
    "first name",
    "firstname",
    "name",
  ],
  apellidos: ["apellidos", "apellido", "last name", "lastname", "surname"],
  documento: [
    "documento",
    "cedula",
    "ci",
    "dni",
    "dui",
    "curp",
    "rut",
    "pasaporte",
    "identificacion",
    "numero de identificacion",
    "id",
    "document",
  ],
  celular: [
    "celular",
    "telefono",
    "movil",
    "whatsapp",
    "phone",
    "mobile",
    "cel",
  ],
  correo: ["correo", "correo electronico", "email", "e mail", "e-mail", "mail"],
  rol: ["rol", "role", "perfil"],
  puesto: [
    "puesto",
    "estacion",
    "plaza",
    "puesto de supervision",
    "post",
    "station",
    "seat",
  ],
  empieza: [
    "empieza",
    "inicio",
    "desde",
    "fecha",
    "fecha de inicio",
    "start",
    "start date",
  ],
};

const columnaDe = (titulo: string): Columna | null => {
  const n = normalizar(titulo);

  if (!n) return null;
  for (const col of COLUMNAS) if (SINONIMOS[col].includes(n)) return col;

  return null;
};

export interface Encabezado {
  /** Column → index in the row. */
  indices: Partial<Record<Columna, number>>;
  /** The first row was a header (and is not a person). */
  conEncabezado: boolean;
}

/**
 * Finds which column is which. A first row with at least two known titles is a
 * header; otherwise the template's order is assumed.
 */
export function leerEncabezado(filas: string[][]): Encabezado {
  const primera = filas[0] || [];
  const indices: Partial<Record<Columna, number>> = {};

  primera.forEach((t, i) => {
    const c = columnaDe(t);

    if (c && indices[c] === undefined) indices[c] = i;
  });
  if (Object.keys(indices).length >= 2) return { indices, conEncabezado: true };

  const porOrden: Partial<Record<Columna, number>> = {};

  COLUMNAS.forEach((c, i) => (porOrden[c] = i));

  return { indices: porOrden, conEncabezado: false };
}

// ── 3 · Cells → people ──────────────────────────────────────────────────────

/** «Vigilante», «guardia», «supervisora», «administrativo»… → the three kinds. */
export function tipoDeCelda(s: string): TipoDePersona | null {
  const directo = tipoDeParam(s);

  if (directo) return directo;
  const n = normalizar(s);

  if (!n) return null;
  if (/^(vigilant|guardia|guarda|agente|seguridad|guard)/.test(n))
    return "vigilante";
  if (/^(supervis)/.test(n)) return "supervisor";
  if (
    /^(oficina|administrativ|admin|secretari|recepcion|despach|contab|rrhh|recursos)/.test(
      n,
    )
  )
    return "oficina";

  return null;
}

/**
 * A date cell as YYYY-MM-DD: «2026-11-02», «02/11/2026», «2/11/26» (day
 * first, as written in Latin America and Spain) or an Excel serial number.
 * `null` = empty; `"invalida"` = something that is not a date.
 */
export function fechaDeCelda(s: string): string | null | "invalida" {
  const v = String(s ?? "").trim();

  if (!v) return null;
  const iso = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const dmy = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  let y: number, m: number, d: number;

  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) {
    [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
    if (y < 100) y += 2000;
  } else if (/^\d{5}(\.\d+)?$/.test(v)) {
    // Excel serial (days since 1899-12-30).
    const ms = Math.round((Number(v) - 25569) * 86400000);
    const f = new Date(ms);

    [y, m, d] = [f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()];
  } else return "invalida";

  const f = new Date(Date.UTC(y, m - 1, d));

  if (
    f.getUTCFullYear() !== y ||
    f.getUTCMonth() !== m - 1 ||
    f.getUTCDate() !== d
  )
    return "invalida";

  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export interface FilaLeida {
  /** Line in the paste (1-based, counting the header) — what the person sees in Excel. */
  linea: number;
  tipoTexto: string;
  tipo: TipoDePersona | null;
  datos: Datos;
  rolTexto: string;
  puestoTexto: string;
  empiezaTexto: string;
}

export function leerFilas(filas: string[][]): FilaLeida[] {
  const { indices, conEncabezado } = leerEncabezado(filas);
  const celda = (f: string[], c: Columna) =>
    indices[c] === undefined ? "" : String(f[indices[c]!] ?? "").trim();

  return filas.slice(conEncabezado ? 1 : 0).map((f, i) => {
    const correo = celda(f, "correo");
    const tipo = tipoDeCelda(celda(f, "tipo"));

    return {
      linea: i + (conEncabezado ? 2 : 1),
      tipoTexto: celda(f, "tipo"),
      tipo,
      datos: {
        ...datosVacios(),
        nombres: celda(f, "nombres"),
        apellidos: celda(f, "apellidos"),
        documento: celda(f, "documento"),
        celular: celda(f, "celular"),
        correo,
        // Guards and supervisors without e-mail enter with a username.
        sinCorreo: !correo && tipo !== "oficina",
      },
      rolTexto: celda(f, "rol"),
      puestoTexto: celda(f, "puesto"),
      empiezaTexto: celda(f, "empieza"),
    };
  });
}

// ── 4 · Catalogues ──────────────────────────────────────────────────────────

/** A guard seat as «Agregar persona» lists it. */
export interface PlazaDeLista {
  stationId: string;
  positionId: string;
  /** Station name. */
  puesto: string;
  /** Seat name («Fijo 1»). */
  plaza: string;
  libres: number;
  sinRotacion: boolean;
  detalle?: string;
}

/** A supervisor post as «Agregar persona» lists it. */
export interface PuestoDeLista {
  id: string;
  titulo: string;
  libre: boolean;
  sinRotacion: boolean;
  detalle?: string;
}

export interface RolDeLista {
  id: string;
  /** Every name the role is known by (display name, slug, raw name). */
  nombres: string[];
}

/** «Charlie 3 · Fijo 1», «Charlie 3 Fijo 1», «charlie 3» (any free seat of it). */
export function buscarPlaza(
  texto: string,
  plazas: PlazaDeLista[],
): {
  plaza: PlazaDeLista | null;
  motivo: "vacio" | "noEncontrado" | "ambiguo" | null;
} {
  const n = normalizar(texto);

  if (!n) return { plaza: null, motivo: "vacio" };
  const completo = (p: PlazaDeLista) => normalizar(`${p.puesto} ${p.plaza}`);
  const exactas = plazas.filter((p) => completo(p) === n);

  if (exactas.length) return { plaza: exactas[0], motivo: null };

  const deLaEstacion = plazas.filter((p) => normalizar(p.puesto) === n);

  if (deLaEstacion.length) {
    // Just the station: its first vacant seat (the list is vacant-first).
    const libre = deLaEstacion.find((p) => p.libres > 0);

    return { plaza: libre || deLaEstacion[0], motivo: null };
  }
  const parciales = plazas.filter((p) => completo(p).includes(n));

  if (parciales.length === 1) return { plaza: parciales[0], motivo: null };
  const estaciones = new Set(parciales.map((p) => p.stationId));

  if (estaciones.size === 1) {
    const libre = parciales.find((p) => p.libres > 0);

    return { plaza: libre || parciales[0], motivo: null };
  }

  return { plaza: null, motivo: parciales.length ? "ambiguo" : "noEncontrado" };
}

export function buscarPuestoSup(
  texto: string,
  puestos: PuestoDeLista[],
): {
  puesto: PuestoDeLista | null;
  motivo: "vacio" | "noEncontrado" | "ambiguo" | null;
} {
  const n = normalizar(texto);

  if (!n) return { puesto: null, motivo: "vacio" };
  const exactos = puestos.filter(
    (p) =>
      normalizar(p.titulo) === n || normalizar(p.titulo.split(" · ")[0]) === n,
  );

  if (exactos.length === 1) return { puesto: exactos[0], motivo: null };
  if (exactos.length > 1) return { puesto: null, motivo: "ambiguo" };
  const parciales = puestos.filter((p) => normalizar(p.titulo).includes(n));

  if (parciales.length === 1) return { puesto: parciales[0], motivo: null };

  return {
    puesto: null,
    motivo: parciales.length ? "ambiguo" : "noEncontrado",
  };
}

export function buscarRol(
  texto: string,
  roles: RolDeLista[],
): RolDeLista | null {
  const n = normalizar(texto);

  if (!n) return null;
  const exacto = roles.find((r) => r.nombres.some((x) => normalizar(x) === n));

  if (exacto) return exacto;
  const parciales = roles.filter((r) =>
    r.nombres.some((x) => normalizar(x).startsWith(n)),
  );

  return parciales.length === 1 ? parciales[0] : null;
}

// ── 5 · A row ready to create ───────────────────────────────────────────────

/** Where the person will work: a seat, a post, the shared office week, or nothing yet. */
export type Destino =
  | { tipo: "plaza"; stationId: string; positionId: string }
  | { tipo: "puesto"; positionId: string }
  | { tipo: "jornada" }
  | null;

export interface FilaDeLote {
  /** Stable key for React and for edits. */
  id: string;
  linea: number;
  tipo: TipoDePersona | null;
  tipoTexto: string;
  datos: Datos;
  rolTexto: string;
  puestoTexto: string;
  /** YYYY-MM-DD, "" = today. */
  empieza: string;
  empiezaInvalida: boolean;
  destino: Destino;
  /** Why the puesto in the paste could not be used (shown until fixed by hand). */
  destinoMotivo: "noEncontrado" | "ambiguo" | null;
}

export interface Catalogos {
  plazas: PlazaDeLista[];
  puestos: PuestoDeLista[];
  roles: RolDeLista[];
}

/** First reading of the paste: matches role and puesto once. Edits come later. */
export function prepararFilas(
  leidas: FilaLeida[],
  cat: Catalogos,
): FilaDeLote[] {
  return leidas.map((l, i) => {
    const fecha = fechaDeCelda(l.empiezaTexto);
    const datos = { ...l.datos };
    let destino: Destino = null;
    let destinoMotivo: FilaDeLote["destinoMotivo"] = null;

    if (l.tipo === "oficina") {
      const rol = buscarRol(l.rolTexto, cat.roles);

      datos.rol = rol ? rol.id : "";
      destino = { tipo: "jornada" };
    } else if (l.tipo === "vigilante") {
      const b = buscarPlaza(l.puestoTexto, cat.plazas);

      if (b.plaza)
        destino = {
          tipo: "plaza",
          stationId: b.plaza.stationId,
          positionId: b.plaza.positionId,
        };
      else if (b.motivo !== "vacio") destinoMotivo = b.motivo;
    } else if (l.tipo === "supervisor") {
      const b = buscarPuestoSup(l.puestoTexto, cat.puestos);

      if (b.puesto) destino = { tipo: "puesto", positionId: b.puesto.id };
      else if (b.motivo !== "vacio") destinoMotivo = b.motivo;
    }

    return {
      id: `f${i}-${l.linea}`,
      linea: l.linea,
      tipo: l.tipo,
      tipoTexto: l.tipoTexto,
      datos,
      rolTexto: l.rolTexto,
      puestoTexto: l.puestoTexto,
      empieza: fecha && fecha !== "invalida" ? fecha : "",
      empiezaInvalida: fecha === "invalida",
      destino,
      destinoMotivo,
    };
  });
}

// ── 6 · Checks ──────────────────────────────────────────────────────────────

export type Problema =
  | "tipo"
  | "nombres"
  | "apellidos"
  | "correoRequerido"
  | "correoInvalido"
  | "celularInvalido"
  | "rolRequerido"
  | "rolDesconocido"
  | "puestoNoEncontrado"
  | "puestoAmbiguo"
  | "plazaOcupada"
  | "puestoSinRotacion"
  | "fechaInvalida"
  | "fechaPasada"
  | "documentoRepetido"
  | "correoRepetido"
  | "documentoExiste"
  | "correoExiste";

/** What the company already has (looked up after the paste). */
export interface Existentes {
  documentos: Set<string>;
  correos: Set<string>;
}

export const claveDeDocumento = (s: string) =>
  normalizar(s).replace(/[\s.\-]/g, "");
export const claveDeCorreo = (s: string) =>
  String(s ?? "")
    .trim()
    .toLowerCase();

/**
 * Problems of every row, all at once: the duplicate checks and «two rows for
 * one vacant seat» need the whole list. A row with no problems is ready.
 */
export function revisarFilas(
  filas: FilaDeLote[],
  cat: Catalogos,
  existentes: Existentes = { documentos: new Set(), correos: new Set() },
  /** The company's today (YYYY-MM-DD): a start before it is refused. */
  hoy?: string,
): Map<string, Problema[]> {
  const out = new Map<string, Problema[]>();
  const docs = new Map<string, number>();
  const correos = new Map<string, number>();

  for (const f of filas) {
    const d = claveDeDocumento(f.datos.documento);
    const c = claveDeCorreo(f.datos.correo);

    if (d) docs.set(d, (docs.get(d) || 0) + 1);
    if (c) correos.set(c, (correos.get(c) || 0) + 1);
  }
  // Seats are handed out in list order: a later row for a full seat is refused.
  const usados = new Map<string, number>();
  const plazaPorId = new Map(cat.plazas.map((p) => [p.positionId, p]));
  const puestoPorId = new Map(cat.puestos.map((p) => [p.id, p]));

  for (const f of filas) {
    const p: Problema[] = [];
    const d = f.datos;

    if (!f.tipo) p.push("tipo");
    if (!d.nombres.trim()) p.push("nombres");
    if (!d.apellidos.trim()) p.push("apellidos");
    if (d.correo.trim()) {
      if (!correoValido(d.correo)) p.push("correoInvalido");
    } else if (f.tipo === "oficina") p.push("correoRequerido");
    if (d.celular.trim() && !celularValido(d.celular))
      p.push("celularInvalido");
    if (f.tipo === "oficina" && !d.rol)
      p.push(f.rolTexto.trim() ? "rolDesconocido" : "rolRequerido");
    if (f.empiezaInvalida) p.push("fechaInvalida");
    else if (f.empieza && hoy && f.empieza < hoy)
      p.push("fechaPasada");

    const dk = claveDeDocumento(d.documento);
    const ck = claveDeCorreo(d.correo);

    if (dk && (docs.get(dk) || 0) > 1) p.push("documentoRepetido");
    if (ck && (correos.get(ck) || 0) > 1) p.push("correoRepetido");
    if (dk && existentes.documentos.has(dk)) p.push("documentoExiste");
    if (ck && existentes.correos.has(ck)) p.push("correoExiste");

    if (!f.destino && f.destinoMotivo)
      p.push(
        f.destinoMotivo === "ambiguo" ? "puestoAmbiguo" : "puestoNoEncontrado",
      );
    if (f.destino?.tipo === "plaza" && f.tipo === "vigilante") {
      const plaza = plazaPorId.get(f.destino.positionId);
      const ya = usados.get(f.destino.positionId) || 0;

      if (!plaza || plaza.libres - ya <= 0) p.push("plazaOcupada");
      else {
        usados.set(f.destino.positionId, ya + 1);
        // A seat with no rotation would give no shifts in a batch (the wizard asks how they work).
        if (plaza.sinRotacion) p.push("puestoSinRotacion");
      }
    }
    if (f.destino?.tipo === "puesto" && f.tipo === "supervisor") {
      const puesto = puestoPorId.get(f.destino.positionId);

      if (!puesto) p.push("puestoNoEncontrado");
      else if (puesto.sinRotacion) p.push("puestoSinRotacion");
    }
    out.set(f.id, p);
  }

  return out;
}

// ── 7 · The template ────────────────────────────────────────────────────────

/** Spanish headers + two example rows, for «Descargar plantilla». */
export function plantillaCsv(): string {
  const filas = [
    [
      "Tipo",
      "Nombres",
      "Apellidos",
      "Documento",
      "Celular",
      "Correo",
      "Rol",
      "Puesto",
      "Empieza",
    ],
    [
      "Vigilante",
      "Luis",
      "Ortega",
      "0912345678",
      "+593 99 555 0101",
      "",
      "",
      "Estación Norte · Fijo 1",
      "02/11/2026",
    ],
    [
      "Oficina",
      "Sofía",
      "Paredes",
      "",
      "",
      "sofia@empresa.com",
      "Asistente Administrativo",
      "",
      "",
    ],
  ];
  const celda = (s: string) =>
    /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

  // «;» because Excel in Spanish opens it in columns that way; BOM for the accents.
  return "﻿" + filas.map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}
