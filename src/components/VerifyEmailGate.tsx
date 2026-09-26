import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { ApiService } from "@/services/api/apiService";

/**
 * Blocking screen shown when an authenticated tenant user has NOT verified their
 * email. Email verification is mandatory: the backend 403s all tenant writes
 * until `emailVerified` is true, which otherwise surfaces as confusing errors
 * (and a broken onboarding). Instead we gate the app here with a clear call to
 * action: resend the verification email, or refresh once verified. We also poll
 * the profile so the screen clears automatically the moment the email is
 * verified in another tab.
 *
 * Rendered by ProtectedRoute (takes precedence over onboarding). Superadmins and
 * tenantless users are handled before this gate.
 */
export default function VerifyEmailGate() {
  const { t } = useTranslation();
  const { user, signOut, refreshProfile } = useAuth();
  const email = user?.email || "";

  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);

  // Cooldown countdown after a resend.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);

    return () => clearInterval(id);
  }, [cooldown]);

  // Auto-poll: detect verification done in another tab without a manual click.
  const pollingRef = useRef(false);

  useEffect(() => {
    const id = setInterval(async () => {
      if (pollingRef.current) return;
      pollingRef.current = true;
      try {
        await refreshProfile();
      } catch {
        /* ignore */
      } finally {
        pollingRef.current = false;
      }
    }, 15000);

    return () => clearInterval(id);
  }, [refreshProfile]);

  const resend = async () => {
    if (resending || cooldown > 0) return;
    setResending(true);
    try {
      // Authenticated endpoint — uses the current user's email server-side.
      await ApiService.post("/auth/send-email-address-verification-email", {});
      toast.success(
        t(
          "ui.VerifyEmailGate.teEnviamosUnNuevoCorreo",
          "Te enviamos un nuevo correo de verificación.",
        ),
      );
      setCooldown(60);
    } catch (e: any) {
      toast.error(
        e?.message ||
          t(
            "ui.VerifyEmailGate.noSePudoReenviar",
            "No se pudo reenviar el correo. Intenta de nuevo.",
          ),
      );
    } finally {
      setResending(false);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    try {
      const fresh = await refreshProfile();

      if (fresh && (fresh as any).emailVerified) {
        toast.success(t("ui.VerifyEmailGate.correoVerificado", "¡Correo verificado!"));
        // The gate unmounts on the next render once emailVerified is true.
      } else {
        toast.message(
          t(
            "ui.VerifyEmailGate.aunNoDetectamosLaVerificacion",
            "Aún no detectamos la verificación. Revisa tu correo (y la carpeta de spam).",
          ),
        );
      }
    } catch {
      toast.error(
        t(
          "ui.VerifyEmailGate.noSePudoComprobar",
          "No se pudo comprobar el estado. Intenta de nuevo.",
        ),
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    // Mismo patrón que `NoWorkspaceAccess`: lienzo del sistema + cristal elevado.
    // `position` en línea porque `.app-shell` fija `relative` y glass.css gana a
    // la utilidad `fixed` de Tailwind (va sin `@layer` — ver su cabecera).
    <div
      className="app-shell fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ position: "fixed" }}
    >
      <div
        aria-labelledby="verify-email-title"
        aria-modal="true"
        className="glass-raised w-full max-w-md p-7"
        role="alertdialog"
      >
        <div
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border"
          style={{
            background: "var(--brand-wash)",
            borderColor: "var(--brand-line)",
            color: "var(--brand-text)",
          }}
        >
          <svg
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
            viewBox="0 0 24 24"
          >
            <rect height="14" rx="2" width="18" x="3" y="5" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </div>

        <h2
          className="font-display text-center text-lg font-semibold"
          id="verify-email-title"
          style={{ color: "var(--ink)" }}
        >
          {t(
            "ui.VerifyEmailGate.verificaTuCorreoElectronico",
            "Verifica tu correo electrónico",
          )}
        </h2>

        <p
          className="mt-3 text-center text-sm leading-relaxed"
          style={{ color: "var(--ink-soft)" }}
        >
          {email
            ? t(
                "ui.VerifyEmailGate.paraEmpezarDebesConfirmarA",
                "Para empezar a usar la plataforma debes confirmar tu correo. Te enviamos un enlace de verificación a:",
              )
            : t(
                "ui.VerifyEmailGate.paraEmpezarDebesConfirmar",
                "Para empezar a usar la plataforma debes confirmar tu correo. Te enviamos un enlace de verificación.",
              )}
        </p>
        {email && (
          <p
            className="mt-1 text-center text-sm font-semibold"
            style={{ color: "var(--ink)" }}
          >
            {email}
          </p>
        )}
        <p
          className="mt-3 text-center text-xs"
          style={{ color: "var(--ink-faint)" }}
        >
          {t(
            "ui.VerifyEmailGate.abreElEnlaceDelCorreo",
            "Abre el enlace del correo y luego vuelve aquí. Esta pantalla se cerrará automáticamente cuando lo confirmes.",
          )}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            className="cg-btn-brand cg-focus w-full rounded-full px-4 py-2.5 text-sm font-semibold transition-[filter] hover:brightness-110 disabled:opacity-60"
            disabled={checking}
            type="button"
            onClick={checkNow}
          >
            {checking
              ? t("ui.VerifyEmailGate.comprobando", "Comprobando…")
              : t("ui.VerifyEmailGate.yaVerifiqueMiCorreo", "Ya verifiqué mi correo")}
          </button>
          <button
            className="cg-btn-glass cg-focus w-full rounded-full px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            disabled={resending || cooldown > 0}
            type="button"
            onClick={resend}
          >
            {cooldown > 0
              ? t("ui.VerifyEmailGate.reenviarCorreoEnSegundos", {
                  defaultValue: "Reenviar correo ({{s}}s)",
                  s: cooldown,
                })
              : resending
                ? t("ui.VerifyEmailGate.enviando", "Enviando…")
                : t(
                    "ui.VerifyEmailGate.reenviarCorreoDeVerificacion",
                    "Reenviar correo de verificación",
                  )}
          </button>
        </div>

        <button
          className="cg-focus mt-4 w-full rounded-full text-center text-xs transition-colors"
          style={{ color: "var(--ink-faint)" }}
          type="button"
          onClick={() => signOut()}
        >
          {t("header.logout", "Cerrar sesión")}
        </button>
      </div>
    </div>
  );
}
