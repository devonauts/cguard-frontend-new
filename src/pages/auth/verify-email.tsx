import { useEffect, useRef } from "react";
import { tituloConMarca } from "@/hooks/usePageTitle";
import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import AuthShell from "./AuthShell";

import { ApiService } from "@/services/api/apiService";
import { FadeIn } from "@/components/kit";
import { resolveApiBase } from "@/lib/apiBase";
import { useAuth } from "@/contexts/AuthContext";
import { olvidarPerfil } from "@/lib/perfilDeLaCuenta";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();

  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    document.title = tituloConMarca(
      t("auth.verify_email_title") || "Verificando correo",
    );
    (async () => {
      const params = new URLSearchParams(location.search);
      const rawToken = params.get("token");
      const token =
        rawToken && rawToken !== "null" && rawToken !== "undefined"
          ? rawToken
          : null;
      const securityGuardId = params.get("securityGuardId");

      if (!token) {
        toast.error(
          t("auth.verify_email_missing_token") ||
            "Falta el token de verificación",
        );
        navigate("/login", { replace: true });

        return;
      }

      const redirectInvite = async () => {
        try {
          const guardResponse = await ApiService.get(
            `/security-guard/public?token=${encodeURIComponent(token)}${securityGuardId ? `&securityGuardId=${encodeURIComponent(securityGuardId)}` : ""}`,
            { skipAuth: true },
          );
          const guardData = guardResponse?.data || guardResponse;

          if (guardData) {
            navigate(
              `/auth/invitation?token=${encodeURIComponent(token)}${securityGuardId ? `&securityGuardId=${encodeURIComponent(securityGuardId)}` : ""}&inviteType=guard`,
              { replace: true },
            );

            return true;
          }
        } catch (_err) {
          // not a guard invite
        }

        try {
          const clientResponse = await ApiService.get(
            `/user/public?token=${encodeURIComponent(token)}`,
            { skipAuth: true },
          );
          const clientData = clientResponse?.data || clientResponse;

          if (clientData) {
            navigate(
              `/client/registration?token=${encodeURIComponent(token)}&inviteType=client`,
              { replace: true },
            );

            return true;
          }
        } catch (_err) {
          // not a client invite
        }

        return false;
      };

      /* ── PRIMERO, LO QUE CASI SIEMPRE ES: VERIFICAR EL CORREO ────────────
         Antes se probaba primero si el código era de una invitación de
         vigilante o de cliente, y en un alta normal esas dos consultas
         respondían 400 SIEMPRE: dos errores en consola en cada verificación.
         Ahora se verifica primero; sólo si el servidor no reconoce el código
         como verificación se prueba si es una invitación. */
      try {
        const base = resolveApiBase() ?? "http://localhost:3001/api";
        const url = `${base.replace(/\/+$/, "")}/auth/verify-email?token=${encodeURIComponent(token)}`;
        const res = await fetch(url, { method: "PUT", credentials: "include" });

        if (res.ok) {
          toast.success(
            t("auth.verify_email_success") ||
              "Correo verificado, puedes iniciar sesión",
          );
          // Opened in the tab that is already signed in: refresh the session
          // now, or «Verifica tu correo» stayed on top until its 15 s poll.
          // The profile read at boot (still «unverified») is dropped too.
          if (localStorage.getItem("authToken")) {
            olvidarPerfil();
            try {
              await refreshProfile();
            } catch {
              /* the gate's own poll still catches up */
            }
          }
          navigate("/login", { replace: true });

          return;
        }
        const err = await res.json().catch(() => ({}));
        const redirected = await redirectInvite();

        if (redirected) return;
        const message =
          err && err.message
            ? err.message
            : t("auth.verify_email_failed") || "No se pudo verificar el correo";

        toast.error(message);
        navigate("/login", { replace: true });
      } catch (error) {
        if (await redirectInvite()) return;
        toast.error(
          t("auth.verify_email_failed") || "No se pudo verificar el correo",
        );
        navigate("/login", { replace: true });
      }
    })();
  }, []);

  return (
    <AuthShell
      showFeatures={false}
      splash={false}
      subtitle={t("auth.verify_email_subtitle", {
        defaultValue:
          "Estamos confirmando tu dirección. Esto tarda solo un momento.",
      })}
      title={t("auth.verify_email_title") || "Verificando tu correo"}
    >
      <FadeIn className="flex flex-col items-center justify-center py-10">
        <div
          className="h-12 w-12 animate-spin rounded-full"
          style={{
            border: "3px solid var(--hairline)",
            borderTopColor: "var(--brand)",
          }}
        />
        <p className="mt-5 text-sm" style={{ color: "var(--ink-soft)" }}>
          {t("auth.verify_email_processing") || "Procesando la verificación…"}
        </p>
      </FadeIn>
    </AuthShell>
  );
}
