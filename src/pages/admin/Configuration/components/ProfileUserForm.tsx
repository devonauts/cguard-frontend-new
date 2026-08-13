import { useEffect, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Mail, Phone, Globe, UserRound, Languages } from "lucide-react";
import AccountService, { ProfilePayload } from "@/services/accountService";
import { useAuth } from "@/contexts/AuthContext";
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import AvatarUploader from "./profile/AvatarUploader";
import PhoneField from "./profile/PhoneField";
import { useLanguage } from "@/contexts/LanguageContext";
import { Section, Modal, Stagger, StatusBadge, SkeletonCards } from "@/components/kit";

type MeTenantSetting = { theme?: string; logoUrl?: string | null };
type MeTenant = { name?: string; phone?: string; settings?: MeTenantSetting[] };
type MeAvatar = { downloadUrl?: string; privateUrl?: string; url?: string; src?: string } | string;

type MeResponse = {
  id: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email: string;
  phoneNumber?: string;
  language?: string;
  avatarUrl?: string | null;
  avatars?: MeAvatar[];
  tenants?: Array<{ tenant?: MeTenant }>;
  emailVerified?: boolean;
};

// Raw /auth/me payload before normalization: fields may live at the top level or
// be wrapped under `user`/`data`.
type MeRaw = Partial<MeResponse> & { user?: MeRaw; data?: MeRaw };

// Shape of the errors thrown by the API layer (axios-style response envelope).
type ApiError = { response?: { data?: { message?: string } }; message?: string };

