"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImportarHojaDeVida } from "@/components/security-guards/ImportarHojaDeVida";
import { clientDisplayName } from "@/lib/clientName";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  RefreshCcw,
  User,
  Phone,
  FileCheck,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader, Section } from "@/components/kit";
import { UserPlus } from "lucide-react";
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Separator } from "@/components/ui/separator";

import {
  inviteByOptions,
  type GuardEntryValues,
  type SecurityGuardsFormValues,
  securityGuardsSchema,
} from "@/lib/validators/security-guard.schema";
import {
  joinByCodeSchema,
  type JoinByCodeEntry,
  type JoinByCodeFormValues,
} from "@/lib/validators/join-by-code.schema";
import {
  inviteByLinkSchema,
  type InviteByLinkEntry,
  type InviteByLinkFormValues,
} from "@/lib/validators/invite-by-link.schema";
import {
  createProfileSchema,
  type CreateProfileValues,
  BLOOD_TYPES,
  GENDER_OPTIONS,
  MARITAL_STATUS_OPTIONS,
  ACADEMIC_INSTRUCTION_OPTIONS,
} from "@/lib/validators/create-profile.schema";

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

import { GuardTabsHeader } from "@/components/app/guard-tabs";
import { FormBlock } from "@/components/app/form-block";
import { Combobox } from "@/components/app/combobox";
import MultiCombobox from "@/components/app/multicombobox";
import { Copyable } from "@/components/app/copyable";
import { AddBlockButton, RemoveBlockButton } from "@/components/app/add-remove";
import { SubmitBar } from "@/components/app/submit-bar";
import { clientService } from "@/lib/api/clientService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { stationService } from "@/lib/api/stationService";
import { usePermissions } from "@/hooks/usePermissions";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AddressAutocomplete from "@/components/maps/AddressAutocomplete";
import ProfilePhotoCapture from "./components/ProfilePhotoCapture";
import DocumentUpload, { type DocumentFile } from "./components/DocumentUpload";

// Lightweight station shape used to build select options and client-filter matching.
interface StationLike {
  id: string;
  name?: string;
  clientId?: string;
  clientAccountId?: string;
  client?: { id?: string } | null;
  clientAccount?: { id?: string } | null;
}

// Helpers
const blankInviteEntry = (
  inviteBy: GuardEntryValues["inviteBy"] = "Correo Electrónico",
): any => ({
  firstName: "",
  lastName: "",
  inviteBy,
  contact: "",
  clientId: [] as string[],
  stationId: [] as string[],
});
const blankJoinEntry = (): JoinByCodeEntry => ({ phone: "" });
const blankLinkEntry = (): InviteByLinkEntry => ({ phone: "" });
const genCode = () => String(Math.floor(100000 + Math.random() * 900000));

type TabKey = "invite" | "join_code" | "invite_link" | "create_profile";

