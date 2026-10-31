/**
 * ARCHIVED ROTATION PATTERNS IN THE PICKERS.
 *
 * Configuración › Patrones de rotación can archive a pattern that stations or
 * assignments still use. Pickers fetch every pattern (`includeArchived=1`) so
 * the one already chosen still resolves and shows, marked «archivado», but an
 * archived pattern is never offered as a NEW choice.
 */
export const urlDePatrones = (tenantId: string) =>
  `/tenant/${tenantId}/rotation-styles?includeArchived=1`;

export const esArchivado = (s: any): boolean => !!s?.archivedAt;

/** Active patterns plus the ones already chosen (even if archived). */
export function vigentesYElegidos<T extends { id: any }>(
  rows: T[],
  elegidos: Array<string | null | undefined>,
): T[] {
  const keep = new Set(elegidos.filter(Boolean).map(String));

  return rows.filter((r) => !esArchivado(r) || keep.has(String(r.id)));
}
