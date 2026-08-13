/**
 * ════════════════════════════════════════════════════════════════════════════
 * HOJA INFERIOR ARRASTRABLE
 * El resto del panel vive aquí: se sube con el pulgar cuando hace falta y no
 * estorba cuando no. Tres alturas — RECOGIDA (sólo el tirador y una línea de
 * resumen), MEDIA y EXTENDIDA — con dos formas de cambiarlas: arrastrar el
 * tirador, o tocarlo para pasar a la siguiente.
 *
 * ── CÓMO SE MUEVE, Y POR QUÉ ASÍ ───────────────────────────────────────────
 * La hoja mide SIEMPRE lo mismo (`MAX`) y lo que cambia es su `translateY`.
 * Animar la altura obligaría a recalcular la disposición de todo lo que lleva
 * dentro en cada fotograma —y lleva paneles de cristal con desenfoque—; mover
 * una capa ya compuesta es lo único que un teléfono hace a 60 fps sin sudar.
 *
 * El cuerpo con desplazamiento SÍ recibe la altura visible: si midiera `MAX`,
 * su final quedaría por debajo del borde de la pantalla y las últimas filas
 * serían inalcanzables por mucho que se desplazara.
 *
 * ── POR QUÉ EL ARRASTRE NO ES ESTADO DE REACT ──────────────────────────────
 * Un `setState` por cada `pointermove` volvería a renderizar el panel entero
 * —dial, riel, novedades, gráficos— sesenta veces por segundo mientras el dedo
 * se mueve. Durante el arrastre se escribe directamente en el DOM (dos estilos)
 * y sólo al soltar hay un render, el del anclaje. `arrastreRef` se lee EN el
 * render para que un refresco de datos a media caricia no devuelva la hoja a su
 * sitio.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type PasoHoja = 0 | 1 | 2;

/** Cuánto hay que arrastrar para que cuente como arrastre y no como toque. */
const UMBRAL_TOQUE = 5;
/** Velocidad a partir de la cual el gesto se lee como impulso, no como colocar. */
const VELOCIDAD_IMPULSO = 0.55; // px/ms

/** El anclaje: a cuál de las tres alturas se ha soltado la hoja más cerca. */
function masCercano(puntos: [number, number, number], px: number): PasoHoja {
  let mejor: PasoHoja = 0;
  for (let i = 1; i < 3; i += 1) {
    if (Math.abs(puntos[i] - px) < Math.abs(puntos[mejor] - px)) mejor = i as PasoHoja;
  }
  return mejor;
}

