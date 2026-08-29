import { z } from "zod";
import i18n from "@/i18n";

// Esquema de MÓDULO: se construye al importar el fichero, así que un `t()` suelto
// aquí congelaría el texto en el idioma de arranque. zod acepta una FUNCIÓN en
// `error` y la ejecuta AL VALIDAR: ahí sí sale en el idioma vigente.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

// E.164: + y 8–15 dígitos
const e164 = /^\+[1-9]\d{7,14}$/;

export const joinByCodeEntrySchema = z.object({
  phone: z.string().trim().regex(e164, { error: msj("validation.common.phoneE164", "Use formato e.g. +12015550123") }),
});

export const joinByCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .length(6, { error: msj("validation.joinByCode.codeLength", "El código debe tener 6 dígitos") })
    .regex(/^\d{6}$/, { error: msj("validation.joinByCode.codeNumeric", "El código debe ser numérico") }),
  entries: z.array(joinByCodeEntrySchema).min(1, { error: msj("validation.common.atLeastOneGuard", "Agregue al menos un vigilante") }),
});

export type JoinByCodeEntry = z.infer<typeof joinByCodeEntrySchema>;
export type JoinByCodeFormValues = z.infer<typeof joinByCodeSchema>;
