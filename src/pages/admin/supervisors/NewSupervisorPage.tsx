import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, Phone, FileCheck, Car, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import AppLayout from "@/layouts/app-layout";
import { PageContainer, PageHeader, Section } from "@/components/kit";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
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
import { GuardTabsHeader } from "@/components/app/guard-tabs";
import { FormBlock } from "@/components/app/form-block";
import { AddBlockButton, RemoveBlockButton } from "@/components/app/add-remove";
import { SubmitBar } from "@/components/app/submit-bar";
import AddressAutocomplete from "@/components/maps/AddressAutocomplete";
import i18n from "@/i18n";
import { usePermissions } from "@/hooks/usePermissions";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import {
  supervisorService,
  type CreateSupervisorBody,
} from "@/lib/api/supervisorService";
import {
  createProfileSchema,
  BLOOD_TYPES,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  ACADEMIC_INSTRUCTION_OPTIONS,
} from "@/lib/validators/create-profile.schema";

/*
 * «Nuevo supervisor», con la misma forma que «Nuevo vigilante»: una pestaña para
 * INVITAR (sólo por correo — la invitación del supervisor lleva a la app de
 * supervisor, y el servidor ya la manda con su enlace propio) y otra para CREAR
 * EL PERFIL completo. Las dos acaban en el mismo `POST /supervisors`: el alta
 * crea el usuario con rol de supervisor y le envía la invitación.
 */

// Las opciones viajan al API en español; sólo se traducen al pintarlas.
const OPTION_KEY: Record<string, string> = {
  Masculino: "invite.guard.male",
  Femenino: "invite.guard.female",
  Soltero: "invite.guard.single",
  Casado: "invite.guard.married",
  "Unión libre": "invite.guard.freeUnion",
  Divorciado: "invite.guard.divorced",
  Primaria: "guards.profile.academic.primary",
  Secundaria: "guards.profile.academic.secondary",
  Universidad: "guards.profile.academic.universityDegree",
  Universitaria: "guards.profile.academic.university",
  Especial: "guards.profile.academic.special",
};

