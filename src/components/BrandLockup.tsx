import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";

import { useWhiteLabel } from "@/contexts/WhiteLabelContext";

/** Dónde empieza y acaba cada letra de «C-GUARD» en c-guard-letras-*.png
 *  (770 px de ancho), medido sobre su alfa. Sirve para cortar la imagen en
 *  tramos que entran por separado. Si se rehace el arte, hay que volver a medir. */
const ANCHO_LETRAS = 770;
const TRAMOS: ReadonlyArray<readonly [number, number]> = [
  [0, 109], [119, 178], [188, 295], [311, 416], [422, 538], [545, 648], [664, 770],
];

/** La entrada se ve UNA vez por carga de página: la pantalla de arranque la
 *  hace y el login que viene después ya aparece quieto, con su barrido. Se marca
 *  al TERMINAR, no al empezar: si el arranque se desmonta a medias, el siguiente
 *  logo la hace entera. */
let entradaVista = false;

/**
 * Bloque de marca: el escudo + «C-GUARD» como imágenes, y el lema como TEXTO.
 *
 * El lema venía dibujado dentro del PNG, así que decía «Seguridad Inteligente»
 * también en inglés y en portugués. Aquí sale de `brand.tagline`, se puede
 * buscar y lo lee un lector de pantalla.
 *
 * Va debajo de las letras y se estira al ancho del wordmark, porque «Intelligent
 * Security» es bastante más corto que «Segurança Inteligente» y sin eso el
 * bloque bailaría al cambiar de idioma.
 *
 * El arte tiene dos versiones porque el vidrio lleva color propio: el truco de
 * `dark:brightness-0 dark:invert` que usaba el logo negro ya no sirve.
 *
 * ── EN EL ANFITRIÓN DE UN SOCIO, EL LOGOTIPO ES EL SUYO (fase 11) ─────────
 * Se mira si ESTE anfitrión tiene logotipo propio, no si es «un socio» o «la
 * plataforma»: la pregunta por el ámbito se hace UNA sola vez en todo el CRM y
 * vive dentro de `WhiteLabelProvider`. Aquí sólo se lee un dato ya resuelto.
 *
 * El bloque de plataforma no se puede reutilizar tal cual para un socio: son el
 * escudo y unas letras en dos versiones (clara y oscura) con el lema debajo.
 * Un logotipo de socio es una sola imagen y no trae lema, así que se pinta como
 * lo que es — centrado y a la misma altura — en vez de forzarlo dentro de una
 * maqueta hecha para otro arte.
 */
