import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MapPin, Maximize2 } from 'lucide-react';
import { staticMapUrl, staticMapUrlMulti, type StaticMapOptions, type StaticMapPoint } from '@/utils/staticMapUrl';

/**
 * Miniatura de mapa que sólo se vuelve interactiva cuando alguien la pide.
 *
 * ── EL AHORRO Y POR QUÉ NO PIERDE NADA ──────────────────────────────────────
 * Un mapa dinámico se factura por CONSTRUIRLO ($7/1.000), no por usarlo. En una
 * ficha de cliente, una vista de impresión o un enlace público, ese mapa se
 * construye —y se cobra— aunque nadie lo toque. La Maps Static API cuesta
 * $2/1.000 (−71 %) y tiene su propio cupo gratuito.
 *
 * Lo que hace que esto NO sea una pérdida de función es que la capacidad no
 * desaparece, se APLAZA: se muestra la imagen y, en cuanto alguien pulsa, se
 * monta el mapa de verdad (`children`) en el mismo hueco. Quien sólo quería ver
 * dónde está no paga un mapa dinámico; quien necesita hacer zoom lo tiene a un
 * clic. El cargo se produce cuando hay una persona detrás, que es cuando tiene
 * sentido pagarlo.
 *
 * ── DOS AHORROS MÁS, GRATIS ─────────────────────────────────────────────────
 *  · `IntersectionObserver`: ni siquiera la IMAGEN se pide hasta que el hueco se
 *    acerca a la pantalla. Una ficha larga con el mapa al fondo no gasta nada si
 *    nadie baja.
 *  · Si no hay clave, o las coordenadas no sirven, o Google devuelve error en la
 *    imagen (por ejemplo porque la Maps Static API no esté habilitada en el
 *    proyecto), se cae al mapa interactivo. El comportamiento anterior es
 *    siempre la red de seguridad: esto no puede dejar una pantalla sin mapa.
 */
export interface StaticMapImageProps extends Omit<StaticMapOptions, 'height' | 'width'> {
  lat?: number | string | null | undefined;
  lng?: number | string | null | undefined;
  /** Varias chinchetas con encuadre automático. Si viene con al menos un punto
   *  válido manda sobre `lat`/`lng`: es el caso de "todas las sedes de este
   *  cliente", donde no hay un centro único que valga. */
  points?: StaticMapPoint[];
  /** El mapa interactivo real. Se monta al pulsar, o si la imagen no sirve. */
  children: ReactNode;
  /** Alto CSS del hueco. Debe coincidir con el del mapa interactivo. */
  height?: string;
  className?: string;
  /** Texto alternativo de la imagen. */
  alt?: string;
  /** `false` deja el pie de "pulsa para explorar" fuera (vistas de impresión). */
  interactive?: boolean;
}

export default function StaticMapImage({
  lat,
  lng,
  points,
  children,
  height = '256px',
  className = '',
  alt = 'Mapa de la ubicación',
  interactive = true,
  ...mapOptions
}: StaticMapImageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const [imagenRota, setImagenRota] = useState(false);

  // Alto en píxeles con el que se PIDE la imagen. Un `height` en porcentaje
  // ("100%") no dice cuántos píxeles son, así que se pide un tamaño holgado:
  // con `scale=2` son 640 px reales, de sobra para cualquier miniatura, y sigue
  // siendo UNA petición. Redondear a un valor fijo también mantiene la URL
  // determinista, que es lo que permite que el navegador la cachee.
  const alturaPx = /^\d+(\.\d+)?px$|^\d+$/.test(height.trim())
    ? Math.max(120, parseInt(height, 10))
    : 320;
  const url = points && points.length
    ? staticMapUrlMulti(points, { height: alturaPx, ...mapOptions })
    : staticMapUrl(lat, lng, { height: alturaPx, ...mapOptions });

  useEffect(() => {
    const nodo = hostRef.current;
    if (!nodo || visible) return;

    if (typeof IntersectionObserver !== 'function') {
      setVisible(true);
      return;
    }

    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisible(true);
          obs.disconnect();
        }
      },
      // Margen generoso: la imagen llega justo antes de que el hueco aparezca,
      // así no se ve el hueco vacío al desplazarse.
      { rootMargin: '250px' },
    );
    obs.observe(nodo);
    return () => obs.disconnect();
  }, [visible]);

  // Sin URL utilizable, o ya expandido, o la imagen falló → mapa de verdad.
  if (!url || expandido || imagenRota) {
    return <>{children}</>;
  }

  return (
    <div
      ref={hostRef}
      className={`relative overflow-hidden ${className}`}
      style={{ height }}
    >
      {visible ? (
        <>
          <img
            src={url}
            alt={alt}
            loading="lazy"
            decoding="async"
            onError={() => setImagenRota(true)}
            className="h-full w-full object-cover"
          />
          {interactive && (
            <button
              type="button"
              onClick={() => setExpandido(true)}
              aria-label="Abrir el mapa interactivo"
              className="absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,.35), transparent 45%)' }}
            >
              <span
                className="pointer-events-none flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: 'var(--glass, rgba(255,255,255,.92))', color: 'var(--ink, #111)' }}
              >
                <Maximize2 className="h-3 w-3" />
                Explorar el mapa
              </span>
            </button>
          )}
        </>
      ) : (
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ background: 'var(--glass-sunken, rgba(0,0,0,.04))' }}
        >
          <MapPin className="h-5 w-5 opacity-30" />
        </div>
      )}
    </div>
  );
}
