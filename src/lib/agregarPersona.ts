/**
 * ════════════════════════════════════════════════════════════════════════════
 * «AGREGAR PERSONA» — the pure part of the one flow that adds a guard, a
 * supervisor or an office person WITH their schedule (Mike 2026-10-31).
 *
 * Before, each kind had its own form and its schedule lived somewhere else
 * (the station's rotation, a supervisor post, the office hours in Horario).
 * The wizard asks four questions in the same order for everyone:
 *
 *   1 ¿Qué hace?   2 ¿Quién es?   3 ¿Dónde y cuándo trabaja?   4 Revisa y crea
 *
 * Everything here is free of React and of the network so it can be tested:
 * validation per step, the rotation said in words, and the request bodies,
 * which are the SAME ones the existing forms send (guard invite, supervisor
 * create, office user create, guard assignment, supervisor post assignment,
 * office week, office location).
 * ════════════════════════════════════════════════════════════════════════════
 */
import {
  cuerpoDeJornada,
  finDeAlmuerzo,
  validarJornada,
  type Jornada,
} from "@/lib/jornadaSemanal";
import {
  nombreDeDias,
  nombreDeSecuencia,
  nombreSemanal,
  secuenciaLimpia,
  type Traductor,
} from "@/lib/secuenciaDeRotacion";

export type TipoDePersona = "vigilante" | "supervisor" | "oficina";
export const TIPOS: readonly TipoDePersona[] = [
  "vigilante",
  "supervisor",
  "oficina",
];

/** `?tipo=` of the URL; also takes the English names the lists may send. */
export function tipoDeParam(v: unknown): TipoDePersona | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();

  if (s === "vigilante" || s === "guard") return "vigilante";
  if (s === "supervisor") return "supervisor";
  if (s === "oficina" || s === "office") return "oficina";

  return null;
}

export type Paso = 1 | 2 | 3 | 4;

// ── Step 2 · ¿Quién es? ─────────────────────────────────────────────────────

export interface Datos {
  nombres: string;
  apellidos: string;
  documento: string;
  celular: string;
  correo: string;
  /** No e-mail: enters the app with a username and a link shared by hand. */
  sinCorreo: boolean;
  /** Optional username for a person without e-mail (the server proposes one). */
  usuario: string;
  /** Office only: role id as the role list returns it. */
  rol: string;
  /** Office only: sees the whole operation, or only some sites. */
  alcance: "todo" | "sedes";
  sedes: string[];
}

export const datosVacios = (): Datos => ({
  nombres: "",
  apellidos: "",
  documento: "",
  celular: "",
  correo: "",
  sinCorreo: false,
  usuario: "",
  rol: "",
  alcance: "todo",
  sedes: [],
});

export type ErrorDeCampo =
  "requerido" | "correoInvalido" | "celularInvalido" | "sedesVacias";
export type ErroresDeDatos = Partial<Record<keyof Datos, ErrorDeCampo>>;

