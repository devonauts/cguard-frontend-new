import { WifiOff, Wifi } from "lucide-react";
import { useTranslation } from "react-i18next";

import { soloHora } from "@/lib/horaDeLaEmpresa";
import type {
  EpisodioDeConexion,
  EstadoDeConexion,
} from "@/lib/api/conexionAppService";

/** Un episodio reciente se sigue enseñando un rato tras volver la conexión. */
const RECIENTE_MS = 2 * 3600 * 1000;

export function textoDeEpisodio(
  t: (k: string, d: string, o?: any) => unknown,
  e: EpisodioDeConexion,
): string {
  const rango = { desde: soloHora(e.desde), hasta: soloHora(e.hasta) };

  return String(
    e.tipo === "sin_senal"
      ? t(
          "conexionApp.episodioSinSenal",
          "Estuvo sin señal {{desde}}–{{hasta}} · {{n}} acciones enviadas",
          {
            ...rango,
            n: e.accionesSinSenal,
          },
        )
      : t(
          "conexionApp.episodioSinConexion",
          "Sin conexión {{desde}}–{{hasta}}",
          rango,
        ),
  );
}

/**
 * Una línea con el estado de conexión de una persona de las apps de campo:
 *  · sin conexión ahora → «Sin conexión desde 02:10» (en rojo suave);
 *  · conectada tras un hueco reciente → «Estuvo sin señal 02:10–03:40 · 5
 *    acciones enviadas» o «Sin conexión 02:10–03:40»;
 *  · conectada sin novedad → nada (`mostrarConectado` para enseñarlo igual).
 */
export function EstadoDeConexionApp({
  estado,
  mostrarConectado = false,
  className = "",
}: {
  estado?: EstadoDeConexion | null;
  mostrarConectado?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();

  if (!estado) return null;
  if (!estado.conectado) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium text-[color:var(--bad-text)] ${className}`}
      >
        <WifiOff className="size-3" />
        {t("conexionApp.sinConexionDesde", "Sin conexión desde {{hora}}", {
          hora: soloHora(estado.desde),
        })}
      </span>
    );
  }
  const e = estado.ultimoEpisodio;

  if (e && Date.now() - new Date(e.hasta).getTime() < RECIENTE_MS) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs text-[color:var(--ink-soft)] ${className}`}
      >
        <Wifi className="size-3" />
        {textoDeEpisodio(t, e)}
      </span>
    );
  }
  if (!mostrarConectado) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-[color:var(--ink-soft)] ${className}`}
    >
      <Wifi className="size-3" />
      {t("conexionApp.conectadoDesde", "Con conexión desde {{hora}}", {
        hora: soloHora(estado.desde),
      })}
    </span>
  );
}
