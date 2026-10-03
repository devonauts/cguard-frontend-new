import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  Building2,
  MapPin,
  ClipboardCheck,
  Gift,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Camera,
  Check,
  CalendarClock,
  Edit,
  FileText,
  Map as MapIcon,
  Phone,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  OnboardingTenant,
  TIMEZONE_OPTIONS,
  DEFAULT_TIMEZONE,
  tzFromText,
  trialDaysLeft,
  formatTrialEndDate,
  snoozeKey,
} from "./onboardingUtils";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ApiService } from "@/services/api/apiService";
import { PhoneInput } from "@/components/phone/PhoneInput";
import AddressAutocomplete, {
  AddressComponents,
} from "@/components/maps/AddressAutocomplete";
import { cn } from "@/lib/utils";
import tenantService from "@/services/tenant.service";
import onboardingService from "@/lib/api/onboardingService";
import { invalidateTenantBranding } from "@/lib/tenantBranding";
import {
  validateTaxNumberForCountry,
  validatePhoneForCountry,
  resolveCountryCode,
  digitsOnly,
} from "@/lib/validators/id";
import { Combobox } from "@/components/app/combobox";
import { timezoneOptions } from "@/lib/timezones";
import { cacheTenantTimezone } from "@/utils/tenantLocation";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { agenteGuardado } from "@/lib/agenteDeMarca";
import { paisDeLaEmpresa } from "@/lib/telefonoDeLaEmpresa";
import { paisConocido } from "@/lib/paisDelVisitante";
import {
  bandera,
  listaDePaises,
  nombreDePais,
  terminosFiscales,
  zonaPorCoordenadas,
} from "@/lib/paisDeLaEmpresa";
import { useAuth } from "@/contexts/AuthContext";
import { getCountryCallingCode, type CountryCode } from "libphonenumber-js";

interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: OnboardingTenant | null;
  /** Re-fetch auth profile after a successful save. */
  onRefresh: () => Promise<any>;
  /** Default email to pre-fill (user email at signup). */
  defaultEmail?: string;
  /**
   * Sin salida: ni «Completar más tarde» ni cerrar. Pedido del dueño
   * (2026-10-03): con salida, casi nadie volvía a poner sus datos. Sólo se
   * pide a quien PUEDE guardarlos (ver OnboardingProvider).
   */
  obligatorio?: boolean;
}

interface WizardForm {
  name: string;
  businessTitle: string;
  taxNumber: string;
  phone: string;
  phoneCountry: string;
  email: string;
  address: string;
  addressLine2: string;
  city: string;
  country: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  timezone: string;
  website: string;
}

// Constante de módulo: se evalúa al cargar, antes de que el idioma esté listo.
// Por eso guarda la CLAVE y el texto se traduce donde se pinta.
const STEPS = [
  {
    labelKey: "onboarding.wizard.step.bienvenida",
    label: "Bienvenida",
    subKey: "ui.OnboardingWizard.subBienvenida",
    sub: "Empecemos por tu país.",
    icon: Sparkles,
  },
  {
    labelKey: "onboarding.wizard.step.tuEmpresa",
    label: "Tu empresa",
    subKey: "ui.OnboardingWizard.subTuEmpresa",
    sub: "Así te verán tus vigilantes y tus clientes.",
    icon: Building2,
  },
  {
    labelKey: "onboarding.wizard.step.contacto",
    label: "Contacto",
    subKey: "ui.OnboardingWizard.subContacto",
    sub: "Dónde está tu empresa y cómo contactarla.",
    icon: MapPin,
  },
  {
    labelKey: "onboarding.wizard.step.revisar",
    label: "Revisar",
    subKey: "ui.OnboardingWizard.subRevisar",
    sub: "Comprueba que todo esté bien antes de terminar.",
    icon: ClipboardCheck,
  },
];

const emptyForm: WizardForm = {
  name: "",
  businessTitle: "",
  taxNumber: "",
  phone: "",
  phoneCountry: paisDeLaEmpresa(),
  email: "",
  address: "",
  addressLine2: "",
  city: "",
  country: "",
  postalCode: "",
  latitude: "",
  longitude: "",
  timezone: DEFAULT_TIMEZONE,
  website: "",
};

/**
 * Cómo se llama el documento fiscal donde está la empresa, y qué se le pide.
 *
 * Decirle «RUC / Cédula» a una empresa alemana no es sólo raro: le hace buscar
 * un campo que no tiene. Y el formulario exigía además 13 dígitos numéricos a
 * todo el mundo, así que el paso 2 del asistente no se podía terminar fuera de
 * Ecuador. Para el país que no modelamos, el texto no nombra ningún documento.
 */
function taxFieldTexts(
  country: string | undefined,
  t: (k: string, d?: any) => string,
) {
  switch (resolveCountryCode(country)) {
    case "EC":
      return {
        taxLabel: "RUC",
        taxPlaceholder: t("ui.OnboardingWizard.ruc13Digitos", "13 dígitos"),
        taxHint: t(
          "ui.OnboardingWizard.rucTreceDigitos",
          "El RUC tiene 13 dígitos y la cédula 10.",
        ),
      };
    case "MX":
      return {
        taxLabel: "RFC",
        taxPlaceholder: "ABC123456T1A",
        taxHint: t(
          "ui.OnboardingWizard.rfcInvalido",
          "El RFC son tres o cuatro letras, seis dígitos de fecha y tres de homoclave.",
        ),
      };
    case "CO":
      return {
        taxLabel: "NIT",
        taxPlaceholder: t("ui.OnboardingWizard.nit810", "8 a 10 dígitos"),
        taxHint: t(
          "ui.OnboardingWizard.nitInvalido",
          "El NIT son entre 8 y 10 dígitos, con dígito de verificación opcional.",
        ),
      };
    case "PE":
      return {
        taxLabel: "RUC",
        taxPlaceholder: "20123456789",
        taxHint: t(
          "ui.OnboardingWizard.rucPeruInvalido",
          "El RUC son 11 dígitos y empieza por 10, 15, 17 o 20.",
        ),
      };
    default:
      return {
        taxLabel: t(
          "ui.OnboardingWizard.identificacionFiscal",
          "Identificación fiscal",
        ),
        taxPlaceholder: t(
          "ui.OnboardingWizard.identificacionFiscalEjemplo",
          "Como aparece en el registro de tu empresa",
        ),
        taxHint: t(
          "ui.OnboardingWizard.identificacionInvalida",
          "Escribe entre 5 y 20 letras o números, como aparece en el registro de tu empresa.",
        ),
      };
  }
}

