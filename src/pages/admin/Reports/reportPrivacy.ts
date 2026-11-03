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

/**
 * Site and station names inside FREE TEXT (incident location, title,
 * description). Off for now (owner, 2026-11-02: «no ocultar por el momento»):
 * whole-word matching also hid ordinary words that equal a place name — a
 * site called «Prueba» turned every «prueba» into «Sede 21». Name columns
 * (Sede, Puesto) are still pseudonymized and client names are still hidden
 * in text. Set to true to hide place names in text again.
 */
export const HIDE_PLACE_NAMES_IN_TEXT = false;

/** Kinds that name a place, not a person or a company. */
const PLACE_KINDS: ReadonlySet<MaskedKind> = new Set<MaskedKind>(["siteName", "stationName"]);

export interface NameMaskOptions {
  /** Also hide site/station names inside free text. Default: HIDE_PLACE_NAMES_IN_TEXT. */
  placeNamesInText?: boolean;
}

export interface InTextOptions {
  /** Hide site/station names in this text whatever the file's default: the
   *  text IS a place (the incident's «Ubicación», which the guard app fills
   *  with the post's name). */
  placeNames?: boolean;
}

/** The screen shows every name as it is. */
export const showName: NameMask = (_kind, name) => (name == null ? "" : String(name));

/** The mask of one file: names → aliases, plus the same aliases inside text. */
export type FileNameMask = NameMask & {
  /**
   * Replaces, inside free text, every hidden name this file knows by its
   * alias. Whole words only; case, accents and repeated spaces do not matter
   * («Condominio Los Alamos», «Garita  Principal»); the original span is what
   * is replaced. Site and station names only when `placeNamesInText` is on
   * (see HIDE_PLACE_NAMES_IN_TEXT).
   */
  inText: (text: string, options?: InTextOptions) => string;
  /** Gives `name` the alias of `sameAs` (a station's call-sign «Alfa 1» is
   *  hidden as the same «Puesto 3» as the station). */
  alias: (kind: MaskedKind, name: string | null | undefined, sameAs: string) => void;
};

const MARCAS = /[\u0300-\u036f]/g;
const LETRA = /[\p{L}\p{N}]/u;

