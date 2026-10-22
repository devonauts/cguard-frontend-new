/**
 * La cabecera del centro de mando. No es un título con botones: es el estado
 * del puesto — quién está al mando, si el enlace en tiempo real está vivo y
 * cuándo fue la última sincronización — con las acciones a mano derecha.
 */
import { SlidersHorizontal, Radar } from "lucide-react";
import { useTranslation } from "react-i18next";

import { clockOf } from "../tone";

import { TonePill } from "./Panel";

import { FadeIn, IconTile } from "@/components/kit";
import { useSaludEnVivo } from "@/hooks/useSaludEnVivo";

/** Devuelve la CLAVE del saludo; la traduce quien la pinta. */
function saludo(): string {
  const h = new Date().getHours();

  if (h < 12) return "dashboard.greeting.morning";
  if (h < 19) return "dashboard.greeting.afternoon";

  return "dashboard.greeting.evening";
}

export function CommandBar({
  userName,
  sseConnected,
  lastSync,
  onCustomize,
  resumen,
}: {
  userName: string;
  sseConnected: boolean;
  lastSync: string;
  onCustomize: () => void;
  resumen: string;
}) {
  const { t } = useTranslation();
  /* ── DECIR LA VERDAD SOBRE EL CANAL ────────────────────────────────────────
     Este distintivo decía «Sondeo activo» cuando el SSE no estaba, y eso era
     honesto mientras había sondeo. Ya no lo hay: si el canal se cae, el tablero
     no se refresca por otra vía — se queda quieto.

     Y hay un modo de fallo que el navegador NO puede detectar solo: el socket
     sigue abierto y sano, pero el adaptador de Redis del servidor se cayó y los
     eventos de un worker no llegan a los sockets del otro. Por eso el servidor
     lo anuncia y aquí se pinta en rojo, no en ámbar: un tablero ciego que
     parece vivo es peor que uno que avisa. */
  const salud = useSaludEnVivo();
  const enlace =
    salud === "degradado"
      ? {
          tone: "bad" as const,
          label: t(
            "ui.CommandBar.sinConexionEnVivo",
            "Sin conexión en vivo — los datos pueden estar atrasados",
          ),
        }
      : salud === "reconectando"
        ? {
            tone: "warn" as const,
            label: t("ui.NotificationsPanel.reconectando", "Reconectando…"),
          }
        : sseConnected
          ? { tone: "ok" as const, label: t("dashboard.liveLink") }
          : {
              tone: "warn" as const,
              label: t("comms.wa.connecting", "Conectando…"),
            };

  return (
    <FadeIn className="glass cmd-sweep relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-40 h-80 w-[36rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--brand) 0%, transparent 70%)",
          opacity: 0.16,
        }}
      />
      <div className="relative flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <IconTile size="lg">
            <Radar />
          </IconTile>
          <div className="min-w-0">
            <div className="cg-eyebrow">{t("dashboard.commandCenter")}</div>
            <h1 className="font-display mt-1 truncate text-2xl font-bold tracking-tight sm:text-[28px]">
              {t(saludo())}, {userName}
            </h1>
            <p
              className="mt-1 truncate text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {resumen}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Estado del enlace — el dato que decide si lo demás es de fiar. */}
          <TonePill
            pulse
            className="px-3 py-1.5 text-[11px]"
            tone={enlace.tone}
          >
            {enlace.label}
            {lastSync && (
              <span
                className="font-medium normal-case tracking-normal tabular-nums"
                style={{ color: "var(--ink-faint)" }}
              >
                · {clockOf(lastSync)}
              </span>
            )}
          </TonePill>

          <div
            className="mx-1 hidden h-6 w-px sm:block"
            style={{ background: "var(--hairline)" }}
          />

          <button
            className="cg-btn-brand cg-focus inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold"
            type="button"
            onClick={onCustomize}
          >
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden sm:inline">{t("dashboard.customize")}</span>
          </button>
        </div>
      </div>
    </FadeIn>
  );
}
