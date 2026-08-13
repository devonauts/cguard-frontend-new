import type { TrainingCategory, TrainingLevel, EnrollmentStatus } from '@/lib/api/trainingCourseService';

export const TRAINING_CATEGORIES: { value: TrainingCategory; label: string }[] = [
  { value: 'security', label: 'Seguridad' },
  { value: 'compliance', label: 'Cumplimiento' },
  { value: 'skills', label: 'Habilidades' },
  { value: 'safety', label: 'Prevención' },
  { value: 'other', label: 'Otro' },
];

export const TRAINING_LEVELS: { value: TrainingLevel; label: string }[] = [
  { value: 'beginner', label: 'Principiante' },
  { value: 'intermediate', label: 'Intermedio' },
  { value: 'advanced', label: 'Avanzado' },
];

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  assigned: 'Asignado',
  in_progress: 'En progreso',
  completed: 'Completado',
  expired: 'Vencido',
};

/**
 * Estado de la inscripción → PAPEL del sistema.
 *
 * Antes esto devolvía variantes de shadcn (`default`/`secondary`/`outline`/
 * `destructive`), que son formas de botón, no estados: «completado» y
 * «asignado» salían del mismo gris y sólo se distinguían por el borde. Todos
 * los demás mapas de estado del CRM (nómina, tareas, pase de novedades) ya
 * hablan en tonos; éste era el único que no.
 */
export const ENROLLMENT_STATUS_TONE: Record<EnrollmentStatus, 'neutral' | 'info' | 'ok' | 'bad'> = {
  assigned: 'neutral',
  in_progress: 'info',
  completed: 'ok',
  expired: 'bad',
};

export function categoryLabel(value?: string): string {
  return TRAINING_CATEGORIES.find((c) => c.value === value)?.label ?? '-';
}

export function levelLabel(value?: string): string {
  return TRAINING_LEVELS.find((l) => l.value === value)?.label ?? '-';
}
