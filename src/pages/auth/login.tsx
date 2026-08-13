import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Mail, Eye, EyeOff, ArrowRight } from "lucide-react";
import AuthShell, { CAMPO_ICONO, BOTON_PRINCIPAL, Etiqueta } from "./AuthShell";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthForm } from "@/hooks/useAuthForm";
import { toast } from "sonner";
import { useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { ApiService } from '@/services/api/apiService';

export default function Login() {
  const { signIn } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawInviteToken = searchParams.get('token') || searchParams.get('invitationToken') || searchParams.get('invite') || undefined;
  const inviteToken = rawInviteToken && rawInviteToken !== 'null' && rawInviteToken !== 'undefined' ? rawInviteToken : undefined;
  const inviteType = searchParams.get('inviteType') || undefined;
  const securityGuardId = searchParams.get('securityGuardId') || undefined;
  const {
    email, password, showPassword, isLoading,
    setEmail, setPassword, toggleShowPassword, setIsLoading,
    validateEmail, validatePassword
  } = useAuthForm();

    useEffect(() => {
      document.title = t('auth.login_title') || 'Iniciar Sesión | Cguard';
    }, []);

    useEffect(() => {
      const redirectIfInviteLink = async () => {
        if (!inviteToken) return;
        if (inviteType === 'guard' || securityGuardId) {
          navigate(`/auth/invitation?token=${encodeURIComponent(inviteToken)}${securityGuardId ? `&securityGuardId=${encodeURIComponent(securityGuardId)}` : ''}&inviteType=guard`);
          return;
        }
        if (inviteType === 'client') {
          navigate(`/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`);
          return;
        }

        try {
          const guardResponse = await ApiService.get(`/security-guard/public?token=${encodeURIComponent(inviteToken)}`, { skipAuth: true });
          const guardData = guardResponse?.data || guardResponse;
          if (guardData) {
            navigate(`/auth/invitation?token=${encodeURIComponent(inviteToken)}${securityGuardId ? `&securityGuardId=${encodeURIComponent(securityGuardId)}` : ''}&inviteType=guard`);
            return;
          }
        } catch (_e) {
          // not a guard invitation
        }

        try {
          const clientResponse = await ApiService.get(`/user/public?token=${encodeURIComponent(inviteToken)}`, { skipAuth: true });
          const clientData = clientResponse?.data || clientResponse;
          if (clientData) {
            navigate(`/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`);
          }
        } catch (_e) {
          // not a client invitation
        }
      };

      redirectIfInviteLink();
    }, [inviteToken, inviteType, securityGuardId, navigate]);
  
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // use validation helpers from the hook (they show localized toasts)
    if (!validateEmail() || !validatePassword(6)) return;
    setIsLoading(true);
    const result = await signIn({ email, password });
    setIsLoading(false);
    if (result.success) {
      toast.success(t('auth.login_success'));
      navigate("/dashboard");
    } else {
      toast.error(result.error || t('auth.login_failed'));
    }
  };
  
  return (
    <AuthShell title={t('auth.login_prompt') || 'Inicia sesión en tu cuenta'}>
      <form className="space-y-4" onSubmit={handleLogin}>
        <div>
          <Etiqueta>{t('auth.email_label')}</Etiqueta>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
            <input
              type="email"
              placeholder={t('auth.email_placeholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              disabled={isLoading}
              className={CAMPO_ICONO}
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <Etiqueta>{t('auth.password_label')}</Etiqueta>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder={t('auth.password_placeholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              disabled={isLoading}
              className={`${CAMPO_ICONO} pr-12`}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={toggleShowPassword}
              aria-label={showPassword ? t('auth.hide_password', { defaultValue: 'Ocultar contraseña' }) : t('auth.show_password', { defaultValue: 'Mostrar contraseña' })}
              className="cg-focus absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors"
              style={{ color: 'var(--ink-faint)' }}
            >
              {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

        <div className="text-right">
          <NavLink to="/forgot-password" className="text-sm font-medium hover:underline" style={{ color: 'var(--brand-text)' }}>
            {t('auth.forgot_password')}
          </NavLink>
        </div>

        <button type="submit" disabled={isLoading} className={BOTON_PRINCIPAL}>
          {isLoading ? t('auth.signing_in') : <>{t('auth.login')} <ArrowRight className="h-4 w-4" /></>}
        </button>

        <div className="pt-1 text-center text-sm">
          <span style={{ color: 'var(--ink-soft)' }}>{t('auth.no_account_text')} </span>
          <NavLink to="/register" className="font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>
            {t('auth.create_account')}
          </NavLink>
        </div>
      </form>
    </AuthShell>
  );
}