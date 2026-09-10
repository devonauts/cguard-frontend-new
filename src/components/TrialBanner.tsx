import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Clock, AlertTriangle } from "lucide-react";

import {
  subscriptionBillingService,
  BillingSummary,
} from "@/lib/api/subscriptionBillingService";

const CACHE_KEY = "cg_billing_summary";
const TTL_MS = 5 * 60 * 1000;

/**
 * Thin app-wide banner reminding the tenant about their trial / billing state.
 * Hidden entirely when the subscription is active. Summary is cached in
 * sessionStorage so it doesn't refetch on every navigation.
 */
export default function TrialBanner() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  useEffect(() => {
    let mounted = true;

    // Use a fresh cached value if available.
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);

      if (raw) {
        const { ts, data } = JSON.parse(raw);

        if (Date.now() - ts < TTL_MS && data) {
          setSummary(data);

          return;
        }
      }
    } catch {
      /* ignore */
    }

    subscriptionBillingService
      .summary()
      .then((data) => {
        if (!mounted) return;
        setSummary(data);
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ ts: Date.now(), data }),
          );
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* no banner if it fails */
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!summary || summary.status === "active") return null;

  const go = () => navigate("/setting/billing");

  // La gravedad SUBE con el estado: informativo → aviso → grave. Los tres son
  // semánticos y fijos en tokens.css, así que un pago fallido se lee rojo con
  // cualquier acento configurado. Antes eran seis colores de Tailwind sueltos,
  // con tintas `-800` que sobre un fondo oscuro quedaban ilegibles.
  let tono: "info" | "warn" | "bad" = "info";
  let icon = <Clock className="shrink-0" size={15} />;
  let text = "";

  if (summary.status === "trialing") {
    text =
      summary.trial.daysLeft > 0
        ? t("billing.bannerTrialLeft", {
            defaultValue: "Prueba gratuita: te quedan {{n}} día(s).",
            n: summary.trial.daysLeft,
          })
        : t("billing.bannerTrialToday", {
            defaultValue: "Tu prueba gratuita termina hoy.",
          });
  } else if (summary.status === "trial_expired") {
    tono = "warn";
    icon = <AlertTriangle className="shrink-0" size={15} />;
    text = t("billing.bannerExpired", {
      defaultValue:
        "Tu prueba gratuita terminó. Activa tu suscripción para seguir usando la plataforma.",
    });
  } else if (summary.status === "past_due") {
    tono = "bad";
    icon = <AlertTriangle className="shrink-0" size={15} />;
    text = t("billing.bannerPastDue", {
      defaultValue:
        "Tu último pago falló. Actualiza tu suscripción para mantener el servicio.",
    });
  } else {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm"
      style={{
        background: `color-mix(in oklab, var(--${tono}) 12%, transparent)`,
        borderColor: `color-mix(in oklab, var(--${tono}) 30%, transparent)`,
        color: `var(--${tono}-text)`,
      }}
    >
      {/* `min-w-0` + salto de línea: el aviso de prueba es una frase larga y
          en un teléfono aplastaba al botón contra el borde. */}
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        <span className="min-w-0">{text}</span>
      </span>
      {/* Activar es la acción principal del producto: relleno de marca con tinta
          `--brand-ink`. El coral `#f36a6d` de antes no salía de ningún token. */}
      <button
        className="cg-btn-brand cg-focus shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-[filter] hover:brightness-105"
        onClick={go}
      >
        {t("billing.activate", { defaultValue: "Activar suscripción" })}
      </button>
    </div>
  );
}
