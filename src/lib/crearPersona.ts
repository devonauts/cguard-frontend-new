/**
 * Creating ONE person with their schedule — the network half of «Agregar
 * persona», shared by the wizard and by «Agregar varias personas» so both make
 * exactly the same calls (the ones the old forms made):
 *
 *   1 the person: guard invite / supervisor create / office user create
 *   2 their schedule: station seat / supervisor post / office week
 *   3 office only: their office location
 *
 * If 1 fails nothing was created and the error is thrown. If 2 or 3 fail the
 * person is kept and the result says what is still missing, so it can be
 * retried with `ponerHorario` without creating them twice.
 */
import type { Traductor } from "@/lib/secuenciaDeRotacion";

import { ApiService } from "@/services/api/apiService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { supervisorService } from "@/lib/api/supervisorService";
import { supervisorPositionService } from "@/lib/api/supervisorPositionService";
import { userService } from "@/lib/api/userService";
import {
  cuerpoDeAsignacion,
  cuerpoDeHorarioDeOficina,
  cuerpoDeOficina,
  cuerpoDePuesto,
  cuerpoDeSupervisor,
  cuerpoDeUbicacion,
  cuerpoDeVigilante,
  type Datos,
  type Horario,
  type Resultado,
  type RolDeOficina,
  type TipoDePersona,
} from "@/lib/agregarPersona";

const tenantId = () => localStorage.getItem("tenantId") || "";

export const filasDe = (r: any): any[] =>
  Array.isArray(r)
    ? r
    : Array.isArray(r?.rows)
      ? r.rows
      : Array.isArray(r?.data?.rows)
        ? r.data.rows
        : Array.isArray(r?.data)
          ? r.data
          : [];

export const mensajeDeError = (e: any, respaldo: string): string =>
  e?.data?.message || e?.response?.data?.message || e?.message || respaldo;

export interface OpcionesDeAlta {
  /** Office scope: the company's sites (post-site id + its clients). */
  sedes?: Array<{ id: string; clientIds?: string[] | null }>;
  /** Office: the chosen role record (decides «sees everything»). */
  rol?: RolDeOficina | null;
  t: Traductor;
}

const nombreDe = (d: Datos) =>
  `${d.nombres.trim()} ${d.apellidos.trim()}`.trim();

/** Step 1 + 2 (+ 3). Throws only when the person could not be created. */
export async function crearPersona(
  tipo: TipoDePersona,
  datos: Datos,
  horario: Horario,
  o: OpcionesDeAlta,
): Promise<Resultado> {
  const r: Resultado = {
    tipo,
    nombre: nombreDe(datos),
    userId: null,
    fichaId: null,
    acceso: { username: null, link: null, correo: null },
    horario: horario ? "fallo" : "despues",
    ubicacion: "despues",
  };

  if (tipo === "vigilante") {
    const resp: any = await securityGuardService.invite([
      cuerpoDeVigilante(datos),
    ]);

    r.userId = resp?.userId ? String(resp.userId) : null;
    // The guard sheet is keyed by the RECORD id; the assignment takes either.
    r.fichaId = resp?.securityGuardId ? String(resp.securityGuardId) : r.userId;
    r.acceso = {
      username: resp?.username || null,
      link:
        resp?.invitationLink && (datos.sinCorreo || !datos.correo.trim())
          ? resp.invitationLink
          : null,
      correo: datos.sinCorreo ? null : datos.correo.trim() || null,
    };
  } else if (tipo === "supervisor") {
    const sup: any = await supervisorService.create(cuerpoDeSupervisor(datos));

    r.userId = sup?.id ? String(sup.id) : null;
    r.fichaId = r.userId;
    r.acceso = {
      username: sup?.username || null,
      link: sup?.invitationLink || null,
      correo: datos.sinCorreo ? null : datos.correo.trim() || null,
    };
  } else {
    await userService.createUser(
      cuerpoDeOficina(datos, o.sedes || [], o.rol) as any,
    );
    // The create answers `true`: the new account is found by its e-mail.
    const correo = datos.correo.trim();
    const lista: any = await ApiService.get(
      `/tenant/${tenantId()}/user?filter%5Bemail%5D=${encodeURIComponent(correo)}&limit=5`,
    ).catch(() => null);
    const u = filasDe(lista).find(
      (x: any) => String(x.email || "").toLowerCase() === correo.toLowerCase(),
    );

    r.userId = u?.id ? String(u.id) : null;
    r.fichaId = r.userId;
    r.acceso = { username: null, link: null, correo };
  }

  if (horario) await ponerHorario(r, horario, o.t);

  return r;
}

/**
 * Step 2 (+ 3) for a person who already exists: sets `r.horario` /
 * `r.ubicacion` to «hecho» or «fallo» with the reason. Never throws.
 */
export async function ponerHorario(
  r: Resultado,
  h: NonNullable<Horario>,
  t: Traductor,
): Promise<Resultado> {
  const sinId = () =>
    new Error(
      t(
        "agregarPersona.errores.sinId",
        "No encontramos a la persona recién creada",
      ),
    );

  try {
    if (h.tipo === "vigilante") {
      const ref = r.userId || r.fichaId;

      if (!ref) throw sinId();
      await ApiService.post(
        `/tenant/${tenantId()}/guard-assignment`,
        cuerpoDeAsignacion(ref, h),
      );
    } else if (h.tipo === "supervisor") {
      if (!r.userId) throw sinId();
      await supervisorPositionService.assign(
        h.positionId,
        cuerpoDePuesto(r.userId, h),
      );
    } else {
      if (!r.userId) throw sinId();
      await ApiService.put(
        `/tenant/${tenantId()}/staff-schedule/${r.userId}/pattern`,
        {
          data: cuerpoDeHorarioDeOficina(h),
        },
      );
    }
    r.horario = "hecho";
    r.horarioError = null;
  } catch (e: any) {
    r.horario = "fallo";
    r.horarioError = mensajeDeError(
      e,
      t("agregarPersona.errores.horario", "No se pudo guardar el horario"),
    );
  }

  // Office location (optional).
  if (h.tipo === "oficina") {
    const ubic = cuerpoDeUbicacion(h.oficina);

    if (ubic && r.userId) {
      try {
        await ApiService.patch(`/tenant/${tenantId()}/user/${r.userId}`, {
          data: ubic,
        });
        r.ubicacion = "hecho";
        r.ubicacionError = null;
      } catch (e: any) {
        r.ubicacion = "fallo";
        r.ubicacionError = mensajeDeError(
          e,
          t(
            "agregarPersona.errores.ubicacion",
            "No se pudo guardar la oficina",
          ),
        );
      }
    } else if (ubic) {
      r.ubicacion = "fallo";
    }
  }

  return r;
}
