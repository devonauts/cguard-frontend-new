import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import AppLayout from "@/layouts/app-layout";
import { PageContainer, PageHeader, Section } from "@/components/kit";
import { Button } from "@/components/ui/button";
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
import AddressAutocomplete from "@/components/maps/AddressAutocomplete";
import { Checkbox } from "@/components/ui/checkbox";
import { CampoUsuarioDeAcceso } from "@/components/usuarioDeAcceso/CampoUsuarioDeAcceso";
import {
  PerfilCreado,
  type AccesoCreado,
} from "@/components/alta/PerfilCreado";
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
 * THE FULL SUPERVISOR PROFILE (2026-11-01). Adding a supervisor with access
 * and a post lives in «Agregar persona»; this page keeps the long profile
 * (ID, zone, vehicle, personal data) with the same numbered questions. Both
 * end in the same `POST /supervisors`.
 */

// Options travel to the API in Spanish; they are only translated when painted.
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

/* The guard profile minus what a supervisor does not keep (phone, middle name,
   clients and stations: their coverage lives in the supervisor post), plus
   their own zone and vehicle. */
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

const DEFAULTS: ProfileValues = {
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
} as ProfileValues;

/** The create body: without e-mail travels `sinCorreo: true` and no address. */
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

/** A numbered question of the profile, with an optional line under it. */
function Paso({
  n,
  titulo,
  nota,
  children,
}: {
  n: number;
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <Section title={`${n} · ${titulo}`}>
      {nota && (
        <p className="-mt-2 mb-4 text-sm" style={{ color: "var(--ink-soft)" }}>
          {nota}
        </p>
      )}
      {children}
    </Section>
  );
}

interface Creado {
  id: string | null;
  nombre: string;
  acceso: AccesoCreado;
}

