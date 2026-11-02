import React, { useEffect, useState, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  MapPin,
  Radio,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { FadeIn, IconTile, InfoNote } from "@/components/kit";
import AuthShell, {
  BOTON_PRINCIPAL,
  CAMPO,
  Etiqueta,
} from "@/pages/auth/AuthShell";
import { ApiService } from "@/services/api/apiService";
import { AuthService } from "@/services/auth/authService";

// Supervisor app (patrullaje vehicular) store listings — the same ones the
// server's app version policy uses; overridable via env.
const SUPERVISOR_PLAY_URL =
  (import.meta as any).env?.VITE_SUPERVISOR_PLAY_URL ||
  "https://play.google.com/store/apps/details?id=com.cguardpro.supervisor";
const SUPERVISOR_IOS_URL =
  (import.meta as any).env?.VITE_SUPERVISOR_IOS_URL ||
  "https://apps.apple.com/app/id6786120830";

/**
 * SupervisorRegistration — onboarding for a SUPERVISOR (securitySupervisor).
 * A supervisor's home is the supervisor (patrullaje vehicular) app, NOT this
 * CRM. So — like guards and customers — after setting a password we DO NOT sign
 * them into the panel; we show a confirmation pointing them to the supervisor
 * app and clear any session token so they can never land on the dashboard.
 */
export default function SupervisorRegistration() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const rawInviteToken =
    searchParams.get("token") ||
    searchParams.get("invitationToken") ||
    searchParams.get("invite") ||
    undefined;
  const inviteToken =
    rawInviteToken &&
    rawInviteToken !== "null" &&
    rawInviteToken !== "undefined"
      ? rawInviteToken
      : undefined;
  const inviteType = searchParams.get("inviteType") || undefined;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [lockedName, setLockedName] = useState(false);
  const [lockedEmail, setLockedEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fetched, setFetched] = useState<any>(null);
  const [inviteNotFound, setInviteNotFound] = useState(false);
  /* The link came with a token that cannot be opened (used, expired or
     invalid): the form cannot be submitted without it, so it is not shown —
     the page says what happened and what to do, like the guard page. */
  const enlaceCaido = inviteNotFound && !!inviteToken;
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const shownToastRef = useRef<string | null>(null);

  /** El campo en rojo cuando falla la validación — con el token, para que el
   *  borde y el mensaje sean el MISMO rojo del sistema. */
  const estiloError = (field: string) =>
    errors[field]
      ? ({
          borderColor: "var(--bad)",
          boxShadow:
            "0 0 0 3px color-mix(in oklab, var(--bad) 22%, transparent)",
        } as React.CSSProperties)
      : undefined;

  useEffect(() => {
    const fetchInvite = async () => {
      /* NO se borra la sesión del navegador. Antes se hacía «para empezar limpio»,
         pero `localStorage` es COMPARTIDO por todas las pestañas: el admin que
         abría un enlace de invitación (para probarlo o reenviarlo) quedaba
         expulsado, y como esto se re-ejecuta en cada repintado, lo volvía a
         echar CADA vez que entraba — el bucle «me manda al login» de Prueba
         Strategos (2026-10-01). Esta página no usa la sesión: todas sus
         peticiones van con `skipAuth`. */

      if (!inviteToken) return;
      // Defensive: honor other invite types if an old link reaches this page.
      if (inviteType === "guard") {
        navigate(
          `/auth/invitation?token=${encodeURIComponent(inviteToken)}&inviteType=guard`,
          { replace: true },
        );

        return;
      }
      if (inviteType === "client") {
        navigate(
          `/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`,
          { replace: true },
        );

        return;
      }
      if (inviteType === "staff" || inviteType === "admin") {
        navigate(
          `/auth/accept-invitation?token=${encodeURIComponent(inviteToken)}&inviteType=staff`,
          { replace: true },
        );

        return;
      }

      setIsLoading(true);
      try {
        const res = await ApiService.get(
          `/user/public?token=${encodeURIComponent(inviteToken)}`,
          { skipAuth: true },
        );
        const data = res?.data || res;

        if (!data) {
          setInviteNotFound(true);

          return;
        }
        setFetched(data);
        const rootName =
          data.fullName ||
          data.name ||
          (data.firstName
            ? `${data.firstName} ${data.lastName || ""}`.trim()
            : undefined);
        const emailCandidate = data.email || undefined;

        if (rootName) {
          setName(rootName);
          setLockedName(true);
        }
        if (emailCandidate) {
          setEmail(emailCandidate);
          setLockedEmail(true);
        }
      } catch (err: any) {
        if (shownToastRef.current !== "notfound") {
          shownToastRef.current = "notfound";
        }
        setInviteNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvite();
  }, [inviteToken, inviteType, navigate]);

  const validateEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!name?.trim())
      nextErrors.name = t(
        "invite.val.name_required",
        "El nombre es obligatorio",
      );
    if (!email?.trim())
      nextErrors.email = t(
        "invite.val.email_required",
        "El correo electrónico es obligatorio",
      );
    else if (!validateEmail(email))
      nextErrors.email = t(
        "invite.val.email_invalid",
        "Correo electrónico inválido",
      );
    if (!password)
      nextErrors.password = t(
        "invite.val.password_required",
        "La contraseña es obligatoria",
      );
    else {
      if (password.length < 8)
        nextErrors.password = t(
          "invite.val.password_short",
          "La contraseña debe tener al menos 8 caracteres",
        );
      else if (!/[A-Z]/.test(password))
        nextErrors.password = t(
          "ui.registration.laContrasenaDebeContenerMayuscula",
          "La contraseña debe contener al menos una letra mayúscula",
        );
      else if (!/[a-z]/.test(password))
        nextErrors.password = t(
          "ui.registration.laContrasenaDebeContenerMinuscula",
          "La contraseña debe contener al menos una letra minúscula",
        );
      else if (!/[0-9]/.test(password))
        nextErrors.password = t(
          "ui.registration.laContrasenaDebeContenerNumero",
          "La contraseña debe contener al menos un número",
        );
      else if (!/[^A-Za-z0-9]/.test(password))
        nextErrors.password = t(
          "ui.registration.laContrasenaDebeContenerEspecial",
          "La contraseña debe contener al menos un carácter especial",
        );
    }
    if (!confirm)
      nextErrors.confirm = t(
        "invite.val.confirm_required",
        "Confirme la contraseña",
      );
    if (password && confirm && password !== confirm)
      nextErrors.confirm = t(
        "invite.val.mismatch",
        "Las contraseñas no coinciden",
      );
    setErrors(nextErrors);

    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      const payload: any = {
        email,
        password,
        invitationToken: inviteToken,
        name,
      };

      await AuthService.signUp(payload);
      // A supervisor is NOT a CRM web-admin — do NOT sign them in or send them to
      // /login: show the supervisor app confirmation. `signUp` no guarda sesión,
      // así que aquí no hay nada que borrar (borrar echaba al admin de las demás
      // pestañas).
      toast.success(t("ui.registration.cuentaActivada"));
      setDone(true);
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {}
    } catch (err: any) {
      toast.error(
        err?.message || t("invite.error.register", "Error al registrar"),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const empresa: string | undefined = fetched?.tenant?.name || undefined;

  /** El ojo de mostrar/ocultar. Va DENTRO del campo, así que hereda su hueco. */
  const Ojo = ({
    visible,
    onToggle,
  }: {
    visible: boolean;
    onToggle: () => void;
  }) => (
    <button
      aria-label={
        visible
          ? t("auth.hide_password", "Ocultar contraseña")
          : t("auth.show_password", "Mostrar contraseña")
      }
      className="cg-focus absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2.5"
      style={{ color: "var(--ink-faint)" }}
      type="button"
      onClick={onToggle}
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <AuthShell
      brandName={empresa}
      eyebrow={t('invite.eyebrow_supervisor', 'Invitación · Supervisión')}
      features={[
        { icon: MapPin, label: t('invite.supervisor.feature_patrol', 'Recorridos y patrullaje') },
        { icon: Radio, label: t('invite.supervisor.feature_news', 'Novedades del turno') },
        { icon: Clock, label: t('invite.supervisor.feature_team_live', 'Tu equipo, en directo') },
      ]}
      logoUrl={fetched?.tenant?.logoUrl || undefined}
      subtitle={
        done
          ? t("invite.accessReady", "Tu acceso quedó listo.")
          : enlaceCaido
            ? undefined
            : t(
                "ui.SupervisorRegistration.creaUnaContrasenaParaTuCuenta",
                "Crea una contraseña para tu cuenta. Supervisarás tus recorridos y tu equipo desde la app de supervisor.",
              )
      }
      title={done ? t("ui.registration.cuentaActivada", "¡Cuenta activada!") : t('supervisor.registration_title', { defaultValue: 'Registro de supervisor' })}
      width="lg"
      /* Ya se ha ido a la red a por la invitaci\u00f3n: la cortina de 2,5 s s\u00f3lo
         retrasar\u00eda un formulario que el usuario est\u00e1 esperando. */
      splash={false}
    >
      {done ? (
        /* Un supervisor NO entra al CRM: su casa es la app de supervisor. */
        <FadeIn className="text-center">
          <div className="mb-5 flex justify-center">
            <IconTile size="lg" tone="ok">
              <CheckCircle2 />
            </IconTile>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--ink-soft)" }}
          >
            <Trans
              components={{ b: <strong style={{ color: "var(--ink)" }} /> }}
              defaults="Tu cuenta con <b>{{empresa}}</b> está lista. Descarga la <b>app de supervisor</b> para gestionar tus recorridos, tu equipo y las novedades desde tu teléfono."
              i18nKey="ui.SupervisorRegistration.tuCuentaConEstaListaDescarga"
              values={{
                empresa:
                  empresa ||
                  t(
                    "ui.SupervisorRegistration.tuEmpresaDeSeguridad",
                    "tu empresa de seguridad",
                  ),
              }}
            />
          </p>

          <div className="mt-6 space-y-3 text-left">
            <PasoSiguiente
              description={t("ui.registration.iniciaSesiU00f3nConEl")}
              icon={<Smartphone />}
              title={t("ui.registration.descargaLaAppDeSupervisor")}
            />
            <PasoSiguiente
              description={t("ui.registration.tuEmpresaTeAsignarU00e1")}
              icon={<Clock />}
              title={t("ui.registration.esperaLaAsignaciU00f3n")}
            />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <a
              className="cg-btn-glass cg-focus flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold"
              href={SUPERVISOR_PLAY_URL}
              rel="noreferrer"
              target="_blank"
            >
              Google Play
            </a>
            <a
              className="cg-btn-glass cg-focus flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold"
              href={SUPERVISOR_IOS_URL}
              rel="noreferrer"
              target="_blank"
            >
              App Store
            </a>
          </div>

          <p className="mt-5 text-xs" style={{ color: "var(--ink-faint)" }}>
            {t("ui.registration.yaPuedesCerrarEstaVentana")}
          </p>
        </FadeIn>
      ) : enlaceCaido ? (
        <div className="space-y-3">
          <InfoNote icon={<AlertTriangle />} tone="warn">
            {t("supervisor.invite_not_found", {
              defaultValue: "Invitación no encontrada o inválida.",
            })}
          </InfoNote>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("ui.SupervisorRegistration.pideInvitacionNueva", {
              defaultValue:
                "Si ya activaste tu cuenta, entra en la app de supervisor con tu correo y contraseña. Si no, pide a tu empresa que te envíe una invitación nueva.",
            })}
          </p>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Etiqueta htmlFor="sup-nombre">{t("comun.nombre")}</Etiqueta>
              <input
                aria-invalid={!!errors.name}
                className={CAMPO}
                disabled={isLoading || lockedName}
                id="sup-nombre"
                placeholder={t("comun.nombre")}
                style={estiloError("name")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((p) => ({ ...p, name: undefined }));
                }}
              />
              {errors.name && (
                <p
                  className="mt-1.5 text-xs"
                  style={{ color: "var(--bad-text)" }}
                >
                  {errors.name}
                </p>
              )}
            </div>
            <div>
              <Etiqueta htmlFor="sup-email">
                {t("ui.registration.correoElectrU00f3nico")}
              </Etiqueta>
              <input
                aria-invalid={!!errors.email}
                className={CAMPO}
                disabled={isLoading || lockedEmail}
                id="sup-email"
                placeholder={t("comun.tuCorreoCom")}
                style={estiloError("email")}
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrors((p) => ({ ...p, email: undefined }));
                }}
              />
              {errors.email && (
                <p
                  className="mt-1.5 text-xs"
                  style={{ color: "var(--bad-text)" }}
                >
                  {errors.email}
                </p>
              )}
            </div>
            <div>
              <Etiqueta htmlFor="sup-clave">
                {t("invite.password", "Contraseña")}
              </Etiqueta>
              <div className="relative">
                <input
                  aria-invalid={!!errors.password}
                  className={`${CAMPO} pr-12`}
                  disabled={isLoading}
                  id="sup-clave"
                  placeholder={t("invite.password_min", "Mínimo 8 caracteres")}
                  style={estiloError("password")}
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrors((p) => ({ ...p, password: undefined }));
                  }}
                />
                <Ojo visible={showPwd} onToggle={() => setShowPwd((v) => !v)} />
              </div>
              {errors.password && (
                <p
                  className="mt-1.5 text-xs"
                  style={{ color: "var(--bad-text)" }}
                >
                  {errors.password}
                </p>
              )}
            </div>
            <div>
              <Etiqueta htmlFor="sup-confirmar">
                {t("invite.confirm_password", "Confirmar contraseña")}
              </Etiqueta>
              <div className="relative">
                <input
                  aria-invalid={!!errors.confirm}
                  className={`${CAMPO} pr-12`}
                  disabled={isLoading}
                  id="sup-confirmar"
                  placeholder={t("ui.registration.repiteLaContraseU00f1a")}
                  style={estiloError("confirm")}
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setErrors((p) => ({ ...p, confirm: undefined }));
                  }}
                />
                <Ojo
                  visible={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                />
              </div>
              {errors.confirm && (
                <p
                  className="mt-1.5 text-xs"
                  style={{ color: "var(--bad-text)" }}
                >
                  {errors.confirm}
                </p>
              )}
            </div>
          </div>

          <button
            className={BOTON_PRINCIPAL}
            disabled={isLoading}
            type="submit"
          >
            {isLoading
              ? t("client.registering", { defaultValue: "Registrando\u2026" })
              : t("client.register", { defaultValue: "Activar mi cuenta" })}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

/** Fila de «qu\u00e9 pasa ahora»: ficha de icono + t\u00edtulo + explicaci\u00f3n. */
function PasoSiguiente({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="glass-sunken flex items-start gap-3 p-3.5">
      <IconTile size="sm" tone="neutral">
        {icon}
      </IconTile>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}
