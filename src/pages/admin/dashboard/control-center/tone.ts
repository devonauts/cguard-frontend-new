/**
 * ════════════════════════════════════════════════════════════════════════════
 * CENTRO DE MANDO — TONOS Y FORMATO
 * El único sitio del panel donde se decide «de qué color va esto». No devuelve
 * colores: devuelve VARIABLES. Un `#22c55e` aquí sería un verde que ignora el
 * acento que el usuario haya elegido y que no sabe si el tema es claro u
 * oscuro; `var(--ok)` es el mismo verde resuelto por el sistema en cada tema.
 *
 * Los estados operativos se mapean a los semánticos FIJOS (ok/warn/bad/info)
 * a propósito: un pánico tiene que seguir siendo rojo aunque el acento sea rojo.
 * ════════════════════════════════════════════════════════════════════════════
 */
import type { LiveStatus } from "./types";

import { localeActual } from "@/lib/localeActual";
export type Tone = "brand" | "neutral" | "ok" | "warn" | "bad" | "info";

/**
 * CLAVES de traducción, no texto. Estaban fijadas en español y salían así
 * aunque el CRM estuviera en inglés; quien las pinta llama a `t()`.
 */
export const STATUS_LABEL: Record<LiveStatus, string> = {
  online: "dashboard.status.online",
  offline: "dashboard.status.offline",
  patrol: "dashboard.status.patrol",
  incident: "dashboard.status.incident",
  delayed: "dashboard.status.delayed",
  emergency: "dashboard.status.emergency",
};

const STATUS_TONE: Record<LiveStatus, Tone> = {
  online: "ok",
  offline: "neutral",
  patrol: "info",
  incident: "bad",
  delayed: "warn",
  emergency: "bad",
};

export function toneOf(status?: LiveStatus | "neutral" | null): Tone {
  if (!status || status === "neutral") return "neutral";

  return STATUS_TONE[status] ?? "neutral";
}

/** Relleno del tono — barras, puntos, arcos. */
export function toneFill(t: Tone): string {
  if (t === "brand") return "var(--brand)";
  if (t === "neutral") return "var(--ink-faint)";

  return `var(--${t})`;
}

/** Tinta del tono — texto e iconos sobre el lienzo. */
export function toneInk(t: Tone): string {
  if (t === "brand") return "var(--brand-text)";
  if (t === "neutral") return "var(--ink-soft)";

  return `var(--${t}-text)`;
}

/** Velo del tono — el fondo tenue de una píldora o un icono. */
export function toneWash(t: Tone, pct = 14): string {
  return `color-mix(in oklab, ${toneFill(t)} ${pct}%, transparent)`;
}

/** Halo del tono — el brillo difuso detrás de una superficie. */
export function toneGlow(t: Tone, pct = 26): string {
  return `color-mix(in oklab, ${toneFill(t)} ${pct}%, transparent)`;
}

// ── Formato ────────────────────────────────────────────────────────────────
/** Números con la coma decimal y el punto de millar de la región. */
const NUM = new Intl.NumberFormat(localeActual(), { maximumFractionDigits: 1 });

export function fmtValue(v: number | string): string {
  if (typeof v === "number") return Number.isFinite(v) ? NUM.format(v) : "—";

  return v === "" ? "—" : v;
}

/** −0,124 → «12,4 %». El signo lo lleva la flecha de la píldora, no el número. */
export function fmtDelta(trend: number): string {
  return `${NUM.format(Math.abs(trend) * 100)} %`;
}

export function deltaDirection(trend?: number | null): "up" | "down" | "flat" {
  if (trend == null) return "flat";
  if (trend > 0.02) return "up";
  if (trend < -0.02) return "down";

  return "flat";
}

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

  if (!Number.isFinite(s)) return "—";
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;

  return `hace ${Math.floor(s / 86400)} d`;
}

export function clockOf(iso: string): string {
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) return "";

  return d.toLocaleTimeString(localeActual(), {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Iniciales para el avatar de una fila de actividad. */
export function initialsOf(text: string): string {
  const parts = (text || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "··";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return (parts[0][0] + parts[1][0]).toUpperCase();
}
