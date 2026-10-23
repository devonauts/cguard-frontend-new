import type { Client } from "@/types/client";
import type { ChartTone } from "@/lib/chartColors";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  MapPin,
  Shield,
  ShieldAlert,
  Clock,
  CheckCircle2,
  Crosshair,
  RefreshCw,
  Route as RouteIcon,
  ChevronRight,
  LayoutGrid,
  Locate,
  Satellite,
  Map as MapIcon,
  ExternalLink,
  MoreVertical,
  Trash2,
  Users,
  CalendarDays,
} from "lucide-react";

import {
  FIELD_CLS,
  TabTable,
  THead,
  Th,
  Tr,
  Pager,
  TabFooter,
  TabLoading,
} from "../_shared/tab-kit";

import ScheduleCard from "./ScheduleCard";

import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import { MeterBar } from "@/components/charts";
import { clientService } from "@/lib/api/clientService";
import GoogleMapEmbed from "@/components/GoogleMap/GoogleMapEmbed";
import {
  Section,
  EmptyState,
  StatusBadge,
  IconTile,
  Segmented,
  SearchInput,
} from "@/components/kit";
import { Button } from "@/components/ui/button";
import { ApiService } from "@/services/api/apiService";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { localeActual } from "@/lib/localeActual";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useSondeoVisible } from "@/hooks/useSondeoVisible";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

// ── Shape of GET /client-account/:id/coverage (clientAccountCoverage.ts) ──
type CoverageStatus =
  | "cubierto"
  | "parcial"
  | "sin_cobertura"
  | "asignado_sin_marcar"
  | "sin_turno";
type BadgeTone = "ok" | "warn" | "bad" | "neutral";
interface CoverageSede {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}
interface CoveragePuesto {
  id: string;
  name: string;
  nickname: string | null;
  type: "patrulla" | "fijo";
  lat: number | null;
  lng: number | null;
  window: string | null;
  turno: string | null;
  required: number;
  onPost: number;
  guards: string[];
  assigned: string[];
  coveragePct: number | null;
  status: CoverageStatus;
  lastActivity: { type: "ronda" | "checkin" | "none"; time?: string };
  hasNovelty: boolean;
  nextShiftAt: string | null;
}
interface CoverageTurnoSummary {
  key: string;
  label: string;
  window: string;
  required: number;
  covered: number;
  pct: number;
}
interface CoverageSinCobertura {
  id: string;
  name: string;
  window: string | null;
  turno: string | null;
  requiredGuards: number;
}
interface CoverageProximo {
  id: string;
  name: string;
  window: string;
  turno: string;
  startsInMin: number;
}
interface CoverageKpis {
  puestosTotales: number;
  puestosCubiertos: number;
  coberturaPct: number;
  guardiasEnPuestos: number;
  guardiasRequeridas: number;
  puestosSinCobertura: number;
  proximosAIniciar: number;
  puestosConNovedad: number;
  cumplimientoHoy: number;
}
interface CoverageData {
  sedes: CoverageSede[];
  selectedSedeId: string | null;
  tz: string;
  objetivoPct: number;
  generalPct: number;
  kpis: CoverageKpis;
  puestos: CoveragePuesto[];
  turnoSummary: CoverageTurnoSummary[];
  sinCobertura: CoverageSinCobertura[];
  proximos: CoverageProximo[];
  updatedAt: string;
}

/** El punto del pin sale del semántico, nunca de un color escrito a mano. */
/* `label` queda como texto por defecto (español) y `labelKey` es la clave que se
   traduce DONDE SE PINTA: t(meta.labelKey, meta.label). Traducir aquí congelaría
   el texto en el idioma de arranque, porque el módulo se evalúa una sola vez. */
const STATUS_META: Record<
  string,
  {
    labelKey: string;
    label: string;
    tone: BadgeTone;
    dot: string;
    role: string;
  }
