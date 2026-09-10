/**
 * The ONE way to label a station (puesto) in operator-facing UI.
 *
 * A station carries two identities and only one of them is unique:
 *   - `stationName` → the descriptive name ("Caseta Principal"). NOT unique —
 *     a single tenant routinely has several posts with the same name across
 *     different sites.
 *   - `nickname`    → the internal call-sign, the "nominativo" ("P-031"). This
 *     is what operations, radio traffic and the supervisors actually use, and
 *     it IS unique.
 *
 * A destination picker showing "Caseta Principal" four times identifies nothing
 * and invites sending a vigilante to the wrong post. Always route station labels
 * through this helper so the nominativo leads.
 */
export interface StationLike {
  stationName?: string | null;
  nickname?: string | null;
}

/** "P-031 · Caseta Principal" — nominativo first, as operations says it. */
export function stationLabel(s?: StationLike | null): string {
  if (!s) return "—";

  return [s.nickname, s.stationName].filter(Boolean).join(" · ") || "—";
}

/**
 * The nominativo on its own, for tight spaces (narrow grid sub-columns) where
 * the full label cannot fit. Falls back to the name when a station has no
 * call-sign yet, so nothing ever renders blank.
 */
export function stationShort(s?: StationLike | null): string {
  if (!s) return "—";

  return s.nickname || s.stationName || "—";
}
