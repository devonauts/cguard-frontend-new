import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserX } from "lucide-react";

import DataReport, { type ReportColumn } from "./DataReport";
import { showName } from "./reportPrivacy";
import { formatDateTime, rangeBounds, warnIfCapped } from "./reportFormat";

import { StatCard, StatsStrip } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * COBERTURA Y AUSENCIAS
 *
 * Una fila por NOVEDAD de ausencia: quién faltó, por qué, en qué puesto, si
 * quedó cubierto y por quién, y cuánto tiempo estuvo vacío. Arriba, el resumen
 * que el gerente mira primero (cuántas, qué porcentaje se cubrió, qué puestos
 * tienen más huecos, a quién se recurre más) y el uso de cada sacafranco.
 *
 * El filtro de cliente y de sede va al SERVIDOR, con el rango: el informe
 * trae sólo lo que se va a ver. Las opciones de los dos selectores vienen en
 * la misma respuesta, así que no hay que pedirlas aparte.
 * ════════════════════════════════════════════════════════════════════════════
 */

interface Ausencia {
  id: string;
  fecha: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  vigilante: string;
  puesto: string;
  sede: string;
  cliente: string;
  reason: string;
  motivo: string;
  nota?: string;
  status: "open" | "covered" | "resolved" | string;
  cubierta: boolean;
  cubiertaPor: string;
  cubiertaPorSacafranco: boolean;
  minutosSinCubrir: number;
  horasDelTurno: number;
}

interface UsoDeSacafranco {
  guardId: string;
  vigilante: string;
  sacafranco: boolean;
  coberturas: number;
  horas: number;
  puestos: { puesto: string; veces: number }[];
}

interface Resumen {
  total: number;
  cubiertas: number;
  abiertas: number;
  porcentajeCubiertas: number;
  minutosSinCubrir: number;
  horasCubiertas: number;
  puestosConMasHuecos: { puesto: string; huecos: number; sinCubrir: number }[];
  sacafrancoMasUsado: { vigilante: string; coberturas: number; horas: number } | null;
  porMotivo: { reason: string; motivo: string; total: number }[];
}

interface Respuesta {
  resumen: Resumen;
  ausencias: Ausencia[];
  sacafrancos: UsoDeSacafranco[];
  filtros: {
    clientes: { id: string; nombre: string }[];
    sedes: { id: string; nombre: string; clientAccountId: string | null }[];
  };
}

/** Minutos → «45 min» / «3 h 10». */
const duracion = (min: number) => {
  const n = Math.max(0, Math.round(Number(min) || 0));

  if (n < 60) return `${n} min`;

  return `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, "0")}`;
};

