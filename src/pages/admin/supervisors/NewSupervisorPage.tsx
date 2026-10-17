import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
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
import { Checkbox } from "@/components/ui/checkbox";
import { CampoUsuarioDeAcceso } from "@/components/usuarioDeAcceso/CampoUsuarioDeAcceso";
import {
  type AccesoParaCompartir,
  useCompartirAcceso,
} from "@/components/usuarioDeAcceso/CompartirAcceso";
import i18n from "@/i18n";
import { usePermissions } from "@/hooks/usePermissions";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import {
  supervisorService,
  type CreateSupervisorBody,
} from "@/lib/api/supervisorService";
import {
  createProfileSchema,
  exigirCorreoSalvoSinCorreo,
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
          })
          .optional()
          .or(z.literal("")),
        /** Sin correo: entra sólo con su usuario (alias). */
        sinCorreo: z.boolean().optional(),
        username: z.string().trim().max(32).optional().or(z.literal("")),
      })
      .superRefine(exigirCorreoSalvoSinCorreo),
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
  })
  .superRefine(exigirCorreoSalvoSinCorreo);

type ProfileValues = z.infer<typeof profileSchema>;

const blankInvite = () => ({
  firstName: "",
  lastName: "",
  email: "",
  sinCorreo: false,
  username: "",
});

type EntradaDeInvitacion = InviteValues["entries"][number];