export default function OnboardingWizard({
  open,
  onOpenChange,
  tenant,
  onRefresh,
  defaultEmail,
  obligatorio = false,
}: OnboardingWizardProps) {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuth();
  const idioma = i18n.resolvedLanguage || i18n.language || "es";
  /* El nombre del anfitrión: «C-Guard Pro» en el de la plataforma, el del
     socio en el suyo. Por eso estos textos ya no lo llevan escrito. */
  const { platformName: nombreDeMarca } = useWhiteLabel();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  /* «Empezar con datos de ejemplo»: al terminar, el servidor crea 3 puestos con
     sus vigilantes alrededor de la dirección recién guardada. Se borran solos
     cuando la empresa crea su primer cliente, puesto o vigilante. */
  const [conEjemplo, setConEjemplo] = useState(true);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showManualAddress, setShowManualAddress] = useState(false);
  const [arrastrandoLogo, setArrastrandoLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedFor = useRef<string | null>(null);

  // Hydrate the form from the tenant whenever the wizard opens (once per tenant id).
  useEffect(() => {
    if (!open || !tenant) return;
    const key = tenant.id || "new";

    if (hydratedFor.current === key) return;
    hydratedFor.current = key;

    /* El país se guarda como código ISO («MX»): es lo que leen el teléfono, la
       validación fiscal y el resto del CRM (`resolveCountryCode` acepta las dos
       formas, así que los nombres guardados antes siguen valiendo). Sin país,
       el del visitante: casi siempre acierta y siempre se puede cambiar. */
    const paisInicial =
      resolveCountryCode(tenant.country ?? undefined) ||
      (paisConocido() || "").toUpperCase() ||
      paisDeLaEmpresa();

    setForm({
      name: tenant.name ?? "",
      businessTitle: tenant.businessTitle ?? "",
      taxNumber: tenant.taxNumber ?? "",
      phone: tenant.phone ?? "",
      phoneCountry: paisInicial,
      email: tenant.email ?? defaultEmail ?? "",
      address: tenant.address ?? "",
      addressLine2: tenant.addressLine2 ?? "",
      city: tenant.city ?? "",
      country: paisInicial,
      postalCode: tenant.postalCode ?? "",
      latitude: tenant.latitude != null ? String(tenant.latitude) : "",
      longitude: tenant.longitude != null ? String(tenant.longitude) : "",
      timezone:
        tenant.timezone ||
        zonaPorCoordenadas(tenant.latitude, tenant.longitude) ||
        DEFAULT_TIMEZONE,
      website: tenant.website ?? "",
    });
    setLogoPreview(tenant.logoUrl ?? null);
    setLogoFile(null);
    setLogoError(null);
    /* Se retoma donde se quedó: cada paso se guarda en el servidor al pulsar
       «Continuar» (ver `guardarBorrador`), así que quien sale y vuelve —o
       entra desde otro equipo— cae en el primer paso que le falta. */
    const vacio = (v: any) => v == null || String(v).trim() === "";
    const faltaEmpresa =
      vacio(tenant.name) ||
      vacio(tenant.businessTitle) ||
      vacio(tenant.taxNumber) ||
      (vacio(tenant.logoUrl) && vacio((tenant as any).logoId));
    const faltaContacto =
      vacio(tenant.phone) || vacio(tenant.email) || vacio(tenant.address);

    setStep(
      vacio(tenant.country) ? 0 : faltaEmpresa ? 1 : faltaContacto ? 2 : 3,
    );
  }, [open, tenant, defaultEmail]);

  // Allow re-hydration next time it opens.
  useEffect(() => {
    if (!open) hydratedFor.current = null;
  }, [open]);

  const set = (patch: Partial<WizardForm>) =>
    setForm((s) => ({ ...s, ...patch }));

  const days = trialDaysLeft(tenant?.trialEndsAt);
  const trialEnd = formatTrialEndDate(tenant?.trialEndsAt);

  // ── Per-step validation ──────────────────────────────────────────────────
  // El identificador fiscal se valida contra el país de la empresa. Antes exigía
  // cédula (10) o RUC (13) ecuatorianos a todo el mundo, así que el onboarding se
  // atascaba aquí para cualquier cliente de fuera. Si el país aún no está escrito
  // —vive en un paso posterior— se aplica la regla permisiva, que es la correcta:
  // ante la duda, se acepta; quien decide de verdad es el backend.
  const taxValid = useMemo(
    () =>
      Boolean(form.taxNumber) &&
      validateTaxNumberForCountry(form.taxNumber, form.country),
    [form.taxNumber, form.country],
  );
  const opcionesZona = useMemo(
    () => timezoneOptions(form.timezone),
    [form.timezone],
  );

  const { taxPlaceholder, taxHint } = useMemo(
    () => taxFieldTexts(form.country, t),
    [form.country, t],
  );
  const terminos = useMemo(
    () =>
      terminosFiscales(form.country, idioma, {
        razonSocial: t(
          "ui.OnboardingWizard.nombreLegal",
          "Nombre legal de la empresa",
        ),
        idFiscal: t(
          "ui.OnboardingWizard.identificacionFiscal",
          "Identificación fiscal",
        ),
      }),
    [form.country, idioma, t],
  );
  const paises = useMemo(() => listaDePaises(idioma), [idioma]);
  const opcionesPais = useMemo(
    () =>
      paises.map((p) => ({ value: p.code, label: `${p.bandera} ${p.nombre}` })),
    [paises],
  );

  /** Cambiar de país rehace lo que dependía del anterior. */
  const elegirPais = (code: string) => {
    if (!code || code === form.country) return;
    setForm((f) => ({
      ...f,
      country: code,
      phoneCountry: code,
      // Una dirección de otro país ya no sirve, y con ella sus coordenadas:
      // el mapa vuelve a encuadrar el país nuevo.
      address: "",
      addressLine2: "",
      city: "",
      postalCode: "",
      latitude: "",
      longitude: "",
    }));
  };

  const phoneCountryForValidation = useMemo(() => {
    const d = digitsOnly(form.phone);

    if (d.startsWith("593")) return "EC";

    // Sin país declarado NO se asume Ecuador: eso medía el móvil de cualquier
    // cliente extranjero con la regla ecuatoriana (9 dígitos empezando por 9) y
    // el paso no dejaba avanzar. Sin país, regla permisiva.
    return form.country || form.phoneCountry || undefined;
  }, [form.phone, form.country, form.phoneCountry]);
  const phoneValid = useMemo(
    () =>
      Boolean(form.phone) &&
      validatePhoneForCountry(form.phone, phoneCountryForValidation),
    [form.phone, phoneCountryForValidation],
  );
  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((form.email || "").trim()),
    [form.email],
  );
  const hasLogo = Boolean(logoFile || logoPreview);

  const step2Valid =
    Boolean(form.country) &&
    Boolean(form.name.trim()) &&
    Boolean(form.businessTitle.trim()) &&
    taxValid &&
    hasLogo;
  const step3Valid =
    phoneValid &&
    emailValid &&
    Boolean(form.address.trim()) &&
    Boolean(form.timezone);

  const canAdvance = (s: number) => {
    if (s === 0) return Boolean(form.country);
    if (s === 1) return step2Valid;
    if (s === 2) return step3Valid;

    return true;
  };

  // ── Logo handling ────────────────────────────────────────────────────────
  const handleLogo = (file?: File | null) => {
    if (!file) return;
    const allowed = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/svg+xml",
    ];

    if (!allowed.includes(file.type)) {
      setLogoError(
        t(
          "ui.OnboardingWizard.logoFormato",
          "El logo debe ser PNG, JPG, SVG o WEBP.",
        ),
      );

      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError(
        t("ui.OnboardingWizard.logoPeso", "El logo no debe superar 5MB."),
      );

      return;
    }
    setLogoError(null);
    setLogoFile(file);
    const reader = new FileReader();

    reader.onload = () => setLogoPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  // ── Navigation ───────────────────────────────────────────────────────────
  /* ── BORRADOR EN CADA PASO ────────────────────────────────────────────────
     Pedido del dueño (2026-10-03): lo escrito no se puede perder si la
     persona se va y vuelve. Se guarda EN LA EMPRESA (servidor), no en el
     navegador: cerrar sesión ahora vacía el navegador entero, y un borrador
     local se iría con él. Sólo se envía lo que ya es válido, para que un
     campo a medias no haga fallar el guardado de los demás. */
  const [guardando, setGuardando] = useState(false);
  const [guardadoA, setGuardadoA] = useState<number | null>(null);

  const guardarBorrador = async (paso: number) => {
    if (!tenant?.id) return;
    const datos: Record<string, any> = {};

    if (paso === 0) {
      if (form.country) datos.country = form.country;
    } else if (paso === 1) {
      if (form.name.trim()) datos.name = form.name.trim();
      if (form.businessTitle.trim())
        datos.businessTitle = form.businessTitle.trim();
      if (taxValid) datos.taxNumber = form.taxNumber.trim();
    } else if (paso === 2) {
      if (phoneValid) datos.phone = form.phone;
      if (emailValid) datos.email = form.email.trim();
      if (form.address.trim()) {
        datos.address = form.address.trim();
        datos.city = form.city || undefined;
        datos.postalCode = form.postalCode || undefined;
        if (form.latitude) datos.latitude = parseFloat(form.latitude);
        if (form.longitude) datos.longitude = parseFloat(form.longitude);
      }
      if (form.timezone) datos.timezone = form.timezone;
      if (form.website.trim()) datos.website = form.website.trim();
    }
    if (!Object.keys(datos).length && !(paso === 1 && logoFile)) return;
    setGuardando(true);
    try {
      if (Object.keys(datos).length)
        await tenantService.update(tenant.id, datos);
      if (datos.timezone) cacheTenantTimezone(datos.timezone);
      // El logo también: subirlo al final era perderlo si la persona salía.
      if (paso === 1 && logoFile) {
        await tenantService.uploadLogo(logoFile, tenant.id);
        setLogoFile(null);
      }
      setGuardadoA(Date.now());
    } catch {
      // Un borrador que no se guarda no bloquea el paso: lo escrito sigue en
      // pantalla y se vuelve a intentar al continuar o al terminar.
    } finally {
      setGuardando(false);
    }
  };

  const next = () => {
    const paso = step;

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    void guardarBorrador(paso);
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const snoozeAndClose = () => {
    if (obligatorio) return;
    try {
      if (tenant?.id) localStorage.setItem(snoozeKey(tenant.id), "1");
    } catch {}
    onOpenChange(false);
  };

  // ── Finish ───────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    if (!tenant?.id) {
      toast.error(t("ui.OnboardingWizard.noSeEncontroLaEmpresa"));

      return;
    }
    if (!step2Valid || !step3Valid) {
      toast.error(t("ui.OnboardingWizard.completaTodosLosCamposRequeridos"));

      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        businessTitle: form.businessTitle.trim(),
        taxNumber: form.taxNumber.trim(),
        phone: form.phone || undefined,
        email: form.email.trim(),
        address: form.address.trim(),
        addressLine2: form.addressLine2 || undefined,
        city: form.city || undefined,
        country: form.country || undefined,
        postalCode: form.postalCode || undefined,
        latitude:
          form.latitude && form.latitude !== ""
            ? parseFloat(form.latitude)
            : undefined,
        longitude:
          form.longitude && form.longitude !== ""
            ? parseFloat(form.longitude)
            : undefined,
        timezone: form.timezone || DEFAULT_TIMEZONE,
        website: form.website.trim() || undefined,
      };

      await tenantService.update(tenant.id, payload);
      // Misma razón que en Perfil de la empresa: la zona elegida aquí tiene que
      // estar en la caché antes de que se pinte la primera pantalla con fechas.
      cacheTenantTimezone(payload.timezone);

      if (logoFile) {
        try {
          await tenantService.uploadLogo(logoFile, tenant.id);
        } catch (e: any) {
          toast.error(
            e?.message ||
              t(
                "onboarding.wizard.logoUploadError",
                "Datos guardados, pero no se pudo subir el logo.",
              ),
          );
        }
      }

      try {
        await onboardingService.completeOnboarding(tenant.id);
      } catch (e) {
        // non-fatal: the business is set up; backend may auto-complete too.
      }

      // Datos de ejemplo, sólo si se pidieron y DESPUÉS de guardar la dirección
      // (el servidor los coloca alrededor de ella). Si falla, se entra vacío.
      try {
        sessionStorage.removeItem("cg_demo_data_status");
        if (conEjemplo)
          await ApiService.post(`/tenant/${tenant.id}/demo-data/enable`, {});
      } catch (e) {
        /* sin datos de ejemplo: el CRM arranca vacío */
      }

      // Company name/logo just changed -> bust the sidebar branding cache so it
      // re-resolves the new values instead of showing the stale/placeholder one.
      invalidateTenantBranding();
      await onRefresh();
      toast.success(
        t("ui.OnboardingWizard.configuracionCompletadaBienvenidoACguardpro", {
          marca: nombreDeMarca,
        }),
      );
      // El momento de máxima intención: recién configurado, CRM vacío. VigIA
      // toma la mano — los 13 registros muertos en dashboards vacíos son el
      // porqué de esta línea.
      setTimeout(() => {
        try {
          window.dispatchEvent(
            new CustomEvent("vigia:abrir", {
              detail: {
                // The assistant introduces itself by the name it has in THIS
                // company: a partner's companies know it by the partner's name.
                mensaje: t("ui.OnboardingWizard.saludoDelAsistente", {
                  defaultValue:
                    "¡Bienvenido! Soy {{agente}}, tu asistente. Ya quedó configurada tu empresa — el siguiente paso es tu primer cliente. Dime su nombre y su dirección y te lo creo aquí mismo.",
                  agente: agenteGuardado(String(tenant?.id ?? "")).nombre,
                }),
              },
            }),
          );
        } catch {
          /* sin asistente no se rompe el cierre */
        }
      }, 600);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "settings.reportSettings.saveError",
            "No se pudo guardar la configuración.",
          ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) snoozeAndClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 max-h-[92vh] sm:max-w-[960px]"
        showCloseButton={false}
        /* Obligatorio: ni Escape ni un clic fuera lo cierran. */
        onEscapeKeyDown={(e) => {
          if (obligatorio) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (obligatorio) e.preventDefault();
        }}
      >
        {/* ── DISEÑO A DOS COLUMNAS (2026-10-03) ──────────────────────────────
            Izquierda, la columna de marca: el escudo (o el logo del socio), los
            pasos en vertical con su marca de hecho, y la empresa tal como la
            verán vigilantes y clientes, llenándose mientras se escribe.
            Derecha, sólo el paso en curso. En el teléfono la columna de marca
            se pliega a una cabecera con la barra de progreso. */}
        <div className="grid max-h-[92vh] md:grid-cols-[300px_1fr]">
          <aside
            className="relative flex flex-col gap-5 overflow-hidden p-5 text-white md:p-6"
            style={{
              background:
                "radial-gradient(120% 80% at 0% 0%, color-mix(in oklab, var(--brand) 30%, transparent) 0%, transparent 60%), linear-gradient(165deg, #121a2b 0%, #0a0f1a 100%)",
            }}
          >
            <div className="flex items-center gap-3">
              <MarcaDelAsistente tam={52} />
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold leading-tight text-white">
                  {t(
                    "ui.OnboardingWizard.configuraTuEmpresa",
                    "Configura tu empresa",
                  )}
                </DialogTitle>
                <DialogDescription className="text-xs text-white/60">
                  {t("onboarding.wizard.stepOf", {
                    defaultValue: "Paso {{current}} de {{total}}",
                    current: step + 1,
                    total: STEPS.length,
                  })}
                </DialogDescription>
              </div>
            </div>

            {/* Teléfono: progreso en una barra. */}
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10 md:hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${((step + 1) / STEPS.length) * 100}%`,
                  background: "var(--brand)",
                }}
              />
            </div>

            {/* Escritorio: los pasos en vertical. */}
            <ol className="hidden space-y-1 md:block">
              {STEPS.map((p, i) => {
                const Icono = p.icon;
                const hecho = i < step;
                const actual = i === step;

                return (
                  <li key={p.labelKey}>
                    <button
                      className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors disabled:cursor-default"
                      disabled={!hecho}
                      style={{
                        background: actual
                          ? "rgba(255,255,255,0.08)"
                          : undefined,
                      }}
                      type="button"
                      onClick={() => hecho && setStep(i)}
                    >
                      <span
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors"
                        style={{
                          background:
                            hecho || actual
                              ? "var(--brand)"
                              : "rgba(255,255,255,0.08)",
                          color:
                            hecho || actual
                              ? "var(--brand-ink)"
                              : "rgba(255,255,255,0.55)",
                        }}
                      >
                        {hecho ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Icono className="h-4 w-4" />
                        )}
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          actual ? "text-white" : "text-white/60",
                        )}
                      >
                        {t(p.labelKey, p.label)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {/* La empresa como la verán los demás, en vivo. */}
            <div className="mt-auto hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3 md:block">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                {t("ui.OnboardingWizard.vistaPrevia", "Vista previa")}
              </p>
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-white/10">
                  {logoPreview ? (
                    <img
                      alt=""
                      className="h-full w-full object-cover"
                      src={logoPreview}
                    />
                  ) : (
                    <Building2 className="h-5 w-5 text-white/50" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {form.name.trim() ||
                      t("ui.OnboardingWizard.miEmpresaDeSeguridad")}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-white/55">
                    {form.country ? (
                      <MapPin className="h-3 w-3 shrink-0" />
                    ) : null}
                    {form.country
                      ? nombreDePais(form.country, idioma)
                      : terminos.razonSocial}
                  </p>
                </div>
              </div>
              {trialEnd && (
                <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/50">
                  <Gift className="h-3 w-3" />
                  {t("onboarding.wizard.review.trialEnds", {
                    defaultValue: "Tu prueba gratuita termina el {{date}}",
                    date: trialEnd,
                  })}
                </p>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            {!obligatorio && (
              <button
                aria-label={t("actions.close")}
                className="absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                type="button"
                onClick={snoozeAndClose}
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            )}
            {/* Título del paso (en la bienvenida lo pone el propio saludo). */}
            {step > 0 && (
              <div className="px-5 pt-5 sm:px-7 sm:pt-6">
                <h3 className="text-lg font-bold">
                  {t(STEPS[step].labelKey, STEPS[step].label)}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(STEPS[step].subKey, STEPS[step].sub)}
                </p>
              </div>
            )}

            {/* Body (scrollable) */}
            <div className="max-h-[60vh] flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              {step === 0 && (
                <WelcomeStep
                  days={days}
                  obligatorio={obligatorio}
                  terminos={terminos}
                  trialEnd={trialEnd}
                >
                  {/* EL PAÍS, LO PRIMERO: de él salen los nombres de los campos
                  fiscales, el prefijo del teléfono, el mapa y la zona. */}
                  <div className="space-y-1.5 text-left">
                    <Label>
                      {t(
                        "ui.OnboardingWizard.paisDeLaEmpresa",
                        "¿En qué país está tu empresa?",
                      )}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </Label>
                    <Combobox
                      aria-label={t("ui.OnboardingWizard.pais", "País")}
                      options={opcionesPais}
                      placeholder={t(
                        "ui.OnboardingWizard.buscarPais",
                        "Buscar país…",
                      )}
                      value={form.country}
                      onChange={(v) => elegirPais(String(v || ""))}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t(
                        "ui.OnboardingWizard.paisAyuda",
                        "Con él adaptamos los datos fiscales, el teléfono, el mapa y la zona horaria.",
                      )}
                    </p>
                    {/* Lo que el país acaba de cambiar, a la vista: se elige y se
                    ve el efecto en el acto, en vez de descubrirlo dos pasos
                    después. */}
                    {form.country && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {[
                          {
                            Icono: Phone,
                            texto: `+${(() => {
                              try {
                                return getCountryCallingCode(
                                  form.country as CountryCode,
                                );
                              } catch {
                                return "";
                              }
                            })()}`,
                          },
                          {
                            Icono: FileText,
                            texto: terminos.idFiscalLocal || terminos.idFiscal,
                          },
                          {
                            Icono: MapIcon,
                            texto: nombreDePais(form.country, idioma),
                          },
                        ].map(({ Icono, texto }) => (
                          <span
                            key={texto}
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium animate-in fade-in-50 zoom-in-95 duration-300"
                            style={{
                              background: "var(--brand-wash)",
                              color: "var(--brand-text)",
                              border: "1px solid var(--hairline)",
                            }}
                          >
                            <Icono className="h-3.5 w-3.5" />
                            {texto}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </WelcomeStep>
              )}

              {step === 1 && (
                <div className="space-y-4 animate-in fade-in-50 duration-300">
                  <div className="space-y-1.5">
                    <Label>
                      {t("ui.OnboardingWizard.nombreDeLaEmpresa")}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </Label>
                    <Input
                      placeholder={t(
                        "ui.OnboardingWizard.miEmpresaDeSeguridad",
                      )}
                      value={form.name}
                      onChange={(e) => set({ name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      {terminos.razonSocial}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </Label>
                    <Input
                      placeholder={t(
                        "ui.OnboardingWizard.nombreLegalAyuda",
                        "Tal como aparece en el registro oficial",
                      )}
                      value={form.businessTitle}
                      onChange={(e) => set({ businessTitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      {terminos.idFiscal}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </Label>
                    <Input
                      maxLength={24}
                      placeholder={taxPlaceholder}
                      value={form.taxNumber}
                      onChange={(e) =>
                        set({ taxNumber: e.target.value.slice(0, 24) })
                      }
                    />
                    {form.taxNumber && !taxValid && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--bad-text)" }}
                      >
                        {taxHint}
                      </p>
                    )}
                  </div>

                  {/* Logo */}
                  <div className="space-y-1.5">
                    <Label>
                      {t("ui.OnboardingWizard.logoDeLaEmpresa")}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </Label>
                    <div
                      className="flex flex-wrap items-center gap-4 rounded-2xl p-2 transition-colors"
                      style={
                        arrastrandoLogo
                          ? {
                              background: "var(--brand-wash)",
                              outline: "2px dashed var(--brand)",
                            }
                          : undefined
                      }
                      /* Se puede soltar el archivo encima, además de elegirlo. */
                      onDragLeave={() => setArrastrandoLogo(false)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setArrastrandoLogo(true);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setArrastrandoLogo(false);
                        handleLogo(e.dataTransfer.files?.[0] || null);
                      }}
                    >
                      <div className="relative">
                        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted">
                          {logoPreview ? (
                            <img
                              alt="logo"
                              className="h-full w-full object-cover"
                              src={logoPreview}
                            />
                          ) : (
                            <Building2 className="h-7 w-7 text-muted-foreground" />
                          )}
                        </div>
                        <button
                          aria-label={t(
                            "ui.OnboardingWizard.subirLogo",
                            "Subir logo",
                          )}
                          className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-accent"
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          <Camera className="h-3.5 w-3.5 text-primary" />
                        </button>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <Button
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          {logoPreview
                            ? t(
                                "ui.OnboardingWizard.cambiarLogo",
                                "Cambiar logo",
                              )
                            : t("ui.OnboardingWizard.subirLogo", "Subir logo")}
                        </Button>
                        <p className="mt-1.5 text-xs">
                          {t(
                            "ui.OnboardingWizard.pngJpgSvgOWebp",
                            "PNG, JPG, SVG o WEBP · máx. 5MB",
                          )}
                        </p>
                        <p className="text-xs">
                          {t(
                            "ui.OnboardingWizard.arrastraLogo",
                            "o arrástralo aquí",
                          )}
                        </p>
                      </div>
                      <input
                        ref={logoInputRef}
                        accept=".png,.jpg,.jpeg,.webp,.svg"
                        className="hidden"
                        type="file"
                        onChange={(e) =>
                          handleLogo(e.target.files?.[0] || null)
                        }
                      />
                    </div>
                    {logoError && (
                      <p
                        className="text-xs"
                        style={{ color: "var(--bad-text)" }}
                      >
                        {logoError}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4 animate-in fade-in-50 duration-300">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>
                        {t("ui.OnboardingWizard.telefono", "Teléfono")}{" "}
                        <span style={{ color: "var(--bad-text)" }}>*</span>
                      </Label>
                      {/* El prefijo sale del país elegido; cambiar de país vuelve a
                      montar el campo con el suyo. */}
                      <PhoneInput
                        key={form.country}
                        defaultCountry={form.country || undefined}
                        value={form.phone}
                        onChange={(v) => set({ phone: v })}
                        onCountryChange={(c: any) =>
                          set({
                            phoneCountry:
                              c?.code || c?.name || paisDeLaEmpresa(),
                          })
                        }
                      />
                      {form.phone && !phoneValid && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--bad-text)" }}
                        >
                          {t(
                            "ui.OnboardingWizard.numeroDeTelefonoInvalido",
                            "Número de teléfono inválido.",
                          )}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        {t(
                          "ui.OnboardingWizard.correoElectronico",
                          "Correo electrónico",
                        )}{" "}
                        <span style={{ color: "var(--bad-text)" }}>*</span>
                      </Label>
                      <Input
                        placeholder={t("ui.OnboardingWizard.correoEmpresaCom")}
                        type="email"
                        value={form.email}
                        onChange={(e) => set({ email: e.target.value })}
                      />
                      {form.email && !emailValid && (
                        <p
                          className="text-xs"
                          style={{ color: "var(--bad-text)" }}
                        >
                          {t(
                            "ui.OnboardingWizard.correoElectronicoInvalido",
                            "Correo electrónico inválido.",
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>
                        {t("ui.OnboardingWizard.direccion", "Dirección")}{" "}
                        <span style={{ color: "var(--bad-text)" }}>*</span>
                      </Label>
                      <button
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        type="button"
                        onClick={() => setShowManualAddress((v) => !v)}
                      >
                        <Edit className="h-3 w-3" />
                        {showManualAddress
                          ? t(
                              "onboarding.wizard.autoSearch",
                              "Búsqueda automática",
                            )
                          : t(
                              "onboarding.wizard.manualEntry",
                              "Ingresar manualmente",
                            )}
                      </button>
                    </div>

                    {!showManualAddress ? (
                      <AddressAutocomplete
                        key={form.country}
                        showMap
                        countryCodes={
                          form.country
                            ? [form.country.toLowerCase()]
                            : undefined
                        }
                        defaultValue={form.address}
                        initialLat={
                          form.latitude ? parseFloat(form.latitude) : undefined
                        }
                        initialLng={
                          form.longitude
                            ? parseFloat(form.longitude)
                            : undefined
                        }
                        mapHeight="220px"
                        placeholder={t(
                          "ui.OnboardingWizard.buscarDireccion",
                          "Buscar dirección...",
                        )}
                        paisPorDefecto={form.country || undefined}
                        /* Sin dirección todavía, la zona es la del centro del
                       país; en cuanto hay dirección, la de la dirección. */
                        onCentroDelPais={(lat, lng) => {
                          const tz = zonaPorCoordenadas(lat, lng);

                          setForm((f) =>
                            f.latitude || !tz ? f : { ...f, timezone: tz },
                          );
                        }}
                        onAddressSelect={(data: AddressComponents) => {
                          const tz =
                            zonaPorCoordenadas(data.latitude, data.longitude) ||
                            tzFromText(data.country) ||
                            form.timezone;

                          set({
                            address: data.address || form.address,
                            city: data.city || form.city,
                            postalCode: data.postalCode || form.postalCode,
                            latitude: String(data.latitude ?? ""),
                            longitude: String(data.longitude ?? ""),
                            timezone: tz,
                          });
                        }}
                      />
                    ) : (
                      <Input
                        placeholder={t(
                          "ui.OnboardingWizard.direccionCompleta",
                          "Dirección completa",
                        )}
                        value={form.address}
                        onChange={(e) => set({ address: e.target.value })}
                      />
                    )}
                  </div>

                  {showManualAddress && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t("comun.ciudad")}</Label>
                        <Input
                          value={form.city}
                          onChange={(e) => set({ city: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>
                          {t(
                            "ui.OnboardingWizard.codigoPostal",
                            "Código postal",
                          )}
                        </Label>
                        <Input
                          value={form.postalCode}
                          onChange={(e) => set({ postalCode: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>
                        {t("onboarding.wizard.review.timezone", "Zona horaria")}{" "}
                        <span style={{ color: "var(--bad-text)" }}>*</span>
                      </Label>
                      <Combobox
                        aria-label={t(
                          "onboarding.wizard.review.timezone",
                          "Zona horaria",
                        )}
                        options={opcionesZona}
                        placeholder={t(
                          "ui.OnboardingWizard.seleccionarZonaHoraria",
                        )}
                        value={form.timezone}
                        onChange={(v) => set({ timezone: v })}
                      />
                      <button
                        className="text-xs font-medium text-primary hover:underline"
                        type="button"
                        onClick={() => {
                          const tz =
                            zonaPorCoordenadas(form.latitude, form.longitude) ||
                            tzFromText(form.country, form.address);

                          if (tz) {
                            set({ timezone: tz });
                            toast.success(
                              t("ui.OnboardingWizard.zonaDetectada", {
                                defaultValue: "Zona horaria detectada: {{tz}}",
                                tz,
                              }),
                            );
                          } else
                            toast.info(
                              t(
                                "ui.OnboardingWizard.noSePudoDetectarSeleccionala",
                              ),
                            );
                        }}
                      >
                        {t(
                          "ui.OnboardingWizard.detectarPorDireccion",
                          "Detectar por dirección",
                        )}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      <Label>
                        {t("onboarding.wizard.review.website", "Sitio web")}{" "}
                        <span className="text-muted-foreground text-xs font-normal">
                          ({t("ui.OnboardingWizard.opcional", "opcional")})
                        </span>
                      </Label>
                      <Input
                        placeholder={t("comun.empresaCom")}
                        type="url"
                        value={form.website}
                        onChange={(e) => set({ website: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <ReviewStep
                  days={days}
                  form={form}
                  terminos={terminos}
                  logoPreview={logoPreview}
                  conEjemplo={conEjemplo}
                  trialEnd={trialEnd}
                  onConEjemplo={setConEjemplo}
                  onEdit={(s) => setStep(s)}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border px-5 py-4 sm:px-7">
              {/* Obligatorio: la única salida es cerrar la sesión (quien se
              equivocó de cuenta no puede quedarse encerrado aquí). */}
              <button
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                disabled={submitting}
                type="button"
                onClick={obligatorio ? () => void signOut() : snoozeAndClose}
              >
                {obligatorio
                  ? t("ui.OnboardingWizard.cerrarSesion", "Cerrar sesión")
                  : t(
                      "ui.OnboardingWizard.completarMasTarde",
                      "Completar más tarde",
                    )}
              </button>

              <div className="ml-auto flex items-center gap-2">
                {/* Que se vea que lo escrito no se pierde. */}
                {(guardando || guardadoA) && (
                  <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                    {guardando ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    {guardando
                      ? t("ui.OnboardingWizard.guardandoBorrador", "Guardando…")
                      : t(
                          "ui.OnboardingWizard.borradorGuardado",
                          "Borrador guardado",
                        )}
                  </span>
                )}
                {step > 0 && (
                  <Button
                    disabled={submitting}
                    type="button"
                    variant="outline"
                    onClick={back}
                  >
                    <ArrowLeft className="mr-1.5 h-4 w-4" />{" "}
                    {t("actions.back", "Atrás")}
                  </Button>
                )}
                {step === 0 && (
                  <Button className="px-6" type="button" onClick={next}>
                    {t("onboarding.wizard.start", "Comenzar")}{" "}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
                {step > 0 && step < STEPS.length - 1 && (
                  <Button
                    className="px-6"
                    disabled={!canAdvance(step)}
                    type="button"
                    onClick={next}
                  >
                    {t("onboarding.wizard.continue", "Continuar")}{" "}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
                {step === STEPS.length - 1 && (
                  <Button
                    className="px-6"
                    disabled={submitting || !step2Valid || !step3Valid}
                    type="button"
                    onClick={handleFinish}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />{" "}
                        {t("onboarding.wizard.saving", "Guardando...")}
                      </>
                    ) : (
                      <>
                        <Check className="mr-1.5 h-4 w-4" />{" "}
                        {t(
                          "ui.OnboardingWizard.finalizarConfiguracion",
                          "Finalizar configuración",
                        )}
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── La marca del anfitrión ──────────────────────────────────────────────────
/**
 * El escudo de la plataforma, o el logo del socio en sus empresas: una empresa
 * de un socio NUNCA ve nuestro arte (ver `puedeUsarArteDePlataforma`). Sin
 * ninguno de los dos, el icono neutro de empresa.
 */
function MarcaDelAsistente({ tam }: { tam: number }) {
  const marca: any = useWhiteLabel();
  const src = marca?.puedeUsarArteDePlataforma
    ? "/assets/logo/escudo.png"
    : marca?.logo || null;

  if (!src)
    return (
      <span
        className="grid place-items-center rounded-xl"
        style={{
          width: tam,
          height: tam,
          background: "var(--brand)",
          color: "var(--brand-ink)",
        }}
      >
        <Building2 style={{ width: tam * 0.5, height: tam * 0.5 }} />
      </span>
    );

  return (
    <img
      alt=""
      className="object-contain"
      draggable={false}
      src={src}
      style={{
        width: tam,
        height: tam,
        filter: "drop-shadow(0 8px 18px var(--brand-glow))",
      }}
    />
  );
}

// ── Welcome step ────────────────────────────────────────────────────────────
function WelcomeStep({
  days,
  trialEnd,
  terminos,
  obligatorio,
  children,
}: {
  days: number | null;
  trialEnd: string | null;
  terminos: {
    razonSocialLocal: string | null;
    idFiscalLocal: string | null;
    razonSocial: string;
    idFiscal: string;
  };
  obligatorio: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  /* El nombre del anfitrión: «C-Guard Pro» en el de la plataforma, el del
     socio en el suyo. Por eso estos textos ya no lo llevan escrito. */
  const { platformName: nombreDeMarca } = useWhiteLabel();
  const items = [
    {
      icon: Building2,
      // Con los nombres del país elegido: «razón social, RUC» en Ecuador,
      // «legal business name, EIN» en EE. UU.
      text: t("onboarding.wizard.welcome.companyDataPais", {
        defaultValue: "Los datos de tu empresa (nombre, {{legal}}, {{fiscal}})",
        // En la frase, el término local a secas: «(nombre, Legal business
        // name, EIN)». Con el genérico y el paréntesis quedaba ilegible.
        legal: terminos.razonSocialLocal || terminos.razonSocial,
        fiscal: terminos.idFiscalLocal || terminos.idFiscal,
      }),
    },
    {
      icon: Camera,
      text: t(
        "onboarding.wizard.welcome.logo",
        "El logo que verán tus vigilantes y clientes",
      ),
    },
    {
      icon: MapPin,
      text: t(
        "onboarding.wizard.welcome.contact",
        "Contacto, dirección y zona horaria",
      ),
    },
  ];

  return (
    <div className="space-y-5 text-left animate-in fade-in-50 duration-300">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground">
          {t("ui.OnboardingWizard.teDamosLaBienvenidaA", {
            defaultValue: "¡Te damos la bienvenida a {{marca}}!",
            marca: nombreDeMarca,
          })}
        </h2>
        {obligatorio && (
          <p
            className="text-sm font-medium"
            style={{ color: "var(--brand-text)" }}
          >
            {t("ui.OnboardingWizard.obligatorioAviso", {
              defaultValue:
                "Antes de empezar, completa los datos de tu empresa: tus vigilantes y clientes los verán.",
            })}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {t(
            "onboarding.wizard.welcome.intro",
            "En menos de 2 minutos dejaremos lista tu empresa para que empieces a gestionar tus vigilantes, turnos y rondas.",
          )}
        </p>
      </div>

      <div className="flex flex-col items-start gap-1.5">
        {/* «Prueba gratis» SÓLO con días de prueba por delante. Una empresa
            con la prueba vencida (o pausada por su proveedor) lo veía igual —
            lo destapó la E2E de facturas del socio, 2026-09-29. La prueba de
            una empresa de socio se explica en Plan y facturación. */}
        {days !== null && days > 0 && (
          <Badge
            className="gap-1.5 border-0 px-3 py-1 text-sm"
            style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
          >
            <Gift className="h-3.5 w-3.5" />{" "}
            {t("onboarding.wizard.welcome.trialBadge", "Prueba gratis")}
          </Badge>
        )}
        {trialEnd && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            {t("onboarding.wizard.welcome.trialEnds", {
              defaultValue: "Tu prueba termina el {{date}}",
              date: trialEnd,
            })}
            {days != null && days > 0
              ? ` · ${t("onboarding.wizard.welcome.daysLeft", {
                  defaultValue: "te quedan {{count}} días",
                  count: days,
                })}`
              : ""}
          </p>
        )}
      </div>

      {children}

      <div className="space-y-2.5 rounded-xl border border-border bg-muted/30 p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("onboarding.wizard.welcome.weWillSetUp", "Vamos a configurar")}
        </p>
        {items.map(({ icon: Icon, text }) => (
          <div
            key={text}
            className="flex items-center gap-3 text-sm text-foreground"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Review step ─────────────────────────────────────────────────────────────
function ReviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-medium text-right",
          !value && "text-muted-foreground/60",
        )}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function ReviewStep({
  form,
  logoPreview,
  days,
  trialEnd,
  onEdit,
  terminos,
  conEjemplo,
  onConEjemplo,
}: {
  conEjemplo: boolean;
  onConEjemplo: (v: boolean) => void;
  terminos: { razonSocial: string; idFiscal: string };
  form: WizardForm;
  logoPreview: string | null;
  days: number | null;
  trialEnd: string | null;
  onEdit: (step: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const tzLabel =
    TIMEZONE_OPTIONS.find((o) => o.value === form.timezone)?.label ||
    form.timezone;
  const paisTexto = form.country
    ? `${bandera(form.country)} ${nombreDePais(form.country, i18n.resolvedLanguage || i18n.language || "es")}`
    : "";

  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/8 p-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background">
          {logoPreview ? (
            <img
              alt="logo"
              className="h-full w-full object-cover"
              src={logoPreview}
            />
          ) : (
            <Building2 className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {form.name || t("onboarding.wizard.step.tuEmpresa", "Tu empresa")}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {form.businessTitle}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border px-4">
        <div className="flex items-center justify-between py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("ui.OnboardingWizard.empresa")}
          </span>
          <button
            className="text-xs font-medium text-primary hover:underline"
            type="button"
            onClick={() => onEdit(1)}
          >
            {t("actions.edit")}
          </button>
        </div>
        <ReviewRow
          label={t("ui.OnboardingWizard.pais", "País")}
          value={paisTexto}
        />
        <ReviewRow label={terminos.razonSocial} value={form.businessTitle} />
        <ReviewRow label={terminos.idFiscal} value={form.taxNumber} />
        <div className="flex items-center justify-between py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t(
              "ui.OnboardingWizard.contactoYUbicacion",
              "Contacto y ubicación",
            )}
          </span>
          <button
            className="text-xs font-medium text-primary hover:underline"
            type="button"
            onClick={() => onEdit(2)}
          >
            {t("actions.edit")}
          </button>
        </div>
        <ReviewRow
          label={t("ui.OnboardingWizard.telefono", "Teléfono")}
          value={form.phone}
        />
        <ReviewRow label={t("comun.correo")} value={form.email} />
        <ReviewRow
          label={t("ui.OnboardingWizard.direccion", "Dirección")}
          value={form.address}
        />
        <ReviewRow
          label={t("onboarding.wizard.review.timezone", "Zona horaria")}
          value={tzLabel}
        />
        {form.website && (
          <ReviewRow
            label={t("onboarding.wizard.review.website", "Sitio web")}
            value={form.website}
          />
        )}
      </div>

      <label
        className="flex cursor-pointer items-start gap-3 rounded-xl border p-3"
        htmlFor="con-ejemplo"
      >
        <Switch
          checked={conEjemplo}
          className="mt-0.5"
          id="con-ejemplo"
          onCheckedChange={onConEjemplo}
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">
            {t("onboarding.wizard.demo.title", "Empezar con datos de ejemplo")}
          </span>
          <span className="block text-xs text-muted-foreground">
            {t(
              "onboarding.wizard.demo.desc",
              "Creamos 3 puestos con sus vigilantes alrededor de tu dirección para que veas el sistema funcionando. Se borran solos en cuanto agregues tu primer cliente, puesto o vigilante.",
            )}
          </span>
        </span>
      </label>

      {trialEnd && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Gift className="h-3.5 w-3.5 text-primary" />
          {t("onboarding.wizard.review.trialEnds", {
            defaultValue: "Tu prueba gratuita termina el {{date}}",
            date: trialEnd,
          })}
          {days != null && days > 0
            ? ` (${t("onboarding.wizard.review.daysLeft", {
                defaultValue: "{{count}} días restantes",
                count: days,
              })})`
            : ""}
          .
        </div>
      )}
    </div>
  );
}
