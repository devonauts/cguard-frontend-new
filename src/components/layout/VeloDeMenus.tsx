import { useEffect, useRef } from "react";

/**
 * El velo que oscurece y desenfoca la página mientras hay un menú flotante
 * abierto (desplegables, listas de `Select`, popovers y los menús escritos a
 * mano con `.cg-flotante`).
 *
 * ── POR QUÉ LO ENCIENDE JAVASCRIPT Y NO `:has()` ──────────────────────────
 * Antes lo encendía una regla `body:has([data-radix-popper-content-wrapper]
 * [role="menu"]) .cg-scrim-menu`. Funciona en Chrome de escritorio, pero el
 * recálculo de `:has()` cuando el elemento que casa DESAPARECE no es fiable en
 * todos los motores (Safari, el WebView del programa de escritorio): en un
 * desplegable de selección múltiple, elegir y quitar una opción cerraba el menú
 * y el velo se quedaba puesto, tapando la página (B.A.S., 2026-11-03). Aquí un
 * `MutationObserver` mira si sigue habiendo algo flotante ABIERTO y lo dice con
 * `data-abierto`; el CSS sólo pinta ese atributo.
 *
 * Apagado, el velo además queda `visibility: hidden` (ver glass.css): un
 * elemento a pantalla completa con `backdrop-filter` a opacidad 0 seguía
 * existiendo para el compositor, y un fallo de repintado lo dejaba visible.
 */
const ABIERTO = [
  '[data-radix-popper-content-wrapper] [role="menu"]:not([data-state="closed"])',
  '[data-radix-popper-content-wrapper] [role="listbox"]:not([data-state="closed"])',
  '[data-radix-popper-content-wrapper] [data-radix-popover-content]:not([data-state="closed"])',
  ".cg-flotante",
].join(", ");

export function hayMenuAbierto(raiz: ParentNode = document): boolean {
  return !!raiz.querySelector(ABIERTO);
}

export default function VeloDeMenus() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const velo = ref.current;

    if (!velo || typeof MutationObserver === "undefined") return;
    let pendiente = 0;
    const revisar = () => {
      pendiente = 0;
      if (hayMenuAbierto()) velo.setAttribute("data-abierto", "");
      else velo.removeAttribute("data-abierto");
    };
    // Varias mutaciones seguidas (abrir un menú son decenas) cuentan como una.
    const programar = () => {
      if (!pendiente) pendiente = requestAnimationFrame(revisar);
    };
    const observador = new MutationObserver(programar);

    observador.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "class"],
    });
    revisar();

    return () => {
      observador.disconnect();
      if (pendiente) cancelAnimationFrame(pendiente);
    };
  }, []);

  return <div ref={ref} aria-hidden className="cg-scrim-menu" />;
}
