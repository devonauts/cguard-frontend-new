import { NavLink, useNavigate } from "react-router-dom";
import { tituloConMarca } from "@/hooks/usePageTitle";
import { Mail, Lock, Eye, EyeOff, User, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import AuthShell, { CAMPO_ICONO, BOTON_PRINCIPAL, Etiqueta } from "./AuthShell";

import { useAuth } from "@/contexts/AuthContext";
import { PhoneInput } from "@/components/phone/PhoneInput";
import Captcha from "@/components/auth/Captcha";
import { ApiService } from "@/services/api/apiService";

export default function Register() {
  const { t } = useTranslation();
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [phone, setPhone] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // ── ANTI-ROBOTS ────────────────────────────────────────────────────────
  // El campo trampa va oculto por CSS: una persona no lo ve y no lo rellena;
  // un robot rellena todo lo que encuentra. El momento en que se pintó el
  // formulario sirve para descartar el envío instantáneo. Ninguna de las dos
  // molesta a nadie real, y las dos funcionan sin configurar nada.
  const [trampa, setTrampa] = useState("");
  const pintadoEn = useRef<number>(Date.now());

  const [captchaToken, setCaptchaToken] = useState("");
  const [captcha, setCaptcha] = useState<{
    enabled: boolean;
    siteKey: string | null;
    provider: "turnstile" | "recaptcha";
  }>({
    enabled: false,
    siteKey: null,
    provider: "turnstile",
  });

  useEffect(() => {
    document.title = tituloConMarca(t("auth.register_title") || "Registro | Cguard");
  }, []);

  // ATRIBUCIÓN ENTRE DOMINIOS. El sitio vive en cguardpro.com y el alta aquí,
  // en app.cguardpro.com: son orígenes distintos, así que la sesión del sitio
  // no cruza sola. La traemos colgando del enlace (?cg=…&lp=…) y avisamos al
  // panel de que un visitante del sitio EMPEZÓ un alta — así el embudo
  // blog → alta se cierra. Sin `cg` no hay nada que atribuir y no se hace nada.
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const cg = q.get("cg");

      if (cg) {
        sessionStorage.setItem("cg_web", cg);
        if (q.get("lp")) sessionStorage.setItem("cg_lp", q.get("lp") as string);
        pistaDeAlta("signup_started");
      }
    } catch {
      /* la atribución nunca estorba el registro */
    }
  }, []);

  // ¿Hay captcha configurado? Lo dice el servidor. Si no responde, el
  // formulario sigue siendo usable: el servidor decide igual del otro lado.
  useEffect(() => {
    let vivo = true;

    ApiService.get("/auth/sign-up/config")
      .then((r: any) => {
        if (!vivo) return;
        const c = (r && (r.captcha || r.data?.captcha)) || null;

        if (c && c.enabled && c.siteKey)
          setCaptcha({
            enabled: true,
            siteKey: c.siteKey,
            provider: c.provider === "recaptcha" ? "recaptcha" : "turnstile",
          });
      })
      .catch(() => undefined);

    return () => {
      vivo = false;
    };
  }, []);

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!name || !email || !phone || !password || !confirm) {
      toast.error(t("auth.fill_all_fields"));

      return;
    }

    // Mismo criterio que el servidor (lib/validators/telefono): entre 8 y 15
    // dígitos. Se comprueba aquí para no gastar un viaje y dar el mensaje ya.
    const digitos = phone.replace(/\D/g, "");

    if (digitos.length < 8 || digitos.length > 15) {
      toast.error(
        t("auth.phone_invalid", {
          defaultValue:
            "Ese teléfono no parece válido. Revisa el país y el número.",
        }),
      );

      return;
    }

    if (captcha.enabled && !captchaToken) {
      toast.error(
        t("auth.captcha_pending", {
          defaultValue: "Confirma que no eres un robot para continuar.",
        }),
      );

      return;
    }
    if (password !== confirm) {
      toast.error(t("auth.passwords_not_match"));

      return;
    }

    // Validación de política de contraseña en frontend
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

    setIsLoading(true);
    const res = await signUp({
      email,
      password,
      name,
      phoneNumber: phone,
      captchaToken: captchaToken || undefined,
      companyWebsite: trampa,
      elapsedMs: Date.now() - pintadoEn.current,
    });

    setIsLoading(false);

    if (res?.success) {
      pistaDeAlta("signup_completed");
      toast.success(t("auth.account_created_verify_email"));
      navigate("/login");
    } else {
      const msg = res?.error || "Error al registrarse";

      toast.error(msg);
    }
  };

  // Avisa al panel de un momento del alta, con la sesión ORIGINAL del sitio
  // (la que traía el enlace), para que el evento caiga en el mismo embudo que
  // su visita al blog. Va directo al API público de tracking.
  function pistaDeAlta(evento: string) {
    try {
      const cg = sessionStorage.getItem("cg_web");

      if (!cg) return;
      const base = (import.meta.env.VITE_API_URL as string | undefined) || "";

      fetch(`${base}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        keepalive: true,
        body: JSON.stringify({
          source: "website",
          sessionId: cg,
          event: evento,
          path: sessionStorage.getItem("cg_lp") || "/register",
        }),
      }).catch(() => {});
    } catch {
      /* nunca romper el alta por una métrica */
    }
  }

  return (
    <AuthShell title={t("auth.register_prompt") || "Crea tu cuenta"}>
      <form className="space-y-4" onSubmit={handleRegister}>
        {/* Nombre */}
        <div>
          <Etiqueta htmlFor="name">{t("auth.name_label")}</Etiqueta>
          <div className="relative">
            <User
              className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2"
              style={{ color: "var(--ink-faint)" }}
            />
            <input
              autoComplete="name"
              className={CAMPO_ICONO}
              disabled={isLoading}
              id="name"
              placeholder={t("auth.name_placeholder")}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            />
          </div>
        </div>

        {/* Correo */}
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
              placeholder={t("comun.tuCorreoCom")}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            />
          </div>
        </div>

        {/* Teléfono — el dato con el que se contacta al prospecto. El mismo
            componente que usa el CRM, así que el número queda en formato
            internacional y sirve luego para SMS, WhatsApp y el marcador. */}
        <div>
          <Etiqueta htmlFor="phone">
            {t("auth.phone_label", { defaultValue: "Teléfono" })}
          </Etiqueta>
          <PhoneInput
            placeholder={t("auth.phone_placeholder", {
              defaultValue: "99 123 4567",
            })}
            value={phone}
            onChange={setPhone}
          />
        </div>

        {/* Contraseña */}
        <div>
          <Etiqueta htmlFor="password">{t("auth.password_label")}</Etiqueta>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2"
              style={{ color: "var(--ink-faint)" }}
            />
            <input
              autoComplete="new-password"
              className={`${CAMPO_ICONO} pr-12`}
              disabled={isLoading}
              id="password"
              placeholder={t("auth.password_placeholder")}
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
            />
            <button
              aria-label={
                showPwd
                  ? t("auth.hide_password", {
                      defaultValue: "Ocultar contraseña",
                    })
                  : t("auth.show_password", {
                      defaultValue: "Mostrar contraseña",
                    })
              }
              className="cg-focus absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2.5 transition-colors"
              style={{ color: "var(--ink-faint)" }}
              type="button"
              onClick={() => setShowPwd((v) => !v)}
            >
              {showPwd ? (
                <EyeOff className="h-4.5 w-4.5" />
              ) : (
                <Eye className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </div>

        {/* Confirmar contraseña */}
        <div>
          <Etiqueta htmlFor="confirm">
            {t("auth.confirm_password_label")}
          </Etiqueta>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2"
              style={{ color: "var(--ink-faint)" }}
            />
            <input
              autoComplete="new-password"
              className={`${CAMPO_ICONO} pr-12`}
              disabled={isLoading}
              id="confirm"
              placeholder={t("auth.password_placeholder")}
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
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
              style={{ color: "var(--ink-faint)" }}
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
            >
              {showConfirm ? (
                <EyeOff className="h-4.5 w-4.5" />
              ) : (
                <Eye className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </div>

        {/* CAMPO TRAMPA — invisible para una persona, irresistible para un robot.

            `aria-hidden` + `tabIndex={-1}` lo sacan también del lector de pantalla

            y del recorrido por tabulador: nadie real puede llegar a él. */}

        <div
          aria-hidden="true"
          className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden"
        >
          <label htmlFor="companyWebsite">
            {t("auth.honeypot_label", { defaultValue: "No rellenar" })}
          </label>

          <input
            autoComplete="off"
            id="companyWebsite"
            name="companyWebsite"
            tabIndex={-1}
            type="text"
            value={trampa}
            onChange={(e) => setTrampa(e.target.value)}
          />
        </div>

        {captcha.enabled && captcha.siteKey ? (
          <Captcha
            action="signup"
            className="flex justify-center"
            provider={captcha.provider}
            siteKey={captcha.siteKey}
            onToken={setCaptchaToken}
          />
        ) : null}

        <button className={BOTON_PRINCIPAL} disabled={isLoading} type="submit">
          {isLoading ? (
            t("auth.creating_account")
          ) : (
            <>
              {t("auth.create_account")} <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <div className="pt-1 text-center text-sm">
          <span style={{ color: "var(--ink-soft)" }}>
            {t("auth.already_have_account")}{" "}
          </span>
          <NavLink
            className="-my-2 inline-block py-2 font-semibold hover:underline"
            style={{ color: "var(--brand-text)" }}
            to="/login"
          >
            {t("auth.login")}
          </NavLink>
        </div>
      </form>
    </AuthShell>
  );
}