export function BottomSheet({
  alto,
  resumen,
  etiqueta = "Detalle de la operación",
  onMover,
  children,
}: {
  /** Alto del contenedor (el mapa a sangre) en píxeles. */
  alto: number;
  /** La línea que se ve con la hoja recogida. */
  resumen: ReactNode;
  etiqueta?: string;
  /**
   * Se llama con la altura visible de la hoja, también durante el arrastre.
   * Es lo que usa el carrusel para viajar por encima del canto de la hoja.
   * DEBE ser estable y no provocar renders: se espera una escritura al DOM.
   */
  onMover?: (px: number, arrastrando: boolean) => void;
  children: ReactNode;
}) {
  const hojaRef = useRef<HTMLElement | null>(null);
  const cabeceraRef = useRef<HTMLDivElement | null>(null);
  const cuerpoRef = useRef<HTMLDivElement | null>(null);
  const arrastreRef = useRef<number | null>(null);
  const gestoRef = useRef<{ y0: number; alto0: number; t0: number; movido: boolean } | null>(null);

  const [paso, setPaso] = useState<PasoHoja>(0);
  const [cabeceraH, setCabeceraH] = useState(84);

  // La cabecera se mide en vez de darse por sabida: con puntero grueso el
  // tirador crece a 44 px por la regla táctil global, así que su alto no es el
  // mismo en un teléfono que en el navegador de un escritorio.
  useLayoutEffect(() => {
    const el = cabeceraRef.current;
    if (!el) return;
    const medir = () => setCabeceraH(Math.round(el.getBoundingClientRect().height) || 84);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = Math.max(240, alto);
  const MAX = Math.round(H * 0.92);
  // Recogida = exactamente la cabecera: el tirador y la línea de resumen, ni un
  // píxel más de hoja tapando el mapa.
  const PUNTOS: [number, number, number] = [
    Math.min(Math.max(44, cabeceraH), Math.round(H * 0.4)),
    Math.round(H * 0.52),
    MAX,
  ];

  const altoActual = arrastreRef.current ?? PUNTOS[paso];

  /** Escribe la posición sin pasar por React (arrastre). */
  const pintar = useCallback(
    (px: number, arrastrando: boolean) => {
      const hoja = hojaRef.current;
      const cuerpo = cuerpoRef.current;
      if (hoja) {
        hoja.style.transform = `translateY(${MAX - px}px)`;
        hoja.style.transition = arrastrando ? "none" : "";
      }
      if (cuerpo) cuerpo.style.height = `${Math.max(0, px - cabeceraH)}px`;
      onMover?.(px, arrastrando);
    },
    [MAX, cabeceraH, onMover],
  );

  // Anclaje y cambios de tamaño: quien manda es el estado.
  useEffect(() => {
    if (arrastreRef.current != null) return;
    pintar(PUNTOS[paso], false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, PUNTOS[0], PUNTOS[1], PUNTOS[2], pintar]);

  const irA = (p: PasoHoja) => setPaso(p);
  const siguiente = () => setPaso(((paso + 1) % 3) as PasoHoja);

  const alBajar = (e: React.PointerEvent) => {
    // Sólo el botón principal / el dedo. Un clic derecho no arrastra nada.
    if (e.button !== 0) return;
    // La captura no es imprescindible —sólo evita perder el gesto si el dedo se
    // sale de la cabecera—, así que un navegador que la rechace no puede
    // llevarse por delante el arrastre entero.
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* sin captura */ }
    gestoRef.current = { y0: e.clientY, alto0: PUNTOS[paso], t0: performance.now(), movido: false };
    arrastreRef.current = PUNTOS[paso];
  };

  const alMover = (e: React.PointerEvent) => {
    const g = gestoRef.current;
    if (!g) return;
    const dy = g.y0 - e.clientY;
    if (!g.movido && Math.abs(dy) > UMBRAL_TOQUE) g.movido = true;
    // Un poco por debajo del punto recogido y un poco por encima del máximo:
    // el tope duro se siente como que la hoja se ha roto.
    const px = Math.min(MAX, Math.max(PUNTOS[0] - 24, g.alto0 + dy));
    arrastreRef.current = px;
    pintar(px, true);
  };

  const alSoltar = (e: React.PointerEvent) => {
    const g = gestoRef.current;
    if (!g) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* nunca se capturó */ }
    gestoRef.current = null;
    const px = arrastreRef.current ?? PUNTOS[paso];
    arrastreRef.current = null;

    if (!g.movido) {
      // Toque limpio sobre el tirador: a la siguiente altura.
      pintar(PUNTOS[((paso + 1) % 3) as PasoHoja], false);
      siguiente();
      return;
    }

    const dy = g.y0 - e.clientY;
    const v = Math.abs(dy) / Math.max(1, performance.now() - g.t0);
    const destino: PasoHoja = v > VELOCIDAD_IMPULSO
      // Impulso: un escalón en la dirección del gesto, se haya recorrido lo que
      // se haya recorrido. Es lo que espera el pulgar cuando lanza la hoja.
      ? (Math.min(2, Math.max(0, masCercano(PUNTOS, g.alto0) + (dy > 0 ? 1 : -1))) as PasoHoja)
      : masCercano(PUNTOS, px);
    pintar(PUNTOS[destino], false);
    irA(destino);
  };

  const alTeclado = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") { e.preventDefault(); setPaso(Math.min(2, paso + 1) as PasoHoja); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setPaso(Math.max(0, paso - 1) as PasoHoja); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); siguiente(); }
  };

  return (
    <section
      ref={hojaRef}
      className="cg-hoja cc-hoja"
      style={{ height: MAX, transform: `translateY(${MAX - altoActual}px)` }}
      aria-label={etiqueta}
    >
      <div
        ref={cabeceraRef}
        className="cc-hoja-cabecera"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alSoltar}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label="Ajustar la altura del panel"
          aria-expanded={paso > 0}
          onKeyDown={alTeclado}
          className="cg-hoja-tirador cg-focus"
        />
        <div className="cc-hoja-resumen">{resumen}</div>
      </div>

      {/* Recogida, la hoja recorta su cuerpo en vez de desmontarlo: volver a
          montar el dial, el riel y las novedades cada vez que se sube sería un
          parpadeo en cada gesto. Si el foco entra por teclado en algo que está
          recortado, la hoja se abre sola — un control enfocado que no se ve es
          un control perdido. */}
      <div
        ref={cuerpoRef}
        className="cmd-scroll cc-hoja-cuerpo"
        style={{ height: Math.max(0, altoActual - cabeceraH) }}
        onFocusCapture={() => { if (paso === 0) setPaso(1); }}
      >
        <div className="space-y-4 px-3 pb-6">{children}</div>
      </div>
    </section>
  );
}
