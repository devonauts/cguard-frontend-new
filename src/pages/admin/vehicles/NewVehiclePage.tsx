import { Camera, Car, FileText, Gauge, Info, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import {
  PageContainer,
  PageHeader,
  Section,
  GlassPanel,
} from "@/components/kit";
import {
  vehicleCreateSchema,
  type VehicleCreateSchema,
} from "@/lib/validators/vehicle-create.schema";
import { Button } from "@/components/ui/button";
import vehicleService from "@/lib/api/vehicleService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Asterisco de campo obligatorio — severidad, nunca el acento. */
const Obligatorio = () => <span style={{ color: "var(--bad-text)" }}>*</span>;

export default function NewVehiclePage() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  previewRef.current = preview;
  // Revoke any outstanding blob preview URL on unmount to avoid leaking it.
  useEffect(
    () => () => {
      if (previewRef.current?.startsWith("blob:"))
        URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const location = useLocation();
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const isEditing = !!editingId;

  const form = useForm<VehicleCreateSchema>({
    resolver: zodResolver(vehicleCreateSchema) as any,
    defaultValues: {
      year: "",
      make: "",
      model: "",
      color: "",
      plate: "",
      initialMileage: "",
      ownership: "propio",
      vin: "",
      description: "",
      image: undefined,
    },
    mode: "onBlur",
  });

  useEffect(() => {
    // allow passing edit id via location.state or query param ?id=
    const stateId = (location.state as any)?.editId;
    const params = new URLSearchParams(location.search);
    const qId = params.get("id");
    const id = stateId || qId;

    if (id) {
      setEditingId(id);
      (async () => {
        try {
          const resp = await vehicleService.find(id);

          if (resp) {
            form.reset({
              year: resp.year ? String(resp.year) : "",
              make: resp.make || "",
              model: resp.model || "",
              color: resp.color || "",
              plate: resp.licensePlate || "",
              initialMileage:
                resp.initialMileage != null ? String(resp.initialMileage) : "",
              ownership: resp.ownership || "propio",
              vin: resp.vin || "",
              description: resp.description || "",
              image: undefined,
            });
            if (resp.imageUrl && resp.imageUrl.length > 0) {
              setPreview(
                resp.imageUrl[0].downloadUrl ||
                  resp.imageUrl[0].publicUrl ||
                  null,
              );
            }
          }
        } catch (err) {
          console.error("Error cargando vehículo para edición", err);
        }
      })();
    }
  }, [location]);

  const onSubmit = async (data: VehicleCreateSchema) => {
    try {
      // Normalize plate
      const plate = (data.plate || "").trim();

      // Check duplicate plate only when creating
      if (!editingId) {
        try {
          const matches = await vehicleService.autocomplete(plate, 1);

          if (matches && matches.length > 0) {
            form.setError("plate", {
              type: "manual",
              message: t(
                "ui.NewVehiclePage.yaExisteUnVehiculoConEsaPlaca",
                "Ya existe un vehículo con esa Placa",
              ),
            });

            return;
          }
        } catch (e) {
          // If autocomplete fails, allow submit to continue but log
          console.warn("No se pudo validar existencia de Placa", e);
        }
      }

      // Handle image upload first (if provided)
      let imageFileObj = null;

      if (data.image) {
        try {
          imageFileObj = await securityGuardService.uploadFileToStorage(
            data.image as File,
            "vehicleImage",
          );
        } catch (err) {
          console.error("Error uploading vehicle image", err);
          toast.error(t("ui.NewVehiclePage.errorSubiendoImagenDelVehiculo"));
          // continue without image
          imageFileObj = null;
        }
      }

      if (editingId) {
        // When editing, only allow changing image, ownership and description
        const updatePayload: any = {
          ownership: data.ownership,
          description: data.description,
        };

        if (imageFileObj) {
          updatePayload.imageUrl = imageFileObj;
        }
        const resp = await vehicleService.update(editingId, updatePayload);

        toast.success(t("ui.NewVehiclePage.vehiculoActualizado"));
        console.log("Vehículo actualizado", resp);
        navigate("/vehicle-patrol/vehicles");
      } else {
        const payload: any = {
          name: `${data.make} ${data.model}`,
          licensePlate: plate,
          year: Number(data.year),
          make: data.make,
          model: data.model,
          color: data.color,
          initialMileage: data.initialMileage ? Number(data.initialMileage) : 0,
          ownership: data.ownership,
          vin: data.vin,
          description: data.description,
        };

        if (imageFileObj) {
          payload.imageUrl = imageFileObj;
        }
        const resp = await vehicleService.create(payload);

        toast.success(t("comun.vehiculoCreado"));
        console.log("Vehículo creado", resp);
        navigate("/vehicle-patrol/vehicles");
      }
    } catch (err) {
      console.error("Error creando vehículo", err);
      toast.error(
        String(
          (err as any)?.message ||
            t(
              "ui.NewVehiclePage.errorCreandoVehiculo",
              "Error creando vehículo",
            ),
        ),
      );
    }
  };

  const quitarFoto = () => {
    setPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);

      return null;
    });
    form.setValue("image", undefined);
  };

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: "Panel de control", path: "/dashboard" },
          { label: t("ui.Vehicles.nuevoVehiculo", "Nuevo vehículo") },
        ]}
      />

      <section className="p-6">
        <PageContainer width="narrow">
          <PageHeader
            icon={<Car />}
            subtitle={t("ui.NewVehiclePage.registraLosDatosDelVehiculo")}
            title={
              isEditing
                ? t("ui.NewVehiclePage.editarVehiculo", "Editar vehículo")
                : t("ui.Vehicles.nuevoVehiculo", "Nuevo vehículo")
            }
          />
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
              {isEditing && (
                <GlassPanel flat className="flex items-start gap-3 p-4">
                  <span
                    className="mt-0.5 shrink-0 [&_svg]:size-4"
                    style={{ color: "var(--info-text)" }}
                  >
                    <Info />
                  </span>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    Al editar un vehículo sólo se pueden cambiar la fotografía,
                    la propiedad y las notas. Los datos de identificación quedan
                    fijos desde el alta.
                  </p>
                </GlassPanel>
              )}

              {/* ── Fotografía ─────────────────────────────────────────────── */}
              <Section
                contentClassName="flex flex-col items-center gap-3"
                icon={<Camera />}
                title={t("ui.NewVehicle.fotografia", "Fotografía")}
              >
                <label
                  className="group relative inline-flex h-32 w-32 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border transition-colors"
                  htmlFor="vehicle-image"
                  style={{
                    borderColor: "var(--hairline)",
                    background: "var(--glass-sunken)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--brand)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--hairline)";
                  }}
                >
                  {preview ? (
                    <img
                      alt={t("ui.NewVehicle.vehiculo", "vehículo")}
                      className="h-full w-full object-cover"
                      src={preview}
                    />
                  ) : (
                    // El icono `Car` de lucide —ya importado en este mismo
                    // archivo— en vez de un `<path>` de 30 comandos dibujado a
                    // mano. Es el mismo coche que usa la lista de vehículos, con
                    // el grosor de trazo del resto de la iconografía.
                    <div
                      className="flex h-full w-full flex-col items-center justify-center"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      <Car className="h-10 w-10" strokeWidth={1.5} />
                    </div>
                  )}
                  <span
                    className="absolute bottom-1 right-1 flex items-center justify-center rounded-full p-1.5"
                    style={{
                      background: "var(--brand)",
                      color: "var(--brand-ink)",
                    }}
                  >
                    <Camera className="h-4 w-4" />
                  </span>
                </label>
                <input
                  accept="image/*"
                  className="hidden"
                  id="vehicle-image"
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];

                    setPreview((prev) => {
                      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                      if (f) {
                        form.setValue("image", f);

                        return URL.createObjectURL(f);
                      }
                      form.setValue("image", undefined);

                      return null;
                    });
                  }}
                />
                <p
                  className="text-center text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t(
                    "ui.NewVehiclePage.tocaLaImagenParaElegir",
                    "Toca la imagen para elegir una fotografía del vehículo.",
                  )}
                </p>
                {preview && (
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={quitarFoto}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />{" "}
                    {t(
                      "ui.NewVehiclePage.quitarFotografia",
                      "Quitar fotografía",
                    )}
                  </Button>
                )}
              </Section>

              {/* ── Identificación ─────────────────────────────────────────── */}
              <Section
                contentClassName="grid grid-cols-1 gap-4 md:grid-cols-2"
                icon={<Car />}
                title={t("ui.NewVehicle.identificacion", "Identificación")}
              >
                <FormField
                  control={form.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("ui.NewVehicle.ano", "Año")} <Obligatorio />
                      </FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          placeholder="2022"
                          {...field}
                          disabled={isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="make"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Marca <Obligatorio />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Toyota"
                          {...field}
                          disabled={isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Modelo <Obligatorio />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Hilux"
                          {...field}
                          disabled={isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Color <Obligatorio />
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Blanco"
                          {...field}
                          disabled={isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="plate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Placa <Obligatorio />
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono"
                          placeholder="ABC-1234"
                          {...field}
                          disabled={isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="vin"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t(
                          "ui.NewVehicle.numeroVinNumeroDeIdentificacion",
                          "Número VIN (Número de Identificación del Vehículo)",
                        )}{" "}
                        <Obligatorio />
                      </FormLabel>
                      <FormControl>
                        <Input
                          className="font-mono"
                          placeholder="1HGCM82633A004352"
                          {...field}
                          disabled={isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Section>

              {/* ── Datos operativos ───────────────────────────────────────── */}
              <Section
                contentClassName="grid grid-cols-1 gap-4 md:grid-cols-2"
                icon={<Gauge />}
                title="Datos operativos"
              >
                <FormField
                  control={form.control}
                  name="initialMileage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Kilometraje inicial <Obligatorio />
                      </FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          placeholder="0"
                          {...field}
                          disabled={isEditing}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ownership"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Propiedad <Obligatorio />
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("kit.select.placeholder")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="propio">
                            {t("vehicles.ownership.propio", "Propio")}
                          </SelectItem>
                          <SelectItem value="alquilado">
                            {t("vehicles.ownership.alquilado", "Alquilado")}
                          </SelectItem>
                          <SelectItem value="cliente">
                            {t("ui.NewVehiclePage.delCliente")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Section>

              {/* ── Notas ──────────────────────────────────────────────────── */}
              <Section icon={<FileText />} title={t("comun.notas")}>
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("ui.NewVehicle.descripcion", "Descripción")}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t(
                            "ui.NewVehicle.notasDelVehiculo",
                            "Notas del vehículo",
                          )}
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Section>

              <div className="flex items-center justify-end gap-2">
                <Button asChild variant="outline">
                  <Link to="/vehicle-patrol/vehicles">
                    {t("actions.cancel")}
                  </Link>
                </Button>
                <Button
                  disabled={form.formState.isSubmitting}
                  type="submit"
                  variant="brand"
                >
                  {form.formState.isSubmitting
                    ? "Guardando..."
                    : isEditing
                      ? "Guardar cambios"
                      : "Crear vehículo"}
                </Button>
              </div>
            </form>
          </Form>
        </PageContainer>
      </section>
    </AppLayout>
  );
}
