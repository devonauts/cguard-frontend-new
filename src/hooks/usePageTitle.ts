import { useEffect } from "react";

/**
 * Pone el título de la pestaña como "<página> | <nombre del producto>".
 *
 * ── EL NOMBRE SALE DE LA MARCA DEL ANFITRIÓN ──────────────────────────────
 * Era la constante `"C-Guard Pro"`, así que en el anfitrión de un socio la
 * pestaña seguía diciendo CGuardPro por muy bien que estuviera todo lo demás —
 * y la pestaña es lo que la persona ve todo el día, incluso sin mirar la
 * página.
 *
 * Se lee del `<html>`, donde `WhiteLabelProvider` deja el nombre ya resuelto,
 * en vez de usar el contexto de React: este ayudante lo llaman pantallas que no
 * siempre cuelgan del proveedor, y un `useContext` obligaría a moverlas todas.
 * Si no hubiera nombre —un socio sin marca publicada— se deja el título de la
 * página a secas, nunca el nuestro.
 */
function nombreDelProducto(): string {
  try {
    return document.documentElement.dataset.nombreDeMarca || "";
  } catch {
    return "";
  }
}

export function usePageTitle(page: string) {
  useEffect(() => {
    const app = nombreDelProducto();

    document.title = app ? `${page} | ${app}` : page;

    return () => {
      document.title = nombreDelProducto() || page;
    };
  }, [page]);
}

/**
 * Un título de página ya traducido → el mismo, pero con el nombre del producto
 * de ESTE anfitrión.
 *
 * Las pantallas de acceso traen su título de i18n con el nombre ya pegado
 * (`"Iniciar sesión | Cguard"`, y su equivalente en los ocho idiomas), así que
 * en el anfitrión de un socio la pestaña seguía diciendo el nuestro. Aquí se
 * cambia el sufijo en vez de tocar las ocho traducciones: la etiqueta de la
 * página es suya y se respeta; el nombre del producto lo pone el anfitrión.
 *
 * Sin marca publicada se deja SÓLO la etiqueta. Nunca el nuestro.
 */
export function tituloConMarca(tituloTraducido: string, nombreApp?: string): string {
  /* `nombreApp` es para las pruebas: el proyecto no monta DOM, así que la
     función tiene que poder comprobarse sin `document`. En la aplicación no se
     pasa y el nombre sale del `<html>`. */
  const etiqueta = String(tituloTraducido || "").split("|")[0].trim();
  const app = nombreApp !== undefined ? nombreApp : nombreDelProducto();

  if (!app) return etiqueta;
  return etiqueta ? `${etiqueta} | ${app}` : app;
}
