import { useEffect, useState } from "react";
import { tituloConMarca } from "@/hooks/usePageTitle";
import { useSearchParams, NavLink, useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  CheckCircle2,
  Smartphone,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import AuthShell, { CAMPO_ICONO, BOTON_PRINCIPAL, Etiqueta } from "./AuthShell";

import { FadeIn, IconTile } from "@/components/kit";
import { AuthService } from "@/services/auth/authService";

export default function ResetPassword() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || searchParams.get("t") || "";
  // Field users (guards/supervisors) reach this page from the worker-app reset
  // email. Show them the guard-app variant, not the tenant marketing/admin login.
  const isField =
    searchParams.get("audience") === "field" ||
    searchParams.get("app") === "worker";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [doneField, setDoneField] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = tituloConMarca(t("auth.reset_title", {
      defaultValue: "Reset password | Cguard",
    }));
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!token) {
      toast.error(
        t("auth.token_missing", {
          defaultValue: "Reset token not found in URL.",
        }),
      );

      return;
    }
    // Validación de política de contraseña
    const { isStrongPassword, PASSWORD_POLICY_TEXT } = await import(
      "@/lib/passwordPolicy"
    );

    if (!isStrongPassword(password)) {
      const msg = t("auth.weakPassword", {
        defaultValue: `La contraseña es muy débil. Requisitos: ${PASSWORD_POLICY_TEXT}`,
      });

      toast.error(msg);

      return;
    }
    if (password !== confirm) {
      toast.error(
        t("auth.passwords_mismatch", {
          defaultValue: "Passwords do not match",
        }),
      );

      return;
    }

    setLoading(true);
    try {
      await AuthService.resetPassword(token, password);
      toast.success(
        t("auth.reset_success", {
          defaultValue: "Password reset successfully. Please log in.",
        }),
      );
      // Field users sign in from the native app, not the web admin login.
      if (isField) {
        setDoneField(true);

        return;
      }
      navigate("/login");
    } catch (err: any) {
      console.error("Error restableciendo contraseña:", err);
      const msg =
        err?.message ||
        t("auth.reset_failed", { defaultValue: "Unable to reset password" });

      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (doneField) {
    return (
      <AuthShell
        showFeatures={false}
        splash={false}
        subtitle={t("auth.reset_done_field_subtitle", {
          defaultValue:
            "Vuelve a la app C-Guard Pro e inicia sesión con tu nueva contraseña.",
        })}
        title={t("auth.reset_done_title", {
          defaultValue: "¡Contraseña actualizada!",
        })}
        variant="field"
      >
        <FadeIn className="flex flex-col items-center gap-5 py-2 text-center">
          <IconTile size="lg" tone="ok">
            <CheckCircle2 />
          </IconTile>
          <p
            className="max-w-xs text-sm leading-relaxed"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("auth.reset_done_field_body", {
              defaultValue:
                "Tu contraseña fue restablecida. Abre la app C-Guard Pro en tu teléfono e inicia sesión con tu correo y tu nueva contraseña.",
            })}
          </p>
          <a className={BOTON_PRINCIPAL} href="cguardpro://login">
            <Smartphone className="h-4.5 w-4.5" />
            {t("auth.reset_open_app", {
              defaultValue: "Abrir la app C-Guard Pro",
            })}
          </a>
        </FadeIn>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      showFeatures={false}
      subtitle={
        isField
          ? undefined
          : t("auth.reset_subtitle", {
              defaultValue:
                "Elige una contraseña nueva para entrar de nuevo a tu cuenta.",
            })
      }
      title={t("auth.reset_title_short", {
        defaultValue: "Restablecer contraseña",
      })}
      variant={isField ? "field" : "admin"}
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <Etiqueta htmlFor="new-password">
            {t("auth.new_password_label", { defaultValue: "Nueva contraseña" })}
          </Etiqueta>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2"
              style={{ color: "var(--ink-faint)" }}
            />
            <input
              autoComplete="new-password"
              className={`${CAMPO_ICONO} pr-12`}
              disabled={loading}
              id="new-password"
              placeholder={t("auth.new_password_placeholder", {
                defaultValue: "Nueva contraseña",
              })}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              aria-label={
                showPassword
                  ? t("auth.hide_password", {
                      defaultValue: "Ocultar contraseña",
                    })
                  : t("auth.show_password", {
                      defaultValue: "Mostrar contraseña",
                    })
              }
              className="cg-focus absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2.5 transition-colors"
              disabled={loading}
              style={{ color: "var(--ink-faint)" }}
              type="button"
              onClick={() => setShowPassword((s) => !s)}
            >
              {showPassword ? (
                <EyeOff className="h-4.5 w-4.5" />
              ) : (
                <Eye className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </div>

        <div>
          <Etiqueta htmlFor="confirm-password">
            {t("auth.confirm_password_label", {
              defaultValue: "Confirmar contraseña",
            })}
          </Etiqueta>
          <div className="relative">
            <ShieldCheck
              className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2"
              style={{ color: "var(--ink-faint)" }}
            />
            <input
              autoComplete="new-password"
              className={`${CAMPO_ICONO} pr-12`}
              disabled={loading}
              id="confirm-password"
              placeholder={t("auth.confirm_password_placeholder", {
                defaultValue: "Confirmar contraseña",
              })}
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button
              aria-label={
                showConfirm
                  ? t("auth.hide_password", {
                      defaultValue: "Ocultar contraseña",
                    })
                  : t("auth.show_password", {
                      defaultValue: "Mostrar contraseña",
                    })
              }
              className="cg-focus absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2.5 transition-colors"
              disabled={loading}
              style={{ color: "var(--ink-faint)" }}
              type="button"
              onClick={() => setShowConfirm((s) => !s)}
            >
              {showConfirm ? (
                <EyeOff className="h-4.5 w-4.5" />
              ) : (
                <Eye className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </div>

        <button className={BOTON_PRINCIPAL} disabled={loading} type="submit">
          {loading
            ? t("auth.resetting", { defaultValue: "Restableciendo…" })
            : t("auth.reset_password", {
                defaultValue: "Restablecer contraseña",
              })}
        </button>

        {!isField && (
          <div className="pt-1 text-center text-sm">
            <NavLink
              className="-my-2 inline-block py-2 font-semibold hover:underline"
              style={{ color: "var(--brand-text)" }}
              to="/login"
            >
              {t("auth.back_to_login", {
                defaultValue: "Volver a iniciar sesión",
              })}
            </NavLink>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
