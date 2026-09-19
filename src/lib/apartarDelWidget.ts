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
 * Margen de respiro por encima de lo que ocupen los flotantes.
 *
 * El alto ya NO se adivina: se mide. La primera versión de esto daba por
 * supuesto 104 px —la burbuja mide 56 y va a `bottom-6`— y no bastaba: VigIA
 * lleva una onda animada alrededor y su caja real son 74 × 83 px arrancando a
 * 159 px del borde inferior. El botón quedaba «despejado» según la cuenta y
 * seguía comiéndose el clic. Se descubrió probándolo en el navegador de verdad,
 * con `document.elementFromPoint` sobre el «Guardar»; la cuenta a mano decía
 * que estaba bien.
 */
const RESPIRO = 24;

/** Lo que reclaman los widgets flotantes, medido ahora mismo. */
function altoOcupado(): number {
  if (typeof document === "undefined") return 160;
  let arriba = window.innerHeight;

  for (const el of Array.from(
    document.querySelectorAll<HTMLElement>("[data-flotante]"),
  )) {
    const c = el.getBoundingClientRect();

    // Sólo los de la franja inferior y con caja real; uno oculto no estorba.
    if (c.height > 0 && c.bottom > window.innerHeight - 260) {
      arriba = Math.min(arriba, c.top);
    }
  }
  const medido = window.innerHeight - arriba;

  // Sin flotantes montados (o sin marcar) se usa un valor prudente: más vale
  // subir de más que dejar el botón debajo de algo.
  return (medido > 0 ? medido : 160) + RESPIRO;
}

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

  // El formulario CRECE después de montarse: el selector de ubicación monta un
  // mapa que tarda en pintar y empuja la botonera hacia abajo. Medir una sola
  // vez al montar daba «ya está despejado» sobre un formulario que todavía era
  // corto, y el botón acababa fuera de pantalla igualmente.
  //
  // Por eso se vigila el alto un rato y se vuelve a ajustar cuando cambia. Se
  // corta a los 3 s: pasado ese tiempo lo que mueva la página ya es cosa del
  // usuario, y seguir desplazándole la vista sería peor que el problema.
  if (typeof ResizeObserver !== "undefined") {
    const obs = new ResizeObserver(() => ajustar(el));

    obs.observe(el);
    setTimeout(() => obs.disconnect(), 3000);
  }

  ajustar(el);
}

/** Un ajuste: mide y, si hace falta, sube lo justo. */
function ajustar(el: HTMLElement): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const caja = el.getBoundingClientRect();
      // La burbuja está fija a la VENTANA, así que el límite se mide contra la
      // ventana aunque quien se desplace sea otro.
      const sobra = caja.bottom - (window.innerHeight - altoOcupado());

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
