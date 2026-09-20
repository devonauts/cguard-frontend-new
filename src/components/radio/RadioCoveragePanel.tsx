import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Users, RadioTower, BellOff, WifiOff } from "lucide-react";

import {
  Section,
  StatCard,
  StatsStrip,
  StatusBadge,
  ListRow,
  Avatar,
  EmptyState,
  SkeletonBlock,
} from "@/components/kit";
import {
  radioCheckService,
  type RadioPresence,
  type RadioPresenceRow,
  type RadioPresenceState,
} from "@/lib/api/radioCheckService";
import { useRadioRealtime } from "@/components/radio/RadioRealtimeProvider";
import { subscribeRadio, getRadioSnapshot } from "@/lib/radioVoiceManager";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

/**
 * Cobertura del canal abierto.
 *
 * EL PROBLEMA QUE RESUELVE: el tablero decía «10 vigilantes en línea» y en la
 * radio salían 2, y no había forma de saber por qué. Aquellos 10 eran turnos
 * abiertos en la base de datos —un dato administrativo—, no gente conectada.
 * Aquí se separan las dos cosas y, sobre todo, se pone nombre y apellido a los
 * que le toca oír y NO están.
 *
 * Quién está en el canal lo dice el servidor de voz, no el teléfono: un aparato
 * congelado puede seguir creyéndose conectado. Lo que reporta el teléfono se
 * muestra aparte, como pista de POR QUÉ se cayó, nunca como la verdad.
 */

/** Cada cuánto se vuelve a preguntar. Igual que el resto de la pantalla (20 s):
 *  entrar y salir del canal no genera ningún aviso que podamos escuchar. */
const REFRESCO_MS = 20_000;

/** Tono + clave de texto. Se devuelve la CLAVE, no el texto: así el mapeo es
 *  puro y no hay que arrastrar la función de traducción hasta aquí. */
function insigniaEstado(
  estado: RadioPresenceState | null,
  viejo: boolean,
): { tono: string; clave: string; base: string } {
  switch (estado) {
    case "ONLINE_ACTIVE":
      return {
        tono: "green",
        clave: "ui.RadioCoverage.state.active",
        base: "App abierta",
      };
    case "ONLINE_BACKGROUND":
      return {
        tono: "blue",
        clave: "ui.RadioCoverage.state.background",
        base: "En segundo plano",
      };
    case "RECONNECTING":
      return {
        tono: "orange",
        clave: "ui.RadioCoverage.state.reconnecting",
        base: "Reconectando",
      };
    case "OFFLINE":
      return {
        tono: "red",
        clave: "ui.RadioCoverage.state.offline",
        base: "Sin conexión",
      };
    // Nunca dijo nada: casi siempre es una app que no llegó a arrancar la radio.
    default:
      return viejo
        ? {
            tono: "slate",
            clave: "ui.RadioCoverage.state.stale",
            base: "Sin señal reciente",
          }
        : {
            tono: "slate",
            clave: "ui.RadioCoverage.state.unknown",
            base: "Sin datos",
          };
  }
}

