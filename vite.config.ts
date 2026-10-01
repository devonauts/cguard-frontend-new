import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { sinComentariosHtml } from "./build/sinComentariosHtml";

/* En producción nginx pone la API detrás del MISMO origen (`/api`), y hay dos
   peticiones que cuentan con eso: `/api/platform/context` (la marca del
   anfitrión, ver WhiteLabelContext) y `/api/security/integridad` (el
   centinela). En local el servidor de Vite no tenía `/api` y respondía 404 —
   ruido en la consola y, en el contexto, un rodeo hasta el anfitrión fijo.
   Este proxy SÓLO existe en `vite dev` y conserva el Host del navegador, como
   nginx, para que la marca se resuelva igual que en producción. */
const API_LOCAL = (() => {
  try {
    return new URL(loadEnv("development", process.cwd(), "VITE_").VITE_API_URL || "").origin;
  } catch {
    return "http://localhost:8080";
  }
})();

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    proxy: {
      "/api": { target: API_LOCAL, changeOrigin: false },
    },
  },
  plugins: [
    react(),
    tsconfigPaths(),
    tailwindcss(),
    sinComentariosHtml(),
    // ── PWA / offline ───────────────────────────────────────────────────────
    // Convierte el CRM en app INSTALABLE (Chrome/Edge "Instalar aplicación" en
    // Mac/Windows/Linux) y le da arranque sin red: el service worker pre-cachea
    // el bundle completo, así que la app abre aunque la oficina se quede sin
    // internet — los datos salen del caché persistido de react-query (ver
    // lib/queryClient.ts) y las escrituras seguras se encolan (lib/offline/).
    //
    // Este mismo service worker es la base del empaquetado de escritorio
    // (Electron, Fase 2): la ventana carga este bundle y hereda el offline.
    VitePWA({
      // El SW nuevo toma control apenas se publica un deploy (sin pedirle al
      // usuario que cierre pestañas). Combinado con el manejador de
      // vite:preloadError de main.tsx, un deploy a mitad de sesión ya no rompe.
      // «prompt» y no «autoUpdate»: la versión nueva ESPERA y el CRM avisa con
      // cuenta atrás antes de recargar (ver src/lib/recarga/recarga.ts). Con
      // autoUpdate la página se recargaba sola, sin aviso, a mitad de un parte.
      registerType: "prompt",
      // Los iconos NO se agregan aparte al precache: el glob de abajo ya los
      // recoge desde public/, y la entrada duplicada (una sin revisión por los
      // iconos del manifest + una con revisión por el glob) hacía reventar la
      // EVALUACIÓN del SW con add-to-cache-list-conflicting-entries — el
      // service worker ni registraba. Verificado ejecutando dist/sw.js en un
      // sandbox: era esto, no el registro.
      includeManifestIcons: false,
      // El manifest ya existía en public/manifest.json (huérfano hasta hoy) —
      // se genera desde aquí para mantenerlo versionado junto al SW.
      /* MANIFEST NEUTRO (fase 11): un solo artefacto sirve a todos los
         anfitriones y el navegador lee el manifest antes de que corra nada
         nuestro, así que su nombre no puede depender del socio. Un nombre con
         marca aparecería al INSTALAR desde el anfitrión de un socio. El porqué
         completo y la salida (manifest por anfitrión) están en
         `backend/docs/runbooks/phase-a-wildcard.md`. */
      manifest: {
        name: "Panel de seguridad",
        short_name: "Panel",
        description:
          "Gestión de seguridad física: vigilantes, puestos, patrullaje GPS y reportes en tiempo real.",
        // "/" y no "/login": una sesión viva debe abrir en el panel; el router
        // ya redirige a /login cuando no hay sesión.
        start_url: "/",
        display: "standalone",
        background_color: "#0A0E16",
        theme_color: "#0A0E16",
        lang: "es",
        // Iconos a tamaño REAL (la auditoría encontró un solo PNG de 5354px
        // declarado como 192 y 512 — tamaños falsos). Generados en public/icons.
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // El runtime de Workbox va EMBEBIDO en sw.js (un solo archivo,
        // evaluación síncrona). Con el cargador en dos archivos que genera por
        // defecto, el listener de `install` se registraba en un microtask
        // posterior a la evaluación inicial del worker — Chrome lo ignora y el
        // precache NUNCA corría (SW "activated" con 0 cachés; verificado en
        // esta máquina). Embebido, install corre y el precache se llena.
        inlineWorkboxRuntime: true,
        // Precache de TODO el build (~9 MB) — es lo que hace posible abrir sin
        // red. Los chunks van con hash, así que cada deploy invalida solo lo
        // que cambió.
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,webp}"],
        // ── LO QUE NO SE PRECARGA ───────────────────────────────────────────
        // Precargar «todo» costaba 12,6 MB que el service worker se descarga de
        // fondo en la PRIMERA carga tras cada deploy, compitiendo con las
        // peticiones que la propia pantalla necesita. Medido en producción: el
        // armazón tardaba 8,8 s y la rejilla del Horario 23 s con la caché
        // fría, contra 0,7 s y 9 s con la caché caliente.
        //
        // Se quedan fuera las piezas que un usuario CONCRETO casi nunca usa:
        //  · los seis diccionarios que no son el suyo (~2,8 MB) — el español va
        //    dentro del bundle de entrada, y los demás ya se cargan bajo demanda;
        //  · la radio (livekit) y los dos armadores de archivos —`xlsx` para el
        //    Excel y `jspdf` para el PDF—, que sólo bajan cuando alguien pulsa
        //    Exportar. Son 815 KB entre los dos para una acción que la mayoría
        //    de las sesiones no ejecuta ni una vez.
        // Siguen funcionando: al pedirlos se buscan en red. Lo que se pierde es
        // poder CAMBIAR de idioma o abrir la radio estando ya sin conexión; el
        // CRM en su idioma sigue abriendo offline, que es para lo que está.
        globIgnores: [
          "assets/{de,en,fr,it,nl,pl,pt}-*.js",
          "assets/vendor-livekit-*.js",
          "assets/vendor-xlsx-*.js",
          "assets/vendor-pdf-*.js",
          // ── LOS SUBCONJUNTOS DE FUENTE QUE ESTA PANTALLA NO VA A PINTAR ────
          // Fontsource parte cada familia por alfabeto y marca cada trozo con
          // `unicode-range`. Gracias a eso el NAVEGADOR ya descarga sólo el
          // trozo que necesita para el texto que hay en pantalla: de las 70
          // fuentes del build, una sesión normal pide tres o cuatro.
          //
          // El precache se saltaba esa optimización entera y se bajaba las 70,
          // porque un glob no entiende de `unicode-range`. 38 de ellas —
          // cirílico, griego y vietnamita, 305 KB— son 38 peticiones que no
          // pinta nadie.
          //
          // NO se quitan del build, que es lo que importa: el sitio sirve a
          // todo el mundo y un visitante ruso, griego o vietnamita sigue
          // recibiendo su alfabeto perfectamente, pedido por red en el momento
          // en que aparece el primer carácter. Lo único que se pierde es tener
          // ESOS alfabetos disponibles sin conexión, y no se pierden los del
          // usuario: el latino sí se precachea.
          "assets/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2",
        ],
        // El chunk principal supera los 2 MB por defecto de Workbox.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // SPA: cualquier navegación sin archivo propio cae al index…
        navigateFallback: "/index.html",
        // …EXCEPTO lo que NO es esta SPA y comparte origen. La lista DEBE cubrir
        // cada location no-SPA del nginx del servidor (app.conf): la API, el
        // superadmin, la documentación, el canal de ESCRITORIO (/desktop/ — la
        // auditoría 2026-08-18 encontró que el SW servía el index del CRM en vez
        // del DMG de descarga), el smart-link /guard-reset y los proxys de video.
        // Si nginx gana una location nueva, se añade AQUÍ o el SW la secuestra.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/superadmin/,
          // La vista previa de la app del supervisor, que el panel mete en un
          // iframe: sin esto el SW le servía el index del CRM y en el marco
          // salía un 404 del propio panel. Mismo caso que /desktop/.
          /^\/supervisor-preview/,
          /^\/documentation/,
          /^\/desktop/,
          /^\/guard-reset/,
          /^\/go2rtc\//,
          /^\/mediamtx\//,
          /^\/rtc\//,
        ],
        // La API JAMÁS se cachea en el SW: es JSON autenticado por usuario y el
        // backend ya manda no-store. Sin runtimeCaching para /api, el SW la
        // deja pasar directo a la red (passthrough) — que es lo correcto: el
        // caché de datos offline vive en react-query/IndexedDB, con claves por
        // empresa y limpieza en el cierre de sesión, no en un caché HTTP ciego.
        runtimeCaching: [],
        // Los deploys borran los chunks viejos del servidor; limpiar también
        // los cachés viejos del SW.
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // Defense-in-depth: strip console.*/debugger from production bundles so any
  // stray payload/token logging never reaches the shipped app. esbuild applies
  // `drop` only when minifying (i.e. production builds), leaving dev untouched.
  esbuild: {
    drop: ["console", "debugger"],
  },
  build: {
    // Raise warning threshold — chunks are intentionally split below
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: hacerTrozos,
      },
    },
  },
});