/** Lower case, no accents, one space for any run of white space. */
export const plegar = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(MARCAS, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * The folded text plus, for each folded character, the span of the original
 * it came from — so a match found accent-blind replaces the ORIGINAL text.
 */
function plegarConMapa(text: string) {
  let plain = "";
  const desde: number[] = [];
  const hasta: number[] = [];
  let i = 0;

  for (const ch of text) {
    const fin = i + ch.length;

    if (/\s/.test(ch)) {
      if (plain.endsWith(" ")) hasta[hasta.length - 1] = fin;
      else {
        plain += " ";
        desde.push(i);
        hasta.push(fin);
      }
    } else {
      for (const c of ch.normalize("NFD").replace(MARCAS, "").toLowerCase()) {
        plain += c;
        desde.push(i);
        hasta.push(fin);
      }
    }
    i = fin;
  }

  return { plain, desde, hasta };
}

/** Cuts a cell AFTER masking, so a name split by the cut is never half shown. */
export const recortar = (s: string, max?: number) =>
  max && s.length > max ? `${s.slice(0, max)}…` : s;

/**
 * A mask for ONE file: the numbering starts at 1 per kind and follows the
 * order in which the names first appear, so the same name always gets the same
 * pseudonym inside the file.
 */
export function createNameMask(
  hidden: HiddenNames,
  labels: Record<MaskedKind, string>,
  { placeNamesInText = HIDE_PLACE_NAMES_IN_TEXT }: NameMaskOptions = {},
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

  const inText = (text: string, options: InTextOptions = {}) => {
    const original = text == null ? "" : String(text);
    const places = options.placeNames ?? placeNamesInText;
    // Longest first, so «Garita Principal Norte» wins over «Garita Principal».
    const pairs = (Object.keys(aliases) as MaskedKind[])
      .filter((k) => hidden[k] && (places || !PLACE_KINDS.has(k)))
      .flatMap((k) => Array.from(aliases[k], ([name, alias]) => [plegar(name), alias]))
      .filter(([name]) => name.length > 1)
      .sort((a, b) => b[0].length - a[0].length);

    if (!pairs.length || !original) return original;
    const { plain, desde, hasta } = plegarConMapa(original);
    const tomado = new Array<boolean>(plain.length).fill(false);
    const cambios: Array<{ a: number; b: number; alias: string }> = [];

    for (const [name, alias] of pairs) {
      let at = plain.indexOf(name);

      while (at >= 0) {
        const end = at + name.length;
        const borde =
          (at === 0 || !LETRA.test(plain[at - 1])) &&
          (end >= plain.length || !LETRA.test(plain[end]));
        let libre = borde;

        for (let k = at; libre && k < end; k++) libre = !tomado[k];
        if (libre) {
          for (let k = at; k < end; k++) tomado[k] = true;
          cambios.push({ a: desde[at], b: hasta[end - 1], alias });
        }
        at = plain.indexOf(name, at + 1);
      }
    }
    if (!cambios.length) return original;
    cambios.sort((x, y) => x.a - y.a);
    let out = "";
    let cursor = 0;

    for (const c of cambios) {
      out += original.slice(cursor, c.a) + c.alias;
      cursor = c.b;
    }

    return out + original.slice(cursor);
  };

  const alias = (kind: MaskedKind, name: string | null | undefined, sameAs: string) => {
    const raw = name == null ? "" : String(name);

    if (!hidden[kind] || !raw.trim() || aliases[kind].has(raw)) return;
    aliases[kind].set(raw, mask(kind, sameAs));
  };

  return Object.assign(mask, { inText, alias });
}

interface MarkedColumn<T> {
  privacy?: PrivacyMark;
  /** Free text that may contain the row's names (see FileNameMask.inText). */
  freeText?: boolean;
  /**
   * Text that names a place (an incident's «Ubicación» holds the post's name).
   * Site and station names are hidden in it even while place names in other
   * free text are kept (HIDE_PLACE_NAMES_IN_TEXT): otherwise the post hidden
   * in the «Puesto» column showed in clear in the column next to it.
   */
  placeText?: boolean;
  /** Characters shown before «…» — applied AFTER masking. */
  maxChars?: number;
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
  if (column.placeText)
    return recortar(mask.inText(column.value(row, showName), { placeNames: true }), column.maxChars);
  if (column.freeText) return recortar(mask.inText(column.value(row, showName)), column.maxChars);

  return recortar(column.value(row, mask), column.maxChars);
}

/**
 * Teaches a file's mask every hidden name of its rows BEFORE any cell is
 * written, so a name that only appears in free text — or appears there before
 * its own column — still gets the same alias as in the name columns.
 */
export function learnNames<T>(
  mask: FileNameMask,
  rows: T[],
  namesOf?: (row: T) => Array<[MaskedKind, string | null | undefined, string?]>,
): void {
  if (!namesOf) return;
  for (const row of rows)
    for (const [kind, name, sameAs] of namesOf(row)) {
      if (sameAs) mask.alias(kind, name, sameAs);
      else mask(kind, name);
    }
}

/** Every client / site / station name of the company (GET report/private-names). */
export interface CompanyNames {
  clients?: Array<{ name?: string | null; lastName?: string | null; commercialName?: string | null }>;
  sites?: Array<{ name?: string | null }>;
  stations?: Array<{ name?: string | null; nickname?: string | null }>;
}

/**
 * Teaches the mask the company's whole list — names that have no row in the
 * file still appear in free text («Otro puesto: Puerta Norte (Charlie 3)») —
 * and each station's call-sign with the station's own alias.
 */
export function learnCompanyNames(mask: FileNameMask, names?: CompanyNames | null): void {
  if (!names) return;
  for (const c of names.clients || []) {
    const full = [c.name, c.lastName].filter(Boolean).join(" ");

    if (full) mask("clientName", full);
    if (c.name && c.name !== full) mask.alias("clientName", c.name, full);
    if (c.commercialName) mask.alias("clientName", c.commercialName, full || c.commercialName);
  }
  for (const s of names.sites || []) if (s.name) mask("siteName", s.name);
  for (const s of names.stations || []) {
    if (!s.name) continue;
    mask("stationName", s.name);
    if (s.nickname) mask.alias("stationName", s.nickname, s.name);
  }
}
