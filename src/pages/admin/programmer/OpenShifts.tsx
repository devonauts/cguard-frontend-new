import { useState, useEffect, useCallback } from "react";
import { useTranslation } from 'react-i18next';
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
import { Search, Filter, X, Loader2, UserCheck, CalendarClock, CalendarDays, CalendarRange } from "lucide-react";
import Breadcrumb from "@/components/ui/breadcrumb";
import { PageContainer, PageHeader, Section, MetricTile, Stagger, EmptyState, Modal, Toolbar } from "@/components/kit";
import shiftService, { ShiftRecord } from "@/lib/api/shiftService";
import { securityGuardService } from "@/lib/api/securityGuardService";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-EC", {
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
  return new Date(iso).toLocaleTimeString("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: getTenantTimezone(),
  });
}

function durationHours(start: string, end: string) {
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
  if (diff <= 0) return "—";
  return `${diff.toFixed(1)} h`;
}

interface GuardOption {
  userId: string;
  fullName: string;
}

// Raw guard row as returned by securityGuardService.list.
interface GuardListItem {
  guard?: { id?: string; firstName?: string; lastName?: string; fullName?: string };
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
      const params: Record<string, string | number | string[]> = { "filter[openOnly]": "true", limit: 500 };

      if (appliedFilters.startDate) {
        const from = appliedFilters.startDate + (appliedFilters.startTime ? `T${appliedFilters.startTime}` : "T00:00:00");
        params["filter[startTimeRange]"] = [new Date(from).toISOString()];
      }
      if (appliedFilters.endDate) {
        const to = appliedFilters.endDate + (appliedFilters.endTime ? `T${appliedFilters.endTime}` : "T23:59:59");
        const existing = (params["filter[startTimeRange]"] as string[] | undefined) ?? [];
        params["filter[startTimeRange]"] = [...existing, new Date(to).toISOString()];
      }

