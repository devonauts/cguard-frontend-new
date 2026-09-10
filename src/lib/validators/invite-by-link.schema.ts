import { z } from "zod";

import i18n from "@/i18n";

// Esquema de MÓDULO: se construye al importar, así que aquí NO se puede llamar a
// `t()` con el texto ya resuelto — quedaría congelado en el idioma de arranque.
// zod acepta una FUNCIÓN en `error`, y esa función corre al validar: ahí sí se
// traduce, con el idioma que esté activo en ese momento.
const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);

// E.164: + y 8–15 dígitos
const e164 = /^\+[1-9]\d{7,14}$/;

export const inviteByLinkEntrySchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(e164, {
      error: msj(
        "validation.common.phoneE164",
        "Use formato e.g. +12015550123",
      ),
    }),
});

export const inviteByLinkSchema = z.object({
  link: z
    .string()
    .trim()
    .url({
      error: msj("validation.inviteByLink.invalidLink", "Enlace inválido"),
    }),
  entries: z.array(inviteByLinkEntrySchema).min(1, {
    error: msj(
      "validation.common.atLeastOneGuard",
      "Agregue al menos un vigilante",
    ),
  }),
});

export type InviteByLinkEntry = z.infer<typeof inviteByLinkEntrySchema>;
export type InviteByLinkFormValues = z.infer<typeof inviteByLinkSchema>;
