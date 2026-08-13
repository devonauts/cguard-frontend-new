import { useEffect, useState } from "react";
import { Mail, Send } from "lucide-react";
import AuthShell, { CAMPO_ICONO, BOTON_PRINCIPAL, Etiqueta, Separador, AvisoError } from "./AuthShell";
import { toast } from "sonner";
import { AuthService } from "@/services/auth/authService";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    document.title = t('auth.forgot_title', { defaultValue: 'Forgot password | Cguard' });
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError("");

    const value = email.trim();
    if (!value) {
      toast.error(t('auth.enter_email', { defaultValue: 'Por favor ingresa tu correo electrónico' }));
      return;
    }

    setIsLoading(true);
    try {
      // NOTE: Assuming AuthService.sendPasswordResetEmail is correctly implemented
      await AuthService.sendPasswordResetEmail(value); 
      toast.success(t('auth.reset_sent', { defaultValue: 'Enlace enviado correctamente. Revisa tu correo electrónico' }));
      setEmail("");
    } catch (err: any) {
      console.error("Error al enviar enlace:", err);
      const errorMessage = err?.message || (err?.response && err.response.data && err.response.data.message) || String(err);
      toast.error(errorMessage || t('auth.reset_error', { defaultValue: 'Error al enviar enlace. Intenta nuevamente' }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.forgot_title', { defaultValue: '¿Olvidaste tu contraseña?' })}
      subtitle={t('auth.forgot_subtitle', { defaultValue: 'Escribe tu correo y te enviamos un enlace para crear una nueva.' })}
      showFeatures={false}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Etiqueta htmlFor="email">{t('auth.email_label', { defaultValue: 'Correo electrónico' })}</Etiqueta>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
            <input
              id="email"
              type="email"
              placeholder={t('auth.email_placeholder', { defaultValue: 'tu@correo.com' })}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              disabled={isLoading}
              className={CAMPO_ICONO}
              autoComplete="email"
            />
          </div>
        </div>

        {formError && <AvisoError>{formError}</AvisoError>}

        <button type="submit" disabled={isLoading} className={BOTON_PRINCIPAL}>
          {isLoading
            ? t('auth.sending', { defaultValue: 'Enviando enlace…' })
            : <><Send className="h-4 w-4" /> {t('auth.send_reset', { defaultValue: 'Enviar enlace' })}</>}
        </button>

        <Separador>{t('common.or', { defaultValue: 'o' })}</Separador>

        <div className="flex items-center justify-between text-sm">
          <NavLink to="/login" className="font-semibold hover:underline" style={{ color: 'var(--brand-text)' }}>
            {t('auth.back_to_login', { defaultValue: 'Volver a iniciar sesión' })}
          </NavLink>
          <NavLink to="/register" className="hover:underline" style={{ color: 'var(--ink-soft)' }}>
            {t('auth.create_account', { defaultValue: 'Crear cuenta' })}
          </NavLink>
        </div>
      </form>
    </AuthShell>
  );
}
