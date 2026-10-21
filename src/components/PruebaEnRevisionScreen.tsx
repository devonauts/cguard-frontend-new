import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hourglass, ShieldX, RefreshCw } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { currentTenantEntry, getBillingState } from "@/lib/entitlements";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA PRUEBA GRATUITA, MIENTRAS LA REVISAMOS A MANO
 *
 * Decisión del dueño (2026-10-14, plan anti-copia): «aprobamos a todos a mano
 * para que usen la prueba». Una empresa que se registra sola nace en
 * `trial_pending` y el servidor le niega los datos del CRM hasta que alguien
 * de la plataforma la aprueba desde el superadmin. Esta pantalla ocupa el sitio
 * del CRM mientras tanto — sin ella, la persona vería un panel lleno de errores.
 *
 *  - "pending":  todavía no la hemos mirado. Se dice que llegará un correo y se
 *                vuelve a preguntar sola cada minuto: si la aprueban con la
 *                pestaña abierta, entra sin tener que recargar.
 *  - "rejected": no se activa. Se enseña el motivo que escribió quien revisó,
 *                si lo hay, y se ofrece escribirnos por si fue un error.
 *
 * Texto para el dueño de una empresa de seguridad: nada de «servidor», «API» ni
 * «tenant». Las empresas de un socio no pasan nunca por aquí (las responde su
 * socio), así que no hace falta la variante de marca blanca.
 * ════════════════════════════════════════════════════════════════════════════
 */

const CADA_MINUTO = 60_000;
// El mismo buzón que la pantalla de «Acceso bloqueado» (`pages/auth/AccesoBloqueado`).
const CORREO_DE_SOPORTE = "support@cguardpro.com";

export default function PruebaEnRevisionScreen({
  variant,
}: {
  variant: "pending" | "rejected";
}) {
  const { t } = useTranslation();
  const { signOut, user, refreshProfile } = useAuth() as any;
  const [comprobando, setComprobando] = useState(false);
  const [sigueIgual, setSigueIgual] = useState(false);
  const montado = useRef(true);

  const rechazada = variant === "rejected";
  const entrada = currentTenantEntry(user);
  const motivo: string | null = entrada?.trialReviewNote
    ? String(entrada.trialReviewNote)
    : null;
  const correo: string | null = user?.email ? String(user.email) : null;

  // Vuelve a pedir el perfil: si ya la aprobaron, `ProtectedRoute` deja de
  // pintar esta pantalla por sí solo al cambiar `billingStatus`.
  const comprobar = useCallback(
    async (manual: boolean) => {
      if (!refreshProfile) return;
      if (manual) setComprobando(true);
      try {
        const fresco = await refreshProfile();

        if (manual && montado.current) {
          const { billingStatus } = getBillingState(fresco);

          setSigueIgual(billingStatus === "trial_pending");
        }
      } catch {
        /* sin red: se reintenta en el siguiente minuto */
      } finally {
        if (manual && montado.current) setComprobando(false);
      }
    },
    [refreshProfile],
  );

  useEffect(() => {
    montado.current = true;
    if (rechazada) return;
    const id = window.setInterval(() => void comprobar(false), CADA_MINUTO);

    return () => {
      montado.current = false;
      window.clearInterval(id);
    };
  }, [rechazada, comprobar]);

  // En revisión es un compás de espera (`--info`); rechazada es grave
  // (`--bad`). Semánticos fijos: no cambian con el acento de la empresa.
  const tono = rechazada ? "bad" : "info";

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
        {rechazada ? <ShieldX size={30} /> : <Hourglass size={30} />}
      </div>

      <div className="max-w-md space-y-3">
        <h1
          className="font-display text-xl font-semibold"
          style={{ color: "var(--ink)" }}
        >
          {rechazada
            ? t("billing.pruebaEnRevision.rejectedTitle", {
                defaultValue: "No pudimos activar tu prueba",
              })
            : t("billing.pruebaEnRevision.pendingTitle", {
                defaultValue: "Tu prueba está en revisión",
              })}
        </h1>
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {rechazada
            ? t("billing.pruebaEnRevision.rejectedMsg", {
                defaultValue:
                  "Revisamos tu solicitud y no podemos activar la prueba gratuita de esta cuenta. Si crees que es un error, escríbenos y la revisamos de nuevo.",
              })
            : t("billing.pruebaEnRevision.pendingMsg", {
                defaultValue:
                  "Gracias por registrarte. Revisamos a mano cada cuenta nueva antes de activar la prueba gratuita; suele llevarnos menos de un día hábil. En cuanto esté lista te avisaremos por correo y podrás entrar.",
              })}
        </p>
        {!rechazada && correo ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            {t("billing.pruebaEnRevision.pendingEmail", {
              defaultValue: "Te escribiremos a {{email}}.",
              email: correo,
            })}
          </p>
        ) : null}
        {rechazada && motivo ? (
          <p
            className="rounded-xl border px-4 py-3 text-left text-sm"
            style={{
              borderColor: "var(--hairline)",
              color: "var(--ink)",
            }}
          >
            <span
              className="mb-1 block text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--ink-soft)" }}
            >
              {t("billing.pruebaEnRevision.reasonLabel", {
                defaultValue: "Motivo",
              })}
            </span>
            {motivo}
          </p>
        ) : null}
        {!rechazada && sigueIgual ? (
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {t("billing.pruebaEnRevision.stillPending", {
              defaultValue:
                "Todavía está en revisión. Te avisaremos por correo en cuanto esté lista.",
            })}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {rechazada ? (
          <a
            className="cg-btn-brand cg-focus rounded-full px-4 py-2 text-sm font-semibold transition-[filter] hover:brightness-105"
            href={`mailto:${CORREO_DE_SOPORTE}`}
          >
            {t("billing.pruebaEnRevision.contact", {
              defaultValue: "Escribir a soporte",
            })}
          </a>
        ) : (
          <button
            className="cg-btn-brand cg-focus inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-[filter] hover:brightness-105 disabled:opacity-60"
            disabled={comprobando}
            onClick={() => void comprobar(true)}
          >
            <RefreshCw
              className={comprobando ? "animate-spin" : undefined}
              size={14}
            />
            {comprobando
              ? t("billing.pruebaEnRevision.checking", {
                  defaultValue: "Comprobando…",
                })
              : t("billing.pruebaEnRevision.check", {
                  defaultValue: "Comprobar de nuevo",
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
