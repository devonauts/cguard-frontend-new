#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * SELLAR EL BUILD — integridad de subrecursos (SRI) sobre el index.html.
 *
 * Fase 2 del plan anti-copia. Corre DESPUÉS de `vite build` y hace dos cosas:
 *
 *  1. Le pone a cada <script> y <link> del index.html el `integrity` con el
 *     sha384 del fichero que se va a servir. A partir de ahí el navegador
 *     COMPRUEBA cada recurso antes de ejecutarlo: si el byte no cuadra, no lo
 *     ejecuta. No es un informe, es una garantía — y por eso hay que ser
 *     cuidadoso (ver más abajo).
 *
 *  2. Escribe `<meta name="cg-build">` con un resumen de todos esos hashes.
 *     Es el identificador del build, y sale de los ficheros de verdad, no de
 *     una variable de entorno que alguien puede olvidarse de pasar. El
 *     centinela lo lee de ahí y lo manda en sus avisos.
 *
 * ── LO QUE ESTO **NO** CUBRE, Y HAY QUE SABERLO ────────────────────────────
 * Sólo lo que está ESCRITO en el index.html: el módulo de entrada, la hoja de
 * estilos y los `modulepreload`. Los trozos que se cargan por `import()`
 * dinámico —que en esta aplicación son la mayoría— NO llevan SRI, porque el
 * navegador no tiene dónde leer su hash. Cubrirlos exigiría un mapa de
 * importaciones con integridad, que hoy no soportan todos los navegadores que
 * usan nuestros clientes.
 *
 * O sea: esto detecta que te han tocado la PUERTA de entrada. Lo de dentro lo
 * cubre el centinela (`src/lib/centinela.ts`) y la política de contenido.
 *
 * ── POR QUÉ ES SEGURO PONERLO ──────────────────────────────────────────────
 * El hash se calcula sobre el fichero exacto que se sube, en el mismo paso que
 * lo construye. Si el servidor sirve ese fichero, cuadra siempre. El único
 * modo de que rompa es que algo altere el asset entre el build y el navegador
 * — que es precisamente lo que se quiere detectar.
 *
 * `gzip` de nginx no afecta: el navegador comprueba el contenido descomprimido.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve(process.argv[2] || "dist");
const INDEX = join(DIST, "index.html");

if (!existsSync(INDEX)) {
  console.error(`[sellado] no encuentro ${INDEX} — ¿corrió el build?`);
  process.exit(1);
}

let html = readFileSync(INDEX, "utf8");

/** `/superadmin/assets/x.js` → el fichero dentro de dist, venga con base o sin ella. */
function ficheroDe(url) {
  if (/^https?:|^data:/.test(url)) return null; // externo: no es nuestro, no se sella

  const limpia = url.split("?")[0].split("#")[0];
  const candidatos = [
    join(DIST, limpia),
    join(DIST, limpia.split("/").slice(-2).join("/")),
    join(DIST, limpia.replace(/^\//, "")),
  ];

  return candidatos.find((c) => existsSync(c)) ?? null;
}

function sha384(fichero) {
  return `sha384-${createHash("sha384").update(readFileSync(fichero)).digest("base64")}`;
}

/* ── EL COMMIT, DENTRO DEL PROPIO BUILD ────────────────────────────────────
   Se escribe aquí, en el momento de construir, y NO se lee del repositorio al
   registrar la procedencia. La diferencia importa: estas aplicaciones se
   despliegan construyéndolas en un portátil y subiéndolas por rsync, así que el
   repositorio del servidor puede estar en OTRO commit que el de los ficheros
   publicados. Medido el 2026-09-21: el registro guardó `ee640161` para un
   bundle que salió de `6f037462`.

   Un registro de procedencia con el commit equivocado es PEOR que uno sin
   commit — apunta a un código que no es, y eso delante de un abogado se vuelve
   en contra. Yendo dentro del build, no puede desincronizarse. */
function commitDelBuild() {
  try {
    return execSync("git rev-parse HEAD", { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

const sellos = [];
let sellados = 0;
let saltados = 0;

/* Se recorren las etiquetas de una en una con una expresión sobre el HTML.
   Es un index.html generado por Vite, no un documento arbitrario: son cuatro
   etiquetas en una línea cada una. Meter un parser de HTML entero aquí sería
   una dependencia nueva para resolver un problema que no tenemos. */
html = html.replace(
  /<(script|link)\b([^>]*?)\/?>/g,
  (etiqueta, nombre, atributos) => {
    if (/\bintegrity=/.test(atributos)) return etiqueta; // ya sellada

    const rel = atributos.match(/\brel=["']([^"']+)["']/)?.[1] ?? "";

    // De los <link> sólo se sellan los que el navegador EJECUTA o aplica.
    // Un `icon` o un `manifest` no aceptan integrity y sellarlos rompe.
    if (nombre === "link" && !["stylesheet", "modulepreload", "preload"].includes(rel)) {
      return etiqueta;
    }

    const url = atributos.match(/\b(?:src|href)=["']([^"']+)["']/)?.[1];

    if (!url) return etiqueta; // <script> en línea: lo cubre el hash de la CSP

    const fichero = ficheroDe(url);

    if (!fichero) {
      saltados += 1;

      return etiqueta;
    }

    const hash = sha384(fichero);

    sellos.push(hash);
    sellados += 1;

    /* `crossorigin` es OBLIGATORIO junto a `integrity`: sin él el navegador
       trata la respuesta como opaca y NO ejecuta el recurso. Vite ya lo pone en
       lo suyo; se añade sólo si falta, porque olvidarlo rompe la aplicación
       entera de una forma que no se ve hasta producción. */
    const conCrossorigin = /\bcrossorigin\b/.test(atributos)
      ? atributos
      : `${atributos} crossorigin="anonymous"`;

    const cierre = etiqueta.endsWith("/>") ? "/>" : ">";

    return `<${nombre}${conCrossorigin} integrity="${hash}"${cierre}`;
  },
);

/* El sello del build: resumen de todos los hashes, en orden. Cambia si cambia
   cualquier asset de entrada y no cambia si no cambia nada. */
const sello = createHash("sha256").update(sellos.join("|")).digest("hex").slice(0, 16);

const commit = commitDelBuild();

html = html.replace(
  /<head>/i,
  `<head>\n    <meta name="cg-build" content="${sello}" />` +
    (commit ? `\n    <meta name="cg-commit" content="${commit}" />` : ""),
);

writeFileSync(INDEX, html);

console.log(`[sellado] ${sellados} recurso(s) sellado(s), ${saltados} sin fichero local`);
console.log(`[sellado] build ${sello}${commit ? ` · commit ${commit.slice(0, 10)}` : " · sin commit"}`);

if (sellados === 0) {
  console.error("[sellado] NADA sellado — el index no tiene recursos locales o cambió su forma");
  process.exit(1);
}
