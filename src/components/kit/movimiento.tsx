import * as React from "react";

import { localeActual } from "@/lib/localeActual";
/**
 * ════════════════════════════════════════════════════════════════════════════
 * MOVIMIENTO QUE INFORMA
 * Las dos piezas que no se pueden hacer sólo con CSS porque dependen de saber
 * que un valor CAMBIÓ, no de que exista.
 * ════════════════════════════════════════════════════════════════════════════
 */

const CALMA = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Una cifra que TRANSICIONA cuando cambia, y que no se mueve al aparecer.
 *
 * La distinción importa: animar al montar convierte cada carga de página en un
 * espectáculo de contadores girando, que es exactamente lo que cansa. Animar
 * sólo al CAMBIAR informa — «esto acaba de subir» — y el resto del tiempo la
 * pantalla está quieta.
 *
 * 420 ms y desaceleración limpia, sin rebote: un número que rebota se lee como
 * un juguete, y aquí se cuentan vigilantes e incidentes.
 */
export function Cifra({
  valor,
  decimales = 0,
  className,
  style,
}: {
  valor: number;
  decimales?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [mostrado, setMostrado] = React.useState(valor);
  const anterior = React.useRef(valor);
  const primeraVez = React.useRef(true);

  React.useEffect(() => {
    // Al montar no se anima: sólo se adopta el valor.
    if (primeraVez.current) {
      primeraVez.current = false;
      anterior.current = valor;
      setMostrado(valor);

      return;
    }
    if (valor === anterior.current) return;
    if (CALMA()) {
      anterior.current = valor;
      setMostrado(valor);

      return;
    }

    const desde = anterior.current;
    const delta = valor - desde;
    const inicio = performance.now();
    const DURACION = 420;
    let vivo = true;

    const paso = (t: number) => {
      if (!vivo) return;
      const p = Math.min(1, (t - inicio) / DURACION);
      // easeOutCubic: rápido al principio, se posa al final. Sin rebote.
      const e = 1 - Math.pow(1 - p, 3);

      setMostrado(desde + delta * e);
      if (p < 1) requestAnimationFrame(paso);
      else anterior.current = valor;
    };
    const id = requestAnimationFrame(paso);

    return () => {
      vivo = false;
      cancelAnimationFrame(id);
    };
  }, [valor]);

  return (
    <span
      className={className}
      style={{ fontVariantNumeric: "tabular-nums", ...style }}
    >
      {mostrado.toLocaleString(localeActual(), {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      })}
    </span>
  );
}

/**
 * Marca un bloque cuando su contenido cambia solo.
 *
 * Para datos que se refrescan sin que nadie pulse nada: la cola de alarmas, el
 * parte de novedades, los vigilantes en servicio. Sin esto hay que estar
 * mirando la cifra para enterarte de que se movió.
 *
 * `clave` es lo que se vigila: cuando cambia, el bloque se tiñe del acento
 * novecientos milisegundos y se apaga.
 */
export function AlCambiar({
  clave,
  children,
  className,
}: {
  clave: string | number;
  children: React.ReactNode;
  className?: string;
}) {
  const [marca, setMarca] = React.useState(0);
  const primeraVez = React.useRef(true);

  React.useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;

      return;
    }
    setMarca((n) => n + 1);
  }, [clave]);

  return (
    // `key` fuerza a React a recrear el nodo, que es lo que reinicia la
    // animación CSS. Sin eso, un segundo cambio dentro de la misma animación no
    // se vería: el navegador no relanza una animación que ya está corriendo.
    <div
      key={marca}
      className={[marca > 0 ? "cg-changed" : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}

/**
 * La línea de progreso del cambio de página.
 *
 * No dice cuánto falta —nadie lo sabe con carga diferida— pero sí que algo está
 * pasando, que es la pregunta real cuando pulsas y no cambia nada durante medio
 * segundo. Aparece con retraso a propósito: si la ruta ya estaba en caché y
 * carga en 80 ms, un destello sería peor que nada.
 */
export function ProgresoDeRuta({ retrasoMs = 180 }: { retrasoMs?: number }) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const id = setTimeout(() => setVisible(true), retrasoMs);

    return () => clearTimeout(id);
  }, [retrasoMs]);
  if (!visible) return null;

  return <div aria-hidden className="cg-route-progress" />;
}
