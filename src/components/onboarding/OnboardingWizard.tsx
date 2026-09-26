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
} from "lucide-react";
import { toast } from "sonner";

import StepIndicator from "./StepIndicator";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenant: OnboardingTenant | null;
  /** Re-fetch auth profile after a successful save. */
  onRefresh: () => Promise<any>;
  /** Default email to pre-fill (user email at signup). */
  defaultEmail?: string;
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
    icon: Sparkles,
  },
  {
    labelKey: "onboarding.wizard.step.tuEmpresa",
    label: "Tu empresa",
    icon: Building2,
  },
  {
    labelKey: "onboarding.wizard.step.contacto",
    label: "Contacto",
    icon: MapPin,
  },
  {
    labelKey: "onboarding.wizard.step.revisar",
    label: "Revisar",
    icon: ClipboardCheck,
  },
];

const emptyForm: WizardForm = {
  name: "",
  businessTitle: "",
  taxNumber: "",
  phone: "",
  phoneCountry: "EC",
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
}: OnboardingWizardProps) {
  const { t } = useTranslation();
  /* El nombre del anfitrión: «C-Guard Pro» en el de la plataforma, el del
     socio en el suyo. Por eso estos textos ya no lo llevan escrito. */
  const { platformName: nombreDeMarca } = useWhiteLabel();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showManualAddress, setShowManualAddress] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const hydratedFor = useRef<string | null>(null);

  // Hydrate the form from the tenant whenever the wizard opens (once per tenant id).
  useEffect(() => {
    if (!open || !tenant) return;
    const key = tenant.id || "new";

    if (hydratedFor.current === key) return;
    hydratedFor.current = key;

    setForm({
      name: tenant.name ?? "",
      businessTitle: tenant.businessTitle ?? "",
      taxNumber: tenant.taxNumber ?? "",
      phone: tenant.phone ?? "",
      phoneCountry: "EC",
      email: tenant.email ?? defaultEmail ?? "",
      address: tenant.address ?? "",
      addressLine2: tenant.addressLine2 ?? "",
      city: tenant.city ?? "",
      country: tenant.country ?? "",
      postalCode: tenant.postalCode ?? "",
      latitude: tenant.latitude != null ? String(tenant.latitude) : "",
      longitude: tenant.longitude != null ? String(tenant.longitude) : "",
      timezone: tenant.timezone || DEFAULT_TIMEZONE,
      website: tenant.website ?? "",
    });
    setLogoPreview(tenant.logoUrl ?? null);
    setLogoFile(null);
    setLogoError(null);
    setStep(0);
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

  const { taxLabel, taxPlaceholder, taxHint } = useMemo(
    () => taxFieldTexts(form.country, t),
    [form.country, t],
  );

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
    if (s === 0) return true;
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
      setLogoError("El logo debe ser PNG, JPG, SVG o WEBP.");

      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError("El logo no debe superar 5MB.");

      return;
    }
    setLogoError(null);
    setLogoFile(file);
    const reader = new FileReader();

    reader.onload = () => setLogoPreview(String(reader.result));
    reader.readAsDataURL(file);
  };

  // ── Navigation ───────────────────────────────────────────────────────────
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const snoozeAndClose = () => {
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

  const StepCurrentIcon = STEPS[step].icon;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) snoozeAndClose();
        else onOpenChange(true);
      }}
    >
      <DialogContent
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 max-h-[92vh] sm:max-w-[680px]"
        showCloseButton={false}
      >
        {/* Header */}
        {/* El degradado oro fijo (#C8860A → #F5C300) se sustituye por el acento:
            un relleno de `--brand` con tinta `--brand-ink`. El blanco encima del
            oro daba ~2,2:1 (ver la medición en tokens.css) y además el degradado
            se quedaba dorado aunque el CRM entero pasara a otro tono. */}
        <DialogHeader
          className="space-y-0 border-b px-4 py-4 text-left sm:px-6"
          style={{
            borderColor: "var(--hairline)",
            background:
              "linear-gradient(90deg, var(--brand-wash) 0%, transparent 100%)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{
                background: "var(--brand)",
                color: "var(--brand-ink)",
                boxShadow: "0 6px 20px -8px var(--brand-glow)",
              }}
            >
              <StepCurrentIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">
                {t(
                  "ui.OnboardingWizard.configuraTuEmpresa",
                  "Configura tu empresa",
                )}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {t("onboarding.wizard.stepOf", {
                  defaultValue: "Paso {{current}} de {{total}}",
                  current: step + 1,
                  total: STEPS.length,
                })}{" "}
                · {t(STEPS[step].labelKey, STEPS[step].label)}
              </DialogDescription>
            </div>
            <button
              aria-label={t("actions.close")}
              className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              type="button"
              onClick={snoozeAndClose}
            >
              <svg
                fill="none"
                height="18"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="18"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="pt-4">
            <StepIndicator
              current={step}
              steps={STEPS.map((s) => ({ label: t(s.labelKey, s.label) }))}
              onStepClick={(i) => {
                if (i < step) setStep(i);
              }}
            />
          </div>
        </DialogHeader>

        {/* Body (scrollable) */}
        <div className="max-h-[58vh] overflow-y-auto px-4 py-5 sm:px-6">
          {step === 0 && <WelcomeStep days={days} trialEnd={trialEnd} />}

          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <div className="space-y-1.5">
                <Label>
                  {t("ui.OnboardingWizard.nombreDeLaEmpresa")}{" "}
                  <span style={{ color: "var(--bad-text)" }}>*</span>
                </Label>
                <Input
                  placeholder={t("ui.OnboardingWizard.miEmpresaDeSeguridad")}
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {t("ui.OnboardingWizard.razonSocial", "Razón social")}{" "}
                  <span style={{ color: "var(--bad-text)" }}>*</span>
                </Label>
                <Input
                  placeholder={t(
                    "ui.OnboardingWizard.razonSocialRegistrada",
                    "Razón social registrada",
                  )}
                  value={form.businessTitle}
                  onChange={(e) => set({ businessTitle: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>
                  {taxLabel} <span style={{ color: "var(--bad-text)" }}>*</span>
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
                  <p className="text-xs" style={{ color: "var(--bad-text)" }}>
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
                <div className="flex flex-wrap items-center gap-4">
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
                      aria-label="Subir logo"
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
                      {logoPreview ? "Cambiar logo" : "Subir logo"}
                    </Button>
                    <p className="mt-1.5 text-xs">
                      {t(
                        "ui.OnboardingWizard.pngJpgSvgOWebp",
                        "PNG, JPG, SVG o WEBP · máx. 5MB",
                      )}
                    </p>
                  </div>
                  <input
                    ref={logoInputRef}
                    accept=".png,.jpg,.jpeg,.webp,.svg"
                    className="hidden"
                    type="file"
                    onChange={(e) => handleLogo(e.target.files?.[0] || null)}
                  />
                </div>
                {logoError && (
                  <p className="text-xs" style={{ color: "var(--bad-text)" }}>
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
                  <PhoneInput
                    value={form.phone}
                    onChange={(v) => set({ phone: v })}
                    onCountryChange={(c: any) =>
                      set({ phoneCountry: c?.code || c?.name || "EC" })
                    }
                  />
                  {form.phone && !phoneValid && (
                    <p className="text-xs" style={{ color: "var(--bad-text)" }}>
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
                    <p className="text-xs" style={{ color: "var(--bad-text)" }}>
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
                      ? t("onboarding.wizard.autoSearch", "Búsqueda automática")
                      : t(
                          "onboarding.wizard.manualEntry",
                          "Ingresar manualmente",
                        )}
                  </button>
                </div>

                {!showManualAddress ? (
                  <AddressAutocomplete
                    showMap
                    defaultValue={form.address}
                    initialLat={
                      form.latitude ? parseFloat(form.latitude) : undefined
                    }
                    initialLng={
                      form.longitude ? parseFloat(form.longitude) : undefined
                    }
                    mapHeight="220px"
                    placeholder={t(
                      "ui.OnboardingWizard.buscarDireccion",
                      "Buscar dirección...",
                    )}
                    onAddressSelect={(data: AddressComponents) => {
                      const tz = tzFromText(data.country) || form.timezone;

                      set({
                        address: data.address || form.address,
                        city: data.city || form.city,
                        postalCode: data.postalCode || form.postalCode,
                        country: data.country || form.country,
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
                    <Label>{t("ui.OnboardingWizard.pais", "País")}</Label>
                    <Input
                      value={form.country}
                      onChange={(e) => set({ country: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>
                      {t("ui.OnboardingWizard.codigoPostal", "Código postal")}
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
                    Zona horaria{" "}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </Label>
                  <Combobox
                    aria-label="Zona horaria"
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
                      const tz = tzFromText(form.country, form.address);

                      if (tz) {
                        set({ timezone: tz });
                        toast.success(`Zona horaria detectada: ${tz}`);
                      } else
                        toast.info(
                          t("ui.OnboardingWizard.noSePudoDetectarSeleccionala"),
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
                    Sitio web{" "}
                    <span className="text-muted-foreground text-xs font-normal">
                      (opcional)
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
              logoPreview={logoPreview}
              trialEnd={trialEnd}
              onEdit={(s) => setStep(s)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border bg-muted/30 px-4 py-3.5 sm:px-6">
          <button
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            disabled={submitting}
            type="button"
            onClick={snoozeAndClose}
          >
            {t("ui.OnboardingWizard.completarMasTarde", "Completar más tarde")}
          </button>

          <div className="ml-auto flex items-center gap-2">
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
      </DialogContent>
    </Dialog>
  );
}

// ── Welcome step ────────────────────────────────────────────────────────────
function WelcomeStep({
  days,
  trialEnd,
}: {
  days: number | null;
  trialEnd: string | null;
}) {
  const { t } = useTranslation();
  /* El nombre del anfitrión: «C-Guard Pro» en el de la plataforma, el del
     socio en el suyo. Por eso estos textos ya no lo llevan escrito. */
  const { platformName: nombreDeMarca } = useWhiteLabel();
  const items = [
    {
      icon: Building2,
      text: t(
        "onboarding.wizard.welcome.companyData",
        "Los datos de tu empresa (nombre, razón social, RUC)",
      ),
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
    <div className="space-y-5 text-center animate-in fade-in-50 duration-300">
      <div
        className="mx-auto grid h-16 w-16 place-items-center rounded-2xl"
        style={{
          background: "var(--brand)",
          color: "var(--brand-ink)",
          boxShadow: "0 10px 30px -10px var(--brand-glow)",
        }}
      >
        <Sparkles className="h-8 w-8" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground">
          {t("ui.OnboardingWizard.teDamosLaBienvenidaA", {
            defaultValue: "¡Te damos la bienvenida a {{marca}}!",
            marca: nombreDeMarca,
          })}
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          {t(
            "onboarding.wizard.welcome.intro",
            "En menos de 2 minutos dejaremos lista tu empresa para que empieces a gestionar tus vigilantes, turnos y rondas.",
          )}
        </p>
      </div>

      <div className="mx-auto flex max-w-sm flex-col items-center gap-1.5">
        <Badge
          className="gap-1.5 border-0 px-3 py-1 text-sm"
          style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
        >
          <Gift className="h-3.5 w-3.5" />{" "}
          {t("onboarding.wizard.welcome.trialBadge", "Prueba gratis")}
        </Badge>
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

      <div className="mx-auto max-w-md space-y-2.5 rounded-xl border border-border bg-muted/30 p-4 text-left">
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
}: {
  form: WizardForm;
  logoPreview: string | null;
  days: number | null;
  trialEnd: string | null;
  onEdit: (step: number) => void;
}) {
  const { t } = useTranslation();
  const tzLabel =
    TIMEZONE_OPTIONS.find((o) => o.value === form.timezone)?.label ||
    form.timezone;
  const { taxLabel } = taxFieldTexts(form.country, t);

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
        <ReviewRow label={taxLabel} value={form.taxNumber} />
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