export default function BrandLockup({
  className = "",
  animated = true,
  showTagline = true,
}: {
  className?: string;
  animated?: boolean;
  showTagline?: boolean;
}) {
  const { t } = useTranslation();
  const { logoUrl, logoDarkUrl, platformName, puedeUsarArteDePlataforma } = useWhiteLabel();
  const tagline = t("brand.tagline", { defaultValue: "Seguridad Inteligente" });
  const slotRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [entrando, setEntrando] = useState(
    () =>
      animated &&
      !entradaVista &&
      !(typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches),
  );
  /** Lo último que llega es el lema (180 ms + 1 s), o las letras si no lo hay:
   *  cuando acaba eso, acaba la entrada. Los `animationend` del resto de piezas
   *  también suben hasta aquí y se descartan. */
  const ultimaPieza = showTagline ? "cg-lockup__slot" : "cg-lockup__letras";
  const terminarLaEntrada = useCallback(() => {
    entradaVista = true;
    setEntrando(false);
  }, []);
  const alTerminarLaEntrada = useCallback(
    (e: AnimationEvent<HTMLSpanElement>) => {
      if ((e.target as HTMLElement).classList.contains(ultimaPieza)) terminarLaEntrada();
    },
    [ultimaPieza, terminarLaEntrada],
  );

  // Por si el `animationend` no llega nunca (pestaña en segundo plano, CSS que
  // no cargó): el logo no puede quedarse sin barrido para siempre.
  useEffect(() => {
    if (!entrando) return;
    const id = window.setTimeout(terminarLaEntrada, 2000);

    return () => window.clearTimeout(id);
  }, [entrando, terminarLaEntrada]);

  /** Lleva el lema al ancho del wordmark repartiendo el espacio ENTRE LETRAS.
   *
   *  Antes lo hacía escalando el bloque entero, y eso mueve el tamaño del texto:
   *  el lema acababa midiendo lo que hiciera falta para encajar en vez de lo que
   *  le toca. El cuerpo se queda fijo (lo fija el CSS, medido sobre el arte) y lo
   *  único que se ajusta es el tracking — que es justo lo que tiene el original:
   *  0,9 de ancho por carácter respecto a su altura no es una fuente estirada,
   *  es una fuente normal muy espaciada. */
  const fit = useCallback(() => {
    const slot = slotRef.current;
    const text = textRef.current;

    if (!slot || !text) return;
    text.style.letterSpacing = "0px";
    // offsetWidth y no getBoundingClientRect: durante la entrada el bloque va
    // escalado, y el tracking medido sobre la caja escalada saldría un 7 % largo.
    const box = slot.offsetWidth;
    const own = text.offsetWidth;
    const gaps = (text.textContent?.length ?? 1) - 1;

    if (box > 0 && own > 0 && gaps > 0) {
      // El tracking se aplica también DESPUÉS del último carácter, así que el
      // reparto va entre los huecos + ese sobrante: si no, el lema se pasa de
      // largo por un carácter.
      text.style.letterSpacing = `${((box - own) / (gaps + 1)).toFixed(3)}px`;
    }
  }, []);

  useLayoutEffect(() => {
    fit();
    // La fuente de marca suele llegar DESPUÉS del primer pintado: si no
    // se vuelve a medir, el lema se queda con el ancho de la fuente de reserva.
    document.fonts?.ready.then(fit).catch(() => {});
    const slot = slotRef.current;

    if (!slot || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);

    ro.observe(slot);

    return () => ro.disconnect();
  }, [fit, tagline]);

  if (logoUrl) {
    /* The partner's two logos: the light-background one in the light theme and
       the dark-background one in the dark theme (the light one in both when
       they uploaded only that). */
    return (
      <span className={`inline-flex items-center justify-center ${className}`.trim()}>
        <img
          alt={platformName}
          className={`h-14 max-w-full object-contain${logoDarkUrl ? " dark:hidden" : ""}`}
          src={logoUrl}
        />
        {logoDarkUrl && (
          <img
            alt={platformName}
            className="hidden h-14 max-w-full object-contain dark:block"
            src={logoDarkUrl}
          />
        )}
      </span>
    );
  }

  /* ── SIN LOGOTIPO PROPIO Y SIN DERECHO A USAR EL NUESTRO ────────────────
     El bloque de abajo pinta el lockup de CGuardPro, y era el respaldo de
     TODOS: un socio con `showPlatformAttribution = false` al que le faltara el
     logotipo acababa enseñando el nuestro en su pantalla de acceso — la fuga
     exacta que esa bandera existe para impedir.
     Se pinta su NOMBRE. Es lo que un producto de marca blanca hace cuando el
     cliente aún no ha subido su arte: enseñar de quién es, no de quién no. */
  if (!puedeUsarArteDePlataforma) {
    return (
      <span
        className={`inline-flex items-center justify-center ${className}`.trim()}
      >
        <span className="cg-lockup__wordmark text-center text-2xl font-semibold tracking-tight">
          {platformName}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`cg-lockup ${animated ? "is-animated" : ""} ${entrando ? "is-entering" : ""} ${className}`.trim()}
      onAnimationEnd={entrando ? alTerminarLaEntrada : undefined}
    >
      <span className="cg-lockup__fila">
        <span className="cg-lockup__escudo">
          <img
            alt={t("auth.landing.logo_alt", { defaultValue: platformName, marca: platformName })}
            src="/assets/logo/escudo.png"
          />
          <span aria-hidden className="cg-lockup__ojo" />
        </span>
        <span className="cg-lockup__texto">
          {/* «C-GUARD»: una imagen por tema (c-guard-letras-light.png y
              -dark.png, la elige glass.css), cortada en sus siete tramos. */}
          <span aria-hidden className="cg-lockup__letras">
            {TRAMOS.map(([a, b], i) => (
              <span
                key={a}
                className="cg-lockup__l"
                style={
                  {
                    "--i": i,
                    left: `${(a / ANCHO_LETRAS) * 100}%`,
                    width: `${((b - a) / ANCHO_LETRAS) * 100}%`,
                    backgroundSize: `${(ANCHO_LETRAS / (b - a)) * 100}% 100%`,
                    backgroundPosition: `${(a / (ANCHO_LETRAS - (b - a))) * 100}% 0`,
                  } as CSSProperties
                }
              />
            ))}
          </span>
          {showTagline && (
            <span ref={slotRef} aria-hidden className="cg-lockup__slot">
              <span ref={textRef} className="cg-lockup__tagline">
                {tagline}
              </span>
            </span>
          )}
        </span>
      </span>
      {/* El lema visible es aria-hidden porque lleva el tracking estirado;
          esta copia es la que anuncia el lector de pantalla. */}
      {showTagline && <span className="sr-only">{tagline}</span>}
    </span>
  );
}