> = {
  cubierto: {
    labelKey: "coverage.status.covered",
    label: "Cubierto",
    tone: "ok",
    dot: "var(--ok)",
    role: "ok",
  },
  parcial: {
    labelKey: "ui.ClientCoverage.parcial",
    label: "Parcial",
    tone: "warn",
    dot: "var(--warn)",
    role: "warn",
  },
  asignado_sin_marcar: {
    labelKey: "ui.ClientCoverage.sinMarcar",
    label: "Sin marcar",
    tone: "warn",
    dot: "var(--warn)",
    role: "warn",
  },
  sin_cobertura: {
    labelKey: "ui.ClientCoverage.sinCobertura",
    label: "Sin cobertura",
    tone: "bad",
    dot: "var(--bad)",
    role: "crit",
  },
  sin_turno: {
    labelKey: "ui.ClientCoverage.sinTurno",
    label: "Sin turno",
    tone: "neutral",
    dot: "var(--ink-faint)",
    role: "muted",
  },
};

function Bar({ pct, status }: { pct: number; status: string }) {
  const tone: ChartTone =
    status === "sin_cobertura"
      ? "bad"
      : status === "parcial" || status === "asignado_sin_marcar"
        ? "warn"
        : status === "sin_turno"
          ? "neutral"
          : "ok";

  return <MeterBar className="min-w-[54px]" height={6} pct={pct} tone={tone} />;
}

