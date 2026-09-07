import { memo } from "react";
import { useTranslation } from 'react-i18next';
/**
 * El instrumento de cobertura: qué parte de los puestos tiene un vigilante
 * encima AHORA. Es la pregunta que un jefe de operaciones hace primero, así que
 * se dibuja como un dial y no como una fila más de una tabla.
 *
 * El arco va con el ACENTO (es el instrumento principal de la pantalla); la
 * salud — bien / justo / descubierto — la dice la píldora semántica, que es
 * fija y no cambia con el acento que el usuario elija.
 */
import { motion, useReducedMotion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/kit";
import { MeterBar } from "@/components/charts";
import { fmtValue } from "../tone";

/** 270° de recorrido y el hueco abajo: se lee como dial, no como tarta. */
const SWEEP = 75; // % de la circunferencia (pathLength = 100)

function CoverageGaugeBase({ coverage, onDuty, stations }: {
  coverage: number | null; onDuty: number; stations: number;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const pct = coverage == null ? 0 : Math.max(0, Math.min(100, coverage));
  const sinCubrir = Math.max(0, stations - onDuty);
  const salud =
    coverage == null ? { tone: "neutral", label: t("dashboard.coverage.noData") }
    : coverage >= 80 ? { tone: "ok", label: t("dashboard.coverage.normal") }
    : coverage >= 50 ? { tone: "warn", label: t("dashboard.coverage.tight") }
    : { tone: "bad", label: t("dashboard.coverage.uncovered") };

  return (
    <div className="flex flex-col items-center px-5 pb-5 pt-4">
      <div className="relative grid place-items-center">
        <svg viewBox="0 0 120 120" className="size-44 -rotate-[0deg]" role="img" aria-label={`Cobertura ${pct} por ciento`}>
          <defs>
            <linearGradient id="cg-arc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.45" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="1" />
            </linearGradient>
          </defs>
          {/* Canal */}
          <circle
            cx="60" cy="60" r="48" pathLength={100}
            fill="none" stroke="var(--hairline)" strokeWidth={10} strokeLinecap="round"
            strokeDasharray={`${SWEEP} ${100 - SWEEP}`}
            transform="rotate(135 60 60)"
          />
          {/* Arco */}
          <motion.circle
            cx="60" cy="60" r="48" pathLength={100}
            fill="none" stroke="url(#cg-arc)" strokeWidth={10} strokeLinecap="round"
            className="cmd-ring-glow"
            transform="rotate(135 60 60)"
            initial={reduce ? false : { strokeDasharray: `0 100` }}
            animate={{ strokeDasharray: `${(SWEEP * pct) / 100} 100` }}
            transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <div className="font-display text-4xl font-bold leading-none tabular-nums">
            {coverage == null ? "—" : fmtValue(coverage)}
            {coverage != null && <span className="text-xl" style={{ color: "var(--ink-faint)" }}>%</span>}
          </div>
          <div className="cg-eyebrow mt-1.5">{t("dashboard.coverage.eyebrow")}</div>
        </div>
      </div>

      <StatusBadge tone={salud.tone} className="mt-1">{salud.label}</StatusBadge>

      <div className="mt-5 w-full space-y-3">
        <Linea label={t("dashboard.coverage.covered")} value={`${onDuty}/${stations}`} pct={stations ? (onDuty / stations) * 100 : 0} tone="ok" />
        <Linea label={t("dashboard.coverage.none")} value={String(sinCubrir)} pct={stations ? (sinCubrir / stations) * 100 : 0} tone={sinCubrir > 0 ? "warn" : "neutral"} />
      </div>

      <div className="mt-4 flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-faint)" }}>
        <ShieldCheck className="size-3.5" />
        {t("dashboard.coverage.footnote")}
      </div>
    </div>
  );
}

function Linea({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: "ok" | "warn" | "neutral" }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{label}</span>
        <span className="text-xs font-semibold tabular-nums">{value}</span>
      </div>
      <MeterBar pct={pct} tone={tone} height={7} ariaLabel={label} />
    </div>
  );
}

/* ── MEMOIZADO ──────────────────────────────────────────────────────────────
   El panel se re-renderiza con cada ping de GPS —hasta 33 veces por segundo con
   mil vigilantes en movimiento— porque el hook devuelve un objeto de estado
   nuevo. Este componente no depende de las posiciones, así que sin `memo`
   repintaba 33 veces por segundo para enseñar exactamente lo mismo.
   No es el arreglo de fondo (ese es sacar `entities` del objeto grande), pero
   corta el coste donde se paga. */
export const CoverageGauge = memo(CoverageGaugeBase);
