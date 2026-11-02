import { z } from "zod";

import i18n from "@/i18n";

// Esquema de módulo: el texto se resuelve TARDE (dentro de `error`, que zod
// llama en cada validación), nunca al cargar, para que siga el idioma vivo.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

const dispatchBaseSchema = z.object({
    // clientId/siteId may be omitted when creating from a post-site context
    clientId: z.string().optional(),
    siteId: z.string().optional(),
    // station is required for the post-site flow (we rely on station to locate the incident)
    stationId: z.string().min(1, {
      error: msj("dispatch.validation.stationRequired", "Estación requerida"),
    }),
    guardId: z.string().optional(),
    priority: z.enum(["alta", "media", "baja"]),
    callerType: z.string().min(1, {
      error: msj(
        "dispatch.validation.callerTypeRequired",
        "Tipo de llamador requerido",
      ),
    }),
    callerName: z.string().min(1, {
      error: msj(
        "dispatch.validation.callerNameRequired",
        "Nombre del llamador requerido",
      ),
    }),
    location: z.string().min(1, {
      error: msj("dispatch.validation.locationRequired", "Ubicación requerida"),
    }),
    incidentType: z.string().min(1, {
      error: msj(
        "dispatch.validation.incidentTypeRequired",
        "Tipo de incidente requerido",
      ),
    }),
    incidentDate: z.string().min(1, {
      error: msj("dispatch.validation.dateRequired", "Fecha requerida"),
    }),
    incidentTime: z.string().min(1, {
      error: msj("dispatch.validation.timeRequired", "Hora requerida"),
    }),
    incidentDetails: z.string().min(1, {
      error: msj("dispatch.validation.detailsRequired", "Detalles requeridos"),
    }),
    actionsTaken: z.string().optional(),
    internalNotes: z.string().optional(),
    attachment: z.instanceof(File).optional().or(z.undefined()),
});

// require date/time and basic presence of mandatory fields
const dateTimeRequired: [
  (v: { incidentDate?: string; incidentTime?: string }) => boolean,
  { error: () => string; path: string[] },
] = [
  (v: { incidentDate?: string; incidentTime?: string }) =>
    Boolean(v.incidentDate) && Boolean(v.incidentTime),
  {
    error: msj(
      "dispatch.validation.incidentDateTimeRequired",
      "Fecha y hora del incidente son requeridas",
    ),
    path: ["incidentDate"],
  },
];

export const dispatchCreateSchema = dispatchBaseSchema
  .refine(...dateTimeRequired)
  .refine(
    (v) => {
      // Ensure we have enough location context: stationId must be provided
      return Boolean(v.stationId && String(v.stationId).trim().length > 0);
    },
    {
      error: msj("dispatch.validation.stationRequired", "Estación requerida"),
      path: ["stationId"],
    },
  );

export type DispatchCreateSchema = z.infer<typeof dispatchCreateSchema>;

/**
 * Editing an incident. The edit form has no station field (the incident keeps
 * the one it was filed at; the PUT does not send it), but it validated with the
 * create schema, whose `stationId` is required: «Enviar» failed validation on a
 * field nobody could see, so no change could ever be saved.
 */
export const dispatchEditSchema = dispatchBaseSchema
  .extend({ stationId: z.string().optional() })
  .refine(...dateTimeRequired);

export type DispatchEditSchema = z.infer<typeof dispatchEditSchema>;
