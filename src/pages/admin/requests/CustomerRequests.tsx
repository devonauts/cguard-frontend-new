import { useState, useEffect, useCallback } from "react";
import { DataTable } from "@/components/table/DataTable";
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
import customerRequestService, {
  CustomerRequestRecord,
  CustomerRequestStats,
} from "@/lib/api/customerRequestService";
import { useDebouncedValue } from "@/hooks/useDebounce";
import {
  PageContainer,
  PageHeader,
  Section,
  MetricTile,
  StatsStrip,
  StatusBadge,
  EmptyState,
  Stagger,
  Toolbar,
  SearchInput,
} from "@/components/kit";

import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── component ────────────────────────────────────────────────────────────────

export default function CustomerRequests() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<CustomerRequestRecord[]>([]);
  const [count, setCount] = useState(0);
  const [stats, setStats] = useState<CustomerRequestStats>({
    open: 0,
    closed: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery.trim(), 350);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "abierto" | "cerrado"
  >("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ── fetch (filtered and paged on the server) ─────────────────────────────
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await customerRequestService.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        query: debouncedQuery || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      setRecords(res.rows);
      setCount(res.count);
      setStats(res.stats);
    } catch (err) {
      console.error("Failed to fetch customer requests", err);
      setRecords([]);
      setCount(0);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedQuery, page, pageSize]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleSetStatus = async (id: string, status: "abierto" | "cerrado") => {
    try {
      await customerRequestService.updateStatus(id, status);
      // Refetch: the row may leave the current status filter and the
      // counters change.
      fetchRecords();
      toast.success(
        status === "cerrado"
          ? t(
              "ui.CustomerRequests.solicitudMarcadaComoAtendida",
              "Solicitud marcada como atendida",
            )
          : t("ui.CustomerRequests.solicitudReabierta", "Solicitud reabierta"),
      );
    } catch (err) {
      console.error("Failed to update request status", err);
      toast.error(t("ui.CustomerRequests.errorAlActualizarLaSolicitud"));
    }
  };

  // What the customer asked for (stored by the app in comments[0].type).
  const requestTypeLabel = (type: string | null | undefined) => {
    switch (type) {
      case "extra_guard":
        return t("ui.CustomerRequests.tipoVigilanteAdicional", "Vigilante adicional");
      case "quote":
        return t("ui.CustomerRequests.tipoCotizacion", "Cotización");
      case "service":
        return t("ui.CustomerRequests.tipoServicio", "Servicio");
      default:
        return "—";
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "abierto":
        return (
          <StatusBadge tone="warn">
            {t("ui.CustomerRequests.abierta", "Abierta")}
          </StatusBadge>
        );
      case "cerrado":
        return (
          <StatusBadge tone="ok">
            {t("ui.CustomerRequests.atendida", "Atendida")}
          </StatusBadge>
        );
      default:
        return <StatusBadge tone="neutral">{status ?? "—"}</StatusBadge>;
    }
  };

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<Inbox />}
          title={t("sidebar.solicitudes-clientes", "Solicitudes de clientes")}
          subtitle={t("ui.CustomerRequests.mensajesYSolicitudesEnviadasDesde")}
        />

        {/* Stats */}
        <StatsStrip className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricTile
            label={t("ui.CustomerRequests.abiertas", "Abiertas")}
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
            label={t("ui.CustomerRequests.atendidas", "Atendidas")}
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
        </StatsStrip>

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
                <SelectItem value="abierto">
                  {t("ui.CustomerRequests.abierta", "Abierta")}
                </SelectItem>
                <SelectItem value="cerrado">
                  {t("ui.CustomerRequests.atendida", "Atendida")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <SearchInput
            className="w-full md:w-80"
            placeholder={t("ui.CustomerRequests.buscarPorAsuntoClienteO")}
            value={searchQuery}
            onChange={(v) => {
              setSearchQuery(v);
              setPage(1);
            }}
          />
        </Toolbar>

        <Section
          title={t("ui.CustomerRequests.solicitudes", "Solicitudes")}
          icon={<Inbox />}>
          {error && (
            <EmptyState
              className="mb-4"
              icon={<AlertCircle style={{ color: "var(--bad-text)" }} />}
              title={t(
                "ui.CustomerRequests.ocurrioUnErrorAlObtener",
                "Ocurrió un error al obtener las solicitudes.",
              )}
              description={t(
                "ui.CustomerRequests.revisaTuConexionYVuelve",
                "Revisa tu conexión y vuelve a intentarlo.",
              )}
              action={
                <Button size="sm" variant="outline" onClick={fetchRecords}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t("ui.shared.reintentar", "Reintentar")}
                </Button>
              }
            />
          )}
          {/* Tabla — hidden on error: an empty table would read as "no requests". */}
          {!error && (
          <div
            className="overflow-hidden rounded-2xl"
            style={{ border: "1px solid var(--hairline)" }}
          >
            {/* 7 columnas: por debajo de ~880 px la tabla se desplaza dentro de su
              caja (el envoltorio de `Table` ya trae el `overflow-auto`) en vez de
              apretar cada columna hasta lo ilegible. */}
            {/* `DataTable` y no el primitivo `<Table>` con `min-w-[880px]`: esas
                880 px en una pantalla de 390 se leían arrastrando de lado. Ahora
                se pliega en fichas, y el desplegable de la última columna —el
                mismo `DropdownMenu` escrito a mano de siempre— va por
                `rowActions`. */}
            <DataTable
              columns={[
                {
                  key: "dateTime",
                  header: t("comun.fecha"),
                  render: (_v: any, row: any) =>
                    formatDate(row.dateTime || row.createdAt),
                },
                {
                  key: "callerName",
                  header: t("comun.cliente"),
                  render: (_v: any, row: any) => row.callerName ?? "—",
                },
                {
                  key: "subject",
                  header: t("guards.memos.form.subject", "Asunto"),
                  titulo: true,
                  render: (_v: any, row: any) => row.subject ?? "—",
                },
                {
                  key: "type",
                  header: t("ui.CustomerRequests.tipo", "Tipo"),
                  render: (_v: any, row: any) => requestTypeLabel(row.type),
                },
                {
                  key: "content",
                  header: t("ui.CustomerRequests.mensaje", "Mensaje"),
                  render: (_v: any, row: any) => (
                    <span style={{ color: "var(--ink-soft)" }}>
                      {row.content ?? "—"}
                    </span>
                  ),
                },
                {
                  key: "station",
                  header: t("comun.puesto"),
                  render: (_v: any, row: any) => row.station?.stationName ?? "—",
                },
                {
                  key: "status",
                  header: t("comun.estado"),
                  render: (_v: any, row: any) => getStatusBadge(row.status),
                },
              ]}
              containerless
              data={records as any}
              emptyState={
                <EmptyState
                  variant="inline"
                  icon={<Inbox />}
                  title={t(
                    "ui.CustomerRequests.noHaySolicitudesDeClientes",
                    "No hay solicitudes de clientes",
                  )}
                  description={t(
                    "ui.CustomerRequests.lasSolicitudesEnviadasDesdeLa",
                    "Las solicitudes enviadas desde la app de clientes aparecerán aquí.",
                  )}
                />
              }
              loading={loading}
              rowActions={(row: any) =>
                row.status !== "cerrado"
                  ? [
                      {
                        label: t(
                          "ui.CustomerRequests.marcarComoAtendida",
                          "Marcar como atendida",
                        ),
                        icon: (
                          <CheckCircle style={{ color: "var(--ok-text)" }} />
                        ),
                        onClick: () => handleSetStatus(row.id, "cerrado"),
                      },
                    ]
                  : [
                      {
                        label: t("ui.CustomerRequests.reabrir", "Reabrir"),
                        icon: (
                          <RotateCcw style={{ color: "var(--warn-text)" }} />
                        ),
                        onClick: () => handleSetStatus(row.id, "abierto"),
                      },
                    ]
              }
            />
          </div>
          )}

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
              {count === 0
                ? t("guards.list.pagination.emptyRange", "0 – 0 de 0")
                : t("guards.list.pagination.range", {
                    defaultValue: "{{start}} - {{end}} de {{total}}",
                    start: (page - 1) * pageSize + 1,
                    end: Math.min(page * pageSize, count),
                    total: count,
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