// ── LOS GRUPOS DE LIBRERÍA ────────────────────────────────────────────────
// Mismos grupos de siempre. Lo que cambió es CÓMO se aplican: antes iban como
// objeto y ahora los aplica `hacerTrozos`, porque hacía falta poder colocar a
// mano el ayudante de precarga de Vite (ver abajo). El contenido de cada grupo
// no se ha tocado.
const GRUPOS: Record<string, string[]> = {
  // Core React runtime
  "vendor-react": ["react", "react-dom", "react-router-dom"],
  // Form + validation
  "vendor-forms": ["react-hook-form", "@hookform/resolvers", "zod"],
  // UI component library
  "vendor-ui": [
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-select",
    "@radix-ui/react-tabs",
    "@radix-ui/react-tooltip",
    "@radix-ui/react-accordion",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-label",
    "@radix-ui/react-popover",
    "@radix-ui/react-scroll-area",
    "@radix-ui/react-separator",
    "@radix-ui/react-slot",
    "@radix-ui/react-switch",
  ],
  // Date utilities
  "vendor-dates": ["date-fns", "react-day-picker"],
  // i18n
  "vendor-i18n": ["i18next", "react-i18next"],
  // Spreadsheet / export
  "vendor-xlsx": ["xlsx"],
  // Los dos armadores del PDF van juntos: `jspdf-autotable` no sirve de
  // nada sin `jspdf`, y separados eran dos peticiones encadenadas —la
  // segunda no puede empezar hasta que la primera resuelve— justo en el
  // momento en que el usuario está esperando su archivo.
  "vendor-pdf": ["jspdf", "jspdf-autotable"],
  // Phone input
  "vendor-phone": ["libphonenumber-js"],
  // Notifications
  "vendor-toast": ["sonner"],
  // ── LOS ICONOS, EN UN SOLO FICHERO ──────────────────────────────
  // Sin esto Rollup le hacía un trozo a CADA icono: 136 ficheros de
  // menos de 1 KB de los 395 del build. El Horario pide una veintena, y
  // cada uno es un viaje de ida y vuelta que se encola detrás de los
  // demás — medido en producción: 900 ms por icono con la caché
  // caliente y 8,5 s con la caché fría, para 300 bytes de contenido.
  // Agrupados van en una sola petición.
  "vendor-icons": ["lucide-react"],
  // Heavy, feature-specific libs — split out so they never sit in the
  // initial entry. Combined with route-level React.lazy, these only
  // download when a user actually opens radio / maps.
  "vendor-livekit": ["livekit-client"],
  "vendor-maps": ["leaflet", "react-leaflet"],
};

