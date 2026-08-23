/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONFIGURACIÓN › APARIENCIA
 * Donde el usuario elige el acento del sistema. Dos ajustes — tono e intensidad
 * — y nada más: la CLARIDAD del color la fija el sistema, porque es lo que
 * garantiza que el texto se lea encima sea cual sea el color elegido (la
 * medición está en la cabecera de tokens.css). Exponerla era la vía directa a
 * un botón amarillo con letra blanca.
 *
 * Todo lo de esta página se pinta con las variables del sistema, así que la
 * vista previa NO es una maqueta: es el producto real reaccionando en vivo.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useMemo } from "react";
import {
  Palette, Check, Sun, Moon, RotateCcw, Shield, Users, AlertTriangle,
  Download, Plus, Eye,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { Button } from "@/components/ui/button";
import {
  PageContainer, PageHeader, Section, StatusBadge, MetricTile, StatCard,
  IconTile, GlassPanel, FadeIn,
} from "@/components/kit";
import { useAccent, ACCENT_PRESETS, ACCENT_DEFAULT, type Accent } from "@/contexts/AccentContext";
import { useThemeContext } from "@/contexts/ThemeContext";

/** Cómo se verá el relleno del acento en el tema actual. La claridad es la misma
 *  que usa el sistema (0,72 en claro / 0,78 en oscuro): la muestra tiene que ser
 *  el color de verdad, no una aproximación. */
const relleno = (h: number, c: number, oscuro: boolean) => `oklch(${oscuro ? 0.78 : 0.72} ${c} ${h})`;

const mismoAcento = (a: Accent, b: { h: number; c: number }) =>
  Math.abs(a.h - b.h) < 1 && Math.abs(a.c - b.c) < 0.005;

/** Los 360 tonos en una franja, para que el deslizador de tono se entienda sin
 *  leer un número. */
const ARCOIRIS = Array.from({ length: 13 }, (_, i) => i * 30);

/**
 * Los deslizadores. Van en una hoja local y no en línea porque el BOTÓN del
 * deslizador es un pseudo-elemento (`::-webkit-slider-thumb`) y a un
 * pseudo-elemento no se le puede dar estilo desde `style={{…}}`. Sin esta regla,
 * `appearance: none` deja el riel pintado y el botón INVISIBLE en Chrome. Los
 * colores siguen saliendo todos de las variables del sistema.
 */
const CSS_DESLIZADOR = `
.ap-slider {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: 0.75rem; border-radius: 9999px; outline: none; cursor: pointer;
  border: 1px solid var(--hairline);
  box-shadow: inset 0 1px 2px oklch(0 0 0 / 0.12);
}
.ap-slider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 1.25rem; height: 1.25rem; border-radius: 9999px;
  background: var(--glass-solid);
  border: 2px solid var(--brand);
  box-shadow: var(--lift-2), 0 0 16px -2px var(--brand-glow);
  cursor: pointer; transition: transform 0.15s var(--ease);
}
.ap-slider::-webkit-slider-thumb:hover { transform: scale(1.1); }
.ap-slider::-moz-range-thumb {
  width: 1.25rem; height: 1.25rem; border-radius: 9999px;
  background: var(--glass-solid);
  border: 2px solid var(--brand);
  box-shadow: var(--lift-2), 0 0 16px -2px var(--brand-glow);
  cursor: pointer;
}
.ap-slider:focus-visible { box-shadow: 0 0 0 3px var(--brand-glow); }
@media (prefers-reduced-motion: reduce) {
  .ap-slider::-webkit-slider-thumb { transition: none; }
  .ap-slider::-webkit-slider-thumb:hover { transform: none; }
}
`;

export default function AppearancePage() {
  const { accent, setAccent, resetAccent } = useAccent();
  const { theme, setTheme } = useThemeContext();
  const oscuro = theme === "dark";

  const esPredeterminado = mismoAcento(accent, ACCENT_DEFAULT);

  const degradadoTono = useMemo(
    () => `linear-gradient(90deg, ${ARCOIRIS.map((h) => relleno(h, Math.max(accent.c, 0.12), oscuro)).join(", ")})`,
    [accent.c, oscuro],
  );
  const degradadoIntensidad = useMemo(
    () => `linear-gradient(90deg, ${relleno(accent.h, 0, oscuro)}, ${relleno(accent.h, 0.2, oscuro)})`,
    [accent.h, oscuro],
  );

  const preset = ACCENT_PRESETS.find((p) => mismoAcento(accent, p));

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title="Apariencia">
        <style>{CSS_DESLIZADOR}</style>
        <PageContainer width="wide">
          <PageHeader
            icon={<Palette />}
            title="Apariencia"
            subtitle="Elige el color con el que se pinta tu C-Guard Pro y si trabajas en claro u oscuro. El cambio se aplica al instante y se guarda en tu cuenta, así que lo verás igual desde cualquier computadora o navegador."
            badges={
              <>
                <StatusBadge tone="brand">{preset ? preset.label : "Color a medida"}</StatusBadge>
                <StatusBadge tone="neutral" dot={false}>{oscuro ? "Modo oscuro" : "Modo claro"}</StatusBadge>
              </>
            }
            actions={
              <Button variant="outline" onClick={resetAccent} disabled={esPredeterminado}>
                <RotateCcw /> Volver al mostaza oro
              </Button>
            }
          />

          {/* ── COLOR DEL SISTEMA ─────────────────────────────────────────── */}
          <Section title="El color de tu empresa" icon={<Palette />}>
            <p className="mb-5 text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Toca un color y mira la pantalla entera: botones, gráficas, avisos y menús se
              repintan solos. Es el mismo color en toda la plataforma, así que basta con
              elegirlo una vez.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {ACCENT_PRESETS.map((p) => {
                const activo = mismoAcento(accent, p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setAccent({ h: p.h, c: p.c })}
                    aria-pressed={activo}
                    className="cg-focus flex flex-col items-center gap-2.5 rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      borderColor: activo ? "var(--brand)" : "var(--hairline)",
                      background: activo ? "var(--brand-wash)" : "var(--glass-sunken)",
                      boxShadow: activo ? "0 0 28px -10px var(--brand-glow)" : "none",
                    }}
                  >
                    <span
                      className="grid h-12 w-12 place-items-center rounded-full transition-transform duration-200"
                      style={{
                        background: relleno(p.h, p.c, oscuro),
                        color: "var(--brand-ink)",
                        boxShadow: "inset 0 1px 0 0 oklch(1 0 0 / 0.28), 0 6px 18px -8px oklch(0 0 0 / 0.35)",
                      }}
                    >
                      {activo && <Check className="h-5 w-5" />}
                    </span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: activo ? "var(--brand-text)" : "var(--ink-soft)" }}
                    >
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ── AJUSTE FINO ───────────────────────────────────────────────── */}
          <Section title="Ajústalo a tu gusto" icon={<Eye />}>
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="block">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="cg-eyebrow">Tono</span>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--ink-soft)" }}>
                    {Math.round(accent.h)}°
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={accent.h}
                  onChange={(e) => setAccent({ ...accent, h: Number(e.target.value) })}
                  aria-label="Tono del color"
                  className="ap-slider"
                  style={{ background: degradadoTono }}
                />
                <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                  De qué color es: del rojo al verde, al azul y de vuelta.
                </p>
              </label>

              <label className="block">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="cg-eyebrow">Intensidad</span>
                  <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--ink-soft)" }}>
                    {Math.round((accent.c / 0.2) * 100)} %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.2}
                  step={0.005}
                  value={accent.c}
                  onChange={(e) => setAccent({ ...accent, c: Number(e.target.value) })}
                  aria-label="Intensidad del color"
                  className="ap-slider"
                  style={{ background: degradadoIntensidad }}
                />
                <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                  Cuánto color tiene: de gris apagado a pleno.
                </p>
              </label>
            </div>

            {/* La única explicación técnica de la página, en una línea. */}
            <div
              className="mt-5 flex items-start gap-3 rounded-2xl border p-3.5"
              style={{ borderColor: "var(--brand-line)", background: "var(--brand-wash)" }}
            >
              <IconTile tone="brand" size="sm"><Shield /></IconTile>
              <p className="text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                <strong style={{ color: "var(--ink)" }}>Lo claro u oscuro que sale el color lo decidimos nosotros</strong>, y no es
                un olvido: es lo que mantiene los textos legibles encima del color, elijas el que elijas.
                Tú pones el tono y la intensidad; del contraste nos encargamos.
              </p>
            </div>
          </Section>

          {/* ── CLARO / OSCURO ────────────────────────────────────────────── */}
          <Section title="Claro u oscuro" icon={oscuro ? <Moon /> : <Sun />}>
            <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              El mismo color funciona en los dos. Elige con cuál trabajas mejor — de día en
              una garita con sol, el claro; en una central de monitoreo a oscuras, el oscuro.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                { id: "light", titulo: "Claro", pie: "Fondo blanco, para oficinas con luz", icono: <Sun /> },
                { id: "dark", titulo: "Oscuro", pie: "Fondo negro, descansa la vista de noche", icono: <Moon /> },
              ] as const).map((m) => {
                const activo = (m.id === "dark") === oscuro;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTheme(m.id)}
                    aria-pressed={activo}
                    className="cg-focus flex items-center gap-3 rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      borderColor: activo ? "var(--brand)" : "var(--hairline)",
                      background: activo ? "var(--brand-wash)" : "var(--glass-sunken)",
                      boxShadow: activo ? "0 0 28px -10px var(--brand-glow)" : "none",
                    }}
                  >
                    <IconTile tone={activo ? "brand" : "neutral"}>{m.icono}</IconTile>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold" style={{ color: "var(--ink)" }}>{m.titulo}</span>
                      <span className="block text-xs" style={{ color: "var(--ink-faint)" }}>{m.pie}</span>
                    </span>
                    {activo && <Check className="h-4 w-4 shrink-0" style={{ color: "var(--brand-text)" }} />}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* ── VISTA PREVIA ──────────────────────────────────────────────── */}
          <Section title="Así se verá" icon={<Eye />}>
            <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
              Piezas reales de la plataforma con el color que acabas de elegir. Los avisos de
              peligro, advertencia y todo correcto no cambian nunca de color: una alerta roja
              tiene que seguir siendo roja aunque elijas el rojo como color de tu empresa.
            </p>

            <FadeIn className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Button><Plus /> Acción principal</Button>
                <Button variant="outline"><Download /> Secundaria</Button>
                <Button variant="ghost">Sin relieve</Button>
                <Button variant="destructive"><AlertTriangle /> Peligro</Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="brand">Destacado</StatusBadge>
                <StatusBadge tone="ok">En servicio</StatusBadge>
                <StatusBadge tone="warn">Por confirmar</StatusBadge>
                <StatusBadge tone="bad">Sin cubrir</StatusBadge>
                <StatusBadge tone="info">Programado</StatusBadge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MetricTile
                  label="Cumplimiento de rondas"
                  value="94 %"
                  icon={<Shield />}
                  delta={{ value: "3,2 %", direction: "up" }}
                  hint="Últimos 7 días"
                />
                <StatCard icon={<Users />} label="Vigilantes en servicio" value="128" hint="+12 desde ayer" />
                <GlassPanel hover className="p-5">
                  <div className="cg-eyebrow mb-2">Turno de hoy</div>
                  <div className="mb-3 text-sm font-semibold" style={{ color: "var(--ink)" }}>
                    Torre Norte — Acceso principal
                  </div>
                  {/* Barra de progreso: el relleno es el acento. */}
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--glass-sunken)" }}>
                    <div className="h-full rounded-full" style={{ width: "72%", background: "var(--brand)" }} />
                  </div>
                  <div className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
                    72 % del turno completado
                  </div>
                </GlassPanel>
              </div>
            </FadeIn>
          </Section>

          <p className="px-1 pb-2 text-xs" style={{ color: "var(--ink-faint)" }}>
            Tu elección se guarda en este equipo. Si entras desde otro computador o navegador,
            vuelve a elegirla allí.
          </p>
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
