import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { rutaDeAccesoBloqueado } from "@/lib/accesoBloqueado";
import Boveda, {
  BotonDeAccion,
  BotonVer,
  CAMPO,
  Campo,
  useBotonDeAccion,
} from "./Boveda";
import BienvenidaAlEntrar from "./BienvenidaAlEntrar";

import {
  cancelarEntradaAlCrm,
  empezarEntradaAlCrm,
  terminarEntradaAlCrm,
} from "@/lib/entradaAlCrm";
import { tituloConMarca } from "@/hooks/usePageTitle";
import { esVistaPrevia } from "@/lib/vistaPrevia";
import { consultaDeAtribucion } from "@/lib/atribucionWeb";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthForm } from "@/hooks/useAuthForm";
import { ApiService } from "@/services/api/apiService";

export default function Login() {
  const { signIn } = useAuth();
  /* The same email can have one account per realm (platform, or a partner).
     When the password opens several, the server lists them and we ask. */
  const [cuentas, setCuentas] = useState<Array<{
    realm: string;
    companies: string[];
  }> | null>(null);
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const accion = useBotonDeAccion();
  /* Tras el visto verde: «Bienvenido, {nombre}» y luego el CRM entra por
     partes (opciones 13 + 14 de la galería de transiciones). */
  const [bienvenida, setBienvenida] = useState(false);
  /* Al acabar la bienvenida, la guarda (PublicOnlyRoute) redirige con su
     lógica de siempre: vigilante → /guard, el resto → panel. */
  const irAlCrm = useCallback(() => terminarEntradaAlCrm(), []);
  const entrar = () => setBienvenida(true);
  const [searchParams] = useSearchParams();
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
  const securityGuardId = searchParams.get("securityGuardId") || undefined;
  const {
    email,
    password,
    showPassword,
    isLoading,
    setEmail,
    setPassword,
    toggleShowPassword,
    setIsLoading,
    validateEmail,
    validatePassword,
  } = useAuthForm();

  useEffect(() => {
    document.title = tituloConMarca(
      t("auth.login_title") || "Iniciar Sesión | Cguard",
    );
  }, []);

  useEffect(() => {
    const redirectIfInviteLink = async () => {
      if (!inviteToken) return;
      if (inviteType === "guard" || securityGuardId) {
        navigate(
          `/auth/invitation?token=${encodeURIComponent(inviteToken)}${securityGuardId ? `&securityGuardId=${encodeURIComponent(securityGuardId)}` : ""}&inviteType=guard`,
        );

        return;
      }
      if (inviteType === "client") {
        navigate(
          `/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`,
        );

        return;
      }

      try {
        const guardResponse = await ApiService.get(
          `/security-guard/public?token=${encodeURIComponent(inviteToken)}`,
          { skipAuth: true },
        );
        const guardData = guardResponse?.data || guardResponse;

        if (guardData) {
          navigate(
            `/auth/invitation?token=${encodeURIComponent(inviteToken)}${securityGuardId ? `&securityGuardId=${encodeURIComponent(securityGuardId)}` : ""}&inviteType=guard`,
          );

          return;
        }
      } catch (_e) {
        // not a guard invitation
      }

      try {
        const clientResponse = await ApiService.get(
          `/user/public?token=${encodeURIComponent(inviteToken)}`,
          { skipAuth: true },
        );
        const clientData = clientResponse?.data || clientResponse;

        if (clientData) {
          navigate(
            `/client/registration?token=${encodeURIComponent(inviteToken)}&inviteType=client`,
          );
        }
      } catch (_e) {
        // not a client invitation
      }
    };

    redirectIfInviteLink();
  }, [inviteToken, inviteType, securityGuardId, navigate]);

  /** Sign in to the account the person chose (email unique per realm). */
  const entrarCon = async (realm: string) => {
    setCuentaElegida(realm);
    setIsLoading(true);
    empezarEntradaAlCrm();
    const result = await signIn({ email, password, realm });

    setIsLoading(false);
    if (result.success) {
      setCuentas(null);
      entrar();
    } else if (result.accessBlocked) {
      cancelarEntradaAlCrm();
      navigate(rutaDeAccesoBloqueado({ motivo: "bloqueo" }), { replace: true });
    } else {
      cancelarEntradaAlCrm();
      toast.error(result.error || t("auth.login_failed"));
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    // The partner's login preview is a picture of the login: nobody signs in.
    if (esVistaPrevia()) {
      e?.preventDefault();

      return;
    }
    if (e) e.preventDefault();
    // use validation helpers from the hook (they show localized toasts)
    if (!validateEmail() || !validatePassword(6)) return;
    const ok = await accion.ejecutar(async () => {
      setIsLoading(true);
      // Antes de pedir la sesión: que la guarda no salte al panel todavía.
      empezarEntradaAlCrm();
      const result = await signIn({
        email,
        password,
        realm: cuentaElegida || undefined,
      });

      setIsLoading(false);
      if (result.chooseAccount?.length) {
        // Same email and password in several worlds: ask, never pick blindly.
        cancelarEntradaAlCrm();
        setCuentas(result.chooseAccount);

        return false;
      }
      if (result.accessBlocked) {
        // Bloqueado: la página seria, no un aviso que se va solo.
        cancelarEntradaAlCrm();
        navigate(rutaDeAccesoBloqueado({ motivo: "bloqueo" }), { replace: true });

        return false;
      }
      if (!result.success) {
        cancelarEntradaAlCrm();
        toast.error(result.error || t("auth.login_failed"));

        return false;
      }

      return true;
    });

    if (ok) {
      entrar();
    }
  };

  /**
   * Por qué te echó el CRM, si te echó.
   *
   * El caso que lo motiva es el operador de consola: su acceso al CRM dura lo
   * que dura su turno, así que al fichar salida en la app la sesión se le
   * cierra sola — que es lo correcto, pero sin decirlo se lee como una avería.
   * Se consume una sola vez para que no reaparezca en el siguiente login.
   */
  const [motivoSalida] = useState<string | null>(() => {
    try {
      const m = sessionStorage.getItem("authExitReason");

      sessionStorage.removeItem("authExitReason");

      return m && m.trim() ? m : null;
    } catch {
      return null;
    }
  });

  /* El mismo marco «Bóveda» que el registro (2026-10-03): entrar y darse de
     alta se sienten el mismo sitio, con el mismo cristal, el mismo selector
     de idioma y de modo claro/oscuro, y la marca del anfitrión. */
  return (
    <>
      {bienvenida && <BienvenidaAlEntrar onFin={irAlCrm} />}
      <Boveda
        splash
        estado={t("auth.signup.acceso", { defaultValue: "Acceso" })}
      >
        <h1 className="font-display text-[1.7rem] font-semibold leading-tight tracking-tight">
          {t("auth.login_prompt") || "Inicia sesión en tu cuenta"}
        </h1>
        <p className="cg-reg-suave mb-5 mt-1.5 text-sm">
          {t("auth.signup.loginSub", {
            defaultValue: "Bienvenido de nuevo. Entra para ver tu operación.",
          })}
        </p>
        {motivoSalida && (
          <div className="cg-reg-aviso mb-4">{motivoSalida}</div>
        )}
        {cuentas && (
          <div
            aria-labelledby="elegir-cuenta"
            className="cg-reg-aviso mb-4 space-y-2"
            role="dialog"
          >
            <p className="text-sm font-semibold" id="elegir-cuenta">
              {t("auth.chooseAccountTitle", "¿Con qué empresa quieres entrar?")}
            </p>
            <p className="text-xs">
              {t(
                "auth.chooseAccountHint",
                "Este correo tiene una cuenta en cada una. Elige la que quieres usar ahora.",
              )}
            </p>
            {cuentas.map((c) => (
              <button
                key={c.realm}
                className="cg-reg-campo !h-auto py-2.5 !pl-3 text-left text-sm disabled:opacity-60"
                disabled={isLoading}
                type="button"
                onClick={() => entrarCon(c.realm)}
              >
                {c.companies.length
                  ? c.companies.join(" · ")
                  : t(
                      "auth.chooseAccountNoCompany",
                      "Cuenta sin empresa asignada",
                    )}
              </button>
            ))}
            <button
              className="text-xs underline"
              type="button"
              onClick={() => {
                setCuentas(null);
                setCuentaElegida(null);
              }}
            >
              {t("common.cancel", "Cancelar")}
            </button>
          </div>
        )}
        <form className="space-y-4" onSubmit={handleLogin}>
          <Campo Icono={Mail} etiqueta={t("auth.email_label")} htmlFor="email">
            <input
              autoComplete="email"
              className={CAMPO}
              disabled={isLoading}
              id="email"
              inputMode="email"
              placeholder={t("auth.email_placeholder")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Campo>

          <Campo
            Icono={Lock}
            etiqueta={t("auth.password_label")}
            htmlFor="password"
          >
            <input
              autoComplete="current-password"
              className={`${CAMPO} pr-20`}
              disabled={isLoading}
              id="password"
              placeholder={t("auth.password_placeholder")}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <BotonVer visible={showPassword} onClick={toggleShowPassword} />
          </Campo>

          <div className="text-right">
            <NavLink className="cg-reg-enlace text-sm" to="/forgot-password">
              {t("auth.forgot_password")}
            </NavLink>
          </div>

          <BotonDeAccion estado={accion.estado} type="submit">
            {t("auth.login")} <ArrowRight className="h-4 w-4" />
          </BotonDeAccion>

          <p className="cg-reg-suave pt-1 text-center text-sm">
            {t("auth.no_account_text")}{" "}
            <NavLink
              className="cg-reg-enlace -my-2 inline-block py-2"
              to={`/register${consultaDeAtribucion()}`}
            >
              {t("auth.create_account")}
            </NavLink>
          </p>
        </form>
      </Boveda>
    </>
  );
}