/** De `/…/node_modules/@radix-ui/react-slot/dist/x.js` saca `@radix-ui/react-slot`.
 *  Se corta por el ÚLTIMO `node_modules/` (las dependencias anidadas cuentan por
 *  la de dentro) y se compara el nombre COMPLETO, no por prefijo: comparar por
 *  prefijo metía `react-dom` y `react-router-dom` dentro del grupo de `react`
 *  por accidente. */
function paqueteDe(id: string): string | null {
  const i = id.lastIndexOf("node_modules/");

  if (i < 0) return null;
  const resto = id.slice(i + "node_modules/".length).split("/");

  if (!resto.length) return null;

  return resto[0].startsWith("@") && resto.length > 1
    ? `${resto[0]}/${resto[1]}`
    : resto[0];
}

/** Nombre de paquete → grupo, precalculado una vez. */
const GRUPO_DE_PAQUETE = new Map<string, string>(
  Object.entries(GRUPOS).flatMap(([grupo, paquetes]) =>
    paquetes.map((p) => [p, grupo] as [string, string]),
  ),
);

function hacerTrozos(id: string): string | undefined {
  /* ── EL AYUDANTE DE PRECARGA VA SOLO, Y ESTA ES LA RAZÓN ──────────────────
     `__vitePreload` es un módulo VIRTUAL de Vite: lo importa todo trozo que
     tenga un `import()` dinámico — o sea, casi todos. Sin asignar, Rollup lo
     aparcó dentro de `vendor-pdf`, y el resultado medido en el build de
     producción 6764d243 fue:

       · 181 trozos importaban `vendor-pdf` de forma ESTÁTICA
       · 167 de ellos con un import de efecto secundario, sin usar nada
       · 13 pedían sólo `_` (este ayudante)
       · sólo 2 pedían símbolos de jsPDF de verdad
       · el trozo de ENTRADA importaba únicamente `_`

     Es decir: 410 KB de jsPDF entraban en el arranque de CADA carga —la
     pantalla de acceso incluida— para entregar un ayudante de 1 KB. Eso
     contradice lo que dice este mismo archivo más arriba («sólo bajan cuando
     alguien pulsa Exportar») y anulaba de paso la exclusión de `vendor-pdf` en
     los `globIgnores` del service worker.

     En su propio trozo no puede arrastrar nada: los 181 siguen importándolo,
     pero ahora lo que importan pesa 1 KB. */
  if (id.includes("vite/preload-helper")) return "vite-precarga";

  const paquete = paqueteDe(id);

  return paquete ? GRUPO_DE_PAQUETE.get(paquete) : undefined;
}