export const correoValido = (s: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
/** A phone has at least 7 digits once spaces, dashes and the + are removed. */
export const celularValido = (s: string) => s.replace(/\D/g, "").length >= 7;

/** Who can be added without e-mail: guards and supervisors (they use the apps). */
export const admiteSinCorreo = (tipo: TipoDePersona) => tipo !== "oficina";
/** Who carries an ID number on their record. */
export const llevaDocumento = (tipo: TipoDePersona) => tipo !== "oficina";

export function validarDatos(tipo: TipoDePersona, d: Datos): ErroresDeDatos {
  const e: ErroresDeDatos = {};

  if (!d.nombres.trim()) e.nombres = "requerido";
  if (!d.apellidos.trim()) e.apellidos = "requerido";
  const sinCorreo = admiteSinCorreo(tipo) && d.sinCorreo;

  if (!sinCorreo) {
    if (!d.correo.trim()) e.correo = "requerido";
    else if (!correoValido(d.correo)) e.correo = "correoInvalido";
  }
  if (d.celular.trim() && !celularValido(d.celular))
    e.celular = "celularInvalido";
  if (tipo === "oficina") {
    if (!d.rol) e.rol = "requerido";
    if (d.alcance === "sedes" && !d.sedes.length) e.sedes = "sedesVacias";
  }

  return e;
}

// ── Step 3 · ¿Dónde y cuándo trabaja? ──────────────────────────────────────

export interface OficinaFisica {
  direccion: string;
  lat: string;
  lng: string;
  radio: string;
}

export type Lugar =
  | { tipo: "vigilante"; stationId: string; positionId: string; desde: string }
  | { tipo: "supervisor"; positionId: string; desde: string }
  | {
      tipo: "oficina";
      jornada: Jornada;
      desde: string;
      oficina: OficinaFisica | null;
    };

/** `null` = «Lo hago después». */
export type Horario = Lugar | null;

export type ErrorDeLugar =
  | "eligePlaza"
  | "eligePuesto"
  | "fechaInvalida"
  | "jornadaInvalida"
  | "ubicacionInvalida"
  | null;

const fechaValida = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function ubicacionValida(o: OficinaFisica | null): boolean {
  if (!o) return true;
  const vacia = !o.lat.trim() && !o.lng.trim();

  if (vacia) return true; // only an address: fine, the clock just won't check the place
  const lat = Number(o.lat);
  const lng = Number(o.lng);
  const radio = o.radio.trim() ? Number(o.radio) : 150;

  return (
    Number.isFinite(lat) &&
    Math.abs(lat) <= 90 &&
    Number.isFinite(lng) &&
    Math.abs(lng) <= 180 &&
    Number.isFinite(radio) &&
    radio >= 10 &&
    radio <= 5000
  );
}

export function validarLugar(h: Horario): ErrorDeLugar {
  if (!h) return null;
  if (h.desde && !fechaValida(h.desde)) return "fechaInvalida";
  if (h.tipo === "vigilante")
    return h.stationId && h.positionId ? null : "eligePlaza";
  if (h.tipo === "supervisor") return h.positionId ? null : "eligePuesto";
  if (!validarJornada(h.jornada, h.desde || null).ok) return "jornadaInvalida";
  if (!ubicacionValida(h.oficina)) return "ubicacionInvalida";

  return null;
}

/** Can the person move from `paso` to the next one? */
export function puedeSeguir(
  paso: Paso,
  tipo: TipoDePersona | null,
  d: Datos,
  h: Horario,
): boolean {
  if (paso === 1) return !!tipo;
  if (!tipo) return false;
  if (paso === 2) return Object.keys(validarDatos(tipo, d)).length === 0;
  if (paso === 3) return validarLugar(h) === null;

  return true;
}

// ── The rotation in words ───────────────────────────────────────────────────

export interface RotacionLeida {
  dayShifts?: number | null;
  nightShifts?: number | null;
  restDays?: number | null;
  sequence?: string | null;
  weekly?: boolean | null;
}

/**
 * «2 días, 2 noches, 2 libres», «Lunes a viernes», «Secuencia 1-2-2-2»,
 * or «Sin rotación definida». Never the stored style name: that is whatever
 * someone typed once («Turno A», «4x4 nuevo»).
 */
export function rotacionEnPalabras(
  rot: RotacionLeida | null | undefined,
  t: Traductor,
): string {
  if (!rot)
    return t("agregarPersona.rotacion.sinRotacion", {
      defaultValue: "Sin rotación definida",
    });
  if (rot.weekly && rot.sequence) return nombreSemanal(rot.sequence, t);
  const seq = rot.sequence ? secuenciaLimpia(rot.sequence) : null;

  if (seq) {
    return t("agregarPersona.rotacion.secuencia", {
      defaultValue: "Secuencia {{nombre}}",
      nombre: nombreDeSecuencia(seq),
    });
  }
  const partes: string[] = [];
  const d = Math.max(0, Number(rot.dayShifts) || 0);
  const n = Math.max(0, Number(rot.nightShifts) || 0);
  const l = Math.max(0, Number(rot.restDays) || 0);

  if (d)
    partes.push(
      t("agregarPersona.rotacion.dias", {
        count: d,
        defaultValue: "{{count}} días",
      }),
    );
  if (n)
    partes.push(
      t("agregarPersona.rotacion.noches", {
        count: n,
        defaultValue: "{{count}} noches",
      }),
    );
  if (l)
    partes.push(
      t("agregarPersona.rotacion.libres", {
        count: l,
        defaultValue: "{{count}} libres",
      }),
    );
  if (!partes.length)
    return t("agregarPersona.rotacion.sinRotacion", {
      defaultValue: "Sin rotación definida",
    });

  return partes.join(", ");
}

const hhmm = (x?: string | null) => (x ? String(x).slice(0, 5) : "");

/** «07:00–19:00», or "" when the post has no hours. */
export function horasDe(inicio?: string | null, fin?: string | null): string {
  return [hhmm(inicio), hhmm(fin)].filter(Boolean).join("–");
}

/** «2 días, 2 noches, 2 libres · 07:00–19:00». */
export function turnoEnPalabras(
  rot: RotacionLeida | null | undefined,
  inicio: string | null | undefined,
  fin: string | null | undefined,
  t: Traductor,
): string {
  return [rotacionEnPalabras(rot, t), horasDe(inicio, fin)]
    .filter(Boolean)
    .join(" · ");
}

/**
 * The rotation a guard will follow in a seat: the seat's own when it has one,
 * otherwise the station's (same precedence as the shift generator).
 */
export function rotacionDePlaza<R extends { id: string }>(
  plaza: { rotationStyleId?: string | null } | null | undefined,
  estacion: { rotationStyleId?: string | null } | null | undefined,
  estilos: R[],
): R | null {
  const id = plaza?.rotationStyleId || estacion?.rotationStyleId || null;

  return id ? estilos.find((s) => String(s.id) === String(id)) || null : null;
}

/**
 * An office week in a few words: «Lunes a viernes 09:00–18:00 · almuerzo
 * 13:00–14:00». Days with the same hours and lunch go together.
 */
export function semanaEnPalabras(j: Jornada, t: Traductor): string[] {
  const grupos = new Map<string, { dias: number[]; texto: string }>();

  j.forEach((d, i) => {
    if (!d.activo) return;
    const almuerzo =
      d.almuerzo && d.breakStart
        ? t("agregarPersona.semana.almuerzo", {
            defaultValue: "almuerzo {{desde}}–{{hasta}}",
            desde: d.breakStart,
            hasta: finDeAlmuerzo(d.breakStart, d.breakMinutes),
          })
        : "";
    const texto = [horasDe(d.start, d.end), almuerzo]
      .filter(Boolean)
      .join(" · ");
    const g = grupos.get(texto) || { dias: [], texto };

    g.dias.push(i);
    grupos.set(texto, g);
  });

  return [...grupos.values()].map(
    (g) => `${nombreDeDias(g.dias, t)} ${g.texto}`,
  );
}

// ── Office roles: none preselected, least privileged first ─────────────────

export interface RolDeOficina {
  id: string;
  slug?: string | null;
  name?: string | null;
  permissions?: unknown[] | null;
}

/** Roles that have their own flow or are never given by hand. */
const ROLES_FUERA_DE_OFICINA = new Set([
  "securitysupervisor",
  "securityguard",
  "customer",
  "centraloperator",
  "superadmin",
]);

const claveDeRol = (r: RolDeOficina) =>
  String(r.slug || r.name || r.id || "").toLowerCase();

export function rolesDeOficina<R extends RolDeOficina>(roles: R[]): R[] {
  return roles
    .filter((r) => !ROLES_FUERA_DE_OFICINA.has(claveDeRol(r)))
    .sort(
      (a, b) =>
        (a.permissions?.length ?? 0) - (b.permissions?.length ?? 0) ||
        claveDeRol(a).localeCompare(claveDeRol(b)),
    );
}

/** Administrator and operations manager see everything by definition. */
export function rolVeTodo(r: RolDeOficina | null | undefined): boolean {
  return !!r && ["admin", "operationsmanager"].includes(claveDeRol(r));
}

// ── Request bodies (the same ones the existing screens send) ───────────────

const limpio = (s: string) => s.trim();
const opcional = (s: string) => (s.trim() ? s.trim() : undefined);

/** POST /security-guard/invite → `entries[0]`. */
export function cuerpoDeVigilante(d: Datos) {
  const base = {
    firstName: limpio(d.nombres),
    lastName: limpio(d.apellidos),
    ...(opcional(d.documento) ? { governmentId: limpio(d.documento) } : {}),
  };

  if (d.sinCorreo && !d.correo.trim()) {
    if (d.celular.trim()) {
      // The server does not text: it returns the link to share by WhatsApp.
      return {
        ...base,
        inviteBy: "SMS",
        contact: limpio(d.celular),
        phoneNumber: limpio(d.celular),
      };
    }

    return {
      ...base,
      sinCorreo: true,
      ...(opcional(d.usuario) ? { username: limpio(d.usuario) } : {}),
    };
  }

  return {
    ...base,
    inviteBy: "Correo Electrónico",
    contact: limpio(d.correo),
    email: limpio(d.correo),
    clientIds: [],
    stationIds: [],
  };
}

/** POST /supervisors. */
export function cuerpoDeSupervisor(d: Datos) {
  return {
    firstName: limpio(d.nombres),
    lastName: limpio(d.apellidos),
    ...(d.sinCorreo && !d.correo.trim()
      ? {
          sinCorreo: true,
          ...(opcional(d.usuario) ? { username: limpio(d.usuario) } : {}),
        }
      : { email: limpio(d.correo) }),
    ...(opcional(d.documento) ? { governmentId: limpio(d.documento) } : {}),
    ...(opcional(d.celular) ? { phoneNumber: limpio(d.celular) } : {}),
  };
}

/**
 * POST /user (office). `sedes` are post-site ids; the clients go along so the
 * scope reads the same as when it is set from the office user screen.
 */
export function cuerpoDeOficina(
  d: Datos,
  sedes: Array<{ id: string; clientIds?: string[] | null }> = [],
  rol?: RolDeOficina | null,
) {
  const acotado = d.alcance === "sedes" && !rolVeTodo(rol);
  const elegidas = acotado ? sedes.filter((s) => d.sedes.includes(s.id)) : [];

  return {
    name: `${limpio(d.nombres)} ${limpio(d.apellidos)}`.trim(),
    email: limpio(d.correo),
    role: d.rol,
    postSiteIds: acotado ? [...d.sedes] : [],
    clientIds: [...new Set(elegidas.flatMap((s) => s.clientIds || []))],
    invited: true,
    pending: true,
  };
}

/** POST /guard-assignment. `guardRef` is the user id (or the record id). */
export function cuerpoDeAsignacion(
  guardRef: string,
  l: Extract<Lugar, { tipo: "vigilante" }>,
) {
  return {
    guardId: guardRef,
    stationId: l.stationId,
    positionId: l.positionId,
    ...(l.desde ? { startDate: l.desde } : {}),
  };
}

/** POST /supervisor-positions/:id/assignments. */
export function cuerpoDePuesto(
  userId: string,
  l: Extract<Lugar, { tipo: "supervisor" }>,
) {
  return {
    supervisorUserId: userId,
    ...(l.desde ? { startDate: l.desde } : {}),
  };
}

/** PUT /staff-schedule/:userId/pattern. */
export function cuerpoDeHorarioDeOficina(
  l: Extract<Lugar, { tipo: "oficina" }>,
) {
  return cuerpoDeJornada(l.jornada, l.desde || "");
}

/** PATCH /user/:id with the office location, or null when there is nothing to save. */
export function cuerpoDeUbicacion(o: OficinaFisica | null) {
  if (!o) return null;
  const tieneCoordenadas = !!(o.lat.trim() && o.lng.trim());

  if (!tieneCoordenadas && !o.direccion.trim()) return null;

  return {
    officeAddress: o.direccion.trim() || null,
    officeLatitude: tieneCoordenadas ? Number(o.lat) : null,
    officeLongitude: tieneCoordenadas ? Number(o.lng) : null,
    officeGeofenceRadiusM: tieneCoordenadas
      ? o.radio.trim()
        ? Number(o.radio)
        : 150
      : null,
  };
}

// ── After «Crear» ───────────────────────────────────────────────────────────

export type EstadoDeParte = "hecho" | "despues" | "fallo";

export interface Resultado {
  tipo: TipoDePersona;
  nombre: string;
  userId: string | null;
  /** The record id the guard ficha may need when the user id is missing. */
  fichaId: string | null;
  acceso: {
    username: string | null;
    link: string | null;
    correo: string | null;
  };
  horario: EstadoDeParte;
  horarioError?: string | null;
  ubicacion: EstadoDeParte;
  ubicacionError?: string | null;
}

/** What is still missing after the person was created: the summary offers to finish it. */
export function pendientes(r: Resultado): Array<"horario" | "ubicacion"> {
  const out: Array<"horario" | "ubicacion"> = [];

  if (r.horario !== "hecho") out.push("horario");
  if (r.tipo === "oficina" && r.ubicacion === "fallo") out.push("ubicacion");

  return out;
}

/** The person's sheet. */
export function fichaDe(tipo: TipoDePersona, id: string | null): string | null {
  if (!id) return null;
  if (tipo === "vigilante") return `/guards/${id}/resumen`;
  if (tipo === "supervisor") return `/supervisors/${id}`;

  return `/back-office/${id}`;
}

/** Where to finish a schedule that was left for later or failed. */
export function dondeTerminarHorario(
  tipo: TipoDePersona,
  id: string | null,
): string {
  if (tipo === "vigilante" && id) return `/guards/${id}/asignar-sitios`;
  if (tipo === "supervisor") return "/supervisor-positions";

  return "/schedule";
}

/** The message a person gets by WhatsApp with their username and link. */
export function mensajeDeAcceso(
  a: { nombre: string; username: string | null; link: string | null },
  t: Traductor,
): string {
  return t("usuarioDeAcceso.compartir.mensajeInvitacion", {
    nombre: (a.nombre || "").trim().split(/\s+/)[0] || "",
    usuario: a.username || "",
    enlace: a.link || "",
    defaultValue:
      "Hola {{nombre}}. Tu usuario para entrar a la app es: {{usuario}}. Crea tu contraseña aquí: {{enlace}}",
  });
}

export const enlaceDeWhatsApp = (mensaje: string) =>
  `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
