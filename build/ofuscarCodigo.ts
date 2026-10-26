/**
 * REAL OBFUSCATION OF THE CRM'S OWN CODE (2026-10-25)
 *
 * Until now the build only minified: shorter names, but every text, e-mail,
 * route and string was readable in the shipped files, and a scraper that
 * walked away with them could read how the CRM is built. This pass runs
 * javascript-obfuscator over every chunk of OUR code after the minifier:
 * names become hex, all strings move to an encoded table, a little control
 * flow is flattened.
 *
 * What it does NOT touch: third-party libraries (vendor-*, the rolldown
 * runtime, the preload helper, workbox) — they are public anyway and
 * obfuscating them only costs size — and import/export specifiers
 * (`ignoreImports`), so lazy routes keep resolving.
 *
 * Measured on a real CRM build (309 own chunks): 8.2 MB → 16 MB raw,
 * 2.6 MB → 4.9 MB gzipped, ~80 s of build time, 0 failures. The heavier
 * profile (control-flow 0.3, numbers to expressions) was 21 MB: not worth it.
 *
 * Off with CG_SIN_OFUSCAR=1 (local debugging only; production always
 * obfuscates — scripts/verificar-build.mjs checks it).
 */
import type { Plugin } from "vite";
import JavaScriptObfuscator from "javascript-obfuscator";

const NO_SE_OFUSCA = /(^|\/)(vendor-|rolldown-runtime|vite-precarga|workbox)/;

export const OPCIONES_DE_OFUSCACION = {
  compact: true,
  target: "browser" as const,
  ignoreImports: true,
  sourceMap: false,
  identifierNamesGenerator: "hexadecimal" as const,
  renameGlobals: false,
  stringArray: true,
  /* URLs stay readable: the build check and the deploy look for the API host
     in the bundle, and it is no secret (every request shows it). */
  reservedStrings: ["^https?://", "^wss?://"],
  stringArrayThreshold: 1,
  stringArrayEncoding: ["base64"] as ("base64")[],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayIndexShift: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersType: "variable" as const,
  stringArrayCallsTransform: false,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.1,
  numbersToExpressions: false,
  simplify: true,
  splitStrings: false,
  deadCodeInjection: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  selfDefending: false,
  debugProtection: false,
};

export function ofuscarCodigo(): Plugin {
  return {
    name: "cg-ofuscar-codigo",
    apply: "build",
    enforce: "post",
    generateBundle(_salida, bundle) {
      if (process.env.CG_SIN_OFUSCAR === "1") {
        this.warn("CG_SIN_OFUSCAR=1: build SIN ofuscar (sólo para depurar en local)");
        return;
      }
      let n = 0;
      for (const [nombre, fichero] of Object.entries(bundle)) {
        if (fichero.type !== "chunk" || NO_SE_OFUSCA.test(nombre)) continue;
        fichero.code = JavaScriptObfuscator.obfuscate(fichero.code, OPCIONES_DE_OFUSCACION).getObfuscatedCode();
        n += 1;
      }
      this.info?.(`ofuscados ${n} ficheros propios`);
    },
  };
}
