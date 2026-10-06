import { useEffect, useMemo, useState, useRef } from "react";
import { FIELD_CLS_LG } from "./components/_shared/tab-kit";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { crearEsquemaCliente, type ClientInput } from "@/lib/validators/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { clientService } from "@/lib/api/clientService";
import { categoryService } from "@/lib/api/categoryService";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import {
  taxIdLabelFor,
  taxIdHintFor,
  personIdLabelFor,
  validateTaxNumberForCountry,
  validatePersonIdForCountry,
} from "@/lib/validators/id";
import { usePaisDeLaEmpresa } from "@/hooks/usePaisDeLaEmpresa";
import AddressAutocomplete, {
  AddressComponents,
} from "@/components/maps/AddressAutocomplete";
import { toastOnce } from "@/lib/toastOnce";
import { getTenantCountry } from "@/utils/tenantLocation";
import { COUNTRIES } from "@/lib/data/countries";

import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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

import { PhoneInput } from "@/components/phone/PhoneInput";
import { Input } from "@/components/ui/input";
import {
  CategorySelect,
  CategoryOption,
} from "@/components/categories/CategorySelect";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Info,
  User,
  Mail,
  Phone,
  Tag,
  Globe,
  Building2,
  Upload,
  X,
  Image,
  Loader2,
  UserPlus,
  Trash2,
  MapPin,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Section, Stagger } from "@/components/kit";

export type Category = { id: string; name: string };

export type ClientFormProps = {
  mode: "create" | "edit";
  id?: string;
  categories?: Category[];
  onSaved?: (payload: { id: string; data: ClientInput }) => void;
  /** If true, do not navigate away after successful save; call onSaved instead */
  keepOnSave?: boolean;
  /** Optional cancel handler: when provided, Cancel button will call this instead of navigating */
  onCancel?: () => void;
};

type ClientApiPayload = Omit<ClientInput, "categoryIds"> & {
  categoryIds?: string[] | null;
};

