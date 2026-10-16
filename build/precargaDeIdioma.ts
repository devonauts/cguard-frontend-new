import { createHash } from "node:crypto";

import type { Plugin } from "vite";

/**
 * EL DICCIONARIO SE EMPIEZA A BAJAR A LA VEZ QUE EL CÓDIGO.
 *
 * El idioma ya no va dentro del archivo de arranque (ver `src/i18n.ts`): es un
 * trozo aparte que `i18n.ts` pide al ejecutarse. Pero «al ejecutarse» es
 * DESPUÉS de haber bajado y evaluado el arranque — dos descargas en fila donde
 * antes había una. Este plugin las pone en paralelo: añade a `index.html` un
 * guión mínimo (en su propio archivo) que mira qué idioma toca (la misma regla que
 * `idiomaDeArranque`) y deja un `<link rel="modulepreload">` a su archivo.
 *
 * Los nombres llevan huella y sólo se conocen al terminar el build, por eso es
 * un plugin y no una línea fija en el HTML. Si un día no encuentra los trozos
 * no escribe nada: la aplicación funciona igual, sólo sin el adelanto.
 */
const IDIOMAS = ["es", "en", "pt", "fr", "de", "it", "nl", "pl"];

export function precargaDeIdioma(): Plugin {
  return {
    name: "precarga-de-idioma",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const mapa: Record<string, string> = {};

        for (const archivo of Object.keys(ctx.bundle || {})) {
          const m = /^assets\/([a-z]{2})-[\w-]+\.js$/.exec(archivo);

          if (m && IDIOMAS.includes(m[1])) mapa[m[1]] = "/" + archivo;
        }
        if (Object.keys(mapa).length !== IDIOMAS.length) return html;
        const guion =
          `(function(){try{var m=${JSON.stringify(mapa)},` +
          `g=(localStorage.getItem("app_language")||"").slice(0,2).toLowerCase(),` +
          `n=(navigator.language||"").slice(0,2).toLowerCase(),` +
          `u=m[g]||m[n]||m.en,k=document.createElement("link");` +
          `k.rel="modulepreload";k.href=u;document.head.appendChild(k)}catch(e){}})();`;
        /* EN UN ARCHIVO, NO EN LÍNEA. La política de contenido del panel
           lleva la huella del único guión en línea del index.html; uno nuevo
           —y con contenido distinto en cada build— daría un aviso de política
           en cada carga de cada usuario. Como archivo propio entra por
           `script-src 'self'`, igual que el resto del código. */
        const huella = createHash("sha256").update(guion).digest("hex").slice(0, 8);
        const fileName = `assets/precarga-idioma-${huella}.js`;

        /* Se EMITE con `emitFile`. Vite 8 compila con Rolldown, que ignora
           (sólo avisa) lo que se asigna a mano en `ctx.bundle`: el script
           salía en el HTML y su archivo no, un 404 en cada carga. Este hook
           corre dentro del `generateBundle` de vite:build-html, así que
           `this` es su contexto de plugin y tiene `emitFile`. */
        const contexto = this as unknown as {
          emitFile(archivo: {
            type: "asset";
            fileName: string;
            source: string;
          }): string;
        };

        contexto.emitFile({ type: "asset", fileName, source: guion });

        return {
          html,
          tags: [
            { tag: "script", attrs: { src: "/" + fileName }, injectTo: "head" },
          ],
        };
      },
    },
  };
}
