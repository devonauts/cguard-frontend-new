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
    dateFrom: z.string().min(1, {
      error: msj("validation.route.dateFromRequired", "Desde requerido"),
    }),
    dateTo: z.string().min(1, {
      error: msj("validation.route.dateToRequired", "Hasta requerido"),
    }),
    startTime: z.string().min(1, {
      error: msj(
        "validation.route.startTimeRequired",
        "Hora de inicio requerida",
      ),
    }),
    endTime: z.string().min(1, {
      error: msj("validation.route.endTimeRequired", "Hora de fin requerida"),
    }),
    days: z
      .array(z.enum(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]))
      .min(1, {
        error: msj(
          "validation.route.daysRequired",
          "Seleccionar al menos un día",
        ),
      }),
    supervisorId: z.string().min(1, {
      error: msj("validation.route.supervisorRequired", "Supervisor requerido"),
    }),
    siteIds: z.array(z.string()).min(1, {
      error: msj(
        "validation.route.sitesRequired",
        "Selecciona al menos una sede",
      ),
    }),
    vehicleId: z.string().min(1, {
      error: msj("validation.route.vehicleRequired", "Vehículo requerido"),
    }),
    createPatrol: z.boolean().default(false),
    syncHitsBetweenGuards: z.boolean().default(false),
    forceVehicleRouteOrder: z.boolean().default(false),
    notifyBefore: z
      .enum(["00:05", "00:10", "00:15", "00:30", "01:00"])
      .default("00:15"),
    autoCheckInByGeofence: z.boolean().default(false),
    forceCheckInBeforeStart: z.boolean().default(false),
  })
  .refine((v) => new Date(v.dateFrom) <= new Date(v.dateTo), {
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
