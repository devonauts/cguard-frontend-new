import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/table/DataTable";
import { useTranslation } from "react-i18next";
import {
  Filter,
  X,
  Loader2,
  UserCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
} from "lucide-react";

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
  PageContainer,
  PageHeader,
  Section,
  MetricTile,
  StatsStrip,
  Stagger,
  EmptyState,
  Modal,
  Toolbar,
  SearchInput,
} from "@/components/kit";
import shiftService, { ShiftRecord } from "@/lib/api/shiftService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { localeActual } from "@/lib/localeActual";
import { desdeInputFechaHora, limitesDelDia } from "@/lib/horaDeLaEmpresa";
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

function durationHours(start: string, end: string) {
  const diff =
    (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;

  if (diff <= 0) return "—";

  return `${diff.toFixed(1)} h`;
}

interface GuardOption {
  userId: string;
  fullName: string;
}

// Raw guard row as returned by securityGuardService.list.
interface GuardListItem {
  guard?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
  };
  guardId?: string;
  fullName?: string;
}

// ── component ────────────────────────────────────────────────────────────────

export default function OpenShifts() {
  const { t } = useTranslation();
  const [rawShifts, setRawShifts] = useState<ShiftRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Assign modal
  const [assignTarget, setAssignTarget] = useState<ShiftRecord | null>(null);
  const [allGuards, setAllGuards] = useState<GuardOption[]>([]);
  const [guardSearch, setGuardSearch] = useState("");
  const [selectedGuard, setSelectedGuard] = useState<GuardOption | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Filter State
  const [filters, setFilters] = useState({
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  // ── fetch open shifts ─────────────────────────────────────────────────────
  const fetchShifts = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number | string[]> = {
        "filter[openOnly]": "true",
        limit: 500,
      };

      if (appliedFilters.startDate) {
        // La hora que escribe el usuario es la DEL PUESTO. `new Date("…T07:00")`
        // la leía en la zona del dispositivo, así que el mismo filtro devolvía
        // turnos distintos según desde dónde se mirara.
        params["filter[startTimeRange]"] = [
          appliedFilters.startTime
            ? desdeInputFechaHora(
                `${appliedFilters.startDate}T${appliedFilters.startTime}`,
              )
            : limitesDelDia(appliedFilters.startDate).start,
        ];
      }
      if (appliedFilters.endDate) {
        const to = appliedFilters.endTime
          ? desdeInputFechaHora(
              `${appliedFilters.endDate}T${appliedFilters.endTime}`,
            )
          : limitesDelDia(appliedFilters.endDate).end;
        const existing =
          (params["filter[startTimeRange]"] as string[] | undefined) ?? [];

        params["filter[startTimeRange]"] = [...existing, to];
      }

      const { rows } = await shiftService.list(params);

      setRawShifts(rows);
    } catch (err) {
      console.error("Failed to fetch open shifts", err);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // ── load guards once when assign modal opens ──────────────────────────────
  useEffect(() => {
    if (!assignTarget) return;
    if (allGuards.length > 0) return; // already loaded
    (async () => {
      try {
        const resp = await securityGuardService.list({ limit: 200, offset: 0 });
        const items: GuardListItem[] = Array.isArray(resp)
          ? resp
          : (resp.rows ?? []);
        const opts: GuardOption[] = items
          .map((item: GuardListItem) => {
            const userId = item.guard?.id ?? item.guardId ?? null;
            const fullName =
              item.fullName ??
              (item.guard?.firstName && item.guard?.lastName
                ? `${item.guard.firstName} ${item.guard.lastName}`
                : (item.guard?.fullName ?? ""));

            return userId ? { userId, fullName } : null;
          })
          .filter(Boolean) as GuardOption[];

        setAllGuards(opts);
      } catch (e) {
        console.error("Failed to load guards", e);
      }
    })();
  }, [assignTarget, allGuards.length]);

  // ── derived data ──────────────────────────────────────────────────────────
  const todayStr = new Date().toDateString();
  const weekStart = new Date();

  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const stats = {
    total: rawShifts.length,
    today: rawShifts.filter(
      (s) => new Date(s.startTime).toDateString() === todayStr,
    ).length,
    thisWeek: rawShifts.filter((s) => new Date(s.startTime) >= weekStart)
      .length,
  };

  const q = searchQuery.toLowerCase().trim();
  const filtered = rawShifts.filter((s) => {
    if (!q) return true;

    return (
      formatDate(s.startTime).toLowerCase().includes(q) ||
      (s.station?.stationName ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const filteredGuards = allGuards.filter(
    (g) =>
      !guardSearch ||
      g.fullName.toLowerCase().includes(guardSearch.toLowerCase()),
  );

  // ── assign handler ────────────────────────────────────────────────────────
  const handleAssign = async () => {
    if (!assignTarget || !selectedGuard) return;
    setAssigning(true);
    try {
      await shiftService.assign(assignTarget.id, selectedGuard.userId);
      setRawShifts((prev) => prev.filter((s) => s.id !== assignTarget.id));
      setAssignTarget(null);
      setSelectedGuard(null);
      setGuardSearch("");
    } catch (err) {
      console.error("Failed to assign guard", err);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<CalendarClock />}
          subtitle={t("ui.OpenShifts.turnosSinVigilanteAsignadoAsignalos")}
          title={t("sidebar.turnos.sin-cubrir", "Sin cubrir")}
        />

        {/* KPIs */}
        <StatsStrip className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile
            hint={t("ui.OpenShifts.turnosSinVigilante")}
            icon={<CalendarClock />}
            label={t("ui.OpenShifts.totalAbiertos")}
            value={stats.total}
          />
          <MetricTile
            delta={
              stats.total > 0
                ? {
                    value: `${Math.round((stats.today / stats.total) * 100)} %`,
                    direction: stats.today > 0 ? "down" : "flat",
                  }
                : undefined
            }
            hint={t("ui.OpenShifts.delTotalAbierto")}
            icon={<CalendarDays />}
            label={t("kit.dateRange.today", "Hoy")}
            value={stats.today}
          />
          <MetricTile
            delta={
              stats.total > 0
                ? {
                    value: `${Math.round((stats.thisWeek / stats.total) * 100)} %`,
                    direction: stats.thisWeek > 0 ? "down" : "flat",
                  }
                : undefined
            }
            hint={t("ui.OpenShifts.delTotalAbierto")}
            icon={<CalendarRange />}
            label={t("ui.OpenShifts.estaSemana")}
            value={stats.thisWeek}
          />
        </StatsStrip>

        {/* Barra de filtros */}
        <Toolbar className="justify-end gap-4">
          <div className="flex w-full flex-col items-center gap-4 md:w-auto md:flex-row">
            <SearchInput
              className="w-full md:w-80"
              placeholder={t("ui.OpenShifts.buscarPuestoOFecha")}
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
                    <Filter className="mr-2 h-4 w-4" />{" "}
                    {t("guards.list.filters", "Filtros")}
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:w-[540px] overflow-y-auto">
                  <SheetHeader className="relative">
                    <SheetTitle>{t("guards.list.filters", "Filtros")}</SheetTitle>
                    <Button
                      className="absolute right-0 top-0"
                      size="icon"
                      variant="ghost"
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
                        className="w-full"
                        variant="brand"
                        onClick={() => {
                          setAppliedFilters({ ...filters });
                          setIsFiltersOpen(false);
                          setPage(1);
                        }}
                      >
                        {t("guards.list.applyFilters", "Aplicar filtros")}
                      </Button>
                      <Button
                        className="w-full"
                        variant="outline"
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
          contentClassName="overflow-x-auto -mx-1"
          icon={<CalendarClock />}
          title={t("sidebar.turnos.sin-cubrir", "Sin cubrir")}
        >
          {/* `DataTable` y no el primitivo `<Table>`: se pliega sola en fichas
              en el teléfono. La casilla de la primera columna no tenía
              manejador —era adorno— y no viaja. */}
          <DataTable
            columns={[
              {
                key: "startTime",
                header: t("comun.fecha"),
                render: (_v: any, row: any) => formatDate(row.startTime),
              },
              {
                key: "station",
                header: t("comun.puesto"),
                titulo: true,
                render: (_v: any, row: any) => row.station?.stationName ?? "—",
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
                key: "duracion",
                header: t("ui.OpenShifts.duracion", "Duración"),
                render: (_v: any, row: any) =>
                  durationHours(row.startTime, row.endTime),
              },
              {
                key: "accion",
                header: t("ui.OpenShifts.accion", "Acción"),
                render: (_v: any, row: any) => (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAssignTarget(row);
                      setSelectedGuard(null);
                      setGuardSearch("");
                    }}
                  >
                    <UserCheck className="mr-1 h-4 w-4" />{" "}
                    {t("comun.asignarVigilante")}
                  </Button>
                ),
              },
            ]}
            containerless
            data={paginated as any}
            emptyState={
              <EmptyState
                className="border-0 py-2"
                description={t("ui.OpenShifts.todosLosTurnosTienenVigilante")}
                icon={<CalendarClock />}
                title={t("ui.OpenShifts.noHayTurnosAbiertos")}
              />
            }
            loading={loading}
          />
        </Section>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-end gap-2 py-4">
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("ui.OpenShifts.elementosPorPagina", "Elementos por página")}
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
              ? t("ui.OpenShifts.ceroDeCero", "0 de 0")
              : t("ui.OpenShifts.rangoDePagina", {
                  defaultValue: "{{desde}}–{{hasta}} de {{total}}",
                  desde: (page - 1) * pageSize + 1,
                  hasta: Math.min(page * pageSize, filtered.length),
                  total: filtered.length,
                })}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              disabled={page <= 1}
              size="icon"
              variant="outline"
              onClick={() => setPage((p) => p - 1)}
            >
              <span className="sr-only">
                {t("ui.OpenShifts.paginaAnterior", "Página anterior")}
              </span>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M15 19l-7-7 7-7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </svg>
            </Button>
            <Button
              disabled={page >= totalPages}
              size="icon"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
            >
              <span className="sr-only">
                {t("ui.OpenShifts.paginaSiguiente", "Página siguiente")}
              </span>
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 5l7 7-7 7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                />
              </svg>
            </Button>
          </div>
        </div>
      </PageContainer>

      {/* Assign Guard Modal */}
      <Modal
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setAssignTarget(null);
                setSelectedGuard(null);
                setGuardSearch("");
              }}
            >
              {t("common.cancel", "Cancelar")}
            </Button>
            <Button
              disabled={!selectedGuard || assigning}
              variant="brand"
              onClick={handleAssign}
            >
              {assigning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {t("ui.OpenShifts.confirmarAsignacion", "Confirmar asignación")}
            </Button>
          </>
        }
        icon={<UserCheck />}
        open={!!assignTarget}
        title={t("comun.asignarVigilante")}
        onOpenChange={(open) => {
          if (!open) {
            setAssignTarget(null);
            setSelectedGuard(null);
            setGuardSearch("");
          }
        }}
      >
        {assignTarget && (
          <div className="space-y-4">
            <div className="glass-sunken p-3 text-sm">
              <div className="font-semibold">
                {assignTarget.station?.stationName ??
                  t("ui.OpenShifts.sinPuesto", "Sin puesto")}
              </div>
              <div
                className="tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                {formatDate(assignTarget.startTime)} ·{" "}
                {formatTime(assignTarget.startTime)} –{" "}
                {formatTime(assignTarget.endTime)} (
                {durationHours(assignTarget.startTime, assignTarget.endTime)})
              </div>
            </div>

            <SearchInput
              placeholder={t("comun.buscarVigilante")}
              value={guardSearch}
              onChange={(v) => setGuardSearch(v)}
            />

            <div className="glass-sunken max-h-56 overflow-y-auto p-1">
              {filteredGuards.length === 0 ? (
                <div
                  className="p-4 text-center text-sm"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {allGuards.length === 0
                    ? t("ui.OpenShifts.cargandoVigilantes", "Cargando vigilantes…")
                    : t(
                        "guards.list.empty.noneFoundTitle",
                        "No se encontraron vigilantes",
                      )}
                </div>
              ) : (
                filteredGuards.map((g) => {
                  const elegido = selectedGuard?.userId === g.userId;

                  return (
                    <button
                      key={g.userId}
                      aria-pressed={elegido}
                      className="cg-focus flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-[var(--glass-raised)]"
                      style={
                        elegido
                          ? {
                              background: "var(--brand-wash)",
                              boxShadow: "inset 0 0 0 1px var(--brand-line)",
                            }
                          : undefined
                      }
                      type="button"
                      onClick={() => setSelectedGuard(g)}
                    >
                      <span
                        className="h-4 w-4 flex-shrink-0 rounded-full border-2"
                        style={
                          elegido
                            ? {
                                borderColor: "var(--brand)",
                                background: "var(--brand)",
                              }
                            : { borderColor: "var(--hairline)" }
                        }
                      />
                      <span className="text-sm">{g.fullName}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
