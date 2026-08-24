/**
 * La cabecera del centro de mando. No es un título con botones: es el estado
 * del puesto — quién está al mando, si el enlace en tiempo real está vivo y
 * cuándo fue la última sincronización — con las acciones a mano derecha.
 */
import { RefreshCw, SlidersHorizontal, Sparkles, Maximize2, Radar } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { FadeIn, IconTile } from "@/components/kit";
import { clockOf } from "../tone";
import { TonePill } from "./Panel";

function saludo(): string {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function CommandBar({
  userName, sseConnected, lastSync, demo, onDemo, onRefresh, onCustomize, onFullMap, resumen,
}: {
  userName: string;
  sseConnected: boolean;
  lastSync: string;
  demo: boolean;
  onDemo: (v: boolean) => void;
  onRefresh: () => void;
  onCustomize: () => void;
  onFullMap: () => void;
  resumen: string;
}) {
  const { t } = useTranslation();
  const enlace = demo
    ? { tone: "brand" as const, label: "Datos de demostración" }
    : sseConnected
    ? { tone: "ok" as const, label: "Enlace en vivo" }
    : { tone: "warn" as const, label: "Sondeo activo" };

  return (
    <FadeIn className="glass cmd-sweep relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 -top-40 h-80 w-[36rem] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand) 0%, transparent 70%)", opacity: 0.16 }}
      />
      <div className="relative flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <IconTile size="lg"><Radar /></IconTile>
          <div className="min-w-0">
            <div className="cg-eyebrow">Centro de mando</div>
            <h1 className="font-display mt-1 truncate text-2xl font-bold tracking-tight sm:text-[28px]">
              {saludo()}, {userName}
            </h1>
            <p className="mt-1 truncate text-xs" style={{ color: "var(--ink-soft)" }}>{resumen}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Estado del enlace — el dato que decide si lo demás es de fiar. */}
          <TonePill tone={enlace.tone} pulse className="px-3 py-1.5 text-[11px]">
            {enlace.label}
            {!demo && lastSync && (
              <span className="font-medium normal-case tracking-normal tabular-nums" style={{ color: "var(--ink-faint)" }}>
                · {clockOf(lastSync)}
              </span>
            )}
          </TonePill>

          <div className="mx-1 hidden h-6 w-px sm:block" style={{ background: "var(--hairline)" }} />

          {/* Demo: deja que un negocio recién creado vea el panel poblado. */}
          <button
            type="button"
            role="switch"
            aria-checked={demo}
            aria-label={t("ui.CommandBar.datosDeDemostracion", "Datos de demostración")}
            onClick={() => onDemo(!demo)}
            className="cg-btn-glass cg-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={demo ? { color: "var(--brand-text)", borderColor: "var(--brand-line)" } : undefined}
          >
            <Sparkles className="size-3.5" />
            Demo
            <span
              className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors"
              style={{ background: demo ? "var(--brand)" : "var(--glass-sunken)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
            >
              <span
                className="absolute size-3 rounded-full transition-transform"
                style={{ background: demo ? "var(--brand-ink)" : "var(--ink-faint)", transform: demo ? "translateX(14px)" : "translateX(2px)" }}
              />
            </span>
          </button>

          <button
            type="button"
            onClick={onFullMap}
            title="Abrir el mapa a pantalla completa"
            className="cg-btn-glass cg-focus inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
          >
            <Maximize2 className="size-3.5" />
            <span className="hidden sm:inline">Mapa completo</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            title="Actualizar"
            aria-label="Actualizar"
            className="cg-btn-glass cg-focus grid size-9 place-items-center rounded-full"
          >
            <RefreshCw className="size-4" />
          </button>

          <button
            type="button"
            onClick={onCustomize}
            className="cg-btn-brand cg-focus inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold"
          >
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden sm:inline">Personalizar</span>
          </button>
        </div>
      </div>
    </FadeIn>
  );
}
