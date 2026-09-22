import { useCallback, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { useWhiteLabel } from "@/contexts/WhiteLabelContext";

/**
 * Bloque de marca: el ojo + «C-GUARD» como imagen, y el lema como TEXTO.
 *
 * El lema venía dibujado dentro del PNG, así que decía «Seguridad Inteligente»
 * también en inglés y en portugués. Aquí sale de `brand.tagline`, se puede
 * buscar y lo lee un lector de pantalla.
 *
 * Va colocado sobre la imagen en el hueco exacto que ocupaba en el arte
 * original — las medidas de abajo salen del alfa del PNG de 6477x1119, no de
 * ajustarlo a ojo — y se estira al ancho del wordmark, porque «Intelligent
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
 * El bloque de plataforma no se puede reutilizar tal cual para un socio: son dos
 * imágenes (clara y oscura) con un lema medido sobre el alfa del PNG original.
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
  const { logoUrl, platformName, puedeUsarArteDePlataforma } = useWhiteLabel();
  const tagline = t("brand.tagline", { defaultValue: "Seguridad Inteligente" });
  const slotRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

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
    const box = slot.getBoundingClientRect().width;
    const own = text.getBoundingClientRect().width;
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
    // La fuente de marca (Saira) suele llegar DESPUÉS del primer pintado: si no
    // se vuelve a medir, el lema se queda con el ancho de la fuente de reserva.
    document.fonts?.ready.then(fit).catch(() => {});
    const slot = slotRef.current;

    if (!slot || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(fit);

    ro.observe(slot);

    return () => ro.disconnect();
  }, [fit, tagline]);

  if (logoUrl) {
    return (
      <span className={`inline-flex items-center justify-center ${className}`.trim()}>
        <img
          alt={platformName}
          className="h-14 max-w-full object-contain"
          src={logoUrl}
        />
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
      className={`cg-lockup ${animated ? "is-animated" : ""} ${className}`.trim()}
    >
      <img
        alt={t("auth.landing.logo_alt", { defaultValue: platformName, marca: platformName })}
        className="cg-lockup__mark cg-lockup__mark--light"
        src="/assets/logo/c-guard-lockup-light.png"
      />
      <img
        aria-hidden
        alt=""
        className="cg-lockup__mark cg-lockup__mark--dark"
        src="/assets/logo/c-guard-lockup-dark.png"
      />
      {showTagline && (
        <span ref={slotRef} aria-hidden className="cg-lockup__slot">
          <span ref={textRef} className="cg-lockup__tagline">
            {tagline}
          </span>
        </span>
      )}
      {/* El lema visible es aria-hidden porque va escalado con transform; esta
          copia es la que anuncia el lector de pantalla. */}
      {showTagline && <span className="sr-only">{tagline}</span>}
    </span>
  );
}
