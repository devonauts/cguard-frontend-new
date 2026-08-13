import { NavLink, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, User, ArrowRight } from "lucide-react";
import AuthShell, { CAMPO_ICONO, BOTON_PRINCIPAL, Etiqueta } from "./AuthShell";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from 'react-i18next';

export default function Register() {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);


  useEffect(() => {
    document.title = t('auth.register_title') || 'Registro | Cguard';
  }, []);

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();


    if (!name || !email || !password || !confirm) {
      toast.error(t('auth.fill_all_fields'));
      return;
    }
    if (password !== confirm) {
      toast.error(t('auth.passwords_not_match'));

      return;
    }

    // Validación de política de contraseña en frontend
    const { isStrongPassword, PASSWORD_POLICY_TEXT } = await import('@/lib/passwordPolicy');
    if (!isStrongPassword(password)) {
      const msg = t('auth.weakPassword', { defaultValue: `La contraseña es muy débil. Requisitos: ${PASSWORD_POLICY_TEXT}` })
      toast.error(msg);
      return;
    }

    setIsLoading(true);
    const res = await signUp({ email, password, name });
    setIsLoading(false);

    if (res?.success) {
      toast.success(t('auth.account_created_verify_email'));
      navigate("/login");
    } else {
      const msg = res?.error || "Error al registrarse";
      toast.error(msg);
    }
  };
  return (
    <AuthShell title={t('auth.register_prompt') || 'Crea tu cuenta'}>
      <form className="space-y-4" onSubmit={handleRegister}>
        {/* Nombre */}
        <div>
          <Etiqueta htmlFor="name">{t('auth.name_label')}</Etiqueta>
          <div className="relative">
            <User className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
            <input
              id="name"
              type="text"
              placeholder={t('auth.name_placeholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
              disabled={isLoading}
              className={CAMPO_ICONO}
              autoComplete="name"
            />
          </div>
        </div>

        {/* Correo */}
        <div>
          <Etiqueta htmlFor="email">{t('auth.email_label', { defaultValue: 'Correo electrónico' })}</Etiqueta>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
            <input
              id="email"
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
              disabled={isLoading}
              className={CAMPO_ICONO}
              autoComplete="email"
            />
          </div>
        </div>

        {/* Contraseña */}
        <div>
          <Etiqueta htmlFor="password">{t('auth.password_label')}</Etiqueta>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
            <input
              id="password"
              type={showPwd ? "text" : "password"}
              placeholder={t('auth.password_placeholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
              disabled={isLoading}
              className={`${CAMPO_ICONO} pr-12`}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? t('auth.hide_password', { defaultValue: 'Ocultar contraseña' }) : t('auth.show_password', { defaultValue: 'Mostrar contraseña' })}
              className="cg-focus absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors"
              style={{ color: 'var(--ink-faint)' }}
            >
              {showPwd ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

        {/* Confirmar contraseña */}
        <div>
          <Etiqueta htmlFor="confirm">{t('auth.confirm_password_label')}</Etiqueta>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
            <input
              id="confirm"
              type={showConfirm ? "text" : "password"}
              placeholder={t('auth.password_placeholder')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
              disabled={isLoading}
              className={`${CAMPO_ICONO} pr-12`}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? t('auth.hide_password', { defaultValue: 'Ocultar contraseña' }) : t('auth.show_password', { defaultValue: 'Mostrar contraseña' })}
              className="cg-focus absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors"
              style={{ color: 'var(--ink-faint)' }}
            >
              {showConfirm ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={isLoading} className={BOTON_PRINCIPAL}>
          {isLoading ? t('auth.creating_account') : <>{t('auth.create_account')} <ArrowRight className="h-4 w-4" /></>}
        </button>

        <div className="pt-1 text-center text-sm">
          <span style={{ color: 'var(--ink-soft)' }}>{t('auth.already_have_account')} </span>
          <NavLink to="/login" className="font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>
            {t('auth.login')}
          </NavLink>
        </div>
      </form>
    </AuthShell>
  );
}