/**
 * LA MINI-APLICACIÓN PÚBLICA (`/p/`) — segundo build, DESPUÉS del del CRM.
 *
 * Misma configuración que `vite.config.ts` (alias, grupos de librerías,
 * minificado y lo que se le añada, como el ofuscado) MENOS el service worker:
 * la parte pública no instala ninguno. Sale a `dist/p/`, sin tocar el resto de
 * `dist`; `scripts/publico-index.mjs` renombra el HTML a `dist/p/index.html` y
 * comprueba que no se haya colado ninguna página del panel.
 *
 * Its dictionaries carry only the keys the public screens use
 * (build/diccionarioPublico.ts): the full CRM dictionary describes every
 * screen of the panel and is nobody's business before signing in.
 */
import { fileURLToPath } from "node:url";

import { defineConfig, type PluginOption, type UserConfig } from "vite";

import principal from "./vite.config";
import { diccionarioPublico } from "./build/diccionarioPublico";

const esDelServiceWorker = (p: unknown): boolean =>
  !!p &&
  typeof p === "object" &&
  typeof (p as { name?: unknown }).name === "string" &&
  (p as { name: string }).name.startsWith("vite-plugin-pwa");

function sinServiceWorker(lista: PluginOption[]): PluginOption[] {
  return lista.flatMap((p): PluginOption[] =>
    Array.isArray(p) ? [sinServiceWorker(p)] : esDelServiceWorker(p) ? [] : [p],
  );
}

const base = principal as UserConfig;

export default defineConfig({
  ...base,
  base: "/p/",
  // Sólo el service worker de baja: `public/` del CRM ya está en la raíz de dist.
  publicDir: "publico-estatico",
  plugins: [
    // Only the texts of the public screens, not the whole CRM dictionary
    // (see build/diccionarioPublico.ts).
    diccionarioPublico({ raiz: fileURLToPath(new URL(".", import.meta.url)) }),
    ...sinServiceWorker((base.plugins ?? []) as PluginOption[]),
  ],
  build: {
    ...base.build,
    outDir: "dist/p",
    emptyOutDir: true,
    rolldownOptions: {
      ...(base.build as any)?.rolldownOptions,
      input: "publico.html",
    },
  },
});