export default function ClientForm({
  mode,
  id,
  categories: initialCategories,
  onSaved,
  keepOnSave = false,
  onCancel,
}: ClientFormProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  // Determine the tenant's phone dial-code prefix from cached country
  const defaultPhonePrefix = useMemo(() => {
    const countryCode = getTenantCountry();
    if (!countryCode) return "";
    const found = COUNTRIES.find((c) => c.code === countryCode.toUpperCase());
    return found ? `+${found.dialCode}` : "";
  }, []);
  // Deduplicate toasts in case of multiple mounts (React StrictMode)
  const shownToasts = useRef<Set<string>>(new Set());
  const showToastOnce = (key: string, message: string) => {
    if (shownToasts.current.has(key)) return;
    shownToasts.current.add(key);
    // Avoid showing error/warning toasts; log instead per UX decision.
    console.warn(message);
  };
  const [redirecting, setRedirecting] = useState(false);
  const [categories, setCategories] = useState<Category[]>(
    initialCategories || [],
  );
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [showAddressAutocomplete, setShowAddressAutocomplete] = useState(true);

  // File upload state for logo and place picture
  type UploadedFile = {
    new?: boolean;
    name: string;
    sizeInBytes?: number;
    privateUrl?: string;
    publicUrl?: string;
    fileToken?: string | null;
    id?: string;
    downloadUrl?: string;
  };
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoExisting, setLogoExisting] = useState<UploadedFile | null>(null);
  const [placePicFile, setPlacePicFile] = useState<File | null>(null);
  const [placePicPreview, setPlacePicPreview] = useState<string | null>(null);
  const [placePicExisting, setPlacePicExisting] = useState<UploadedFile | null>(
    null,
  );

  type FormValues = ClientInput & {
    personType?: "PN" | "PJ";
    documentNumber?: string;
  };

  // El país de la empresa es la vara por defecto: decide qué documento se pide
  // y cómo se llama mientras el cliente no tenga dirección escrita.
  const paisDeLaEmpresa = usePaisDeLaEmpresa();

  const form = useForm<FormValues>({
    resolver: zodResolver(crearEsquemaCliente(paisDeLaEmpresa) as any),
    defaultValues: {
      name: "",
      lastName: "",
      personType: "PN",
      documentNumber: "",
      commercialName: "",
      contractDate: "",
      contractEndDate: "",
      riskLevel: "",
      purchaseOrder: "",
      code: "",
      accountExecutiveId: "",
      legalRepFirstName: "",
      legalRepLastName: "",
      legalRepEmail: "",
      legalRepPhone: "",
      legalRepDocument: "",
      email: "",
      phoneNumber: defaultPhonePrefix,
      address: "",
      addressLine2: "",
      postalCode: "",
      city: "",
      country: "",
      faxNumber: defaultPhonePrefix,
      website: "",
      latitude: "",
      longitude: "",
      active: true,
      categoryIds: [],
    },
  });

  const personType = form.watch("personType") || "PN";
  const esPersonaNatural = personType !== "PJ";

  /* Persona natural: los datos personales SON el contacto del cliente. Se
     copian a email/phoneNumber (que es lo que valida el esquema y lee el
     servidor) y la sección «Contacto» no se enseña: era la misma pregunta
     dos veces. Al cargar un cliente viejo sin personales, se rellenan con
     el contacto que ya tenía. */
  useEffect(() => {
    if (!esPersonaNatural) return;
    const v = form.getValues() as any;

    if (!v.legalRepEmail && v.email)
      form.setValue("legalRepEmail" as any, v.email);
    if (!v.legalRepPhone && v.phoneNumber)
      form.setValue("legalRepPhone" as any, v.phoneNumber);
    const w = form.getValues() as any;

    if (w.legalRepEmail && w.email !== w.legalRepEmail)
      form.setValue("email", w.legalRepEmail);
    if (w.legalRepPhone && w.phoneNumber !== w.legalRepPhone)
      form.setValue("phoneNumber", w.legalRepPhone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esPersonaNatural]);

  // ── El país con el que se mide la identificación ─────────────────────────
  // El del propio cliente en cuanto lo escribe; hasta entonces, el de la
  // empresa. La dirección va DEBAJO del documento en el formulario, así que
  // sin el segundo el campo se validaría a ciegas justo cuando se rellena.
  const paisDelCliente = (form.watch("country") as string) || paisDeLaEmpresa;

  // Cómo se llama ahí el documento que toca —«NIP», «RFC», «Codice Fiscale»—
  // y un ejemplo de su forma. Si no conocemos el país, la etiqueta genérica
  // traducida: nunca «RUC» por descarte, que es lo que hacía antes.
  const nombreDelDocumento =
    personType === "PJ"
      ? taxIdLabelFor(paisDelCliente)
      : personIdLabelFor(paisDelCliente);
  const etiquetaDocumento = nombreDelDocumento
    ? personType === "PJ"
      ? t("clients.form.taxIdOf", {
          documento: nombreDelDocumento,
          defaultValue: "{{documento}} de la empresa",
        })
      : nombreDelDocumento
    : personType === "PJ"
      ? t("clients.form.taxIdGeneric", "Identificador fiscal de la empresa")
      : t("clients.form.personIdGeneric", "Documento de identidad");
  const ejemploDelDocumento =
    personType === "PJ" ? taxIdHintFor(paisDelCliente) : null;

  /** Comprueba el documento con la regla del país, al salir del campo. */
  const revisarDocumento = (valor: unknown) => {
    const v = (valor ?? "").toString().trim();
    if (!v) return;
    const valido =
      personType === "PJ"
        ? validateTaxNumberForCountry(v, paisDelCliente)
        : validatePersonIdForCountry(v, paisDelCliente);
    if (valido) {
      form.clearErrors("documentNumber");
      return;
    }
    form.setError("documentNumber", {
      type: "manual",
      message: nombreDelDocumento
        ? t("clients.validation.document_invalid_named", {
            documento: nombreDelDocumento,
            defaultValue: "{{documento}} inválido",
          })
        : t("clients.validation.document_invalid", "Identificación inválida"),
    });
  };

  // Additional people who ALSO get access to the client app. PJ: persona
  // encargada (CEO + ops). PN: family/others (hijo, madre…). The PRIMARY access
  // user is the client's own name/email above (representante legal / titular).
  type AccessPerson = {
    name: string;
    email: string;
    phone: string;
    relationship: string;
  };
  const [accessPeople, setAccessPeople] = useState<AccessPerson[]>([]);
  const addAccessPerson = () =>
    setAccessPeople((p) => [
      ...p,
      {
        name: "",
        email: "",
        phone: "",
        relationship:
          personType === "PJ"
            ? t("clients.form.extraAccessDefaultRole", "Persona encargada")
            : "",
      },
    ]);
  const updateAccessPerson = (i: number, patch: Partial<AccessPerson>) =>
    setAccessPeople((p) =>
      p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)),
    );
  const removeAccessPerson = (i: number) =>
    setAccessPeople((p) => p.filter((_, idx) => idx !== i));
  // Watch latitude/longitude so we can force remount of the map when they change
  const watchedLat = form.watch("latitude");
  const watchedLng = form.watch("longitude");
  /* La latitud y la longitud SALIERON de esta clave. Estaban aquí porque
       `AddressAutocomplete` no reaccionaba a los cambios de coordenada, así que
       se le forzaba a remontar. Ya sí reacciona (mueve la cámara, que es
       gratis), y remontar costaba una CARGA FACTURABLE de Google Maps por cada
       arrastre del pin: 3-5 por dirección en vez de 1. Además reseteaba el mapa
       a media caricia y filtraba memoria. */
  const addressMapKey = `${mode}_${id || ""}`;
  // Función para cargar Sectores del módulo clientAccount
  const loadCategories = async () => {
    setLoadingCategories(true);
    try {
      const response = await categoryService.list({
        filter: { module: "clientAccount" }, // Filtrar por el módulo correcto
        limit: 1000, // Ajusta según necesites
        offset: 0,
      });

      // Extraer el array de Sectores de la respuesta
      const categoryList = response?.rows || [];
      setCategories(categoryList);
    } catch (e) {
      console.error("Error loading categories:", e);
      console.error(
        t("categoriesnotloaded", "No se pudieron cargar las Sectores"),
      );
    } finally {
      setLoadingCategories(false);
    }
  };

  // Cargar Sectores al montar el componente
  useEffect(() => {
    loadCategories();
  }, []);

  // Cargar datos del cliente en modo edición
  useEffect(() => {
    if (mode === "edit" && id) {
      let mounted = true;
      (async () => {
        try {
          const data = await clientService.getClient(id);
          if (!mounted) return;
          const initial: FormValues = {
            name: data.name ?? "",
            lastName:
              data.lastName && data.lastName !== "undefined"
                ? data.lastName
                : "",
            personType: data?.personType ?? "PN",
            documentNumber: data?.documentNumber ?? "",
            commercialName: data?.commercialName ?? "",
            contractDate: data?.contractDate
              ? String(data.contractDate).slice(0, 10)
              : "",
            contractEndDate: data?.contractEndDate
              ? String(data.contractEndDate).slice(0, 10)
              : "",
            riskLevel: data?.riskLevel ?? "",
            purchaseOrder: data?.purchaseOrder ?? "",
            code: data?.code ?? "",
            accountExecutiveId: data?.accountExecutiveId ?? "",
            legalRepFirstName: data?.legalRepFirstName ?? "",
            legalRepLastName: data?.legalRepLastName ?? "",
            legalRepEmail: data?.legalRepEmail ?? "",
            legalRepPhone: data?.legalRepPhone ?? "",
            legalRepDocument: data?.legalRepDocument ?? "",
            email: data.email ?? "",
            phoneNumber: data.phoneNumber ?? "",
            address: data.address ?? "",
            addressLine2: data.addressLine2 ?? "",
            postalCode: data.postalCode ?? "",
            city: data.city ?? "",
            country: data.country ?? "",
            faxNumber: data.faxNumber ?? "",
            website: data.website ?? "",
            latitude:
              data?.latitude !== undefined && data?.latitude !== null
                ? String(data.latitude)
                : "",
            longitude:
              data?.longitude !== undefined && data?.longitude !== null
                ? String(data.longitude)
                : "",
            active: data.active ?? true,
            categoryIds: data.categoryIds ?? [],
          } as FormValues;

          // Load existing file objects for logo and place picture
          const logoArr = (data as any).logoUrl;
          if (Array.isArray(logoArr) && logoArr.length > 0) {
            const f = logoArr[0];
            setLogoExisting(f);
            setLogoPreview(f.downloadUrl || f.publicUrl || null);
          }
          const picArr = (data as any).placePictureUrl;
          if (Array.isArray(picArr) && picArr.length > 0) {
            const f = picArr[0];
            setPlacePicExisting(f);
            setPlacePicPreview(f.downloadUrl || f.publicUrl || null);
          }

          // store initial values to compute diffs on submit
          initialDataRef.current = initial;

          form.reset(initial);
        } catch (e) {
          if (!mounted) return;
          console.error(e);
          if (!redirecting) {
            setRedirecting(true);
            showToastOnce(
              "clients.generalInfo.notfoundclient",
              t(
                "clients.generalInfo.notfoundclient",
                "Cliente no encontrado o error al cargar los datos.",
              ),
            );
            navigate("/clients", { replace: true });
          }
        }
      })();
      return () => {
        mounted = false;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, id]);

  // Keep a ref with the initial data loaded in edit mode to compute diffs
  const initialDataRef = useRef<FormValues | null>(null);

  // Revoke any outstanding blob: preview URLs on unmount to avoid leaking them.
  // Track latest preview values via refs so the unmount cleanup sees current ones.
  const logoPreviewRef = useRef<string | null>(null);
  const placePicPreviewRef = useRef<string | null>(null);
  logoPreviewRef.current = logoPreview;
  placePicPreviewRef.current = placePicPreview;
  useEffect(() => {
    return () => {
      if (
        logoPreviewRef.current &&
        logoPreviewRef.current.startsWith("blob:")
      ) {
        URL.revokeObjectURL(logoPreviewRef.current);
      }
      if (
        placePicPreviewRef.current &&
        placePicPreviewRef.current.startsWith("blob:")
      ) {
        URL.revokeObjectURL(placePicPreviewRef.current);
      }
    };
  }, []);

  async function onSubmit(values: FormValues) {
    // Crear payload solo con los campos que el backend actual soporta
    // En modo edición enviaremos únicamente los campos modificados (diff)
    const basePayload: any = {
      name: values.name,
      email: values.email,
      phoneNumber: values.phoneNumber,
      address: values.address,
      categoryIds: Array.isArray(values.categoryIds)
        ? values.categoryIds
        : null,
    };

    // Agregar campos opcionales al basePayload para comparación
    if (values.lastName !== undefined) basePayload.lastName = values.lastName;
    if (values.personType !== undefined)
      basePayload.personType = values.personType;
    if (values.documentNumber !== undefined)
      basePayload.documentNumber = values.documentNumber;
    if (values.commercialName !== undefined)
      basePayload.commercialName = values.commercialName || null;
    if (values.contractDate !== undefined)
      basePayload.contractDate = values.contractDate || null;
    if (values.contractEndDate !== undefined)
      basePayload.contractEndDate = values.contractEndDate || null;
    if (values.purchaseOrder !== undefined)
      basePayload.purchaseOrder =
        String(values.purchaseOrder || "").trim() || null;
    if (values.code !== undefined) basePayload.code = values.code || null;
    // The legal rep's name IS the top Nombre/Apellido — mirror them so the
    // legalRep* columns stay consistent (no duplicate inputs).
    basePayload.legalRepFirstName = values.name || null;
    basePayload.legalRepLastName = values.lastName || null;
    if (values.legalRepEmail !== undefined)
      basePayload.legalRepEmail = values.legalRepEmail || null;
    if (values.legalRepPhone !== undefined)
      basePayload.legalRepPhone = values.legalRepPhone || null;
    // Persona natural: the rep's cédula IS the client documentNumber; persona
    // jurídica has a separate rep cédula field.
    basePayload.legalRepDocument =
      (values.personType === "PJ"
        ? values.legalRepDocument
        : values.documentNumber) || null;
    if (values.addressLine2 !== undefined)
      basePayload.addressLine2 = values.addressLine2;
    if (values.postalCode !== undefined)
      basePayload.postalCode = values.postalCode;
    if (values.city !== undefined) basePayload.city = values.city;
    if (values.country !== undefined) basePayload.country = values.country;
    if (values.faxNumber !== undefined)
      basePayload.faxNumber = values.faxNumber;
    if (values.website !== undefined && String(values.website).trim() !== "")
      basePayload.website = values.website;
    if (values.latitude !== undefined) {
      const rawLat = values.latitude;
      basePayload.latitude =
        rawLat === "" || rawLat === null
          ? null
          : Number.parseFloat(String(rawLat));
    }
    if (values.longitude !== undefined) {
      const rawLng = values.longitude;
      basePayload.longitude =
        rawLng === "" || rawLng === null
          ? null
          : Number.parseFloat(String(rawLng));
    }
    if (values.active !== undefined) basePayload.active = values.active;

    // Handle file uploads before saving
    try {
      // Logo
      if (logoFile) {
        const fileObj = await clientService.uploadFile(
          logoFile,
          "clientAccountLogoUrl",
        );
        basePayload.logoUrl = [fileObj];
      } else if (logoExisting) {
        basePayload.logoUrl = [logoExisting];
      } else {
        basePayload.logoUrl = [];
      }

      // Place picture
      if (placePicFile) {
        const fileObj = await clientService.uploadFile(
          placePicFile,
          "clientAccountPlacePictureUrl",
        );
        basePayload.placePictureUrl = [fileObj];
      } else if (placePicExisting) {
        basePayload.placePictureUrl = [placePicExisting];
      } else {
        basePayload.placePictureUrl = [];
      }
    } catch (uploadErr: any) {
      toast.error(
        t("ui.ClientForm.errorAlSubirImagen", {
          defaultValue: "Error al subir imagen: {{msg}}",
          msg:
            uploadErr?.message ||
            t("adminOfficeUsers.newUser.errors.unknown", "Error desconocido"),
        }),
      );
      return;
    }

    try {
      if (mode === "create") {
        // Extra app-access people (persona encargada / family). Each valid
        // one (name + email) is provisioned as a customer user linked to
        // this client. Only on create — edit manages access elsewhere.
        const additionalContacts = accessPeople
          .filter((a) => a.name.trim() && a.email.trim())
          .map((a) => ({
            name: a.name.trim(),
            email: a.email.trim(),
            phone: a.phone.trim() || null,
            relationship: a.relationship.trim() || null,
          }));
        if (additionalContacts.length)
          (basePayload as any).additionalContacts = additionalContacts;
        const data = await clientService.createClient(
          basePayload as ClientInput,
        );
        // El alta crea TAMBIÉN la primera sede del cliente, con estos
        // mismos datos. Lo que no crea es su operación —qué servicio se
        // presta, con qué equipamiento y capacitación— porque aquí no se
        // pregunta. Se dice ahora, que es cuando la persona todavía está
        // en contexto, y no cuando ya montó puestos encima.
        toast.success(
          t("clients.clientCreated") || "Cliente creado exitosamente",
          {
            description: t("clients.clientCreatedSiteHint", {
              defaultValue:
                "Su primera sede ya tiene estos datos. Sigue: qué servicio se presta, los puestos y quién los cubre.",
            }) as string,
            duration: 7000,
          },
        );
        onSaved?.({ id: data.id, data: values as unknown as ClientInput });
        form.reset();
        if (!keepOnSave) {
          // UN SOLO RECORRIDO. El alta no termina en la lista: sigue en la sede
          // que el servidor acaba de crear con estos mismos datos, en el paso
          // que falta (el tipo de servicio). Si la sede no se creó, a la ficha
          // del cliente, cuyo aviso de puesta en marcha dirá qué falta.
          let destino = `/clients/${data.id}/overview`;

          try {
            const op = await clientService.getOperation(data.id);
            const sede = op.sites?.[0];

            if (sede?.id)
              destino = `/post-sites/${sede.id}/edit?step=1&puesta=1`;
          } catch {
            /* a la ficha */
          }
          navigate(destino);
        }
      } else if (mode === "edit" && id) {
        // Compute diff against initially loaded data so we only PATCH changed fields
        const initial = initialDataRef.current ?? ({} as ClientInput);
        const changed: any = {};
        const keys = Object.keys(basePayload) as Array<keyof ClientInput>;
        for (const k of keys) {
          const cur = (basePayload as any)[k];
          const init = (initial as any)[k];
          // Always include file fields (they use array comparison)
          if (
            (k as string) === "logoUrl" ||
            (k as string) === "placePictureUrl"
          ) {
            changed[k as string] = cur;
            continue;
          }
          // Normalize arrays and primitives for comparison
          const curVal = Array.isArray(cur)
            ? JSON.stringify(cur)
            : cur === undefined
              ? null
              : String(cur);
          const initVal = Array.isArray(init)
            ? JSON.stringify(init)
            : init === undefined
              ? null
              : String(init);
          if (curVal !== initVal) {
            changed[k as string] = Array.isArray((basePayload as any)[k])
              ? (basePayload as any)[k]
              : (basePayload as any)[k];
          }
        }

        if (Object.keys(changed).length === 0) {
          toast.success(t("clients.noChanges", "No hubo cambios para guardar"));
          return;
        }

        const response = await clientService.updateClient(
          id,
          changed as ClientInput,
        );
        toast.success(
          t("clients.clientUpdated") || "Cliente actualizado exitosamente",
        );
        onSaved?.({ id, data: values as unknown as ClientInput });
        if (!keepOnSave) navigate("/clients");
      }
    } catch (e: any) {
      try {
        console.error("[ClientForm.onSubmit] save error:", e);
      } catch (err) {}

      // Normalize backend error shapes
      const respData = e?.response?.data ?? e?.details ?? e;
      const message =
        respData?.message ||
        e?.message ||
        t("ui.ClientForm.errorAlGuardar", "Error al guardar");

      // backend may populate errors.existingId and also include email/phoneNumber
      const existingId =
        respData?.errors?.existingId ||
        respData?.existingId ||
        (respData && respData.errors && respData.errors.existingId) ||
        null;

      const duplicateFields = [] as string[];
      try {
        if (
          respData?.errors?.email ||
          respData?.email ||
          (respData?.errors && respData.errors.email)
        )
          duplicateFields.push("email");
        if (
          respData?.errors?.phoneNumber ||
          respData?.phoneNumber ||
          (respData?.errors && respData.errors.phoneNumber)
        )
          duplicateFields.push("phoneNumber");
      } catch (err) {}

      // Show a clearer message mentioning duplicate fields when available
      if (existingId && duplicateFields.length > 0) {
        const fieldLabels = duplicateFields
          .map((f) => t(`clients.form.${f}`, f))
          .join(", ");
        toast.error(
          `${message} — ${t("clients.duplicateFound", { fields: fieldLabels })}`,
        );
      } else {
        toast.error(message);
      }

      if (existingId) {
        // Navigate the user to the existing conflicting client (overview) so they can inspect/merge
        try {
          navigate(`/clients/${existingId}/overview`);
        } catch (navErr) {
          // ignore navigation errors
        }
      }
    }
  }

  const cats: CategoryOption[] = useMemo(() => {
    if (!categories || !Array.isArray(categories)) return [];
    return categories.map((c) => ({ id: c.id, name: c.name }));
  }, [categories]);

  const handleCategoryCreated = () => {
    // Recargar las Sectores sin recargar toda la página
    loadCategories();
  };

  return (
    <div className="space-y-5">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <Stagger className="space-y-5">
            {/* ── Section 1: Tipo de cliente + Representante legal ──── */}
            <Section
              icon={<User />}
              title={t("clients.form.legalRep", "Representante legal")}
              contentClassName="space-y-4"
            >
              {/* Tipo de cliente arriba */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField<ClientInput>
                  control={form.control}
                  name={"personType" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.clientType", "Tipo de cliente")}
                      </FormLabel>
                      <FormControl>
                        <Select
                          value={String(field.value || "PN")}
                          onValueChange={(v) => field.onChange(v)}
                        >
                          <SelectTrigger className="cg-input cg-focus h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {/* El nombre del documento sale del país: «Persona natural
                                                            (Cédula)» en Quito, «(PESEL)» en Varsovia, y sin paréntesis
                                                            donde no lo sepamos. */}
                            <SelectItem value="PN">
                              {personIdLabelFor(paisDelCliente)
                                ? t("clients.form.personNaturalNamed", {
                                    documento: personIdLabelFor(paisDelCliente),
                                    defaultValue:
                                      "Persona natural ({{documento}})",
                                  })
                                : t(
                                    "clients.form.personNaturalGeneric",
                                    "Persona natural",
                                  )}
                            </SelectItem>
                            <SelectItem value="PJ">
                              {taxIdLabelFor(paisDelCliente)
                                ? t("clients.form.personJuridicaNamed", {
                                    documento: taxIdLabelFor(paisDelCliente),
                                    defaultValue:
                                      "Persona jurídica ({{documento}})",
                                  })
                                : t(
                                    "clients.form.personJuridicaGeneric",
                                    "Empresa",
                                  )}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField<ClientInput>
                  control={form.control}
                  name={"documentNumber" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {etiquetaDocumento}{" "}
                        <span className="brand-text">*</span>
                      </FormLabel>
                      <FormControl>
                        <input
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          placeholder={ejemploDelDocumento || undefined}
                          /* Media docena de países llevan LETRAS en el identificador
                                                       —RFC mexicano, CIF español, codice fiscale, IVA europeo con
                                                       prefijo— y aquí se borraban según se tecleaban: el campo
                                                       hacía `replace(/\D/g,'')`. Ahora sólo se limpia lo que
                                                       nadie quiere (símbolos raros) y se respeta el resto. */
                          maxLength={30}
                          onChange={(e) =>
                            field.onChange(
                              (e.target.value || "")
                                .replace(/[^\p{L}\p{N}\-./ ]/gu, "")
                                .toUpperCase(),
                            )
                          }
                          onBlur={() => revisarDocumento(field.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <p className="flex items-center gap-2 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <UserRound className="h-3.5 w-3.5 brand-text" />{" "}
                {t("clients.legalRep.title", "Datos del representante legal")}
              </p>

              {/* Representante legal: nombre + apellido (requeridos) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField<ClientInput>
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.name", "Nombre")}
                      </FormLabel>
                      <FormControl>
                        <input
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          onChange={(e) => {
                            const noDigits = e.target.value.replace(
                              /[0-9]/g,
                              "",
                            );
                            const capitalized = noDigits
                              .split(" ")
                              .map(
                                (word) =>
                                  word.charAt(0).toUpperCase() +
                                  word.slice(1).toLowerCase(),
                              )
                              .join(" ");
                            field.onChange(capitalized);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField<ClientInput>
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.lastName", "Apellidos")}
                      </FormLabel>
                      <FormControl>
                        <input
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          onChange={(e) => {
                            const noDigits = e.target.value.replace(
                              /[0-9]/g,
                              "",
                            );
                            const capitalized = noDigits
                              .split(" ")
                              .map(
                                (word) =>
                                  word.charAt(0).toUpperCase() +
                                  word.slice(1).toLowerCase(),
                              )
                              .join(" ");
                            field.onChange(capitalized);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Contacto personal del representante (requerido) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField<ClientInput>
                  control={form.control}
                  name={"legalRepPhone" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.legalRep.phone", "Teléfono personal")}
                        {esPersonaNatural && (
                          <>
                            {" "}
                            <span className="brand-text">*</span>
                          </>
                        )}
                      </FormLabel>
                      <FormControl>
                        <input
                          type="tel"
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          onChange={(e) => {
                            field.onChange(e);
                            if (esPersonaNatural)
                              form.setValue("phoneNumber", e.target.value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField<ClientInput>
                  control={form.control}
                  name={"legalRepEmail" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t(
                          "clients.legalRep.email",
                          "Correo electrónico personal",
                        )}
                        {esPersonaNatural && (
                          <>
                            {" "}
                            <span className="brand-text">*</span>
                          </>
                        )}
                      </FormLabel>
                      <FormControl>
                        <input
                          type="email"
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          onChange={(e) => {
                            field.onChange(e);
                            if (esPersonaNatural)
                              form.setValue("email", e.target.value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {personType === "PJ" && (
                  <FormField<ClientInput>
                    control={form.control}
                    name={"legalRepDocument" as any}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                          {personIdLabelFor(paisDelCliente)
                            ? t("clients.legalRep.documentNamed", {
                                documento: personIdLabelFor(paisDelCliente),
                                defaultValue: "{{documento}} del representante",
                              })
                            : t(
                                "clients.legalRep.documentGeneric",
                                "Documento del representante",
                              )}
                        </FormLabel>
                        {/* Sin `inputMode="numeric"` ni el filtro de dígitos: el documento de
                                          una persona lleva letras en media Europa (DNI español, codice
                                          fiscale, Personalausweis) y el teclado numérico del móvil ni
                                          siquiera dejaba escribirlas. */}
                        <FormControl>
                          <input
                            maxLength={30}
                            className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm"
                            {...field}
                            value={
                              typeof field.value === "string" ? field.value : ""
                            }
                            onChange={(e) =>
                              field.onChange(
                                (e.target.value || "")
                                  .replace(/[^\p{L}\p{N}\-./ ]/gu, "")
                                  .toUpperCase(),
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </Section>

            {/* ── Section 2: Business Info ──────────────────────────── */}
            <Section
              icon={<Building2 />}
              title={t("clients.form.businessInfo", "Información de empresa")}
              contentClassName="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField<ClientInput>
                  control={form.control}
                  name={"commercialName" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.commercialName", "Nombre comercial")}
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                          {t("clients.form.optional", "Opcional")}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <input
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                          placeholder={t(
                            "clients.form.commercialNamePlaceholder",
                            "Ej. Empresa Segura S.A.",
                          )}
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          maxLength={200}
                        />
                      </FormControl>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {t(
                          "clients.form.commercialNameHint",
                          "Se usará como nombre del sitio de servicio.",
                        )}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField<ClientInput>
                  control={form.control}
                  name={"contractDate" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.contractDate", "Fecha de contrato")}
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                          {t("clients.form.optional", "Opcional")}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <input
                          type="date"
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField<ClientInput>
                  control={form.control}
                  name={"contractEndDate" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.contractEndDate", "Fin de contrato")}
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                          {t("clients.form.optional", "Opcional")}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <input
                          type="date"
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField<ClientInput>
                  control={form.control}
                  name={"code" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.code", "Código de cliente")}
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                          {t("clients.form.optional", "Opcional")}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <input
                          type="text"
                          placeholder="CLI-0001"
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* «Nivel de riesgo» ya no se pregunta aquí: se pregunta en cada
                    sede (donde se sabe) y el del cliente es el promedio. */}
                <FormField<ClientInput>
                  control={form.control}
                  name={"purchaseOrder" as any}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.purchaseOrder", "Orden de compra")}
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                          {t("clients.form.optional", "Opcional")}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t(
                            "clients.form.purchaseOrderPh",
                            "N° de orden de compra (clientes públicos/estatales)",
                          )}
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                        />
                      </FormControl>
                      <p className="text-[11px] text-muted-foreground">
                        {t(
                          "clients.form.purchaseOrderHint",
                          "Úsalo cuando el cliente sea una entidad pública que contrata por orden de compra.",
                        )}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Logo & Place Picture uploads */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {/* Logo upload */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                    {t("clients.form.logo", "Logo de la empresa")}
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                      {t("clients.form.optional", "Opcional")}
                    </span>
                  </p>
                  <div
                    className="glass-sunken relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 transition-colors"
                    onClick={() =>
                      document.getElementById("logo-upload-input")?.click()
                    }
                  >
                    <input
                      id="logo-upload-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setLogoFile(file);
                        setLogoPreview((prev) => {
                          if (prev && prev.startsWith("blob:"))
                            URL.revokeObjectURL(prev);
                          return URL.createObjectURL(file);
                        });
                        setLogoExisting(null);
                      }}
                    />
                    {logoPreview ? (
                      <>
                        <img
                          src={logoPreview}
                          alt={t("ui.ClientForm.logo", "Logo")}
                          className="max-h-24 max-w-full object-contain rounded"
                        />
                        <button
                          type="button"
                          className="cg-focus absolute right-2 top-2 rounded-full border p-0.5 shadow-sm transition-opacity hover:opacity-70"
                          style={{
                            background: "var(--glass-raised)",
                            borderColor: "var(--hairline)",
                            color: "var(--bad-text)",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setLogoFile(null);
                            setLogoPreview((prev) => {
                              if (prev && prev.startsWith("blob:"))
                                URL.revokeObjectURL(prev);
                              return null;
                            });
                            setLogoExisting(null);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <p className="mt-2 text-xs text-muted-foreground truncate max-w-full">
                          {logoFile?.name ?? logoExisting?.name}
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload className="h-8 w-8 text-muted-foreground/60 mb-2" />
                        <p className="text-xs text-muted-foreground text-center">
                          {t("clients.form.clickToUpload", "Clic para subir")}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          PNG, JPG, WEBP
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Place picture upload */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                    {t("clients.form.placePicture", "Foto del lugar")}
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                      {t("clients.form.optional", "Opcional")}
                    </span>
                  </p>
                  <div
                    className="glass-sunken relative flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 transition-colors"
                    onClick={() =>
                      document.getElementById("place-upload-input")?.click()
                    }
                  >
                    <input
                      id="place-upload-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setPlacePicFile(file);
                        setPlacePicPreview((prev) => {
                          if (prev && prev.startsWith("blob:"))
                            URL.revokeObjectURL(prev);
                          return URL.createObjectURL(file);
                        });
                        setPlacePicExisting(null);
                      }}
                    />
                    {placePicPreview ? (
                      <>
                        <img
                          src={placePicPreview}
                          alt={t(
                            "ui.ClientForm.fotoDelLugar",
                            "Foto del lugar",
                          )}
                          className="max-h-24 max-w-full object-contain rounded"
                        />
                        <button
                          type="button"
                          className="cg-focus absolute right-2 top-2 rounded-full border p-0.5 shadow-sm transition-opacity hover:opacity-70"
                          style={{
                            background: "var(--glass-raised)",
                            borderColor: "var(--hairline)",
                            color: "var(--bad-text)",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlacePicFile(null);
                            setPlacePicPreview((prev) => {
                              if (prev && prev.startsWith("blob:"))
                                URL.revokeObjectURL(prev);
                              return null;
                            });
                            setPlacePicExisting(null);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <p className="mt-2 text-xs text-muted-foreground truncate max-w-full">
                          {placePicFile?.name ?? placePicExisting?.name}
                        </p>
                      </>
                    ) : (
                      <>
                        <Image className="h-8 w-8 text-muted-foreground/60 mb-2" />
                        <p className="text-xs text-muted-foreground text-center">
                          {t("clients.form.clickToUpload", "Clic para subir")}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          PNG, JPG, WEBP
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            {/* ── Section 3: Contact ────────────────────────────────── */}
            {/* Sólo para persona jurídica: en persona natural el contacto son
                sus datos personales (arriba) y esto sería la misma pregunta
                dos veces. */}
            {!esPersonaNatural && (
              <Section
                icon={<Mail />}
                title={t("clients.form.contactInfo", "Contacto")}
                contentClassName="space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField<ClientInput>
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                          {t("clients.form.email", "Correo electrónico")}{" "}
                          <span className="brand-text">*</span>
                        </FormLabel>
                        <FormControl>
                          <input
                            type="email"
                            className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                            {...field}
                            value={
                              typeof field.value === "string" ? field.value : ""
                            }
                            maxLength={50}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField<ClientInput>
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                          {t("clients.form.phone", "Teléfono")}{" "}
                          <span className="brand-text">*</span>
                        </FormLabel>
                        <FormControl>
                          <PhoneInput
                            value={
                              typeof field.value === "string" ? field.value : ""
                            }
                            onChange={(val) => {
                              const digitsOnly = val.replace(/[^\d+]/g, "");
                              const match = digitsOnly.match(/^(\+\d+)(\d*)$/);
                              if (match) {
                                const prefix = match[1];
                                const local = match[2].slice(0, 10);
                                field.onChange(prefix + local);
                              } else {
                                field.onChange(val.slice(0, 1 + 3 + 10));
                              }
                            }}
                            maxLocalDigits={10}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </Section>
            )}

            {/* ── Personas con acceso adicionales (optional) ──────────── */}
            {mode === "create" && (
              <Section
                icon={<UserPlus />}
                title={t(
                  "clients.form.extraAccess",
                  "Personas con acceso adicionales",
                )}
                action={
                  <button
                    type="button"
                    onClick={addAccessPerson}
                    className="cg-focus inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
                    style={{
                      borderColor: "var(--brand-line)",
                      color: "var(--brand-text)",
                      background: "var(--brand-wash)",
                    }}
                  >
                    <UserPlus size={13} />{" "}
                    {t("clients.form.addPerson", "Agregar persona")}
                  </button>
                }
                contentClassName="space-y-3"
              >
                <p className="text-xs text-muted-foreground -mt-1">
                  {personType === "PJ"
                    ? t(
                        "clients.form.extraAccessHintCompany",
                        "Opcional. Ej: la persona encargada de la operación. Recibirá acceso a la app además del representante legal.",
                      )
                    : t(
                        "clients.form.extraAccessHintPerson",
                        "Opcional. Otras personas que también tendrán acceso a la app (ej: hijo, cónyuge).",
                      )}
                </p>
                {accessPeople.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    {t(
                      "ui.ClientForm.sinPersonasAdicionalesSoloEl",
                      "Sin personas adicionales. Solo el contacto principal tendrá acceso.",
                    )}
                  </p>
                )}
                {accessPeople.map((p, i) => (
                  <div
                    key={i}
                    className="glass-sunken grid grid-cols-1 gap-2 p-3 sm:grid-cols-12"
                  >
                    <input
                      value={p.name}
                      onChange={(e) =>
                        updateAccessPerson(i, { name: e.target.value })
                      }
                      placeholder={t("ui.ClientForm.nombreCompleto")}
                      className={`${FIELD_CLS_LG} sm:col-span-4`}
                    />
                    <input
                      value={p.email}
                      onChange={(e) =>
                        updateAccessPerson(i, { email: e.target.value })
                      }
                      type="email"
                      placeholder={t("comun.correoReq")}
                      className={`${FIELD_CLS_LG} sm:col-span-4`}
                    />
                    <input
                      value={p.relationship}
                      onChange={(e) =>
                        updateAccessPerson(i, { relationship: e.target.value })
                      }
                      placeholder={
                        personType === "PJ"
                          ? t(
                              "clients.form.extraAccessRole",
                              "Cargo (ej: Encargado)",
                            )
                          : t(
                              "clients.form.extraAccessRelation",
                              "Relación (ej: hijo)",
                            )
                      }
                      className={`${FIELD_CLS_LG} sm:col-span-3`}
                    />
                    <button
                      type="button"
                      onClick={() => removeAccessPerson(i)}
                      className="cg-focus grid place-items-center rounded-lg transition-opacity hover:opacity-70 sm:col-span-1"
                      style={{ color: "var(--bad-text)" }}
                      aria-label={t("clients.form.extraAccessRemove", "Quitar")}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </Section>
            )}

            {/* ── Section 3: Sector ─────────────────────────────────── */}
            <Section
              icon={<Tag />}
              title={t("clients.form.categoryLabel", "Sector de seguridad")}
            >
              <FormField<ClientInput>
                control={form.control}
                name="categoryIds"
                render={({ field }) => {
                  const currentValue: string[] = Array.isArray(field.value)
                    ? field.value
                    : typeof field.value === "string"
                      ? [field.value]
                      : [];
                  return (
                    <FormItem>
                      <div className="flex items-center gap-2 mb-2">
                        <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                          {t(
                            "clients.form.categoryLabel",
                            "Sector de seguridad",
                          )}
                        </FormLabel>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-muted-foreground cursor-help">
                                <Info size={14} />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {t(
                                "clients.form.categoryTooltip",
                                "Selecciona el sector de seguridad asociado al cliente",
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                      <FormControl>
                        <CategorySelect
                          options={cats}
                          value={currentValue}
                          onChange={(v) => field.onChange(v as any)}
                          module="clientAccount"
                          onCategoryCreated={handleCategoryCreated}
                          multiple={true}
                          placeholder={t(
                            "clients.selectCategories",
                            "Selecciona Sectores",
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </Section>

            {/* ── Section 4: Address ────────────────────────────────── */}
            <Section
              icon={<MapPin />}
              title={t("clients.form.addressSearch", "Dirección")}
              action={
                /* Mode toggle pills */
                <div className="glass-sunken flex items-center gap-0.5 p-0.5">
                  <button
                    type="button"
                    onClick={() => setShowAddressAutocomplete(true)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${showAddressAutocomplete ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t("clients.form.switchToAutocomplete", "Búsqueda")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddressAutocomplete(false)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!showAddressAutocomplete ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t("clients.form.switchToManual", "Manual")}
                  </button>
                </div>
              }
              contentClassName="space-y-4"
            >
              {showAddressAutocomplete ? (
                <AddressAutocomplete
                  key={addressMapKey}
                  onAddressSelect={(addressData: AddressComponents) => {
                    const anyAddr = addressData as any;
                    const addrObj =
                      typeof anyAddr.address === "object" && anyAddr.address
                        ? anyAddr.address
                        : {};

                    const latRaw = anyAddr.lat ?? anyAddr.latitude;
                    const lngRaw =
                      anyAddr.lon ?? anyAddr.lng ?? anyAddr.longitude;

                    const addressStr =
                      typeof anyAddr.address === "string"
                        ? anyAddr.address
                        : anyAddr.display_name ||
                          [
                            addrObj.road,
                            addrObj.suburb,
                            addrObj.town,
                            addrObj.village,
                            addrObj.county,
                            addrObj.municipality,
                            addrObj.state,
                            addrObj.postcode,
                            addrObj.country,
                          ]
                            .filter(Boolean)
                            .join(", ") ||
                          "";

                    const cityStr =
                      anyAddr.city ??
                      anyAddr.town ??
                      anyAddr.village ??
                      addrObj.town ??
                      addrObj.city ??
                      addrObj.village ??
                      "";
                    const postal =
                      anyAddr.postcode ??
                      anyAddr.postalCode ??
                      addrObj.postcode ??
                      "";
                    const country = anyAddr.country ?? addrObj.country ?? "";

                    const setOpts = {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: false,
                    } as const;
                    form.setValue("address", addressStr, setOpts);
                    form.setValue("city", cityStr, setOpts);
                    form.setValue("postalCode", postal, setOpts);
                    form.setValue("country", country, setOpts);
                    if (latRaw != null)
                      form.setValue("latitude", String(latRaw), setOpts);
                    if (lngRaw != null)
                      form.setValue("longitude", String(lngRaw), setOpts);
                    try {
                      form.trigger([
                        "latitude",
                        "longitude",
                        "address",
                        "city",
                        "postalCode",
                      ]);
                    } catch (e) {}
                    toastOnce.success(
                      t(
                        "clients.form.addressAutoFilled",
                        "Dirección completada automáticamente",
                      ),
                    );
                  }}
                  defaultValue={form.getValues("address") || ""}
                  placeholder={t(
                    "clients.form.searchAddress",
                    "Buscar dirección...",
                  )}
                  showMap={true}
                  mapHeight="320px"
                  initialLat={
                    watchedLat
                      ? Number.parseFloat(String(watchedLat))
                      : undefined
                  }
                  initialLng={
                    watchedLng
                      ? Number.parseFloat(String(watchedLng))
                      : undefined
                  }
                />
              ) : null}

              {/* Address fields — editable in manual mode, read-only preview in autocomplete mode */}
              <div
                className={`space-y-4 ${showAddressAutocomplete ? "opacity-70 pointer-events-none" : ""}`}
              >
                {/* Address line 1 */}
                <FormField<ClientInput>
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.address", "Dirección")}{" "}
                        <span className="brand-text">*</span>
                      </FormLabel>
                      <FormControl>
                        <input
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          maxLength={100}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Address line 2 */}
                <FormField<ClientInput>
                  control={form.control}
                  name="addressLine2"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                        {t("clients.form.addressLine2", "Dirección (línea 2)")}
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                          {t("clients.form.optional", "Opcional")}
                        </span>
                      </FormLabel>
                      <FormControl>
                        <input
                          className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm"
                          placeholder={t(
                            "clients.form.addressLine2Placeholder",
                            "Piso, oficina, departamento…",
                          )}
                          {...field}
                          value={
                            typeof field.value === "string" ? field.value : ""
                          }
                          maxLength={100}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Postal / City / Country row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField<ClientInput>
                    control={form.control}
                    name="postalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                          {t("clients.form.postalCode", "Código postal")}{" "}
                          <span className="brand-text">*</span>
                        </FormLabel>
                        <FormControl>
                          <input
                            type="text"
                            className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                            {...field}
                            value={String(field.value || "")}
                            maxLength={20}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField<ClientInput>
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                          {t("clients.form.city", "Ciudad")}
                          <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                            {t("clients.form.optional", "Opcional")}
                          </span>
                        </FormLabel>
                        <FormControl>
                          <input
                            className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                            {...field}
                            value={
                              typeof field.value === "string" ? field.value : ""
                            }
                            maxLength={100}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField<ClientInput>
                    control={form.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                          {t("clients.form.country", "País")}
                          <span className="ml-2 text-[10px] font-normal text-muted-foreground normal-case tracking-normal">
                            {t("clients.form.optional", "Opcional")}
                          </span>
                        </FormLabel>
                        <FormControl>
                          <input
                            className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                            {...field}
                            value={
                              typeof field.value === "string" ? field.value : ""
                            }
                            maxLength={100}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Coordinates — collapsible */}
                <details className="group">
                  <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground/70 list-none select-none w-fit">
                    <svg
                      className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                    {t("clients.form.coordinates", "Coordenadas GPS")}
                  </summary>
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField<ClientInput>
                      control={form.control}
                      name="latitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                            {t("clients.form.latitude", "Latitud")}
                          </FormLabel>
                          <FormControl>
                            <input
                              type="text"
                              className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm font-mono disabled:opacity-50"
                              placeholder={t(
                                "ui.ClientForm.rangoLatitud",
                                "-90 a 90",
                              )}
                              {...field}
                              value={String(field.value ?? "")}
                              maxLength={20}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField<ClientInput>
                      control={form.control}
                      name="longitude"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                            {t("clients.form.longitude", "Longitud")}
                          </FormLabel>
                          <FormControl>
                            <input
                              type="text"
                              className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm font-mono disabled:opacity-50"
                              placeholder={t(
                                "ui.ClientForm.rangoLongitud",
                                "-180 a 180",
                              )}
                              {...field}
                              value={String(field.value ?? "")}
                              maxLength={20}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </details>
              </div>
            </Section>
            {/* end address card */}

            {/* ── Section 5: More Info ──────────────────────────────── */}
            <div className="cg-card cg-card-hover overflow-hidden">
              <Accordion type="single" collapsible defaultValue="more">
                <AccordionItem value="more" className="border-0">
                  <AccordionTrigger
                    className="rounded-none border-b px-5 py-3.5 hover:no-underline [&[data-state=closed]]:border-b-0 [&[data-state=open]]:border-b"
                    style={{
                      borderColor: "var(--hairline)",
                      background: "var(--glass-sunken)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-lg border"
                        style={{
                          background: "var(--brand-wash)",
                          borderColor: "var(--brand-line)",
                        }}
                      >
                        <Globe className="h-4 w-4 brand-text" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {t("clients.form.moreInfo", "Más información")}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField<ClientInput>
                        control={form.control}
                        name="faxNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                              {t("clients.form.fax", "Teléfono fijo")}
                            </FormLabel>
                            <FormControl>
                              <PhoneInput
                                value={
                                  typeof field.value === "string"
                                    ? field.value
                                    : ""
                                }
                                onChange={(val) => {
                                  const digitsOnly = val.replace(/[^\d+]/g, "");
                                  const match =
                                    digitsOnly.match(/^(\+\d+)(\d*)$/);
                                  if (match) {
                                    const prefix = match[1];
                                    const local = match[2].slice(0, 10);
                                    field.onChange(prefix + local);
                                  } else {
                                    field.onChange(val.slice(0, 1 + 3 + 10));
                                  }
                                }}
                                maxLocalDigits={10}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField<ClientInput>
                        control={form.control}
                        name="website"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium text-foreground/70 uppercase tracking-wide">
                              {t("clients.form.website", "Sitio web")}
                            </FormLabel>
                            <FormControl>
                              <input
                                className="cg-input cg-focus flex h-10 w-full px-3 py-2 text-sm disabled:opacity-50"
                                placeholder="https://"
                                {...field}
                                value={
                                  typeof field.value === "string"
                                    ? field.value
                                    : ""
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            {/* ── Actions ──────────────────────────────────────────── */}
            <div className="flex justify-end gap-3 pt-1">
              <Button
                type="button"
                disabled={form.formState.isSubmitting}
                onClick={() => (onCancel ? onCancel() : navigate("/clients"))}
                className="cg-btn-glass min-w-28 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("profile.cancel", "Cancelar")}
              </Button>
              <Button
                type="submit"
                variant="brand"
                disabled={form.formState.isSubmitting}
                className="min-w-28 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {form.formState.isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === "create"
                      ? t("clients.creating", "Creando…")
                      : t("clients.saving", "Guardando…")}
                  </span>
                ) : (
                  t("profile.save", "Guardar")
                )}
              </Button>
            </div>
          </Stagger>
        </form>
      </Form>
    </div>
  );
}
