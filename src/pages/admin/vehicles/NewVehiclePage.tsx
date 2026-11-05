import { Camera, Car, FileText, Gauge, Info, ShieldCheck, Trash2, UserRound } from "lucide-react";

import { PROPIEDADES, TIPOS, propiedadNormal } from "./flota";

import userService from "@/lib/api/userService";
import {
  supervisorPositionService,
  type SupervisorPosition,
} from "@/lib/api/supervisorPositionService";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
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

  /* Dueño de un vehículo personal (los supervisores) y puesto que lo usa. */
  const [supervisores, setSupervisores] = useState<Array<{ id: string; name: string }>>([]);
  const [puestos, setPuestos] = useState<SupervisorPosition[]>([]);

  useEffect(() => {
    let vivo = true;

    userService
      .listUsersByRoles(["securitySupervisor"])
      .then((rows: any[]) => {
        if (!vivo) return;
        setSupervisores(
          (rows || [])
            .map((u: any) => ({
              id: String(u.id),
              name:
                u.fullName ||
                [u.firstName, u.lastName].filter(Boolean).join(" ") ||
                u.email ||
                String(u.id),
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {});
    supervisorPositionService
      .list()
      .then((r: any) => vivo && setPuestos((r?.rows || []).filter((p: any) => p.isActive !== false)))
      .catch(() => {});

    return () => {
      vivo = false;
    };
  }, []);

  const form = useForm<VehicleCreateSchema>({
    resolver: zodResolver(vehicleCreateSchema) as any,
    defaultValues: {
      year: "",
      make: "",
      model: "",
      color: "",
      plate: "",
      initialMileage: "",
      ownership: "company",
      vehicleType: "car",
      ownerUserId: "",
      status: "available",
      odometerUnit: "km",
      assignedPositionId: "",
      registrationExpiresAt: "",
      insuranceExpiresAt: "",
      inspectionExpiresAt: "",
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
                resp.currentOdometer != null
                  ? String(Number(resp.currentOdometer))
                  : resp.initialMileage != null
                    ? String(resp.initialMileage)
                    : "",
              ownership: propiedadNormal(resp.ownership) as any,
              vehicleType: (resp.vehicleType || "car") as any,
              ownerUserId: resp.ownerUserId ? String(resp.ownerUserId) : "",
              status: (["available", "maintenance", "out_of_service"].includes(resp.status)
                ? resp.status
                : "available") as any,
              odometerUnit: resp.odometerUnit === "mi" ? "mi" : "km",
              assignedPositionId: resp.assignedPositionId ? String(resp.assignedPositionId) : "",
              registrationExpiresAt: resp.registrationExpiresAt || "",
              insuranceExpiresAt: resp.insuranceExpiresAt || "",
              inspectionExpiresAt: resp.inspectionExpiresAt || "",
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

      // Check duplicate plate only when creating (a bicycle may have none)
      if (!editingId && plate) {
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

      /* Flota (2026-11-04): tipo, propiedad y dueño, unidad, estado, puesto
         y documentos. Se editan siempre; la identificación queda fija. */
      const flota = {
        vehicleType: data.vehicleType,
        ownership: data.ownership,
        ownerUserId: data.ownership === "personal" ? data.ownerUserId || null : null,
        status: data.status,
        odometerUnit: data.odometerUnit,
        assignedPositionId: data.assignedPositionId || null,
        registrationExpiresAt: data.registrationExpiresAt || null,
        insuranceExpiresAt: data.insuranceExpiresAt || null,
        inspectionExpiresAt: data.inspectionExpiresAt || null,
      };

      if (editingId) {
        // When editing: image, notes and every fleet field; identity stays.
        const updatePayload: any = {
          ...flota,
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
          ...flota,
          name: `${data.make} ${data.model}`,
          licensePlate: plate || null,
          year: data.year ? Number(data.year) : null,
          make: data.make,
          model: data.model,
          color: data.color || null,
          initialMileage: data.initialMileage ? Number(data.initialMileage) : 0,
          vin: data.vin || null,
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

      <section>
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
                    {t(
                      "ui.NewVehiclePage.alEditarIdentidadFija",
                      "Los datos de identificación (marca, modelo, año, placa y VIN) quedan fijos desde el alta. El tipo, la propiedad, el estado, los documentos, la foto y las notas se pueden cambiar. El odómetro se actualiza con cada devolución.",
                    )}
                  </p>
                </GlassPanel>
              )}

              {/* ── Tipo y propiedad (flota) ───────────────────────────────── */}
              <Section
                contentClassName="space-y-5"
                icon={<UserRound />}
                title={t("ui.flota.tipoYPropiedad", "Tipo y propiedad")}
              >
                <FormField
                  control={form.control}
                  name="vehicleType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("ui.flota.tipo.titulo", "Tipo")}</FormLabel>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group">
                        {TIPOS.map((tp) => {
                          const activo = field.value === tp.id;
                          const Icono = tp.icon;

                          return (
                            <button
                              key={tp.id}
                              aria-pressed={activo}
                              className="flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition-colors"
                              style={
                                activo
                                  ? { background: "var(--brand-wash)", borderColor: "var(--brand-line)", color: "var(--brand-text)" }
                                  : { borderColor: "var(--hairline)" }
                              }
                              type="button"
                              onClick={() => field.onChange(tp.id)}
                            >
                              <Icono className="size-6" />
                              {t(tp.key, tp.label)}
                            </button>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="ownership"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {t("ui.flota.propiedad.titulo", "Propiedad")} <Obligatorio />
                        </FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder={t("kit.select.placeholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {PROPIEDADES.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {t(p.key, p.label)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("ownership") === "personal" ? (
                    <FormField
                      control={form.control}
                      name="ownerUserId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("ui.flota.dueno", "Supervisor dueño")} <Obligatorio />
                          </FormLabel>
                          <Select value={field.value || ""} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder={t("ui.flota.elegirSupervisor", "Elegir supervisor")} />
                            </SelectTrigger>
                            <SelectContent>
                              {supervisores.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                            {t(
                              "ui.flota.personalHint",
                              "Sólo su dueño puede usarlo. Se registran únicamente los kilómetros de trabajo, no lo que haga fuera de su turno.",
                            )}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <FormField
                      control={form.control}
                      name="assignedPositionId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("ui.flota.puestoAsignado", "Puesto de supervisión que lo usa")}</FormLabel>
                          <Select
                            value={field.value || "__ninguno__"}
                            onValueChange={(v) => field.onChange(v === "__ninguno__" ? "" : v)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__ninguno__">{t("ui.flota.ninguno", "Ninguno")}</SelectItem>
                              {puestos.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                            {t(
                              "ui.flota.puestoHint",
                              "Quien esté de turno en ese puesto lo verá primero al empezar una ruta.",
                            )}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </Section>

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
                        {t("ui.NewVehicle.ano", "Año")}
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
                        {t("ui.NewVehiclePage.marca", "Marca")} <Obligatorio />
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
                        {t("ui.NewVehiclePage.modelo", "Modelo")} <Obligatorio />
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
                        {t("ui.NewVehiclePage.color", "Color")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("ui.NewVehiclePage.blanco", "Blanco")}
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
                        {t("station.parking.col.plate", "Placa")}{" "}
                        {form.watch("vehicleType") !== "bicycle" && <Obligatorio />}
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
                        <span className="text-xs font-normal" style={{ color: "var(--ink-faint)" }}>({t("ui.flota.opcional", "opcional")})</span>
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
                title={t("ui.NewVehiclePage.datosOperativos", "Datos operativos")}
              >
                {form.watch("vehicleType") !== "bicycle" && (
                  <>
                    <FormField
                      control={form.control}
                      name="initialMileage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {isEditing
                              ? t("ui.flota.lecturaActual", "Lectura actual del odómetro")
                              : t("ui.flota.lecturaInicial", "Lectura del odómetro hoy")}{" "}
                            {!isEditing && <Obligatorio />}
                          </FormLabel>
                          <FormControl>
                            <Input
                              inputMode="decimal"
                              placeholder="0"
                              {...field}
                              disabled={isEditing}
                            />
                          </FormControl>
                          {isEditing && (
                            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                              {t("ui.flota.lecturaHint", "Se actualiza sola con cada devolución.")}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="odometerUnit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("ui.flota.unidad", "Unidad del odómetro")}</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="km">{t("ui.flota.km", "Kilómetros (km)")}</SelectItem>
                              <SelectItem value="mi">{t("ui.flota.mi", "Millas (mi)")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("comun.estado")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="available">{t("ui.flota.estado.available", "Disponible")}</SelectItem>
                          <SelectItem value="maintenance">{t("ui.flota.estado.maintenance", "En taller")}</SelectItem>
                          <SelectItem value="out_of_service">
                            {t("ui.flota.estado.out_of_service", "Fuera de servicio")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                        {t("ui.flota.estadoHint", "«En uso» lo pone el sistema al sacarlo y lo quita al devolverlo.")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </Section>

              {/* ── Documentos (flota) ─────────────────────────────────────── */}
              <Section
                contentClassName="grid grid-cols-1 gap-4 md:grid-cols-3"
                icon={<ShieldCheck />}
                title={t("ui.flota.documentos", "Documentos y vencimientos")}
              >
                {(
                  [
                    ["registrationExpiresAt", t("ui.flota.matricula", "Matrícula vence")],
                    ["insuranceExpiresAt", t("ui.flota.seguro", "Seguro vence")],
                    ["inspectionExpiresAt", t("ui.flota.revision", "Revisión técnica vence")],
                  ] as const
                ).map(([nombre, etiqueta]) => (
                  <FormField
                    key={nombre}
                    control={form.control}
                    name={nombre}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{etiqueta}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
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
                    ? t("clients.saving", "Guardando...")
                    : isEditing
                      ? t("comms.save", "Guardar cambios")
                      : t("ui.NewVehiclePage.crearVehiculo", "Crear vehículo")}
                </Button>
              </div>
            </form>
          </Form>
        </PageContainer>
      </section>
    </AppLayout>
  );
}