/** El cuerpo del alta: sin correo viaja `sinCorreo: true` y ningún correo. */
const cuerpoDeAcceso = (e: {
  email?: string;
  sinCorreo?: boolean;
  username?: string;
}) => ({
  ...(e.sinCorreo
    ? { sinCorreo: true }
    : { email: String(e.email || "").trim() }),
  ...(String(e.username || "").trim()
    ? { username: String(e.username).trim() }
    : {}),
});

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
  const inviteEntries = useWatch({ control: inviteCtrl, name: "entries" });
  // «Usuario: jmiranda · comparte este enlace» de las altas sin correo.
  const compartir = useCompartirAcceso();

  /** Cómo se nombra una fila en los avisos: su correo, o su nombre si no tiene. */
  const etiquetaDe = (e: EntradaDeInvitacion) =>
    e.sinCorreo
      ? `${e.firstName} ${e.lastName}`.trim()
      : String(e.email || "").trim();

  const onSubmitInvite = async (v: InviteValues) => {
    // Uno a uno: si un correo falla, los demás siguen y se dice cuál no salió.
    const fallidos: string[] = [];
    const motivos = new Set<string>();
    const enlazados: string[] = [];
    // Las altas sin correo devuelven su enlace: no hay buzón al que mandarlo.
    const accesos: AccesoParaCompartir[] = [];

    for (const e of v.entries) {
      try {
        const sup = await supervisorService.create({
          ...cuerpoDeAcceso(e),
          firstName: e.firstName.trim(),
          lastName: e.lastName.trim(),
        });

        if ((sup as any)?.linkedExistingAccount) enlazados.push(etiquetaDe(e));
        if (sup?.invitationLink)
          accesos.push({
            nombre: `${e.firstName} ${e.lastName}`.trim(),
            username: sup.username || e.username || null,
            link: sup.invitationLink,
          });
      } catch (err: any) {
        console.error("[NewSupervisorPage] invite error <-", err);
        fallidos.push(etiquetaDe(e));
        // El motivo del servidor (p. ej. «ese usuario ya está en uso»).
        if (err?.message) motivos.add(String(err.message));
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
        motivos.size ? { description: [...motivos].join(" · ") } : undefined,
      );
      // Se queda en pantalla sólo con los que fallaron, para reintentar.
      inviteForm.reset({
        entries: v.entries.filter((e) => fallidos.includes(etiquetaDe(e))),
      });
      compartir.abrir(accesos, "invitacion");

      return;
    }
    toast.success(t("supervisors.new.invitesSent", "Invitaciones enviadas"));
    compartir.abrir(accesos, "invitacion", () => navigate("/supervisors"));
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
      sinCorreo: false,
      username: "",
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
  const createSinCorreo = useWatch({ control: createCtrl, name: "sinCorreo" });
  const createNombre = useWatch({ control: createCtrl, name: "firstName" });
  const createApellido = useWatch({ control: createCtrl, name: "lastName" });

  const onSubmitCreate = async (v: ProfileValues) => {
    // Los vacíos no viajan: una fecha "" rompe la columna DATEONLY.
    const opt = (s?: string) => (s && s.trim() ? s.trim() : undefined);
    const body: CreateSupervisorBody = {
      ...cuerpoDeAcceso(v),
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
      } else if (sup?.invitationLink) {
        toast.success(
          t(
            "supervisors.new.creadoSinCorreo",
            "Supervisor creado. Comparte su acceso para que ponga su contraseña.",
          ),
        );
      } else {
        toast.success(t("ui.SupervisorsPage.supervisorCreadoYEnviadaLa"));
      }
      compartir.abrir(
        sup?.invitationLink
          ? [
              {
                nombre: `${v.firstName} ${v.lastName}`.trim(),
                username: sup.username || v.username || null,
                link: sup.invitationLink,
              },
            ]
          : [],
        "invitacion",
        () => navigate(`/supervisors/${sup.id}`),
      );
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
                        {inviteEntries?.[idx]?.sinCorreo ? (
                          <FormField
                            control={inviteCtrl}
                            name={`entries.${idx}.username`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  {t("usuarioDeAcceso.etiqueta", "Usuario para entrar")}
                                </FormLabel>
                                <FormControl>
                                  <CampoUsuarioDeAcceso
                                    sugerir
                                    ayuda={false}
                                    firstName={inviteEntries?.[idx]?.firstName}
                                    lastName={inviteEntries?.[idx]?.lastName}
                                    value={field.value || ""}
                                    onChange={field.onChange}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        ) : (
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
                        )}
                      </div>
                      {/* Sin correo: no le llega invitación; al enviar te damos
                          su usuario y el enlace para compartirlo. */}
                      <FormField
                        control={inviteCtrl}
                        name={`entries.${idx}.sinCorreo`}
                        render={({ field }) => (
                          <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                            <Checkbox
                              checked={!!field.value}
                              onCheckedChange={(c) => field.onChange(c === true)}
                            />
                            {t("usuarioDeAcceso.sinCorreo", "Sin correo (sólo usuario)")}
                          </label>
                        )}
                      />

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
                            {!createSinCorreo && required}
                          </FormLabel>
                          <FormControl>
                            <Input
                              disabled={!!createSinCorreo}
                              placeholder={t(
                                "supervisors.new.emailPlaceholder",
                                "supervisor@ejemplo.com",
                              )}
                              type="email"
                              {...field}
                              value={createSinCorreo ? "" : field.value || ""}
                            />
                          </FormControl>
                          <FormField
                            control={createCtrl}
                            name="sinCorreo"
                            render={({ field: f }) => (
                              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                                <Checkbox
                                  checked={!!f.value}
                                  onCheckedChange={(c) => {
                                    f.onChange(c === true);
                                    if (c === true)
                                      setCreateValue("email", "", {
                                        shouldValidate: true,
                                      });
                                  }}
                                />
                                {t(
                                  "usuarioDeAcceso.sinCorreo",
                                  "Sin correo (sólo usuario)",
                                )}
                              </label>
                            )}
                          />
                          <FormDescription>
                            {createSinCorreo
                              ? t(
                                  "usuarioDeAcceso.altaSinCorreoAyuda",
                                  "No le llega ningún correo: al enviar te damos su enlace para que lo compartas (por WhatsApp, por ejemplo).",
                                )
                              : t(
                                  "supervisors.new.emailHint",
                                  "Aquí le llegará la invitación para entrar a la app de supervisor.",
                                )}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={createCtrl}
                      name="username"
                      render={({ field }) => (
                        <FormItem className="mt-4 max-w-xl">
                          <FormLabel>
                            {t("usuarioDeAcceso.etiqueta", "Usuario para entrar")}
                          </FormLabel>
                          <FormControl>
                            <CampoUsuarioDeAcceso
                              sugerir
                              firstName={createNombre}
                              lastName={createApellido}
                              value={field.value || ""}
                              onChange={field.onChange}
                            />
                          </FormControl>
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
        {compartir.dialogo}
      </PageContainer>
    </AppLayout>
  );
}
