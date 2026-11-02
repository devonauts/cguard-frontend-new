import type { TFunction } from "i18next";

import { z } from "zod";

// Factory so validation messages follow the current language.
export const makeSchema = (t: TFunction) =>
  z.object({
  name: z
    .string()
    .trim()
    .min(1, t("clients.contacts.errors.requiredName", "Nombre requerido"))
    .max(200),
  type: z.enum([
    "event",
    "investigation",
    "alarm_response",
    "consulting",
    "other",
  ]),
  clientAccountId: z
    .string()
    .trim()
    .min(1, t("ui.ProjectForm.clienteRequerido", "Cliente requerido")),
  status: z.enum(["active", "completed", "cancelled", "on_hold"]),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  startDate: z.string().optional().or(z.literal("")),
  endDate: z.string().optional().or(z.literal("")),
  location: z.string().trim().max(300).optional().or(z.literal("")),
  estimatedHours: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
  })
  // A project could end before it started (05/12 → 04/12, QA M5). Both are
  // `YYYY-MM-DD`, so the string order is the date order.
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: t(
      "ui.ProjectForm.finAntesDeInicio",
      "La fecha de fin no puede ser anterior a la de inicio",
    ),
  });
