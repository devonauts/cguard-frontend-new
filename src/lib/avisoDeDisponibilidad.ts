import { toast } from "sonner";

import i18n from "@/i18n";

/**
 * A new assignment whose shifts fall outside the person's availability comes
 * back with `availabilityWarning: { count, dates }` (backend
 * guardAssignmentCreate). Ten screens create assignments; the warning is said
 * once, here, for all of them. It is a warning: the assignment is made.
 */
export function avisarSiFueraDeDisponibilidad(method: unknown, url: unknown, body: unknown): void {
  try {
    if (String(method || "").toUpperCase() !== "POST") return;
    if (!/\/guard-assignment\/?(\?|$)/.test(String(url || ""))) return;
    const b: any = body && typeof body === "object" ? body : null;
    const w = b?.availabilityWarning ?? b?.data?.availabilityWarning;

    if (!w || !w.count) return;
    const dias = Array.isArray(w.dates) ? w.dates.slice(0, 4).join(", ") : "";

    toast.warning(
      i18n.t("ui.disponibilidad.asignadoFuera", {
        n: w.count,
        dias,
        defaultValue:
          "Asignado, pero {{n}} turno(s) caen fuera de la disponibilidad que indicó ({{dias}}). Revísalo con la persona.",
      }),
      { id: "disponibilidad-asignacion" },
    );
  } catch {
    /* a warning never breaks the response */
  }
}
