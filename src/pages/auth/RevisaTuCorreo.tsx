/**
 * «Revisa tu correo» — la confirmación de que se envió un enlace, dentro de la
 * tarjeta de la Bóveda. La usan el registro (confirmar el correo para poder
 * entrar, con cuenta atrás (20 s) que lleva al inicio de sesión) y «Olvidé mi
 * contraseña» (sin cuenta atrás, con «Enviarlo de nuevo»).
 *
 * La animación: el sobre llega, la carta con el escudo entra, la solapa se
 * cierra y sale el visto. Sólo transform/opacity; con «reducir movimiento» se
 * ve el sobre cerrado y quieto.
 */
import { ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";

export default function RevisaTuCorreo({
  titulo,
  texto,
  autoSegundos,
  textoBoton,
  onContinuar,
  extra,
}: {
  titulo: string;
  texto: ReactNode;
  /** Si se pasa, el botón lleva una barra que se vacía y al terminar continúa solo. */
  autoSegundos?: number;
  textoBoton: string;
  onContinuar: () => void;
  /** Debajo del botón (p. ej. «Enviarlo de nuevo»). */
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  const [quedan, setQuedan] = useState(autoSegundos ?? 0);

  useEffect(() => {
    if (!autoSegundos) return;
    const fin = Date.now() + autoSegundos * 1000;
    const reloj = setInterval(() => {
      const s = Math.max(0, Math.ceil((fin - Date.now()) / 1000));

      setQuedan(s);
      if (s <= 0) {
        clearInterval(reloj);
        onContinuar();
      }
    }, 200);

    return () => clearInterval(reloj);
  }, [autoSegundos, onContinuar]);

  return (
    <div className="cg-correo flex flex-col items-center gap-3 py-1 text-center">
      <style>{ESTILOS}</style>
      <div aria-hidden className="cg-correo-escena">
        <span className="cg-correo-sobre">
          <span className="cg-correo-carta">
            <img alt="" src="/assets/logo/escudo.png" />
            <i />
            <i />
          </span>
          <span className="cg-correo-frente" />
          <span className="cg-correo-solapa" />
        </span>
        <span className="cg-correo-visto">
          <svg
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3.2"
            viewBox="0 0 24 24"
          >
            <path d="m5 12 5 5 9-10" />
          </svg>
        </span>
      </div>

      <h1
        className="cg-correo-sube font-display text-[1.6rem] font-semibold leading-tight tracking-tight"
        style={{ animationDelay: "1.15s" }}
      >
        {titulo}
      </h1>
      <p
        className="cg-correo-sube cg-reg-suave max-w-[34ch] text-sm leading-relaxed"
        style={{ animationDelay: "1.25s" }}
      >
        {texto}
      </p>
      <p
        className="cg-correo-sube cg-reg-tenue text-xs"
        style={{ animationDelay: "1.35s" }}
      >
        {t("auth.signup.revisaSpam", {
          defaultValue: "¿No lo ves? Revisa la carpeta de spam o promociones.",
        })}
      </p>

      <button
        className="cg-reg-boton cg-correo-sube cg-correo-boton mt-2"
        style={{ animationDelay: "1.45s" }}
        type="button"
        onClick={onContinuar}
      >
        {autoSegundos ? (
          <span
            aria-hidden
            className="cg-correo-cuenta"
            style={{ animationDuration: `${autoSegundos}s` }}
          />
        ) : null}
        <span className="relative inline-flex items-center gap-2">
          {textoBoton} <ArrowRight className="h-4 w-4" />
        </span>
      </button>
      {autoSegundos ? (
        <p aria-live="polite" className="cg-reg-tenue text-xs">
          {t("auth.signup.teLlevamos", {
            defaultValue: "Te llevamos al inicio de sesión en {{s}} s",
            s: quedan,
          })}
        </p>
      ) : null}
      {extra}
    </div>
  );
}

const ESTILOS = `
.cg-correo-escena { position: relative; width: 120px; height: 100px; margin-bottom: 4px; }
.cg-correo-sobre { position: absolute; left: 10px; right: 10px; bottom: 6px; height: 64px; perspective: 400px;
  animation: cgCorreoLlega .6s cubic-bezier(.2,1.2,.4,1) both; }
/* el fondo del sobre */
.cg-correo-sobre::before { content: ""; position: absolute; inset: 0; border-radius: 10px;
  background: color-mix(in oklab, var(--brand) 55%, #3a2a00); }
.cg-correo-carta { position: absolute; left: 10px; right: 10px; top: -30px; height: 58px; border-radius: 6px;
  background: #fff; box-shadow: 0 6px 16px -8px rgba(0,0,0,.5); display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 7px;
  animation: cgCorreoCarta .55s cubic-bezier(.6,0,.3,1) .45s both; }
.cg-correo-carta img { width: 18px; }
.cg-correo-carta i { display: block; width: 60%; height: 3px; border-radius: 3px; background: #dfe3ea; }
.cg-correo-carta i + i { width: 42%; }
.cg-correo-frente { position: absolute; inset: 0; border-radius: 10px; overflow: hidden;
  background:
    linear-gradient(to top right, transparent 49.5%, color-mix(in oklab, var(--brand) 80%, white) 50%) left / 50.5% 100% no-repeat,
    linear-gradient(to top left, transparent 49.5%, color-mix(in oklab, var(--brand) 80%, white) 50%) right / 50.5% 100% no-repeat,
    var(--brand);
  box-shadow: 0 14px 30px -14px var(--brand-glow, rgba(245,195,0,.5)); }
.cg-correo-solapa { position: absolute; left: 0; right: 0; top: 0; height: 36px; transform-origin: top;
  clip-path: polygon(0 0, 100% 0, 50% 100%); background: color-mix(in oklab, var(--brand) 70%, black);
  transform: rotateX(180deg); animation: cgCorreoCierra .4s cubic-bezier(.6,0,.4,1) .95s both; }
.cg-correo-visto { position: absolute; right: 0; top: 4px; width: 34px; height: 34px; border-radius: 50%;
  display: grid; place-items: center; color: #fff; background: #22c55e; box-shadow: 0 0 0 4px var(--rg-fondo-tarjeta, rgba(0,0,0,.25)), 0 8px 18px -6px rgba(34,197,94,.7);
  animation: cgCorreoVisto .45s cubic-bezier(.3,1.6,.5,1) 1.25s both; }
.cg-correo-visto svg { width: 18px; }
.cg-correo-sube { animation: cgCorreoSube .45s cubic-bezier(.2,.8,.2,1) both; }
.cg-correo-boton { position: relative; overflow: hidden; isolation: isolate; }
.cg-correo-cuenta { position: absolute; inset: 0; z-index: -1; transform-origin: left; background: rgba(255,255,255,.35);
  animation-name: cgCorreoCuenta; animation-timing-function: linear; animation-fill-mode: both; }
@keyframes cgCorreoLlega { from { opacity: 0; transform: translateY(-40px) rotate(-10deg) scale(.8); } }
@keyframes cgCorreoCarta { from { transform: translateY(-26px); opacity: 0; } 35% { opacity: 1; } to { transform: translateY(34px); } }
@keyframes cgCorreoCierra { to { transform: rotateX(0deg); } }
@keyframes cgCorreoVisto { from { opacity: 0; transform: scale(.3); } }
@keyframes cgCorreoSube { from { opacity: 0; transform: translateY(10px); } }
@keyframes cgCorreoCuenta { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@media (prefers-reduced-motion: reduce) {
  .cg-correo *, .cg-correo-sobre, .cg-correo-sube { animation: none !important; }
  .cg-correo-carta { transform: translateY(34px); }
  .cg-correo-solapa { transform: none; }
}
`;
