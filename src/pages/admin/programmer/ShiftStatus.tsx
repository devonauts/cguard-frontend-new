import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/table/DataTable";
import { useTranslation } from "react-i18next";
import { getTenantTimezone } from "@/utils/tenantLocation";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Filter,
  ChevronsUpDown,
  X,
  Loader2,
  ListChecks,
  Clock,
  PlayCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  PageContainer,
  PageHeader,
  Section,
  MetricTile,
  StatsStrip,
  Stagger,
  StatusBadge,
  EmptyState,
  Toolbar,
  SearchInput,
} from "@/components/kit";
import shiftService, { ShiftRecord } from "@/lib/api/shiftService";

import { localeActual } from "@/lib/localeActual";
import { desdeInputFechaHora, limitesDelDia } from "@/lib/horaDeLaEmpresa";
import { listarTodo } from "@/lib/listarCompleto";
import { ESTADO_NOVEDAD } from "@/lib/shiftStatus";
import { ApiService } from "@/services/api/apiService";
import { diaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { etiquetaDeAusencia, marcasPorDia } from "./ausenciaDelTurno";
import { estadoEnLaLista, type EstadoEnLaLista } from "./estadoEnLaLista";
// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(localeActual(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    // Same tz as formatTime — mixed zones made a row's Fecha disagree with
    // its own hours for viewers outside the company timezone.
    timeZone: getTenantTimezone(),
  });
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(localeActual(), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: getTenantTimezone(),
  });
}

type ShiftStatusValue = EstadoEnLaLista;

const computeStatus = (row: ShiftRecord): ShiftStatusValue =>
  estadoEnLaLista(row as any);

// ── component ────────────────────────────────────────────────────────────────

