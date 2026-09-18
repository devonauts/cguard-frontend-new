/**
 * ════════════════════════════════════════════════════════════════════════════
 * APARTAR UN FORMULARIO DE LA BURBUJA DE VigIA
 *
 * VigIA vive en `position: fixed` abajo a la derecha, por encima de la página
 * (`zIndex: 45`). Cuando un formulario en línea se abre al final de una lista
 * larga, su fila de botones —que va alineada a la derecha, como en todo el
 * CRM— cae JUSTO debajo de la burbuja: el clic en «Guardar» abre el chat y el
 * formulario queda inservible. No es un fallo de esa pantalla; le puede pasar a
 * cualquier acción que termine en esa esquina.
 *
 * Esto no mueve la burbuja ni cambia la alineación de los botones: sube la
 * página lo justo para que el formulario recién abierto termine por encima de
 * la zona ocupada. Si ya está despejado no hace nada.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Alto de la esquina que ocupa la burbuja, en píxeles.
 *
 * La burbuja mide 56 px y va a `bottom-6` (24 px), así que reclama los 80
 * inferiores. Se dejan 24 de respiro para que el botón no quede pegado al
 * borde, que es incómodo aunque se pueda pulsar.
 */
const ALTO_DE_LA_BURBUJA = 104;

/**
 * El ancestro que de verdad hace scroll.
 *
 * En el CRM NO es la ventana: `<main>` es el contenedor con `overflow-y-auto`
 * y la página nunca se desplaza. Empujar `window` aquí no haría absolutamente
 * nada, que es la trampa de este arreglo.
 */
function contenedorQueDesplaza(el: HTMLElement): HTMLElement | null {
  let n: HTMLElement | null = el.parentElement;

  while (n && n !== document.body) {
    const overflow = getComputedStyle(n).overflowY;

    if (
      (overflow === "auto" || overflow === "scroll") &&
      n.scrollHeight > n.clientHeight
    ) {
      return n;
    }
    n = n.parentElement;
  }

  return null;
}

/**
 * Sube la página hasta que `el` quede entero por encima de la burbuja.
 *
 * Se llama desde un `ref` de callback, así que llega cuando el formulario ya
 * está montado; el `requestAnimationFrame` espera además a que termine el
 * reflow, porque un mapa o una imagen pueden cambiarle el alto justo después.
 */
export function apartarDelWidget(el: HTMLElement | null): void {
  if (!el || typeof window === "undefined") return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const caja = el.getBoundingClientRect();
      // La burbuja está fija a la VENTANA, así que el límite se mide contra la
      // ventana aunque quien se desplace sea otro.
      const sobra = caja.bottom - (window.innerHeight - ALTO_DE_LA_BURBUJA);

      if (sobra <= 0) return;

      const cont = contenedorQueDesplaza(el);

      // `scrollBy` y no `scrollIntoView`: centrar un formulario alto lo deja
      // igual de tapado, y aquí sólo interesa el borde de abajo.
      if (cont) cont.scrollBy({ top: sobra, behavior: "smooth" });
      else window.scrollBy({ top: sobra, behavior: "smooth" });
    });
  });
}

export default apartarDelWidget;
