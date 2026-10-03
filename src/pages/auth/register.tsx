import { NavLink, useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  ArrowLeft,
  Building2,
  Check,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import Boveda, {
  BotonDeAccion,
  BotonVer,
  CAMPO,
  Campo,
  useBotonDeAccion,
} from "./Boveda";
import RevisaTuCorreo from "./RevisaTuCorreo";

import { enlaceLegal } from "@/lib/enlacesLegales";

import { tituloConMarca } from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { PhoneInput } from "@/components/phone/PhoneInput";
import Captcha from "@/components/auth/Captcha";
import { ApiService } from "@/services/api/apiService";
import { EVENTOS, medir } from "@/lib/analiticaDeMarca";
import { resolveApiBase } from "@/lib/apiBase";
import { Combobox } from "@/components/app/combobox";
import { listaDePaises } from "@/lib/paisDeLaEmpresa";
import { paisConocido } from "@/lib/paisDelVisitante";
import { isStrongPassword } from "@/lib/passwordPolicy";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import { useLanguage } from "@/contexts/LanguageContext";

/* ── EL REGISTRO «BÓVEDA» (2026-10-03) ─────────────────────────────────────
   Elegido por el dueño entre veinte propuestas: una tarjeta de vidrio oscuro
   con esquinas de visor sobre un fondo de noche LISO y QUIETO (pidió quitar la
   rejilla y las animaciones). El acento es `--brand`: oro en la plataforma, el
   color del socio en su anfitrión. Nada de nuestro nombre escrito a mano: la
   marca sale de `useWhiteLabel()`. */

/** Las cinco reglas de la contraseña (las mismas que `isStrongPassword`).
 *  Se enseñan como una lista que se va marcando, no como un «demasiado débil»:
 *  el dueño pidió que el aviso no suene a reproche (2026-10-03). */
function reglasDeClave(v: string) {
  return {
    largo: v.length >= 8,
    mayuscula: /[A-Z]/.test(v),
    minuscula: /[a-z]/.test(v),
    numero: /[0-9]/.test(v),
    simbolo: /[^A-Za-z0-9]/.test(v),
  };
}

export default function Register() {
  const { t, i18n } = useTranslation();
  const { signUp } = useAuth();
  const accion = useBotonDeAccion();
  /* Tras crear la cuenta: «Confirma tu correo» con el correo, y al inicio de
     sesión con «Entendido» o solo a los 7 s. */
  const [registradoCon, setRegistradoCon] = useState<string | null>(null);
  const { language } = useLanguage();
  const navigate = useNavigate();
  const alInicioDeSesion = useCallback(() => navigate("/login"), [navigate]);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  /* El nombre de la empresa y el país, desde el alta: la empresa nace con
     ellos y el asistente de configuración abre con los dos puestos. El país
     arranca en el del visitante y del país sale el prefijo del teléfono. */
  const [empresa, setEmpresa] = useState("");
  const [pais, setPais] = useState<string>(() =>
    (paisConocido() || "").toUpperCase(),
  );
  const opcionesPais = useMemo(
    () =>
      listaDePaises(i18n.resolvedLanguage || i18n.language || "en").map(
        (p) => ({ value: p.code, label: `${p.bandera} ${p.nombre}` }),
      ),
    [i18n.resolvedLanguage, i18n.language],
  );
  const [showPwd, setShowPwd] = useState(false);
  /* ── DOS PASOS ──────────────────────────────────────────────────────────
     Siete campos en una columna asustan antes de empezar. El primer paso pide
     lo mínimo (nombre, correo, contraseña): quien ya hizo algo pequeño tiende
     a terminar lo que empezó. La empresa llega en el segundo. «Confirmar
     contraseña» se fue: el botón «Ver» evita la errata. */
  const [paso, setPaso] = useState<1 | 2>(1);
  const [correoTocado, setCorreoTocado] = useState(false);
  /* Al pasar al paso 2, el cursor va a la empresa: se hace por código y no
     con `autoFocus`, que salta al cargar y desorienta al lector de pantalla. */
  const campoEmpresa = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paso === 2) campoEmpresa.current?.focus();
  }, [paso]);
  const marca = useWhiteLabel();
  const dePlataforma = !!marca.puedeUsarArteDePlataforma;
  /* Las tres frases de abajo (14 días, sin tarjeta, la cifra) son promesas de
     la plataforma: en el anfitrión de un socio no se dicen. */
  const nombreDeMarca = marca.platformName || "";
  const [isLoading, setIsLoading] = useState(false);

  // ── ANTI-ROBOTS ────────────────────────────────────────────────────────
  // Tres campos trampa ocultos por CSS: una persona no los ve; un robot
  // rellena todo lo que encuentra. El momento en que se pintó el formulario
  // descarta el envío instantáneo. Y, encima, el captcha de Cloudflare
  // (Turnstile) cuando el servidor lo tiene configurado: si el captcha
  // confirma, una trampa rellena sólo se apunta (autocompletados de Edge).
  const [trampa, setTrampa] = useState("");
  const [trampa2, setTrampa2] = useState("");
  const [trampa3, setTrampa3] = useState("");
  /* Aceptar la Política de privacidad y los Términos: obligatorio. El servidor
     también lo exige y guarda cuándo y qué versión se aceptó. */
  const [acepta, setAcepta] = useState(false);
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
    document.title = tituloConMarca(
      t("auth.register_title") || "Registro | Cguard",
    );
  }, [language]);

  // ATRIBUCIÓN ENTRE DOMINIOS. El sitio vive en cguardpro.com y el alta aquí,
  // en app.cguardpro.com: son orígenes distintos, así que la sesión del sitio
  // no cruza sola. La traemos colgando del enlace (?cg=…&lp=…) y avisamos al
  // panel de que un visitante del sitio EMPEZÓ un alta.
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

  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const claveValida = isStrongPassword(password);
  const paso1Listo = !!name.trim() && correoValido && claveValida;
  const reglas = reglasDeClave(password);
  const cumplidas = Object.values(reglas).filter(Boolean).length;

  /** Paso 1 → 2. Los errores se dicen junto al campo, no en un aviso suelto. */
  const avanzar = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCorreoTocado(true);
    if (!paso1Listo) {
      toast.error(t("auth.fill_all_fields"));

      return;
    }
    setPaso(2);
  };

  const handleRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (paso === 1) return avanzar();

    if (!paso1Listo) {
      setPaso(1);

      return;
    }
    if (!empresa.trim() || !pais || !phone) {
      toast.error(t("auth.fill_all_fields"));

      return;
    }

    if (!acepta) {
      toast.error(
        t("auth.must_accept_terms", {
          defaultValue:
            "Para crear tu cuenta tienes que aceptar la Política de privacidad y los Términos y condiciones.",
        }),
      );

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

    const ok = await accion.ejecutar(async () => {
      setIsLoading(true);
      const res = await signUp({
        email,
        password,
        name,
        phoneNumber: phone,
        companyName: empresa.trim(),
        country: pais,
        captchaToken: captchaToken || undefined,
        companyWebsite: trampa,
        faxNumber: trampa2,
        homepageUrl: trampa3,
        acceptedTerms: acepta,
        app: "web",
        termsVersion: "2026-10",
        elapsedMs: Date.now() - pintadoEn.current,
      });

      setIsLoading(false);
      if (!res?.success) {
        toast.error(
          res?.error ||
            t("ui.AuthContext.errorAlRegistrarse", "Error al registrarse"),
        );

        return false;
      }

      return true;
    });

    if (ok) {
      pistaDeAlta("signup_completed");
      /* El embudo del SOCIO: en su anfitrión, este registro es su conversión
         (`sign_up` es el nombre recomendado de GA4). En el de la plataforma
         no hay medición de socio y esto no hace nada. */
      medir(EVENTOS.registro, { method: "email" });
      setRegistradoCon(email.trim());
    }
  };

  // Avisa al panel de un momento del alta, con la sesión ORIGINAL del sitio,
  // para que el evento caiga en el mismo embudo que su visita al blog.
  function pistaDeAlta(evento: string) {
    try {
      const cg = sessionStorage.getItem("cg_web");

      if (!cg) return;
      const base = (resolveApiBase() as string | undefined) || "";

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

  const primerNombre = name.trim().split(/\s+/)[0] || "";

  if (registradoCon)
    return (
      <Boveda
        estado={t("auth.signup.altaDeEmpresa", {
          defaultValue: "Alta de empresa",
        })}
      >
        <RevisaTuCorreo
          autoSegundos={7}
          texto={t("auth.signup.confirmaTexto", {
            defaultValue:
              "Te enviamos un enlace a {{correo}}. Ábrelo para activar tu cuenta y poder entrar.",
            correo: registradoCon,
          })}
          textoBoton={t("auth.signup.entendido", { defaultValue: "Entendido" })}
          titulo={t("auth.signup.confirmaTuCorreo", {
            defaultValue: "Confirma tu correo",
          })}
          onContinuar={alInicioDeSesion}
        />
      </Boveda>
    );

  return (
    <Boveda
      bajoLaTarjeta={
        dePlataforma ? (
          <p className="cg-reg-medio flex items-center gap-2.5 text-sm">
            <span aria-hidden className="cg-reg-vivo" />
            {t("auth.signup.pruebaSocial", {
              defaultValue:
                "{{cifra}} empresas de seguridad operan con {{marca}}",
              cifra: "600+",
              marca: nombreDeMarca,
            })}
          </p>
        ) : null
      }
      estado={t("auth.signup.altaDeEmpresa", {
        defaultValue: "Alta de empresa",
      })}
    >
      {/* Pasos como pestañas. La 1 siempre se puede volver a abrir; la 2,
              sólo con el paso 1 completo. */}
      <div
        aria-label={t("auth.signup.pasos", { defaultValue: "Pasos" })}
        className={`cg-reg-pestanas ${paso === 2 ? "is-2" : ""}`}
        role="tablist"
      >
        <i aria-hidden />
        <button
          aria-selected={paso === 1}
          disabled={isLoading}
          role="tab"
          type="button"
          onClick={() => setPaso(1)}
        >
          1 · {t("auth.signup.tuCuenta", { defaultValue: "Tu cuenta" })}
        </button>
        <button
          aria-selected={paso === 2}
          disabled={isLoading}
          role="tab"
          type="button"
          onClick={() => avanzar()}
        >
          2 · {t("auth.signup.tuEmpresa", { defaultValue: "Tu empresa" })}
        </button>
      </div>

      <h1 className="font-display text-[1.7rem] font-semibold leading-tight tracking-tight">
        {paso === 1
          ? t("auth.register_prompt") || "Crea tu cuenta"
          : primerNombre
            ? t("auth.signup.hola", {
                defaultValue: "Encantados, {{nombre}}. Ahora tu empresa",
                nombre: primerNombre,
              })
            : t("auth.signup.ahoraTuEmpresa", {
                defaultValue: "Ahora, tu empresa",
              })}
      </h1>
      <p className="cg-reg-suave mb-5 mt-1.5 text-sm">
        {paso === 1
          ? t("auth.signup.sub1", {
              defaultValue: "Empieza tu prueba gratis en menos de un minuto.",
            })
          : t("auth.signup.sub2", {
              defaultValue: "Último paso: con esto preparamos tu espacio.",
            })}
      </p>

      <form
        noValidate
        className="space-y-4"
        onSubmit={paso === 1 ? avanzar : handleRegister}
      >
        {paso === 1 ? (
          <div key="p1" className="space-y-4">
            <Campo Icono={User} etiqueta={t("auth.name_label")} htmlFor="name">
              <input
                autoComplete="name"
                className={CAMPO}
                disabled={isLoading}
                id="name"
                placeholder={t("auth.name_placeholder")}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Campo>
            <Campo
              Icono={Mail}
              aviso={
                correoTocado && email && !correoValido
                  ? t("auth.signup.correoIncompleto", {
                      defaultValue: "Revisa el correo: parece incompleto.",
                    })
                  : undefined
              }
              etiqueta={t("auth.email_label", {
                defaultValue: "Correo electrónico",
              })}
              htmlFor="email"
            >
              <input
                autoComplete="email"
                className={CAMPO}
                disabled={isLoading}
                id="email"
                inputMode="email"
                placeholder={t("comun.tuCorreoCom")}
                type="email"
                value={email}
                onBlur={() => setCorreoTocado(true)}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Campo>
            <div>
              <Campo
                Icono={Lock}
                etiqueta={t("auth.password_label")}
                htmlFor="password"
              >
                <input
                  autoComplete="new-password"
                  className={`${CAMPO} pr-20`}
                  disabled={isLoading}
                  id="password"
                  placeholder={t("auth.password_placeholder")}
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <BotonVer
                  visible={showPwd}
                  onClick={() => setShowPwd((v) => !v)}
                />
              </Campo>
              {/* Lo que pide la contraseña, en positivo: cada regla se
                      pone en verde al cumplirse. Nada de «demasiado débil». */}
              <div aria-hidden className="cg-reg-fuerza" data-n={cumplidas}>
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              {claveValida ? (
                <p className="cg-reg-ok mt-2 flex items-center gap-1.5 text-xs">
                  <Check className="h-3.5 w-3.5" />
                  {t("auth.signup.claveSegura", {
                    defaultValue: "Contraseña segura",
                  })}
                </p>
              ) : (
                <div className="cg-reg-reglas">
                  {(
                    [
                      [
                        "largo",
                        t("auth.signup.reglaLargo", {
                          defaultValue: "8 caracteres",
                        }),
                      ],
                      [
                        "mayuscula",
                        t("auth.signup.reglaMayuscula", {
                          defaultValue: "Una mayúscula",
                        }),
                      ],
                      [
                        "minuscula",
                        t("auth.signup.reglaMinuscula", {
                          defaultValue: "Una minúscula",
                        }),
                      ],
                      [
                        "numero",
                        t("auth.signup.reglaNumero", {
                          defaultValue: "Un número",
                        }),
                      ],
                      [
                        "simbolo",
                        t("auth.signup.reglaSimbolo", {
                          defaultValue: "Un símbolo (!?#…)",
                        }),
                      ],
                    ] as const
                  ).map(([k, texto]) => (
                    <span key={k} className={reglas[k] ? "is-ok" : ""}>
                      {reglas[k] && <Check className="h-3 w-3" />}
                      {texto}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <button className="cg-reg-boton" disabled={isLoading} type="submit">
              {t("onboarding.wizard.continue", "Continuar")}{" "}
              <ArrowRight className="h-4 w-4" />
            </button>
            {/* La prueba de 14 días es de la plataforma: un socio pone
                    sus propias condiciones, así que en su anfitrión no se
                    promete nada. */}
            {dePlataforma && (
              <div className="cg-reg-suave flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
                {[
                  t("auth.signup.gratis14", {
                    defaultValue: "14 días gratis",
                  }),
                  t("auth.signup.sinTarjeta", {
                    defaultValue: "Sin tarjeta",
                  }),
                  t("auth.signup.sinCompromiso", {
                    defaultValue: "Sin compromiso",
                  }),
                ].map((x) => (
                  <span key={x} className="inline-flex items-center gap-1">
                    <Check className="h-3.5 w-3.5 text-[color:var(--brand)]" />
                    {x}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div key="p2" className="space-y-4">
            <Campo
              Icono={Building2}
              etiqueta={t("auth.company_label", {
                defaultValue: "Nombre de tu empresa",
              })}
              htmlFor="empresa"
            >
              <input
                ref={campoEmpresa}
                autoComplete="organization"
                className={CAMPO}
                disabled={isLoading}
                id="empresa"
                maxLength={120}
                placeholder={t("auth.company_placeholder", {
                  defaultValue: "Ej. Seguridad Andina",
                })}
                type="text"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
              />
            </Campo>
            <div>
              <label className="cg-reg-etiqueta" htmlFor="pais">
                {t("auth.country_label", { defaultValue: "País" })}
              </label>
              <div>
                <Combobox
                  aria-label={t("auth.country_label", {
                    defaultValue: "País",
                  })}
                  options={opcionesPais}
                  placeholder={t(
                    "ui.OnboardingWizard.buscarPais",
                    "Buscar país…",
                  )}
                  value={pais}
                  onChange={(v) => setPais(String(v || ""))}
                />
              </div>
            </div>
            <div>
              <label className="cg-reg-etiqueta" htmlFor="phone">
                {t("auth.phone_label", { defaultValue: "Teléfono" })}
              </label>
              <div>
                {/* El prefijo sigue al país elegido arriba. */}
                <PhoneInput
                  key={pais || "sin-pais"}
                  defaultCountry={pais || undefined}
                  value={phone}
                  onChange={setPhone}
                />
              </div>
            </div>

            {/* CAMPOS TRAMPA — invisibles para una persona, irresistibles
                    para un robot. Nombre sin significado y sólo lectura:
                    ningún autocompletado los pisa (pasó con Edge/Copilot,
                    2026-09-24); `aria-hidden` y `tabIndex={-1}` los sacan del
                    lector de pantalla y del tabulador. */}
            <div
              aria-hidden="true"
              className="absolute left-[-9999px] top-0 h-0 w-0 overflow-hidden"
            >
              <label htmlFor="cg-x7">
                {t("auth.honeypot_label", { defaultValue: "No rellenar" })}
              </label>
              {(
                [
                  ["cg-x7", trampa, setTrampa],
                  ["cg-f2", trampa2, setTrampa2],
                  ["cg-h9", trampa3, setTrampa3],
                ] as const
              ).map(([id, valor, poner]) => (
                <input
                  key={id}
                  data-1p-ignore
                  readOnly
                  autoComplete="off"
                  data-lpignore="true"
                  id={id}
                  name={id}
                  tabIndex={-1}
                  type="text"
                  value={valor}
                  onChange={(e) => poner(e.target.value)}
                />
              ))}
            </div>

            <label
              className="cg-reg-medio flex cursor-pointer items-start gap-2.5 text-sm"
              htmlFor="acepta"
            >
              <input
                checked={acepta}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
                disabled={isLoading}
                id="acepta"
                type="checkbox"
                onChange={(e) => setAcepta(e.target.checked)}
              />
              <span>
                {t("auth.accept_prefix", { defaultValue: "Acepto la" })}{" "}
                <a
                  className="cg-reg-enlace"
                  href={enlaceLegal("privacy", language)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t("auth.privacy_policy", {
                    defaultValue: "Política de privacidad",
                  })}
                </a>{" "}
                {t("auth.accept_and", { defaultValue: "y los" })}{" "}
                <a
                  className="cg-reg-enlace"
                  href={enlaceLegal("terms", language)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t("auth.terms_conditions", {
                    defaultValue: "Términos y condiciones",
                  })}
                </a>
                .
              </span>
            </label>

            {/* Cloudflare Turnstile (o reCAPTCHA, según la clave). El
                    dominio de cada socio tiene que estar en el widget de
                    Cloudflare; si no, el widget no da token. */}
            {captcha.enabled && captcha.siteKey ? (
              <Captcha
                action="signup"
                className="flex justify-center"
                provider={captcha.provider}
                siteKey={captcha.siteKey}
                onToken={setCaptchaToken}
              />
            ) : null}

            <div className="flex gap-2">
              <button
                aria-label={t("actions.back", "Atrás")}
                className="cg-reg-boton-sec"
                disabled={isLoading}
                type="button"
                onClick={() => setPaso(1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <BotonDeAccion
                className="flex-1"
                estado={accion.estado}
                type="submit"
              >
                {t("auth.create_account")} <ArrowRight className="h-4 w-4" />
              </BotonDeAccion>
            </div>
          </div>
        )}

        <p className="cg-reg-suave pt-1 text-center text-sm">
          {t("auth.already_have_account")}{" "}
          <NavLink
            className="cg-reg-enlace -my-2 inline-block py-2"
            to="/login"
          >
            {t("auth.login")}
          </NavLink>
        </p>
      </form>
    </Boveda>
  );
}
