import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneInput } from "@/components/phone/PhoneInput";
import AddressAutocomplete, { AddressComponents } from "@/components/maps/AddressAutocomplete";
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
import { cn } from "@/lib/utils";
import tenantService from "@/services/tenant.service";
import onboardingService from "@/lib/api/onboardingService";
import { invalidateTenantBranding } from "@/lib/tenantBranding";
import { validateCedulaOrRuc, validatePhoneForCountry, digitsOnly } from "@/lib/validators/id";
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

const STEPS = [
  { label: "Bienvenida", icon: Sparkles },
  { label: "Tu empresa", icon: Building2 },
  { label: "Contacto", icon: MapPin },
  { label: "Revisar", icon: ClipboardCheck },
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

export default function OnboardingWizard({
  open,
  onOpenChange,
  tenant,
  onRefresh,
  defaultEmail,
}: OnboardingWizardProps) {
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

  const set = (patch: Partial<WizardForm>) => setForm((s) => ({ ...s, ...patch }));

  const days = trialDaysLeft(tenant?.trialEndsAt);
  const trialEnd = formatTrialEndDate(tenant?.trialEndsAt);

  // ── Per-step validation ──────────────────────────────────────────────────
  const taxValid = useMemo(
    () => Boolean(form.taxNumber) && validateCedulaOrRuc(form.taxNumber),
    [form.taxNumber],
  );
  const phoneCountryForValidation = useMemo(() => {
    const d = digitsOnly(form.phone);
    if (d.startsWith("593")) return "EC";
    return form.country || form.phoneCountry || "EC";
  }, [form.phone, form.country, form.phoneCountry]);
  const phoneValid = useMemo(
    () => Boolean(form.phone) && validatePhoneForCountry(form.phone, phoneCountryForValidation),
    [form.phone, phoneCountryForValidation],
  );
  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((form.email || "").trim()),
    [form.email],
  );
  const hasLogo = Boolean(logoFile || logoPreview);

  const step2Valid = Boolean(form.name.trim()) && Boolean(form.businessTitle.trim()) && taxValid && hasLogo;
  const step3Valid = phoneValid && emailValid && Boolean(form.address.trim()) && Boolean(form.timezone);

  const canAdvance = (s: number) => {
    if (s === 0) return true;
    if (s === 1) return step2Valid;
    if (s === 2) return step3Valid;
    return true;
  };

  // ── Logo handling ────────────────────────────────────────────────────────
  const handleLogo = (file?: File | null) => {
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
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
      toast.error("No se encontró la empresa. Recarga la página e inténtalo de nuevo.");
      return;
    }
    if (!step2Valid || !step3Valid) {
      toast.error("Completa todos los campos requeridos.");
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        name: form.name.trim(),
        businessTitle: form.businessTitle.trim(),
        taxNumber: digitsOnly(form.taxNumber),
        phone: form.phone || undefined,
        email: form.email.trim(),
        address: form.address.trim(),
        addressLine2: form.addressLine2 || undefined,
        city: form.city || undefined,
        country: form.country || undefined,
        postalCode: form.postalCode || undefined,
        latitude: form.latitude && form.latitude !== "" ? parseFloat(form.latitude) : undefined,
        longitude: form.longitude && form.longitude !== "" ? parseFloat(form.longitude) : undefined,
        timezone: form.timezone || DEFAULT_TIMEZONE,
        website: form.website.trim() || undefined,
      };

      await tenantService.update(tenant.id, payload);

      if (logoFile) {
        try {
          await tenantService.uploadLogo(logoFile, tenant.id);
        } catch (e: any) {
          toast.error(e?.message || "Datos guardados, pero no se pudo subir el logo.");
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
      toast.success("¡Configuración completada! Bienvenido a CGuardPro.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "No se pudo guardar la configuración.");
    } finally {
      setSubmitting(false);
    }
  };

  const StepCurrentIcon = STEPS[step].icon;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) snoozeAndClose(); else onOpenChange(true); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[640px] gap-0 overflow-hidden p-0 max-h-[92vh] sm:max-w-[680px]"
      >
        {/* Header */}
        {/* El degradado oro fijo (#C8860A → #F5C300) se sustituye por el acento:
            un relleno de `--brand` con tinta `--brand-ink`. El blanco encima del
            oro daba ~2,2:1 (ver la medición en tokens.css) y además el degradado
            se quedaba dorado aunque el CRM entero pasara a otro tono. */}
        <DialogHeader
          className="space-y-0 border-b px-6 py-4 text-left"
          style={{ borderColor: "var(--hairline)", background: "linear-gradient(90deg, var(--brand-wash) 0%, transparent 100%)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ background: "var(--brand)", color: "var(--brand-ink)", boxShadow: "0 6px 20px -8px var(--brand-glow)" }}
            >
              <StepCurrentIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold">
                Configura tu empresa
              </DialogTitle>
              <DialogDescription className="text-xs">
                Paso {step + 1} de {STEPS.length} · {STEPS[step].label}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={snoozeAndClose}
              aria-label="Cerrar"
              className="ml-auto rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="pt-4">
            <StepIndicator
              steps={STEPS.map((s) => ({ label: s.label }))}
              current={step}
              onStepClick={(i) => { if (i < step) setStep(i); }}
            />
          </div>
        </DialogHeader>

        {/* Body (scrollable) */}
        <div className="max-h-[58vh] overflow-y-auto px-6 py-5">
          {step === 0 && (
            <WelcomeStep days={days} trialEnd={trialEnd} />
          )}

          {step === 1 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <div className="space-y-1.5">
                <Label>Nombre de la empresa <span style={{ color: "var(--bad-text)" }}>*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Mi Empresa de Seguridad"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Razón social <span style={{ color: "var(--bad-text)" }}>*</span></Label>
                <Input
                  value={form.businessTitle}
                  onChange={(e) => set({ businessTitle: e.target.value })}
                  placeholder="Razón social registrada"
                />
              </div>
              <div className="space-y-1.5">
                <Label>RUC / Cédula <span style={{ color: "var(--bad-text)" }}>*</span></Label>
                <Input
                  value={form.taxNumber}
                  onChange={(e) => set({ taxNumber: digitsOnly(e.target.value).slice(0, 13) })}
                  placeholder="RUC (13 dígitos) o cédula (10 dígitos)"
                  inputMode="numeric"
                  maxLength={13}
                />
                {form.taxNumber && !taxValid && (
                  <p className="text-xs" style={{ color: "var(--bad-text)" }}>
                    Ingresa un RUC válido (13 dígitos, termina en 001) o una cédula válida (10 dígitos).
                  </p>
                )}
              </div>

              {/* Logo */}
              <div className="space-y-1.5">
                <Label>Logo de la empresa <span style={{ color: "var(--bad-text)" }}>*</span></Label>
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-muted">
                      {logoPreview ? (
                        <img src={logoPreview} alt="logo" className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-7 w-7 text-muted-foreground" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="absolute -bottom-1.5 -right-1.5 grid h-7 w-7 place-items-center rounded-full border border-border bg-background shadow-sm transition-colors hover:bg-accent"
                      aria-label="Subir logo"
                    >
                      <Camera className="h-3.5 w-3.5 text-primary" />
                    </button>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                      {logoPreview ? "Cambiar logo" : "Subir logo"}
                    </Button>
                    <p className="mt-1.5 text-xs">PNG, JPG, SVG o WEBP · máx. 5MB</p>
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp,.svg"
                    className="hidden"
                    onChange={(e) => handleLogo(e.target.files?.[0] || null)}
                  />
                </div>
                {logoError && <p className="text-xs" style={{ color: "var(--bad-text)" }}>{logoError}</p>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 animate-in fade-in-50 duration-300">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Teléfono <span style={{ color: "var(--bad-text)" }}>*</span></Label>
                  <PhoneInput
                    value={form.phone}
                    onChange={(v) => set({ phone: v })}
                    onCountryChange={(c: any) => set({ phoneCountry: c?.code || c?.name || "EC" })}
                    placeholder="Número de teléfono"
                  />
                  {form.phone && !phoneValid && (
                    <p className="text-xs" style={{ color: "var(--bad-text)" }}>Número de teléfono inválido.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Correo electrónico <span style={{ color: "var(--bad-text)" }}>*</span></Label>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => set({ email: e.target.value })}
                    placeholder="correo@empresa.com"
                  />
                  {form.email && !emailValid && (
                    <p className="text-xs" style={{ color: "var(--bad-text)" }}>Correo electrónico inválido.</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Dirección <span style={{ color: "var(--bad-text)" }}>*</span></Label>
                  <button
                    type="button"
                    onClick={() => setShowManualAddress((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Edit className="h-3 w-3" />
                    {showManualAddress ? "Búsqueda automática" : "Ingresar manualmente"}
                  </button>
                </div>

                {!showManualAddress ? (
                  <AddressAutocomplete
                    defaultValue={form.address}
                    initialLat={form.latitude ? parseFloat(form.latitude) : undefined}
                    initialLng={form.longitude ? parseFloat(form.longitude) : undefined}
                    placeholder="Buscar dirección..."
                    showMap
                    mapHeight="220px"
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
                    value={form.address}
                    onChange={(e) => set({ address: e.target.value })}
                    placeholder="Dirección completa"
                  />
                )}
              </div>

              {showManualAddress && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Ciudad</Label>
                    <Input value={form.city} onChange={(e) => set({ city: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>País</Label>
                    <Input value={form.country} onChange={(e) => set({ country: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Código postal</Label>
                    <Input value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Zona horaria <span style={{ color: "var(--bad-text)" }}>*</span></Label>
                  <Select value={form.timezone} onValueChange={(v) => set({ timezone: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar zona horaria" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {TIMEZONE_OPTIONS.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    onClick={() => {
                      const tz = tzFromText(form.country, form.address);
                      if (tz) { set({ timezone: tz }); toast.success(`Zona horaria detectada: ${tz}`); }
                      else toast.info("No se pudo detectar; selecciónala manualmente.");
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Detectar por dirección
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label>Sitio web <span className="text-muted-foreground text-xs font-normal">(opcional)</span></Label>
                  <Input
                    type="url"
                    value={form.website}
                    onChange={(e) => set({ website: e.target.value })}
                    placeholder="empresa.com"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <ReviewStep
              form={form}
              logoPreview={logoPreview}
              days={days}
              trialEnd={trialEnd}
              onEdit={(s) => setStep(s)}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-6 py-3.5">
          <button
            type="button"
            onClick={snoozeAndClose}
            disabled={submitting}
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            Completar más tarde
          </button>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={back} disabled={submitting}>
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Atrás
              </Button>
            )}
            {step === 0 && (
              <Button
                type="button"
                onClick={next}
                className="px-6"
              >
                Comenzar <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
            {step > 0 && step < STEPS.length - 1 && (
              <Button
                type="button"
                onClick={next}
                disabled={!canAdvance(step)}
                className="px-6"
              >
                Continuar <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
            {step === STEPS.length - 1 && (
              <Button
                type="button"
                onClick={handleFinish}
                disabled={submitting || !step2Valid || !step3Valid}
                className="px-6"
              >
                {submitting ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Guardando...</>
                ) : (
                  <><Check className="mr-1.5 h-4 w-4" /> Finalizar configuración</>
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
function WelcomeStep({ days, trialEnd }: { days: number | null; trialEnd: string | null }) {
  const items = [
    { icon: Building2, text: "Los datos de tu empresa (nombre, razón social, RUC)" },
    { icon: Camera, text: "El logo que verán tus vigilantes y clientes" },
    { icon: MapPin, text: "Contacto, dirección y zona horaria" },
  ];
  return (
    <div className="space-y-5 text-center animate-in fade-in-50 duration-300">
      <div
        className="mx-auto grid h-16 w-16 place-items-center rounded-2xl"
        style={{ background: "var(--brand)", color: "var(--brand-ink)", boxShadow: "0 10px 30px -10px var(--brand-glow)" }}
      >
        <Sparkles className="h-8 w-8" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-foreground">¡Te damos la bienvenida a CGuardPro!</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          En menos de 2 minutos dejaremos lista tu empresa para que empieces a gestionar tus vigilantes, turnos y rondas.
        </p>
      </div>

      <div className="mx-auto flex max-w-sm flex-col items-center gap-1.5">
        <Badge
          className="gap-1.5 border-0 px-3 py-1 text-sm"
          style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
        >
          <Gift className="h-3.5 w-3.5" /> 14 días de prueba gratis
        </Badge>
        {trialEnd && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Tu prueba termina el {trialEnd}
            {days != null && days > 0 ? ` · te quedan ${days} día${days === 1 ? "" : "s"}` : ""}
          </p>
        )}
      </div>

      <div className="mx-auto max-w-md space-y-2.5 rounded-xl border border-border bg-muted/30 p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vamos a configurar</p>
        {items.map(({ icon: Icon, text }) => (
          <div key={text} className="flex items-center gap-3 text-sm text-foreground">
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
      <span className={cn("text-sm font-medium text-right", !value && "text-muted-foreground/60")}>
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
  const tzLabel = TIMEZONE_OPTIONS.find((t) => t.value === form.timezone)?.label || form.timezone;
  return (
    <div className="space-y-4 animate-in fade-in-50 duration-300">
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/8 p-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-background">
          {logoPreview ? (
            <img src={logoPreview} alt="logo" className="h-full w-full object-cover" />
          ) : (
            <Building2 className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{form.name || "Tu empresa"}</p>
          <p className="truncate text-xs text-muted-foreground">{form.businessTitle}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border px-4">
        <div className="flex items-center justify-between py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Empresa</span>
          <button type="button" onClick={() => onEdit(1)} className="text-xs font-medium text-primary hover:underline">Editar</button>
        </div>
        <ReviewRow label="RUC / Cédula" value={form.taxNumber} />
        <div className="flex items-center justify-between py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contacto y ubicación</span>
          <button type="button" onClick={() => onEdit(2)} className="text-xs font-medium text-primary hover:underline">Editar</button>
        </div>
        <ReviewRow label="Teléfono" value={form.phone} />
        <ReviewRow label="Correo" value={form.email} />
        <ReviewRow label="Dirección" value={form.address} />
        <ReviewRow label="Zona horaria" value={tzLabel} />
        {form.website && <ReviewRow label="Sitio web" value={form.website} />}
      </div>

      {trialEnd && (
        <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Gift className="h-3.5 w-3.5 text-primary" />
          Tu prueba gratuita termina el {trialEnd}
          {days != null && days > 0 ? ` (${days} día${days === 1 ? "" : "s"} restantes)` : ""}.
        </div>
      )}
    </div>
  );
}
