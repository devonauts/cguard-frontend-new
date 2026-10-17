import { z } from "zod";

import i18n from "@/i18n";

// Esquema de MÓDULO: se construye al importar el fichero, así que un `t()` suelto
// aquí congelaría el texto en el idioma de arranque. zod acepta una FUNCIÓN en
// `error` y la ejecuta AL VALIDAR: ahí sí sale en el idioma vigente.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

// E.164: + y 8–15 dígitos
const e164 = /^\+[1-9]\d{7,14}$/;

// Nombre/Apellido: permitir letras Unicode, espacios, apóstrofe y guiones. No números.
const nameRegex = /^[\p{L} '\-]+$/u;

// «Sin correo»: ni correo ni teléfono, sólo el usuario para entrar (alias).
// El valor viaja sólo en el formulario; al API va `sinCorreo: true`.
export const inviteByOptions = ["SMS", "Correo Electrónico", "Sin correo"] as const;

const baseEntry = {
  firstName: z
    .string()
    .trim()
    .min(1, {
      error: msj("validation.common.nameRequired", "El nombre es requerido"),
    })
    .regex(nameRegex, {
      error: msj(
        "validation.common.nameInvalid",
        "El nombre no debe contener números ni caracteres inválidos",
      ),
    }),
  lastName: z
    .string()
    .trim()
    .min(1, {
      error: msj(
        "validation.common.lastNameRequired",
        "El apellido es requerido",
      ),
    })
    .regex(nameRegex, {
      error: msj(
        "validation.common.lastNameInvalid",
        "El apellido no debe contener números ni caracteres inválidos",
      ),
    }),
  // Client + station are OPTIONAL — a guard is invited with just name + contact
  // and assigned to a client/station later. (Both were removed from the form.)
  clientId: z.array(z.string().trim()).optional(),
  stationId: z.array(z.string().trim()).optional(),
};

// Un solo contacto por registro (email o teléfono según inviteBy)
const entrySMS = z.object({
  inviteBy: z.literal("SMS"),
  contact: z
    .string()
    .trim()
    .regex(e164, {
      error: msj(
        "validation.common.phoneE164International",
        "Use formato internacional, e.g. +12015550123",
      ),
    }),
});

const entryEmail = z.object({
  inviteBy: z.literal("Correo Electrónico"),
  contact: z
    .string()
    .trim()
    .email({
      error: msj("validation.common.emailInvalid", "Ingrese un correo válido"),
    }),
});

const entrySinCorreo = z.object({
  inviteBy: z.literal("Sin correo"),
  contact: z.string().trim().optional().or(z.literal("")),
  /** El usuario para entrar que eligió la empresa (lo valida el servidor). */
  username: z.string().trim().max(32).optional().or(z.literal("")),
});

export const guardEntrySchema = z
  .object(baseEntry)
  .and(
    z.discriminatedUnion("inviteBy", [entrySMS, entryEmail, entrySinCorreo]),
  );

export type GuardEntryValues = z.infer<typeof guardEntrySchema>;

// Formulario raíz: muchos registros de vigilantes
export const securityGuardsSchema = z.object({
  entries: z.array(guardEntrySchema).min(1, {
    error: msj(
      "validation.common.atLeastOneGuard",
      "Agregue al menos un vigilante",
    ),
  }),
});

export type SecurityGuardsFormValues = z.infer<typeof securityGuardsSchema>;
