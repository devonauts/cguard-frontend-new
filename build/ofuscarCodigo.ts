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
import { createHash } from "node:crypto";

/**
 * ONE NAME, ONE CONTENT (2026-10-26 incident).
 *
 * The file name's hash is computed BEFORE this pass, and the obfuscator used
 * to be random: two builds of the same code gave the same name with different
 * bytes. index.html pins every file with SRI (integrity), and /p/ is cached for
 * a year by Cloudflare and by browsers, so after a rebuild the edge kept
 * serving the morning's bytes under the evening's name: integrity failed and
 * the CRM sign-in page was blank for every new visitor.
 *
 *   · The seed now comes from the chunk's own code: same code, same output.
 *   · The names carry VERSION_DE_OFUSCACION. Bump it whenever the output can
 *     change for the same code (these options, or a javascript-obfuscator
 *     upgrade): every file gets a new name and no cache can hold the old bytes.
 */
export const VERSION_DE_OFUSCACION = "2";

function semillaDe(codigo: string): number {
  return parseInt(createHash("sha256").update(codigo).digest("hex").slice(0, 8), 16);
}

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
  let apiUrl = "";
  return {
    name: "cg-ofuscar-codigo",
    apply: "build",
    enforce: "post",
    // The obfuscation version goes into every JS file name (see VERSION_DE_OFUSCACION).
    outputOptions(salida: any) {
      for (const clave of ["entryFileNames", "chunkFileNames"]) {
        const actual = salida[clave] ?? "assets/[name]-[hash].js";
        if (typeof actual === "string" && actual.includes("[hash]") && !actual.includes(`-o${VERSION_DE_OFUSCACION}`)) {
          salida[clave] = actual.replace("[hash]", `[hash]-o${VERSION_DE_OFUSCACION}`);
        }
      }
      return salida;
    },
    configResolved(config) {
      apiUrl = String(config.env?.VITE_API_URL || process.env.VITE_API_URL || "");
    },
    generateBundle(_salida, bundle) {
      /* The minifier writes every string as a template literal (`…`) and the
         obfuscator encodes those even when reservedStrings matches, so the API
         URL can no longer be found by grepping the shipped code. Check it here,
         in the PLAIN code, and leave the proof in cg-api.json for
         scripts/verificar-build.mjs and the deploy script. */
      if (apiUrl) {
        let origen = "";
        try { origen = new URL(apiUrl).origin; } catch { /* relative base: nothing to check */ }
        const presente = !origen || Object.values(bundle).some((f) => f.type === "chunk" && f.code.includes(origen));
        this.emitFile({ type: "asset", fileName: "cg-api.json", source: JSON.stringify({ api: apiUrl, enElCodigo: presente }) + "\n" });
      }
      if (process.env.CG_SIN_OFUSCAR === "1") {
        this.warn("CG_SIN_OFUSCAR=1: build SIN ofuscar (sólo para depurar en local)");
        return;
      }
      let n = 0;
      for (const [nombre, fichero] of Object.entries(bundle)) {
        if (fichero.type !== "chunk" || NO_SE_OFUSCA.test(nombre)) continue;
        fichero.code = JavaScriptObfuscator.obfuscate(fichero.code, {
          ...OPCIONES_DE_OFUSCACION,
          seed: semillaDe(fichero.code),
        }).getObfuscatedCode();
        n += 1;
      }
      this.info?.(`ofuscados ${n} ficheros propios`);
    },
  };
}
