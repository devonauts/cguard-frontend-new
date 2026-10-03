/**
 * Hoja lateral de personalización del centro de mando.
 *
 * Dos cosas distintas conviven aquí a propósito:
 *  · El ACENTO de la aplicación, que se guarda en el navegador y repinta el CRM
 *    entero (lo escribe `AccentContext`; aquí sólo se elige el tono).
 *  · Los colores e iconos de los PINES del mapa y los ajustes de operación, que
 *    son preferencias de este panel y viven en `prefs`.
 *
 * El acento no es un color libre: se elige el TONO y el sistema fija la
 * luminosidad, que es lo que garantiza que el texto contraste encima sea cual
 * sea el tono elegido (ver la cabecera de tokens.css).
 */
import type { ReactNode } from "react";
import type { DashboardPrefs } from "../prefs";
import type { EntityKind, LiveStatus } from "../types";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Palette, MapPin, ShieldCheck, Save, RotateCcw } from "lucide-react";

import { DEFAULT_PREFS } from "../prefs";
import { MAP_ICONS, ICON_NAMES } from "../iconRegistry";
import { STATUS_LABEL } from "../tone";

import {
  useAccent,
  ACCENT_PRESETS,
  mismoAcento,
  muestraDeAcento,
} from "@/contexts/AccentContext";
import { useThemeContext } from "@/contexts/ThemeContext";

/** Translation keys + Spanish defaults; resolved with `t()` at render time. */
const KIND_LABEL: Record<EntityKind, [string, string]> = {
  tenant: ["ui.CustomizePanel.sedeNegocio", "Sede / negocio"],
  station: ["maps.kind.station", "Puesto"],
  supervisor: ["maps.kind.supervisor", "Supervisor"],
  guard: ["maps.kind.guard", "Vigilante"],
  incident: ["maps.kind.incident", "Incidente"],
  client: ["ui.CustomizePanel.clienteSede", "Cliente / sede"],
};

