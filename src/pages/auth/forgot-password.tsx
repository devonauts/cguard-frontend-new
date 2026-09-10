import { useEffect, useState } from "react";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

import AuthShell, {
  CAMPO_ICONO,
  BOTON_PRINCIPAL,
  Etiqueta,
  Separador,
  AvisoError,
} from "./AuthShell";

import { AuthService } from "@/services/auth/authService";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    document.title = t("auth.forgot_title", {
      defaultValue: "Forgot password | Cguard",
    });
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError("");

    const value = email.trim();

    if (!value) {
      toast.error(
        t("auth.enter_email", {
          defaultValue: "Por favor ingresa tu correo electrónico",
        }),
      );

      return;
    }

    setIsLoading(true);
    try {
      // NOTE: Assuming AuthService.sendPasswordResetEmail is correctly implemented
      await AuthService.sendPasswordResetEmail(value);
      toast.success(
        t("auth.reset_sent", {
          defaultValue:
            "Enlace enviado correctamente. Revisa tu correo electrónico",
        }),
      );
      setEmail("");
    } catch (err: any) {
      console.error("Error al enviar enlace:", err);
      const errorMessage =
        err?.message ||
        (err?.response && err.response.data && err.response.data.message) ||
        String(err);

      toast.error(
        errorMessage ||
          t("auth.reset_error", {
            defaultValue: "Error al enviar enlace. Intenta nuevamente",
          }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell
      showFeatures={false}
      subtitle={t("auth.forgot_subtitle", {
        defaultValue:
          "Escribe tu correo y te enviamos un enlace para crear una nueva.",
      })}
      title={t("auth.forgot_title", {
        defaultValue: "¿Olvidaste tu contraseña?",
      })}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <Etiqueta htmlFor="email">
            {t("auth.email_label", { defaultValue: "Correo electrónico" })}
          </Etiqueta>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2"
              style={{ color: "var(--ink-faint)" }}
            />
            <input
              autoComplete="email"
              className={CAMPO_ICONO}
              disabled={isLoading}
              id="email"
              placeholder={t("auth.email_placeholder", {
                defaultValue: "tu@correo.com",
              })}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
        </div>

        {formError && <AvisoError>{formError}</AvisoError>}

        <button className={BOTON_PRINCIPAL} disabled={isLoading} type="submit">
          {isLoading ? (
            t("auth.sending", { defaultValue: "Enviando enlace…" })
          ) : (
            <>
              <Send className="h-4 w-4" />{" "}
              {t("auth.send_reset", { defaultValue: "Enviar enlace" })}
            </>
          )}
        </button>

        <Separador>{t("common.or", { defaultValue: "o" })}</Separador>

        <div className="flex items-center justify-between text-sm">
          <NavLink
            className="font-semibold hover:underline"
            style={{ color: "var(--brand-text)" }}
            to="/login"
          >
            {t("auth.back_to_login", {
              defaultValue: "Volver a iniciar sesión",
            })}
          </NavLink>
          <NavLink
            className="hover:underline"
            style={{ color: "var(--ink-soft)" }}
            to="/register"
          >
            {t("auth.create_account", { defaultValue: "Crear cuenta" })}
          </NavLink>
        </div>
      </form>
    </AuthShell>
  );
}
