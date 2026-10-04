import { defineConfig, mergeConfig } from "vitest/config";

import base from "./vite.config";

/* Las pruebas usan la misma configuración que la aplicación, más una cosa: el
   español cargado de forma síncrona. En la aplicación ningún diccionario va en
   el arranque (ver `src/i18n.ts`); las pruebas comparan contra el texto en
   español y no esperan a la red. */
export default mergeConfig(
  base,
  defineConfig({ test: { setupFiles: ["./src/pruebas/idioma.ts"] } }),
);
