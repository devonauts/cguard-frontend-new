import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  EllipsisVertical,
  Loader2,
  CheckCircle,
  RotateCcw,
  AlertCircle,
  Inbox,
  MailQuestion,
  MailOpen,
  Layers,
} from "lucide-react";
import Breadcrumb from "@/components/ui/breadcrumb";
import customerRequestService, {
  CustomerRequestRecord,
} from "@/lib/api/customerRequestService";
import {
  PageContainer,
  PageHeader,
  Section,
  MetricTile,
  StatusBadge,
  EmptyState,
  Stagger,
  Toolbar,
} from "@/components/kit";

import { localeActual } from "@/lib/localeActual";
// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(localeActual(), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// The customer app posts requests with callerType='client'.
const isCustomerRequest = (r: CustomerRequestRecord) =>
  String(r.callerType ?? "").toLowerCase() === "client";

// ── component ────────────────────────────────────────────────────────────────

export default function CustomerRequests() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<CustomerRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "abierto" | "cerrado"
  >("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ── fetch ─────────────────────────────────────────────────────────────────
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { rows } = await customerRequestService.list({ limit: 500 });
      // Only customer-originated requests (callerType='client').
      setRecords((rows || []).filter(isCustomerRequest));
    } catch (err) {
      console.error("Failed to fetch customer requests", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // ── stats ─────────────────────────────────────────────────────────────────
  const stats = {
    open: records.filter((r) => r.status === "abierto").length,
    closed: records.filter((r) => r.status === "cerrado").length,
    total: records.length,
  };

  // ── filter + paginate ─────────────────────────────────────────────────────
  const q = searchQuery.toLowerCase().trim();
  const filtered = records.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q) return true;
    return (
      (r.subject ?? "").toLowerCase().includes(q) ||
      (r.content ?? "").toLowerCase().includes(q) ||
      (r.callerName ?? "").toLowerCase().includes(q) ||
      (r.station?.stationName ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleSetStatus = async (id: string, status: "abierto" | "cerrado") => {
    try {
      await customerRequestService.updateStatus(id, status);
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r)),
      );
      toast.success(
        status === "cerrado"
          ? "Solicitud marcada como atendida"
          : "Solicitud reabierta",
      );
    } catch (err) {
      console.error("Failed to update request status", err);
      toast.error(t("ui.CustomerRequests.errorAlActualizarLaSolicitud"));
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "abierto":
        return <StatusBadge tone="warn">Abierta</StatusBadge>;
      case "cerrado":
        return <StatusBadge tone="ok">Atendida</StatusBadge>;
      default:
        return <StatusBadge tone="neutral">{status ?? "—"}</StatusBadge>;
    }
  };

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: "Panel de control", path: "/dashboard" },
          {
            label: t("sidebar.solicitudes-clientes", "Solicitudes de clientes"),
          },
        ]}
      />
      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<Inbox />}
          title={t("sidebar.solicitudes-clientes", "Solicitudes de clientes")}
          subtitle={t("ui.CustomerRequests.mensajesYSolicitudesEnviadasDesde")}
        />

        {/* Stats */}
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile
            label="Abiertas"
            value={stats.open}
            icon={<MailQuestion />}
            delta={
              stats.total > 0
                ? {
                    value: `${Math.round((stats.open / stats.total) * 100)} %`,
                    direction: stats.open > 0 ? "up" : "flat",
                  }
                : undefined
            }
            hint={t("ui.CustomerRequests.sobreElTotalRecibido")}
          />
          <MetricTile
            label="Atendidas"
            value={stats.closed}
            icon={<MailOpen />}
            hint={t("ui.CustomerRequests.solicitudesYaCerradas")}
          />
          <MetricTile
            label={t("comun.total")}
            value={stats.total}
            icon={<Layers />}
            hint={t("ui.CustomerRequests.recibidasDesdeLaAppDe")}
          />
        </Stagger>

        {/* Barra de filtros */}
        <Toolbar className="justify-between gap-4">
          <div className="w-full md:w-52">
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as "all" | "abierto" | "cerrado");
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
                <SelectItem value="abierto">Abierta</SelectItem>
                <SelectItem value="cerrado">Atendida</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-full md:w-80">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--ink-faint)" }}
            />
            <Input
              placeholder={t("ui.CustomerRequests.buscarPorAsuntoClienteO")}
              className="pl-9"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </Toolbar>

        <Section title="Solicitudes" icon={<Inbox />}>
          {/* Tabla */}
          <div
            className="overflow-hidden rounded-2xl"
            style={{ border: "1px solid var(--hairline)" }}
          >
            {/* 7 columnas: por debajo de ~880 px la tabla se desplaza dentro de su
              caja (el envoltorio de `Table` ya trae el `overflow-auto`) en vez de
              apretar cada columna hasta lo ilegible. */}
            <Table className="min-w-[880px]">
              <TableHeader style={{ background: "var(--glass-sunken)" }}>
                <TableRow>
                  <TableHead className="cg-eyebrow">
                    {t("comun.fecha")}
                  </TableHead>
                  <TableHead className="cg-eyebrow">
                    {t("comun.cliente")}
                  </TableHead>
                  <TableHead className="cg-eyebrow">Asunto</TableHead>
                  <TableHead className="cg-eyebrow">Mensaje</TableHead>
                  <TableHead className="cg-eyebrow">
                    {t("comun.puesto")}
                  </TableHead>
                  <TableHead className="cg-eyebrow">
                    {t("comun.estado")}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-[200px] text-center">
                      <Loader2
                        className="mx-auto h-6 w-6 animate-spin"
                        style={{ color: "var(--ink-faint)" }}
                      />
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-[300px] text-center">
                      <EmptyState
                        icon={<AlertCircle />}
                        title={t(
                          "ui.CustomerRequests.noSePudoCargarLa",
                          "No se pudo cargar la información",
                        )}
                        description={t(
                          "ui.CustomerRequests.ocurrioUnErrorAlObtener",
                        )}
                        action={
                          <Button variant="outline" onClick={fetchRecords}>
                            <RotateCcw className="mr-2 h-4 w-4" /> Reintentar
                          </Button>
                        }
                        className="border-0"
                      />
                    </TableCell>
                  </TableRow>
                ) : paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-[400px] text-center">
                      <EmptyState
                        icon={<Inbox />}
                        title={t(
                          "ui.CustomerRequests.noHaySolicitudesDeClientes",
                        )}
                        description={t(
                          "ui.CustomerRequests.lasSolicitudesEnviadasDesdeLa",
                        )}
                        className="border-0"
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((rec) => (
                    <TableRow key={rec.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatDate(rec.dateTime || rec.createdAt)}
                      </TableCell>
                      <TableCell>{rec.callerName ?? "—"}</TableCell>
                      <TableCell className="font-medium">
                        {rec.subject ?? "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-[280px] truncate"
                        style={{ color: "var(--ink-soft)" }}
                        title={rec.content ?? undefined}
                      >
                        {rec.content ?? "—"}
                      </TableCell>
                      <TableCell>{rec.station?.stationName ?? "—"}</TableCell>
                      <TableCell>{getStatusBadge(rec.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <EllipsisVertical
                                className="h-4 w-4"
                                style={{ color: "var(--ink-soft)" }}
                              />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {rec.status !== "cerrado" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleSetStatus(rec.id, "cerrado")
                                }
                              >
                                <CheckCircle
                                  className="mr-2 h-4 w-4"
                                  style={{ color: "var(--ok-text)" }}
                                />{" "}
                                Marcar como atendida
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onClick={() =>
                                  handleSetStatus(rec.id, "abierto")
                                }
                              >
                                <RotateCcw
                                  className="mr-2 h-4 w-4"
                                  style={{ color: "var(--warn-text)" }}
                                />{" "}
                                Reabrir
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-center gap-2 py-4 sm:justify-end">
            <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.CustomerRequests.elementosPorPagina",
                "Elementos por página",
              )}
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
                ? "0 de 0"
                : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, filtered.length)} de ${filtered.length}`}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <span className="sr-only">
                  {t("ui.CustomerRequests.paginaAnterior", "Página anterior")}
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
                  {t("ui.CustomerRequests.paginaSiguiente", "Página siguiente")}
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
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