const msj = (clave: string, texto: string) => () => i18n.t(clave, texto);
const nameRegex = /^[\p{L} '\-]+$/u;

const inviteSchema = z.object({
  entries: z
    .array(
      z.object({
        firstName: z
          .string()
          .trim()
          .min(1, {
            error: msj("validation.common.nameRequired", "El nombre es requerido"),
          })
          .regex(nameRegex, {
            error: msj(
              "validation.common.nameInvalid",
              "El nombre no debe contener números ni caracteres inválidos",
            ),
          }),
        lastName: z
          .string()
          .trim()
          .min(1, {
            error: msj(
              "validation.common.lastNameRequired",
              "El apellido es requerido",
            ),
          })
          .regex(nameRegex, {
            error: msj(
              "validation.common.lastNameInvalid",
              "El apellido no debe contener números ni caracteres inválidos",
            ),
          }),
        email: z
          .string()
          .trim()
          .email({
            error: msj("validation.common.emailInvalid", "Ingrese un correo válido"),
          }),
      }),
    )
    .min(1),
});

type InviteValues = z.infer<typeof inviteSchema>;

/* El perfil del vigilante sin lo que el supervisor no guarda: el alta del
   supervisor no conserva teléfono ni segundo nombre, y no se asigna a clientes ni
   estaciones (su cobertura vive en el puesto de supervisor). Se añaden zona y
   vehículo, que son suyos. */
const profileSchema = createProfileSchema
  .omit({
    middleName: true,
    phone: true,
    clientId: true,
    stationId: true,
    password: true,
    confirmPassword: true,
  })
  .extend({
    zone: z.string().trim().max(120).optional().or(z.literal("")),
    assignedVehicle: z.string().trim().max(120).optional().or(z.literal("")),
  });

type ProfileValues = z.infer<typeof profileSchema>;

const blankInvite = () => ({ firstName: "", lastName: "", email: "" });

type TabKey = "invite" | "create_profile";

export default function NewSupervisorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { platformName: nombreDeMarca } = useWhiteLabel();
  const [activeTab, setActiveTab] = useState<TabKey>("invite");

  useEffect(() => {
    if (!hasPermission("securityGuardCreate")) {
      toast.error(t("guards.new.errors.no_permission_create"));
      navigate("/supervisors");
    }
  }, [hasPermission, navigate]);

  /* ============== INVITAR POR CORREO (bloques) ============== */
  const inviteForm = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { entries: [blankInvite()] },
    mode: "onTouched",
  });
  const {
    control: inviteCtrl,
    handleSubmit: submitInvite,
    formState: inviteState,
  } = inviteForm;
  const {
    fields: inviteFields,
    append: inviteAppend,
    remove: inviteRemove,
  } = useFieldArray({ control: inviteCtrl, name: "entries" });

  const onSubmitInvite = async (v: InviteValues) => {
    // Uno a uno: si un correo falla, los demás siguen y se dice cuál no salió.
    const fallidos: string[] = [];
    const enlazados: string[] = [];

    for (const e of v.entries) {
      try {
        const sup = await supervisorService.create({
          email: e.email.trim(),
          firstName: e.firstName.trim(),
          lastName: e.lastName.trim(),
        });

        if ((sup as any)?.linkedExistingAccount) enlazados.push(e.email.trim());
      } catch (err: any) {
        console.error("[NewSupervisorPage] invite error <-", err);
        fallidos.push(e.email.trim());
      }
    }

    if (enlazados.length) {
      toast.success(
        t("ui.SupervisorsPage.esteCorreoYaTeniaCuenta", { marca: nombreDeMarca }),
        { description: enlazados.join(", "), duration: 8000 },
      );
    }
    if (fallidos.length) {
      toast.error(
        t("supervisors.new.inviteFailed", {
          emails: fallidos.join(", "),
          defaultValue: "No se pudo invitar a: {{emails}}",
        }),
      );
      // Se queda en pantalla sólo con los que fallaron, para reintentar.
      inviteForm.reset({
        entries: v.entries.filter((e) => fallidos.includes(e.email.trim())),
      });

      return;
    }
    toast.success(t("supervisors.new.invitesSent", "Invitaciones enviadas"));
    navigate("/supervisors");
  };

  /* ============== CREAR PERFIL ============== */
  const createForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      gender: undefined,
      birthDate: "",
      birthPlace: "",
      maritalStatus: undefined,
      academicInstruction: undefined,
      hiringContractDate: "",
      guardCredentials: "",
      email: "",
      homeAddress: "",
      homeAddressLat: undefined,
      homeAddressLng: undefined,
      identificationNumber: "",
      bloodType: undefined,
      zone: "",
      assignedVehicle: "",
    },
    mode: "onTouched",
  });
  const {
    control: createCtrl,
    handleSubmit: submitCreate,
    formState: createState,
    setValue: setCreateValue,
  } = createForm;

  const onSubmitCreate = async (v: ProfileValues) => {
    // Los vacíos no viajan: una fecha "" rompe la columna DATEONLY.
    const opt = (s?: string) => (s && s.trim() ? s.trim() : undefined);
    const body: CreateSupervisorBody = {
      email: v.email.trim(),
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      governmentId: opt(v.identificationNumber),
      gender: v.gender,
      bloodType: v.bloodType,
      birthDate: opt(v.birthDate),
      birthPlace: opt(v.birthPlace),
      maritalStatus: v.maritalStatus,
      academicInstruction: v.academicInstruction,
      address: opt(v.homeAddress),
      latitude: v.homeAddressLat,
      longitude: v.homeAddressLng,
      hiringContractDate: opt(v.hiringContractDate),
      guardCredentials: opt(v.guardCredentials),
      zone: opt(v.zone),
      assignedVehicle: opt(v.assignedVehicle),
    };

    try {
      const sup = await supervisorService.create(body);

      // Cuenta que ya existía (trabaja con otra empresa): se ENLAZÓ, no se creó,
      // y no le llegará el correo de «crea tu cuenta».
      if ((sup as any)?.linkedExistingAccount) {
        toast.success(
          t("ui.SupervisorsPage.esteCorreoYaTeniaCuenta", { marca: nombreDeMarca }),
          { duration: 8000 },
        );
      } else {
        toast.success(t("ui.SupervisorsPage.supervisorCreadoYEnviadaLa"));
      }
      navigate(`/supervisors/${sup.id}`);
    } catch (e: any) {
      console.error("[NewSupervisorPage] create error <-", e);
      toast.error(
        e?.message ||
          t("supervisors.errors.createFailed", "No se pudo crear el supervisor"),
      );
    }
  };

  const required = <span className="text-destructive">*</span>;

  return (
    <AppLayout>
      <PageContainer width="wide">
        <PageHeader
          icon={<UserPlus />}
          subtitle={t(
            "supervisors.new.subtitle",
            "Invítalo por correo para que cree su cuenta en la app de supervisor, o crea su perfil completo.",
          )}
          title={t("ui.SupervisorsPage.nuevoSupervisor", "Nuevo supervisor")}
        />

        <GuardTabsHeader
          inviteLabel={t(
            "supervisors.new.tabInvite",
            "Invitar por correo electrónico",
          )}
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabKey)}
        >
          {/* ------- INVITAR ------- */}
          {activeTab === "invite" && (
            <>
              <p className="mt-8 max-w-5xl text-sm text-muted-foreground">
                {t(
                  "supervisors.new.inviteDescription",
                  "Le llegará un correo con el enlace para crear su cuenta y entrar a la app de supervisor.",
                )}
              </p>
              <Form {...inviteForm}>
                <form
                  className="mt-6 grid gap-8"
                  onSubmit={submitInvite(onSubmitInvite)}
                >
                  {inviteFields.map((f, idx) => (
                    <FormBlock key={f.id}>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                        <FormField
                          control={inviteCtrl}
                          name={`entries.${idx}.firstName`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("guards.new.form.firstName")}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={t(
                                    "guards.new.form.firstNamePlaceholder",
                                  )}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={inviteCtrl}
                          name={`entries.${idx}.lastName`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("guards.new.form.lastName")}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={t(
                                    "guards.new.form.lastNamePlaceholder",
                                  )}
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={inviteCtrl}
                          name={`entries.${idx}.email`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t("guards.new.form.contactEmail")}</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder={t(
                                    "supervisors.new.emailPlaceholder",
                                    "supervisor@ejemplo.com",
                                  )}
                                  type="email"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="mt-4 flex items-center gap-3">
                        <AddBlockButton onClick={() => inviteAppend(blankInvite())} />
                        {inviteFields.length > 1 && (
                          <RemoveBlockButton onConfirm={() => inviteRemove(idx)} />
                        )}
                      </div>
                    </FormBlock>
                  ))}

                  <SubmitBar
                    loading={inviteState.isSubmitting}
                    primaryClassName="cg-btn-brand rounded-full px-6 py-3 font-medium transition-colors disabled:opacity-50"
                    primaryLabel={t("guards.new.form.send")}
                    onPrimary={submitInvite(onSubmitInvite)}
                  />
                </form>
              </Form>
            </>
          )}

          {/* ------- CREAR PERFIL ------- */}
          {activeTab === "create_profile" && (
            <>
              <p className="mt-8 max-w-5xl text-sm text-muted-foreground">
                {t(
                  "supervisors.new.createDescription",
                  "Completa la ficha del supervisor. Al crearla le enviamos la invitación a su correo para que entre a la app.",
                )}
              </p>

              <Form {...createForm}>
                <form
                  className="mt-6 space-y-6"
                  onSubmit={submitCreate(onSubmitCreate)}
                >
                  {/* ── Información personal ─────────────────────────────── */}
                  <Section
                    icon={<User />}
                    title={t(
                      "ui.NewSecurityGuard.informacionPersonal",
                      "Información Personal",
                    )}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <FormField
                        control={createCtrl}
                        name="firstName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("ui.NewSecurityGuardPage.nombreS")} {required}
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t("ui.NewSecurityGuard.ejCarlos", "Ej. Carlos")}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createCtrl}
                        name="lastName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("guards.list.details.fields.lastName", "Apellidos")}{" "}
                              {required}
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t(
                                  "ui.NewSecurityGuard.ejGarciaLopez",
                                  "Ej. García López",
                                )}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <FormField
                        control={createCtrl}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("ui.NewSecurityGuard.genero", "Género")} {required}
                            </FormLabel>
                            <Select
                              value={field.value ?? ""}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t(
                                      "ui.NewSecurityGuard.seleccionarGenero",
                                      "Seleccionar género",
                                    )}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {GENDER_OPTIONS.map((g) => (
                                  <SelectItem key={g} value={g}>
                                    {t(OPTION_KEY[g], g)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createCtrl}
                        name="bloodType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("ui.NewSecurityGuardPage.tipoDeSangre")} {required}
                            </FormLabel>
                            <Select
                              value={field.value ?? ""}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t(
                                      "ui.NewSecurityGuardPage.seleccionarTipoDeSangre",
                                    )}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {BLOOD_TYPES.map((bt) => (
                                  <SelectItem key={bt} value={bt}>
                                    {bt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createCtrl}
                        name="maritalStatus"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("ui.NewSecurityGuardPage.estadoCivil")} {required}
                            </FormLabel>
                            <Select
                              value={field.value ?? ""}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t(
                                      "ui.NewSecurityGuardPage.seleccionarEstadoCivil",
                                    )}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {MARITAL_STATUS_OPTIONS.map((m) => (
                                  <SelectItem key={m} value={m}>
                                    {t(OPTION_KEY[m], m)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <FormField
                        control={createCtrl}
                        name="birthDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("ui.NewSecurityGuardPage.fechaDeNacimiento")}{" "}
                              {required}
                            </FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createCtrl}
                        name="birthPlace"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("guards.new.form.birthPlace", "Lugar de Nacimiento")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t(
                                  "ui.NewSecurityGuard.ejQuitoEcuador",
                                  "Ej. Quito, Ecuador",
                                )}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createCtrl}
                        name="academicInstruction"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "ui.NewSecurityGuard.instruccionAcademica",
                                "Instrucción Académica",
                              )}{" "}
                              {required}
                            </FormLabel>
                            <Select
                              value={field.value ?? ""}
                              onValueChange={field.onChange}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t(
                                      "ui.NewSecurityGuard.seleccionarNivelAcademico",
                                      "Seleccionar nivel académico",
                                    )}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {ACADEMIC_INSTRUCTION_OPTIONS.map((a) => (
                                  <SelectItem key={a} value={a}>
                                    {t(OPTION_KEY[a], a)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </Section>

                  {/* ── Contacto y domicilio ─────────────────────────────── */}
                  <Section
                    icon={<Phone />}
                    title={t("ui.NewSecurityGuardPage.contactoYDomicilio")}
                  >
                    <FormField
                      control={createCtrl}
                      name="email"
                      render={({ field }) => (
                        <FormItem className="max-w-xl">
                          <FormLabel>
                            {t(
                              "ui.NewSecurityGuard.correoElectronico",
                              "Correo Electrónico",
                            )}{" "}
                            {required}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t(
                                "supervisors.new.emailPlaceholder",
                                "supervisor@ejemplo.com",
                              )}
                              type="email"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            {t(
                              "supervisors.new.emailHint",
                              "Aquí le llegará la invitación para entrar a la app de supervisor.",
                            )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="mt-4">
                      <FormField
                        control={createCtrl}
                        name="homeAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("ui.NewSecurityGuard.domicilio", "Domicilio")}
                            </FormLabel>
                            <FormControl>
                              <AddressAutocomplete
                                defaultValue={field.value || ""}
                                placeholder={t(
                                  "supervisors.new.addressPlaceholder",
                                  "Buscar dirección del supervisor...",
                                )}
                                showMap={true}
                                onAddressSelect={(result) => {
                                  field.onChange(result.address);
                                  setCreateValue(
                                    "homeAddressLat",
                                    result.latitude ?? undefined,
                                  );
                                  setCreateValue(
                                    "homeAddressLng",
                                    result.longitude ?? undefined,
                                  );
                                }}
                              />
                            </FormControl>
                            <FormDescription>
                              {t(
                                "ui.NewSecurityGuard.indiqueLaUbicacionExactaMoviendo",
                                "Indique la ubicación exacta moviendo el pin en el mapa.",
                              )}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </Section>

                  {/* ── Identificación y contrato ────────────────────────── */}
                  <Section
                    icon={<FileCheck />}
                    title={t(
                      "ui.NewSecurityGuard.identificacionYContrato",
                      "Identificación y Contrato",
                    )}
                  >
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                      <FormField
                        control={createCtrl}
                        name="identificationNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "ui.NewSecurityGuard.numeroDeIdentificacion",
                                "Número de Identificación",
                              )}{" "}
                              {required}
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t(
                                  "ui.NewSecurityGuard.duiCedulaPasaporte",
                                  "DUI, Cédula, Pasaporte…",
                                )}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createCtrl}
                        name="hiringContractDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "ui.NewSecurityGuard.fechaDeContratacion",
                                "Fecha de Contratación",
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createCtrl}
                        name="guardCredentials"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "ui.NewSecurityGuard.credencialesLicencias",
                                "Credenciales / Licencias",
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t(
                                  "ui.NewSecurityGuard.ejLicenciaArmasCertificacionAfis",
                                  "Ej. Licencia Armas, Certificación AFIS…",
                                )}
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </Section>

                  {/* ── Operación: lo propio del supervisor ──────────────── */}
                  <Section
                    icon={<Car />}
                    title={t("supervisors.new.operacion", "Operación")}
                  >
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <FormField
                        control={createCtrl}
                        name="zone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "ui.Supervisors.zonaPosicionPEjAguila2",
                                "Zona / posición (p. ej. Aguila2)",
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createCtrl}
                        name="assignedVehicle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t(
                                "ui.Supervisors.vehiculoAsignado",
                                "Vehículo asignado",
                              )}
                            </FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </Section>

                  <div className="glass flex items-center justify-end gap-3 px-6 py-4">
                    <SubmitBar
                      loading={createState.isSubmitting}
                      primaryClassName="cg-btn-brand rounded-full px-6 py-3 font-medium transition-colors disabled:opacity-50"
                      primaryLabel={t("guards.new.form.create_and_send")}
                      onPrimary={submitCreate(onSubmitCreate)}
                    />
                  </div>
                </form>
              </Form>
            </>
          )}
        </GuardTabsHeader>
      </PageContainer>
    </AppLayout>
  );
}
