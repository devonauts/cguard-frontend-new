import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAgente } from "@/lib/agenteDeMarca";

/**
 * CÓMO SE CONECTA EL WHATSAPP DE LA EMPRESA — los requisitos y los pasos.
 *
 * La conexión es el registro integrado de Meta (un botón en Configuración ›
 * Comunicaciones, `WhatsAppBusinessCard`), en su modo ESTÁNDAR
 * (`featureType: ""`): el número pasa a la plataforma de Meta, así que no
 * puede seguir en la app de WhatsApp. Por eso el tercer requisito.
 *
 * Se enseña en dos sitios: la sección «Conecta tu WhatsApp» de {{agente}} Pro
 * (con el botón a Comunicaciones) y la propia tarjeta de Comunicaciones,
 * plegada, junto al botón de conectar.
 */
const REQUISITOS = ["req1", "req2", "req3"] as const;
const PASOS = ["paso1", "paso2", "paso3", "paso4", "paso5"] as const;

export default function GuiaConectarWhatsApp({ conBoton = false }: { conBoton?: boolean }) {
  const { t } = useTranslation();
  const a = { agente: useAgente().nombre };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
          {t("vigiaPro.guiaWhatsApp.necesitas")}
        </div>
        <ul className="space-y-1.5">
          {REQUISITOS.map((k) => (
            <li key={k} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--ok-text, var(--ok))" }} />
              <span className="min-w-0">{t(`vigiaPro.guiaWhatsApp.${k}`, a)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>
          {t("vigiaPro.guiaWhatsApp.pasos")}
        </div>
        <ol className="space-y-2">
          {PASOS.map((k, i) => (
            <li key={k} className="flex gap-2.5">
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
              >
                {i + 1}
              </span>
              <span className="min-w-0">{t(`vigiaPro.guiaWhatsApp.${k}`, a)}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        {t("vigiaPro.guiaWhatsApp.pago")}
      </p>

      {conBoton && (
        <div className="cg-acciones">
          <Button asChild variant="brand">
            <Link to="/setting/comunicaciones">{t("vigiaPro.guiaWhatsApp.boton")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