function Fila({ f }: { f: RadioPresenceRow }) {
  const { t } = useTranslation();
  const e = insigniaEstado(f.reported, f.stale);
  const desde = f.lastReportAt
    ? new Date(f.lastReportAt).toLocaleTimeString(localeActual(), { timeZone: zonaDeLaEmpresa(),
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <ListRow
      avatar={<Avatar name={f.name} size="sm" tone="neutral" />}
      badges={
        <>
          <StatusBadge tone={e.tono}>{t(e.clave, e.base)}</StatusBadge>
          {!f.pushReachable && (
            <StatusBadge tone="slate">
              <span className="inline-flex items-center gap-1">
                <BellOff size={11} />{" "}
                {t("ui.RadioCoverage.noAviso", "No se le puede avisar")}
              </span>
            </StatusBadge>
          )}
        </>
      }
      subtitle={
        desde
          ? t(
              "ui.RadioCoverage.lastSignal",
              "Última señal a las {{hora}}",
            ).replace("{{hora}}", desde)
          : t(
              "ui.RadioCoverage.neverReported",
              "Su teléfono no ha dado señal de la radio",
            )
      }
      title={f.name}
    />
  );
}

export default function RadioCoveragePanel() {
  const { t } = useTranslation();
  const { version } = useRadioRealtime();
  /* La cobertura es DEL CANAL que se está mirando. Pedirla siempre de
     «general» mientras el despachador oye otro canal describía a gente que no
     tenía nada que ver con la conversación que tiene delante. */
  const { channel } = useSyncExternalStore(subscribeRadio, getRadioSnapshot);
  const [datos, setDatos] = useState<RadioPresence | null>(null);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    try {
      setDatos(await radioCheckService.getRadioPresence(channel));
    } catch {
      // Sin permiso o sin radio configurada: el panel se queda fuera en vez de
      // gritar. La pantalla del pase sigue siendo utilizable.
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [channel]);

  useEffect(() => {
    refrescar();
  }, [refrescar]);
  useEffect(() => {
    const id = setInterval(refrescar, REFRESCO_MS);

    return () => clearInterval(id);
  }, [refrescar]);
  useEffect(() => {
    if (version > 0) refrescar();
  }, [version, refrescar]);

  if (cargando) {
    return (
      <Section
        icon={<Users />}
        title={t("ui.RadioCoverage.title", "Cobertura del canal")}
      >
        <SkeletonBlock className="h-24" />
      </Section>
    );
  }
  if (!datos || !datos.rows.length) return null;

  const r = datos.resumen || {};
  const fuera = datos.rows.filter((f) => f.onDuty && !f.liveOnChannel);
  const enCanal =
    r.enElCanal ?? datos.rows.filter((f) => f.liveOnChannel).length;
  const enTurno = r.enTurno ?? datos.rows.filter((f) => f.onDuty).length;

  return (
    <Section
      icon={<Users />}
      title={t("ui.RadioCoverage.title", "Cobertura del canal")}
    >
      <StatsStrip className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          accent="green"
          hint={t("ui.RadioCoverage.ofOnDuty", "de {{n}} en turno").replace(
            "{{n}}",
            String(enTurno),
          )}
          icon={<RadioTower size={16} />}
          label={t("ui.RadioCoverage.inChannel", "En el canal")}
          value={enCanal}
        />
        <StatCard
          accent={fuera.length ? "red" : "slate"}
          hint={
            fuera.length
              ? t("ui.RadioCoverage.offChannelHint", "No están oyendo el canal")
              : t("ui.RadioCoverage.offChannelNone", "Nadie fuera del canal")
          }
          icon={<WifiOff size={16} />}
          label={t("ui.RadioCoverage.offChannel", "En turno sin radio")}
          value={fuera.length}
        />
        <StatCard
          accent="orange"
          hint={t(
            "ui.RadioCoverage.wakeableHint",
            "Su teléfono aún recibe avisos",
          )}
          icon={<BellOff size={16} />}
          label={t("ui.RadioCoverage.wakeable", "Se les puede avisar")}
          value={r.despertables ?? 0}
        />
      </StatsStrip>

      {fuera.length ? (
        <>
          <div className="cg-eyebrow mb-2">
            {t("ui.RadioCoverage.listTitle", "En turno pero fuera de la radio")}
          </div>
          <div className="flex flex-col gap-1.5">
            {fuera.map((f) => (
              <Fila key={f.userId} f={f} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          description={t(
            "ui.RadioCoverage.allCoveredDesc",
            "Cada vigilante en turno está conectado a la radio ahora mismo.",
          )}
          icon={<RadioTower />}
          title={t("ui.RadioCoverage.allCovered", "Todos en el canal")}
          variant="inline"
        />
      )}
    </Section>
  );
}
