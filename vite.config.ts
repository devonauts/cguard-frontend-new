import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tsconfigPaths(),
    tailwindcss(),
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
      registerType: "autoUpdate",
      // Los iconos NO se agregan aparte al precache: el glob de abajo ya los
      // recoge desde public/, y la entrada duplicada (una sin revisión por los
      // iconos del manifest + una con revisión por el glob) hacía reventar la
      // EVALUACIÓN del SW con add-to-cache-list-conflicting-entries — el
      // service worker ni registraba. Verificado ejecutando dist/sw.js en un
      // sandbox: era esto, no el registro.
      includeManifestIcons: false,
      // El manifest ya existía en public/manifest.json (huérfano hasta hoy) —
      // se genera desde aquí para mantenerlo versionado junto al SW.
      manifest: {
        name: "C-Guard Pro",
        short_name: "C-Guard",
        description:
          "Plataforma de gestión de seguridad física: guardias, puestos de vigilancia, patrullaje GPS y reportes en tiempo real.",
        // "/" y no "/login": una sesión viva debe abrir en el panel; el router
        // ya redirige a /login cuando no hay sesión.
        start_url: "/",
        display: "standalone",
        background_color: "#0A0E16",
        theme_color: "#0A0E16",
        lang: "es",
        icons: [
          { src: "/assets/logo/c-guard-app-logo.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/assets/logo/c-guard-app-logo.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
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
        // El chunk principal supera los 2 MB por defecto de Workbox.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // SPA: cualquier navegación sin archivo propio cae al index…
        navigateFallback: "/index.html",
        // …EXCEPTO lo que NO es esta SPA y comparte origen: la API (proxied en
        // /api/), el superadmin (app aparte servida en /superadmin/) y la
        // documentación. Interceptarlos serviría el index del CRM en su lugar.
        navigateFallbackDenylist: [/^\/api\//, /^\/superadmin/, /^\/documentation/],
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
        manualChunks: {
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
          // Phone input
          "vendor-phone": ["libphonenumber-js"],
          // Notifications
          "vendor-toast": ["sonner"],
          // Heavy, feature-specific libs — split out so they never sit in the
          // initial entry. Combined with route-level React.lazy, these only
          // download when a user actually opens radio / maps.
          "vendor-livekit": ["livekit-client"],
          "vendor-maps": ["leaflet", "react-leaflet"],
        },
      },
    },
  },
});
