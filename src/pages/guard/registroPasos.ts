/**
 * Guard self-registration (`/auth/invitation`): which fields each of the three
 * steps holds. «Siguiente» and «Registrarse» refused silently when a field
 * without its own error line was missing (QA 2026-11-01); with this map the
 * page names what is missing and jumps back to the step that holds it.
 */
export type PasoDeRegistro = 1 | 2 | 3;

export const CAMPOS_DEL_PASO: Record<PasoDeRegistro, readonly string[]> = {
  1: ["firstName", "lastName", "email"],
  2: [
    "governmentId",
    "birthDate",
    "birthPlace",
    "gender",
    "maritalStatus",
    "academicInstruction",
  ],
  3: ["bloodType", "guardCredentials", "address", "phone", "password", "confirm"],
};

type Errores = Record<string, string | undefined>;

const conError = (e: Errores, k: string) => !!(e[k] && String(e[k]).trim());

/** The fields with an error, in the order the form shows them. */
export function camposConError(e: Errores): string[] {
  return ([1, 2, 3] as const).flatMap((p) =>
    CAMPOS_DEL_PASO[p].filter((k) => conError(e, k)),
  );
}

/** The first step that has a field with an error, or null. */
export function primerPasoConErrores(e: Errores): PasoDeRegistro | null {
  for (const p of [1, 2, 3] as const) {
    if (CAMPOS_DEL_PASO[p].some((k) => conError(e, k))) return p;
  }

  return null;
}
