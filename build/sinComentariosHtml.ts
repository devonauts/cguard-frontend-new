import type { Plugin } from "vite";

/**
 * Quita los comentarios del `index.html` SERVIDO. Sólo en producción.
 *
 * ── POR QUÉ ───────────────────────────────────────────────────────────────
 * Vite conserva los comentarios HTML tal cual, así que todo lo que explica ese
 * archivo viaja al navegador. En un producto de marca blanca eso es una costura:
 * quien abra «ver código fuente» en el anfitrión de un socio encuentra el nombre
 * de la plataforma escrito en los comentarios — incluido, irónicamente, el que
 * explica por qué se retiraron las etiquetas de marca.
 *
 * Los comentarios siguen en el fuente, que es donde sirven. Lo que deja de
 * existir es la copia que se descarga cada visitante.
 *
 * En desarrollo NO se aplica: ahí estorbaría leer el HTML servido.
 *
 * ── POR QUÉ VIVE EN SU PROPIO FICHERO ─────────────────────────────────────
 * `vite.config.ts` está vigilado por `tests/unit/security/integridadDeBuild.ts`
 * del backend, que mide su tamaño: un fichero de configuración que engorda de
 * golpe es la firma de la inyección del 2026-08-16. Sacar esto aquí mantiene la
 * configuración pequeña, y este fichero está en esa MISMA lista de vigilancia.
 *
 * No hace nada más que reemplazar texto. Ni red, ni procesos, ni `eval`.
 */
export function sinComentariosHtml(): Plugin {
  return {
    name: "cg-sin-comentarios-en-el-html",
    apply: "build",
    transformIndexHtml(html: string) {
      // Se respetan los condicionales de IE y los marcadores de herramientas
      // (`<!--[if`, `<!--#`), por si algún día vuelve alguno.
      return html.replace(/<!--(?!\[if|#)[\s\S]*?-->/g, "");
    },
  };
}

export default sinComentariosHtml;
