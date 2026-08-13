/**
 * ════════════════════════════════════════════════════════════════════════════
 * CARRUSEL DE CIFRAS — la capa de datos que flota sobre el mapa
 * En un teléfono las cifras no pueden empujar el mapa fuera de la pantalla: se
 * deslizan por encima. Una tarjeta por métrica, anclaje horizontal, y el hueco
 * entre tarjetas deja pasar el dedo al mapa.
 *
 * ── DOS DECISIONES QUE PARECEN DETALLE Y NO LO SON ─────────────────────────
 * 1. El carril va con `pointer-events: none` EN LÍNEA y cada tarjeta con
 *    `auto`. `.cg-sobre-mapa > *` (glass.css, sin capa) pone `auto` al carril y
 *    ganaría a cualquier utilidad, así que el estilo en línea es la única forma
 *    de devolverle al mapa los huecos. El desplazamiento del carrusel sigue
 *    funcionando: el gesto empieza SOBRE una tarjeta y sube al carril que la
 *    contiene, que es su contenedor de desplazamiento.
 * 2. La cifra va en `Cifra`, que transiciona al CAMBIAR y no al aparecer. Un
 *    contador que gira cada vez que entras a la pantalla es un juguete; uno que
 *    se mueve cuando sube un vigilante es información.
 * ════════════════════════════════════════════════════════════════════════════
 */
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Cifra, DeltaPill } from "@/components/kit";
import type { Kpi } from "../types";
import { deltaDirection, fmtDelta, fmtValue, toneFill, toneOf } from "../tone";

/**
 * Etiqueta corta para una tarjeta de 160 px. «Vigilantes en servicio» no cabe,
 * y recortarlo con puntos suspensivos deja «Vigilantes en se…», que no dice
 * nada. Lo que no esté aquí usa su etiqueta larga y se recorta.
 */
const CORTO: Record<string, string> = {
  onDuty: "En servicio",
  coverage: "Cobertura",
  openIncidents: "Incidentes",
  patrolsToday: "Rondas hoy",
  stations: "Puestos",
  supervisors: "Supervisores",
  response: "Respuesta",
  clients: "Clientes",
};

export function StatCarousel({ items }: { items: Array<{ kpi: Kpi; to?: string }> }) {
  if (!items.length) return null;
  return (
    <div className="cg-carrusel" style={{ pointerEvents: "none" }}>
      {items.map(({ kpi, to }) => (
        <TarjetaCifra key={kpi.key} kpi={kpi} to={to} />
      ))}
    </div>
  );
}

function TarjetaCifra({ kpi, to }: { kpi: Kpi; to?: string }) {
  const navigate = useNavigate();
  const tone = toneOf(kpi.status);
  const dir = deltaDirection(kpi.trend);
  const numero = typeof kpi.value === "number" && Number.isFinite(kpi.value);
  const ir = to ? () => navigate(to) : undefined;

  return (
    <article
      className={`cg-tarjeta-mapa cc-cifra cg-focus ${ir ? "cursor-pointer" : ""}`}
      style={{ pointerEvents: "auto" }}
      {...(ir
        ? {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": `${String(kpi.label)}: ${fmtValue(kpi.value)}${kpi.unit || ""}`,
            onClick: ir,
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); }
            },
          }
        : {})}
    >
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: toneFill(tone) }} />
        <span className="cg-eyebrow truncate">{CORTO[kpi.key] || kpi.label}</span>
      </div>

      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-display text-[26px] font-bold leading-none tracking-tight">
          {numero ? <Cifra valor={kpi.value as number} /> : fmtValue(kpi.value)}
        </span>
        {kpi.unit && (
          <span className="text-sm font-semibold" style={{ color: "var(--ink-faint)" }}>{kpi.unit}</span>
        )}
      </div>

      <div className="mt-1.5 min-h-[22px]">
        {kpi.trend != null && dir !== "flat" ? (
          <DeltaPill direction={dir} className="px-2 py-0.5 text-[11px]">{fmtDelta(kpi.trend)}</DeltaPill>
        ) : (
          <span className="block truncate text-[11px]" style={{ color: "var(--ink-faint)" }}>
            {kpi.fallback ? "Sin datos" : kpi.sub}
          </span>
        )}
      </div>
    </article>
  );
}
