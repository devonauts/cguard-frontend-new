/**
 * Arranque de la mini-aplicación pública (`/p/`, ver `PublicApp.tsx`). Es el
 * `main.tsx` del CRM sin nada del panel: sin service worker (el que haya de
 * antes lo retira `/p/sw-baja.js`), sin caché offline, sin precargas del
 * tablero. Sólo marca, idioma, estilos y avisos.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";

import PublicApp from "./PublicApp";
import { guardarDestino } from "./traspaso";

import { instalarBlindajeDom } from "@/lib/blindajeDom";
import { guardarAtribucionWeb } from "@/lib/atribucionWeb";
import { instalarIdiomaEnFetch } from "@/lib/idiomaElegido";
import { iniciarCentinela } from "@/lib/centinela";
import "@fontsource-variable/urbanist";
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "@/styles/glass.css";
import { idiomaListo } from "@/i18n";
import { WhiteLabelProvider } from "@/contexts/WhiteLabelContext";
import { ConfirmHost } from "@/components/ui/confirmDialog";
import { PromptHost } from "@/components/ui/promptDialog";

instalarBlindajeDom();
guardarAtribucionWeb();

/* Un enlace `/login?next=/clients/…` (correo, marcador) recuerda adónde iba,
   para que el traspaso tras iniciar sesión llegue allí y no al tablero. */
try {
  guardarDestino(
    new URLSearchParams(window.location.search).get("next"),
    sessionStorage,
  );
} catch {
  /* sin almacenamiento: se irá al tablero */
}

window.addEventListener("vite:preloadError", (event) => {
  const last = Number(sessionStorage.getItem("chunkReloadAt") || 0);

  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem("chunkReloadAt", String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

instalarIdiomaEnFetch();
iniciarCentinela();

const ESPERA_IDIOMA_MS = 3000;
let montado = false;
const montar = () => {
  if (montado) return;
  montado = true;
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <WhiteLabelProvider>
        <PublicApp />
        <ConfirmHost />
        <PromptHost />
        <Toaster
          expand
          duration={8000}
          position="top-center"
          style={{ zIndex: 2147483647 }}
          toastOptions={{ style: { zIndex: 2147483647 } }}
        />
      </WhiteLabelProvider>
    </React.StrictMode>,
  );
};

setTimeout(montar, ESPERA_IDIOMA_MS);
idiomaListo.then(montar, montar);
