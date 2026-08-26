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
import { useState } from "react";
import { useTranslation } from 'react-i18next';
import type { ReactNode } from "react";
import { X, Palette, MapPin, ShieldCheck, Save, RotateCcw } from "lucide-react";
import { useAccent, ACCENT_PRESETS } from "@/contexts/AccentContext";
import { useThemeContext } from "@/contexts/ThemeContext";
import type { DashboardPrefs } from "../prefs";
import { DEFAULT_PREFS } from "../prefs";
import type { EntityKind, LiveStatus } from "../types";
import { MAP_ICONS, ICON_NAMES } from "../iconRegistry";
import { STATUS_LABEL } from "../tone";

const KIND_LABEL: Record<EntityKind, string> = {
  tenant: "Sede / negocio", station: "Puesto", supervisor: "Supervisor", guard: "Vigilante",
  incident: "Incidente", client: "Cliente / sede",
};

export function CustomizePanel({
  open, value, onClose, onSave,
}: { open: boolean; value: DashboardPrefs; onClose: () => void; onSave: (p: DashboardPrefs) => void }) {
  const { t } = useTranslation();
  const [p, setP] = useState<DashboardPrefs>(value);
  const { accent, setAccent, resetAccent } = useAccent();
  const { theme } = useThemeContext();
  if (!open) return null;
  const set = (patch: Partial<DashboardPrefs>) => setP((s) => ({ ...s, ...patch }));

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
            <div className="cg-eyebrow">Centro de mando</div>
            <h2 className="font-display text-base font-semibold">Personalizar</h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('actions.close')}
            className="cg-btn-ghost cg-focus grid size-9 place-items-center rounded-full"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Acento de la aplicación ─────────────────────────────────────── */}
        <Group icon={<Palette className="size-4" />} title={t("ui.CustomizePanel.colorDeLaAplicacion", "Color de la aplicación")}>
          <div className="flex flex-wrap gap-1.5">
            {ACCENT_PRESETS.map((preset) => {
              const activo = Math.abs(preset.h - accent.h) < 1 && Math.abs(preset.c - accent.c) < 0.005;
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.label}
                  onClick={() => setAccent({ h: preset.h, c: preset.c })}
                  className="cg-focus grid size-8 place-items-center rounded-full border transition-transform hover:scale-105"
                  style={{
                    borderColor: activo ? "var(--brand)" : "var(--hairline)",
                    boxShadow: activo ? "0 0 0 3px var(--brand-glow)" : undefined,
                  }}
                >
                  <span
                    className="size-5 rounded-full"
                    style={{ background: `oklch(${theme === "dark" ? 0.78 : 0.72} ${preset.c} ${preset.h})` }}
                  />
                </button>
              );
            })}
          </div>
          <label className="mt-3 block">
            <div className="cg-eyebrow mb-1.5">Tono — {Math.round(accent.h)}°</div>
            <input
              type="range" min={0} max={360} value={accent.h}
              onChange={(e) => setAccent({ ...accent, h: Number(e.target.value) })}
              className="w-full" style={{ accentColor: "var(--brand)" }}
            />
          </label>
          <button type="button" onClick={resetAccent} className="cg-btn-link cg-focus text-xs font-semibold">
            Volver al color de la marca
          </button>
        </Group>

        {/* ── Mapa ────────────────────────────────────────────────────────── */}
        <Group icon={<MapPin className="size-4" />} title="Mapa">
          <Row label={t('ui.CustomizePanel.estiloDelMapa')}>
            <select
              value={p.mapTheme}
              onChange={(e) => set({ mapTheme: e.target.value as DashboardPrefs["mapTheme"] })}
              className="cg-input px-2 py-1.5 text-sm"
            >
              <option value="dark">Oscuro</option>
              <option value="night">Noche</option>
              <option value="roadmap">{t("ui.CustomizePanel.estandar", "Estándar")}</option>
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
                    <span className="grid size-6 place-items-center rounded-full" style={{ background: p.pinColors[k] }}>
                      <Preview size={13} color="var(--brand-ink)" strokeWidth={2.6} />
                    </span>
                    {KIND_LABEL[k]}
                  </span>
                  <ColorInput value={p.pinColors[k]} onChange={(v) => set({ pinColors: { ...p.pinColors, [k]: v } })} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ICON_NAMES.map((name) => {
                    const Icon = MAP_ICONS[name];
                    const activo = p.pinIcons[k] === name;
                    return (
                      <button
                        key={name} type="button" title={name}
                        onClick={() => set({ pinIcons: { ...p.pinIcons, [k]: name } })}
                        className="cg-focus grid size-7 place-items-center rounded-md border transition"
                        style={
                          activo
                            ? { borderColor: p.pinColors[k], color: p.pinColors[k], background: `color-mix(in oklab, ${p.pinColors[k]} 14%, transparent)` }
                            : { borderColor: "var(--hairline)", color: "var(--ink-faint)" }
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

        <Group icon={<Palette className="size-4" />} title={t('ui.CustomizePanel.coloresDeEstadoSeveridad')}>
          {(Object.keys(p.statusColors) as LiveStatus[]).map((k) => (
            <Row key={k} label={STATUS_LABEL[k]}>
              <ColorInput value={p.statusColors[k]} onChange={(v) => set({ statusColors: { ...p.statusColors, [k]: v } })} />
            </Row>
          ))}
        </Group>

        <Group icon={<ShieldCheck className="size-4" />} title="Operaciones de seguridad">
          <Toggle label={t("ui.CustomizePanel.rastreoDeUbicacionEnVivo", "Rastreo de ubicación en vivo")} checked={p.liveTracking} onChange={(v) => set({ liveTracking: v })} />
          <Row label={t("ui.CustomizePanel.intervaloDeUbicacionS", "Intervalo de ubicación (s)")}>
            <NumInput value={p.locationIntervalSec} min={5} max={120} onChange={(v) => set({ locationIntervalSec: v })} />
          </Row>
          <Toggle label="Exigir foto en punto de control" checked={p.requirePhotoCheckpoint} onChange={(v) => set({ requirePhotoCheckpoint: v })} />
          <Toggle label="Exigir GPS en punto de control" checked={p.requireGpsCheckpoint} onChange={(v) => set({ requireGpsCheckpoint: v })} />
          <Toggle label={t('ui.CustomizePanel.exigirEscaneoQrEnRonda')} checked={p.requireQrRonda} onChange={(v) => set({ requireQrRonda: v })} />
          <Row label="Radio de geocerca (m)"><NumInput value={p.geofenceRadius} min={20} max={2000} onChange={(v) => set({ geofenceRadius: v })} /></Row>
          <Row label={t("ui.CustomizePanel.umbralPuntoDeControlTardio", "Umbral punto de control tardío (min)")}><NumInput value={p.lateCheckpointThresholdMin} min={1} max={120} onChange={(v) => set({ lateCheckpointThresholdMin: v })} /></Row>
          <Row label={t("ui.CustomizePanel.avisoDispositivoSinConexionMin", "Aviso dispositivo sin conexión (min)")}><NumInput value={p.offlineDeviceWarningMin} min={1} max={120} onChange={(v) => set({ offlineDeviceWarningMin: v })} /></Row>
          <Row label={t("ui.CustomizePanel.nivelesDeEscalacionDeAlerta", "Niveles de escalación de alerta")}><NumInput value={p.alertEscalationLevels} min={1} max={5} onChange={(v) => set({ alertEscalationLevels: v })} /></Row>
          <Toggle label={t("ui.CustomizePanel.notificacionAutomaticaDeEmergencia", "Notificación automática de emergencia")} checked={p.emergencyAutoNotify} onChange={(v) => set({ emergencyAutoNotify: v })} />
        </Group>

        <p className="mb-20 text-[11px]" style={{ color: "var(--ink-faint)" }}>
          El color de acento se guarda en tu cuenta y te sigue a cualquier dispositivo. El resto de
          estas preferencias se guardan en este navegador y sólo afectan a tu vista del panel.
        </p>

        <div
          className="sticky bottom-0 -mx-5 flex gap-2 px-5 py-3 backdrop-blur"
          style={{ borderTop: "1px solid var(--hairline)", background: "var(--glass)" }}
        >
          <button
            onClick={() => setP({ ...DEFAULT_PREFS })}
            className="cg-btn-glass cg-focus inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold"
          >
            <RotateCcw className="size-4" /> Restablecer
          </button>
          <button
            onClick={() => onSave(p)}
            className="cg-btn-brand cg-focus ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
          >
            <Save className="size-4" /> Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ icon, title, children }: { icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-6">
      <div className="cg-eyebrow mb-2.5 flex items-center gap-2">
        <span style={{ color: "var(--brand-text)" }}>{icon}</span>{title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm" style={{ color: "var(--ink-soft)" }}>{label}</span>
      {children}
    </div>
  );
}
function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="color" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 cursor-pointer rounded border bg-transparent"
        style={{ borderColor: "var(--hairline)" }}
      />
      <span className="font-mono text-xs" style={{ color: "var(--ink-faint)" }}>{value}</span>
    </span>
  );
}
function NumInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number" value={value} min={min} max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="cg-input w-20 px-2 py-1.5 text-sm"
    />
  );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1">
      <span className="text-sm" style={{ color: "var(--ink-soft)" }}>{label}</span>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label}
        onClick={() => onChange(!checked)}
        className="cg-focus relative h-5 w-9 rounded-full transition-colors"
        style={{ background: checked ? "var(--brand)" : "var(--glass-sunken)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
      >
        <span
          className="absolute top-0.5 size-4 rounded-full transition-all"
          style={{ background: checked ? "var(--brand-ink)" : "var(--ink-faint)", left: checked ? 18 : 2 }}
        />
      </button>
    </label>
  );
}
