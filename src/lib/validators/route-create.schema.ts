import { z } from "zod";

import i18n from "@/i18n";

// Esquema de MÓDULO: se construye al importar el fichero, así que un `t()` suelto
// aquí congelaría el texto en el idioma de arranque. zod acepta una FUNCIÓN en
// `error` y la ejecuta AL VALIDAR: ahí sí sale en el idioma vigente.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

export const routeCreateSchema = z
  .object({
    name: z.string().min(1, {
      error: msj("clients.contacts.errors.requiredName", "Nombre requerido"),
    }),
    description: z.string().optional(),
    continuous: z.boolean().default(true),
    dateFrom: z.string().optional().default(""),
    dateTo: z.string().optional().default(""),
    /* La ventana fija desde/hasta + inicio/fin ya no se pide: una ruta sale a
       su hora (o al empezar el turno) y termina cuando termina —eso lo dan la
       optimización y el tráfico—. Se conservan para las rutas viejas que la
       tienen. */
    startTime: z.string().optional().default(""),
    endTime: z.string().optional().default(""),
    days: z
      .array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]))
      .min(1, {
        error: msj(
          "validation.route.daysRequired",
          "Seleccionar al menos un día",
        ),
      }),
    /** La ruta es de uno o más PUESTOS: la ve quien esté de turno en
        cualquiera de ellos ese día, y la toma el primero que la empiece. */
    supervisorPositionIds: z.array(z.string()).optional().default([]),
    /** Rutas viejas: asignadas a una persona concreta. */
    supervisorId: z.string().optional().default(""),
    siteIds: z.array(z.string()).min(1, {
      error: msj(
        "validation.route.sitesRequired",
        "Selecciona al menos una sede",
      ),
    }),
    /** Opcional: hay supervisores que hacen la ruta en su propia moto, sin
        vehículo de la empresa (Seguridad B.A.S., 2026-11-04). */
    vehicleId: z.string().optional().default(""),
    createPatrol: z.boolean().default(false),
    syncHitsBetweenGuards: z.boolean().default(false),
    forceVehicleRouteOrder: z.boolean().default(false),
    notifyBefore: z
      .enum(["00:05", "00:10", "00:15", "00:30", "01:00"])
      .default("00:15"),
    autoCheckInByGeofence: z.boolean().default(false),
    forceCheckInBeforeStart: z.boolean().default(false),
  })
  .refine((v) => !!((v.supervisorPositionIds || []).length || v.supervisorId), {
    path: ["supervisorPositionIds"],
    error: () =>
      i18n.t("validation.route.puestoRequired", {
        defaultValue: "Elige al menos un puesto de supervisión que haga la ruta",
      }),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || new Date(v.dateFrom) <= new Date(v.dateTo), {
    path: ["dateTo"],
    // El esquema se construye al CARGAR el módulo, antes de que el idioma esté
    // listo: un `message` fijo con t() congelaría el texto en el idioma de
    // arranque. Como FUNCIÓN, `error` se evalúa al validar — ahí ya hay idioma.
    error: () =>
      i18n.t("validacion.rangoFechasInvalido", {
        defaultValue: "Rango de fechas inválido",
      }),
  });

export type RouteCreateSchema = z.infer<typeof routeCreateSchema>;
