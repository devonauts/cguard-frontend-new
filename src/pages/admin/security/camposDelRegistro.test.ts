import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * «Registros del sistema» names the changed fields through
 * `ui.SystemLogs.campos.<field>`; a field in CAMPOS_CONOCIDOS without a
 * translation showed the English identifier in every language (QA r4:
 * «last message preview», «total cents»…).
 */
const fuente = readFileSync(resolve(__dirname, "SystemLogs.tsx"), "utf8");
const bloque = fuente.match(/const CAMPOS_CONOCIDOS = new Set\(\[([\s\S]*?)\]\);/);
const campos = [...(bloque?.[1] ?? "").matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
const IDIOMAS = ["es", "en", "pt", "fr", "de", "it", "nl", "pl"];

describe("SystemLogs · field names", () => {
  it("finds the list", () => {
    expect(campos.length).toBeGreaterThan(40);
    expect(campos).toContain("lastMessagePreview");
    expect(campos).toContain("totalCents");
  });

  it.each(IDIOMAS)("every known field has a label in %s", (idioma) => {
    const dic = JSON.parse(
      readFileSync(resolve(__dirname, `../../../locales/${idioma}.json`), "utf8"),
    );
    const etiquetas = dic.ui.SystemLogs.campos as Record<string, string>;
    const faltan = campos.filter((c) => !etiquetas[c] || !etiquetas[c].trim());

    expect(faltan).toEqual([]);
  });
});
