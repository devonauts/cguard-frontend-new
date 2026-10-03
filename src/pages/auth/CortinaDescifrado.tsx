/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA CORTINA «DESCIFRADO» — la entrada al acceso, UNA vez por pestaña
 *
 * Elegida por el dueño (opción 8 de veinte, 2026-10-03): una lluvia de código
 * y letras al azar que se descifran hasta leer la marca y el lema, y termina en
 * el logo con su barra de carga. Dura unos 2,5 s y la monta `Boveda` sólo la
 * primera vez que se abre el CRM en la pestaña.
 *
 * Marca blanca: en el anfitrión de un socio se descifra SU nombre y no sale
 * nada nuestro (ni el escudo, ni las letras, ni nuestro lema).
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useWhiteLabel } from "@/contexts/WhiteLabelContext";

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&";
const DURACION_MS = 2600;

/** Escribe `final` letra a letra: lo aún no fijado es ruido. */
function useDescifrado(final: string, quieto: boolean): string {
  const [texto, setTexto] = useState(() => (quieto ? final : ""));

  useEffect(() => {
    if (quieto) {
      setTexto(final);

      return;
    }
    let paso = 0;
    const reloj = setInterval(() => {
      paso++;
      const fijas = Math.floor(paso / 2.2);

      setTexto(
        [...final]
          .map((c, i) =>
            i < fijas || c === " "
              ? c
              : ALFABETO[(Math.random() * ALFABETO.length) | 0],
          )
          .join(""),
      );
      if (fijas >= final.length) clearInterval(reloj);
    }, 45);

    return () => clearInterval(reloj);
  }, [final, quieto]);

  return texto;
}

export default function CortinaDescifrado({ onFin }: { onFin: () => void }) {
  const { t } = useTranslation();
  const marca = useWhiteLabel();
  const dePlataforma = !!marca.puedeUsarArteDePlataforma;
  const quieto = useMemo(() => {
    try {
      return matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }, []);

  const nombre = dePlataforma
    ? "C-GUARD"
    : (marca.platformName || "").toUpperCase();
  const lema = dePlataforma
    ? t("brand.tagline", {
        defaultValue: "Seguridad Inteligente",
      }).toUpperCase()
    : "";
  const a = useDescifrado(nombre, quieto);
  const b = useDescifrado(lema, quieto);

  /* La lluvia: unos y ceros, generados una vez. */
  const lluvia = useMemo(() => {
    let s = "";

    for (let f = 0; f < 46; f++) {
      for (let c = 0; c < 260; c++) s += Math.random() < 0.5 ? "0" : "1";
      s += "\n";
    }

    return s;
  }, []);

  useEffect(() => {
    const reloj = setTimeout(onFin, quieto ? 700 : DURACION_MS);

    return () => clearTimeout(reloj);
  }, [onFin, quieto]);

  return (
    <div
      aria-busy="true"
      aria-label={nombre || undefined}
      className="cg-cortina"
      role="status"
    >
      <style>{ESTILOS}</style>
      <pre aria-hidden className="cg-cortina-lluvia">
        {lluvia}
      </pre>
      <div aria-hidden className="cg-cortina-texto">
        <span className="cg-cortina-a">{a}</span>
        {lema && <span className="cg-cortina-b">{b}</span>}
      </div>
      <div aria-hidden className="cg-cortina-logo">
        {dePlataforma ? (
          <>
            <img
              alt=""
              className="cg-cortina-escudo"
              src="/assets/logo/escudo.png"
            />
            <img
              alt=""
              className="cg-cortina-letras"
              src="/assets/logo/c-guard-letras-dark.png"
            />
          </>
        ) : marca.logoDarkUrl || marca.logo ? (
          <img
            alt=""
            className="cg-cortina-socio"
            src={marca.logoDarkUrl || marca.logo || ""}
          />
        ) : (
          <span className="cg-cortina-a">{nombre}</span>
        )}
      </div>
      <div aria-hidden className="cg-cortina-carga" />
    </div>
  );
}

const ESTILOS = `
.cg-cortina { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; overflow: hidden;
  background: radial-gradient(60% 60% at 50% 45%, #141418, #0a0a0b 70%); color: #fff; }
.cg-cortina-lluvia { position: absolute; inset: 0; margin: 0; overflow: hidden; white-space: pre;
  font: 500 13px/1.3 ui-monospace, Menlo, monospace; color: rgba(245,195,0,.16);
  animation: cgCortinaFuera .6s 1.2s forwards; }
.cg-cortina-texto { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 14px;
  animation: cgCortinaFuera .3s 1.75s forwards; }
.cg-cortina-a { font-family: "Urbanist", var(--font-display), sans-serif; font-weight: 800;
  font-size: clamp(40px, 9vw, 96px); letter-spacing: .06em; color: #fff; }
.cg-cortina-b { font: 700 clamp(11px, 1.6vw, 17px) ui-monospace, Menlo, monospace; letter-spacing: .4em; color: var(--brand, #f5c300); }
.cg-cortina-logo { position: absolute; display: flex; align-items: center; gap: clamp(10px, 1.6vw, 18px); opacity: 0;
  animation: cgCortinaLogo .7s cubic-bezier(.2,.9,.3,1) 1.8s forwards; }
.cg-cortina-escudo { width: clamp(64px, 9vw, 110px); filter: drop-shadow(0 0 22px rgba(245,195,0,.25)); }
.cg-cortina-letras { width: clamp(150px, 20vw, 250px); }
.cg-cortina-socio { max-height: 90px; max-width: 280px; object-fit: contain; }
.cg-cortina-carga { position: absolute; top: calc(50% + clamp(70px, 9vw, 110px)); width: clamp(140px, 16vw, 200px); height: 3px;
  border-radius: 9px; background: rgba(255,255,255,.08); overflow: hidden; opacity: 0; animation: cgCortinaDentro .3s 2.2s forwards; }
.cg-cortina-carga::after { content: ""; position: absolute; inset: 0; transform: scaleX(0); transform-origin: left;
  background: linear-gradient(90deg, #e8a800, var(--brand, #f5c300)); animation: cgCortinaLlena 1.2s ease-in-out 2.2s forwards; }
@keyframes cgCortinaFuera { to { opacity: 0; } }
@keyframes cgCortinaDentro { to { opacity: 1; } }
@keyframes cgCortinaLlena { to { transform: scaleX(1); } }
@keyframes cgCortinaLogo { from { opacity: 0; transform: scale(.9); filter: blur(10px); } to { opacity: 1; transform: none; filter: none; } }
@media (prefers-reduced-motion: reduce) {
  .cg-cortina-lluvia, .cg-cortina-texto { display: none; }
  .cg-cortina-logo { animation: none; opacity: 1; }
  .cg-cortina-carga { display: none; }
}
`;
