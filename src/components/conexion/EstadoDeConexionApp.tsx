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
          "Estuvo sin señal {{desde}}–{{hasta}} · {{count}} acciones enviadas",
          {
            ...rango,
            count: e.accionesSinSenal,
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
 * «3 acciones pendientes en el teléfono»: lo que la persona hizo y todavía no
 * llegó. Lo cuenta la propia app cuando tiene conexión; sin conexión es el
 * último dato que mandó. Vacío si no hay nada pendiente.
 */
export function textoDePendientes(
  t: (k: string, d: string, o?: any) => unknown,
  n?: number | null,
): string {
  if (!n || n <= 0) return "";

  return String(
    t("conexionApp.pendientesEnTelefono", "{{count}} acciones pendientes en el teléfono", { count: n }),
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
  const pendientes = textoDePendientes(t, estado.pendientes);
  const conPendientes = pendientes ? (
    <span className="font-semibold text-[color:var(--warn-text)]"> · {pendientes}</span>
  ) : null;

  if (!estado.conectado) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium text-[color:var(--bad-text)] ${className}`}
      >
        <WifiOff className="size-3" />
        {t("conexionApp.sinConexionDesde", "Sin conexión desde {{hora}}", {
          hora: soloHora(estado.desde),
        })}
        {conPendientes}
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
        {/* Primero lo que pasa AHORA (tiene conexión); el corte, detrás. */}
        {t("conexionApp.conConexion", "Con conexión")} · {textoDeEpisodio(t, e)}
        {conPendientes}
      </span>
    );
  }
  if (!mostrarConectado && !pendientes) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs text-[color:var(--ink-soft)] ${className}`}
    >
      <Wifi className="size-3" />
      {t("conexionApp.conectadoDesde", "Con conexión desde {{hora}}", {
        hora: soloHora(estado.desde),
      })}
      {conPendientes}
    </span>
  );
}
