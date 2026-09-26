import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/contexts/AuthContext";
import {
  CLAVE_SESION_DE_SOPORTE,
  leerSesionDeSoporte,
} from "@/lib/sesionDeSoporte";

/**
 * The strip a partner's support sees while inside a company's CRM: who they
 * are acting for, the minutes left, and an exit. Leaving signs the session out
 * and closes the tab (it was opened from the partner panel); if the browser
 * refuses to close it, it goes to the login.
 */
export default function BarraDeSoporte() {
  const { t } = useTranslation();
  const { signOut } = useAuth() as any;
  const [sesion] = useState(leerSesionDeSoporte);
  const [ahora, setAhora] = useState(Date.now());

  const salir = async () => {
    try {
      localStorage.removeItem(CLAVE_SESION_DE_SOPORTE);
      await signOut?.();
    } catch {
      /* leave anyway */
    }
    window.close();
    setTimeout(() => window.location.replace("/login"), 150);
  };

  const vence = sesion ? new Date(sesion.expiresAt).getTime() : 0;
  const minutos = Math.max(0, Math.ceil((vence - ahora) / 60000));

  useEffect(() => {
    if (!sesion) return;
    const id = window.setInterval(() => setAhora(Date.now()), 15000);

    return () => window.clearInterval(id);
  }, [sesion]);

  useEffect(() => {
    if (sesion && vence && ahora >= vence) void salir();
  }, [ahora]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sesion) return null;

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[2147483000] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-sm text-white shadow-lg"
      role="status"
      style={{ background: "#b45309" }}
    >
      <span>
        {t("soporte.barra", {
          empresa: sesion.tenantName,
          socio: sesion.resellerName,
        })}
      </span>
      <span className="opacity-80">
        {t("soporte.minutos", { count: minutos })}
      </span>
      <button
        className="rounded-md bg-white/15 hover:bg-white/25 px-3 py-1 font-medium"
        type="button"
        onClick={salir}
      >
        {t("soporte.salir")}
      </button>
    </div>
  );
}
