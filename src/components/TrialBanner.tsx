import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Clock, AlertTriangle } from "lucide-react";

import {
  subscriptionBillingService,
  BillingSummary,
} from "@/lib/api/subscriptionBillingService";
import {
  partnerBillingService,
  type CobroDelSocio,
} from "@/lib/api/partnerBillingService";
import { esFacturadaPorSocio, finDePruebaDelSocio } from "@/lib/avisosDelSocio";
import { esDiaCivil } from "@/pages/admin/Configuration/billing/cobroDelSocio";
import { soloFecha, soloFechaCivil } from "@/lib/horaDeLaEmpresa";

const CACHE_KEY = "cg_billing_summary";
const PARTNER_CACHE_KEY = "cg_partner_billing_summary";
const TTL_MS = 5 * 60 * 1000;

function leerCache<T>(clave: string): T | null {
  try {
    const raw = sessionStorage.getItem(clave);

    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);

    return Date.now() - ts < TTL_MS && data ? (data as T) : null;
  } catch {
    return null;
  }
}

function guardarCache(clave: string, data: unknown): void {
  try {
    sessionStorage.setItem(clave, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    /* ignore */
  }
}

/**
 * Thin app-wide banner reminding the tenant about their trial / billing state.
 * Hidden entirely when the subscription is active. Summary is cached in
 * sessionStorage so it doesn't refetch on every navigation.
 */
export default function TrialBanner() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [cobroDelSocio, setCobroDelSocio] = useState<CobroDelSocio | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;

    // Use a fresh cached value if available.
    const cached = leerCache<BillingSummary>(CACHE_KEY);

    if (cached) {
      setSummary(cached);
    } else {
      subscriptionBillingService
        .summary()
        .then((data) => {
          if (!mounted) return;
          setSummary(data);
          guardarCache(CACHE_KEY, data);
        })
        .catch(() => {
          /* no banner if it fails */
        });
    }

    return () => {
      mounted = false;
    };
  }, []);

  /* A partner-billed company: its trial is with the PARTNER, and the only
     thing worth saying is when it ends and that a card is needed. */
  const deSocio = esFacturadaPorSocio(summary);

  useEffect(() => {
    if (!deSocio) return;
    let mounted = true;
    const cached = leerCache<CobroDelSocio>(PARTNER_CACHE_KEY);

    if (cached) {
      setCobroDelSocio(cached);
    } else {
      partnerBillingService
        .resumen()
        .then((data) => {
          if (!mounted) return;
          setCobroDelSocio(data);
          guardarCache(PARTNER_CACHE_KEY, data);
        })
        .catch(() => {
          /* no banner if it fails */
        });
    }

    return () => {
      mounted = false;
    };
  }, [deSocio]);

  if (!summary || summary.status === "active") return null;

  const go = () => navigate("/setting/billing");

  if (deSocio) {
    /* Never the platform's trial/activate banner here: that trial is from a
       billing relationship this company does not have with us. */
    const fin = finDePruebaDelSocio(cobroDelSocio);

    if (!fin) return null;
    const fecha = esDiaCivil(fin)
      ? soloFechaCivil(fin, { month: "long" })
      : soloFecha(fin, { month: "long" });

    return (
      <Aviso
        accion={t("billing.partner.addCard", {
          defaultValue: "Añadir tarjeta",
        })}
        icon={<Clock className="shrink-0" size={15} />}
        texto={`${t("billing.partner.trialUntil", {
          defaultValue: "Tu periodo de prueba termina el {{fecha}}.",
          fecha,
        })} ${t("billing.partner.trialAddCard", {
          defaultValue:
            "Añade una tarjeta antes de esa fecha para que el servicio siga sin cortes.",
        })}`}
        tono="warn"
        onAccion={go}
      />
    );
  }

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
    <Aviso
      accion={t("billing.activate", { defaultValue: "Activar suscripción" })}
      icon={icon}
      texto={text}
      tono={tono}
      onAccion={go}
    />
  );
}

function Aviso({
  tono,
  icon,
  texto,
  accion,
  onAccion,
}: {
  tono: "info" | "warn" | "bad";
  icon: ReactNode;
  texto: string;
  accion: string;
  onAccion: () => void;
}) {
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
        <span className="min-w-0">{texto}</span>
      </span>
      {/* Activar es la acción principal del producto: relleno de marca con tinta
          `--brand-ink`. El coral `#f36a6d` de antes no salía de ningún token. */}
      <button
        className="cg-btn-brand cg-focus shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-[filter] hover:brightness-105"
        onClick={onAccion}
      >
        {accion}
      </button>
    </div>
  );
}
