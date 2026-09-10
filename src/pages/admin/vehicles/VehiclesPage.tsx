import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Filter as FilterIcon,
  Eye,
  Edit,
  Archive,
  Car,
  CheckCircle2,
  PauseCircle,
  Plus,
  Palette,
  Gauge,
  KeyRound,
  ImageOff,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
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
  Stagger,
  StatCard,
  StatusBadge,
  EmptyState,
  Toolbar,
  Segmented,
  GlassPanel,
  IconTile,
  Field,
  SkeletonCards,
  SmartImage,
} from "@/components/kit";
import { TableSearch } from "@/components/table/TableToolbar";
import { RowActionsMenu } from "@/components/table/RowActionsMenu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  vehicleFiltersSchema,
  type VehicleFilters,
  defaultVehicleFilters,
} from "@/lib/validators/vehicle-filters";
import vehicleService from "@/lib/api/vehicleService";

/** Cómo se llama la propiedad del vehículo en la ficha. Constante de MÓDULO: la
 *  clave viaja junto al español de respaldo y se traduce al PINTAR; llamar a t()
 *  aquí dejaría la etiqueta clavada en el idioma de arranque. La clave del mapa
 *  (`propio`, `alquilado`, `cliente`) es el valor guardado y no se toca. */
const OWNERSHIP_LABELS: Record<string, { label: string; labelKey: string }> = {
  propio: { label: "Propio", labelKey: "vehicles.ownership.propio" },
  alquilado: { label: "Alquilado", labelKey: "vehicles.ownership.alquilado" },
  cliente: { label: "Del cliente", labelKey: "vehicles.ownership.cliente" },
};

/** Primera foto utilizable del vehículo, si la hay. */
const fotoVehiculo = (v: any): string | null => {
  const img = Array.isArray(v?.imageUrl) ? v.imageUrl[0] : null;

  return img?.downloadUrl || img?.publicUrl || null;
};

