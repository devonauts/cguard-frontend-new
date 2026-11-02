import type {
  TrainingCategory,
  TrainingLevel,
  EnrollmentStatus,
} from "@/lib/api/trainingCourseService";

import i18n from "@/i18n";

// OJO: constante de módulo — se evalúa al cargar, así que aquí NO se llama a
// t(). Cada entrada lleva su CLAVE (labelKey) y el texto se traduce donde se
// pinta (páginas del módulo de entrenamiento).
export const TRAINING_CATEGORIES: {
  value: TrainingCategory;
  label: string;
  labelKey: string;
}[] = [
  {
    value: "security",
    label: "Seguridad",
    labelKey: "training.categories.security",
  },
  {
    value: "compliance",
    label: "Cumplimiento",
    labelKey: "training.categories.compliance",
  },
  {
    value: "skills",
    label: "Habilidades",
    labelKey: "training.categories.skills",
  },
  {
    value: "safety",
    label: "Prevención",
    labelKey: "training.categories.safety",
  },
  { value: "other", label: "Otro", labelKey: "training.categories.other" },
];

export const TRAINING_LEVELS: {
  value: TrainingLevel;
  label: string;
  labelKey: string;
}[] = [
  {
    value: "beginner",
    label: "Principiante",
    labelKey: "training.levels.beginner",
  },
  {
    value: "intermediate",
    label: "Intermedio",
    labelKey: "training.levels.intermediate",
  },
  {
    value: "advanced",
    label: "Avanzado",
    labelKey: "training.levels.advanced",
  },
];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  assigned: "Asignado",
  in_progress: "En progreso",
  completed: "Completado",
  expired: "Vencido",
};

/** Claves del mapa de arriba. El texto español queda como valor por defecto y
 *  la traducción se resuelve al llamar a `enrollmentStatusLabel`, no al cargar
 *  el módulo. Para pintar un estado, usa el helper — nunca el Record de texto. */
export const ENROLLMENT_STATUS_KEYS: Record<EnrollmentStatus, string> = {
  assigned: "training.enrollmentStatus.assigned",
  in_progress: "training.enrollmentStatus.inProgress",
  completed: "training.enrollmentStatus.completed",
  expired: "training.enrollmentStatus.expired",
};

export function enrollmentStatusLabel(value?: string): string {
  const k = ENROLLMENT_STATUS_KEYS[value as EnrollmentStatus];

  return k
    ? i18n.t(k, ENROLLMENT_STATUS_LABELS[value as EnrollmentStatus])
    : (value ?? "-");
}

/**
 * Estado de la inscripción → PAPEL del sistema.
 *
 * Antes esto devolvía variantes de shadcn (`default`/`secondary`/`outline`/
 * `destructive`), que son formas de botón, no estados: «completado» y
 * «asignado» salían del mismo gris y sólo se distinguían por el borde. Todos
 * los demás mapas de estado del CRM (nómina, tareas, pase de novedades) ya
 * hablan en tonos; éste era el único que no.
 */
export const ENROLLMENT_STATUS_TONE: Record<
  EnrollmentStatus,
  "neutral" | "info" | "ok" | "bad"
> = {
  assigned: "neutral",
  in_progress: "info",
  completed: "ok",
  expired: "bad",
};

export function categoryLabel(value?: string): string {
  const c = TRAINING_CATEGORIES.find((x) => x.value === value);

  return c ? i18n.t(c.labelKey, c.label) : "-";
}

export function levelLabel(value?: string): string {
  const l = TRAINING_LEVELS.find((x) => x.value === value);

  return l ? i18n.t(l.labelKey, l.label) : "-";
}

/** Same limits as the server (trainingCourseService): a course saved with a
 *  250 % passing score can never be passed, and negative points take points
 *  away from whoever completes it. */
export const PASSING_SCORE_MIN = 1;
export const PASSING_SCORE_MAX = 100;
export const POINTS_VALUE_MAX = 100000;

const wholeIn = (v: unknown, min: number, max: number) => {
  const n = Number(v);

  return Number.isInteger(n) && n >= min && n <= max;
};

/** The first problem with a course's score fields, translated, or null. */
export function courseScoreProblem(values: {
  passingScore?: unknown;
  pointsValue?: unknown;
}): string | null {
  if (
    values.passingScore !== undefined &&
    !wholeIn(values.passingScore, PASSING_SCORE_MIN, PASSING_SCORE_MAX)
  )
    return i18n.t(
      "ui.training.puntajeFueraDeRango",
      "El puntaje para aprobar debe ser un número entero entre 1 y 100.",
    );
  if (
    values.pointsValue !== undefined &&
    !wholeIn(values.pointsValue, 0, POINTS_VALUE_MAX)
  )
    return i18n.t(
      "ui.training.puntosFueraDeRango",
      "Los puntos deben ser un número entero entre 0 y 100000.",
    );

  return null;
}