export function CustomizePanel({
  open,
  value,
  onClose,
  onSave,
}: {
  open: boolean;
  value: DashboardPrefs;
  onClose: () => void;
  onSave: (p: DashboardPrefs) => void;
}) {
  const { t } = useTranslation();
  const [p, setP] = useState<DashboardPrefs>(value);
  const { accent, setAccent, resetAccent } = useAccent();
  const { theme } = useThemeContext();

  if (!open) return null;
  const set = (patch: Partial<DashboardPrefs>) =>
    setP((s) => ({ ...s, ...patch }));

  return (
    <div className="fixed inset-0 z-[120] flex justify-end">
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ background: "oklch(0 0 0 / 0.45)" }}
        onClick={onClose}
      />
      <div className="glass-raised relative h-full w-full max-w-md overflow-y-auto rounded-none p-5 animate-in slide-in-from-right">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="cg-eyebrow">
              {t("dashboard.commandCenter", "Centro de mando")}
            </div>
            <h2 className="font-display text-base font-semibold">
              {t("dashboard.customize", "Personalizar")}
            </h2>
          </div>
          <button
            aria-label={t("actions.close")}
            className="cg-btn-ghost cg-focus grid size-9 place-items-center rounded-full"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Acento de la aplicación ─────────────────────────────────────── */}
        <Group
          icon={<Palette className="size-4" />}
          title={t(
            "ui.CustomizePanel.colorDeLaAplicacion",
            "Color de la aplicación",
          )}
        >
          <div className="flex flex-wrap gap-1.5">
            {ACCENT_PRESETS.map((preset) => {
              const activo = mismoAcento(accent, preset);

              return (
                <button
                  key={preset.id}
                  className="cg-focus grid size-8 place-items-center rounded-full border transition-transform hover:scale-105"
                  style={{
                    borderColor: activo ? "var(--brand)" : "var(--hairline)",
                    boxShadow: activo
                      ? "0 0 0 3px var(--brand-glow)"
                      : undefined,
                  }}
                  title={t(preset.labelKey ?? "", preset.label)}
                  type="button"
                  onClick={() =>
                    setAccent({
                      h: preset.h,
                      c: preset.c,
                      metal: preset.metal,
                    })
                  }
                >
                  <span
                    className="size-5 rounded-full"
                    style={muestraDeAcento(preset, theme === "dark")}
                  />
                </button>
              );
            })}
          </div>
          <label className="mt-3 block">
            <div className="cg-eyebrow mb-1.5">
              {t("settings.appearance.hueLabel", "Tono")} —{" "}
              {Math.round(accent.h)}°
            </div>
            <input
              className="w-full"
              max={360}
              min={0}
              style={{ accentColor: "var(--brand)" }}
              type="range"
              value={accent.h}
              onChange={(e) =>
                setAccent({ ...accent, h: Number(e.target.value) })
              }
            />
          </label>
          <button
            className="cg-btn-link cg-focus text-xs font-semibold"
            type="button"
            onClick={resetAccent}
          >
            {t(
              "ui.CustomizePanel.volverAlColorDeLaMarca",
              "Volver al color de la marca",
            )}
          </button>
        </Group>

        {/* ── Mapa ────────────────────────────────────────────────────────── */}
        <Group
          icon={<MapPin className="size-4" />}
          title={t("ui.CustomizePanel.mapa", "Mapa")}
        >
          <Row label={t("ui.CustomizePanel.estiloDelMapa")}>
            <select
              className="cg-input px-2 py-1.5 text-sm"
              value={p.mapTheme}
              onChange={(e) =>
                set({ mapTheme: e.target.value as DashboardPrefs["mapTheme"] })
              }
            >
              <option value="dark">
                {t("ui.CustomizePanel.oscuro", "Oscuro")}
              </option>
              <option value="night">
                {t("ui.CustomizePanel.noche", "Noche")}
              </option>
              <option value="roadmap">
                {t("ui.CustomizePanel.estandar", "Estándar")}
              </option>
            </select>
          </Row>
          {(Object.keys(p.pinColors) as EntityKind[]).map((k) => {
            const Preview = MAP_ICONS[p.pinIcons[k]] || MapPin;

            return (
              <div key={k} className="glass-sunken p-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    {/* Tinta del sistema para dibujar SOBRE un relleno de color:
                        el mismo papel que cumple sobre el acento, y así el
                        glifo no lleva un negro escrito a mano. */}
                    <span
                      className="grid size-6 place-items-center rounded-full"
                      style={{ background: p.pinColors[k] }}
                    >
                      <Preview
                        color="var(--brand-ink)"
                        size={13}
                        strokeWidth={2.6}
                      />
                    </span>
                    {t(KIND_LABEL[k][0], KIND_LABEL[k][1])}
                  </span>
                  <ColorInput
                    value={p.pinColors[k]}
                    onChange={(v) =>
                      set({ pinColors: { ...p.pinColors, [k]: v } })
                    }
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ICON_NAMES.map((name) => {
                    const Icon = MAP_ICONS[name];
                    const activo = p.pinIcons[k] === name;

                    return (
                      <button
                        key={name}
                        className="cg-focus grid size-7 place-items-center rounded-md border transition"
                        style={
                          activo
                            ? {
                                borderColor: p.pinColors[k],
                                color: p.pinColors[k],
                                background: `color-mix(in oklab, ${p.pinColors[k]} 14%, transparent)`,
                              }
                            : {
                                borderColor: "var(--hairline)",
                                color: "var(--ink-faint)",
                              }
                        }
                        title={name}
                        type="button"
                        onClick={() =>
                          set({ pinIcons: { ...p.pinIcons, [k]: name } })
                        }
                      >
                        <Icon size={14} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Group>

        <Group
          icon={<Palette className="size-4" />}
          title={t("ui.CustomizePanel.coloresDeEstadoSeveridad")}
        >
          {(Object.keys(p.statusColors) as LiveStatus[]).map((k) => (
            <Row key={k} label={t(STATUS_LABEL[k])}>
              <ColorInput
                value={p.statusColors[k]}
                onChange={(v) =>
                  set({ statusColors: { ...p.statusColors, [k]: v } })
                }
              />
            </Row>
          ))}
        </Group>

        {/* Sólo lo que el tablero LEE de verdad. Aquí había siete ajustes más
            («exigir foto», «radio de geocerca», «escalación»…) que se guardaban
            y nadie leía: parecían reglas de operación y no lo eran. Las reglas
            reales de las rondas viven en Configuración › Rondas. */}
        <Group
          icon={<ShieldCheck className="size-4" />}
          title={t("ui.CustomizePanel.mapaEnVivo", "Mapa en vivo")}
        >
          <Toggle
            checked={p.liveTracking}
            label={t(
              "ui.CustomizePanel.rastreoDeUbicacionEnVivo",
              "Rastreo de ubicación en vivo",
            )}
            onChange={(v) => set({ liveTracking: v })}
          />
          <Row
            label={t(
              "ui.CustomizePanel.intervaloDeUbicacionS",
              "Intervalo de ubicación (s)",
            )}
          >
            <NumInput
              max={120}
              min={5}
              value={p.locationIntervalSec}
              onChange={(v) => set({ locationIntervalSec: v })}
            />
          </Row>
          <Row
            label={t(
              "ui.CustomizePanel.sinSenalTrasMin",
              "Marcar sin señal después de (min)",
            )}
          >
            <NumInput
              max={120}
              min={1}
              value={p.offlineDeviceWarningMin}
              onChange={(v) => set({ offlineDeviceWarningMin: v })}
            />
          </Row>
        </Group>

        <p className="mb-20 text-[11px]" style={{ color: "var(--ink-faint)" }}>
          {t(
            "ui.CustomizePanel.notaDePreferencias",
            "Estas preferencias se guardan en tu cuenta y te siguen a cualquier dispositivo. Sólo cambian cómo ves tú el panel; no cambian las reglas de la operación.",
          )}
        </p>

        <div
          className="sticky bottom-0 -mx-5 flex gap-2 px-5 py-3 backdrop-blur"
          style={{
            borderTop: "1px solid var(--hairline)",
            background: "var(--glass)",
          }}
        >
          <button
            className="cg-btn-glass cg-focus inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold"
            onClick={() => setP({ ...DEFAULT_PREFS })}
          >
            <RotateCcw className="size-4" />{" "}
            {t("ui.CustomizePanel.restablecer", "Restablecer")}
          </button>
          <button
            className="cg-btn-brand cg-focus ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
            onClick={() => onSave(p)}
          >
            <Save className="size-4" /> {t("actions.save", "Guardar")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="cg-eyebrow mb-2.5 flex items-center gap-2">
        <span style={{ color: "var(--brand-text)" }}>{icon}</span>
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}
function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        className="h-7 w-9 cursor-pointer rounded border bg-transparent"
        style={{ borderColor: "var(--hairline)" }}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>
        {value}
      </span>
    </span>
  );
}
function NumInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      className="cg-input w-20 px-2 py-1.5 text-sm"
      max={max}
      min={min}
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1">
      <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {label}
      </span>
      <button
        aria-checked={checked}
        aria-label={label}
        className="cg-focus relative h-5 w-9 rounded-full transition-colors"
        role="switch"
        style={{
          background: checked ? "var(--brand)" : "var(--glass-sunken)",
          boxShadow: "inset 0 0 0 1px var(--hairline)",
        }}
        type="button"
        onClick={() => onChange(!checked)}
      >
        <span
          className="absolute top-0.5 size-4 rounded-full transition-all"
          style={{
            background: checked ? "var(--brand-ink)" : "var(--ink-faint)",
            left: checked ? 18 : 2,
          }}
        />
      </button>
    </label>
  );
}
