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
