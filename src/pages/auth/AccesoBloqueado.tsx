import { useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Copy, Mail } from "lucide-react";

import "./accesoBloqueado.css";

import { useWhiteLabel, esMarcaDeSocio } from "@/contexts/WhiteLabelContext";
import { fechaYHora } from "@/lib/horaDeLaEmpresa";
import { nuevaReferencia, referenciaValida } from "@/lib/accesoBloqueado";

/** El soporte de la plataforma; en el anfitrión de un socio manda el del socio. */
const SOPORTE_DE_PLATAFORMA = "support@cguardpro.com";

/**
 * «ACCESO BLOQUEADO» — adonde llega quien la plataforma echó.
 *
 * Llega aquí YA sin sesión: la borró el cierre normal antes de navegar (ver
 * `lib/accesoBloqueado`). Esta página no borra nada, así que abrirla con
 * `?vista=1` estando dentro es una vista previa inofensiva.
 *
 *   ?motivo=sesion → «Cerramos tu sesión por seguridad» (se le echó sin bloquearlo)
 *   ?ref=ABC-123   → la referencia que mandó el servidor (si no, se crea una)
 *   ?en=<epoch ms> → cuándo pasó
 *   ?vista=1       → vista previa para el dueño
 *
 * Seria y sin acusar: no dice qué se detectó ni qué se bloqueó (eso sólo le
 * enseñaría a esquivarlo) y no ofrece volver a entrar.
 */
export default function AccesoBloqueado() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const marca = useWhiteLabel();
  const [copiado, setCopiado] = useState(false);

  const soloSesion = params.get("motivo") === "sesion";
  const vistaPrevia = params.get("vista") === "1";
  const referencia = useMemo(
    () => referenciaValida(params.get("ref")) || nuevaReferencia(),
    [params],
  );
  const instante = useMemo(() => {
    const n = Number(params.get("en"));

    return Number.isFinite(n) && n > 0 ? new Date(n) : new Date();
  }, [params]);
  const cuando = fechaYHora(instante, { timeZoneName: "short" });

  const correo =
    marca?.support?.email ||
    (marca && esMarcaDeSocio(marca) ? null : SOPORTE_DE_PLATAFORMA);
  const asunto = soloSesion
    ? t("auth.accesoBloqueado.asuntoSesion", "Sesión cerrada por seguridad — referencia {{codigo}}", { codigo: referencia })
    : t("auth.accesoBloqueado.asunto", "Acceso bloqueado — referencia {{codigo}}", { codigo: referencia });
  const cuerpo = t(
    "auth.accesoBloqueado.cuerpoDelCorreo",
    "Referencia: {{codigo}}\nFecha y hora: {{fecha}}\n\nCuéntanos qué estabas haciendo cuando se cerró tu sesión:\n",
    { codigo: referencia, fecha: cuando },
  );
  const mailto = correo
    ? `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`
    : null;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(referencia);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* sin portapapeles: la referencia sigue a la vista */
    }
  };

  // El texto aparece después del candado, en escalera.
  const sube = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

  return (
    <main className="cg-bloqueo" aria-labelledby="cg-bloqueo-titulo">
      <div className="cg-bloqueo__panel">
        {vistaPrevia ? (
          <p className="cg-bloqueo__vista">
            {t("auth.accesoBloqueado.vistaPrevia", "Vista previa: tu sesión sigue abierta.")}{" "}
            <a href="/dashboard">{t("auth.accesoBloqueado.volverAlPanel", "Volver al panel")}</a>
          </p>
        ) : null}

        <div aria-hidden="true" className="cg-bloqueo__emblema">
          <span className="cg-bloqueo__aro" />
          <svg fill="none" viewBox="0 0 104 104">
            <path
              className="cg-bloqueo__escudo-fondo"
              d="M52 8 86 20v26c0 24-14.6 41.6-34 50-19.4-8.4-34-26-34-50V20L52 8Z"
            />
            <path
              className="cg-bloqueo__escudo"
              d="M52 8 86 20v26c0 24-14.6 41.6-34 50-19.4-8.4-34-26-34-50V20L52 8Z"
              strokeLinejoin="round"
              strokeWidth="3"
            />
            <g className="cg-bloqueo__candado">
              <path
                className="cg-bloqueo__arco"
                d="M42 50v-7a10 10 0 0 1 20 0v7"
                strokeLinecap="round"
                strokeWidth="4.5"
              />
              <rect className="cg-bloqueo__cuerpo" height="24" rx="5" width="32" x="36" y="49" />
              <circle className="cg-bloqueo__ojo" cx="52" cy="59" r="3.2" />
              <rect className="cg-bloqueo__ojo" height="7" rx="1.2" width="2.6" x="50.7" y="60" />
            </g>
          </svg>
        </div>

        <p className="cg-bloqueo__ceja cg-bloqueo__sube" style={sube(900)}>
          {t("auth.accesoBloqueado.ceja", "Seguridad de la cuenta")}
        </p>
        <h1 className="cg-bloqueo__titulo cg-bloqueo__sube" id="cg-bloqueo-titulo" style={sube(980)}>
          {soloSesion
            ? t("auth.accesoBloqueado.tituloSesion", "Cerramos tu sesión por seguridad")
            : t("auth.accesoBloqueado.titulo", "Tu acceso fue bloqueado")}
        </h1>
        <p className="cg-bloqueo__texto cg-bloqueo__sube" style={sube(1060)}>
          {soloSesion
            ? t(
                "auth.accesoBloqueado.textoSesion",
                "Por precaución cerramos tu sesión en todos tus dispositivos. Si no reconoces lo ocurrido o crees que es un error, escribe a soporte.",
              )
            : t(
                "auth.accesoBloqueado.texto",
                "Por seguridad cerramos tu sesión. Detectamos actividad inusual en tu cuenta y, como precaución, la plataforma bloqueó el acceso. Si crees que es un error, escribe a soporte.",
              )}
        </p>

        <dl className="cg-bloqueo__ficha cg-bloqueo__sube" style={sube(1140)}>
          <div className="cg-bloqueo__dato">
            <dt>{t("auth.accesoBloqueado.referencia", "Referencia")}</dt>
            <dd>
              <span className="cg-bloqueo__ref">{referencia}</span>
              <button
                aria-label={
                  copiado
                    ? t("auth.accesoBloqueado.copiada", "Referencia copiada")
                    : t("auth.accesoBloqueado.copiar", "Copiar la referencia")
                }
                className="cg-bloqueo__copiar"
                type="button"
                onClick={() => void copiar()}
              >
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </dd>
          </div>
          <div className="cg-bloqueo__dato">
            <dt>{t("auth.accesoBloqueado.fechaYHora", "Fecha y hora")}</dt>
            <dd>{cuando}</dd>
          </div>
        </dl>

        <div className="cg-bloqueo__sube" style={sube(1220)}>
          {mailto ? (
            <>
              <a className="cg-bloqueo__soporte" href={mailto}>
                <Mail aria-hidden="true" className="h-4 w-4" />
                {t("auth.accesoBloqueado.escribirASoporte", "Escribir a soporte")}
              </a>
              <p className="cg-bloqueo__correo">{correo}</p>
            </>
          ) : (
            <p className="cg-bloqueo__texto">
              {t(
                "auth.accesoBloqueado.sinCorreo",
                "Para recuperar el acceso, comunícate con el administrador de tu empresa y dale esta referencia.",
              )}
            </p>
          )}
          <p className="cg-bloqueo__nota">
            {t(
              "auth.accesoBloqueado.nota",
              "Ten a mano la referencia: con ella soporte encuentra tu caso más rápido.",
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
