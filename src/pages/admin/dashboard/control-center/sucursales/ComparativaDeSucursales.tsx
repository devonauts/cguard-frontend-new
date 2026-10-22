import type { MapEntity } from "../types";
import type {
  ListaDeSucursales,
  ResumenDeSucursales,
} from "@/lib/api/sucursalesService";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownUp, BarChart3, Globe2, LogIn } from "lucide-react";

import { Panel } from "../components/Panel";

import { useParadas, type Parada } from "./paradas";

import { useEspacio } from "@/hooks/useEspacio";

/**
 * LA COMPARATIVA DE SUCURSALES (Sucursales 2.0, fase 3).
 *
 * En la vista global, debajo del mapa: una fila por sucursal con lo que
 * importa en un puesto de mando —cobertura, gente en turno, puestos, sin
 * cubrir, en riesgo, incidentes abiertos— y la fila del total, que es la suma
 * (cuadra con el mapa). Se ordena por cualquier columna; lo malo (puestos sin
 * cubrir, pánicos) va en rojo para que salte a la vista.
 *
 * Tocar una fila lleva el mapa de arriba a esa ciudad (`onVer`); «Entrar»
 * cambia el espacio de trabajo a esa sucursal.
 */
type Columna =
  | "cobertura"
  | "enTurno"
  | "estaciones"
  | "uncovered"
  | "at_risk"
  | "incidentesAbiertos";

const valor = (p: Parada, c: Columna): number => {
  if (c === "cobertura") return p.cobertura ?? -1;
  const v = p.cifras?.[c];

  return typeof v === "number" ? v : -1;
};

export function ComparativaDeSucursales({
  lista,
  resumen,
  entities,
  activa,
  onVer,
  className,
}: {
  lista: ListaDeSucursales;
  resumen?: ResumenDeSucursales;
  entities: MapEntity[];
  activa?: string;
  onVer: (clave: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { entrar } = useEspacio();
  const paradas = useParadas(lista, resumen, entities);
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean } | null>(
    null,
  );

  const global = paradas.find((p) => p.global);
  const filas = paradas.filter((p) => !p.global);

  if (filas.length < 2) return null;
  const ordenadas = orden
    ? [...filas].sort(
        (a, b) =>
          (valor(a, orden.col) - valor(b, orden.col)) * (orden.asc ? 1 : -1),
      )
    : filas;

  const columnas: Array<{ col: Columna; etiqueta: string }> = [
    { col: "cobertura", etiqueta: t("sucursales.cifras.cobertura") },
    { col: "enTurno", etiqueta: t("sucursales.cifras.enTurno") },
    { col: "estaciones", etiqueta: t("sucursales.cifras.estacionesCorto") },
    { col: "uncovered", etiqueta: t("sucursales.comparativa.sinCubrir") },
    { col: "at_risk", etiqueta: t("sucursales.comparativa.enRiesgo") },
    {
      col: "incidentesAbiertos",
      etiqueta: t("sucursales.comparativa.incidentes"),
    },
  ];

  const celda = (p: Parada, col: Columna) => {
    if (col === "cobertura")
      return p.cobertura == null ? "—" : `${p.cobertura}%`;
    const v = p.cifras?.[col];

    return typeof v === "number" ? String(v) : "—";
  };
  const malo = (p: Parada, col: Columna) =>
    (col === "uncovered" && (p.cifras?.uncovered || 0) > 0) ||
    (col === "cobertura" && p.cobertura != null && p.cobertura < 80);

  const Fila = ({ p, total = false }: { p: Parada; total?: boolean }) => (
    <tr
      className={`border-t transition-colors ${total ? "font-semibold" : "cursor-pointer hover:bg-[color-mix(in_oklab,var(--ink)_4%,transparent)]"}`}
      style={{
        borderColor: "var(--hairline)",
        background:
          !total && activa === p.clave
            ? `color-mix(in oklab, ${p.color} 9%, transparent)`
            : undefined,
      }}
      onClick={total ? () => onVer(p.clave) : () => onVer(p.clave)}
    >
      <td className="py-2.5 pl-3 pr-2">
        <span className="flex min-w-0 items-center gap-2">
          {p.global ? (
            <Globe2
              className="size-3.5 shrink-0"
              style={{ color: "var(--brand-text, var(--brand))" }}
            />
          ) : (
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: p.color }}
            />
          )}
          <span className="truncate">
            {p.global ? t("sucursales.comparativa.total") : p.nombre}
          </span>
          {p.principal && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                background:
                  "color-mix(in oklab, var(--brand) 16%, transparent)",
                color: "var(--brand-text, var(--brand))",
              }}
            >
              {t("sucursales.principal")}
            </span>
          )}
          {p.emergencias > 0 && (
            <span
              aria-label={t("sucursales.cifras.panicos", {
                count: p.emergencias,
              })}
              className="size-2 shrink-0 animate-pulse rounded-full"
              style={{ background: "var(--bad)" }}
            />
          )}
        </span>
      </td>
      {columnas.map(({ col }) => (
        <td
          key={col}
          className="px-2 py-2.5 text-right tabular-nums"
          style={{ color: malo(p, col) ? "var(--bad)" : undefined }}
        >
          {celda(p, col)}
        </td>
      ))}
      <td className="py-2.5 pl-2 pr-3 text-right">
        {!total && (
          <button
            aria-label={t("sucursales.mapa.entrar")}
            className="cg-focus inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ color: "var(--brand-text, var(--brand))" }}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              entrar(p.clave);
            }}
          >
            <LogIn className="size-3.5" />
            <span className="hidden sm:inline">
              {t("sucursales.mapa.entrar")}
            </span>
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <Panel
      className={className}
      icon={<BarChart3 />}
      subtitle={t("sucursales.comparativa.subtitulo")}
      title={t("sucursales.comparativa.titulo")}
    >
      <div className="-mx-1 mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-xs" style={{ color: "var(--ink-faint)" }}>
              <th className="pb-2 pl-3 pr-2 text-left font-medium">
                {t("sucursales.comparativa.sucursal")}
              </th>
              {columnas.map(({ col, etiqueta }) => (
                <th key={col} className="px-2 pb-2 text-right font-medium">
                  <button
                    className="cg-focus inline-flex items-center gap-1 rounded"
                    type="button"
                    onClick={() =>
                      setOrden((o) =>
                        o?.col === col
                          ? { col, asc: !o.asc }
                          : { col, asc: col === "cobertura" },
                      )
                    }
                  >
                    {etiqueta}
                    <ArrowDownUp
                      className="size-3"
                      style={{ opacity: orden?.col === col ? 1 : 0.35 }}
                    />
                  </button>
                </th>
              ))}
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((p) => (
              <Fila key={p.clave} p={p} />
            ))}
            {global && <Fila total p={global} />}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
