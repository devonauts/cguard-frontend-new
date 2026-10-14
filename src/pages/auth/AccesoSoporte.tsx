import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import AuthShell from "./AuthShell";

import api, { setAuthToken } from "@/lib/api";
import { borrarAlmacenamientoDeSesion } from "@/contexts/AuthContext";
import { clearPersistedCache } from "@/lib/offline/persistCache";
import { clearQueue } from "@/lib/offline/offlineQueue";
import { CLAVE_SESION_DE_SOPORTE } from "@/lib/sesionDeSoporte";

/**
 * `/acceso-soporte?pase=…` — where "Open their CRM" in the partner panel lands.
 * Redeems the single-use pass for a 30-minute session, replaces whatever
 * session this browser had on this host, and enters the dashboard with a hard
 * load so every provider boots with the new identity.
 */
export default function AccesoSoporte() {
  const { t } = useTranslation();
  const [error, setError] = useState(false);
  const hecho = useRef(false);

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    const pase = new URLSearchParams(window.location.search).get("pase") || "";

    // The ticket must not stay in the address bar or in history.
    window.history.replaceState(null, "", "/acceso-soporte");

    (async () => {
      try {
        const { data } = await api.post("/auth/support-ticket", { pase });
        const s = data?.data ?? data;

        if (!s?.token || !s?.tenantId) throw new Error("sin sesión");
        borrarAlmacenamientoDeSesion();
        try {
          await clearPersistedCache();
          clearQueue();
        } catch {
          /* nothing cached */
        }
        setAuthToken(s.token);
        localStorage.setItem("tenantId", String(s.tenantId));
        localStorage.setItem(
          CLAVE_SESION_DE_SOPORTE,
          JSON.stringify({
            resellerName: s.resellerName || "",
            tenantName: s.tenantName || "",
            expiresAt: s.expiresAt,
            soportePlataforma: s.soportePlataforma === true,
            impersonatedByEmail: s.soportePlataforma === true ? s.impersonatedByEmail || null : null,
          }),
        );
        window.location.replace("/dashboard");
      } catch {
        setError(true);
      }
    })();
  }, []);

  return (
    <AuthShell
      showFeatures={false}
      splash={false}
      title={error ? t("soporte.vencioTitulo") : t("soporte.entrando")}
    >
      <p className="text-sm opacity-80 text-center py-4">
        {error ? t("soporte.vencioTexto") : t("soporte.espera")}
      </p>
    </AuthShell>
  );
}