export default function CoverageAbsences() {
  const { t } = useTranslation();
  const [cliente, setCliente] = useState("");
  const [sede, setSede] = useState("");
  const [filtros, setFiltros] = useState<Respuesta["filtros"]>({
    clientes: [],
    sedes: [],
  });
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [sacafrancos, setSacafrancos] = useState<UsoDeSacafranco[]>([]);
  // Los filtros los lee `cargar`, que es un callback memorizado: sin la
  // referencia se quedaría con lo que había al montarse y «Aplicar» no haría nada.
  const clienteRef = useRef("");
  const sedeRef = useRef("");

  clienteRef.current = cliente;
  sedeRef.current = sede;

  const estado = useCallback(
    (a: Ausencia) =>
      a.cubierta
        ? t("ui.CoverageAbsences.cubierta", "Cubierta")
        : a.status === "open"
          ? t("ui.CoverageAbsences.sinCubrir", "Sin cubrir")
          : t("ui.CoverageAbsences.resuelta", "Resuelta sin reemplazo"),
    [t],
  );

  const columns: ReportColumn<Ausencia>[] = useMemo(
    () => [
      {
        key: "when",
        label: t("ui.CoverageAbsences.turno", "Turno"),
        value: (r) => formatDateTime(r.windowStart),
      },
      {
        key: "guard",
        label: t("ui.CoverageAbsences.vigilante", "Vigilante"),
        value: (r) => r.vigilante || "—",
        privacy: "guardName",
      },
      {
        key: "station",
        label: t("ui.CoverageAbsences.puesto", "Puesto"),
        value: (r) => r.puesto || "—",
        privacy: "stationName",
      },
      {
        key: "site",
        label: t("ui.CoverageAbsences.sedeCliente", "Sede · Cliente"),
        // Two names in one cell: each obeys its own switch in exported files.
        value: (r, mask = showName) =>
          [mask("siteName", r.sede), mask("clientName", r.cliente)]
            .filter(Boolean)
            .join(" · ") || "—",
      },
      {
        key: "reason",
        label: t("ui.CoverageAbsences.motivo", "Motivo"),
        value: (r) => r.motivo || "—",
      },
      {
        key: "status",
        label: t("ui.CoverageAbsences.estado", "Estado"),
        value: estado,
        align: "center",
      },
      {
        key: "coveredBy",
        label: t("ui.CoverageAbsences.cubiertaPor", "Cubierta por"),
        value: (r) =>
          r.cubiertaPor
            ? r.cubiertaPorSacafranco
              ? `${r.cubiertaPor} · ${t("ui.CoverageAbsences.sacafranco", "sacafranco")}`
              : r.cubiertaPor
            : "—",
        privacy: "guardName",
      },
      {
        key: "open",
        label: t("ui.CoverageAbsences.tiempoVacio", "Tiempo vacío"),
        value: (r) => (r.minutosSinCubrir ? duracion(r.minutosSinCubrir) : "—"),
        align: "right",
      },
      {
        key: "hours",
        label: t("ui.CoverageAbsences.horasDelTurno", "Horas del turno"),
        value: (r) => String(r.horasDelTurno ?? "—"),
        align: "right",
      },
      {
        key: "note",
        label: t("ui.CoverageAbsences.nota", "Nota"),
        value: (r) => r.nota || "—",
      },
    ],
    [t, estado],
  );

  const cargar = useCallback(async ({ from, to }: { from: string; to: string }) => {
    const tenantId = localStorage.getItem("tenantId") || "";
    const { start, end } = rangeBounds(from, to);
    const params = new URLSearchParams({ from: start, to: end });

    if (clienteRef.current) params.append("clientAccountId", clienteRef.current);
    if (sedeRef.current) params.append("postSiteId", sedeRef.current);
    const res: Respuesta = await ApiService.get(
      `/tenant/${tenantId}/reports/coverage-absences?${params.toString()}`,
    );

    setResumen(res?.resumen || null);
    setSacafrancos(res?.sacafrancos || []);
    if (res?.filtros) setFiltros(res.filtros);

    return warnIfCapped(res?.ausencias || []);
  }, []);

  const sedesDelCliente = cliente
    ? filtros.sedes.filter((s) => s.clientAccountId === cliente)
    : filtros.sedes;

  const resumenArriba = resumen ? (
    <div className="space-y-4">
      <StatsStrip className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          flat
          hint={
            resumen.abiertas
              ? t("ui.CoverageAbsences.nSinCubrir", {
                  defaultValue: "{{count}} sin cubrir ahora",
                  count: resumen.abiertas,
                })
              : t("ui.CoverageAbsences.todasAtendidas", "todas atendidas")
          }
          label={t("ui.CoverageAbsences.ausencias", "Ausencias")}
          value={resumen.total}
        />
        <StatCard
          flat
          accent={resumen.porcentajeCubiertas >= 90 ? "ok" : "warn"}
          hint={t("ui.CoverageAbsences.deN", {
            defaultValue: "{{cubiertas}} de {{total}}",
            cubiertas: resumen.cubiertas,
            total: resumen.total,
          })}
          label={t("ui.CoverageAbsences.cubiertas", "Cubiertas")}
          value={`${resumen.porcentajeCubiertas}%`}
        />
        <StatCard
          flat
          hint={
            resumen.puestosConMasHuecos[0]
              ? t("ui.CoverageAbsences.nHuecos", {
                  defaultValue: "{{count}} huecos",
                  count: resumen.puestosConMasHuecos[0].huecos,
                })
              : undefined
          }
          label={t("ui.CoverageAbsences.puestoConMasHuecos", "Puesto con más huecos")}
          value={resumen.puestosConMasHuecos[0]?.puesto || "—"}
        />
        <StatCard
          flat
          hint={
            resumen.sacafrancoMasUsado
              ? t("ui.CoverageAbsences.nCoberturasHoras", {
                  defaultValue: "{{count}} coberturas · {{horas}} h",
                  count: resumen.sacafrancoMasUsado.coberturas,
                  horas: resumen.sacafrancoMasUsado.horas,
                })
              : undefined
          }
          label={t("ui.CoverageAbsences.sacafrancoMasUsado", "Sacafranco más usado")}
          value={resumen.sacafrancoMasUsado?.vigilante || "—"}
        />
      </StatsStrip>

      {sacafrancos.length > 0 && (
        <div className="glass-flat p-4">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">
              {t("ui.CoverageAbsences.usoDeSacafrancos", "Uso de sacafrancos")}
            </h3>
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {t("ui.CoverageAbsences.horasCubiertasEnTotal", {
                defaultValue: "{{horas}} h cubiertas en total",
                horas: resumen.horasCubiertas,
              })}
            </span>
          </div>
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {sacafrancos.map((s) => (
              <li
                key={s.guardId}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm"
              >
                <span className="font-semibold">
                  {s.vigilante || "—"}
                  {!s.sacafranco && (
                    <span
                      className="ml-1.5 text-xs font-normal"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {t("ui.CoverageAbsences.fijoQueCubrio", "fijo que cubrió")}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">
                  {t("ui.CoverageAbsences.nCoberturasHoras", {
                    defaultValue: "{{count}} coberturas · {{horas}} h",
                    count: s.coberturas,
                    horas: s.horas,
                  })}
                </span>
                <span
                  className="basis-full text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {s.puestos.map((p) => `${p.puesto} ×${p.veces}`).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resumen.porMotivo.length > 0 && (
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {t("ui.CoverageAbsences.porMotivo", "Por motivo")}:{" "}
          {resumen.porMotivo.map((m) => `${m.motivo} ${m.total}`).join(" · ")}
        </p>
      )}
    </div>
  ) : null;

  return (
    <DataReport<Ausencia>
      columns={columns}
      description={t(
        "ui.CoverageAbsences.descripcion",
        "Quién faltó y por qué, si el puesto quedó cubierto y por quién, cuánto estuvo vacío y cuánto trabajan los sacafrancos. Filtra por cliente o sede y expórtalo.",
      )}
      extraFilters={
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="cg-eyebrow" htmlFor="filtro-cliente">
              {t("ui.CoverageAbsences.cliente", "Cliente")}
            </label>
            <select
              className="cg-input w-full px-3 py-2 text-sm"
              id="filtro-cliente"
              value={cliente}
              onChange={(e) => {
                setCliente(e.target.value);
                setSede("");
              }}
            >
              <option value="">
                {t("ui.CoverageAbsences.todosLosClientes", "Todos los clientes")}
              </option>
              {filtros.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="cg-eyebrow" htmlFor="filtro-sede">
              {t("ui.CoverageAbsences.sede", "Sede")}
            </label>
            <select
              className="cg-input w-full px-3 py-2 text-sm"
              id="filtro-sede"
              value={sede}
              onChange={(e) => setSede(e.target.value)}
            >
              <option value="">
                {t("ui.CoverageAbsences.todasLasSedes", "Todas las sedes")}
              </option>
              {sedesDelCliente.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
      icon={UserX}
      load={cargar}
      // Un puesto que sigue vacío pide que alguien mire; una ausencia cubierta
      // tarde también.
      rowTone={(r) =>
        r.status === "open" ? "bad" : r.minutosSinCubrir > 0 ? "warn" : undefined
      }
      summary={resumenArriba}
      title={t("ui.CoverageAbsences.titulo", "Cobertura y ausencias")}
    />
  );
}
