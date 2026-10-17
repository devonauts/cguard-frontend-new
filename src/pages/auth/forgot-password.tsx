import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Send, UserRound } from "lucide-react";
import { toast } from "sonner";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import RevisaTuCorreo from "./RevisaTuCorreo";
import Boveda, {
  BotonDeAccion,
  CAMPO,
  Campo,
  useBotonDeAccion,
} from "./Boveda";

import { tituloConMarca } from "@/hooks/usePageTitle";
import { AuthService } from "@/services/auth/authService";

/* El mismo marco «Bóveda» que el registro y el inicio de sesión (2026-10-03).
   Al enviar, la tarjeta pasa a «Revisa tu correo» con la dirección: un aviso
   que desaparece solo dejaba a la persona sin saber si había funcionado. */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [enviadoA, setEnviadoA] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const accion = useBotonDeAccion();
  const navigate = useNavigate();
  const volverAlAcceso = useCallback(() => navigate("/login"), [navigate]);

  useEffect(() => {
    document.title = tituloConMarca(
      t("auth.forgot_title", {
        defaultValue: "Forgot password | Cguard",
      }),
    );
  }, []);

  /** Pide el enlace. Devuelve si salió bien (para el botón de acción). */
  const pedirEnlace = async (value: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      await AuthService.sendPasswordResetEmail(value);

      return true;
    } catch (err: any) {
      console.error("Error al enviar enlace:", err);
      const errorMessage =
        err?.message ||
        (err?.response && err.response.data && err.response.data.message) ||
        String(err);

      setFormError(
        errorMessage ||
          t("auth.reset_error", {
            defaultValue: "Error al enviar enlace. Intenta nuevamente",
          }),
      );

      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const avisoEnviado = () =>
    toast.success(
      t("auth.reset_sent", {
        defaultValue:
          "Enlace enviado correctamente. Revisa tu correo electrónico",
      }),
    );

  const enviar = async (value: string) => {
    if (await accion.ejecutar(() => pedirEnlace(value))) {
      avisoEnviado();
      setEnviadoA(value);
      accion.reiniciar();
    }
  };

  /** «Enviarlo de nuevo», desde la confirmación: sin el botón grande. */
  const reenviar = async (value: string) => {
    if (await pedirEnlace(value)) avisoEnviado();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError("");
    const value = email.trim();

    if (!value) {
      toast.error(
        t("auth.enterLoginId", {
          defaultValue: "Escribe tu correo o tu usuario",
        }),
      );

      return;
    }
    await enviar(value);
  };

  return (
    <Boveda
      estado={t("auth.signup.recuperarAcceso", {
        defaultValue: "Recuperar acceso",
      })}
    >
      {enviadoA ? (
        <RevisaTuCorreo
          extra={
            <button
              className="cg-reg-enlace text-sm"
              disabled={isLoading}
              type="button"
              onClick={() => reenviar(enviadoA)}
            >
              {isLoading
                ? t("auth.sending", { defaultValue: "Enviando enlace…" })
                : t("auth.signup.enviarDeNuevo", {
                    defaultValue: "Enviarlo de nuevo",
                  })}
            </button>
          }
          texto={`${t("auth.signup.enviamosEnlace", {
            defaultValue:
              "Si hay una cuenta con {{correo}}, te llegará un enlace para crear una contraseña nueva.",
            correo: enviadoA,
          })} ${t("auth.forgotNoMailboxHint", {
            defaultValue:
              "Si tu cuenta no tiene correo, pide el enlace a tu supervisor o a la oficina.",
          })}`}
          textoBoton={t("auth.back_to_login", {
            defaultValue: "Volver a iniciar sesión",
          })}
          titulo={t("auth.signup.revisaTuCorreo", {
            defaultValue: "Revisa tu correo",
          })}
          onContinuar={volverAlAcceso}
        />
      ) : (
        <>
          <h1 className="font-display text-[1.6rem] font-semibold leading-tight tracking-tight">
            {t("auth.forgot_title", {
              defaultValue: "¿Olvidaste tu contraseña?",
            })}
          </h1>
          <p className="cg-reg-suave mb-5 mt-1.5 text-sm">
            {t("auth.forgotSubtitleLoginId", {
              defaultValue:
                "Escribe tu correo o tu usuario y te enviamos un enlace para crear una nueva.",
            })}
          </p>
          <form noValidate className="space-y-4" onSubmit={handleSubmit}>
            {/* Correo O usuario: el servidor acepta los dos (ver login.tsx). */}
            <Campo
              Icono={UserRound}
              aviso={formError || undefined}
              etiqueta={t("auth.loginIdLabel", {
                defaultValue: "Correo o usuario",
              })}
              htmlFor="email"
            >
              <input
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect="off"
                className={CAMPO}
                disabled={isLoading}
                id="email"
                inputMode="text"
                name="username"
                placeholder={t("auth.loginIdPlaceholder", {
                  defaultValue: "jmiranda o tu@correo.com",
                })}
                spellCheck={false}
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Campo>
            <p className="cg-reg-suave -mt-1 text-xs">
              {t("auth.forgotNoMailboxHint", {
                defaultValue:
                  "Si tu cuenta no tiene correo, pide el enlace a tu supervisor o a la oficina.",
              })}
            </p>

            <BotonDeAccion estado={accion.estado} type="submit">
              <Send className="h-4 w-4" />
              {t("auth.send_reset", { defaultValue: "Enviar enlace" })}
            </BotonDeAccion>

            <div className="flex items-center justify-between pt-1 text-sm">
              <NavLink
                className="cg-reg-enlace -my-2 inline-flex items-center gap-1.5 py-2"
                to="/login"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("auth.back_to_login", {
                  defaultValue: "Volver a iniciar sesión",
                })}
              </NavLink>
              <NavLink className="cg-reg-suave hover:underline" to="/register">
                {t("auth.create_account", { defaultValue: "Crear cuenta" })}
              </NavLink>
            </div>
          </form>
        </>
      )}
    </Boveda>
  );
}
