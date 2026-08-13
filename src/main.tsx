import React from "react";
import ReactDOM from "react-dom/client";
// import { BrowserRouter } from "react-router-dom";

import App from "./App.tsx";
// import { Provider } from "./provider.tsx";
// Tipografía AUTOALOJADA (empaquetada — sin depender del CDN de Google, que puede
// caerse o estar bloqueado). Dos familias variables, una sola petición cada una:
//
//   Inter          — interfaz, tablas y texto. Es la que mejor aguanta 11-13 px,
//                    que es donde vive un CRM denso, y trae numerales tabulares
//                    de verdad (los de Poppins bailaban en las columnas).
//   Saira          — titulares, cifras, botones y navegación. Semi-condensada y
//                    con terminaciones CUADRADAS. La elección anterior (Sora)
//                    falló por una razón medible: era geométrica-redonda igual
//                    que Poppins y medía 275,42 px contra 274,86 — cambiar de
//                    fuente dentro del mismo esqueleto no se nota. Aquí cambia
//                    el esqueleto, y por eso sí se ve.
import "@fontsource-variable/inter";
import "@fontsource-variable/saira";
// Orden IMPORTANTE: tokens (color) → globals (tipografía/animación) → glass
// (superficies). glass.css va sin @layer para ganar el cascade a Tailwind.
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "@/styles/glass.css";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/components/ui/confirmDialog";

// Stale-deploy recovery: after each publish the hashed chunk files change and
// the old ones are deleted, so a tab loaded BEFORE the deploy 404s on its next
// lazy-route import ("Failed to fetch dynamically imported module"). Vite
// emits vite:preloadError for exactly this — reload once to pick up the new
// build. The sessionStorage stamp (10s window) prevents a reload loop if the
// failure is something else (e.g. offline).
window.addEventListener("vite:preloadError", (event) => {
  const last = Number(sessionStorage.getItem("chunkReloadAt") || 0);
  if (Date.now() - last < 10_000) return; // already retried — let it surface
  sessionStorage.setItem("chunkReloadAt", String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* <BrowserRouter> */}
        <App />
        {/* Platform-styled confirm() replacement (see confirmDialog.tsx). */}
        <ConfirmHost />
        {/* Notifications must sit at the very top of the stacking context so the
            live alert is never hidden behind a dialog/overlay. */}
        <Toaster
          richColors
          expand
          position="top-center"
          duration={8000}
          style={{ zIndex: 2147483647 }}
          toastOptions={{ style: { zIndex: 2147483647 } }}
        />
    {/* </BrowserRouter> */}
  </React.StrictMode>,
);
