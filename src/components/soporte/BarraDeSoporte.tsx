import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "@/contexts/AuthContext";
import { MARCA_DE_PLATAFORMA, useWhiteLabel } from "@/contexts/WhiteLabelContext";
import {
  CLAVE_SESION_DE_SOPORTE,
  esSoporteDeLaPlataforma,
  esSoportePlataformaPorSocio,
  finDeSoporte,
  latidoDeSoporte,
  leerSesionDeSoporte,
} from "@/lib/sesionDeSoporte";

/** «Sigo aquí» del soporte: el servidor da por ido a quien calla 150 s. */
const MS_LATIDO = 60_000;

/**
 * The strip support sees while inside a company's CRM — a partner's support
 * (opened from the partner panel) or the platform's (inside the SuperAdmin's
 * frame): who they are acting for, the ticket, the minutes left, and an exit.
 *
 * While it is open it sends a heartbeat every minute, so the company's people
 * keep seeing «Support is connected live» (`SoporteEnVivo`); leaving tells the
 * server first, so their banner goes away at once. Then it signs the session
 * out and closes the tab; if the browser refuses (or we are inside the
 * SuperAdmin's frame, which has its own exit), it goes to the login.
 */
export default function BarraDeSoporte() {
  const { t } = useTranslation();
  const { signOut } = useAuth() as any;
  const marca = useWhiteLabel()?.platformName || "";
  const [sesion] = useState(leerSesionDeSoporte);
  const [ahora, setAhora] = useState(Date.now());

  const salir = async () => {
    await finDeSoporte();
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

  // El latido: mientras esta barra existe, el soporte está dentro.
  useEffect(() => {
    if (!sesion) return;
    void latidoDeSoporte();
    const id = window.setInterval(() => void latidoDeSoporte(), MS_LATIDO);

    return () => window.clearInterval(id);
  }, [sesion]);

  useEffect(() => {
    if (sesion && vence && ahora >= vence) void salir();
  }, [ahora]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sesion) return null;

  // El soporte de la plataforma se nombra como el anfitrión: en el de un socio
  // no se escribe nuestro nombre.
  // Platform support that came in through the partner panel acts as the
  // partner's admin, but it is CGuard Pro support: the bar says who really is
  // inside, not «<partner> support».
  const plataforma = esSoporteDeLaPlataforma(sesion);
  const texto = esSoportePlataformaPorSocio(sesion)
    ? t("soporte.barraPlataformaPorSocio", {
        empresa: sesion.tenantName,
        plataforma: MARCA_DE_PLATAFORMA.platformName,
        socio: sesion.resellerName,
      })
    : plataforma
      ? t("soporte.barraPlataforma", { empresa: sesion.tenantName, marca: marca || sesion.resellerName })
      : t("soporte.barra", { empresa: sesion.tenantName, socio: sesion.resellerName });

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-[2147483002] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-sm text-white shadow-lg"
      role="status"
      style={{
        background: "#b45309",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <span>{texto}</span>
      {sesion.ticketAsunto && (
        <span className="opacity-90">
          {t("soporte.ticket", { ticket: sesion.ticketAsunto })}
        </span>
      )}
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
