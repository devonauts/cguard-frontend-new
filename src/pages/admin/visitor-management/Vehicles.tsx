import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { MoreVertical, Upload, FileDown, FileSpreadsheet, Printer, Mail, Car, Plus } from "lucide-react";
import { useAsyncList } from "@/hooks/useAsyncList";
import AppLayout from "@/layouts/app-layout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  Toolbar,
  StatusBadge,
  SkeletonCards,
  SearchInput,
} from "@/components/kit";

import { toast } from "sonner";

import { confirmDialog } from "@/components/ui/confirmDialog";
import vehicleService from "@/lib/api/vehicleService";

type VehicleRow = {
  id: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  licensePlate?: string | null;
  ownership?: string | null;
  vin?: string | null;
  description?: string | null;
};

const emptyForm = {
  year: "",
  make: "",
  model: "",
  color: "",
  licensePlate: "",
  ownership: "empresa",
  vin: "",
  description: "",
};

export default function Vehicles() {
  const { t } = useTranslation();
  const [perPage, setPerPage] = useState("25");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const perPageNum = Number(perPage) || 25;

  // Shared async-list hook: latest-response-wins (changing perPage fires the
  // old-page load AND a setPage(1) load — only the newest may apply) + unmount
  // safe. refetch() after add/delete.
  const { data, loading, refetch } = useAsyncList(
    () =>
      vehicleService.list({
        limit: perPageNum,
        offset: (page - 1) * perPageNum,
      }),
    [page, perPageNum],
    {
      onError: (err) => {
        console.error("Error cargando vehículos", err);
        toast.error(
          t("ui.Vehicles.errorCargandoVehiculos", "Error cargando vehículos"),
        );
      },
    },
  );
  const rows: VehicleRow[] = (data?.rows as VehicleRow[]) || [];
  const count = data?.count || 0;

  useEffect(() => {
    setPage(1);
  }, [perPage]);

  const perPageText = useMemo(() => {
    if (perPage === "10") return "10";
    if (perPage === "25") return "25";

    return "50";
  }, [perPage]);

  // Client-side search over the loaded page (backend list has no text filter)
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((r) =>
      [r.color, r.model, r.make, r.licensePlate, r.vin, String(r.year ?? "")]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, search]);

  const setField = (key: keyof typeof emptyForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: false }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, boolean> = {};

    if (!form.make.trim()) nextErrors.make = true;
    if (!form.color.trim()) nextErrors.color = true;
    if (!form.licensePlate.trim()) nextErrors.licensePlate = true;
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);

      return;
    }

    setSaving(true);
    try {
      await vehicleService.create({
        name: `${form.make} ${form.model}`.trim(),
        licensePlate: form.licensePlate.trim(),
        year: form.year ? Number(form.year) : null,
        make: form.make.trim(),
        model: form.model.trim() || null,
        color: form.color.trim(),
        ownership: form.ownership,
        vin: form.vin.trim() || null,
        description: form.description.trim() || null,
      });
      toast.success(t("comun.vehiculoCreado"));
      setForm({ ...emptyForm });
      setErrors({});
      setIsAddOpen(false);
      setPage(1);
      refetch();
    } catch (err) {
      console.error("Error creando vehículo", err);
      toast.error(
        String(
          (err as { message?: string })?.message || "Error creando vehículo",
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? visibleRows.map((r) => r.id) : []);
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id),
    );
  };

  const handleBulkAction = async (action: string) => {
    if (action !== "eliminar") return;
    if (selectedIds.length === 0) {
      toast.error(t("ui.Vehicles.seleccionaAlMenosUnVehiculo"));

      return;
    }
    if (
      !(await confirmDialog({
        title: t("ui.Vehicles.eliminarVehiculos", "Eliminar vehículos"),
        message: `¿Eliminar ${selectedIds.length} vehículo(s)? Esta acción no se puede deshacer.`,
        confirmText: "Eliminar",
        tone: "danger",
      }))
    )
      return;

    try {
      await vehicleService.destroy(selectedIds);
      toast.success(t("ui.Vehicles.vehiculoSEliminadoS"));
      setSelectedIds([]);
      refetch();
    } catch (err) {
      console.error("Error eliminando vehículos", err);
      toast.error(t("ui.Vehicles.errorEliminandoVehiculos"));
    }
  };

  const allSelected =
    visibleRows.length > 0 && selectedIds.length === visibleRows.length;
  const start = count === 0 ? 0 : (page - 1) * perPageNum + 1;
  const end = Math.min(page * perPageNum, count);

  return (
    <AppLayout>

      <section>
        <PageContainer width="wide">
          <PageHeader
            icon={<Car />}
            title={t("ui.Vehicles.vehiculos", "Vehículos")}
            subtitle={t("ui.Vehicles.registroDeVehiculosDeVisitantes")}
            badges={
              <>
                <StatusBadge tone="neutral">
                  {count}{" "}
                  {count === 1
                    ? "vehículo registrado"
                    : "vehículos registrados"}
                </StatusBadge>
                {selectedIds.length > 0 && (
                  <StatusBadge tone="brand">
                    {selectedIds.length} seleccionados
                  </StatusBadge>
                )}
              </>
            }
            actions={
              <>
                <Select value="" onValueChange={handleBulkAction}>
                  <SelectTrigger className="w-36">
                    <SelectValue
                      placeholder={t("ui.Vehicles.accion", "Acción")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eliminar">
                      {t("actions.delete")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="brand" onClick={() => setIsAddOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("ui.Vehicles.anadirVehiculo", "Añadir vehículo")}
                </Button>
              </>
            }
          />

          <Toolbar>
            <SearchInput
              className="min-w-0 flex-1 sm:max-w-xs"
              placeholder={t("ui.Vehicles.buscarVehiculo", "Buscar vehículo")}
              value={search}
              onChange={(v) => setSearch(v)}
            />

            <Sheet open={isAddOpen} onOpenChange={setIsAddOpen}>
              <SheetTrigger asChild>
                <Button className="hidden">
                  {t("ui.Vehicles.anadirVehiculo", "Añadir vehículo")}
                </Button>
              </SheetTrigger>

              <SheetContent className="w-full max-w-xl" side="right">
                <SheetHeader className="mb-4">
                  <SheetTitle>
                    {t("ui.Vehicles.nuevoVehiculo", "Nuevo vehículo")}
                  </SheetTitle>
                </SheetHeader>

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>{t("ui.Vehicles.ano", "Año")}</Label>
                      <Input
                        type="number"
                        placeholder="e.g. 2024"
                        value={form.year}
                        onChange={(e) => setField("year", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        Marca<span style={{ color: "var(--bad-text)" }}>*</span>
                      </Label>
                      <Input
                        placeholder="e.g. Toyota"
                        value={form.make}
                        onChange={(e) => setField("make", e.target.value)}
                        aria-invalid={errors.make || undefined}
                        style={
                          errors.make
                            ? { borderColor: "var(--bad)" }
                            : undefined
                        }
                      />
                      {errors.make && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--bad-text)" }}
                        >
                          Marca requerida
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Modelo</Label>
                    <Input
                      placeholder="e.g. Corolla"
                      value={form.model}
                      onChange={(e) => setField("model", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>
                      Color<span style={{ color: "var(--bad-text)" }}>*</span>
                    </Label>
                    <Input
                      aria-invalid={errors.color || undefined}
                      placeholder="e.g. Blanco"
                      style={
                        errors.color ? { borderColor: "var(--bad)" } : undefined
                      }
                      value={form.color}
                      onChange={(e) => setField("color", e.target.value)}
                    />
                    {errors.color && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--bad-text)" }}
                      >
                        Color requerido
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>
                      Placa<span style={{ color: "var(--bad-text)" }}>*</span>
                    </Label>
                    <Input
                      placeholder={t(
                        "ui.Vehicles.numeroDePlaca",
                        "Número de placa",
                      )}
                      value={form.licensePlate}
                      onChange={(e) => setField("licensePlate", e.target.value)}
                      aria-invalid={errors.licensePlate || undefined}
                      style={
                        errors.licensePlate
                          ? { borderColor: "var(--bad)" }
                          : undefined
                      }
                    />
                    {errors.licensePlate && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--bad-text)" }}
                      >
                        Placa requerida
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label>Propiedad</Label>
                    <Select
                      value={form.ownership}
                      onValueChange={(v) => setField("ownership", v)}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t(
                            "ui.Vehicles.seleccionaUnaOpcion",
                            "Selecciona una opción",
                          )}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="empresa">
                          {t("ui.Vehicles.propiedadDeLaEmpresa")}
                        </SelectItem>
                        <SelectItem value="vigilante">
                          {t("ui.Vehicles.propiedadDelVigilante")}
                        </SelectItem>
                        <SelectItem value="alquilado">Alquilado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t("ui.Vehicles.numeroVin", "Número VIN")}</Label>
                    <Input
                      placeholder={t(
                        "ui.Vehicles.identificadorDelVehiculo",
                        "Identificador del vehículo",
                      )}
                      value={form.vin}
                      onChange={(e) => setField("vin", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>{t("ui.Vehicles.descripcion", "Descripción")}</Label>
                    <Textarea
                      rows={3}
                      placeholder={t(
                        "ui.Vehicles.notasAdicionalesSobreElVehiculo",
                        "Notas adicionales sobre el vehículo",
                      )}
                      value={form.description}
                      onChange={(e) => setField("description", e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      disabled={saving}
                                            type="button"
                                            variant="outline"
                                            onClick={() => setIsAddOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" variant="brand" disabled={saving}>
                      {saving ? "Guardando…" : "Enviar"}
                    </Button>
                  </div>
                </form>
              </SheetContent>
            </Sheet>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem disabled className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  <span>
                    {t("ui.Vehicles.importarVehiculos", "Importar vehículos")}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="flex items-center gap-2">
                  <FileDown className="h-4 w-4" />
                  <span>Exportar como PDF</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Exportar como Excel</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  <span>Imprimir</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span>
                    {t("ui.Vehicles.correoElectronico", "Correo Electrónico")}
                  </span>
                </DropdownMenuItem>
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t("ui.Reports.proximamente", "Próximamente")}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </Toolbar>

          <Section
            title={t("ui.Vehicles.listadoDeVehiculos", "Listado de vehículos")}
            icon={<Car />}
          >
            <div className="overflow-hidden rounded-xl border">
              {loading ? (
                <div className="p-4">
                  <SkeletonCards count={4} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="cg-eyebrow px-2 py-2">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={(c) => toggleSelectAll(Boolean(c))}
                          />
                        </th>
                        <th className="cg-eyebrow px-2 py-2">Color</th>
                        <th className="cg-eyebrow px-2 py-2">Modelo</th>
                        <th className="cg-eyebrow px-2 py-2">Marca</th>
                        <th className="cg-eyebrow px-2 py-2">
                          {t("ui.Vehicles.ano2", "Año")}
                        </th>
                        <th className="cg-eyebrow px-2 py-2">Licencia</th>
                      </tr>
                    </thead>

                    <tbody>
                      {visibleRows.length === 0 && (
                        <tr>
                          <td className="py-8" colSpan={6}>
                            <EmptyState
                              icon={<Car />}
                              title={t("kit.table.emptyTitle")}
                              description={t(
                                "comun.noPudimosEncontrarNingunElemento",
                              )}
                              className="border-0"
                            />
                          </td>
                        </tr>
                      )}
                      {visibleRows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-b last:border-0 hover:bg-muted/40"
                        >
                          <td className="px-2 py-2.5">
                            <Checkbox
                              checked={selectedIds.includes(r.id)}
                              onCheckedChange={(c) =>
                                toggleSelect(r.id, Boolean(c))
                              }
                            />
                          </td>
                          <td className="px-2 py-2.5">{r.color || "—"}</td>
                          <td className="px-2 py-2.5">{r.model || "—"}</td>
                          <td className="px-2 py-2.5">{r.make || "—"}</td>
                          <td className="px-2 py-2.5 tabular-nums">
                            {r.year ?? "—"}
                          </td>
                          <td className="px-2 py-2.5">
                            {r.licensePlate ? (
                              <span className="glass-sunken inline-block px-2 py-0.5 font-mono text-xs tracking-wide">
                                {r.licensePlate}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>
                    {t(
                      "ui.Vehicles.elementosPorPagina",
                      "Elementos por página",
                    )}
                  </span>
                  <Select value={perPage} onValueChange={setPerPage}>
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
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    {count === 0 ? "0 de 0" : `${start}–${end} de ${count}`}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      disabled={page <= 1 || loading}
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      disabled={page * perPageNum >= count || loading}
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPage((p) => p + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </PageContainer>
      </section>
    </AppLayout>
  );
}
