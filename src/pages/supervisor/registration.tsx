import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, Eye, EyeOff, MapPin, Radio, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { FadeIn, IconTile, InfoNote } from "@/components/kit";
import AuthShell, { BOTON_PRINCIPAL, CAMPO, Etiqueta } from "@/pages/auth/AuthShell";
import { ApiService } from "@/services/api/apiService";
import { AuthService } from "@/services/auth/authService";

// Supervisor app (patrullaje vehicular) store links — configurable via env so
// they can be updated without a code change. Fallback to a store search until set.
const SUPERVISOR_PLAY_URL = (import.meta as any).env?.VITE_SUPERVISOR_PLAY_URL || "https://play.google.com/store/search?q=CGuardPro%20Supervisor&c=apps";
const SUPERVISOR_IOS_URL = (import.meta as any).env?.VITE_SUPERVISOR_IOS_URL || "https://apps.apple.com/search?term=CGuardPro%20Supervisor";

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
  const rawInviteToken = searchParams.get("token") || searchParams.get("invitationToken") || searchParams.get("invite") || undefined;
  const inviteToken = rawInviteToken && rawInviteToken !== "null" && rawInviteToken !== "undefined" ? rawInviteToken : undefined;
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
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const shownToastRef = useRef<string | null>(null);

  /** El campo en rojo cuando falla la validación — con el token, para que el
   *  borde y el mensaje sean el MISMO rojo del sistema. */
  const estiloError = (field: string) =>
    errors[field]
      ? ({ borderColor: 'var(--bad)', boxShadow: '0 0 0 3px color-mix(in oklab, var(--bad) 22%, transparent)' } as React.CSSProperties)
      : undefined;

  useEffect(() => {
    const fetchInvite = async () => {
      // Clear any active session so the invite flow starts clean and this
      // account never inherits a CRM session.
      if (inviteToken) {
        try {
          localStorage.removeItem("authToken");
          localStorage.removeItem("user");
        } catch (e) {
          console.warn("[supervisor-registration] could not clear session:", e);
        }
      }

      if (!inviteToken) return;
      // Defensive: honor other invite types if an old link reaches this page.
      if (inviteType === "guard") {
        navigate(`/auth/invitation?token=${encodeURIComponent(inviteToken)}&inviteType=guard`, { replace: true });
        return;
      }
      if (inviteType === "client") {
        navigate(`/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`, { replace: true });
        return;
      }
      if (inviteType === "staff" || inviteType === "admin") {
        navigate(`/auth/accept-invitation?token=${encodeURIComponent(inviteToken)}&inviteType=staff`, { replace: true });
        return;
      }

      setIsLoading(true);
      try {
        const res = await ApiService.get(`/user/public?token=${encodeURIComponent(inviteToken)}`, { skipAuth: true });
        const data = res?.data || res;
        if (!data) {
          setInviteNotFound(true);
          return;
        }
        setFetched(data);
        const rootName = data.fullName || data.name || (data.firstName ? `${data.firstName} ${data.lastName || ""}`.trim() : undefined);
        const emailCandidate = data.email || undefined;
        if (rootName) { setName(rootName); setLockedName(true); }
        if (emailCandidate) { setEmail(emailCandidate); setLockedEmail(true); }
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

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!name?.trim()) nextErrors.name = "El nombre es obligatorio";
    if (!email?.trim()) nextErrors.email = "El correo electrónico es obligatorio";
    else if (!validateEmail(email)) nextErrors.email = "Correo electrónico inválido";
    if (!password) nextErrors.password = "La contraseña es obligatoria";
    else {
      if (password.length < 8) nextErrors.password = "La contraseña debe tener al menos 8 caracteres";
      else if (!/[A-Z]/.test(password)) nextErrors.password = "La contraseña debe contener al menos una letra mayúscula";
      else if (!/[a-z]/.test(password)) nextErrors.password = "La contraseña debe contener al menos una letra minúscula";
      else if (!/[0-9]/.test(password)) nextErrors.password = "La contraseña debe contener al menos un número";
      else if (!/[^A-Za-z0-9]/.test(password)) nextErrors.password = "La contraseña debe contener al menos un carácter especial";
    }
    if (!confirm) nextErrors.confirm = "Confirme la contraseña";
    if (password && confirm && password !== confirm) nextErrors.confirm = "Las contraseñas no coinciden";
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
      // /login. Clear any token that signUp may have set and show the supervisor
      // app confirmation.
      try {
        localStorage.removeItem("authToken");
        localStorage.removeItem("user");
      } catch { /* ignore */ }
      toast.success("¡Cuenta activada!");
      setDone(true);
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch {}
    } catch (err: any) {
      toast.error(err?.message || "Error al registrar");
    } finally {
      setIsLoading(false);
    }
  };

  const empresa: string | undefined = fetched?.tenant?.name || undefined;

  /** El ojo de mostrar/ocultar. Va DENTRO del campo, así que hereda su hueco. */
  const Ojo = ({ visible, onToggle }: { visible: boolean; onToggle: () => void }) => (
    <button
      type="button"
      onClick={onToggle}
      className="cg-focus absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1"
      style={{ color: 'var(--ink-faint)' }}
      aria-label={visible ? 'Ocultar contrase\u00f1a' : 'Mostrar contrase\u00f1a'}
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <AuthShell
      title={done ? '\u00a1Cuenta activada!' : t('supervisor.registration_title', { defaultValue: 'Registro de supervisor' })}
      subtitle={
        done
          ? 'Tu acceso qued\u00f3 listo.'
          : 'Crea una contrase\u00f1a para tu cuenta. Supervisar\u00e1s tus recorridos y tu equipo desde la app de supervisor.'
      }
      brandName={empresa}
      logoUrl={fetched?.tenant?.logoUrl || undefined}
      eyebrow="Invitaci\u00f3n \u00b7 Supervisi\u00f3n"
      width="lg"
      /* Ya se ha ido a la red a por la invitaci\u00f3n: la cortina de 2,5 s s\u00f3lo
         retrasar\u00eda un formulario que el usuario est\u00e1 esperando. */
      splash={false}
      features={[
        { icon: MapPin, label: 'Recorridos y patrullaje' },
        { icon: Radio, label: 'Novedades del turno' },
        { icon: Clock, label: 'Tu equipo, en directo' },
      ]}
    >
      {done ? (
        /* Un supervisor NO entra al CRM: su casa es la app de supervisor. */
        <FadeIn className="text-center">
          <div className="mb-5 flex justify-center">
            <IconTile tone="ok" size="lg"><CheckCircle2 /></IconTile>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Tu cuenta con <strong style={{ color: 'var(--ink)' }}>{empresa || 'tu empresa de seguridad'}</strong> est\u00e1 lista.
            Descarga la <strong style={{ color: 'var(--ink)' }}>app de supervisor</strong> para gestionar tus recorridos, tu equipo y las novedades desde tu tel\u00e9fono.
          </p>

          <div className="mt-6 space-y-3 text-left">
            <PasoSiguiente
              icon={<Smartphone />}
              title="Descarga la app de supervisor"
              description="Inicia sesi\u00f3n con el correo y la contrase\u00f1a que acabas de crear."
            />
            <PasoSiguiente
              icon={<Clock />}
              title="Espera la asignaci\u00f3n"
              description="Tu empresa te asignar\u00e1 tu zona y tu equipo de vigilantes."
            />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <a href={SUPERVISOR_PLAY_URL} target="_blank" rel="noreferrer" className="cg-btn-glass cg-focus flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold">
              Google Play
            </a>
            <a href={SUPERVISOR_IOS_URL} target="_blank" rel="noreferrer" className="cg-btn-glass cg-focus flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold">
              App Store
            </a>
          </div>

          <p className="mt-5 text-xs" style={{ color: 'var(--ink-faint)' }}>Ya puedes cerrar esta ventana.</p>
        </FadeIn>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          {inviteNotFound && (
            <InfoNote tone="warn" icon={<AlertTriangle />}>
              {t('supervisor.invite_not_found', { defaultValue: 'Invitaci\u00f3n no encontrada o inv\u00e1lida.' })}
            </InfoNote>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Etiqueta htmlFor="sup-nombre">Nombre</Etiqueta>
              <input
                id="sup-nombre"
                className={CAMPO}
                style={estiloError('name')}
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
                placeholder="Nombre"
                disabled={isLoading || lockedName}
                aria-invalid={!!errors.name}
              />
              {errors.name && <p className="mt-1.5 text-xs" style={{ color: 'var(--bad-text)' }}>{errors.name}</p>}
            </div>
            <div>
              <Etiqueta htmlFor="sup-email">Correo electr\u00f3nico</Etiqueta>
              <input
                id="sup-email"
                type="email"
                className={CAMPO}
                style={estiloError('email')}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
                placeholder="tu@correo.com"
                disabled={isLoading || lockedEmail}
                aria-invalid={!!errors.email}
              />
              {errors.email && <p className="mt-1.5 text-xs" style={{ color: 'var(--bad-text)' }}>{errors.email}</p>}
            </div>
            <div>
              <Etiqueta htmlFor="sup-clave">Contrase\u00f1a</Etiqueta>
              <div className="relative">
                <input
                  id="sup-clave"
                  className={`${CAMPO} pr-12`}
                  style={estiloError('password')}
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                  placeholder="M\u00ednimo 8 caracteres"
                  disabled={isLoading}
                  aria-invalid={!!errors.password}
                />
                <Ojo visible={showPwd} onToggle={() => setShowPwd((v) => !v)} />
              </div>
              {errors.password && <p className="mt-1.5 text-xs" style={{ color: 'var(--bad-text)' }}>{errors.password}</p>}
            </div>
            <div>
              <Etiqueta htmlFor="sup-confirmar">Confirmar contrase\u00f1a</Etiqueta>
              <div className="relative">
                <input
                  id="sup-confirmar"
                  className={`${CAMPO} pr-12`}
                  style={estiloError('confirm')}
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
                  placeholder="Repite la contrase\u00f1a"
                  disabled={isLoading}
                  aria-invalid={!!errors.confirm}
                />
                <Ojo visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />
              </div>
              {errors.confirm && <p className="mt-1.5 text-xs" style={{ color: 'var(--bad-text)' }}>{errors.confirm}</p>}
            </div>
          </div>

          <button type="submit" className={BOTON_PRINCIPAL} disabled={isLoading}>
            {isLoading
              ? t('client.registering', { defaultValue: 'Registrando\u2026' })
              : t('client.register', { defaultValue: 'Activar mi cuenta' })}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

/** Fila de «qu\u00e9 pasa ahora»: ficha de icono + t\u00edtulo + explicaci\u00f3n. */
function PasoSiguiente({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="glass-sunken flex items-start gap-3 p-3.5">
      <IconTile tone="neutral" size="sm">{icon}</IconTile>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{description}</p>
      </div>
    </div>
  );
}
