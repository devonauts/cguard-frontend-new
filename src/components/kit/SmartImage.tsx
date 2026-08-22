import * as React from 'react';
import { cn } from '@/lib/utils';

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
  alt = '',
  className,
  fallback,
  rounded = 'rounded-lg',
  ...rest
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Qué mostrar si no hay `src` o la carga falla (iniciales, icono…). */
  fallback?: React.ReactNode;
  /** Clase de redondeo del marco (para que el esqueleto la comparta). */
  rounded?: string;
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'className'>) {
  const [loaded, setLoaded] = React.useState(false);
  const [errored, setErrored] = React.useState(false);

  // Si cambia la URL, se reinicia el estado (una lista que recicla nodos).
  React.useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [src]);

  const showFallback = !src || errored;

  return (
    <span className={cn('relative block overflow-hidden', rounded, className)}>
      {/* Esqueleto: visible hasta que la imagen carga. */}
      {!showFallback && !loaded && (
        <span
          aria-hidden
          className="absolute inset-0 animate-pulse"
          style={{ background: 'var(--glass-sunken)' }}
        />
      )}

      {showFallback ? (
        <span className="absolute inset-0 grid place-items-center" style={{ background: 'var(--glass-sunken)' }}>
          {fallback}
        </span>
      ) : (
        <img
          src={src as string}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={cn('h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none', loaded ? 'opacity-100' : 'opacity-0')}
          {...rest}
        />
      )}
    </span>
  );
}