      const { rows } = await shiftService.list(params);
      setRawShifts(rows);
    } catch (err) {
      console.error("Failed to fetch open shifts", err);
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  // ── load guards once when assign modal opens ──────────────────────────────
  useEffect(() => {
    if (!assignTarget) return;
    if (allGuards.length > 0) return; // already loaded
    (async () => {
      try {
        const resp = await securityGuardService.list({ limit: 200, offset: 0 });
        const items: GuardListItem[] = Array.isArray(resp) ? resp : (resp.rows ?? []);
        const opts: GuardOption[] = items
          .map((item: GuardListItem) => {
            const userId = item.guard?.id ?? item.guardId ?? null;
            const fullName =
              item.fullName ??
              (item.guard?.firstName && item.guard?.lastName
                ? `${item.guard.firstName} ${item.guard.lastName}`
                : item.guard?.fullName ?? "");
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
    today: rawShifts.filter((s) => new Date(s.startTime).toDateString() === todayStr).length,
    thisWeek: rawShifts.filter((s) => new Date(s.startTime) >= weekStart).length,
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

  const filteredGuards = allGuards.filter((g) =>
    !guardSearch || g.fullName.toLowerCase().includes(guardSearch.toLowerCase())
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
      <Breadcrumb
        items={[
          { label: "Panel de control", path: "/dashboard" },
          { label: "Turno Abierto" },
        ]}
      />
      <PageContainer width="wide" className="px-4 lg:px-6">
        <PageHeader
          icon={<CalendarClock />}
          title="Turnos abiertos"
          subtitle="Turnos sin vigilante asignado · asígnalos al personal disponible."
        />

        {/* KPIs */}
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile label="Total abiertos" value={stats.total} icon={<CalendarClock />} hint="Turnos sin vigilante" />
          <MetricTile
            label="Hoy"
            value={stats.today}
            icon={<CalendarDays />}
            delta={stats.total > 0 ? { value: `${Math.round((stats.today / stats.total) * 100)} %`, direction: stats.today > 0 ? "down" : "flat" } : undefined}
            hint="Del total abierto"
          />
          <MetricTile
            label="Esta semana"
            value={stats.thisWeek}
            icon={<CalendarRange />}
            delta={stats.total > 0 ? { value: `${Math.round((stats.thisWeek / stats.total) * 100)} %`, direction: stats.thisWeek > 0 ? "down" : "flat" } : undefined}
            hint="Del total abierto"
          />
        </Stagger>

        {/* Barra de filtros */}
        <Toolbar className="justify-end gap-4">
          <div className="flex w-full flex-col items-center gap-4 md:w-auto md:flex-row">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--ink-faint)" }} />
              <Input
                placeholder="Buscar puesto o fecha"
                className="pl-9"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              />
            </div>

            <div className="flex items-center gap-2">
              <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline">
                    <Filter className="mr-2 h-4 w-4" /> Filtros
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-full sm:w-[540px] overflow-y-auto">
                  <SheetHeader className="relative">
                    <SheetTitle>Filtros</SheetTitle>
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
                        <Label>Desde la Fecha</Label>
                        <Input
                          type="date"
                          value={filters.startDate}
                          onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Hora</Label>
                        <Input
                          type="time"
                          value={filters.startTime}
                          onChange={(e) => setFilters({ ...filters, startTime: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Hasta la Fecha</Label>
                        <Input
                          type="date"
                          value={filters.endDate}
                          onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Hora</Label>
                        <Input
                          type="time"
                          value={filters.endTime}
                          onChange={(e) => setFilters({ ...filters, endTime: e.target.value })}
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
                        Aplicar Filtros
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          const empty = { startDate: "", startTime: "", endDate: "", endTime: "" };
                          setFilters(empty);
                          setAppliedFilters(empty);
                          setPage(1);
                        }}
                      >
                        Limpiar filtros
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </Toolbar>

        {/* Tabla */}
        <Section title="Turnos abiertos" icon={<CalendarClock />} contentClassName="overflow-x-auto -mx-1">
          <Table>
            <TableHeader style={{ background: "var(--glass-sunken)" }}>
              <TableRow>
                <TableHead className="w-[50px]"><Checkbox /></TableHead>
                <TableHead className="cg-eyebrow">Fecha</TableHead>
                <TableHead className="cg-eyebrow">Puesto</TableHead>
                <TableHead className="cg-eyebrow">Hora de inicio</TableHead>
                <TableHead className="cg-eyebrow">Hora de fin</TableHead>
                <TableHead className="cg-eyebrow">{t("ui.OpenShifts.duracion", "Duración")}</TableHead>
                <TableHead className="cg-eyebrow">{t("ui.OpenShifts.accion", "Acción")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-[200px] text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" style={{ color: "var(--ink-faint)" }} />
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-[360px] text-center">
                    <EmptyState
                      icon={<CalendarClock />}
                      title="No hay turnos abiertos"
                      description="Todos los turnos tienen vigilante asignado o no hay turnos en el período seleccionado."
                      className="border-0 py-2"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((shift) => (
                  <TableRow key={shift.id}>
                    <TableCell><Checkbox /></TableCell>
                    <TableCell className="tabular-nums">{formatDate(shift.startTime)}</TableCell>
                    <TableCell className="font-medium">{shift.station?.stationName ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatTime(shift.startTime)}</TableCell>
                    <TableCell className="tabular-nums">{formatTime(shift.endTime)}</TableCell>
                    <TableCell className="tabular-nums">{durationHours(shift.startTime, shift.endTime)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAssignTarget(shift);
                          setSelectedGuard(null);
                          setGuardSearch("");
                        }}
                      >
                        <UserCheck className="h-4 w-4 mr-1" /> Asignar vigilante
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Section>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-end gap-2 py-4">
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>{t("ui.OpenShifts.elementosPorPagina", "Elementos por página")}</div>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-sm tabular-nums sm:mx-4" style={{ color: "var(--ink-soft)" }}>
            {filtered.length === 0
              ? "0 de 0"
              : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length}`}
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <span className="sr-only">{t("ui.OpenShifts.paginaAnterior", "Página anterior")}</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <span className="sr-only">{t("ui.OpenShifts.paginaSiguiente", "Página siguiente")}</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </div>
      </PageContainer>

      {/* Assign Guard Modal */}
      <Modal
        open={!!assignTarget}
        onOpenChange={(open) => {
          if (!open) { setAssignTarget(null); setSelectedGuard(null); setGuardSearch(""); }
        }}
        title="Asignar vigilante"
        icon={<UserCheck />}
        footer={(
          <>
            <Button variant="outline" onClick={() => { setAssignTarget(null); setSelectedGuard(null); setGuardSearch(""); }}>
              Cancelar
            </Button>
            <Button
              variant="brand"
              disabled={!selectedGuard || assigning}
              onClick={handleAssign}
            >
              {assigning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar asignación
            </Button>
          </>
        )}
      >
          {assignTarget && (
            <div className="space-y-4">
              <div className="glass-sunken p-3 text-sm">
                <div className="font-semibold">{assignTarget.station?.stationName ?? "Sin puesto"}</div>
                <div className="tabular-nums" style={{ color: "var(--ink-soft)" }}>
                  {formatDate(assignTarget.startTime)} · {formatTime(assignTarget.startTime)} – {formatTime(assignTarget.endTime)}
                  {" "}({durationHours(assignTarget.startTime, assignTarget.endTime)})
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--ink-faint)" }} />
                <Input
                  placeholder="Buscar vigilante…"
                  className="pl-9"
                  value={guardSearch}
                  onChange={(e) => setGuardSearch(e.target.value)}
                />
              </div>

              <div className="glass-sunken max-h-56 overflow-y-auto p-1">
                {filteredGuards.length === 0 ? (
                  <div className="p-4 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
                    {allGuards.length === 0 ? "Cargando vigilantes…" : "No se encontraron vigilantes"}
                  </div>
                ) : (
                  filteredGuards.map((g) => {
                    const elegido = selectedGuard?.userId === g.userId;
                    return (
                      <button
                        key={g.userId}
                        type="button"
                        aria-pressed={elegido}
                        className="cg-focus flex w-full cursor-pointer items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-[var(--glass-raised)]"
                        style={elegido ? { background: "var(--brand-wash)", boxShadow: "inset 0 0 0 1px var(--brand-line)" } : undefined}
                        onClick={() => setSelectedGuard(g)}
                      >
                        <span
                          className="h-4 w-4 flex-shrink-0 rounded-full border-2"
                          style={elegido
                            ? { borderColor: "var(--brand)", background: "var(--brand)" }
                            : { borderColor: "var(--hairline)" }}
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