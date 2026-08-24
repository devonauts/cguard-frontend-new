import React, { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, Eye, EyeOff, CheckCircle2, MapPin, ShieldCheck } from "lucide-react";

// Mi Seguridad (client app) store links. Real store listings by default; still
// overridable via env if they ever change.
const MISEGURIDAD_PLAY_URL = (import.meta as any).env?.VITE_MISEGURIDAD_PLAY_URL || "https://play.google.com/store/apps/details?id=com.cguardpro.miseguridad";
const MISEGURIDAD_IOS_URL = (import.meta as any).env?.VITE_MISEGURIDAD_IOS_URL || "https://apps.apple.com/us/app/mi-seguridad-by-c-guard-pro/id6778661633";
import { toast } from "sonner";
import { FadeIn, IconTile, InfoNote } from "@/components/kit";
import AuthShell, { AvisoError, BOTON_PRINCIPAL, CAMPO, Etiqueta } from "@/pages/auth/AuthShell";
import { ApiService } from "@/services/api/apiService";
import { AuthService } from '@/services/auth/authService';

export default function ClientRegistration() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const rawInviteToken = searchParams.get("token") || searchParams.get("invitationToken") || searchParams.get("invite") || undefined;
  const inviteToken = rawInviteToken && rawInviteToken !== 'null' && rawInviteToken !== 'undefined' ? rawInviteToken : undefined;
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

  /** El campo en rojo cuando falla la validación — con el token, no con un rojo
   *  de Tailwind, para que el aviso y el borde sean el MISMO rojo. */
  const estiloError = (field: string) =>
    errors[field]
      ? ({ borderColor: 'var(--bad)', boxShadow: '0 0 0 3px color-mix(in oklab, var(--bad) 22%, transparent)' } as React.CSSProperties)
      : undefined;

  useEffect(() => {
    const fetchInvite = async () => {
      // Si hay un token de invitación, limpiar cualquier sesión activa para evitar conflictos
      if (inviteToken) {
        try {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          console.log('[client-registration] cleared any active session for invitation flow');
        } catch (e) {
          console.warn('[client-registration] could not clear session:', e);
        }
      }
      
      if (!inviteToken) return;
      if (inviteType === 'guard') {
        navigate(`/auth/invitation?token=${encodeURIComponent(inviteToken)}&inviteType=guard`);
        return;
      }
      // Supervisor invites belong on the supervisor app screen, not the client view.
      if (inviteType === 'supervisor') {
        navigate(`/supervisor/registration?token=${encodeURIComponent(inviteToken)}&inviteType=supervisor`, { replace: true });
        return;
      }
      // Internal administrative staff (admins, supervisors, …) belong in the CRM
      // panel, NOT the customer registration view — redirect older links there.
      if (inviteType === 'staff' || inviteType === 'admin') {
        navigate(`/auth/accept-invitation?token=${encodeURIComponent(inviteToken)}&inviteType=staff`, { replace: true });
        return;
      }
      // inviteType puede ser 'client' (clientes)
      setIsLoading(true);
      try {
        const endpointBase = `/user/public`;
        const qp = new URLSearchParams();
        qp.append("token", inviteToken);
        const urlWithQs = `${endpointBase}?${qp.toString()}`;
        const res = await ApiService.get(urlWithQs, { skipAuth: true });
        const data = res?.data || res;
        if (!data) {
          setInviteNotFound(true);
          return;
        }
        setFetched(data);
        const rootName = data.fullName || data.name || (data.firstName ? `${data.firstName} ${data.lastName || ''}` : undefined);
        const emailCandidate = data.email || undefined;
        if (rootName) { setName(rootName); setLockedName(true); }
        if (emailCandidate) { setEmail(emailCandidate); setLockedEmail(true); }
      } catch (err: any) {
        // If this token belongs to a guard invitation instead of a client invitation,
        // redirect to the guard invitation page.
        if (inviteToken) {
          try {
            const guardResponse = await ApiService.get(`/security-guard/public?token=${encodeURIComponent(inviteToken)}`, { skipAuth: true });
            const guardData = guardResponse?.data || guardResponse;
            if (guardData) {
              // This is a security guard invitation
              navigate(`/auth/invitation?token=${encodeURIComponent(inviteToken)}&inviteType=guard`);
              return;
            }
          } catch (_guardErr) {
            // Both endpoints failed - show error
            console.error('[client-registration] Both endpoints failed:', { err, _guardErr });
          }
        }
        setInviteNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInvite();
  }, [inviteToken, navigate]);

  const validateEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  };

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
      // A client is NOT a tenant web-admin — do NOT send them to /login (it fails
      // for them). Show a confirmation with the Mi Seguridad app + download links.
      toast.success("¡Cuenta activada!");
      setDone(true);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    } catch (err: any) {
      toast.error(err?.message || "Error al registrar");
    } finally {
      setIsLoading(false);
    }
  };

  // Determine el título basado en el tipo de invitación o los roles
  const getTitle = () => {
    // Si tenemos datos de la invitación, usar los roles para determinar el título
    if (fetched && fetched.roles && Array.isArray(fetched.roles)) {
      const roles = fetched.roles;
      if (roles.includes('supervisor') || roles.includes('securitySupervisor')) {
        return t('supervisor.registration_title', { defaultValue: 'Registro de Supervisor' });
      }
      if (roles.includes('customer')) {
        return t('customer.registration_title', { defaultValue: 'Registro de Cliente' });
      }
      if (roles.includes('admin')) {
        return t('admin.registration_title', { defaultValue: 'Registro de Administrador' });
      }
    }
    
    // Fallback a inviteType
    if (inviteType === 'staff') {
      return t('staff.registration_title', { defaultValue: 'Registro de usuario' });
    }
    return t('client.registration_title', { defaultValue: 'Registro de cliente' });
  };

  // Función para obtener el texto descriptivo del rol
  const getRoleDescription = () => {
    if (fetched && fetched.roles && Array.isArray(fetched.roles)) {
      const roles = fetched.roles;
      if (roles.includes('supervisor') || roles.includes('securitySupervisor')) {
        return 'Estás completando tu registro como Supervisor. Por favor, ingresa una contraseña para tu cuenta.';
      }
      if (roles.includes('customer')) {
        return 'Estás completando tu registro como Cliente. Por favor, ingresa una contraseña para tu cuenta.';
      }
      if (roles.includes('admin')) {
        return 'Estás completando tu registro como Administrador. Por favor, ingresa una contraseña para tu cuenta.';
      }
    }
    return 'Por favor, completa tu registro ingresando una contraseña para tu cuenta.';
  };

  const empresa: string | undefined = fetched?.tenant?.name || undefined;

  /** El ojo de mostrar/ocultar. Va DENTRO del campo, así que hereda su hueco. */
  const Ojo = ({ visible, onToggle }: { visible: boolean; onToggle: () => void }) => (
    <button
      type="button"
      onClick={onToggle}
      className="cg-focus absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1"
      style={{ color: 'var(--ink-faint)' }}
      aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
    >
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <AuthShell
      title={done ? '¡Cuenta activada!' : getTitle()}
      subtitle={done ? 'Tu acceso quedó listo.' : getRoleDescription()}
      brandName={empresa}
      logoUrl={fetched?.tenant?.logoUrl || undefined}
      eyebrow="Invitación · Portal del cliente"
      width="lg"
      /* Ya se ha ido a la red a por la invitación: una cortina de 2,5 s encima
         sólo retrasa lo que el usuario está esperando. */
      splash={false}
      features={[
        { icon: ShieldCheck, label: 'Tu servicio, en directo' },
        { icon: MapPin, label: 'Rondas y puestos con GPS' },
        { icon: Bell, label: 'Avisos de incidentes' },
      ]}
    >
      {done ? (
        /* Un cliente NO entra por la web: su casa es la app Mi Seguridad. */
        <FadeIn className="text-center">
          <div className="mb-5 flex justify-center">
            <IconTile tone="ok" size="lg"><CheckCircle2 /></IconTile>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>
            Tu cuenta con <strong style={{ color: 'var(--ink)' }}>{empresa || 'tu proveedor de seguridad'}</strong> está lista.
            Descarga <strong style={{ color: 'var(--ink)' }}>Mi Seguridad</strong> para monitorear y gestionar tu servicio de seguridad desde tu teléfono.
          </p>

          <div className="glass-sunken mt-6 flex items-center gap-3 p-4 text-left">
            <img src="/assets/logo/miseguridad.png" alt="Mi Seguridad" className="h-12 w-12 shrink-0 rounded-xl object-contain" />
            <div className="min-w-0">
              <p className="text-sm font-bold">Mi Seguridad</p>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>
                Vigilantes y puestos en tiempo real, rondas con GPS, incidentes y reportes.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <a href={MISEGURIDAD_PLAY_URL} target="_blank" rel="noreferrer" className="cg-focus rounded-lg transition-opacity hover:opacity-90">
              <img src="/assets/badges/google-play.png" alt="Descargar en Google Play" className="h-12 w-auto" />
            </a>
            <a href={MISEGURIDAD_IOS_URL} target="_blank" rel="noreferrer" className="cg-focus rounded-lg transition-opacity hover:opacity-90">
              <img src="/assets/badges/app-store.png" alt={t("ui.registration.consigueloEnElAppStore", "Consíguelo en el App Store")} className="h-12 w-auto" />
            </a>
          </div>

          <p className="mt-5 text-xs" style={{ color: 'var(--ink-faint)' }}>
            Inicia sesión en la app con el correo y la contraseña que acabas de crear.
          </p>
        </FadeIn>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          {inviteNotFound && (
            <InfoNote tone="warn" icon={<AlertTriangle />}>
              {t('client.invite_not_found', { defaultValue: 'Invitación no encontrada o inválida.' })}
            </InfoNote>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <Etiqueta htmlFor="cliente-nombre">Nombre</Etiqueta>
              <input
                id="cliente-nombre"
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
              <Etiqueta htmlFor="cliente-email">{t("ui.registration.correoElectronico3", "Correo electrónico")}</Etiqueta>
              <input
                id="cliente-email"
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
              <Etiqueta htmlFor="cliente-clave">{t("ui.registration.contrasena3", "Contraseña")}</Etiqueta>
              <div className="relative">
                <input
                  id="cliente-clave"
                  className={`${CAMPO} pr-12`}
                  style={estiloError('password')}
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                  placeholder={t("ui.registration.minimo8Caracteres", "Mínimo 8 caracteres")}
                  disabled={isLoading}
                  aria-invalid={!!errors.password}
                />
                <Ojo visible={showPwd} onToggle={() => setShowPwd((v) => !v)} />
              </div>
              {errors.password && <p className="mt-1.5 text-xs" style={{ color: 'var(--bad-text)' }}>{errors.password}</p>}
            </div>
            <div>
              <Etiqueta htmlFor="cliente-confirmar">{t("ui.registration.confirmarContrasena3", "Confirmar contraseña")}</Etiqueta>
              <div className="relative">
                <input
                  id="cliente-confirmar"
                  className={`${CAMPO} pr-12`}
                  style={estiloError('confirm')}
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setErrors((p) => ({ ...p, confirm: undefined })); }}
                  placeholder={t("ui.registration.repiteLaContrasena", "Repite la contraseña")}
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
              ? t('client.registering', { defaultValue: 'Registrando…' })
              : t('client.register', { defaultValue: 'Activar mi cuenta' })}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
