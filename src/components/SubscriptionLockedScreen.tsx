import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock, Ban } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";

/**
 * Full-screen hard lockout for tenants whose access has been cut off:
 *  - "canceled": subscription canceled. They can still reach the billing page
 *    to re-subscribe, so we offer that CTA.
 *  - "suspended": administrative hold (superadmin). No self-serve recovery —
 *    they must contact support.
 */
export default function SubscriptionLockedScreen({
  variant,
}: {
  variant: "canceled" | "suspended";
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { signOut } = useAuth() as any;

  const suspended = variant === "suspended";

  // Suspendido es GRAVE (`--bad`) y cancelado es un aviso (`--warn`): los dos
  // semánticos, fijos, para que no cambien con el acento de la empresa.
  const tono = suspended ? "bad" : "warn";

  return (
    <div className="app-shell flex h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full border"
        style={{
          background: `color-mix(in oklab, var(--${tono}) 14%, transparent)`,
          borderColor: `color-mix(in oklab, var(--${tono}) 32%, transparent)`,
          color: `var(--${tono}-text)`,
        }}
      >
        {suspended ? <Ban size={30} /> : <Lock size={30} />}
      </div>

      <div className="max-w-md space-y-2">
        <h1
          className="font-display text-xl font-semibold"
          style={{ color: "var(--ink)" }}
        >
          {suspended
            ? t("billing.lockedSuspendedTitle", {
                defaultValue: "Cuenta suspendida",
              })
            : t("billing.lockedCanceledTitle", {
                defaultValue: "Suscripción cancelada",
              })}
        </h1>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {suspended
            ? t("billing.lockedSuspendedMsg", {
                defaultValue:
                  "El acceso a esta cuenta fue suspendido por el administrador de la plataforma. Contacta a soporte para reactivarla.",
              })
            : t("billing.lockedCanceledMsg", {
                defaultValue:
                  "Tu suscripción fue cancelada. Reactívala para volver a usar la plataforma.",
              })}
        </p>
      </div>

      <div className="flex gap-3">
        {!suspended && (
          // Reactivar es la acción principal: relleno de marca y tinta
          // `--brand-ink`. El coral `#f36a6d` de antes no salía de ningún sitio.
          <button
            className="cg-btn-brand cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-[filter] hover:brightness-105"
            onClick={() => navigate("/setting/billing")}
          >
            {t("billing.lockedReactivate", {
              defaultValue: "Reactivar suscripción",
            })}
          </button>
        )}
        <button
          className="cg-btn-glass cg-focus rounded-full px-4 py-2 text-sm font-medium"
          onClick={() => {
            try {
              signOut?.();
            } catch {
              /* ignore */
            }
          }}
        >
          {t("billing.lockedSignOut", { defaultValue: "Cerrar sesión" })}
        </button>
      </div>
    </div>
  );
}
