"use client";

import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import ProfilePhotoCapture from "./components/ProfilePhotoCapture";
import DocumentUpload, { type DocumentFile } from "./components/DocumentUpload";

import AppLayout from "@/layouts/app-layout";
import { InfoNote, PageContainer, PageHeader, Section } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/phone/PhoneInput";
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
import { Checkbox } from "@/components/ui/checkbox";
import { CampoUsuarioDeAcceso } from "@/components/usuarioDeAcceso/CampoUsuarioDeAcceso";
import { ImportarHojaDeVida } from "@/components/security-guards/ImportarHojaDeVida";
import {
  PerfilCreado,
  type AccesoCreado,
} from "@/components/alta/PerfilCreado";
import AddressAutocomplete from "@/components/maps/AddressAutocomplete";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { usePermissions } from "@/hooks/usePermissions";
import {
  createProfileFormSchema,
  type CreateProfileValues,
  BLOOD_TYPES,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  ACADEMIC_INSTRUCTION_OPTIONS,
} from "@/lib/validators/create-profile.schema";

/*
 * THE FULL GUARD PROFILE (2026-11-01). Adding a guard with access and a
 * schedule lives in «Agregar persona» (/personal/nueva); this page is for the
 * day the office has the candidate's papers at hand: photo, ID, personal data,
 * certificates. Same plain questions as the wizard, numbered, and only names,
 * ID and e-mail (or «sin correo») are required. The invite tab it used to have
 * moved to the wizard; the payload of the profile is unchanged.
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

/** Document fields of the profile (File objects, outside zod). */
interface GuardDocuments {
  profilePhoto: File | null;
  identificationImage: DocumentFile | null;
  afisCertificate: DocumentFile | null;
  medicalCertificate: DocumentFile | null;
  psychologicalCertificate: DocumentFile | null;
  credentialDocument: DocumentFile | null;
  certificationLevel1: DocumentFile | null;
  certificationLevel2: DocumentFile | null;
  familyViolenceCertificate: DocumentFile | null;
}

const emptyDocs = (): GuardDocuments => ({
  profilePhoto: null,
  identificationImage: null,
  afisCertificate: null,
  medicalCertificate: null,
  psychologicalCertificate: null,
  credentialDocument: null,
  certificationLevel1: null,
  certificationLevel2: null,
  familyViolenceCertificate: null,
});

const DEFAULTS: CreateProfileValues = {
  firstName: "",
  middleName: "",
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
  phone: "",
  homeAddress: "",
  homeAddressLat: undefined,
  homeAddressLng: undefined,
  identificationNumber: "",
  bloodType: undefined,
  clientId: [] as string[],
  stationId: [] as string[],
} as CreateProfileValues;

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

