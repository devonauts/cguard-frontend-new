/**
 * Report privacy (Configuración › Informes) for the reports the browser builds.
 *
 * - `guardName` columns are dropped everywhere (screen and files), as before.
 * - Client, site and station names stay on screen (the admin needs them to
 *   work) but are replaced by «Cliente 1», «Sede 2», «Puesto 3»… in every file
 *   that leaves the CRM: Excel, PDF, CSV and print. Same rule as the server
 *   (clientReportGenerator `redactColumns`): the column stays, the name goes,
 *   and two different names never share a pseudonym.
 */

export type PrivacyMark = "guardName" | "clientName" | "siteName" | "stationName";

/** Name kinds that are pseudonymized (not dropped) in exported files. */
export type MaskedKind = Exclude<PrivacyMark, "guardName">;

/** Passes one name of a cell through the privacy rule of its kind. */
export type NameMask = (kind: MaskedKind, name: string | null | undefined) => string;

export type HiddenNames = Record<PrivacyMark, boolean>;

export const NOTHING_HIDDEN: HiddenNames = {
  guardName: false,
  clientName: false,
  siteName: false,
  stationName: false,
};

/**
 * Settings → which marks are hidden. A post site (sede) is the client's
 * premises and its name usually names the client («Condominio Los Álamos»), so
 * it obeys «Ocultar el nombre del cliente».
 */
export function hiddenFromSettings(rs: any): HiddenNames {
  return {
    guardName: !!rs?.hideGuardName,
    clientName: !!rs?.hideClientName,
    siteName: !!rs?.hideClientName,
    stationName: !!rs?.hideStationName,
  };
}

/** The screen shows every name as it is. */
export const showName: NameMask = (_kind, name) => (name == null ? "" : String(name));

/** The mask of one file: names → aliases, plus the same aliases inside text. */
export type FileNameMask = NameMask & {
  /**
   * Replaces, inside free text, every hidden name this file already knows
   * (whole-word, case-insensitive, exact) by its alias. The guard app fills
   * an incident's «Ubicación» — and so its «Título» — with the post name.
   */
  inText: (text: string) => string;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A mask for ONE file: the numbering starts at 1 per kind and follows the
 * order in which the names first appear, so the same name always gets the same
 * pseudonym inside the file.
 */
export function createNameMask(
  hidden: HiddenNames,
  labels: Record<MaskedKind, string>,
): FileNameMask {
  const aliases: Record<MaskedKind, Map<string, string>> = {
    clientName: new Map(),
    siteName: new Map(),
    stationName: new Map(),
  };

  const mask = (kind: MaskedKind, name: string | null | undefined) => {
    const raw = name == null ? "" : String(name);

    // Placeholders («—») and empty cells are not names.
    if (!hidden[kind] || !raw.trim() || raw.trim() === "—" || raw.trim() === "-") return raw;
    const map = aliases[kind];
    let alias = map.get(raw);

    if (!alias) {
      alias = `${labels[kind]} ${map.size + 1}`;
      map.set(raw, alias);
    }

    return alias;
  };

  const inText = (text: string) => {
    let out = text == null ? "" : String(text);
    // Longest first, so «Garita Principal Norte» wins over «Garita Principal».
    const pairs = (Object.keys(aliases) as MaskedKind[])
      .flatMap((k) => Array.from(aliases[k], ([name, alias]) => [name.trim(), alias]))
      .filter(([name]) => name.length > 1)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [name, alias] of pairs) {
      out = out.replace(
        new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu"),
        alias,
      );
    }

    return out;
  };

  return Object.assign(mask, { inText });
}

interface MarkedColumn<T> {
  privacy?: PrivacyMark;
  /** Free text that may contain the row's names (see FileNameMask.inText). */
  freeText?: boolean;
  value: (row: T, mask?: NameMask) => string;
}

/** Drops the guard-name columns when that switch is on. */
export function visibleColumns<C extends { privacy?: PrivacyMark }>(
  columns: C[],
  hidden: HiddenNames,
): C[] {
  return hidden.guardName ? columns.filter((c) => c.privacy !== "guardName") : columns;
}

/**
 * The value of a cell in an exported file. A column marked with a masked kind
 * is pseudonymized whole; a column that joins several names («Sede · Cliente»)
 * receives the mask and applies it to each part itself.
 */
export function exportValue<T>(column: MarkedColumn<T>, row: T, mask: FileNameMask): string {
  const kind = column.privacy;

  if (kind && kind !== "guardName") return mask(kind, column.value(row, showName));
  if (column.freeText) return mask.inText(column.value(row, showName));

  return column.value(row, mask);
}

/**
 * Teaches a file's mask every hidden name of its rows BEFORE any cell is
 * written, so a name that only appears in free text — or appears there before
 * its own column — still gets the same alias as in the name columns.
 */
export function learnNames<T>(
  mask: FileNameMask,
  rows: T[],
  namesOf?: (row: T) => Array<[MaskedKind, string | null | undefined]>,
): void {
  if (!namesOf) return;
  for (const row of rows) for (const [kind, name] of namesOf(row)) mask(kind, name);
}
