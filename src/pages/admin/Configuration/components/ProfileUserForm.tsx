import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Mail, Phone, Globe, UserRound, Languages } from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useNavigate } from "react-router-dom";

import AvatarUploader from "./profile/AvatarUploader";
import PhoneField from "./profile/PhoneField";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import AccountService, { ProfilePayload } from "@/services/accountService";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage, LANGUAGES } from "@/contexts/LanguageContext";
import {
  Section,
  Modal,
  Stagger,
  StatusBadge,
  SkeletonCards,
} from "@/components/kit";
import { ejemploDeTelefono } from "@/lib/telefonoDeLaEmpresa";
import { reducirFoto } from "@/lib/reducirFoto";
import { getServerErrorMessage } from "@/lib/utils";
import {
  EMAIL_PATTERN,
  isValidPhone,
  phoneForServer,
} from "./profile/contactFields";

type MeTenantSetting = { theme?: string; logoUrl?: string | null };
type MeTenant = { name?: string; phone?: string; settings?: MeTenantSetting[] };
type MeAvatar =
  | { downloadUrl?: string; privateUrl?: string; url?: string; src?: string }
  | string;

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
  phoneNumberVerified?: boolean;
};

// Raw /auth/me payload before normalization: fields may live at the top level or
// be wrapped under `user`/`data`.
type MeRaw = Partial<MeResponse> & { user?: MeRaw; data?: MeRaw };

