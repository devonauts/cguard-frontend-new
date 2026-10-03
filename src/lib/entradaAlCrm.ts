/**
 * La ENTRADA al CRM tras iniciar sesión (opciones 13 + 14, elegidas por el
 * dueño el 2026-10-03): visto verde → «Bienvenido, {nombre}» en el acceso y,
 * ya dentro, el armazón que se construye por partes (menú, barra, contenido).
 *
 * Tres momentos, en sessionStorage:
 *  · «en curso»: el acceso lo marca ANTES de pedir la sesión. Mientras dura,
 *    `PublicOnlyRoute` no redirige (si no, la sesión recién creada saltaba al
 *    panel y el visto y la bienvenida no llegaban a verse). Caduca a los 15 s:
 *    una pestaña cerrada a medias nunca deja a nadie atrapado en el acceso.
 *  · «lista»: al terminar la bienvenida. La guarda redirige con su lógica de
 *    siempre (vigilante → /guard, resto → panel) y el armazón la CONSUME una
 *    vez para entrar por partes: nunca al navegar, ni al recargar.
 */
import { useEffect, useState } from "react";

const CLAVE = "cg-entrada-crm";
const EVENTO = "cg-entrada-crm";
const CADUCA_MS = 15_000;

function leer(): { fase: string; en: number } | null {
  try {
    const v = sessionStorage.getItem(CLAVE);

    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

function escribir(fase: string | null): void {
  try {
    if (fase) sessionStorage.setItem(CLAVE, JSON.stringify({ fase, en: Date.now() }));
    else sessionStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: se entra sin animación, nada más */
  }
  try {
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    /* sin window: nada que avisar */
  }
}

export const empezarEntradaAlCrm = () => escribir("en-curso");
export const cancelarEntradaAlCrm = () => escribir(null);
export const terminarEntradaAlCrm = () => escribir("lista");

export function entradaEnCurso(): boolean {
  const v = leer();

  return !!v && v.fase === "en-curso" && Date.now() - v.en < CADUCA_MS;
}

/** Para la guarda: se vuelve a pintar cuando la entrada termina. */
export function useEntradaEnCurso(): boolean {
  const [enCurso, setEnCurso] = useState(entradaEnCurso);

  useEffect(() => {
    const avisar = () => setEnCurso(entradaEnCurso());

    window.addEventListener(EVENTO, avisar);

    return () => window.removeEventListener(EVENTO, avisar);
  }, []);

  return enCurso;
}

/** `true` una sola vez después de `terminarEntradaAlCrm()`. */
export function consumirEntradaAlCrm(): boolean {
  const v = leer();

  if (!v || v.fase !== "lista" || Date.now() - v.en > CADUCA_MS) return false;
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    return false;
  }
  try {
    return !matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}
