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
/* Las 3 fuentes que la empresa puede elegir para las apps móviles — cargadas
   aquí SOLO para que la vista previa del Hub Móvil las muestre de verdad. */
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource-variable/saira";
// Orden IMPORTANTE: tokens (color) → globals (tipografía/animación) → glass
// (superficies). glass.css va sin @layer para ganar el cascade a Tailwind.
import "@/styles/tokens.css";
import "@/styles/globals.css";
import "@/styles/glass.css";
import { Toaster } from "sonner";

import OfflineBanner from "@/components/OfflineBanner";
import { startCachePersistence } from "@/lib/offline/persistCache";
import { adelantarPerfil } from "@/lib/perfilDeLaCuenta";

// Registra los replayers de la cola offline (efecto secundario, una vez).
import "@/lib/offline/replayers";
import { registerSW } from "virtual:pwa-register";

// Puente escritorio/SO (efecto secundario: registra el manejador de deep links
// cguardpro:// cuando corremos dentro de la app de escritorio).
import "@/lib/desktop";
import { WhiteLabelProvider } from "@/contexts/WhiteLabelContext";
import { ConfirmHost } from "@/components/ui/confirmDialog";
import { PromptHost } from "@/components/ui/promptDialog";

// Stale-deploy recovery: after each publish the hashed chunk files change and
// the old ones are deleted, so a tab loaded BEFORE the deploy 404s on its next
// lazy-route import ("Failed to fetch dynamically imported module"). Vite
// emits vite:preloadError for exactly this — reload once to pick up the new
// build. The sessionStorage stamp (10s window) prevents a reload loop if the
// failure is something else (e.g. offline).
// ── Modo offline ────────────────────────────────────────────────────────────
// 1) Service worker (vite-plugin-pwa): pre-cachea el bundle → la app INSTALA
//    desde Chrome/Edge y ABRE sin red. `immediate` + autoUpdate: cada deploy
//    toma control sin pedirle nada al usuario.
// 2) Persistencia del caché de datos (react-query → IndexedDB): lo que se vio
//    online se puede volver a ver offline. Ver lib/offline/persistCache.ts.
// En la app de ESCRITORIO no se registra: el bundle ya es local (app://) y un
// SW solo duplicaría el caché sin aportar nada. window.cguardDesktop lo expone
// el preload de Electron antes de que corra este módulo.
if (!(window as any).cguardDesktop) {
  registerSW({
    immediate: true,
    // Con `autoUpdate`, en cuanto el SW nuevo toma control la página se recarga
    // sola. Pero por defecto solo se busca actualización al CARGAR — si dejas la
    // pestaña abierta, un deploy nuevo no llega hasta que recargas a mano. Aquí
    // se busca cada 60 s y al volver el foco a la pestaña, para que una versión
    // nueva aparezca sola en ~1 min sin tener que cerrar nada.
    onRegisteredSW(_swUrl, r) {
      if (!r) return;
      const check = () => {
        r.update().catch(() => {
          /* sin red: se reintenta luego */
        });
      };

      setInterval(check, 60_000);
      window.addEventListener("focus", check);
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) check();
      });
    },
  });
}
startCachePersistence();
/* La identidad sale YA, en paralelo con la marca del anfitrión, en vez de
   encolarse detrás de ella. El porqué medido está en `perfilDeLaCuenta.ts`. */
adelantarPerfil();

window.addEventListener("vite:preloadError", (event) => {
  const last = Number(sessionStorage.getItem("chunkReloadAt") || 0);

  if (Date.now() - last < 10_000) return; // already retried — let it surface
  sessionStorage.setItem("chunkReloadAt", String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* LA MARCA PRIMERO. `WhiteLabelProvider` no pinta a sus hijos hasta que ha
        resuelto de quién es este anfitrión, así que nadie que entre por la URL
        de un socio ve un parpadeo con el logotipo de CGuardPro. Mientras espera
        hay un esqueleto NEUTRO — sin marca de nadie —, y si el contexto no se
        puede leer se sigue con la identidad de plataforma: esto es identidad
        visual, no una dependencia para poder entrar a trabajar. */}
    <WhiteLabelProvider>
      {/* <BrowserRouter> */}
      <App />
    {/* Estado de red global: solo visible sin conexión / reconectando /
            con escrituras encoladas. */}
    <OfflineBanner />
    {/* Platform-styled confirm() replacement (see confirmDialog.tsx). */}
    <ConfirmHost />
    <PromptHost />
    {/* Notifications must sit at the very top of the stacking context so the
            live alert is never hidden behind a dialog/overlay. */}
    {/* Sin `richColors`: pintaba la caja entera de verde/rojo con la paleta
            propia de sonner, que ni es cristal ni conoce el acento elegido. El
            tono ahora lo lleva la placa del icono (ver glass.css › AVISOS
            FLOTANTES), con los colores de estado FIJOS de tokens.css. */}
    <Toaster
      expand
      duration={8000}
      position="top-center"
      style={{ zIndex: 2147483647 }}
      toastOptions={{ style: { zIndex: 2147483647 } }}
    />
      {/* </BrowserRouter> */}
    </WhiteLabelProvider>
  </React.StrictMode>,
);
