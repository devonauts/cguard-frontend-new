import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every key the code asks for exists in every language.
 *
 * A missing key does not fail loudly: i18next shows the Spanish default written
 * in the code, so an English (or Polish…) screen silently mixes in Spanish.
 * That is exactly how the welcome wizard and 500+ other strings ended up
 * half-translated. This walks the source and checks each literal key.
 */

const RAIZ = path.resolve(__dirname, "..");
const IDIOMAS = ["es", "en", "pt", "fr", "de", "it", "nl", "pl"];

function aplanar(d: Record<string, unknown>, p = "", o: Set<string> = new Set()) {
  for (const [k, v] of Object.entries(d)) {
    const kk = p ? `${p}.${k}` : k;

    if (v && typeof v === "object") aplanar(v as Record<string, unknown>, kk, o);
    else o.add(kk);
  }

  return o;
}

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);

    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "locales") continue;
      archivos(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)) {
      out.push(p);
    }
  }

  return out;
}

// t("a.b"), i18n.t("a.b"), <Trans i18nKey="a.b">, and the label tables
// (conEtiqueta("a.b"), labelKey: "a.b") that are translated at render time.
const CLAVE =
  /(?:\bt\(\s*|\bi18nKey=\{?\s*|\bconEtiqueta\(\s*|\blabelKey\s*:\s*)["']([A-Za-z0-9_\-]+(?:\.[A-Za-z0-9_\-]+)+)["']/g;

describe("i18n · every key used in the code exists in every language", () => {
  const usadas = new Map<string, string>();

  for (const f of archivos(RAIZ)) {
    const s = fs.readFileSync(f, "utf8");

    for (const m of s.matchAll(CLAVE)) {
      if (!usadas.has(m[1])) usadas.set(m[1], path.relative(RAIZ, f));
    }
  }

  for (const idioma of IDIOMAS) {
    it(idioma, () => {
      const claves = aplanar(
        JSON.parse(fs.readFileSync(path.join(RAIZ, "locales", `${idioma}.json`), "utf8")),
      );
      const faltan = [...usadas.entries()]
        .filter(([k]) => !claves.has(k) && !claves.has(`${k}_other`))
        .map(([k, f]) => `${k}  (${f})`);

      expect(faltan).toEqual([]);
    });
  }
});
