import { z } from "zod";

import i18n from "@/i18n";

/* Esquema de MÓDULO: se construye al cargar el archivo. Los mensajes NO pueden
   llamarse a `t()` aquí —quedarían congelados en el idioma de arranque—, así
   que se pasan como función: zod la evalúa al validar, ya con el idioma puesto. */

export const SERVICE_TYPE_VALUES = [
  "manned",
  "alarm",
  "cctv",
  "patrol",
  "custody",
] as const;

/** Mensaje de longitud máxima. Es una FUNCIÓN: zod la ejecuta al validar, ya con
 *  el idioma del usuario puesto, no al construir el esquema. */
const maxChars = (n: number) => ({
  error: () =>
    i18n.t("validation.postSite.maxChars", {
      n,
      defaultValue: "Máximo {{n}} caracteres",
    }),
});

export const postSiteSchema = z.object({
  name: z.string().trim().max(200, maxChars(200)).optional().or(z.literal("")),
  serviceType: z
    .string()
    .trim()
    .max(50, maxChars(50))
    .optional()
    .or(z.literal("")),
  serviceConfig: z.any().optional(),
  clientId: z.string().trim().optional().or(z.literal("")),
  description: z
    .string()
    .trim()
    .max(5000, maxChars(5000))
    .optional()
    .or(z.literal("")),
  address: z
    .string()
    .trim()
    .max(200, maxChars(200))
    .optional()
    .or(z.literal("")),
  addressLine2: z
    .string()
    .trim()
    .max(200, maxChars(200))
    .optional()
    .or(z.literal("")),
  city: z.string().trim().max(100, maxChars(100)).optional().or(z.literal("")),
  country: z
    .string()
    .trim()
    .max(100, maxChars(100))
    .optional()
    .or(z.literal("")),
  postalCode: z
    .string()
    .trim()
    .max(20, maxChars(20))
    .optional()
    .or(z.literal("")),
  email: z.string().trim().max(200, maxChars(200)).optional().or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(20, {
      error: () =>
        i18n.t(
          "validation.postSite.phoneMax",
          "El teléfono puede tener como máximo 20 caracteres",
        ),
    })
    .optional()
    .or(z.literal("")),
  latitud: z.coerce
    .string()
    .trim()
    .max(100, maxChars(100))
    .optional()
    .or(z.literal(""))
    .refine(
      (val) => val === undefined || val === "" || /^-?\d+(?:\.\d+)?$/.test(val),
      {
        error: () =>
          i18n.t(
            "validation.postSite.latitude",
            "Latitud inválida (sólo números y punto decimal)",
          ),
      },
    ),
  longitud: z.coerce
    .string()
    .trim()
    .max(100, maxChars(100))
    .optional()
    .or(z.literal(""))
    .refine(
      (val) => val === undefined || val === "" || /^-?\d+(?:\.\d+)?$/.test(val),
      {
        error: () =>
          i18n.t(
            "validation.postSite.longitude",
            "Longitud inválida (sólo números y punto decimal)",
          ),
      },
    ),
  /* Aquí vivía `stationSchedule`, un enum de duraciones sueltas («8 horas»,
     «12 horas»…). Era un CUARTO formato del mismo dato, incompatible con las
     plazas, con el array JSON que recibían las apps y con la franja. La columna
     se eliminó de la base el 2026-09-12; el validador se va con ella. */
  startingTimeInDay: z
    .string()
    .trim()
    .max(20, maxChars(20))
    .optional()
    .or(z.literal("")),
  finishTimeInDay: z
    .string()
    .trim()
    .max(20, maxChars(20))
    .optional()
    .or(z.literal("")),
  fax: z
    .string()
    .trim()
    .max(20, {
      error: () =>
        i18n.t(
          "validation.postSite.faxMax",
          "El fax puede tener como máximo 20 caracteres",
        ),
    })
    .optional()
    .or(z.literal("")),
  categoryId: z.string().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type PostSiteInput = z.infer<typeof postSiteSchema>;
