import { describe, expect, it } from "vitest";

import de from "./de.json";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import it_ from "./it.json";
import nl from "./nl.json";
import pl from "./pl.json";
import pt from "./pt.json";

const LOCALES: Record<string, unknown> = { es, en, pt, fr, de, it: it_, nl, pl };

/**
 * A catalog value is shown as it is. A string copied from JS source with its
 * escapes («Invitación») was saved with a literal backslash, so the
 * supervisor sign-up page printed «Invitación no encontrada o
 * inválida.» (QA N-R3-2). Write the real character instead.
 */
function escapesLiterales(node: unknown, path: string, out: string[]) {
  if (typeof node === "string") {
    if (/\\u[0-9a-fA-F]{4}/.test(node)) out.push(`${path}: ${node}`);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) escapesLiterales(v, path ? `${path}.${k}` : k, out);
  }
}

describe("locales · no literal \\uXXXX escapes", () => {
  for (const [lang, catalog] of Object.entries(LOCALES)) {
    it(lang, () => {
      const found: string[] = [];

      escapesLiterales(catalog, "", found);
      expect(found).toEqual([]);
    });
  }
});