export default function ShiftStatus() {
  const { t } = useTranslation();
  const [rawShifts, setRawShifts] = useState<ShiftRecord[]>([]);
  /** The Horario marks (V / PM / F / L) of the range: why a shift is absent. */
  const [marcas, setMarcas] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ShiftStatusValue | "all">(
    "all",
  );
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Date range filter
  const [filters, setFilters] = useState({
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
        // La hora que escribe el usuario es la DEL PUESTO. `new Date("…T07:00")`
        // la leía en la zona del dispositivo, así que el mismo filtro devolvía
        // turnos distintos según desde dónde se mirara.
      const fromDate = appliedFilters.startDate
        ? appliedFilters.startTime
          ? desdeInputFechaHora(
              `${appliedFilters.startDate}T${appliedFilters.startTime}`,
            )
          : limitesDelDia(appliedFilters.startDate).start
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const toDate = appliedFilters.endDate
        ? appliedFilters.endTime
          ? desdeInputFechaHora(
              `${appliedFilters.endDate}T${appliedFilters.endTime}`,
            )
          : limitesDelDia(appliedFilters.endDate).end
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { rows } = await listarTodo(({ limit, offset }) => shiftService.list({
        "filter[startTimeRange]": [fromDate, toDate],
        limit,
        offset,
        orderBy: "startTime_ASC",
      }));
      setRawShifts(rows);
      const tid = localStorage.getItem("tenantId") || "";

      if (tid && rows.some((r: any) => r.status === ESTADO_NOVEDAD)) {
        const ov: any = await ApiService.get(
          `/tenant/${tid}/schedule-overrides?startDate=${diaDeLaEmpresa(fromDate)}&endDate=${diaDeLaEmpresa(toDate)}`,
        ).catch(() => null);
        const filas = ov?.rows || ov?.data?.rows || [];

        setMarcas(marcasPorDia(Array.isArray(filas) ? filas : []));
      } else setMarcas(new Map());
    } catch (err) {
      console.error("Failed to fetch shifts", err);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // ── derived data ──────────────────────────────────────────────────────────
  const withStatus = rawShifts.map((r) => ({
    ...r,
    _status: computeStatus(r),
    _guardName: r.guard?.fullName ?? t("comun.sinAsignar", "Sin asignar"),
    _stationName:
      r.station?.stationName ?? t("ui.ShiftStatus.sinEstacion", "Sin estación"),
  }));

  const stats = {
    pending: withStatus.filter((r) => r._status === "pending").length,
    inProgress: withStatus.filter((r) => r._status === "in-progress").length,
    completed: withStatus.filter((r) => r._status === "completed").length,
    cancelled: withStatus.filter((r) => r._status === "cancelled").length,
  };

  const q = searchQuery.toLowerCase().trim();
  const filtered = withStatus.filter((r) => {
    if (statusFilter !== "all" && r._status !== statusFilter) return false;
    if (
      q &&
      !r._guardName.toLowerCase().includes(q) &&
      !r._stationName.toLowerCase().includes(q) &&
      !formatDate(r.startTime).toLowerCase().includes(q)
    )
      return false;
    return true;
  });

  // Reparto de los turnos del rango entre los cuatro estados, para que cada KPI
  // diga qué porción representa.
  const totalTurnos =
    stats.pending + stats.inProgress + stats.completed + stats.cancelled;
  const pctTurnos = (n: number) =>
    totalTurnos > 0 ? Math.round((n / totalTurnos) * 100) : 0;

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── status badge ──────────────────────────────────────────────────────────
  const getStatusBadge = (status: ShiftStatusValue, row?: any) => {
    if (row?.status === ESTADO_NOVEDAD) {
      const e = etiquetaDeAusencia(
        marcas.get(`${row.guardId}|${diaDeLaEmpresa(row.startTime)}`),
      );

      return <StatusBadge tone={e.tone}>{t(e.key, e.defaultValue)}</StatusBadge>;
    }
    switch (status) {
      case "transferred":
        return (
          <StatusBadge tone="neutral">
            {t("ui.Schedule.estadoTurno.transferred_out", "Trasladado")}
          </StatusBadge>
        );
      case "pending":
        return <StatusBadge tone="warn">{t("comun.pendiente")}</StatusBadge>;
      case "in-progress":
        return (
          <StatusBadge tone="info">
            {t("ui.ShiftStatus.enCurso", "En curso")}
          </StatusBadge>
        );
      case "completed":
        return (
          <StatusBadge tone="ok">
            {t("ui.ShiftStatus.completado", "Completado")}
          </StatusBadge>
        );
      case "cancelled":
        // Pulled to another post (Cobertura en vivo): the post is still
        // without him, but the word is what happened.
        if (row?.status === "transferred_out")
          return (
            <StatusBadge tone="bad">
              {t("ui.Schedule.estadoTurno.transferred_out", "Trasladado")}
            </StatusBadge>
          );

        return (
          <StatusBadge tone="bad">
            {t("ui.ShiftStatus.cancelado", "Cancelado")}
          </StatusBadge>
        );
    }
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<ListChecks />}
          title={t("ui.ShiftStatus.estadoDeTurnos")}
          subtitle={t("ui.ShiftStatus.seguimientoDelProgresoDeLos")}
        />

        {/* KPIs */}
        <StatsStrip className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricTile
            label={t("ui.ShiftStatus.pendientes", "Pendientes")}
            value={stats.pending}
            icon={<Clock />}
            delta={
              totalTurnos > 0
                ? { value: `${pctTurnos(stats.pending)} %`, direction: "flat" }
                : undefined
            }
            hint={t("ui.ShiftStatus.aunNoEmpiezan")}
          />
          <MetricTile
            label={t("ui.ShiftStatus.enCurso", "En curso")}
            value={stats.inProgress}
            icon={<PlayCircle />}
            delta={
              totalTurnos > 0
                ? { value: `${pctTurnos(stats.inProgress)} %`, direction: "up" }
                : undefined
            }
            hint={t("ui.ShiftStatus.sucediendoAhoraMismo", "Sucediendo ahora mismo")}
          />
          <MetricTile
            label={t("ui.ShiftStatus.completados", "Completados")}
            value={stats.completed}
            icon={<CheckCircle2 />}
            delta={
              totalTurnos > 0
                ? { value: `${pctTurnos(stats.completed)} %`, direction: "up" }
                : undefined
            }
            hint={t("ui.ShiftStatus.turnosYaCerrados")}
          />
          <MetricTile
            label={t("ui.ShiftStatus.cancelados", "Cancelados")}
            value={stats.cancelled}
            icon={<XCircle />}
            delta={
              totalTurnos > 0
                ? {
                    value: `${pctTurnos(stats.cancelled)} %`,
                    direction: stats.cancelled > 0 ? "down" : "flat",
                  }
                : undefined
            }
            hint={t("ui.ShiftStatus.quedaronSinVigilante")}
          />
        </StatsStrip>

        {/* Barra de filtros */}
        <Toolbar className="justify-between gap-4">
          <div className="w-full md:w-52">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as ShiftStatusValue | "all");
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("comun.todosLosEstados")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t("comun.todosLosEstados")}
                </SelectItem>
                <SelectItem value="pending">{t("comun.pendiente")}</SelectItem>
                <SelectItem value="in-progress">
                  {t("ui.ShiftStatus.enCurso", "En curso")}
                </SelectItem>
                <SelectItem value="completed">
                  {t("ui.ShiftStatus.completado", "Completado")}
                </SelectItem>
                <SelectItem value="cancelled">
                  {t("ui.ShiftStatus.cancelado", "Cancelado")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-full flex-col items-center gap-4 md:w-auto md:flex-row">
            <SearchInput
              className="w-full md:w-80"
              placeholder={t("ui.ShiftStatus.buscarVigilanteOPuesto")}
              value={searchQuery}
              onChange={(v) => {
                setSearchQuery(v);
                setPage(1);
              }}
            />

            <div className="flex items-center gap-2">
              <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <Filter className="h-4 w-4 mr-2" />{" "}
                    {t("guards.list.filters", "Filtros")}
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:w-[540px] overflow-y-auto">
                  <SheetHeader className="relative">
                    <SheetTitle>{t("guards.list.filters", "Filtros")}</SheetTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0"
                      onClick={() => setIsFiltersOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </SheetHeader>
                  <div className="space-y-6 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>{t("comun.desdeLaFecha")}</Label>
                        <Input
                          type="date"
                          value={filters.startDate}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              startDate: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>{t("comun.hora")}</Label>
                        <Input
                          type="time"
                          value={filters.startTime}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              startTime: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>{t("comun.hastaLaFecha")}</Label>
                        <Input
                          type="date"
                          value={filters.endDate}
                          onChange={(e) =>
                            setFilters({ ...filters, endDate: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>{t("comun.hora")}</Label>
                        <Input
                          type="time"
                          value={filters.endTime}
                          onChange={(e) =>
                            setFilters({ ...filters, endTime: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-2 pt-4">
                      <Button
                        variant="brand"
                        className="w-full"
                        onClick={() => {
                          setAppliedFilters({ ...filters });
                          setIsFiltersOpen(false);
                          setPage(1);
                        }}
                      >
                        {t("guards.list.applyFilters", "Aplicar filtros")}
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          const empty = {
                            startDate: "",
                            startTime: "",
                            endDate: "",
                            endTime: "",
                          };
                          setFilters(empty);
                          setAppliedFilters(empty);
                          setPage(1);
                        }}
                      >
                        {t("guards.list.clearFilters", "Limpiar filtros")}
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </Toolbar>

        {/* Tabla */}
        <Section
          title={t("ui.ShiftStatus.turnos", "Turnos")}
          icon={<ListChecks />}
          contentClassName="overflow-x-auto -mx-1"
        >
          {/* `DataTable` y no el primitivo `<Table>`: así se pliega sola en
              fichas en el teléfono, donde estas siete columnas se leían
              arrastrando de lado. La casilla y el botón de la derecha que había
              aquí NO tenían manejador —eran adorno—, así que no viajan. */}
          <DataTable
            columns={[
              {
                key: "startTime",
                header: t("comun.fecha"),
                render: (_v: any, row: any) => formatDate(row.startTime),
              },
              {
                key: "_guardName",
                header: t("comun.vigilante"),
                titulo: true,
              },
              {
                key: "_stationName",
                header: t("comun.puesto"),
              },
              {
                // La columna de fecha ya usa `startTime`; React avisaba de dos
                // hijos con la misma clave. El valor lo saca `render` de la fila,
                // así que la clave sólo hace de identidad.
                key: "horaDeInicio",
                header: t("comun.horaDeInicio"),
                render: (_v: any, row: any) => formatTime(row.startTime),
              },
              {
                key: "endTime",
                header: t("comun.horaDeFin"),
                render: (_v: any, row: any) => formatTime(row.endTime),
              },
              {
                key: "_status",
                header: t("comun.estado"),
                render: (_v: any, row: any) => getStatusBadge(row._status, row),
              },
            ]}
            containerless
            data={paginated as any}
            emptyState={
              <EmptyState
                className="border-0 py-2"
                description={t("comun.noPudimosEncontrarNingunElemento")}
                icon={<ListChecks />}
                title={t("kit.table.emptyTitle")}
              />
            }
            loading={loading}
          />
        </Section>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-end gap-2 py-4">
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("ui.ShiftStatus.elementosPorPagina", "Elementos por página")}
          </div>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <div
            className="text-sm tabular-nums sm:mx-4"
            style={{ color: "var(--ink-soft)" }}
          >
            {filtered.length === 0
              ? t("ui.ShiftStatus.ceroDeCero", "0 de 0")
              : t("ui.ShiftStatus.rangoDePagina", {
                  defaultValue: "{{desde}}–{{hasta}} de {{total}}",
                  desde: (page - 1) * pageSize + 1,
                  hasta: Math.min(page * pageSize, filtered.length),
                  total: filtered.length,
                })}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="icon"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <span className="sr-only">
                {t("ui.ShiftStatus.paginaAnterior", "Página anterior")}
              </span>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <span className="sr-only">
                {t("ui.ShiftStatus.paginaSiguiente", "Página siguiente")}
              </span>
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Button>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
