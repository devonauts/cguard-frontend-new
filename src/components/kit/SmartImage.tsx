import * as React from "react";

import { cn } from "@/lib/utils";

/** `useLayoutEffect` avisa en un render de servidor; ahí `useEffect` basta. */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/**
 * ────────────────────────────────────────────────────────────────────────────
 * Imagen con carga elegante — el reemplazo de los `<img>` crudos.
 *
 * El problema que resuelve: un `<img>` pelado deja un hueco vacío que hace *pop*
 * cuando la imagen llega, y si la URL falla enseña el icono de imagen rota. Con
 * archivos que tardan (logo del cliente, avatares) eso se ve «buggy».
 *
 * Aquí:
 *  · reserva el espacio (nada de saltos de layout),
 *  · muestra un esqueleto tenue mientras carga,
 *  · aparece con un fundido suave al terminar (`onLoad`),
 *  · `loading="lazy"` + `decoding="async"` para no bloquear el pintado,
 *  · si la URL falla o no hay `src`, enseña el `fallback` (iniciales, icono…)
 *    en vez del icono roto del navegador.
 *
 * El caché lo resuelve el backend (token de archivo determinista + `Cache-Control
 * immutable`): con la URL estable, la SEGUNDA vez la imagen sale del disco, sin red.
 * ────────────────────────────────────────────────────────────────────────────
 */
export function SmartImage({
  src,
  alt = "",
  className,
  fallback,
  rounded = "rounded-lg",
  fit = "cover",
  style,
  onClick,
  ...rest
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Qué mostrar si no hay `src` o la carga falla (iniciales, icono…). */
  fallback?: React.ReactNode;
  /** Clase de redondeo del marco (para que el esqueleto la comparta). */
  rounded?: string;
  /** `cover` recorta para llenar (avatares/thumbnails); `contain` no recorta
   *  (logos que deben verse enteros). */
  fit?: "cover" | "contain";
  /** Estilo del MARCO (borde, fondo…). Va al recuadro, no al `<img>` interno. */
  style?: React.CSSProperties;
  /** Click sobre TODA la caja (también sobre el fallback), no solo la imagen. */
  onClick?: React.MouseEventHandler<HTMLSpanElement>;
} & Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "className" | "style" | "onClick"
>) {
  const [loaded, setLoaded] = React.useState(false);
  const [errored, setErrored] = React.useState(false);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  /**
   * Si cambia la URL, se reinicia el estado (una lista que recicla nodos) — y
   * acto seguido se PREGUNTA AL DOM si la imagen ya está.
   *
   * Por qué hace falta preguntar: la única forma de volverse visible era el
   * evento `load`. Una imagen que ya está en caché puede estar completa ANTES de
   * que React monte el manejador, así que ese evento no llega nunca y el `<img>`
   * se queda a opacidad 0 — un recuadro vacío donde debería estar el logotipo.
   * No es hipotético: desde que las descargas se sirven con `Cache-Control:
   * immutable` sobre una URL de token estable (2026-08-22), la SEGUNDA vista de
   * cualquier imagen sale del disco y entra justo por ese hueco.
   *
   * `complete` con `naturalWidth > 0` = cargada de verdad; `complete` con ancho
   * 0 y un `currentSrc` = intentó y falló (el `error` se perdió igual que el
   * `load`), así que se enseña el respaldo en vez de un hueco.
   *
   * Es `useLayoutEffect` para que la corrección entre en el mismo fotograma y no
   * se vea el parpadeo del esqueleto sobre algo que ya estaba en memoria.
   */
  useIsomorphicLayoutEffect(() => {
    setLoaded(false);
    setErrored(false);
    const el = imgRef.current;

    if (!el || !src) return;
    if (el.complete) {
      if (el.naturalWidth > 0) setLoaded(true);
      else if (el.currentSrc) setErrored(true);
    }
  }, [src]);

  const showFallback = !src || errored;

  // El `style` (borde/fondo) y el `onClick` van al MARCO — que es lo que quien
  // llama entiende por «la caja de la imagen». `...rest` (crossOrigin, etc.) sí
  // va al `<img>` interno.
  return (
    <span
      className={cn("relative block overflow-hidden", rounded, className)}
      style={style}
      onClick={onClick}
    >
      {/* Esqueleto: visible hasta que la imagen carga. */}
      {!showFallback && !loaded && (
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse"
          style={{ background: "var(--glass-sunken)" }}
        />
      )}

      {showFallback ? (
        <span
          className="absolute inset-0 grid place-items-center"
          style={{ background: "var(--glass-sunken)" }}
        >
          {fallback}
        </span>
      ) : (
        <img
          ref={imgRef}
          alt={alt}
          className={cn(
            "h-full w-full transition-opacity duration-300 motion-reduce:transition-none",
            fit === "contain" ? "object-contain" : "object-cover",
            loaded ? "opacity-100" : "opacity-0",
          )}
          decoding="async"
          loading="lazy"
          src={src as string}
          onError={() => setErrored(true)}
          onLoad={() => setLoaded(true)}
          {...rest}
        />
      )}
    </span>
  );
}