export default function ClientCoverage({ client }: { client: Client }) {
  const { t } = useTranslation();
  /** El turno llega del servidor en español («Diurno»…); se traduce al pintar. */
  const turnoTexto = (v?: string | null) =>
    v === "Diurno"
      ? t("ui.ClientCoverage.turno.diurno", "Diurno")
      : v === "Vespertino"
        ? t("ui.ClientCoverage.turno.vespertino", "Vespertino")
        : v === "Nocturno"
          ? t("ui.ClientCoverage.turno.nocturno", "Nocturno")
          : v || "";
  const tipoTexto = (v?: string | null) =>
    v === "patrulla"
      ? t("ui.ClientCoverage.patrulla", "Patrulla")
      : t("ui.ClientCoverage.fijo", "Fijo");
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);

  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sedeId, setSedeId] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [mapType, setMapType] = useState<"satellite" | "roadmap">("satellite");
  const [centerReq, setCenterReq] = useState(0);

  // filters
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [turno, setTurno] = useState("todos");
  const [orden, setOrden] = useState("nombre");
  const [page, setPage] = useState(1);
  const PER = 10;

  const load = async (sid?: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const d = await clientService.getClientCoverage(client.id, {
        postSiteId: sid || sedeId || undefined,
      });

      setData(d);
      if (d?.selectedSedeId && d.selectedSedeId !== sedeId)
        setSedeId(d.selectedSedeId);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [client.id]);
  // Live refresh every 45s (coverage is real-time), sólo con la pestaña a la
  // vista. El hook guarda la tarea en una ref, así que sigue usando el `sedeId`
  // actual sin rearmar el reloj en cada render.
  useSondeoVisible(() => load(sedeId, true), 45_000);

  const sedes: CoverageSede[] = data?.sedes || [];
  const puestos: CoveragePuesto[] = data?.puestos || [];
  const turnoSummary: CoverageTurnoSummary[] = data?.turnoSummary || [];
  const sinCobertura: CoverageSinCobertura[] = data?.sinCobertura || [];
  const proximos: CoverageProximo[] = data?.proximos || [];

  const selected = puestos.find((p) => p.id === selectedId) || null;

  const deleteStation = async (p: CoveragePuesto) => {
    const ok = await confirmDialog({
      title: t("ui.ClientCoverage.eliminarEstacion", "Eliminar estación"),
      message: t("ui.ClientCoverage.eliminarEstacionConfirm", {
        defaultValue:
          '¿Eliminar la estación "{{name}}"? Sus horarios, asignaciones y rondas (QR) quedan huérfanos — si la vuelves a crear, las rondas NO se reconectan solas. Considera editarla en su lugar.',
        name: p.name,
      }),
      confirmText: t("actions.delete", "Eliminar"),
      tone: "danger",
    });

    if (!ok) return;
    try {
      // NOTE: stationService.delete() actually deletes POST-SITES (misleading
      // name) — the station row is DELETE /station/:id.
      const tenantId = localStorage.getItem("tenantId") || "";

      await ApiService.delete(`/tenant/${tenantId}/station/${p.id}`);
      toast.success(t("ui.ClientCoverage.estacionEliminada"));
      if (selectedId === p.id) setSelectedId(null);
      await load(sedeId, true);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "ui.ClientCoverage.noSePudoEliminarLaEstacion",
            "No se pudo eliminar la estación",
          ),
      );
    }
  };

  const changeSede = (id: string) => {
    setSedeId(id);
    setSelectedId(null);
    setPage(1);
    load(id);
  };

  const filtered = useMemo(() => {
    let list = puestos.slice();
    const ql = q.trim().toLowerCase();

    if (ql)
      list = list.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(ql) ||
          (p.nickname || "").toLowerCase().includes(ql),
      );
    if (estado !== "todos") list = list.filter((p) => p.status === estado);
    if (tipo !== "todos") list = list.filter((p) => p.type === tipo);
    if (turno !== "todos") list = list.filter((p) => (p.turno || "") === turno);
    list.sort((a, b) => {
      if (orden === "cobertura_desc")
        return (b.coveragePct ?? -1) - (a.coveragePct ?? -1);
      if (orden === "cobertura_asc")
        return (a.coveragePct ?? 999) - (b.coveragePct ?? 999);
      if (orden === "estado")
        return (a.status || "").localeCompare(b.status || "");

      return (a.name || "").localeCompare(b.name || "");
    });

    return list;
  }, [puestos, q, estado, tipo, turno, orden]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER));
  const pageItems = filtered.slice((page - 1) * PER, page * PER);
  const idxOf = (id: string) => puestos.findIndex((p) => p.id === id);

  const mapMarkers = puestos
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({
      id: p.id,
      lat: p.lat!,
      lng: p.lng!,
      label: p.name,
      role: STATUS_META[p.status]?.role || "ok",
    }));

  const selectPuesto = (p: CoveragePuesto | undefined) => {
    if (!p) return;
    setSelectedId(p.id);
    if (Number.isFinite(p.lat) && Number.isFinite(p.lng))
      setCenterReq((n) => n + 1);
  };

  const onMapClick = async (lat: number, lng: number) => {
    if (!placing || !selected) return;
    try {
      await clientService.setStationLocation(selected.id, { lat, lng });
      toast.success(
        t("ui.ClientCoverage.ubicacionFijada", {
          defaultValue: 'Ubicación de "{{name}}" fijada',
          name: selected.name,
        }),
      );
      setPlacing(false);
      await load(sedeId, true);
      setCenterReq((n) => n + 1);
    } catch {
      toast.error(t("ui.ClientCoverage.noSePudoFijarLa"));
    }
  };

  const sede = sedes.find((s) => s.id === sedeId);
  const mapCenter =
    selected && Number.isFinite(selected.lat)
      ? { lat: selected.lat!, lng: selected.lng! }
      : sede && Number.isFinite(sede.lat)
        ? { lat: sede.lat!, lng: sede.lng! }
        : mapMarkers[0]
          ? { lat: mapMarkers[0].lat, lng: mapMarkers[0].lng }
          : null;

  const fmtUpdated = data?.updatedAt
    ? new Date(data.updatedAt).toLocaleTimeString(localeActual(), {
        timeZone: zonaDeLaEmpresa(),
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  if (loading && !data) return <TabLoading />;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Sede selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex items-center gap-2 text-sm"
          style={{ color: "var(--ink-soft)" }}
        >
          <LayoutGrid className="h-4 w-4" />{" "}
          {t(
            "ui.ClientCoverage.puestosYCoberturaEnVivo",
            "Puestos y cobertura en vivo de la sede seleccionada",
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="cg-eyebrow">
            {t("ui.ClientCoverage.sedeSitio", "Sede / Sitio")}
          </label>
          <select
            className={`${FIELD_CLS} min-w-[220px]`}
            value={sedeId}
            onChange={(e) => changeSede(e.target.value)}
          >
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Horarios FIRST and full-width: it's a 14-column day grid, so squeezing
          it under the two-column layout left it cramped while the right-hand
          summary cards ran out of content and left dead space. Full bleed here,
          narrower cards below. */}
      {sedeId && <ScheduleCard clientId={client.id} sedeId={sedeId} />}

      {/* The shared client-header KPI cards (ClientsLayout) stay visible on
          this tab — no duplicate per-tab KPI row here. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr]">
        {/* LEFT — filters + table */}
        <div className="space-y-4">
          <Section
            icon={<LayoutGrid />}
            title={t("ui.ClientCoverage.estacionesDelSitio")}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SearchInput
                className="min-w-[180px] flex-1"
                placeholder={t(
                  "ui.ClientCoverage.buscarEstacionPorNombre",
                  "Buscar estación por nombre",
                )}
                value={q}
                onChange={(v) => {
                  setQ(v);
                  setPage(1);
                }}
              />
              <select
                className={FIELD_CLS}
                value={estado}
                onChange={(e) => {
                  setEstado(e.target.value);
                  setPage(1);
                }}
              >
                <option value="todos">{t("comun.estadoTodos")}</option>
                <option value="cubierto">
                  {t("coverage.status.covered", "Cubierto")}
                </option>
                <option value="parcial">
                  {t("ui.ClientCoverage.parcial", "Parcial")}
                </option>
                <option value="asignado_sin_marcar">
                  {t("ui.ClientCoverage.asignadoSinMarcar")}
                </option>
                <option value="sin_cobertura">
                  {t("ui.ClientCoverage.sinCobertura")}
                </option>
                <option value="sin_turno">
                  {t("ui.ClientCoverage.sinTurno")}
                </option>
              </select>
              <select
                className={FIELD_CLS}
                value={tipo}
                onChange={(e) => {
                  setTipo(e.target.value);
                  setPage(1);
                }}
              >
                <option value="todos">{t("comun.tipoTodos")}</option>
                <option value="fijo">{tipoTexto("fijo")}</option>
                <option value="patrulla">{tipoTexto("patrulla")}</option>
              </select>
              <select
                className={FIELD_CLS}
                value={turno}
                onChange={(e) => {
                  setTurno(e.target.value);
                  setPage(1);
                }}
              >
                <option value="todos">{t("comun.turnoTodos")}</option>
                <option value="Diurno">{turnoTexto("Diurno")}</option>
                <option value="Vespertino">{turnoTexto("Vespertino")}</option>
                <option value="Nocturno">{turnoTexto("Nocturno")}</option>
              </select>
              <select
                className={FIELD_CLS}
                value={orden}
                onChange={(e) => setOrden(e.target.value)}
              >
                <option value="nombre">
                  {t("ui.ClientCoverage.nombreAZ")}
                </option>
                <option value="cobertura_desc">
                  {t("ui.ClientCoverage.coberturaDesc", "Cobertura ↓")}
                </option>
                <option value="cobertura_asc">
                  {t("ui.ClientCoverage.coberturaAsc", "Cobertura ↑")}
                </option>
                <option value="estado">{t("comun.estado")}</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                description={t("ui.ClientCoverage.estaSedeNoTieneEstaciones")}
                icon={<LayoutGrid />}
                title={t("ui.ClientCoverage.sinEstaciones")}
              />
            ) : (
              <TabTable minWidth={860}>
                <THead className="[&>th]:whitespace-nowrap">
                  <Th>{t("ui.ClientCoverage.estacion", "Estación")}</Th>
                  <Th>{t("comun.tipo")}</Th>
                  <Th>{t("comun.turnoActual")}</Th>
                  <Th>{t("ui.ClientCoverage.guardias", "Guardias")}</Th>
                  <Th>{t("ui.ClientCoverage.cobertura", "Cobertura")}</Th>
                  <Th>{t("comun.estado")}</Th>
                  <Th>
                    {t("ui.ClientCoverage.ultimaActividad", "Última actividad")}
                  </Th>
                  <Th aria-label={t("ui.RouteForm.acciones", "Acciones")} />
                </THead>
                <tbody>
                  {pageItems.map((p) => {
                    const meta = STATUS_META[p.status] || STATUS_META.sin_turno;
                    const n = idxOf(p.id) + 1;
                    const sel = p.id === selectedId;

                    return (
                      <Tr
                        key={p.id}
                        selected={sel}
                        title={t(
                          "ui.ClientCoverage.abrirElDetalleDeLa",
                          "Abrir el detalle de la estación",
                        )}
                        onClick={() =>
                          navigate(`/post-sites/${sedeId}/stations/${p.id}`)
                        }
                      >
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2.5">
                            {/* Numbered pin: selects on the map (does NOT navigate) */}
                            <button
                              className="cg-focus grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-transform hover:scale-110"
                              style={{
                                background: meta.dot,
                                color: "oklch(1 0 0)",
                              }}
                              title={t("comun.verEnElMapa")}
                              onClick={(e) => {
                                e.stopPropagation();
                                selectPuesto(p);
                              }}
                            >
                              {n}
                            </button>
                            <div className="min-w-0">
                              <div className="font-medium truncate">
                                {p.name}
                              </div>
                              {p.nickname && (
                                <div
                                  className="truncate text-xs"
                                  style={{ color: "var(--ink-faint)" }}
                                >
                                  {p.nickname}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <span
                            className="rounded-md border px-2 py-0.5 text-xs capitalize"
                            style={{
                              background: "var(--glass-sunken)",
                              borderColor: "var(--hairline)",
                            }}
                          >
                            {tipoTexto(p.type)}
                          </span>
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap">
                          {p.window ? (
                            <div className="leading-tight">
                              <div className="tabular-nums">{p.window}</div>
                              {p.turno && (
                                <div
                                  className="text-xs"
                                  style={{ color: "var(--ink-faint)" }}
                                >
                                  {turnoTexto(p.turno)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: "var(--ink-faint)" }}>
                              {t("ui.ClientCoverage.sinTurno")}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="font-medium tabular-nums">
                            {p.onPost} / {p.required || 0}
                          </div>
                          {/* Names: on-post guards (muted) OR — when nobody's marked —
                                the assigned guards (amber). The Estado badge already
                                says "Sin marcar", so no suffix is needed here. */}
                          <div className="max-w-[180px] truncate text-xs">
                            {p.guards?.length ? (
                              <span
                                style={{ color: "var(--ink-soft)" }}
                                title={p.guards.join(", ")}
                              >
                                {p.guards.join(", ")}
                              </span>
                            ) : p.assigned?.length ? (
                              <span
                                style={{ color: "var(--warn-text)" }}
                                title={t(
                                  "ui.ClientCoverage.asignadosSinMarcarEntrada",
                                  {
                                    defaultValue:
                                      "Asignados (aún sin marcar entrada): {{names}}",
                                    names: p.assigned.join(", "),
                                  },
                                )}
                              >
                                {p.assigned.join(", ")}
                              </span>
                            ) : (
                              <span style={{ color: "var(--ink-faint)" }}>
                                {p.status === "sin_turno"
                                  ? "—"
                                  : t("comun.sinAsignar", "Sin asignar")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          {p.coveragePct == null ? (
                            <span style={{ color: "var(--ink-faint)" }}>—</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="w-8 text-xs tabular-nums">
                                {p.coveragePct}%
                              </span>
                              <Bar pct={p.coveragePct} status={p.status} />
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          <StatusBadge
                            className="whitespace-nowrap"
                            tone={meta.tone}
                          >
                            {t(meta.labelKey, meta.label)}
                          </StatusBadge>
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap">
                          {p.lastActivity?.type === "ronda" ? (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-semibold"
                              style={{ color: "var(--ok-text)" }}
                            >
                              <RouteIcon className="h-3.5 w-3.5" />{" "}
                              {t("ui.ClientCoverage.rondaActiva")}
                            </span>
                          ) : p.lastActivity?.type === "checkin" ? (
                            <div>
                              <div className="tabular-nums">
                                {p.lastActivity.time}
                              </div>
                              <div
                                className="text-xs"
                                style={{ color: "var(--ink-faint)" }}
                              >
                                {t(
                                  "ui.ClientCoverage.entradaMarcada",
                                  "Entrada marcada",
                                )}
                              </div>
                            </div>
                          ) : (
                            <span
                              className="text-xs"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {t("comun.sinActividad")}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="cg-focus rounded-lg p-1.5 hover:opacity-80"
                                style={{ color: "var(--ink-faint)" }}
                                title={t("ui.RouteForm.acciones", "Acciones")}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DropdownMenuItem
                                onClick={() =>
                                  navigate(
                                    `/post-sites/${sedeId}/stations/${p.id}`,
                                  )
                                }
                              >
                                <ExternalLink className="mr-2 h-3.5 w-3.5" />{" "}
                                {t(
                                  "ui.ClientCoverage.abrirEstacion",
                                  "Abrir estación",
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  navigate(
                                    `/post-sites/${sedeId}/stations/${p.id}/guards`,
                                  )
                                }
                              >
                                <Users className="mr-2 h-3.5 w-3.5" />{" "}
                                {t(
                                  "ui.ClientCoverage.vigilantesAsignados",
                                  "Vigilantes asignados",
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => navigate("/schedule")}
                              >
                                <CalendarDays className="mr-2 h-3.5 w-3.5" />{" "}
                                {t(
                                  "ui.ClientCoverage.horarioEnProgramador",
                                  "Horario en Programador",
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => selectPuesto(p)}>
                                <Locate className="mr-2 h-3.5 w-3.5" />{" "}
                                {t("comun.verEnElMapa")}{" "}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  selectPuesto(p);
                                  setPlacing(true);
                                }}
                              >
                                <Crosshair className="mr-2 h-3.5 w-3.5" />{" "}
                                {t(
                                  "ui.ClientCoverage.fijarUbicacionEnElMapa",
                                  "Fijar ubicación en el mapa",
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                style={{ color: "var(--bad-text)" }}
                                onClick={() => void deleteStation(p)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />{" "}
                                {t(
                                  "ui.ClientCoverage.eliminarEstacion",
                                  "Eliminar estación",
                                )}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </Tr>
                    );
                  })}
                </tbody>
              </TabTable>
            )}

            <Pager
              noun={t("ui.ClientCoverage.nounEstaciones", "estaciones")}
              page={page}
              pageCount={pageCount}
              perPage={PER}
              total={filtered.length}
              onPage={setPage}
            />
          </Section>
        </div>

        {/* RIGHT — map + summaries */}
        <div className="space-y-4">
          <Section
            action={
              <div className="flex items-center gap-1">
                <Segmented
                  options={[
                    {
                      value: "satellite",
                      label: (
                        <span className="flex items-center gap-1">
                          <Satellite className="h-3.5 w-3.5" />{" "}
                          {t("ui.ClientCoverage.satelite", "Satélite")}
                        </span>
                      ),
                    },
                    {
                      value: "roadmap",
                      label: (
                        <span className="flex items-center gap-1">
                          <MapIcon className="h-3.5 w-3.5" />{" "}
                          {t("ui.ClientCoverage.mapa", "Mapa")}
                        </span>
                      ),
                    },
                  ]}
                  value={mapType}
                  onChange={setMapType}
                />
              </div>
            }
            icon={<MapPin />}
            title={t("ui.ClientCoverage.mapaDelSitio")}
          >
            {mapMarkers.length === 0 && !mapCenter ? (
              <EmptyState
                description={t("ui.ClientCoverage.ningunaEstacionDeEstaSede")}
                icon={<MapPin />}
                title={t("ui.ClientCoverage.sinUbicaciones")}
              />
            ) : (
              <>
                {placing && (
                  <div
                    className="mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"
                    style={{
                      background: "var(--brand-wash)",
                      borderColor: "var(--brand-line)",
                      color: "var(--brand-text)",
                    }}
                  >
                    <Crosshair className="h-4 w-4" />{" "}
                    {t(
                      "ui.ClientCoverage.tocaElMapaParaFijar",
                      "Toca el mapa para fijar la ubicación exacta de",
                    )}{" "}
                    <b>{selected?.name}</b>.
                    <button
                      className="ml-auto font-medium underline"
                      onClick={() => setPlacing(false)}
                    >
                      {t("actions.cancel")}
                    </button>
                  </div>
                )}
                <div
                  className="overflow-hidden rounded-xl border"
                  style={{ height: 380, borderColor: "var(--hairline)" }}
                >
                  <GoogleMapEmbed
                    centerRequest={centerReq}
                    enableClickToSet={placing}
                    focusZoom={21}
                    geofenceRadius={150}
                    lat={mapCenter?.lat}
                    lng={mapCenter?.lng}
                    mapType={mapType}
                    markers={mapMarkers}
                    showGeofence={!!selected && Number.isFinite(selected?.lat)}
                    zoom={20}
                    onMapClick={onMapClick}
                  />
                </div>
                {/* Legend */}
                <div
                  className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {Object.entries(STATUS_META).map(([k, m]) => (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: m.dot }}
                      />
                      {t(m.labelKey, m.label)}
                    </span>
                  ))}
                </div>
              </>
            )}
          </Section>

          {/* Selected puesto detail + place-location */}
          {selected && (
            <Section
              icon={<Locate />}
              title={t(
                "ui.ClientCoverage.estacionSeleccionada",
                "Estación seleccionada",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{selected.name}</div>
                  <div
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {tipoTexto(selected.type)} ·{" "}
                    {selected.window ||
                      t("ui.ClientCoverage.sinTurno", "Sin turno")}
                  </div>
                  <div className="mt-1">
                    <StatusBadge
                      tone={
                        (STATUS_META[selected.status] || STATUS_META.sin_turno)
                          .tone
                      }
                    >
                      {t(
                        (STATUS_META[selected.status] || STATUS_META.sin_turno)
                          .labelKey,
                        (STATUS_META[selected.status] || STATUS_META.sin_turno)
                          .label,
                      )}
                    </StatusBadge>
                  </div>
                  {Number.isFinite(selected.lat) ? (
                    <div
                      className="mt-2 text-xs tabular-nums"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {selected.lat!.toFixed(6)}, {selected.lng!.toFixed(6)}
                    </div>
                  ) : (
                    <div
                      className="mt-2 text-xs"
                      style={{ color: "var(--warn-text)" }}
                    >
                      {t(
                        "ui.ClientCoverage.estePuestoAunNoTiene",
                        "Este puesto aún no tiene ubicación exacta.",
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-2">
                  <Button
                    size="sm"
                    variant={placing ? "brand" : "outline"}
                    onClick={() => setPlacing((v) => !v)}
                  >
                    <Crosshair className="mr-1.5 h-4 w-4" />{" "}
                    {placing
                      ? t("ui.ClientCoverage.fijando", "Fijando…")
                      : t(
                          "ui.ClientCoverage.fijarUbicacionExacta",
                          "Fijar ubicación exacta",
                        )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      navigate(
                        `/post-sites/${sedeId}/stations/${selected.id}/overview`,
                      )
                    }
                  >
                    <ExternalLink className="mr-1.5 h-4 w-4" />{" "}
                    {t("ui.ClientCoverage.verEstacion", "Ver estación")}
                  </Button>
                </div>
              </div>
            </Section>
          )}

          {/* Resumen de cobertura por turno */}
          <Section
            icon={<Shield />}
            title={t("ui.ClientCoverage.resumenDeCoberturaPorTurno")}
          >
            <div className="space-y-3">
              {turnoSummary.map((t) => (
                <div key={t.key}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span style={{ color: "var(--ink-soft)" }}>
                      {t.label} <span className="text-xs">({t.window})</span>
                    </span>
                    <span className="tabular-nums">
                      <b
                        style={{
                          color:
                            t.pct >= 90
                              ? "var(--ok-text)"
                              : t.pct >= 60
                                ? "var(--warn-text)"
                                : "var(--bad-text)",
                        }}
                      >
                        {t.pct}%
                      </b>{" "}
                      <span
                        className="text-xs"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {t.covered} / {t.required}
                      </span>
                    </span>
                  </div>
                  <MeterBar
                    ariaLabel={t.label}
                    height={8}
                    pct={t.pct}
                    tone={t.pct >= 90 ? "ok" : t.pct >= 60 ? "warn" : "bad"}
                  />
                </div>
              ))}
              <div
                className="flex items-center justify-between border-t pt-3"
                style={{ borderColor: "var(--hairline)" }}
              >
                <span className="font-medium">
                  {t("ui.ClientCoverage.coberturaGeneralDelSitio")}
                </span>
                <span
                  className="font-display text-lg font-bold tabular-nums"
                  style={{
                    color:
                      (data?.generalPct ?? 0) >= 90
                        ? "var(--ok-text)"
                        : "var(--warn-text)",
                  }}
                >
                  {data?.generalPct ?? 0}%
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.ClientCoverage.segunLaAsistenciaRegistradaHoy",
                  "Según la asistencia registrada hoy.",
                )}
              </p>
            </div>
          </Section>

          {/* Estaciones sin cobertura */}
          <Section
            icon={<ShieldAlert />}
            title={t("ui.ClientCoverage.estacionesSinCoberturaN", {
              defaultValue: "Estaciones sin cobertura ({{n}})",
              n: sinCobertura.length,
            })}
          >
            {sinCobertura.length === 0 ? (
              <div
                className="flex items-center gap-2 py-2 text-sm"
                style={{ color: "var(--ok-text)" }}
              >
                <CheckCircle2 className="h-4 w-4" />{" "}
                {t(
                  "ui.ClientCoverage.todosLosPuestosConTurno",
                  "Todos los puestos con turno están cubiertos.",
                )}
              </div>
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: "var(--hairline)" }}
              >
                {sinCobertura.map((p) => (
                  <button
                    key={p.id}
                    className="cg-focus flex w-full items-center justify-between gap-3 py-2.5 text-left transition-opacity hover:opacity-80"
                    onClick={() =>
                      selectPuesto(puestos.find((x) => x.id === p.id))
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <IconTile size="sm" tone="bad">
                        <Shield />
                      </IconTile>
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {p.window ||
                            t("ui.ClientCoverage.sinTurno", "Sin turno")}{" "}
                          {p.turno ? `(${turnoTexto(p.turno)})` : ""} ·{" "}
                          {t("ui.ClientCoverage.requiereNVigilantes", {
                            defaultValue: "Requiere {{count}} vigilantes",
                            count: p.requiredGuards,
                          })}
                        </div>
                      </div>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 text-xs font-semibold"
                      style={{ color: "var(--bad-text)" }}
                    >
                      {t("ui.ClientCoverage.sinAsignacion", "Sin asignación")}{" "}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Section>

          {/* Próximos a iniciar */}
          <Section
            action={
              <button
                className="cg-focus rounded-md text-xs font-semibold hover:underline"
                style={{ color: "var(--brand-text)" }}
                onClick={() => navigate("/schedule")}
              >
                {t("ui.ClientCoverage.verCalendario", "Ver calendario")}
              </button>
            }
            icon={<Clock />}
            title={t(
              "ui.ClientCoverage.proximosAIniciar",
              "Próximos a iniciar",
            )}
          >
            {proximos.length === 0 ? (
              <div
                className="py-2 text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                {t(
                  "ui.ClientCoverage.noHayTurnosProximosEn",
                  "No hay turnos próximos en las siguientes 2 horas.",
                )}
              </div>
            ) : (
              <div
                className="divide-y"
                style={{ borderColor: "var(--hairline)" }}
              >
                {proximos.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    className="cg-focus flex w-full items-center justify-between gap-3 py-2.5 text-left transition-opacity hover:opacity-80"
                    onClick={() =>
                      selectPuesto(puestos.find((x) => x.id === p.id))
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <IconTile size="sm" tone="info">
                        <span className="text-xs font-bold">
                          {idxOf(p.id) + 1}
                        </span>
                      </IconTile>
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {p.window} ({turnoTexto(p.turno)})
                        </div>
                      </div>
                    </div>
                    <span
                      className="text-xs"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {p.startsInMin <= 0
                        ? t("ui.ClientCoverage.ahora", "Ahora")
                        : t("ui.ClientCoverage.enTiempo", {
                            defaultValue: "En {{time}}",
                            time:
                              p.startsInMin < 60
                                ? `${p.startsInMin}m`
                                : `${Math.floor(p.startsInMin / 60)}h ${p.startsInMin % 60}m`,
                          })}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      <TabFooter
        icon={<RefreshCw />}
        note={t(
          "ui.ClientCoverage.notaCoberturaEnVivo",
          "La cobertura se actualiza en vivo con las entradas de los vigilantes y las asignaciones de turno.",
        )}
        updatedAt={fmtUpdated}
        onRefresh={() => load(sedeId)}
      />
    </div>
  );
}
