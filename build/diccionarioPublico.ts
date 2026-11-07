/**
 * THE PUBLIC APP ONLY CARRIES ITS OWN TEXTS (2026-10-26)
 *
 * The public mini-app (`/p/`: sign-in, invitations, password reset…) is what
 * anyone gets without signing in. It used to download the WHOLE CRM
 * dictionary of its language (~1 MB, every screen of the panel): a readable
 * map of every module, menu and error the CRM has, handed to strangers.
 *
 * This plugin (public build only, see vite.publico.config.ts) replaces each
 * `src/locales/<lang>.json` with the keys the public screens can reach:
 *
 *   1. buildStart: walk the import graph from the public entry (static,
 *      re-exports and dynamic `import()`), resolving `@/` and relative paths;
 *   2. every string literal in those files that names a dictionary key is
 *      kept: `t("a.b")`, but also the tables that hold keys and translate
 *      them later (`label: "invite.rule.len"`, `tituloKey: …`). A literal
 *      naming a subtree keeps the subtree (returnObjects, keyPrefix); plural
 *      forms (`_one`, `_other`…) travel with their key;
 *   3. `diccionarioPublico.extras.ts` adds keys that are built at runtime and
 *      therefore invisible to the scan (empty today: the scan found none);
 *   4. generateBundle: THE CHECK. For every source module the real build put
 *      in the bundle, its keys must be in the filtered dictionary. If the
 *      walk in (1) missed a file, or a new public screen uses a key the scan
 *      cannot see, the build fails instead of shipping raw keys.
 *
 * The CRM build (vite.config.ts) does not use this plugin and is unchanged.
 */
import fs from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

import { CLAVES_EXTRA } from "./diccionarioPublico.extras";

type Dicc = Record<string, unknown>;