function pickAvatarUrl(avatars?: MeAvatar[] | null): string | null {
  if (!avatars || avatars.length === 0) return null;
  const a = avatars[0];
  if (typeof a === "string") return a;
  // Prefer the token-based download URL the backend attaches (fillDownloadUrl).
  if (a.downloadUrl) return String(a.downloadUrl);
  // Transitional fallback only: a legacy avatar object that carries just a raw
  // privateUrl (no token downloadUrl). This is a plain helper (not a React
  // component), so the useFileUrl hook can't be used; the raw download path
  // remains until the backend guarantees a downloadUrl on every avatar object.
  if (a.privateUrl) {
    const privateUrl = String(a.privateUrl);
    // If it's already an absolute URL, return it; otherwise construct download path
    if (/^https?:\/\//i.test(privateUrl)) return privateUrl;
    return `/file/download?privateUrl=${encodeURIComponent(privateUrl)}`;
  }
  // Fallback to other common fields
  if (a.url) return String(a.url);
  if (a.src) return String(a.src);
  return null;
}

function normalizeMe(raw: MeRaw | null | undefined): MeResponse {
  const base: MeRaw | null | undefined = raw?.user ?? raw?.data ?? raw;
  const firstName = base?.firstName ?? "";
  const lastName = base?.lastName ?? "";
  const fullName = (base?.fullName ?? `${firstName} ${lastName}`).trim();
  const email = base?.email ?? "";
  const phoneNumber = base?.phoneNumber ?? "";
  const language = base?.language ?? "es";
  let avatarUrl = base?.avatarUrl ?? pickAvatarUrl(base?.avatars) ?? null;
  // Do not fallback to tenant logo here — user avatar must come from `avatarUrl`/`avatars`.
  if (avatarUrl) {
    try {
      // Encode spaces and other characters in the URL path
      avatarUrl = encodeURI(String(avatarUrl));
    } catch (e) {
      // if encoding fails, keep original
    }
  }
  const tenants = base?.tenants ?? [];
  const emailVerified = base?.emailVerified ?? false;

  return {
    id: base?.id as string,
    firstName,
    lastName,
    fullName,
    email,
    phoneNumber,
    language,
    avatarUrl,
    avatars: base?.avatars ?? [],
    tenants,
    emailVerified,
  };
}

function splitFullName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export default function ProfileUserForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation();

  const [fullName, setFullName] = useState("");

  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneCode, setPhoneCode] = useState("+593");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  // Tracks the current blob: object URL so it can be revoked when replaced/unmounted.
  const avatarObjectUrlRef = useRef<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [showPhoneVerifyModal, setShowPhoneVerifyModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const { loading: authLoading } = useAuth();
  useEffect(() => {
    let mounted = true;
    // Wait until auth provider finished initializing to avoid calling without token
    if (authLoading) {
      // we will re-run when authLoading changes
      return;
    }

    (async () => {
      try {
        const res = await AccountService.getMe();
        const raw = res?.user ?? res?.data ?? res;
        const me = normalizeMe(res);
        if (import.meta.env.DEV) console.log('[ProfileUserForm] /auth/me response raw:', raw, 'normalized:', me);
        setCurrentUserId(raw?.id ?? null);
        const tid = raw?.tenants && raw.tenants.length ? raw.tenants[0].tenant?.id : localStorage.getItem('tenantId');
        setCurrentTenantId(tid ?? null);
        if (!mounted) return;

        // Prefer explicit fullName (non-empty), otherwise try first/last, otherwise fallback to email
        const resolvedFullName = (me.fullName && String(me.fullName).trim())
          ? String(me.fullName).trim()
          : ((me.firstName || me.lastName)
              ? `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim()
              : (me.email ?? ""));
        setFullName(resolvedFullName);
        setEmail(me.email ?? "");
        setEmailVerified(me.emailVerified ?? false);
        setAvatar(me.avatarUrl ?? null);

        // phoneNumber may be stored on the user or on the tenant object
        const tenantPhone = (me.tenants && Array.isArray(me.tenants) && me.tenants[0] && me.tenants[0].tenant && me.tenants[0].tenant.phone)
          ? me.tenants[0].tenant.phone
          : null;
        // Treat empty string as absent: prefer explicit non-empty user phone, otherwise tenant phone
        const phoneSource = (me.phoneNumber && String(me.phoneNumber).trim() !== "")
          ? me.phoneNumber
          : (tenantPhone && String(tenantPhone).trim() !== "")
            ? tenantPhone
            : null;
        if (phoneSource) {
          try {
            const parsed = parsePhoneNumberFromString(String(phoneSource));
            if (parsed && parsed.country) {
              setPhoneCode(`+${parsed.countryCallingCode}`);
              setPhoneNumber(parsed.nationalNumber ?? String(phoneSource).replace(/\s+/g, ""));
            } else {
              const match = String(phoneSource).match(/^(\+\d{1,3})\s*(.*)$/);
              if (match) {
                setPhoneCode(match[1]);
                setPhoneNumber(match[2].replace(/\s+/g, ""));
              } else {
                setPhoneNumber(String(phoneSource).replace(/\s+/g, ""));
              }
            }
          } catch (err) {
            const match = String(phoneSource).match(/^(\+\d{1,3})\s*(.*)$/);
            if (match) {
              setPhoneCode(match[1]);
              setPhoneNumber(match[2].replace(/\s+/g, ""));
            } else {
              setPhoneNumber(String(phoneSource).replace(/\s+/g, ""));
            }
          }
        }
      } catch {
        toast.error("No se pudo cargar tu perfil.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authLoading]);

  const handleAvatarChange = (file: File | null) => {
    setAvatarFile(file);
    // Revoke any previously created object URL before replacing the preview.
    if (avatarObjectUrlRef.current) {
      URL.revokeObjectURL(avatarObjectUrlRef.current);
      avatarObjectUrlRef.current = null;
    }
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      avatarObjectUrlRef.current = objectUrl;
      setAvatar(objectUrl);
    } else {
      setAvatar(null);
    }
  };

  // Revoke the outstanding avatar object URL on unmount.
  useEffect(() => {
    return () => {
      if (avatarObjectUrlRef.current) {
        URL.revokeObjectURL(avatarObjectUrlRef.current);
        avatarObjectUrlRef.current = null;
      }
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { firstName, lastName } = splitFullName(fullName);

      // Build payload only with non-empty values to avoid overwriting DB with empty strings
      const payload: ProfilePayload = {};
      const trimmedFull = fullName.trim();
      if (trimmedFull) payload.fullName = trimmedFull;
      if (firstName && String(firstName).trim() !== "") payload.firstName = firstName;
      if (lastName && String(lastName).trim() !== "") payload.lastName = lastName;

      // Normalize phone to E.164 when possible before sending
      let phoneToSend = `${phoneCode} ${phoneNumber}`.trim();
      try {
        const parsedSend = parsePhoneNumberFromString(phoneToSend);
        if (parsedSend && parsedSend.isValid()) {
          phoneToSend = parsedSend.number; // E.164
        }
      } catch (err) {
        // keep raw value
      }
      if (phoneToSend && String(phoneToSend).trim() !== "") payload.phoneNumber = phoneToSend;

      let didUpdate = false;
      if (Object.keys(payload).length > 0) {
        await AccountService.updateProfile(payload);
        didUpdate = true;
      }
      if (avatarFile && currentTenantId && currentUserId) {
        try {
          // Convert file to data URL and send as avatars payload so backend
          // can handle base64 upload the same way as settings logos.
          const toDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(file);
          });

          const dataUrl = await toDataUrl(avatarFile);

          await AccountService.updateProfile({ avatars: [{ data: dataUrl, name: avatarFile.name, sizeInBytes: avatarFile.size, mimeType: avatarFile.type }] });

          const refreshed = await AccountService.getMe();
          const refreshedMe = normalizeMe(refreshed);
          // The server now has the avatar; drop the local blob preview URL.
          if (avatarObjectUrlRef.current) {
            URL.revokeObjectURL(avatarObjectUrlRef.current);
            avatarObjectUrlRef.current = null;
          }
          setAvatar(refreshedMe.avatarUrl ?? null);
          didUpdate = true;
        } catch (err) {
          console.error('Avatar upload failed', err);
          toast.error('No se pudo subir el avatar.');
        }
      }
      if (didUpdate) {
        toast.success("Perfil actualizado correctamente.");
      } else {
        toast.success("No hubo cambios para guardar.");
      }
    } catch (e) {
      toast.error((e as ApiError)?.response?.data?.message ?? "Error al guardar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleEmailAction = () => {
    if (emailVerified) {
      setShowEmailModal(true);
      setNewEmail("");
      setPassword("");
    } else {
      handleVerifyEmail();
    }
  };

  const handleVerifyEmail = async () => {
    try {
      await AccountService.sendVerifyEmail(email);
      toast.success("Se envió un correo de verificación.");
    } catch {
      toast.error("No se pudo enviar el correo de verificación.");
    }
  };

  const handleChangeEmail = async () => {
    if (!password || !newEmail) {
      toast.error("Por favor completa todos los campos.");
      return;
    }

    try {
      await AccountService.changeEmail({ password, newEmail });
      toast.success("Correo actualizado correctamente. Verifica tu nuevo correo.");
      setEmail(newEmail);
      setEmailVerified(false);
      setShowEmailModal(false);
      setPassword("");
      setNewEmail("");
    } catch (e) {
      toast.error((e as ApiError)?.response?.data?.message ?? "Error al cambiar el correo.");
    }
  };

  const handleVerifyPhone = async () => {
    if (!verificationCode) {
      toast.error("Por favor ingresa el código de verificación.");
      return;
    }

    try {
      toast.success("Número verificado correctamente.");
      setShowPhoneVerifyModal(false);
      setVerificationCode("");
    } catch (e) {
      toast.error((e as ApiError)?.response?.data?.message ?? "Error al verificar el número.");
    }
  };

  const handleSendVerificationCode = async () => {
    try {
      toast.success("Código de verificación enviado.");
      setShowPhoneVerifyModal(true);
    } catch (e) {
      toast.error((e as ApiError)?.response?.data?.message ?? "Error al enviar el código.");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center">
          <div className="cg-skeleton h-32 w-32 rounded-2xl" />
        </div>
        <SkeletonCards count={2} className="sm:grid-cols-1" />
      </div>
    );
  }

  return (
    <>
      <Stagger className="space-y-6">
        {/* ── Identidad ─────────────────────────────────────────────── */}
        <Section title="Identidad" icon={<UserRound />} contentClassName="space-y-6">
          <div className="flex justify-center">
            <AvatarUploader src={avatar ?? undefined} onChange={handleAvatarChange} size={128} />
          </div>

          <div className="space-y-2">
            <Label>{t('profile.name')}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>
              Es el nombre con el que te ve el resto del equipo.
            </p>
          </div>
        </Section>

        {/* ── Contacto ──────────────────────────────────────────────── */}
        <Section title="Contacto" icon={<Mail />} contentClassName="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="mb-0">{t('profile.email')}</Label>
              <StatusBadge tone={emailVerified ? 'ok' : 'warn'}>
                {emailVerified ? 'Verificado' : 'Sin verificar'}
              </StatusBadge>
            </div>
            <Input value={email} disabled className="cursor-not-allowed" />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                style={{ color: 'var(--brand-text)' }}
                onClick={handleEmailAction}
              >
                {emailVerified ? t('profile.changeEmail') : t('profile.verifyEmail')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('profile.phone')}</Label>
            <PhoneField
              code={phoneCode}
              number={phoneNumber}
              onCodeChange={setPhoneCode}
              onNumberChange={setPhoneNumber}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{t('profile.phoneExample')}</p>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                style={{ color: 'var(--brand-text)' }}
                onClick={handleSendVerificationCode}
              >
                {t('profile.confirmNumber')}
              </Button>
            </div>
          </div>
        </Section>

        {/* ── Preferencias ──────────────────────────────────────────── */}
        <Section title="Preferencias" icon={<Languages />} contentClassName="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('profile.selectLanguage')}</Label>
            <Select
              value={language}
              onValueChange={(value) => {
                setLanguage(value as "es" | "en" | "pt");
                toast.success(t('profile.languageSaved'));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Idioma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es">🇪🇸 Español</SelectItem>
                <SelectItem value="en">🇺🇸 English</SelectItem>
                <SelectItem value="pt">🇧🇷 Português</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{t('profile.languageSaved')}</p>
          </div>

          <div className="glass-sunken flex items-start gap-3 p-4">
            <Globe className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--ink-faint)' }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
              El idioma se aplica sólo a tu cuenta. Cada persona del equipo elige el suyo.
            </p>
          </div>
        </Section>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="brand"
            className="px-6"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? t('profile.saving') : t('profile.save')}
          </Button>
        </div>
      </Stagger>

      <Modal
        open={showEmailModal}
        onOpenChange={setShowEmailModal}
        icon={<Mail />}
        title={t('profile.changeEmailTitle')}
        description={t('profile.changeEmailDesc')}
        footer={
          <Button variant="brand" onClick={handleChangeEmail}>
            Guardar
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">{t('profile.password')}</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newEmail">{t('profile.newEmail')}</Label>
            <Input
              id="newEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="nuevo@correo.com"
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={showPhoneVerifyModal}
        onOpenChange={setShowPhoneVerifyModal}
        icon={<Phone />}
        title={t('profile.verifyNumberTitle')}
        description={t('profile.verifyNumberDesc')}
        footer={
          <Button
            onClick={handleVerifyPhone}
            className="text-muted-foreground hover:text-foreground/70"
            variant="ghost"
          >
            {t('profile.send')}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="verificationCode">{t('profile.enterVerificationCode')}</Label>
            <Input
              id="verificationCode"
              type="text"
              placeholder="123456"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