export default function NewSecurityGuardPage() {
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    if (!hasPermission("securityGuardCreate")) {
      toast.error(t("guards.new.errors.no_permission_create"));
      navigate("/security-guards");
    }
  }, [hasPermission, navigate]);

  const createForm = useForm<CreateProfileValues>({
    resolver: zodResolver(createProfileFormSchema),
    defaultValues: DEFAULTS,
    mode: "onTouched",
  });
  const {
    control: createCtrl,
    handleSubmit: submitCreate,
    formState: createState,
    setError: setCreateError,
    setValue: setCreateValue,
  } = createForm;

  const [guardDocs, setGuardDocs] = useState<GuardDocuments>(emptyDocs());
  // The imported CV, attached to the record after saving. Apart from
  // `guardDocs` because that one has fixed named slots and this is one more
  // document, not one of them.
  const [hojaDeVida, setHojaDeVida] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [creado, setCreado] = useState<Creado | null>(null);

  /**
   * Arriving FROM VIGIA with the CV already read: the widget sends the fields
   * in the navigation state and they are poured into the form once
   * (`replace` clears the state so a reload does not fill it again).
   */
  useEffect(() => {
    const desdeVigia = (location.state as any)?.hojaDeVida;

    if (!desdeVigia) return;
    Object.entries(desdeVigia).forEach(([campo, valor]) => {
      if (valor === undefined || valor === "") return;
      setCreateValue(campo as never, valor as never, { shouldDirty: true });
    });
    const archivo = (location.state as any)?.hojaDeVidaArchivo;

    if (archivo instanceof File) setHojaDeVida(archivo);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state]);

  const setDoc = (key: keyof GuardDocuments) => (val: any) =>
    setGuardDocs((prev) => ({ ...prev, [key]: val }));

  // Object URL for the photo preview, created once per File and revoked when
  // it changes, so a long form does not leak blob URLs.
  const profilePhotoFile = guardDocs.profilePhoto ?? null;
  const profilePhotoPreviewUrl = useMemo(
    () => (profilePhotoFile ? URL.createObjectURL(profilePhotoFile) : null),
    [profilePhotoFile],
  );

  useEffect(() => {
    return () => {
      if (profilePhotoPreviewUrl) URL.revokeObjectURL(profilePhotoPreviewUrl);
    };
  }, [profilePhotoPreviewUrl]);

  /** Upload one document and return the stored file (with its token). */
  const uploadDoc = async (file: File, storageId: string) => {
    try {
      return await securityGuardService.uploadFileToStorage(file, storageId);
    } catch (e) {
      console.warn(`[GuardCreate] failed to upload ${storageId}:`, e);

      return null;
    }
  };

  const onSubmitCreate = async (v: CreateProfileValues) => {
    try {
      setUploading(true);

      // 1. Profile photo
      let profileImageObj: any = null;

      if (guardDocs.profilePhoto) {
        profileImageObj = await uploadDoc(
          guardDocs.profilePhoto,
          "securityGuardProfileImage",
        );
      }

      // 2. Every document, in parallel
      const subir = (d: DocumentFile | null, storageId: string) =>
        d ? uploadDoc(d.file, storageId) : Promise.resolve(null);
      const [
        idImageObj,
        afisObj,
        medObj,
        psychObj,
        credObj,
        cert1Obj,
        cert2Obj,
        famObj,
      ] = await Promise.all([
        subir(
          guardDocs.identificationImage,
          "securityGuardIdentificationImage",
        ),
        subir(guardDocs.afisCertificate, "securityGuardAfisCertificate"),
        subir(guardDocs.medicalCertificate, "securityGuardMedicalCertificate"),
        subir(
          guardDocs.psychologicalCertificate,
          "securityGuardPsychologicalCertificate",
        ),
        subir(guardDocs.credentialDocument, "securityGuardCredentialDocument"),
        subir(
          guardDocs.certificationLevel1,
          "securityGuardCertificationLevel1",
        ),
        subir(
          guardDocs.certificationLevel2,
          "securityGuardCertificationLevel2",
        ),
        subir(
          guardDocs.familyViolenceCertificate,
          "securityGuardFamilyViolenceCertificate",
        ),
      ]);

      // 3. Payload (unchanged from the old «Crear perfil» tab)
      const { password, confirmPassword, ...rest } = v as any;
      const stationIds = Array.isArray(rest.stationId)
        ? rest.stationId
        : rest.stationId
          ? [rest.stationId]
          : [];

      delete rest.stationId;
      /* WITHOUT E-MAIL: no address travels and `sinCorreo: true` does; the
         person signs in with a username and sets the password from the link
         the create returns (`invitationLink`), shown right here. */
      if (rest.sinCorreo) {
        delete rest.email;
        rest.sinCorreo = true;
      } else {
        delete rest.sinCorreo;
      }
      if (!String(rest.username || "").trim()) delete rest.username;
      // Optional fields left blank are not sent: the server keeps them empty.
      for (const k of [
        "gender",
        "bloodType",
        "maritalStatus",
        "academicInstruction",
        "birthDate",
        "phone",
      ]) {
        if (rest[k] === "" || rest[k] == null) delete rest[k];
      }
      const token = (o: any, key: string) =>
        o?.fileToken ? { [key]: o.fileToken } : {};
      const payload = {
        ...rest,
        ...(stationIds.length ? { stationIds } : {}),
        ...(profileImageObj ? { profileImage: [profileImageObj] } : {}),
        ...token(idImageObj, "identificationImageToken"),
        ...token(afisObj, "afisCertificateToken"),
        ...token(medObj, "medicalCertificateToken"),
        ...token(psychObj, "psychologicalCertificateToken"),
        ...token(credObj, "credentialDocumentToken"),
        ...token(cert1Obj, "certificationLevel1Token"),
        ...token(cert2Obj, "certificationLevel2Token"),
        ...token(famObj, "familyViolenceCertificateToken"),
      };

      const res: any = await securityGuardService.create(payload);
      const enlace: string | null =
        res?.invitationLink || res?.data?.invitationLink || null;
      const idCreado: string | null = res?.id || res?.data?.id || null;

      toast.success(
        t("agregarPersona.listo.titulo", {
          defaultValue: "Listo: {{nombre}} ya está en el sistema",
          nombre: `${v.firstName} ${v.lastName}`.trim(),
        }),
      );

      // The imported CV is FILED in the record. After the create, because
      // until then there is no guard to hang it on, and in its own `try`
      // because the person IS created: losing the attachment is a nuisance,
      // failing the whole create after it happened is much worse.
      if (hojaDeVida && idCreado) {
        try {
          const subido = await securityGuardService.uploadFileToStorage(
            hojaDeVida,
            "securityGuardDocument",
          );

          await securityGuardService.addDocuments(idCreado, [
            {
              name: hojaDeVida.name,
              sizeInBytes: subido?.sizeInBytes ?? hojaDeVida.size,
              privateUrl: subido?.privateUrl ?? null,
            },
          ]);
        } catch (err) {
          console.warn("[GuardCreate] could not file the CV", err);
          toast.warning(
            t(
              "ui.NewSecurityGuard.creamosPeroSinHojaDeVida",
              "Creamos el vigilante, pero no pudimos archivar la hoja de vida.",
            ),
            {
              description: t(
                "guards.create.cvUploadHint",
                "Súbela desde su ficha, en Documentos.",
              ),
            },
          );
        }
      }

      setCreado({
        id: idCreado,
        nombre: `${v.firstName} ${v.lastName}`.trim(),
        acceso: {
          username: res?.username || res?.data?.username || v.username || null,
          link: enlace,
          correo: !v.sinCorreo && v.email ? String(v.email).trim() : null,
        },
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      console.error("[NewSecurityGuardPage] createProfile error <-", e);
      try {
        const { applyValidationErrorsToForm } =
          await import("@/lib/utils/formErrorMapper");
        const result = applyValidationErrorsToForm(e, setCreateError as any);
        const msgs = Array.isArray(result) ? result : result.messages;

        if (msgs && msgs.length > 0)
          msgs.forEach((m: string) => toast.error(m));
        else
          toast.error(
            e?.message ?? t("guards.new.errors.error_create_profile"),
          );
      } catch {
        toast.error(e?.message ?? t("guards.new.errors.error_create_profile"));
      }
    } finally {
      setUploading(false);
    }
  };

  const otra = () => {
    createForm.reset(DEFAULTS);
    setGuardDocs(emptyDocs());
    setHojaDeVida(null);
    setCreado(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const createSinCorreo = useWatch({ control: createCtrl, name: "sinCorreo" });
  const createNombre = useWatch({ control: createCtrl, name: "firstName" });
  const createApellido = useWatch({ control: createCtrl, name: "lastName" });
  const guardando = createState.isSubmitting || uploading;

  return (
    <AppLayout>
      <PageContainer className="pb-28" width="default">
        <PageHeader
          icon={<UserPlus />}
          subtitle={t(
            "perfilCompleto.vigilante.subtitulo",
            "Para cuando tienes sus papeles a mano. Solo su nombre, su documento y su correo (o «sin correo») son obligatorios; lo demás se puede completar después desde su ficha.",
          )}
          title={t(
            "perfilCompleto.vigilante.titulo",
            "Perfil completo del vigilante",
          )}
        />

        {creado ? (
          <PerfilCreado
            acceso={creado.acceso}
            fichaUrl={creado.id ? `/guards/${creado.id}/resumen` : null}
            horarioUrl={
              creado.id
                ? `/guards/${creado.id}/asignar-sitios?asignar=1`
                : "/schedule"
            }
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
                to="/personal/nueva?tipo=vigilante"
              >
                {t("perfilCompleto.usaAgregarPersona", "Usa «Agregar persona»")}
              </Link>
            </p>

            {/* The shortcut first: whoever has the candidate's CV in front of
                them uploads it and the form fills itself. */}
            <InfoNote
              icon={<FileText />}
              title={t(
                "perfilCompleto.hojaDeVida.titulo",
                "¿Tienes su hoja de vida?",
              )}
              tone="brand"
            >
              <p className="mb-3">
                {t(
                  "perfilCompleto.hojaDeVida.texto",
                  "Súbela en PDF o foto y llenamos lo que se pueda. Revisa los datos antes de guardar: nada se guarda hasta que toques «Crear y dar acceso».",
                )}
              </p>
              <ImportarHojaDeVida
                onArchivo={(archivo) => setHojaDeVida(archivo)}
                onDatos={(campos) => {
                  // `shouldDirty` so the form knows it changed; not
                  // `shouldValidate`, which would paint a half-filled form red.
                  (
                    Object.entries(campos) as Array<
                      [keyof typeof campos, unknown]
                    >
                  ).forEach(([campo, valor]) => {
                    if (valor === undefined || valor === "") return;
                    setCreateValue(campo as never, valor as never, {
                      shouldDirty: true,
                    });
                  });
                }}
              />
            </InfoNote>

            <Form {...createForm}>
              <form
                className="space-y-6"
                onSubmit={submitCreate(onSubmitCreate)}
              >
                <Paso
                  n={1}
                  titulo={t("perfilCompleto.pasos.quienEs", "¿Quién es?")}
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <FormField
                      control={createCtrl}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("ui.NewSecurityGuardPage.nombreS")}{" "}
                            <span className="text-destructive">*</span>
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
                      name="middleName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t("ui.NewSecurityGuardPage.segundoNombre")}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t(
                                "ui.ExtremoRutaField.opcional",
                                "Opcional",
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
                            <span className="text-destructive">*</span>
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
                    "perfilCompleto.pasos.documentoNota",
                    "Con el correo le llega su invitación. Si no tiene correo, entra con un usuario y le das el enlace por WhatsApp al terminar.",
                  )}
                  titulo={t(
                    "perfilCompleto.pasos.documento",
                    "Documento y contacto",
                  )}
                >
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                            <span className="text-destructive">*</span>
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
                    <div>
                      <DocumentUpload
                        description={t(
                          "ui.NewSecurityGuardPage.fotoOEscaneoDelDocumento",
                        )}
                        label={t(
                          "ui.NewSecurityGuard.imagenDeIdentificacion",
                          "Imagen de Identificación",
                        )}
                        value={guardDocs.identificationImage ?? null}
                        onChange={
                          setDoc("identificationImage") as (f: any) => void
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <FormField
                      control={createCtrl}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t(
                              "ui.NewSecurityGuard.correoElectronico",
                              "Correo Electrónico",
                            )}{" "}
                            {!createSinCorreo && (
                              <span className="text-destructive">*</span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <Input
                              disabled={!!createSinCorreo}
                              placeholder={t(
                                "ui.NewSecurityGuardPage.vigilanteEjemploCom",
                              )}
                              type="email"
                              {...field}
                              value={createSinCorreo ? "" : field.value || ""}
                            />
                          </FormControl>
                          {/* Sin correo: entra sólo con su usuario y la
                                contraseña la pone desde el enlace que se
                                comparte al terminar el alta. */}
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={createCtrl}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t(
                              "ui.NewSecurityGuard.telefonoCelular",
                              "Teléfono / Celular",
                            )}
                          </FormLabel>
                          <FormControl>
                            <PhoneInput
                              value={field.value || ""}
                              onChange={(val: string) => field.onChange(val)}
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
                      name="username"
                      render={({ field }) => (
                        <FormItem>
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
                    "perfilCompleto.pasos.fotoNota",
                    "Opcional. Es la foto de su credencial y la que ven los supervisores.",
                  )}
                  titulo={t("perfilCompleto.pasos.foto", "Su foto")}
                >
                  <div className="flex justify-center">
                    <ProfilePhotoCapture
                      previewUrl={profilePhotoPreviewUrl}
                      value={guardDocs.profilePhoto ?? null}
                      onChange={
                        setDoc("profilePhoto") as (f: File | null) => void
                      }
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
                                "ui.NewSecurityGuard.buscarDireccionDelVigilante",
                                "Buscar dirección del vigilante...",
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
                  nota={t(
                    "perfilCompleto.pasos.licenciasNota",
                    "Todo opcional. Se pueden subir después desde su ficha, en Licencias y Documentos.",
                  )}
                  titulo={t(
                    "perfilCompleto.pasos.licencias",
                    "Licencias y credenciales (opcionales)",
                  )}
                >
                  <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <DocumentUpload
                      description={t(
                        "ui.NewSecurityGuardPage.sistemaAutomatizadoDeIdentificacionDe",
                      )}
                      label={t(
                        "ui.NewSecurityGuard.certificadoAfis",
                        "Certificado AFIS",
                      )}
                      value={guardDocs.afisCertificate ?? null}
                      onChange={setDoc("afisCertificate") as (f: any) => void}
                    />
                    <DocumentUpload
                      description={t(
                        "ui.NewSecurityGuardPage.certificadoMedicoVigente",
                      )}
                      label={t(
                        "ui.NewSecurityGuard.certificadoMedico",
                        "Certificado Médico",
                      )}
                      value={guardDocs.medicalCertificate ?? null}
                      onChange={
                        setDoc("medicalCertificate") as (f: any) => void
                      }
                    />
                    <DocumentUpload
                      description={t(
                        "ui.NewSecurityGuardPage.evaluacionPsicologicaActualizada",
                      )}
                      label={t(
                        "ui.NewSecurityGuard.certificadoPsicologico",
                        "Certificado Psicológico",
                      )}
                      value={guardDocs.psychologicalCertificate ?? null}
                      onChange={
                        setDoc("psychologicalCertificate") as (f: any) => void
                      }
                    />
                    <DocumentUpload
                      description={t(
                        "ui.NewSecurityGuardPage.documentoDeCredencialProfesional",
                        "Documento de credencial profesional",
                      )}
                      label={t("ui.NewSecurityGuard.credencial", "Credencial")}
                      value={guardDocs.credentialDocument ?? null}
                      onChange={
                        setDoc("credentialDocument") as (f: any) => void
                      }
                    />
                    <DocumentUpload
                      description={t(
                        "ui.NewSecurityGuardPage.certificacionDeVigilanteNivel1",
                      )}
                      label={t(
                        "ui.NewSecurityGuard.certificacionNivel1",
                        "Certificación Nivel 1",
                      )}
                      value={guardDocs.certificationLevel1 ?? null}
                      onChange={
                        setDoc("certificationLevel1") as (f: any) => void
                      }
                    />
                    <DocumentUpload
                      description={t(
                        "ui.NewSecurityGuardPage.certificacionDeVigilanteNivel2",
                      )}
                      label={t(
                        "ui.NewSecurityGuard.certificacionNivel2",
                        "Certificación Nivel 2",
                      )}
                      value={guardDocs.certificationLevel2 ?? null}
                      onChange={
                        setDoc("certificationLevel2") as (f: any) => void
                      }
                    />
                    <DocumentUpload
                      description={t(
                        "ui.NewSecurityGuardPage.certificadoDeNoAntecedentesDeViolenciaFamiliar",
                        "Certificado de no antecedentes de violencia familiar",
                      )}
                      label={t(
                        "ui.NewSecurityGuard.certificadoViolenciaIntrafamiliar",
                        "Certificado Violencia Intrafamiliar",
                      )}
                      value={guardDocs.familyViolenceCertificate ?? null}
                      onChange={
                        setDoc("familyViolenceCertificate") as (f: any) => void
                      }
                    />
                  </div>
                </Paso>

                {/* The action row sits at the bottom of the page: the VigIA
                    bubble steps aside from it (VigiaWidget.bubblePlacement). */}
                <div className="glass flex flex-wrap items-center justify-end gap-3 px-4 py-3 sm:px-6">
                  {uploading && (
                    <span
                      className="mr-auto flex items-center gap-2 text-sm"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t(
                        "ui.NewSecurityGuard.subiendoDocumentos",
                        "Subiendo documentos…",
                      )}
                    </span>
                  )}
                  <Button
                    disabled={guardando}
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/security-guards")}
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