export default function NewSupervisorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { platformName: nombreDeMarca } = useWhiteLabel();
  const [creado, setCreado] = useState<Creado | null>(null);

  useEffect(() => {
    if (!hasPermission("securityGuardCreate")) {
      toast.error(t("guards.new.errors.no_permission_create"));
      navigate("/supervisors");
    }
  }, [hasPermission, navigate]);

  const createForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: DEFAULTS,
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
    // Blanks do not travel: a "" date breaks the DATEONLY column.
    const opt = (s?: string) => (s && s.trim() ? s.trim() : undefined);
    const body: CreateSupervisorBody = {
      ...cuerpoDeAcceso(v),
      firstName: v.firstName.trim(),
      lastName: v.lastName.trim(),
      governmentId: opt(v.identificationNumber),
      gender: opt(v.gender),
      bloodType: opt(v.bloodType),
      birthDate: opt(v.birthDate),
      birthPlace: opt(v.birthPlace),
      maritalStatus: opt(v.maritalStatus),
      academicInstruction: opt(v.academicInstruction),
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
      const nombre = `${v.firstName} ${v.lastName}`.trim();

      // An account that already existed (works for another company) was
      // LINKED, not created, and gets no «create your account» e-mail.
      if ((sup as any)?.linkedExistingAccount) {
        toast.success(
          t("ui.SupervisorsPage.esteCorreoYaTeniaCuenta", {
            marca: nombreDeMarca,
          }),
          { duration: 8000 },
        );
      } else {
        toast.success(
          t("agregarPersona.listo.titulo", {
            defaultValue: "Listo: {{nombre}} ya está en el sistema",
            nombre,
          }),
        );
      }
      setCreado({
        id: (sup as any)?.id || null,
        nombre,
        acceso: {
          username: sup?.username || v.username || null,
          link: sup?.invitationLink || null,
          correo:
            !v.sinCorreo && v.email && !(sup as any)?.linkedExistingAccount
              ? String(v.email).trim()
              : null,
        },
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      console.error("[NewSupervisorPage] create error <-", e);
      toast.error(
        e?.message ||
          t(
            "supervisors.errors.createFailed",
            "No se pudo crear el supervisor",
          ),
      );
    }
  };

  const otra = () => {
    createForm.reset(DEFAULTS);
    setCreado(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const required = <span className="text-destructive">*</span>;
  const guardando = createState.isSubmitting;

  return (
    <AppLayout>
      <PageContainer className="pb-28" width="default">
        <PageHeader
          icon={<UserPlus />}
          subtitle={t(
            "perfilCompleto.supervisor.subtitulo",
            "Su ficha con documento, zona, vehículo y datos personales. Solo su nombre, su documento y su correo (o «sin correo») son obligatorios.",
          )}
          title={t(
            "perfilCompleto.supervisor.titulo",
            "Perfil completo del supervisor",
          )}
        />

        {creado ? (
          <PerfilCreado
            acceso={creado.acceso}
            fichaUrl={creado.id ? `/supervisors/${creado.id}` : null}
            horarioUrl="/supervisor-positions"
            nombre={creado.nombre}
            onOtra={otra}
            onVer={(url) => navigate(url)}
          />
        ) : (
          <div className="space-y-6">
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              {t(
                "perfilCompleto.soloAcceso",
                "¿Solo quieres darle acceso y su horario?",
              )}{" "}
              <Link
                className="cg-btn-link font-semibold underline-offset-4 hover:underline"
                to="/personal/nueva?tipo=supervisor"
              >
                {t("perfilCompleto.usaAgregarPersona", "Usa «Agregar persona»")}
              </Link>
            </p>

            <Form {...createForm}>
              <form
                className="space-y-6"
                onSubmit={submitCreate(onSubmitCreate)}
              >
                <Paso
                  n={1}
                  titulo={t("perfilCompleto.pasos.quienEs", "¿Quién es?")}
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
                              placeholder={t(
                                "ui.NewSecurityGuard.ejCarlos",
                                "Ej. Carlos",
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
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t(
                              "guards.list.details.fields.lastName",
                              "Apellidos",
                            )}{" "}
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
                </Paso>

                <Paso
                  n={2}
                  nota={t(
                    "perfilCompleto.pasos.documentoNotaSup",
                    "Con el correo le llega su invitación a la app de supervisor. Si no tiene correo, entra con un usuario y le das el enlace por WhatsApp al terminar.",
                  )}
                  titulo={t(
                    "perfilCompleto.pasos.documento",
                    "Documento y contacto",
                  )}
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                            {t(
                              "usuarioDeAcceso.etiqueta",
                              "Usuario para entrar",
                            )}
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
                  </div>
                </Paso>

                <Paso
                  n={3}
                  nota={t(
                    "perfilCompleto.pasos.trabajoNota",
                    "Opcional. Salen en la lista de supervisores. Su horario lo da su puesto de supervisión.",
                  )}
                  titulo={t(
                    "perfilCompleto.pasos.trabajo",
                    "Zona y vehículo (opcionales)",
                  )}
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
                </Paso>

                <Paso
                  n={4}
                  nota={t(
                    "perfilCompleto.pasos.personalesNota",
                    "Todo opcional. Sirve para su expediente y los reportes de personal.",
                  )}
                  titulo={t(
                    "perfilCompleto.pasos.personales",
                    "Datos personales (opcionales)",
                  )}
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <FormField
                      control={createCtrl}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("ui.NewSecurityGuard.genero", "Género")}
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
                            {t("ui.NewSecurityGuardPage.tipoDeSangre")}
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
                            {t("ui.NewSecurityGuardPage.estadoCivil")}
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
                            {t("ui.NewSecurityGuardPage.fechaDeNacimiento")}
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
                            {t(
                              "guards.new.form.birthPlace",
                              "Lugar de Nacimiento",
                            )}
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
                            )}
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
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
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
                  </div>
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
                </Paso>

                <Paso
                  n={5}
                  titulo={t(
                    "perfilCompleto.pasos.credenciales",
                    "Credenciales (opcionales)",
                  )}
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                </Paso>

                <div className="glass flex flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-6">
                  <Button
                    disabled={guardando}
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/supervisors")}
                  >
                    {t("agregarPersona.botones.cancelar", "Cancelar")}
                  </Button>
                  <Button disabled={guardando} type="submit" variant="brand">
                    {guardando && (
                      <Loader2 className="animate-spin" size={14} />
                    )}
                    {t("agregarPersona.botones.crear", "Crear y dar acceso")}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}
      </PageContainer>
    </AppLayout>
  );
}