/** Document fields required on the create-profile form */
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
  const [activeTab, setActiveTab] = useState<TabKey>("invite");
  const [clients, setClients] = useState<
    Array<{ id: string; name: string; lastName?: string }>
  >([]);
  const [stations, setStations] = useState<StationLike[]>([]);
  // Password fields removed from create profile form - guard will set password via invitation link

  useEffect(() => {
    const loadData = async () => {
      try {
        const [clientsResp, stationsResp] = await Promise.all([
          clientService.getClients({}),
          stationService.list({}, { limit: 1000, offset: 0 }),
        ]);

        setClients(clientsResp.rows || []);
        setStations(stationsResp.rows || []);
      } catch (error) {
        console.error(error);
        toast.error(t("guards.new.toasts.clients_sites_load_error"));
      }
    };

    loadData();
  }, []);

  /* ============== TAB 1: INVITAR (bloques) ============== */
  const inviteForm = useForm<SecurityGuardsFormValues>({
    resolver: zodResolver(securityGuardsSchema),
    defaultValues: { entries: [blankInviteEntry("Correo Electrónico")] },
    mode: "onTouched",
  });
  const {
    control: inviteCtrl,
    handleSubmit: submitInvite,
    setValue: setInviteValue,
    formState: inviteState,
    setError: setInviteError,
  } = inviteForm;
  const {
    fields: inviteFields,
    append: inviteAppend,
    remove: inviteRemove,
  } = useFieldArray({ control: inviteCtrl, name: "entries" });
  const inviteEntries = useWatch({ control: inviteCtrl, name: "entries" });

  const onSubmitInvite = async (v: SecurityGuardsFormValues) => {
    try {
      console.log("[NewSecurityGuardPage] invite payload ->", v.entries);
      // Normalize entries so backend receives explicit phoneNumber/email fields
      const payload = v.entries.map((e) => ({
        firstName: e.firstName,
        lastName: e.lastName,
        // send arrays and keep single-value compatibility
        clientIds: Array.isArray(e.clientId)
          ? e.clientId
          : e.clientId
            ? [e.clientId]
            : [],
        stationIds: Array.isArray((e as any).stationId)
          ? (e as any).stationId
          : (e as any).stationId
            ? [(e as any).stationId]
            : [],
        clientId: Array.isArray(e.clientId) ? e.clientId[0] : e.clientId,
        // backend expects a generic `contact` field for invite flows
        // keep explicit `phoneNumber`/`email` as well for compatibility
        contact: e.contact,
        phoneNumber: e.inviteBy === "SMS" ? e.contact : undefined,
        email: e.inviteBy === "Correo Electrónico" ? e.contact : undefined,
        // Do not include `roles` here — backend sets securityGuard role server-side
        inviteBy: e.inviteBy,
      }));
      await securityGuardService.invite(payload);
      console.log("[NewSecurityGuardPage] invite response: sent");
      toast.success(t("guards.new.toasts.invites_sent"));
      // After successful invite, navigate back to the security guards list
      navigate("/security-guards");
    } catch (e: any) {
      console.error("[NewSecurityGuardPage] invite error <-", e);
      try {
        const { applyValidationErrorsToForm } = await import(
          "@/lib/utils/formErrorMapper"
        );
        const result = applyValidationErrorsToForm(e, setInviteError as any);
        const msgs = Array.isArray(result) ? result : result.messages;
        if (msgs && msgs.length > 0) msgs.forEach((m) => toast.error(m));
        else toast.error(e?.message ?? t("guards.new.toasts.invite_error"));
      } catch (ex) {
        toast.error(e?.message ?? t("guards.new.toasts.invite_error"));
      }
    }
  };

  /* ============== TAB 2: UNIRSE POR CÓDIGO (bloques) ============== */
  const initialCode = useMemo(() => genCode(), []);
  const joinForm = useForm<JoinByCodeFormValues>({
    resolver: zodResolver(joinByCodeSchema),
    defaultValues: { code: initialCode, entries: [blankJoinEntry()] },
    mode: "onTouched",
  });
  const {
    control: joinCtrl,
    handleSubmit: submitJoin,
    setValue: setJoinValue,
    getValues: getJoinValues,
    formState: joinState,
    setError: setJoinError,
  } = joinForm;
  const {
    fields: joinFields,
    append: joinAppend,
    remove: joinRemove,
  } = useFieldArray({ control: joinCtrl, name: "entries" });
  const codeValue = useWatch({ control: joinCtrl, name: "code" });

  const onSubmitJoin = async (v: JoinByCodeFormValues) => {
    try {
      console.log("[NewSecurityGuardPage] joinByCode payload ->", {
        code: v.code,
        entries: v.entries,
      });
      // Ensure backend gets phoneNumber
      const payload = v.entries.map((e) => ({ phoneNumber: e.phone }));
      await securityGuardService.joinByCode(v.code, payload);
      console.log("[NewSecurityGuardPage] joinByCode response: sent");
      toast.success(t("guards.new.join_code.invite_sent"));
    } catch (e: any) {
      console.error("[NewSecurityGuardPage] joinByCode error <-", e);
      try {
        const { applyValidationErrorsToForm } = await import(
          "@/lib/utils/formErrorMapper"
        );
        const result = applyValidationErrorsToForm(e, setJoinError as any);
        const msgs = Array.isArray(result) ? result : result.messages;
        if (msgs && msgs.length > 0) msgs.forEach((m) => toast.error(m));
        else toast.error(e?.message ?? t("guards.new.join_code.invite_error"));
      } catch (ex) {
        toast.error(e?.message ?? t("guards.new.join_code.invite_error"));
      }
    }
  };
  const regenCode = () =>
    setJoinValue("code", genCode(), { shouldValidate: true });

  /* ============== TAB 3: INVITAR USANDO ENLACE (bloques) ============== */
  const linkForm = useForm<InviteByLinkFormValues>({
    resolver: zodResolver(inviteByLinkSchema),
    defaultValues: {
      link: `${window.location.origin}/guard-join/${localStorage.getItem("tenantId") || ""}`,
      entries: [blankLinkEntry()],
    },
    mode: "onTouched",
  });
  const {
    control: linkCtrl,
    handleSubmit: submitLink,
    getValues: getLinkValues,
    formState: linkState,
    setError: setLinkError,
  } = linkForm;
  const {
    fields: linkFields,
    append: linkAppend,
    remove: linkRemove,
  } = useFieldArray({ control: linkCtrl, name: "entries" });
  const linkValue = useWatch({ control: linkCtrl, name: "link" });

  const onSubmitLink = async (v: InviteByLinkFormValues) => {
    try {
      console.log("[NewSecurityGuardPage] inviteByLink payload ->", {
        link: v.link,
        entries: v.entries,
      });
      // Ensure backend receives phoneNumber
      const payload = v.entries.map((e) => ({ phoneNumber: e.phone }));
      await securityGuardService.inviteByLink(v.link, payload);
      console.log("[NewSecurityGuardPage] inviteByLink response: sent");
      toast.success(t("guards.new.link.invite_sent"));
    } catch (e: any) {
      console.error("[NewSecurityGuardPage] inviteByLink error <-", e);
      try {
        const { applyValidationErrorsToForm } = await import(
          "@/lib/utils/formErrorMapper"
        );
        const result = applyValidationErrorsToForm(e, setLinkError as any);
        const msgs = Array.isArray(result) ? result : result.messages;
        if (msgs && msgs.length > 0) msgs.forEach((m) => toast.error(m));
        else toast.error(e?.message ?? t("guards.new.link.invite_error"));
      } catch (ex) {
        toast.error(e?.message ?? t("guards.new.link.invite_error"));
      }
    }
  };

  /* ============== TAB 4: CREAR PERFIL ============== */
  const createIntentRef = useRef<"create" | "create_send">("create");
  const createForm = useForm<CreateProfileValues>({
    resolver: zodResolver(createProfileSchema),
    defaultValues: {
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
      phone: "",
      homeAddress: "",
      homeAddressLat: undefined,
      homeAddressLng: undefined,
      identificationNumber: "",
      bloodType: undefined,
      clientId: [] as string[],
      stationId: [] as string[],
      // clientId kept in state for payload compat but not required on create_profile
    },
    mode: "onTouched",
  });
  const {
    control: createCtrl,
    handleSubmit: submitCreate,
    formState: createState,
    setError: setCreateError,
    setValue: setCreateValue,
  } = createForm;

  // Document files state (outside zod — File objects)
  const [guardDocs, setGuardDocs] = useState<GuardDocuments>(emptyDocs());
  // La hoja de vida que se importó, para adjuntarla al expediente al guardar.
  // Vive aparte de `guardDocs` porque ése tiene ranuras con nombre fijo y ésta
  // es un documento más, no una de ellas.
  const [hojaDeVida, setHojaDeVida] = useState<File | null>(null);

  /**
   * Llegar aquí DESDE VIGIA con la hoja de vida ya leída.
   *
   * El widget manda los campos por el estado de navegación y esta pantalla los
   * vuelca en el formulario y salta a la pestaña de crear perfil. Se hace una
   * sola vez: `navigate(replace)` limpia el estado para que recargar la página
   * o volver atrás no vuelva a rellenar encima de lo que se haya escrito.
   */
  useEffect(() => {
    const desdeVigia = (location.state as any)?.hojaDeVida;
    if (!desdeVigia) return;
    setActiveTab("create_profile");
    Object.entries(desdeVigia).forEach(([campo, valor]) => {
      if (valor === undefined || valor === "") return;
      setCreateValue(campo as never, valor as never, { shouldDirty: true });
    });
    const archivo = (location.state as any)?.hojaDeVidaArchivo;
    if (archivo instanceof File) setHojaDeVida(archivo);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state]);
  const [uploading, setUploading] = useState(false);

  const setDoc = (key: keyof GuardDocuments) => (val: any) =>
    setGuardDocs((prev) => ({ ...prev, [key]: val }));

  // Object URL for the profile-photo preview. Created once per selected File (not
  // on every render) and revoked when the File changes / on unmount to avoid
  // leaking blob URLs while the user fills out the large controlled form.
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

  /** Upload a single document file and return the file object with token */
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

      // 1. Upload profile photo
      let profileImageObj: any = null;
      if (guardDocs.profilePhoto) {
        profileImageObj = await uploadDoc(
          guardDocs.profilePhoto,
          "securityGuardProfileImage",
        );
      }

      // 2. Upload all documents in parallel
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
        guardDocs.identificationImage
          ? uploadDoc(
              guardDocs.identificationImage.file,
              "securityGuardIdentificationImage",
            )
          : null,
        guardDocs.afisCertificate
          ? uploadDoc(
              guardDocs.afisCertificate.file,
              "securityGuardAfisCertificate",
            )
          : null,
        guardDocs.medicalCertificate
          ? uploadDoc(
              guardDocs.medicalCertificate.file,
              "securityGuardMedicalCertificate",
            )
          : null,
        guardDocs.psychologicalCertificate
          ? uploadDoc(
              guardDocs.psychologicalCertificate.file,
              "securityGuardPsychologicalCertificate",
            )
          : null,
        guardDocs.credentialDocument
          ? uploadDoc(
              guardDocs.credentialDocument.file,
              "securityGuardCredentialDocument",
            )
          : null,
        guardDocs.certificationLevel1
          ? uploadDoc(
              guardDocs.certificationLevel1.file,
              "securityGuardCertificationLevel1",
            )
          : null,
        guardDocs.certificationLevel2
          ? uploadDoc(
              guardDocs.certificationLevel2.file,
              "securityGuardCertificationLevel2",
            )
          : null,
        guardDocs.familyViolenceCertificate
          ? uploadDoc(
              guardDocs.familyViolenceCertificate.file,
              "securityGuardFamilyViolenceCertificate",
            )
          : null,
      ]);

      // 3. Build payload
      const { password, confirmPassword, ...rest } = v as any;
      const stationIds = Array.isArray(rest.stationId)
        ? rest.stationId
        : rest.stationId
          ? [rest.stationId]
          : [];
      delete rest.stationId;
      const payload = {
        ...rest,
        ...(stationIds.length ? { stationIds } : {}),
        ...(profileImageObj ? { profileImage: [profileImageObj] } : {}),
        ...(idImageObj?.fileToken
          ? { identificationImageToken: idImageObj.fileToken }
          : {}),
        ...(afisObj?.fileToken
          ? { afisCertificateToken: afisObj.fileToken }
          : {}),
        ...(medObj?.fileToken
          ? { medicalCertificateToken: medObj.fileToken }
          : {}),
        ...(psychObj?.fileToken
          ? { psychologicalCertificateToken: psychObj.fileToken }
          : {}),
        ...(credObj?.fileToken
          ? { credentialDocumentToken: credObj.fileToken }
          : {}),
        ...(cert1Obj?.fileToken
          ? { certificationLevel1Token: cert1Obj.fileToken }
          : {}),
        ...(cert2Obj?.fileToken
          ? { certificationLevel2Token: cert2Obj.fileToken }
          : {}),
        ...(famObj?.fileToken
          ? { familyViolenceCertificateToken: famObj.fileToken }
          : {}),
      };

      const creado: any = await securityGuardService.create(payload);
      toast.success(t("guards.new.toasts.profile_created_sent"));

      // La hoja de vida que se importó queda ARCHIVADA en el expediente. Va
      // después de crear porque hasta aquí no existe el vigilante al que
      // colgarla, y va en su propio `try` porque el alta YA está hecha: perder
      // el adjunto es un fastidio, tumbar el alta con un error después de haber
      // creado a la persona es mucho peor.
      const idCreado = creado?.id || creado?.data?.id || null;
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
          console.warn(
            "[GuardCreate] no se pudo archivar la hoja de vida",
            err,
          );
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

      createForm.reset();
      setGuardDocs(emptyDocs());
      setHojaDeVida(null);
      navigate("/security-guards");
    } catch (e: any) {
      console.error("[NewSecurityGuardPage] createProfile error <-", e);
      try {
        const { applyValidationErrorsToForm } = await import(
          "@/lib/utils/formErrorMapper"
        );
        const result = applyValidationErrorsToForm(e, setCreateError as any);
        const msgs = Array.isArray(result) ? result : result.messages;
        if (msgs && msgs.length > 0)
          msgs.forEach((m: string) => toast.error(m));
        else
          toast.error(
            e?.message ?? t("guards.new.errors.error_create_profile"),
          );
      } catch (ex) {
        toast.error(e?.message ?? t("guards.new.errors.error_create_profile"));
      }
    } finally {
      setUploading(false);
    }
  };

  // Data helpers for combobox
  const clientOptions = clients.map((c) => ({
    value: c.id,
    // "Cliente" = la empresa, no el representante legal.
    label: clientDisplayName(c, c.name),
  }));
  const siteOptions = stations.map((s: StationLike) => ({
    value: s.id,
    label: s.name,
  }));

  // watch create form clientId to filter station options
  const createClientId = useWatch({ control: createCtrl, name: "clientId" });
  const matchesStationClient = (s: StationLike, clientId?: string) => {
    if (!clientId) return false;
    if (s.clientId && String(s.clientId) === String(clientId)) return true;
    if (s.clientAccountId && String(s.clientAccountId) === String(clientId))
      return true;
    if (s.client && s.client.id && String(s.client.id) === String(clientId))
      return true;
    if (
      s.clientAccount &&
      s.clientAccount.id &&
      String(s.clientAccount.id) === String(clientId)
    )
      return true;
    return false;
  };

  // Normalize createClientId which may be a string or an array of strings from the form
  const createClientIds: string[] = Array.isArray(createClientId)
    ? (createClientId as string[])
    : createClientId
      ? [createClientId as string]
      : [];
  const createStationOptions = createClientIds.length
    ? stations
        .filter((s: StationLike) =>
          createClientIds.some((cid) => matchesStationClient(s, cid)),
        )
        .map((s: StationLike) => ({ value: s.id, label: s.name }))
    : stations.map((s: StationLike) => ({ value: s.id, label: s.name }));

  const translateInviteByLabel = (val: string) =>
    val === "SMS"
      ? t("guards.new.form.contactSms")
      : t("guards.new.form.contactEmail");

  return (
    <AppLayout>
      <PageContainer width="wide">

        <PageHeader
          icon={<UserPlus />}
          title={t("guards.new.title")}
          subtitle={t("guards.new.invite.description")}
        />

        <GuardTabsHeader
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabKey)}
        >
          {/* ------- TAB 1 ------- */}
          {activeTab === "invite" && (
            <>
              <p className="mt-8 max-w-5xl text-sm text-muted-foreground">
                {t("guards.new.invite.description")}
              </p>
              <Form {...inviteForm}>
                <form
                  className="mt-6 grid gap-8"
                  onSubmit={submitInvite(onSubmitInvite)}
                >
                  {inviteFields.map((f, idx) => {
                    const inviteBy =
                      inviteEntries?.[idx]?.inviteBy ?? "Correo Electrónico";
                    const contactLabel = translateInviteByLabel(inviteBy);
                    const contactPh =
                      inviteBy === "SMS"
                        ? t("guards.new.form.contactPhSms")
                        : t("guards.new.form.contactPhEmail");

                    return (
                      <FormBlock key={f.id}>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                          <FormField
                            control={inviteCtrl}
                            name={`entries.${idx}.firstName`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  {t("guards.new.form.firstName")}
                                </FormLabel>
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
                                <FormLabel>
                                  {t("guards.new.form.lastName")}
                                </FormLabel>
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
                            name={`entries.${idx}.inviteBy`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  {t("guards.new.form.inviteBy")}
                                </FormLabel>
                                <Select
                                  value={field.value}
                                  onValueChange={(v) => {
                                    field.onChange(v);
                                    setInviteValue(
                                      `entries.${idx}.contact`,
                                      "",
                                    );
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue
                                        placeholder={t(
                                          "guards.new.form.selectMethodPlaceholder",
                                        )}
                                      />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {inviteByOptions.map((o) => (
                                      <SelectItem key={o} value={o}>
                                        {translateInviteByLabel(o)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
                          <FormField
                            control={inviteCtrl}
                            name={`entries.${idx}.contact`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{contactLabel}</FormLabel>
                                <FormControl>
                                  <Input placeholder={contactPh} {...field} />
                                </FormControl>
                                {inviteBy === "SMS" && (
                                  <FormDescription>
                                    {t("guards.new.form.contactPhSms")}
                                  </FormDescription>
                                )}
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {/* Client + station selectors removed: guards are created
                              independently and assigned to a station later (everything
                              is station-based). Use "Asignar a estación" on the guards
                              list to assign. */}
                        </div>

                        <div className="mt-4 flex items-center gap-3">
                          <AddBlockButton
                            onClick={() =>
                              inviteAppend(blankInviteEntry(inviteBy))
                            }
                          />
                          {inviteFields.length > 1 && (
                            <RemoveBlockButton
                              onConfirm={() => inviteRemove(idx)}
                            />
                          )}
                        </div>
                      </FormBlock>
                    );
                  })}

                  <SubmitBar
                    primaryLabel={t("guards.new.form.send")}
                    loading={inviteState.isSubmitting}
                    onPrimary={submitInvite(onSubmitInvite)}
                    primaryClassName="cg-btn-brand rounded-full px-6 py-3 font-medium transition-colors disabled:opacity-50"
                  />
                </form>
              </Form>
            </>
          )}

          {/* ------- TAB 2 ------- */}
          {activeTab === "join_code" && (
            <>
              <p className="mt-8 max-w-5xl text-sm text-muted-foreground">
                {t("guards.new.join_code.description")}
              </p>

              {/* OTP + copiar/regenerar */}
              <div className="mt-6 flex items-center justify-center gap-3">
                <InputOTP
                  maxLength={6}
                  value={codeValue}
                  onChange={(v) => setJoinValue("code", v)}
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(codeValue);
                    toast.success(t("guards.new.join_code.copied"));
                  }}
                >
                  {t("guards.new.actions.copy")}
                </Button>
                <Button type="button" variant="ghost" onClick={regenCode}>
                  <RefreshCcw className="h-5 w-5" />
                </Button>
              </div>

              <Form {...joinForm}>
                <form
                  className="mt-8 grid gap-8 border-t pt-8"
                  onSubmit={submitJoin(onSubmitJoin)}
                >
                  {joinFields.map((f, idx) => (
                    <FormBlock key={f.id}>
                      <FormField
                        control={joinCtrl}
                        name={`entries.${idx}.phone`}
                        render={({ field }) => (
                          <FormItem className="max-w-2xl">
                            <FormLabel>
                              {t("guards.new.form.contactSms")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t("guards.new.form.contactPhSms")}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              {t("guards.new.form.contactPhSms")}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="mt-4 flex items-center gap-3">
                        <AddBlockButton
                          onClick={() => joinAppend(blankJoinEntry())}
                        />
                        {joinFields.length > 1 && (
                          <RemoveBlockButton
                            onConfirm={() => joinRemove(idx)}
                          />
                        )}
                      </div>
                    </FormBlock>
                  ))}

                  <SubmitBar
                    primaryLabel={t("guards.new.form.send")}
                    loading={joinState.isSubmitting}
                    onPrimary={submitJoin(onSubmitJoin)}
                    primaryClassName="cg-btn-brand rounded-full px-6 py-3 font-medium transition-colors disabled:opacity-50"
                  />
                </form>
              </Form>
            </>
          )}

          {/* ------- TAB 3 ------- */}
          {activeTab === "invite_link" && (
            <>
              <p className="mt-8 text-center text-sm text-muted-foreground">
                {t("guards.new.link.description")}
              </p>

              <div className="mt-4 flex items-center justify-center">
                <Copyable text={linkValue} />
              </div>

              <Form {...linkForm}>
                <form
                  className="mt-8 grid gap-8 border-t pt-8"
                  onSubmit={submitLink(onSubmitLink)}
                >
                  {linkFields.map((f, idx) => (
                    <FormBlock key={f.id}>
                      <FormField
                        control={linkCtrl}
                        name={`entries.${idx}.phone`}
                        render={({ field }) => (
                          <FormItem className="max-w-2xl">
                            <FormLabel>
                              {t("guards.new.form.contactSms")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t("guards.new.form.contactPhSms")}
                                {...field}
                              />
                            </FormControl>
                            <FormDescription>
                              {t("guards.new.form.contactPhSms")}
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="mt-4 flex items-center gap-3">
                        <AddBlockButton
                          onClick={() => linkAppend(blankLinkEntry())}
                        />
                        {linkFields.length > 1 && (
                          <RemoveBlockButton
                            onConfirm={() => linkRemove(idx)}
                          />
                        )}
                      </div>
                    </FormBlock>
                  ))}

                  <SubmitBar
                    primaryLabel={t("guards.new.form.send")}
                    loading={linkState.isSubmitting}
                    onPrimary={submitLink(onSubmitLink)}
                    primaryClassName="cg-btn-brand rounded-full px-6 py-3 font-medium transition-colors disabled:opacity-50"
                  />
                </form>
              </Form>
            </>
          )}

          {/* ------- TAB 4 ------- */}
          {activeTab === "create_profile" && (
            <>
              <p className="mt-8 max-w-5xl text-sm text-muted-foreground">
                {t("guards.new.create.description")}
              </p>

              {/* El atajo: subir el CV y que rellene lo que se pueda en vez de
                  teclear quince campos. Va ARRIBA del formulario porque es lo
                  primero que hace quien tiene el papel del candidato delante. */}
              <ImportarHojaDeVida
                className="mt-4"
                onDatos={(campos) => {
                  // `shouldDirty` para que el formulario sepa que hay cambios
                  // sin guardar; `shouldValidate` no, porque validar un
                  // formulario a medio rellenar lo llena de rojo antes de que
                  // nadie haya escrito nada.
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
                onArchivo={(archivo) => setHojaDeVida(archivo)}
              />

              <Form {...createForm}>
                <form
                  className="mt-6 space-y-6"
                  onSubmit={submitCreate(onSubmitCreate)}
                >
                  {/* ── Section 1: Personal Information ─────────────────────── */}
                  <Section
                    title={t(
                      "ui.NewSecurityGuard.informacionPersonal",
                      "Información Personal",
                    )}
                    icon={<User />}
                  >
                    {/* Profile photo centred at top */}
                    <div className="mb-6 flex justify-center">
                      <ProfilePhotoCapture
                        value={guardDocs.profilePhoto ?? null}
                        onChange={
                          setDoc("profilePhoto") as (f: File | null) => void
                        }
                        previewUrl={profilePhotoPreviewUrl}
                      />
                    </div>

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
                        name="middleName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("ui.NewSecurityGuardPage.segundoNombre")}
                            </FormLabel>
                            <FormControl>
                              <Input
                                placeholder={t("ui.ExtremoRutaField.opcional", "Opcional")}
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

                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                      <FormField
                        control={createCtrl}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t("ui.NewSecurityGuard.genero", "Género")}{" "}
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value ?? ""}
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
                              {t("ui.NewSecurityGuardPage.tipoDeSangre")}{" "}
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value ?? ""}
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
                              {t("ui.NewSecurityGuardPage.estadoCivil")}{" "}
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value ?? ""}
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
                              <span className="text-destructive">*</span>
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
                                placeholder={t("ui.NewSecurityGuard.ejQuitoEcuador", "Ej. Quito, Ecuador")}
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
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value ?? ""}
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

                  {/* ── Section 2: Contact & Address ─────────────────────────── */}
                  <Section
                    title={t("ui.NewSecurityGuardPage.contactoYDomicilio")}
                    icon={<Phone />}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                              <span className="text-destructive">*</span>
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder={t(
                                  "ui.NewSecurityGuardPage.vigilanteEjemploCom",
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

                    <div className="mt-4">
                      <FormField
                        control={createCtrl}
                        name="homeAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("ui.NewSecurityGuard.domicilio", "Domicilio")}</FormLabel>
                            <FormControl>
                              <AddressAutocomplete
                                defaultValue={field.value || ""}
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
                                showMap={true}
                                placeholder={t(
                                  "ui.NewSecurityGuard.buscarDireccionDelVigilante",
                                  "Buscar dirección del vigilante...",
                                )}
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

                  {/* ── Section 3: Identification ─────────────────────────────── */}
                  <Section
                    title={t(
                      "ui.NewSecurityGuard.identificacionYContrato",
                      "Identificación y Contrato",
                    )}
                    icon={<FileCheck />}
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
                          label={t(
                            "ui.NewSecurityGuard.imagenDeIdentificacion",
                            "Imagen de Identificación",
                          )}
                          description={t(
                            "ui.NewSecurityGuardPage.fotoOEscaneoDelDocumento",
                          )}
                          value={guardDocs.identificationImage ?? null}
                          onChange={
                            setDoc("identificationImage") as (f: any) => void
                          }
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
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
                              {t("ui.NewSecurityGuard.credencialesLicencias", "Credenciales / Licencias")}
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

                  {/* ── Section 4: Certifications ─────────────────────────────── */}
                  <Section
                    title={t(
                      "ui.NewSecurityGuard.certificacionesYDocumentos",
                      "Certificaciones y Documentos Profesionales",
                    )}
                    icon={<ShieldCheck />}
                  >
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      <DocumentUpload
                        label={t("ui.NewSecurityGuard.certificadoAfis", "Certificado AFIS")}
                        description={t(
                          "ui.NewSecurityGuardPage.sistemaAutomatizadoDeIdentificacionDe",
                        )}
                        value={guardDocs.afisCertificate ?? null}
                        onChange={setDoc("afisCertificate") as (f: any) => void}
                      />
                      <DocumentUpload
                        label={t(
                          "ui.NewSecurityGuard.certificadoMedico",
                          "Certificado Médico",
                        )}
                        description={t(
                          "ui.NewSecurityGuardPage.certificadoMedicoVigente",
                        )}
                        value={guardDocs.medicalCertificate ?? null}
                        onChange={
                          setDoc("medicalCertificate") as (f: any) => void
                        }
                      />
                      <DocumentUpload
                        label={t(
                          "ui.NewSecurityGuard.certificadoPsicologico",
                          "Certificado Psicológico",
                        )}
                        description={t(
                          "ui.NewSecurityGuardPage.evaluacionPsicologicaActualizada",
                        )}
                        value={guardDocs.psychologicalCertificate ?? null}
                        onChange={
                          setDoc("psychologicalCertificate") as (f: any) => void
                        }
                      />
                      <DocumentUpload
                        label={t("ui.NewSecurityGuard.credencial", "Credencial")}
                        description={t(
                          "ui.NewSecurityGuardPage.documentoDeCredencialProfesional",
                          "Documento de credencial profesional",
                        )}
                        value={guardDocs.credentialDocument ?? null}
                        onChange={
                          setDoc("credentialDocument") as (f: any) => void
                        }
                      />
                      <DocumentUpload
                        label={t(
                          "ui.NewSecurityGuard.certificacionNivel1",
                          "Certificación Nivel 1",
                        )}
                        description={t(
                          "ui.NewSecurityGuardPage.certificacionDeVigilanteNivel1",
                        )}
                        value={guardDocs.certificationLevel1 ?? null}
                        onChange={
                          setDoc("certificationLevel1") as (f: any) => void
                        }
                      />
                      <DocumentUpload
                        label={t(
                          "ui.NewSecurityGuard.certificacionNivel2",
                          "Certificación Nivel 2",
                        )}
                        description={t(
                          "ui.NewSecurityGuardPage.certificacionDeVigilanteNivel2",
                        )}
                        value={guardDocs.certificationLevel2 ?? null}
                        onChange={
                          setDoc("certificationLevel2") as (f: any) => void
                        }
                      />
                      <DocumentUpload
                        label={t(
                          "ui.NewSecurityGuard.certificadoViolenciaIntrafamiliar",
                          "Certificado Violencia Intrafamiliar",
                        )}
                        description={t(
                          "ui.NewSecurityGuardPage.certificadoDeNoAntecedentesDeViolenciaFamiliar",
                          "Certificado de no antecedentes de violencia familiar",
                        )}
                        value={guardDocs.familyViolenceCertificate ?? null}
                        onChange={
                          setDoc("familyViolenceCertificate") as (
                            f: any,
                          ) => void
                        }
                      />
                    </div>
                  </Section>

                  {/* ── Submit Bar ───────────────────────────────────────────── */}
                  <div className="glass flex items-center justify-end gap-3 px-6 py-4">
                    {uploading && (
                      <span
                        className="flex items-center gap-2 text-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("ui.NewSecurityGuard.subiendoDocumentos", "Subiendo documentos…")}
                      </span>
                    )}
                    <SubmitBar
                      primaryLabel={t("guards.new.form.create_and_send")}
                      loading={createState.isSubmitting || uploading}
                      onPrimary={() => {
                        createIntentRef.current = "create_send";
                        submitCreate(onSubmitCreate)();
                      }}
                      primaryClassName="cg-btn-brand rounded-full px-6 py-3 font-medium transition-colors disabled:opacity-50"
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
