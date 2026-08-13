import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepIndicatorStep {
  label: string;
}

interface StepIndicatorProps {
  steps: StepIndicatorStep[];
  /** Zero-based index of the active step. */
  current: number;
  /** Optional click handler to allow jumping to a (completed) step. */
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * Numbered horizontal stepper with connectors, responsive labels and accessible
 * markup (aria-current on the active step).
 *
 * El estado activo/completado es el ACENTO, no un oro fijo: el número activo va
 * sobre `--brand` con tinta `--brand-ink` (blanco encima daría ~2,2:1 — ver la
 * medición en tokens.css), el completado en el lavado del acento, y el conector
 * lleno se pinta con `--brand`, que se recalcula solo al cambiar el tono.
 */
export default function StepIndicator({
  steps,
  current,
  onStepClick,
  className,
}: StepIndicatorProps) {
  return (
    <nav aria-label="Progreso de configuración" className={cn("w-full", className)}>
      <ol className="flex items-center">
        {steps.map((step, i) => {
          const isCompleted = i < current;
          const isActive = i === current;
          const isLast = i === steps.length - 1;
          const clickable = Boolean(onStepClick) && (isCompleted || isActive);

          return (
            <li
              key={step.label}
              className={cn("flex items-center", !isLast && "flex-1")}
            >
              <button
                type="button"
                disabled={!clickable}
                onClick={() => clickable && onStepClick?.(i)}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Paso ${i + 1}: ${step.label}`}
                className={cn(
                  "cg-focus group flex items-center gap-2.5 rounded-full",
                  clickable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold tabular-nums transition-all duration-300"
                  style={
                    isActive
                      ? { borderColor: "var(--brand)", background: "var(--brand)", color: "var(--brand-ink)", boxShadow: "0 0 0 4px var(--brand-glow)" }
                      : isCompleted
                        ? { borderColor: "var(--brand-line)", background: "var(--brand-wash)", color: "var(--brand-text)" }
                        : { borderColor: "var(--hairline)", background: "var(--glass-sunken)", color: "var(--ink-faint)" }
                  }
                >
                  {isCompleted ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className="hidden text-sm font-medium transition-colors sm:inline-block"
                  style={{ color: isActive ? "var(--ink)" : isCompleted ? "var(--ink-soft)" : "var(--ink-faint)" }}
                >
                  {step.label}
                </span>
              </button>

              {!isLast && (
                <span
                  aria-hidden
                  className="mx-2 h-0.5 flex-1 overflow-hidden rounded-full sm:mx-3"
                  style={{ background: "var(--hairline)" }}
                >
                  <span
                    className="block h-full rounded-full transition-all duration-500"
                    style={{
                      width: isCompleted ? "100%" : "0%",
                      background: "var(--brand)",
                    }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
