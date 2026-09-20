import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Filter as FilterIcon,
  Plus,
  Route as RouteIcon,
} from "lucide-react";

import RouteDetailModal from "./RouteDetailModal";
import { InsigniaOptimizada } from "./OptimizacionPanel";

import routeService from "@/lib/api/routeService";
import { postSiteService } from "@/lib/api/postSiteService";
import { confirmDialog } from "@/components/ui/confirmDialog";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  StatusBadge,
  Toolbar,
  SkeletonCards,
  SearchInput,
} from "@/components/kit";
import {
  type RouteFilters,
  defaultRouteFilters,
} from "@/lib/validators/route-filters";
import { enLotes } from "@/lib/enLotes";

export default function RoutesPage() {
  const [openFilter, setOpenFilter] = useState(false);
  const [filters, setFilters] = useState<RouteFilters>(defaultRouteFilters);

  const [rows, setRows] = useState<any[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { t } = useTranslation();

  const [limit, setLimit] = useState<number>(Number(filters.perPage || 25));
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [searchInput, setSearchInput] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  // Debounce the search box, then reset to the first page.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    let mounted = true;

    // Selection references ids in the current view; drop it when the view changes.
    setSelectedIds([]);
    (async () => {
      try {
        setLoading(true);
        const params: Record<string, any> = {
          limit,
          offset: (page - 1) * limit,
        };

        if (search) params["filter[name]"] = search;
        const resp = await routeService.list(params);

        if (!mounted) return;
        const initialRows = resp.rows || [];

        setRows(initialRows);
        setTotalCount(
          typeof resp.count === "number"
            ? resp.count
            : (initialRows || []).length,
        );

        // Resolve missing post-site names for points if backend didn't include them
        (async () => {
          try {
            const missingSiteIds = new Set<string>();

            (initialRows || []).forEach((r: any) => {
              if (r.points && Array.isArray(r.points)) {
                r.points.forEach((p: any) => {
                  if (!p.siteName && (p.siteId || p.postSiteId)) {
                    missingSiteIds.add(String(p.siteId || p.postSiteId));
                  }
                });
              }
            });

            if (missingSiteIds.size === 0) return;

            const ids = Array.from(missingSiteIds);
            /* Una petición por puesto que la lista no trajo con nombre, y la
               lista no tiene tope: con cincuenta rutas esto eran cien o
               doscientas peticiones simultáneas nada más abrir la pantalla,
               sin que nadie pulsara nada. Limitadas a seis en vuelo mientras
               el listado no devuelva `siteName`, que es el arreglo de verdad. */
            const asentados = await enLotes(ids, (id) => postSiteService.get(id));
            const results = asentados.map((r) =>
              r.status === "fulfilled" ? r.value : null,
            );
            const map = new Map<string, any>();

            results.forEach((res: any, i: number) => {
              const id = ids[i];

              if (res)
                map.set(
                  id,
                  res.companyName ||
                    res.name ||
                    (res.company &&
                      (res.company.name || res.company.companyName)) ||
                    String(res.id),
                );
            });

            if (map.size > 0) {
              setRows((prev) =>
                (prev || []).map((r: any) => ({
                  ...r,
                  points: (r.points || []).map((p: any) => ({
                    ...p,
                    siteName:
                      p.siteName ||
                      map.get(String(p.siteId || p.postSiteId)) ||
                      p.siteName,
                  })),
                })),
              );
            }
          } catch (e) {
            console.warn("Failed to resolve post site names for routes", e);
          }
        })();
      } catch (e) {
        console.error("Error loading routes", e);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [limit, page, search, refreshKey]);

  const reload = () => setRefreshKey((k) => k + 1);

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(rows.map((r: any) => r.id).filter(Boolean));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
    );
  };

  const handleBulkAction = async (action: string) => {
    // Only deletion is backed by the API; activar/inactivar have no server-side
    // state on routes yet, so they are not offered.
    if (action !== "eliminar") return;
    if (selectedIds.length === 0) {
      toast.error(t("ui.RoutesPage.seleccionaAlMenosUnaRuta"));

      return;
    }
    if (
      !(await confirmDialog({
        title: "Eliminar rutas",
        message: `¿Eliminar ${selectedIds.length} ruta(s)? Esta acción no se puede deshacer.`,
        confirmText: "Eliminar",
        tone: "danger",
      }))
    )
      return;
    try {
      setBulkBusy(true);
      await routeService.destroy(selectedIds);
      toast.success(`${selectedIds.length} ruta(s) eliminada(s).`);
      setSelectedIds([]);
      reload();
    } catch (e: any) {
      toast.error(
        String(
          e?.message ||
            e?.toString() ||
            t(
              "routes.list.bulkDeleteError",
              "No se pudieron eliminar las rutas",
            ),
        ),
      );
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <AppLayout>

      <PageContainer width="wide">
        <PageHeader
          actions={
            <Button asChild variant="brand">
              <Link
                to={(() => {
                  try {
                    const t = localStorage.getItem("tenantId");

                    return t
                      ? `/tenant/${t}/vehicle-patrol/routes/add-new`
                      : "/vehicle-patrol/routes/add-new";
                  } catch (e) {
                    return "/vehicle-patrol/routes/add-new";
                  }
                })()}
              >
                <Plus className="mr-1 h-4 w-4" /> Nueva ruta
              </Link>
            </Button>
          }
          icon={<RouteIcon />}
          subtitle={t("ui.RoutesPage.defineYGestionaLasRutas")}
          title="Rutas"
        />

        <Toolbar className="justify-between">
          <div className="flex items-center gap-2">
            <Select
              disabled={selectedIds.length === 0 || bulkBusy}
              value=""
              onValueChange={(v) => handleBulkAction(v)}
            >
              <SelectTrigger className="w-44">
                <SelectValue
                  placeholder={
                    selectedIds.length > 0
                      ? `Acción (${selectedIds.length})`
                      : "Acción"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eliminar">{t("actions.delete")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <SearchInput
              className="min-w-0 flex-1 sm:flex-none"
              placeholder={t("ui.RoutesPage.buscarRuta")}
              value={searchInput}
              onChange={(v) => setSearchInput(v)}
            />

            <Sheet open={openFilter} onOpenChange={setOpenFilter}>
              <SheetTrigger asChild>
                <Button
                  style={{
                    borderColor: "var(--brand-line)",
                    color: "var(--brand-text)",
                  }}
                  variant="outline"
                >
                  <FilterIcon className="mr-2 h-4 w-4" />
                  Filtros
                </Button>
              </SheetTrigger>

              <SheetContent
                className="w-full overflow-y-auto sm:w-[460px]"
                side="right"
              >
                <SheetHeader>
                  <SheetTitle>Filtros</SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <Label>Sectores</Label>
                    <Select
                      value={filters.categoryId ?? ""}
                      onValueChange={(v) =>
                        setFilters((s) => ({ ...s, categoryId: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default</SelectItem>
                        <SelectItem value="turno-dia">
                          {t("ui.Routes.turnoDia", "Turno día")}
                        </SelectItem>
                        <SelectItem value="turno-noche">
                          {t("ui.RoutesPage.turnoNoche")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("comun.estado")}</Label>
                    <Select
                      value={filters.status}
                      onValueChange={(v) =>
                        setFilters((s) => ({
                          ...s,
                          status: v as RouteFilters["status"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("common.active")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="activo">
                          {t("common.active")}
                        </SelectItem>
                        <SelectItem value="inactivo">
                          {t("common.inactive")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Los filtros por sector y estado estarán disponibles
                    próximamente. Usa el buscador para filtrar rutas por nombre.
                  </p>
                  <Button disabled className="w-full" variant="brand">
                    Filtro
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </Toolbar>

        <Section
          contentClassName="overflow-hidden rounded-xl border"
          icon={<RouteIcon />}
          title={t("ui.RoutesPage.listadoDeRutas", "Listado de rutas")}
        >
          <div className="overflow-x-auto">
            <table className="cg-tabla-fichas w-full min-w-[900px] border-collapse text-left text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b">
                  <th className="px-4 py-3">
                    <Checkbox
                      aria-label={t("kit.table.selectAll")}
                      checked={
                        rows.length > 0 && selectedIds.length === rows.length
                      }
                      onCheckedChange={(v) => toggleSelectAll(v === true)}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("comun.nombre")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("comun.puestoDeSeguridad")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("comun.supervisor")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("ui.Routes.vehiculo", "Vehículo")}
                  </th>
                  <th className="px-4 py-3 font-semibold">{t("comun.tipo")}</th>
                  <th className="px-4 py-3 font-semibold">
                    {t("comun.estado")}
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>

              <tbody>
                {loading && (
                  <tr>
                    <td className="p-4" colSpan={8}>
                      <SkeletonCards count={4} />
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td className="py-10" colSpan={8}>
                      <EmptyState
                        description={t(
                          "ui.RoutesPage.noPudimosEncontrarNingunaRuta",
                        )}
                        icon={<RouteIcon />}
                        title={t("kit.table.emptyTitle")}
                      />
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.length > 0 &&
                  rows.map((r: any) => (
                    <tr key={r.id || r._id} className="border-b">
                      <td className="px-4 py-3" data-rotulo={t("comun.nombre")}>
                        <Checkbox
                          aria-label={t("ui.RoutesPage.seleccionarRuta")}
                          checked={selectedIds.includes(r.id)}
                          onCheckedChange={(v) =>
                            toggleSelectOne(r.id, v === true)
                          }
                        />
                      </td>
                      <td className="px-4 py-3 font-medium" data-rotulo={t("comun.puestoDeSeguridad")}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{r.name || r.title || r.routeName || "—"}</span>
                          {/* Sólo cuando lo está: una insignia «sin optimizar» en
                          cada fila de la lista sería ruido en el 90 % de ellas.
                          La ficha sí enseña siempre el estado. */}
                          {r.optimized ? (
                            <InsigniaOptimizada compacta optimizada />
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3" data-rotulo={t("comun.supervisor")}>
                        {(() => {
                          const pts =
                            r.points && Array.isArray(r.points) ? r.points : [];

                          if (pts.length > 0) {
                            const names = pts
                              .map(
                                (p: any) =>
                                  p.siteName || p.address || p.postSiteId,
                              )
                              .filter(Boolean);

                            if (names.length === 0) return r.address || "—";
                            if (names.length <= 2) return names.join(", ");

                            return `${names.slice(0, 2).join(", ")} (+${names.length - 2} más)`;
                          }

                          return r.address || "—";
                        })()}
                      </td>
                      <td className="px-4 py-3" data-rotulo={t("ui.Routes.vehiculo", "Vehículo")}>
                        {(() => {
                          const g =
                            r.assignedGuard ||
                            r.guard ||
                            r.supervisor ||
                            r.supervisorId ||
                            r.guardId;

                          if (!g) return "—";
                          if (typeof g === "string") return g;
                          if (typeof g === "object") {
                            const first =
                              g.firstName || g.first_name || g.name || "";
                            const last = g.lastName || g.last_name || "";
                            const full = `${first} ${last}`.trim();

                            if (full) return full;

                            return g.email || g.id || "—";
                          }

                          return String(g);
                        })()}
                      </td>
                      <td className="px-4 py-3" data-rotulo={t("comun.tipo")}>
                        {(r.vehicle && (r.vehicle.plate || r.vehicle.name)) ||
                          r.vehicleId ||
                          "—"}
                      </td>
                      <td className="px-4 py-3" data-rotulo={t("comun.estado")}>
                        {(() => {
                          if (
                            r.continuous !== undefined &&
                            r.continuous !== null
                          ) {
                            return r.continuous ? "Continua" : "Programada";
                          }
                          const t = r.type || r.routeType;

                          if (!t) return r.isPatrol ? "Patrulla" : "—";
                          if (typeof t === "string") return t;
                          if (typeof t === "object")
                            return t.name || t.label || t.type || "—";

                          return String(t);
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        {r.active === false ? (
                          <StatusBadge tone="slate">
                            {t("common.inactive")}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="green">
                            {t("common.active")}
                          </StatusBadge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          style={{ color: "var(--brand-text)" }}
                          variant="ghost"
                          onClick={() => {
                            setDetailId(r.id);
                            setDetailOpen(true);
                          }}
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-foreground/70 bg-muted/30 border-x border-b rounded-b-lg">
            <div className="flex items-center gap-2">
              <span>
                {t("clients.pagination.itemsPerPage", "Elementos por página")}
              </span>
              <Select
                value={limit.toString()}
                onValueChange={(v) => {
                  setLimit(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 min-w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              {page} – {Math.max(1, Math.ceil(totalCount / limit))}
            </div>

            <div className="flex gap-2">
              <Button
                disabled={page === 1 || loading}
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("clients.pagination.prev", "Anterior")}
              </Button>
              <Button
                disabled={page * limit >= totalCount || loading}
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
              >
                {t("clients.pagination.next", "Siguiente")}
              </Button>
            </div>
          </div>
        </Section>
        <RouteDetailModal
          open={detailOpen}
          routeId={detailId}
          onOpenChange={(v) => {
            if (!v) setDetailId(null);
            setDetailOpen(v);
          }}
        />
      </PageContainer>
    </AppLayout>
  );
}