const EXTENSIONES = [".tsx", ".ts", ".jsx", ".js"];
const IMPORTACION =
  /(?:\bimport\s*(?:[^'"()]*?\bfrom\s*)?|\bexport\s+[^'"()]*?\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;
const LITERAL = /["'`]([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)["'`]/g;
// The same pattern as src/locales/clavesUsadas.test.ts: keys the code
// certainly asks for (used by the check to also catch keys the dictionary
// lacks entirely).
const CLAVE_SEGURA =
  /(?:\bt\(\s*|\bi18nKey=\{?\s*|\bconEtiqueta\(\s*|\blabelKey\s*:\s*)["']([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)["']/g;
// A key BUILT at runtime: t(`publico.accesoNegado.${motivo}.titulo`). The scan
// cannot know the final key, but it knows the fixed part before `${`: that
// subtree has to be in the public dictionary (via diccionarioPublico.extras),
// or the screen shows raw keys (2026-11-06, the «in review» screen).
const CLAVE_DINAMICA = /\bt\(\s*`([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*)\.\$\{/g;
const PLURAL = /^(.*)_(zero|one|two|few|many|other|plural)$/;
const LOCALE = /[\\/]src[\\/]locales[\\/]([a-z]{2})\.json$/;

const esObjeto = (v: unknown): v is Dicc =>
  !!v && typeof v === "object" && !Array.isArray(v);

function resolver(src: string, desde: string, spec: string): string | null {
  let base: string;

  if (spec.startsWith("@/")) base = path.join(src, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(desde), spec);
  else return null; // a package: it does not call our t()

  if (fs.existsSync(base) && fs.statSync(base).isFile())
    return /\.(tsx?|jsx?)$/.test(base) ? base : null;
  for (const e of EXTENSIONES) if (fs.existsSync(base + e)) return base + e;
  for (const e of EXTENSIONES) {
    const i = path.join(base, "index" + e);

    if (fs.existsSync(i)) return i;
  }

  return null;
}

/** Every source file reachable from `entrada`. */
export function grafoPublico(src: string, entrada: string): Set<string> {
  const vistos = new Set<string>();
  const cola = [entrada];

  while (cola.length) {
    const f = cola.pop()!;

    if (vistos.has(f)) continue;
    vistos.add(f);
    const texto = fs.readFileSync(f, "utf8");

    for (const m of texto.matchAll(IMPORTACION)) {
      const r = resolver(src, f, m[1]);

      if (r && !vistos.has(r)) cola.push(r);
    }
  }

  return vistos;
}

function nodo(d: Dicc, ruta: string): unknown {
  let n: unknown = d;

  for (const p of ruta.split(".")) {
    if (!esObjeto(n) || !(p in n)) return undefined;
    n = n[p];
  }

  return n;
}

/**
 * The dictionary paths a piece of source names. A one-word literal only
 * counts when it is a leaf: "auth" in the code is far more likely an ordinary
 * word than a request for the whole `auth` subtree.
 */
export function clavesDeFuente(texto: string, d: Dicc): Set<string> {
  const out = new Set<string>();

  for (const m of texto.matchAll(LITERAL)) {
    const k = m[1];
    const n = nodo(d, k);

    if (n !== undefined) {
      if (!esObjeto(n) || k.includes(".")) out.add(k);
      continue;
    }
    // Only plural forms exist (`a.b_one`, `a.b_other`): the base key is the request.
    const i = k.lastIndexOf(".");
    const padre = i < 0 ? d : nodo(d, k.slice(0, i));
    const hoja = i < 0 ? k : k.slice(i + 1);

    if (
      esObjeto(padre) &&
      Object.keys(padre).some((h) => PLURAL.exec(h)?.[1] === hoja)
    )
      out.add(k);
  }

  return out;
}

/** A copy of `d` with only `claves` (leaves, subtrees and their plural forms). */
export function filtrar(d: Dicc, claves: Iterable<string>): Dicc {
  const out: Dicc = {};

  for (const k of claves) {
    const partes = k.split(".");
    const hoja = partes.pop()!;
    let origen: unknown = d;
    let destino = out;
    let ok = true;

    for (const p of partes) {
      if (!esObjeto(origen) || !esObjeto(origen[p])) {
        ok = false;
        break;
      }
      origen = origen[p];
      if (!esObjeto(destino[p])) destino[p] = {};
      destino = destino[p] as Dicc;
    }
    if (!ok || !esObjeto(origen)) continue;
    for (const [h, v] of Object.entries(origen)) {
      if (h !== hoja && PLURAL.exec(h)?.[1] !== hoja) continue;
      destino[h] = esObjeto(v) ? JSON.parse(JSON.stringify(v)) : v;
    }
  }

  return out;
}

/** Is `k` (or a plural form of it) present in `d`? */
/** Every leaf key under `v` (a subtree of the dictionary), with its full path. */
function hojas(v: unknown, prefijo: string): string[] {
  if (!esObjeto(v)) return [prefijo];

  return Object.entries(v).flatMap(([k, h]) => hojas(h, `${prefijo}.${k}`));
}

function contiene(d: Dicc, k: string): boolean {
  if (nodo(d, k) !== undefined) return true;
  const i = k.lastIndexOf(".");
  const padre = i < 0 ? d : nodo(d, k.slice(0, i));
  const hoja = i < 0 ? k : k.slice(i + 1);

  return (
    esObjeto(padre) && Object.keys(padre).some((h) => PLURAL.exec(h)?.[1] === hoja)
  );
}

export function diccionarioPublico({
  raiz,
  entrada = "src/publico/main.tsx",
  referencia = "es",
}: {
  raiz: string;
  entrada?: string;
  /** The language whose structure decides the keys (all eight are in parity). */
  referencia?: string;
}): Plugin {
  const src = path.join(raiz, "src");
  const locales = path.join(src, "locales");
  let claves = new Set<string>();
  let archivos = new Set<string>();
  let completo: Dicc = {};
  let filtrado: Dicc = {};
  const medidas: string[] = [];

  return {
    name: "cg-diccionario-publico",
    enforce: "pre",
    buildStart() {
      completo = JSON.parse(
        fs.readFileSync(path.join(locales, `${referencia}.json`), "utf8"),
      );
      archivos = grafoPublico(src, path.join(raiz, entrada));
      claves = new Set<string>(CLAVES_EXTRA);
      for (const f of archivos) {
        if (LOCALE.test(f)) continue;
        for (const k of clavesDeFuente(fs.readFileSync(f, "utf8"), completo))
          claves.add(k);
      }
      filtrado = filtrar(completo, claves);
    },
    load(id) {
      const m = LOCALE.exec(id.split("?")[0]);

      if (!m) return null;
      const bruto = fs.readFileSync(path.join(locales, `${m[1]}.json`), "utf8");
      const salida = JSON.stringify(filtrar(JSON.parse(bruto), claves));

      medidas.push(
        `${m[1]} ${Math.round(bruto.length / 1024)} kB → ${Math.round(salida.length / 1024)} kB`,
      );

      return salida;
    },
    generateBundle(_o, bundle) {
      // Source modules that really are in the public bundle.
      const enElBundle = new Set<string>();

      for (const c of Object.values(bundle))
        if (c.type === "chunk")
          for (const id of c.moduleIds ?? Object.keys((c as any).modules ?? {}))
            enElBundle.add(id.split("?")[0]);

      const faltan: string[] = [];
      const sinTraduccion: string[] = [];

      for (const id of enElBundle) {
        if (!id.startsWith(src + path.sep) || LOCALE.test(id)) continue;
        if (!/\.(tsx?|jsx?)$/.test(id) || !fs.existsSync(id)) continue;
        const texto = fs.readFileSync(id, "utf8");
        const rel = path.relative(raiz, id);

        for (const k of clavesDeFuente(texto, completo))
          if (!contiene(filtrado, k)) faltan.push(`${k}  (${rel})`);
        // The WHOLE subtree, not just its parent: `publico.accesoNegado` existed
        // (its buttons are literal keys) while every title and text was missing.
        for (const m of texto.matchAll(CLAVE_DINAMICA))
          for (const hoja of hojas(nodo(completo, m[1]), m[1]))
            if (!contiene(filtrado, hoja)) faltan.push(`${hoja}  (${rel}, built at runtime)`);
        for (const m of texto.matchAll(CLAVE_SEGURA))
          if (!contiene(completo, m[1])) sinTraduccion.push(`${m[1]}  (${rel})`);
      }

      if (faltan.length)
        this.error(
          `[diccionario-publico] ${faltan.length} keys used by the public app are not in its dictionary ` +
            `(a file the import walk missed, or a key built at runtime: add it to build/diccionarioPublico.extras.ts):\n  ` +
            [...new Set(faltan)].slice(0, 40).join("\n  "),
        );
      if (sinTraduccion.length)
        this.warn(
          `[diccionario-publico] keys missing from the dictionary itself (clavesUsadas.test catches these):\n  ` +
            [...new Set(sinTraduccion)].slice(0, 20).join("\n  "),
        );
      this.info?.(
        `[diccionario-publico] ${claves.size} keys from ${archivos.size} files · ${medidas.join(" · ")}`,
      );
      // eslint-disable-next-line no-console
      console.log(
        `[diccionario-publico] ${claves.size} keys from ${archivos.size} files · ${medidas.join(" · ")}`,
      );
    },
  };
}
