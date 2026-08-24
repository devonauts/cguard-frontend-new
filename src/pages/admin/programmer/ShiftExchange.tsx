import { useState, useEffect, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirmDialog";
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
  SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, ChevronsUpDown, X, Loader2, CheckCircle, XCircle, Trash2,
  ArrowLeftRight, Clock, ThumbsUp, ThumbsDown, Plus,
} from "lucide-react";
import Breadcrumb from "@/components/ui/breadcrumb";
import { PageContainer, PageHeader, Section, MetricTile, Stagger, StatusBadge, EmptyState, Toolbar, Segmented } from "@/components/kit";
import shiftExchangeRequestService, { ShiftExchangeRecord } from "@/lib/api/shiftExchangeRequestService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { getTenantTimezone } from "@/utils/tenantLocation";

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

interface GuardOption { userId: string; fullName: string; }

// Raw guard row as returned by securityGuardService.list.
interface GuardListItem {
  guard?: { id?: string; firstName?: string; lastName?: string; fullName?: string };
  guardId?: string;
  fullName?: string;
}

// ── component ────────────────────────────────────────────────────────────────

// Radix <SelectItem> forbids an empty value; use a sentinel for "any vigilante".
const SHIFT_EXCHANGE_ANY = "__any__";

export default function ShiftExchange() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<ShiftExchangeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [isNewRequestOpen, setIsNewRequestOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Guards for form
  const [guards, setGuards] = useState<GuardOption[]>([]);

  // Form state
  const [form, setForm] = useState({
    fromGuardId: "",
    toGuardId: "",
    fromShiftId: "",
    toShiftId: "",
    notes: "",
  });

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 500 };
      if (statusFilter !== "all") params["filter[status]"] = statusFilter;
      const { rows } = await shiftExchangeRequestService.list(params);
      setRecords(rows);
    } catch (err) {
      console.error("Failed to fetch shift exchange requests", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Load guards when form opens
  useEffect(() => {
    if (!isNewRequestOpen) return;
    if (guards.length > 0) return;
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
        setGuards(opts);
      } catch (e) {
        console.error("Failed to load guards", e);
      }
    })();
  }, [isNewRequestOpen, guards.length]);

  // ── stats ─────────────────────────────────────────────────────────────────
  const stats = {
    pending: records.filter((r) => r.status === "pending").length,
    approved: records.filter((r) => r.status === "approved").length,
    rejected: records.filter((r) => r.status === "rejected").length,
  };

  // ── filter + paginate ─────────────────────────────────────────────────────
  const q = searchQuery.toLowerCase().trim();
  const filtered = records.filter((r) => {
    if (!q) return true;
    return (
      (r.fromGuard?.fullName ?? "").toLowerCase().includes(q) ||
      (r.toGuard?.fullName ?? "").toLowerCase().includes(q)
    );
  });

  // Reparto de las solicitudes entre los tres estados, para que cada KPI diga
  // qué porción del total representa.
  const totalSolicitudes = stats.pending + stats.approved + stats.rejected;
  const pctSolicitudes = (n: number) => (totalSolicitudes > 0 ? Math.round((n / totalSolicitudes) * 100) : 0);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── handlers ──────────────────────────────────────────────────────────────
  const resetForm = () =>
    setForm({ fromGuardId: "", toGuardId: "", fromShiftId: "", toShiftId: "", notes: "" });

  const handleCreate = async () => {
    if (!form.fromGuardId) {
      toast.error("Elige el vigilante que solicita el cambio");
      return;
    }
    setSaving(true);
    try {
      await shiftExchangeRequestService.create({
        fromGuardId: form.fromGuardId || undefined,
        toGuardId: form.toGuardId || undefined,
        fromShiftId: form.fromShiftId || undefined,
        toShiftId: form.toShiftId || undefined,
        notes: form.notes || undefined,
      });
      await fetchRecords();
      setIsNewRequestOpen(false);
      resetForm();
    } catch (err) {
      console.error("Failed to create shift exchange request", err);
      toast.error("Error al crear la solicitud. Inténtelo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const updated = await shiftExchangeRequestService.updateStatus(id, "approved");
      setRecords((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      console.error("Failed to approve", err);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const updated = await shiftExchangeRequestService.updateStatus(id, "rejected");
      setRecords((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (err) {
      console.error("Failed to reject", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: 'Eliminar solicitud', message: "¿Eliminar esta solicitud de intercambio?", confirmText: 'Eliminar', tone: 'danger' }))) return;
    try {
      await shiftExchangeRequestService.destroy(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Failed to delete", err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <StatusBadge tone="warn">Pendiente</StatusBadge>;
      case "approved":
        return <StatusBadge tone="ok">Aprobado</StatusBadge>;
      case "rejected":
        return <StatusBadge tone="bad">Rechazado</StatusBadge>;
      default:
        return <StatusBadge tone="neutral">{status}</StatusBadge>;
    }
  };

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: "Panel de control", path: "/dashboard" },
          { label: "Intercambio de turnos" },
        ]}
      />
      <PageContainer width="wide" className="px-4 lg:px-6">
        <PageHeader
          icon={<ArrowLeftRight />}
          title="Intercambio de turnos"
          subtitle="Solicitudes de intercambio de turnos entre vigilantes."
        />

        {/* KPIs */}
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile
            label="Pendientes"
            value={stats.pending}
            icon={<Clock />}
            delta={totalSolicitudes > 0 ? { value: `${pctSolicitudes(stats.pending)} %`, direction: stats.pending > 0 ? "up" : "flat" } : undefined}
            hint="Esperando una decisión"
          />
          <MetricTile
            label="Aprobadas"
            value={stats.approved}
            icon={<ThumbsUp />}
            delta={totalSolicitudes > 0 ? { value: `${pctSolicitudes(stats.approved)} %`, direction: "up" } : undefined}
            hint="Del total de solicitudes"
          />
          <MetricTile
            label="Rechazadas"
            value={stats.rejected}
            icon={<ThumbsDown />}
            delta={totalSolicitudes > 0 ? { value: `${pctSolicitudes(stats.rejected)} %`, direction: stats.rejected > 0 ? "down" : "flat" } : undefined}
            hint="Del total de solicitudes"
          />
        </Stagger>

        {/* Barra de filtros */}
        <Toolbar className="justify-between gap-4">
          {/* Elegir UNO de cuatro estados: el conmutador del sistema, no un
              desplegable. Muestra las cuatro opciones sin abrir nada. */}
          <Segmented<"all" | "pending" | "approved" | "rejected">
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={[
              { value: "all", label: "Todos" },
              { value: "pending", label: "Pendiente" },
              { value: "approved", label: "Aprobado" },
              { value: "rejected", label: "Rechazado" },
            ]}
          />

          <div className="flex w-full flex-col items-center gap-4 md:w-auto md:flex-row">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--ink-faint)" }} />
              <Input
                placeholder="Buscar vigilante…"
                className="pl-9"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              />
            </div>

            <div className="flex items-center gap-2">
              {/* New Request Sheet */}
              <Sheet open={isNewRequestOpen} onOpenChange={(v) => { setIsNewRequestOpen(v); if (!v) resetForm(); }}>
                <SheetTrigger asChild>
                  <Button variant="brand">
                    <Plus className="h-4 w-4 mr-1" /> Nueva solicitud
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                  <SheetHeader className="relative">
                    <SheetTitle>Nueva solicitud de intercambio</SheetTitle>
                    <Button variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setIsNewRequestOpen(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </SheetHeader>
                  <div className="grid gap-6 py-6">
                    <div className="grid gap-2">
                      <Label>Vigilante solicitante*</Label>
                      <Select value={form.fromGuardId} onValueChange={(v) => setForm({ ...form, fromGuardId: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {guards.map((g) => (
                            <SelectItem key={g.userId} value={g.userId}>{g.fullName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>Vigilante receptor (opcional)</Label>
                      <Select value={form.toGuardId || SHIFT_EXCHANGE_ANY} onValueChange={(v) => setForm({ ...form, toGuardId: v === SHIFT_EXCHANGE_ANY ? "" : v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SHIFT_EXCHANGE_ANY}>Cualquier vigilante</SelectItem>
                          {guards.map((g) => (
                            <SelectItem key={g.userId} value={g.userId}>{g.fullName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>Notas</Label>
                      <Textarea
                        rows={4}
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        placeholder="Describe los detalles del intercambio…"
                      />
                    </div>
                  </div>
                  <SheetFooter>
                    <Button
                      variant="brand"
                      className="w-full sm:w-auto"
                      disabled={saving}
                      onClick={handleCreate}
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Crear solicitud
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>

            </div>
          </div>
        </Toolbar>

        {/* Tabla */}
        <Section title="Solicitudes de intercambio" icon={<ArrowLeftRight />} contentClassName="overflow-x-auto -mx-1">
          <Table>
            <TableHeader style={{ background: "var(--glass-sunken)" }}>
              <TableRow>
                <TableHead className="w-[50px]"><Checkbox /></TableHead>
                <TableHead className="cg-eyebrow">Fecha de solicitud</TableHead>
                <TableHead className="cg-eyebrow">Enviada por</TableHead>
                <TableHead className="cg-eyebrow">Enviada a</TableHead>
                <TableHead className="cg-eyebrow">Estado</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-[200px] text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" style={{ color: "var(--ink-faint)" }} />
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-[360px] text-center">
                    <EmptyState
                      icon={<ArrowLeftRight />}
                      title="No se encontraron resultados"
                      description="No pudimos encontrar ningún elemento que coincida con su búsqueda."
                      className="border-0 py-2"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((rec) => (
                  <TableRow key={rec.id}>
                    <TableCell><Checkbox /></TableCell>
                    <TableCell className="tabular-nums">{formatDate(rec.requestDate)}</TableCell>
                    <TableCell className="font-medium">{rec.fromGuard?.fullName ?? "—"}</TableCell>
                    <TableCell>{rec.toGuard?.fullName ?? "Abierto"}</TableCell>
                    <TableCell>{getStatusBadge(rec.status)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <ChevronsUpDown className="h-4 w-4" style={{ color: "var(--ink-soft)" }} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {rec.status === "pending" && (
                            <>
                              <DropdownMenuItem onClick={() => handleApprove(rec.id)}>
                                <CheckCircle className="mr-2 h-4 w-4" style={{ color: "var(--ok-text)" }} /> Aprobar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleReject(rec.id)}>
                                <XCircle className="mr-2 h-4 w-4" style={{ color: "var(--bad-text)" }} /> Rechazar
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => handleDelete(rec.id)} style={{ color: "var(--bad-text)" }}>
                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Section>

        {/* Pagination */}
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="text-sm" style={{ color: "var(--ink-soft)" }}>{t("ui.ShiftExchange.elementosPorPagina", "Elementos por página")}</div>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-[70px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <div className="mx-4 text-sm tabular-nums" style={{ color: "var(--ink-soft)" }}>
            {filtered.length === 0
              ? "0 de 0"
              : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length}`}
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <span className="sr-only">{t("ui.ShiftExchange.paginaAnterior", "Página anterior")}</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Button>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              <span className="sr-only">{t("ui.ShiftExchange.paginaSiguiente", "Página siguiente")}</span>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </div>
      </PageContainer>
    </AppLayout>
  );
}
