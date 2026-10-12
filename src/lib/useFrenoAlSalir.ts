import { useContext, useEffect, useRef } from "react";
import { UNSAFE_NavigationContext } from "react-router-dom";

/**
 * Frena a quien sale de una pantalla con trabajo sin guardar.
 *
 *  - Cerrar o recargar la pestaña: el aviso del navegador (`beforeunload`), que
 *    no deja poner texto propio.
 *  - Navegar dentro del CRM (menú, enlaces, `navigate()`): pregunta con el
 *    diálogo de la plataforma y sólo sigue si se confirma.
 *
 * La app monta `<BrowserRouter>`, no un router de datos, así que `useBlocker`
 * no existe aquí (lanza). Se envuelven `push`/`replace` del navegador del
 * router, que es por donde pasa toda navegación interna. El botón «atrás» del
 * navegador no pasa por ahí; para eso quien use esto debería además guardar
 * el trabajo (el Planificador guarda el borrador en el navegador).
 */
export function useFrenoAlSalir(
  activo: boolean,
  preguntar: () => Promise<boolean>,
) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const preguntarRef = useRef(preguntar);

  preguntarRef.current = preguntar;

  useEffect(() => {
    if (!activo) return;
    const antesDeCerrar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome < 119 y Safari todavía lo piden.
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", antesDeCerrar);

    const nav = navigator as unknown as {
      push: (...a: unknown[]) => void;
      replace: (...a: unknown[]) => void;
    };
    const push = nav.push;
    const replace = nav.replace;
    let preguntando = false;
    const soltar = () => {
      nav.push = push;
      nav.replace = replace;
      window.removeEventListener("beforeunload", antesDeCerrar);
    };
    const frenar =
      (original: (...a: unknown[]) => void) =>
      (...args: unknown[]) => {
        if (preguntando) return;
        preguntando = true;
        void preguntarRef
          .current()
          .catch(() => false)
          .then((seguir) => {
            preguntando = false;
            if (!seguir) return;
            soltar();
            original.apply(nav, args);
          });
      };

    if (typeof push === "function") nav.push = frenar(push);
    if (typeof replace === "function") nav.replace = frenar(replace);

    return soltar;
  }, [activo, navigator]);
}