// What POST /auth/send-phone-verification answers. `code` only comes back
// outside production (test copies have no SMS provider).
type SendPhoneCodeResponse = {
  delivered?: boolean;
  channel?: string | null;
  code?: string;
};

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
  const phoneNumberVerified = base?.phoneNumberVerified ?? false;

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
    phoneNumberVerified,
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
  const { language, choice } = useLanguage();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [fullName, setFullName] = useState("");

  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  // Sin prefijo de partida: el de Ecuador se le colaba en el teléfono a
  // cualquier administrador que no llegara a tocar el selector de país.
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  // The number the server has marked as verified («» when none). The badge
  // only says «Verificado» while the field still shows that same number.
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  // The number as loaded, to tell a number typed now from a stored one.
  const phoneAtLoad = useRef<string | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
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

        if (import.meta.env.DEV)
          console.log(
            "[ProfileUserForm] /auth/me response raw:",
            raw,
            "normalized:",
            me,
          );
        setCurrentUserId(raw?.id ?? null);
        const tid =
          raw?.tenants && raw.tenants.length
            ? raw.tenants[0].tenant?.id
            : localStorage.getItem("tenantId");

        setCurrentTenantId(tid ?? null);
        if (!mounted) return;

        // Prefer explicit fullName (non-empty), otherwise try first/last, otherwise fallback to email
        const resolvedFullName =
          me.fullName && String(me.fullName).trim()
            ? String(me.fullName).trim()
            : me.firstName || me.lastName
              ? `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim()
              : (me.email ?? "");

        setFullName(resolvedFullName);
        setEmail(me.email ?? "");
        setEmailVerified(me.emailVerified ?? false);
        setVerifiedPhone(
          me.phoneNumberVerified && me.phoneNumber
            ? String(me.phoneNumber).replace(/\s+/g, "")
            : "",
        );
        setAvatar(me.avatarUrl ?? null);

        // phoneNumber may be stored on the user or on the tenant object
        const tenantPhone =
          me.tenants &&
          Array.isArray(me.tenants) &&
          me.tenants[0] &&
          me.tenants[0].tenant &&
          me.tenants[0].tenant.phone
            ? me.tenants[0].tenant.phone
            : null;
        // Treat empty string as absent: prefer explicit non-empty user phone, otherwise tenant phone
        const phoneSource =
          me.phoneNumber && String(me.phoneNumber).trim() !== ""
            ? me.phoneNumber
            : tenantPhone && String(tenantPhone).trim() !== ""
              ? tenantPhone
              : null;

        if (phoneSource) {
          try {
            const parsed = parsePhoneNumberFromString(String(phoneSource));

            if (parsed && parsed.country) {
              setPhoneCode(`+${parsed.countryCallingCode}`);
              setPhoneNumber(
                parsed.nationalNumber ??
                  String(phoneSource).replace(/\s+/g, ""),
              );
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
        toast.error(t("ui.ProfileUserForm.noSePudoCargarTu"));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [authLoading]);

  useEffect(() => {
    if (!loading && phoneAtLoad.current === null) {
      phoneAtLoad.current = `${phoneCode}|${phoneNumber}`;
    }
  }, [loading]);

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
    // «Confirmar número» refused a number the profile had just saved. Only a
    // number typed now is checked: an old stored one must not block saving
    // the name or the photo.
    const phoneTouched =
      phoneAtLoad.current !== null &&
      phoneAtLoad.current !== `${phoneCode}|${phoneNumber}`;

    if (phoneTouched && !isValidPhone(phoneCode, phoneNumber)) {
      toast.error(
        t(
          "ui.ProfileUserForm.telefonoNoValido",
          "Ese teléfono no parece válido. Revisa el país y el número.",
        ),
      );

      return;
    }
    setSaving(true);
    try {
      const { firstName, lastName } = splitFullName(fullName);

      // Build payload only with non-empty values to avoid overwriting DB with empty strings
      const payload: ProfilePayload = {};
      const trimmedFull = fullName.trim();

      if (trimmedFull) payload.fullName = trimmedFull;
      if (firstName && String(firstName).trim() !== "")
        payload.firstName = firstName;
      if (lastName && String(lastName).trim() !== "")
        payload.lastName = lastName;

      // Normalize phone to E.164 when possible before sending
      const phoneToSend = phoneForServer(phoneCode, phoneNumber);

      if (phoneToSend && String(phoneToSend).trim() !== "")
        payload.phoneNumber = phoneToSend;

      let didUpdate = false;

      if (Object.keys(payload).length > 0) {
        await AccountService.updateProfile(payload);
        didUpdate = true;
      }
      if (avatarFile && currentTenantId && currentUserId) {
        try {
          // La foto viaja en base64 dentro del PUT y el servidor corta a
          // 2 MB: una de móvil (3-5 MB) fallaba siempre. Se reduce antes
          // (lib/reducirFoto) a 1024 px y JPEG.
          const foto = await reducirFoto(avatarFile);
          const nombre = foto.mimeType === "image/jpeg" ? avatarFile.name.replace(/\.[^.]+$/, "") + ".jpg" : avatarFile.name;

          await AccountService.updateProfile({
            avatars: [
              {
                data: foto.dataUrl,
                name: nombre,
                sizeInBytes: foto.sizeInBytes,
                mimeType: foto.mimeType,
              },
            ],
          });

          const refreshed = await AccountService.getMe();
          const refreshedMe = normalizeMe(refreshed);

          // The server now has the avatar; drop the local blob preview URL.
          if (avatarObjectUrlRef.current) {
            URL.revokeObjectURL(avatarObjectUrlRef.current);
            avatarObjectUrlRef.current = null;
          }
          setAvatar(refreshedMe.avatarUrl ?? null);
          // Uploaded: later saves must not send the same photo again.
          setAvatarFile(null);
          didUpdate = true;
        } catch (err) {
          console.error("Avatar upload failed", err);
          toast.error(t("ui.ProfileUserForm.noSePudoSubirEl"));
        }
      }
      if (didUpdate) {
        phoneAtLoad.current = `${phoneCode}|${phoneNumber}`;
        // Saving another number drops its verification (server side too).
        if (payload.phoneNumber && payload.phoneNumber !== verifiedPhone) {
          setVerifiedPhone("");
        }
        toast.success(
          t(
            "ui.ProfileUserForm.perfilActualizadoCorrectamente",
            "Perfil actualizado correctamente.",
          ),
        );
      } else {
        toast.success(t("ui.ProfileUserForm.noHuboCambiosParaGuardar"));
      }
    } catch (e) {
      toast.error(
        getServerErrorMessage(
          e,
          t("settings.profile.errors.save", "Error al guardar el perfil."),
        ),
      );
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
      toast.success(t("ui.ProfileUserForm.seEnvioUnCorreoDe"));
    } catch {
      toast.error(t("ui.ProfileUserForm.noSePudoEnviarEl"));
    }
  };

  const handleChangeEmail = async () => {
    if (!password || !newEmail) {
      toast.error(t("ui.ProfileUserForm.porFavorCompletaTodosLos"));

      return;
    }
    if (!EMAIL_PATTERN.test(newEmail.trim())) {
      toast.error(
        t("ui.ProfileUserForm.correoNoValido", "Ese correo no es válido."),
      );

      return;
    }
    if (newEmail.trim().toLowerCase() === email.trim().toLowerCase()) {
      toast.error(
        t("ui.ProfileUserForm.esTuCorreoActual", "Ese ya es tu correo."),
      );

      return;
    }

    try {
      await AccountService.changeEmail({ password, newEmail: newEmail.trim() });
      toast.success(
        t("ui.ProfileUserForm.correoActualizadoCorrectamenteVerificaTu"),
      );
      setEmail(newEmail.trim());
      setEmailVerified(false);
      setShowEmailModal(false);
      setPassword("");
      setNewEmail("");
    } catch (e) {
      toast.error(
        getServerErrorMessage(
          e,
          t(
            "settings.profile.errors.changeEmail",
            "Error al cambiar el correo.",
          ),
        ),
      );
    }
  };

  const currentPhone = phoneForServer(phoneCode, phoneNumber);
  const phoneIsVerified =
    !!verifiedPhone && currentPhone.replace(/\s+/g, "") === verifiedPhone;

  const handleVerifyPhone = async () => {
    const code = verificationCode.trim();

    if (!code) {
      toast.error(t("ui.ProfileUserForm.porFavorIngresaElCodigo"));

      return;
    }

    setVerifyingCode(true);
    try {
      await AccountService.verifyPhone(code, currentPhone);
      setVerifiedPhone(currentPhone.replace(/\s+/g, ""));
      toast.success(t("ui.ProfileUserForm.numeroVerificadoCorrectamente"));
      setShowPhoneVerifyModal(false);
      setVerificationCode("");
    } catch (e) {
      toast.error(
        getServerErrorMessage(
          e,
          t(
            "settings.profile.errors.verifyPhone",
            "Error al verificar el número.",
          ),
        ),
      );
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleSendVerificationCode = async () => {
    if (!phoneNumber.trim()) {
      toast.error(
        t(
          "ui.ProfileUserForm.escribeTuNumeroAntes",
          "Escribe tu número móvil antes de confirmarlo.",
        ),
      );

      return;
    }

    setSendingCode(true);
    try {
      const res = (await AccountService.sendPhoneVerificationCode(
        currentPhone,
      )) as SendPhoneCodeResponse | undefined;

      if (res?.delivered) {
        toast.success(t("ui.ProfileUserForm.codigoDeVerificacionEnviado"));
      } else if (res?.code) {
        // Test copy without SMS/WhatsApp: the server hands the code back.
        toast.info(
          t("ui.ProfileUserForm.codigoDePrueba", {
            defaultValue:
              "No hay proveedor de SMS en este entorno. Código de prueba: {{code}}",
            code: res.code,
          }),
        );
      } else {
        toast.error(
          t(
            "ui.ProfileUserForm.codigoNoEntregado",
            "No pudimos enviar el código a ese número. Revisa el número o inténtalo más tarde.",
          ),
        );

        return;
      }
      setVerificationCode("");
      setShowPhoneVerifyModal(true);
    } catch (e) {
      toast.error(
        getServerErrorMessage(
          e,
          t("settings.profile.errors.sendCode", "Error al enviar el código."),
        ),
      );
    } finally {
      setSendingCode(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-center">
          <div className="cg-skeleton h-32 w-32 rounded-2xl" />
        </div>
        <SkeletonCards className="sm:grid-cols-1" count={2} />
      </div>
    );
  }

  return (
    <>
      <Stagger className="space-y-6">
        {/* ── Identidad ─────────────────────────────────────────────── */}
        <Section
          contentClassName="space-y-6"
          icon={<UserRound />}
          title={t("settings.companyProfile.sectionIdentity", "Identidad")}
        >
          <div className="flex justify-center">
            <AvatarUploader
              size={128}
              src={avatar ?? undefined}
              onChange={handleAvatarChange}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("profile.name")}</Label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {t(
                "ui.ProfileUserForm.esElNombreConEl",
                "Es el nombre con el que te ve el resto del equipo.",
              )}
            </p>
          </div>
        </Section>

        {/* ── Contacto ──────────────────────────────────────────────── */}
        <Section
          contentClassName="grid gap-6 md:grid-cols-2"
          icon={<Mail />}
          title={t("ui.ProfileUserForm.contacto")}
        >
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="mb-0">{t("profile.email")}</Label>
              <StatusBadge tone={emailVerified ? "ok" : "warn"}>
                {emailVerified
                  ? t("ui.ProfileUserForm.verificado", "Verificado")
                  : t("revision.sinVerificar", "Sin verificar")}
              </StatusBadge>
            </div>
            <Input disabled className="cursor-not-allowed" value={email} />
            <div className="flex justify-end">
              <Button
                className="h-auto p-0 text-xs"
                style={{ color: "var(--brand-text)" }}
                type="button"
                variant="link"
                onClick={handleEmailAction}
              >
                {emailVerified
                  ? t("profile.changeEmail")
                  : t("profile.verifyEmail")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="mb-0">{t("profile.phone")}</Label>
              {phoneNumber.trim() !== "" && (
                <StatusBadge tone={phoneIsVerified ? "ok" : "warn"}>
                  {phoneIsVerified
                    ? t("ui.ProfileUserForm.verificado", "Verificado")
                    : t("revision.sinVerificar", "Sin verificar")}
                </StatusBadge>
              )}
            </div>
            <PhoneField
              code={phoneCode}
              number={phoneNumber}
              onCodeChange={setPhoneCode}
              onNumberChange={setPhoneNumber}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t("profile.phoneExample", { ejemplo: ejemploDeTelefono() })}
              </p>
              {!phoneIsVerified && (
                <Button
                  className="h-auto p-0 text-xs"
                  disabled={sendingCode}
                  style={{ color: "var(--brand-text)" }}
                  type="button"
                  variant="link"
                  onClick={handleSendVerificationCode}
                >
                  {t("profile.confirmNumber")}
                </Button>
              )}
            </div>
          </div>
        </Section>

        {/* ── Preferencias ──────────────────────────────────────────────
            El idioma tiene pantalla propia (Configuración › Idioma), que además
            permite volver a «Automático». Aquí sólo se muestra en cuál estás y
            se lleva allí: dos selectores para lo mismo es la vía rápida a que
            uno de los dos se quede atrás. */}
        <Section
          contentClassName="grid gap-6 md:grid-cols-2"
          icon={<Languages />}
          title={t("profile.preferencesSection", {
            defaultValue: "Preferencias",
          })}
        >
          <div className="space-y-2">
            <Label>{t("profile.selectLanguage")}</Label>
            <div className="glass-sunken flex items-center justify-between gap-3 rounded-2xl p-3">
              <span
                className="flex items-center gap-2 text-sm"
                style={{ color: "var(--ink)" }}
              >
                <span aria-hidden>{LANGUAGES[language].flag}</span>
                {LANGUAGES[language].name}
                {choice === "auto" && (
                  <StatusBadge dot={false} tone="neutral">
                    {t("profile.languageAutoBadge", {
                      defaultValue: "Automático",
                    })}
                  </StatusBadge>
                )}
              </span>
              <Button
                className="h-auto p-0 text-xs"
                style={{ color: "var(--brand-text)" }}
                type="button"
                variant="link"
                onClick={() => navigate("/setting/idioma")}
              >
                {t("profile.languageChange", { defaultValue: "Cambiar" })}
              </Button>
            </div>
          </div>

          <div className="glass-sunken flex items-start gap-3 p-4">
            <Globe
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: "var(--ink-faint)" }}
            />
            <p
              className="text-xs leading-relaxed"
              style={{ color: "var(--ink-soft)" }}
            >
              {t("profile.languageScopeHint", {
                defaultValue:
                  "El idioma se aplica sólo a tu cuenta. Cada persona del equipo elige el suyo.",
              })}
            </p>
          </div>
        </Section>

        <div className="flex justify-end">
          <Button
            className="px-6"
            disabled={saving}
            type="button"
            variant="brand"
            onClick={handleSave}
          >
            {saving ? t("profile.saving") : t("profile.save")}
          </Button>
        </div>
      </Stagger>

      <Modal
        description={t("profile.changeEmailDesc")}
        footer={
          <Button variant="brand" onClick={handleChangeEmail}>
            {t("actions.save", "Guardar")}
          </Button>
        }
        icon={<Mail />}
        open={showEmailModal}
        title={t("profile.changeEmailTitle")}
        onOpenChange={setShowEmailModal}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">{t("profile.password")}</Label>
            <Input
              id="password"
              placeholder="••••••••••••"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newEmail">{t("profile.newEmail")}</Label>
            <Input
              id="newEmail"
              placeholder={t("ui.ProfileUserForm.nuevoCorreoCom")}
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      <Modal
        description={t("profile.verifyNumberDesc")}
        footer={
          <Button
            className="text-muted-foreground hover:text-foreground/70"
            disabled={verifyingCode}
            variant="ghost"
            onClick={handleVerifyPhone}
          >
            {t("profile.send")}
          </Button>
        }
        icon={<Phone />}
        open={showPhoneVerifyModal}
        title={t("profile.verifyNumberTitle")}
        onOpenChange={setShowPhoneVerifyModal}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="verificationCode">
              {t("profile.enterVerificationCode")}
            </Label>
            <Input
              autoComplete="one-time-code"
              id="verificationCode"
              inputMode="numeric"
              placeholder="123456"
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
