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

/**
 * A mask for ONE file: the numbering starts at 1 per kind and follows the
 * order in which the names first appear, so the same name always gets the same
 * pseudonym inside the file.
 */
export function createNameMask(
  hidden: HiddenNames,
  labels: Record<MaskedKind, string>,
): NameMask {
  const aliases: Record<MaskedKind, Map<string, string>> = {
    clientName: new Map(),
    siteName: new Map(),
    stationName: new Map(),
  };

  return (kind, name) => {
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
}

interface MarkedColumn<T> {
  privacy?: PrivacyMark;
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
export function exportValue<T>(column: MarkedColumn<T>, row: T, mask: NameMask): string {
  const kind = column.privacy;

  if (kind && kind !== "guardName") return mask(kind, column.value(row, showName));

  return column.value(row, mask);
}
