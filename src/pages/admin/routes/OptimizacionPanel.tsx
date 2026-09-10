import { Sparkles, Route as RouteIcon, Timer, Info } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  fechaOptimizacion,
  fraseAhorro,
  km,
  minutos,
  type AhorroRuta,
} from "./routeOptimizacion";

import {
  StatusBadge,
  MetricTile,
  DeltaPill,
  InfoNote,
  Cifra,
} from "@/components/kit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA INSIGNIA Y EL AHORRO
 *
 * Dos piezas que aparecen en el formulario, en la ficha y en el tablero de
 * patrulla. Están juntas y fuera de las tres porque tienen que decir LO MISMO:
 * una ruta no puede salir «optimizada» en una pantalla y «sin optimizar» en la
 * de al lado, ni enseñar 8,4 km de ahorro aquí y 8 km allá.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Optimizada (y desde cuándo) o sin optimizar.
 *
 * La fecha NO es adorno: el servidor apaga la marca en cuanto alguien toca las
 * paradas, así que «optimizada el 12 de agosto» es lo que distingue un orden
 * que se calculó de uno que se calculó y luego se manoseó.
 */
export function InsigniaOptimizada({
  optimizada,
  optimizadaEn,
  compacta = false,
}: {
  optimizada?: boolean | null;
  optimizadaEn?: string | null;
  /** Sin la fecha — para las filas de una lista, donde no cabe. */
  compacta?: boolean;
}) {
  const { t } = useTranslation();

  if (!optimizada)
    return (
      <StatusBadge tone="neutral">
        {t("routes.optimizacion.sinOptimizar", "Sin optimizar")}
      </StatusBadge>
    );
  const fecha = compacta ? null : fechaOptimizacion(optimizadaEn);

  return (
    <StatusBadge tone="ok">
      {fecha ? `Optimizada · ${fecha}` : "Optimizada"}
    </StatusBadge>
  );
}

/**
 * EL AHORRO. La cifra que justifica el botón.
 *
 * Va grande y en positivo («-8,4 km · -22 min frente al orden manual») porque es
 * lo único que convierte «reordenar paradas» en combustible que no se gasta. Si
 * no hubo ahorro se dice igual de claro: un panel vacío deja al operador
 * pensando que el botón no funcionó.
 */
export function PanelAhorro({
  ahorro,
  optimizadaEn,
  className,
}: {
  ahorro: AhorroRuta | null;
  optimizadaEn?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const frase = fraseAhorro(ahorro);

  if (!ahorro) return null;

  if (!frase) {
    return (
      <InfoNote
        className={className}
        icon={<Info />}
        title={t(
          "routes.optimizacion.yaEnMejorOrden",
          "Ya estaba en el mejor orden posible",
        )}
        tone="neutral"
      >
        Se recalculó el recorrido y no hizo falta mover ninguna parada. El orden
        que había ya era el más corto.
      </InfoNote>
    );
  }

  const fecha = fechaOptimizacion(optimizadaEn);

  return (
    <div className={className}>
      <div
        className="flex flex-col gap-1 rounded-2xl border px-5 py-4"
        style={{
          background: "color-mix(in oklab, var(--ok) 12%, transparent)",
          borderColor: "color-mix(in oklab, var(--ok) 30%, transparent)",
        }}
      >
        <div
          className="cg-eyebrow flex items-center gap-1.5"
          style={{ color: "var(--ok-text)" }}
        >
          <Sparkles className="size-3.5" />{" "}
          {t(
            "routes.optimizacion.ahorroDeEstaOptimizacion",
            "Ahorro de esta optimización",
          )}
        </div>
        <div
          className="font-display text-2xl font-bold leading-tight tracking-tight tabular-nums sm:text-3xl"
          style={{ color: "var(--ok-text)" }}
        >
          {frase}
        </div>
        {ahorro.porcentaje != null && ahorro.porcentaje >= 1 && (
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--ok-text)" }}
          >
            {Math.round(ahorro.porcentaje)} % menos de recorrido
          </div>
        )}
        {fecha && (
          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Calculado el {fecha}. Si cambias las paradas o los extremos, el
            orden vuelve a ser manual.
          </div>
        )}
      </div>

      {/* Las dos advertencias que EXPLICAN un orden inesperado. Sin ellas, el
          operador ve paradas «mal colocadas» y culpa al cálculo. */}
      {ahorro.sinCoordenadas != null && ahorro.sinCoordenadas > 0 && (
        <InfoNote className="mt-3" icon={<Info />} tone="info">
          {ahorro.sinCoordenadas === 1
            ? "Una parada no tiene ubicación: conserva su posición en la lista y las demás se repartieron por los huecos."
            : `${ahorro.sinCoordenadas} paradas no tienen ubicación: conservan su posición en la lista y las demás se repartieron por los huecos.`}
        </InfoNote>
      )}
      {ahorro.truncado && (
        <InfoNote className="mt-3" icon={<Info />} tone="warn">
          La ruta tiene demasiadas paradas y el cálculo no las cubrió todas.
          Revisa el orden del final del recorrido.
        </InfoNote>
      )}

      {(ahorro.kmAntes != null || ahorro.minAntes != null) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {ahorro.kmDespues != null && (
            <MetricTile
              delta={
                ahorro.km != null && ahorro.km >= 0.05
                  ? { value: `-${km(ahorro.km)}`, direction: "down" }
                  : undefined
              }
              hint={
                ahorro.kmAntes != null
                  ? `Antes: ${km(ahorro.kmAntes)}`
                  : undefined
              }
              icon={<RouteIcon />}
              label={t(
                "routes.optimizacion.distanciaDelRecorrido",
                "Distancia del recorrido",
              )}
              value={
                <Cifra
                  decimales={ahorro.kmDespues < 10 ? 1 : 0}
                  valor={ahorro.kmDespues}
                />
              }
            />
          )}
          {ahorro.minDespues != null && (
            <MetricTile
              delta={
                ahorro.min != null && ahorro.min >= 0.5
                  ? { value: `-${minutos(ahorro.min)}`, direction: "down" }
                  : undefined
              }
              hint={
                ahorro.minAntes != null
                  ? `Antes: ${minutos(ahorro.minAntes)} · incluye la permanencia en cada parada, a marcha de tráfico urbano`
                  : undefined
              }
              icon={<Timer />}
              label="Tiempo en ruta"
              value={<Cifra valor={Math.round(ahorro.minDespues)} />}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * El ahorro en UNA línea, para donde no cabe el panel (la tarjeta de una lista).
 * Misma cifra, mismo formato — sólo cambia el tamaño.
 */
export function LineaAhorro({
  ahorro,
  className,
}: {
  ahorro: AhorroRuta | null;
  className?: string;
}) {
  const frase = fraseAhorro(ahorro);

  if (!frase) return null;

  return (
    <DeltaPill className={className} direction="down" valence="good">
      {frase}
    </DeltaPill>
  );
}
