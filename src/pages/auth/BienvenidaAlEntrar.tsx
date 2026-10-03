/**
 * «Bienvenido, {nombre}» entre el inicio de sesión y el CRM (opción 13). Dura
 * ~1 s y llama a `onFin`; después el armazón del CRM entra por partes
 * (opción 14, ver lib/entradaAlCrm.ts y `.cg-entrada` en glass.css).
 *
 * Usa el color del lienzo del CRM (--canvas), así que sale bien en claro y en
 * oscuro sin escribir colores; el nombre va en el color de texto de la marca.
 */
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/contexts/AuthContext";

const DURACION_MS = 1100;

export default function BienvenidaAlEntrar({ onFin }: { onFin: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth() as { user?: { firstName?: string } | null };
  const nombre = user?.firstName?.trim() || "";

  useEffect(() => {
    let reducido = false;

    try {
      reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* sin matchMedia: con animación */
    }
    const reloj = setTimeout(onFin, reducido ? 300 : DURACION_MS);

    return () => clearTimeout(reloj);
  }, [onFin]);

  /* En un portal sobre <body>: dentro del acceso, el cristal de la tarjeta
     (backdrop-filter) atrapa lo `fixed` y la capa salía debajo de la tarjeta. */
  return createPortal(
    <div
      aria-live="polite"
      className="cg-bienvenida"
      role="status"
    >
      <style>{ESTILOS}</style>
      <p className="cg-bienvenida-texto font-display">
        {nombre ? (
          <>
            {t("auth.signup.bienvenidoA", { defaultValue: "Bienvenido," })}{" "}
            <span>{nombre}</span>
          </>
        ) : (
          t("auth.signup.bienvenido", { defaultValue: "Bienvenido" })
        )}
      </p>
    </div>,
    document.body,
  );
}

const ESTILOS = `
/* El fondo es el del lienzo del CRM (--canvas), pero sin la clase .app-shell:
   esa fija position: relative y la capa dejaba de cubrir la pantalla. */
.cg-bienvenida { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center;
  background: var(--canvas, #0a0a0b); animation: cgBienvenidaFondo .25s ease both; }
.cg-bienvenida-texto { margin: 0; padding: 0 16px; text-align: center; font-weight: 800; letter-spacing: -.02em;
  font-size: clamp(32px, 6vw, 64px); color: var(--ink, currentColor);
  animation: cgBienvenida 1.1s ease both; }
.cg-bienvenida-texto span { color: var(--brand-text, var(--brand)); }
@keyframes cgBienvenidaFondo { from { opacity: 0; } }
@keyframes cgBienvenida {
  0% { opacity: 0; transform: translateY(14px); }
  30% { opacity: 1; transform: none; }
  75% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(-10px); }
}
@media (prefers-reduced-motion: reduce) { .cg-bienvenida, .cg-bienvenida-texto { animation: none; } }
`;