export default function VehiclesPage() {
  const { t } = useTranslation();
  const [openFilter, setOpenFilter] = useState(false);
  const [filters, setFilters] = useState<VehicleFilters>(defaultVehicleFilters);

  const [rows, setRows] = useState<any[]>([]);
  const [count, setCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [bulkActionConfirm, setBulkActionConfirm] = useState<string | null>(
    null,
  );
  const [bulkActionLoading, setBulkActionLoading] = useState<boolean>(false);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [detailsLoading, setDetailsLoading] = useState<boolean>(false);
  const [detailsVehicle, setDetailsVehicle] = useState<any | null>(null);
  const [vista, setVista] = useState<"tarjetas" | "lista">("tarjetas");

  const aplicarFiltros = () => {
    const parse = vehicleFiltersSchema.safeParse(filters);

    if (!parse.success) {
      console.error(parse.error.flatten());

      return;
    }
    console.log("Aplicando filtros:", parse.data);
    setOpenFilter(false);
  };

  const handleBulkActionSelect = (action: string) => {
    if (!action) return;
    setSelectedAction(action);
    if (!selectedIds || selectedIds.length === 0) return;
    setBulkActionConfirm(action);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(rows.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    } else {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const perPageNum = Number(filters.perPage || 10);
      const params: any = {
        limit: perPageNum,
        offset: (page - 1) * perPageNum,
      };

      if (filters.search) params.query = filters.search;
      if (filters.status) params.active = filters.status === "activo";

      const resp = await vehicleService.list(params);

      setRows(resp.rows || []);
      setCount(resp.count || 0);
    } catch (err) {
      console.error("Error cargando vehículos", err);
      setRows([]);
      setCount(0);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [filters, page]);

  useEffect(() => {
    // when perPage changes, reset to first page
    setPage(1);
  }, [filters.perPage]);

  const navigate = useNavigate();

  const perPageText = useMemo(() => {
    if (filters.perPage === "10") return "10";
    if (filters.perPage === "25") return "25";

    return "50";
  }, [filters.perPage]);

  const perPageNum = Number(filters.perPage || 10);
  const start = count === 0 ? 0 : (page - 1) * perPageNum + 1;
  const end = Math.min(page * perPageNum, count);
  const totalPages = Math.max(1, Math.ceil(count / perPageNum || 1));

  const handlePrevPage = () => {
    if (page <= 1) return;
    setPage((p) => p - 1);
  };

  const handleNextPage = () => {
    if (page >= totalPages) return;
    setPage((p) => p + 1);
  };

  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  const selectedCount = selectedRows.length;
  const allActive =
    selectedCount > 0 && selectedRows.every((r) => r.active === true);
  const allInactive =
    selectedCount > 0 && selectedRows.every((r) => r.active === false);
  const mixed = selectedCount > 0 && !allActive && !allInactive;
  const availableActions: Array<{ value: string; label: string }> = [];

  if (allActive) {
    availableActions.push({ value: "inactivar", label: "Inactivar" });
  } else if (allInactive) {
    availableActions.push({ value: "activar", label: "Activar" });
    availableActions.push({ value: "eliminar", label: "Eliminar" });
  } else if (mixed) {
    availableActions.push({ value: "activar", label: "Activar" });
    availableActions.push({ value: "inactivar", label: "Inactivar" });
    availableActions.push({ value: "eliminar", label: "Eliminar" });
  }

  const viewVehicle = async (id: string) => {
    setDetailsId(id);
    setDetailsLoading(true);
    try {
      const resp = await vehicleService.find(id);

      setDetailsVehicle(resp);
    } catch (err) {
      console.error("Error cargando detalles del vehículo", err);
      setDetailsVehicle(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const editVehicle = (id: string) => {
    // Open the create/edit page and pass the id to edit via location state
    navigate("/vehicle-patrol/vehicles/add-vehicle", { state: { editId: id } });
  };

  const archiveVehicle = (id: string) => {
    setArchiveConfirmId(id);
  };

  const confirmArchive = async () => {
    if (!archiveConfirmId) return;
    setArchiveLoading(true);
    try {
      await vehicleService.update(archiveConfirmId, { active: false });
      toast.success(t("ui.VehiclesPage.vehiculoInactivado"));
      setArchiveConfirmId(null);
      await load();
    } catch (err) {
      console.error("Error archivando vehículo", err);
      toast.error(t("ui.VehiclesPage.errorInactivandoVehiculo"));
    } finally {
      setArchiveLoading(false);
    }
  };

  const activos = rows.filter((r) => r.active).length;
  const inactivos = rows.filter((r) => !r.active).length;
  const sinResultados = !loading && rows.length === 0;

  /** El menú «…» del kit — el mismo que usan las tablas del resto del CRM. */
  const menuVehiculo = (id: string) => (
    <RowActionsMenu
      actions={[
        {
          label: "Ver detalles",
          icon: <Eye />,
          onClick: () => viewVehicle(id),
        },
        { label: "Editar", icon: <Edit />, onClick: () => editVehicle(id) },
        {
          label: "Inactivar",
          icon: <Archive />,
          onClick: () => archiveVehicle(id),
        },
      ]}
    />
  );

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: "Panel de control", path: "/dashboard" },
          { label: "Vehículos" },
        ]}
      />

      <PageContainer className="px-4 py-6 sm:px-6" width="wide">
        <PageHeader
          actions={
            <>
              <Button asChild variant="brand">
                <Link to="/vehicle-patrol/vehicles/add-vehicle">
                  <Plus className="mr-1 h-4 w-4" />{" "}
                  {t("ui.Vehicles.nuevoVehiculo", "Nuevo vehículo")}
                </Link>
              </Button>
              <Sheet open={openFilter} onOpenChange={setOpenFilter}>
                <SheetTrigger asChild>
                  <Button variant="outline">
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
                          <SelectItem value="flota-a">Flota A</SelectItem>
                          <SelectItem value="flota-b">Flota B</SelectItem>
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
                            status: v as VehicleFilters["status"],
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

                    <Button
                      className="w-full"
                      variant="brand"
                      onClick={aplicarFiltros}
                    >
                      Filtro
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </>
          }
          badges={
            <>
              <StatusBadge tone="brand">{count} en la flota</StatusBadge>
              {selectedCount > 0 && (
                <StatusBadge tone="info">
                  {selectedCount} seleccionado{selectedCount === 1 ? "" : "s"}
                </StatusBadge>
              )}
            </>
          }
          icon={<Car />}
          subtitle={t("ui.VehiclesPage.flotaDeLaEmpresaY")}
          title={t("ui.Vehicles.vehiculos2", "Vehículos")}
        />

        <Stagger className="grid gap-4 sm:grid-cols-3">
          <StatCard
            accent="primary"
            icon={<Car />}
            label={t("comun.total")}
            value={count}
          />
          <StatCard
            accent="ok"
            hint={t("ui.Vehicles.enEstaPagina", "En esta página")}
            icon={<CheckCircle2 />}
            label="Activos"
            value={activos}
          />
          <StatCard
            accent="neutral"
            hint={t("ui.Vehicles.enEstaPagina2", "En esta página")}
            icon={<PauseCircle />}
            label="Inactivos"
            value={inactivos}
          />
        </Stagger>

        <Toolbar>
          {/* `TableSearch` del kit — el mismo buscador que Inventario
                        y que las tablas del CRM, con su botón de limpiar. */}
          <div className="min-w-48 flex-1">
            <TableSearch
              placeholder={t("ui.Vehicles.buscarVehiculo2", "Buscar vehículo")}
              value={filters.search ?? ""}
              onChange={(v) => setFilters((s) => ({ ...s, search: v }))}
            />
          </div>
          <Select
            disabled={selectedIds.length === 0}
            value={selectedAction ?? undefined}
            onValueChange={(v) => handleBulkActionSelect(v)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Acciones" />
            </SelectTrigger>
            <SelectContent>
              {availableActions.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <Segmented
              options={[
                { value: "tarjetas", label: "Tarjetas" },
                { value: "lista", label: "Lista" },
              ]}
              value={vista}
              onChange={setVista}
            />
          </div>
        </Toolbar>

        <Section
          action={
            vista === "tarjetas" && rows.length > 0 ? (
              <label
                className="flex cursor-pointer items-center gap-2 text-xs font-medium"
                style={{ color: "var(--ink-soft)" }}
              >
                <Checkbox
                  aria-label={t("comun.seleccionarTodos")}
                  checked={
                    rows.length > 0 && selectedIds.length === rows.length
                  }
                  onCheckedChange={(c) => handleSelectAll(c === true)}
                />{" "}
                {t("comun.seleccionarTodos")}{" "}
              </label>
            ) : undefined
          }
          contentClassName={vista === "lista" ? "-mx-5 -mb-5" : undefined}
          icon={<Car />}
          title={t("ui.Vehicles.listadoDeVehiculos2", "Listado de vehículos")}
        >
          {loading ? (
            <div className={vista === "lista" ? "p-5" : undefined}>
              <SkeletonCards className="lg:grid-cols-3" count={6} />
            </div>
          ) : sinResultados ? (
            <div className={vista === "lista" ? "p-5" : undefined}>
              <EmptyState
                action={
                  <Button asChild size="sm" variant="brand">
                    <Link to="/vehicle-patrol/vehicles/add-vehicle">
                      <Plus className="mr-1 h-3.5 w-3.5" />{" "}
                      {t("ui.Vehicles.nuevoVehiculo", "Nuevo vehículo")}
                    </Link>
                  </Button>
                }
                description={t("ui.VehiclesPage.noHayVehiculosQueCoincidan")}
                icon={<Car />}
                title={t("kit.table.emptyTitle")}
              />
            </div>
          ) : vista === "tarjetas" ? (
            <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => {
                const foto = fotoVehiculo(r);
                const seleccionado = selectedIds.includes(r.id);

                return (
                  <GlassPanel
                    key={r.id}
                    flat
                    brand={seleccionado}
                    className="flex h-full flex-col gap-3 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        aria-label={`Seleccionar ${r.licensePlate || r.name || "vehículo"}`}
                        checked={seleccionado}
                        className="mt-1"
                        onCheckedChange={(c) =>
                          handleSelectOne(r.id, c === true)
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm font-semibold text-foreground">
                          {r.licensePlate ||
                            t("ui.Vehicles.sinPlaca", "Sin placa")}
                        </div>
                        <div className="cg-eyebrow mt-1 truncate">
                          {[r.make, r.model, r.year]
                            .filter(Boolean)
                            .join(" · ") || "Sin datos"}
                        </div>
                      </div>
                      {menuVehiculo(r.id)}
                    </div>

                    <button
                      aria-label={`Ver detalles de ${r.licensePlate || "vehículo"}`}
                      className="cg-focus block h-32 w-full overflow-hidden rounded-xl border"
                      style={{
                        borderColor: "var(--hairline)",
                        background: "var(--glass-sunken)",
                      }}
                      type="button"
                      onClick={() => viewVehicle(r.id)}
                    >
                      <SmartImage
                        alt=""
                        className="h-full w-full"
                        fallback={
                          <span
                            className="grid h-full w-full place-items-center"
                            style={{ color: "var(--ink-faint)" }}
                          >
                            <ImageOff className="h-6 w-6" />
                          </span>
                        }
                        src={foto}
                      />
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={r.active ? "ok" : "neutral"}>
                        {r.active ? "Activo" : "Inactivo"}
                      </StatusBadge>
                      {r.ownership && (
                        <StatusBadge dot={false} tone="info">
                          {OWNERSHIP_LABELS[r.ownership]
                            ? t(
                                OWNERSHIP_LABELS[r.ownership].labelKey,
                                OWNERSHIP_LABELS[r.ownership].label,
                              )
                            : r.ownership}
                        </StatusBadge>
                      )}
                    </div>

                    <div className="glass-sunken mt-auto grid grid-cols-2 gap-3 p-3">
                      <Field label="Color" value={r.color || "—"} />
                      <Field
                        label="Kilometraje"
                        value={
                          r.initialMileage != null
                            ? Number(r.initialMileage).toLocaleString()
                            : "—"
                        }
                      />
                    </div>
                  </GlassPanel>
                );
              })}
            </Stagger>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] divide-y divide-border">
                <thead
                  className="text-left text-sm"
                  style={{
                    color: "var(--ink-soft)",
                    background: "var(--glass-sunken)",
                  }}
                >
                  <tr>
                    <th className="px-4 py-2">
                      <Checkbox
                        aria-label={t("comun.seleccionarTodos")}
                        checked={
                          rows.length > 0 && selectedIds.length === rows.length
                        }
                        onCheckedChange={(c) => handleSelectAll(c === true)}
                      />
                    </th>
                    <th className="px-4 py-2 font-semibold">
                      {t("ui.Vehicles.ano3", "Año")}
                    </th>
                    <th className="px-4 py-2 font-semibold">Marca</th>
                    <th className="px-4 py-2 font-semibold">Modelo</th>
                    <th className="px-4 py-2 font-semibold">Placa</th>
                    <th className="px-4 py-2 font-semibold">
                      {t("comun.estado")}
                    </th>
                    <th className="px-4 py-2 text-right" />
                  </tr>
                </thead>

                <tbody className="divide-y divide-border text-sm">
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="text-sm transition-colors hover:bg-[var(--glass-sunken)]"
                      style={
                        selectedIds.includes(r.id)
                          ? { background: "var(--brand-wash)" }
                          : undefined
                      }
                    >
                      <td className="px-4 py-3">
                        <Checkbox
                          aria-label={`Seleccionar ${r.licensePlate || "vehículo"}`}
                          checked={selectedIds.includes(r.id)}
                          onCheckedChange={(c) =>
                            handleSelectOne(r.id, c === true)
                          }
                        />
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {r.year || "—"}
                      </td>
                      <td className="px-4 py-3">{r.make || "—"}</td>
                      <td className="px-4 py-3">{r.model || "—"}</td>
                      <td className="px-4 py-3 font-mono">
                        {r.licensePlate || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={r.active ? "ok" : "neutral"}>
                          {r.active ? "Activo" : "Inactivo"}
                        </StatusBadge>
                      </td>
                      <td className="px-2 py-3 text-right">
                        {menuVehiculo(r.id)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <AlertDialog
            open={!!archiveConfirmId}
            onOpenChange={(open) => !open && setArchiveConfirmId(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("ui.Vehicles.inactivarVehiculos", "Inactivar vehículos")}
                </AlertDialogTitle>
              </AlertDialogHeader>
              <div className="p-4 text-sm" style={{ color: "var(--ink-soft)" }}>
                ¿Estás seguro de que deseas inactivar 1 vehículo(s)?
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setArchiveConfirmId(null)}>
                  {t("actions.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="cg-btn-bad"
                  disabled={archiveLoading}
                  onClick={confirmArchive}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={!!bulkActionConfirm}
            onOpenChange={(open) => !open && setBulkActionConfirm(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {bulkActionConfirm === "activar" &&
                    t("ui.Vehicles.activarVehiculos", "Activar vehículos")}
                  {bulkActionConfirm === "inactivar" &&
                    t("ui.Vehicles.inactivarVehiculos", "Inactivar vehículos")}
                  {bulkActionConfirm === "eliminar" &&
                    t("ui.Vehicles.eliminarVehiculos", "Eliminar vehículos")}
                </AlertDialogTitle>
              </AlertDialogHeader>
              <div className="p-4 text-sm" style={{ color: "var(--ink-soft)" }}>
                ¿Estás seguro de que deseas {bulkActionConfirm}{" "}
                {selectedIds.length} vehículo(s)?
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setBulkActionConfirm(null)}>
                  {t("actions.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  className="cg-btn-bad"
                  disabled={bulkActionLoading}
                  onClick={async () => {
                    if (!bulkActionConfirm) return;
                    setBulkActionLoading(true);
                    try {
                      if (bulkActionConfirm === "eliminar") {
                        const idsToDelete = selectedIds.filter((id) => {
                          const r = rows.find((x) => x.id === id);

                          return r && r.active === false;
                        });

                        if (idsToDelete.length === 0) {
                          toast.info(
                            t("ui.VehiclesPage.noHayRegistrosInactivosPara"),
                          );
                        } else {
                          await vehicleService.destroy(idsToDelete);
                          toast.success(
                            `${idsToDelete.length} vehículo(s) eliminados`,
                          );
                        }
                      } else {
                        const active = bulkActionConfirm === "activar";

                        await Promise.all(
                          selectedIds.map((id) =>
                            vehicleService.update(id, { active }),
                          ),
                        );
                        toast.success(t("ui.VehiclesPage.accionEjecutada"));
                      }
                      setSelectedIds([]);
                      setSelectedAction(null);
                      setBulkActionConfirm(null);
                      await load();
                    } catch (err) {
                      console.error("Error ejecutando acción masiva", err);
                      toast.error(t("ui.VehiclesPage.errorEjecutandoLaAccion"));
                    } finally {
                      setBulkActionLoading(false);
                    }
                  }}
                >
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Dialog
            open={!!detailsId}
            onOpenChange={(open) => {
              if (!open) {
                setDetailsId(null);
                setDetailsVehicle(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {t(
                    "ui.Vehicles.detallesDelVehiculo",
                    "Detalles del vehículo",
                  )}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    "ui.Vehicles.informacionCompletaDelVehiculo",
                    "Información completa del vehículo.",
                  )}
                </DialogDescription>
              </DialogHeader>

              {detailsLoading ? (
                <div className="p-4">
                  <SkeletonCards count={2} />
                </div>
              ) : detailsVehicle ? (
                <div className="space-y-4 p-4">
                  <div className="flex items-center gap-3">
                    <IconTile size="lg">
                      <Car />
                    </IconTile>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-base font-semibold">
                        {detailsVehicle.licensePlate ||
                          t("ui.Vehicles.sinPlaca", "Sin placa")}
                      </div>
                      <div className="cg-eyebrow mt-1 truncate">
                        {detailsVehicle.name || "—"}
                      </div>
                    </div>
                    <StatusBadge
                      tone={detailsVehicle.active ? "ok" : "neutral"}
                    >
                      {detailsVehicle.active ? "Activo" : "Inactivo"}
                    </StatusBadge>
                  </div>

                  {detailsVehicle.imageUrl &&
                    detailsVehicle.imageUrl.length > 0 && (
                      <div
                        className="overflow-hidden rounded-xl border"
                        style={{
                          borderColor: "var(--hairline)",
                          background: "var(--glass-sunken)",
                        }}
                      >
                        <img
                          alt={t("ui.VehiclesPage.vehiculo")}
                          className="max-h-52 w-full object-cover"
                          src={
                            detailsVehicle.imageUrl[0].downloadUrl ||
                            detailsVehicle.imageUrl[0].publicUrl
                          }
                        />
                      </div>
                    )}

                  <div className="glass-sunken grid grid-cols-2 gap-4 p-4">
                    <Field
                      label={t("ui.Vehicles.ano", "Año")}
                      value={detailsVehicle.year || "—"}
                    />
                    <Field label="Marca" value={detailsVehicle.make || "—"} />
                    <Field label="Modelo" value={detailsVehicle.model || "—"} />
                    <Field
                      label={
                        <span className="inline-flex items-center gap-1">
                          <Palette className="h-3 w-3" /> Color
                        </span>
                      }
                      value={detailsVehicle.color || "—"}
                    />
                    <Field
                      label={
                        <span className="inline-flex items-center gap-1">
                          <KeyRound className="h-3 w-3" /> VIN
                        </span>
                      }
                      value={
                        detailsVehicle.vin ? (
                          <span className="font-mono text-xs">
                            {detailsVehicle.vin}
                          </span>
                        ) : (
                          "—"
                        )
                      }
                    />
                    <Field
                      label={
                        <span className="inline-flex items-center gap-1">
                          <Gauge className="h-3 w-3" /> Kilometraje inicial
                        </span>
                      }
                      value={
                        detailsVehicle.initialMileage != null
                          ? Number(
                              detailsVehicle.initialMileage,
                            ).toLocaleString()
                          : "—"
                      }
                    />
                    <Field
                      label="Propiedad"
                      value={
                        detailsVehicle.ownership
                          ? OWNERSHIP_LABELS[detailsVehicle.ownership]
                            ? t(
                                OWNERSHIP_LABELS[detailsVehicle.ownership]
                                  .labelKey,
                                OWNERSHIP_LABELS[detailsVehicle.ownership]
                                  .label,
                              )
                            : detailsVehicle.ownership
                          : "—"
                      }
                    />
                  </div>

                  {detailsVehicle.description && (
                    <div>
                      <div className="cg-eyebrow mb-1">
                        {t("ui.Vehicles.descripcion2", "Descripción")}
                      </div>
                      <p
                        className="text-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {detailsVehicle.description}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4">
                  <EmptyState
                    description={t(
                      "ui.VehiclesPage.noSeEncontroInformacionDel",
                    )}
                    icon={<Car />}
                    title={t("ui.Vehicles.sinInformacion", "Sin información")}
                  />
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setDetailsId(null);
                    setDetailsVehicle(null);
                  }}
                >
                  {t("actions.close")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div
            className={`flex flex-wrap items-center justify-between gap-3 text-sm ${vista === "lista" ? "border-t px-4 py-3" : "mt-4 pt-1"}`}
            style={{
              color: "var(--ink-soft)",
              // Mismo pie que Inventario: filo y fondo de los
              // tokens, no el borde por defecto de Tailwind.
              ...(vista === "lista"
                ? {
                    borderColor: "var(--hairline)",
                    background: "var(--glass-sunken)",
                  }
                : null),
            }}
          >
            <div className="flex items-center gap-2">
              <span>
                {t("ui.Vehicles.elementosPorPagina2", "Elementos por página")}
              </span>
              <Select
                value={filters.perPage}
                onValueChange={(v) =>
                  setFilters((s: any) => ({ ...s, perPage: v }))
                }
              >
                <SelectTrigger className="h-8 w-20">
                  <SelectValue placeholder={perPageText} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="tabular-nums">
              {start} - {end} de {count}
            </div>

            <div className="flex items-center gap-2">
              <Button
                disabled={page <= 1}
                size="sm"
                variant="outline"
                onClick={handlePrevPage}
              >
                {t("kit.pagination.prev")}
              </Button>
              <Button
                disabled={page >= totalPages}
                size="sm"
                variant="outline"
                onClick={handleNextPage}
              >
                {t("kit.pagination.next")}
              </Button>
            </div>
          </div>
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
