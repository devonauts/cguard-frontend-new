import { useTranslation } from "react-i18next";
import { Building2, Mail, Phone } from "lucide-react";

import { GlassPanel, IconTile, Section, Field } from "@/components/kit";

/**
 * «De tu facturación se encarga tu proveedor».
 *
 * ── POR QUÉ ESTA PANTALLA EXISTE ──────────────────────────────────────────
 * Cuando una empresa la trae un distribuidor, CGuard Pro no tiene ninguna
 * relación de cobro con ella: no hay suscripción de Stripe, no hay prueba
 * gratuita corriendo, no hay tarjeta que actualizar y no hay precio por usuario
 * que enseñarle. Dejar la pantalla de siempre con esos datos a cero o en «—»
 * sería mentir de la forma más cara: alguien intentaría pagar aquí una factura
 * que le cobra otro.
 *
 * ── ES EL ÚNICO SITIO DEL CRM DONDE SE NOTA EL DISTRIBUIDOR ───────────────
 * En todo lo demás —vigilantes, rondas, incidentes, horarios— la empresa
 * trabaja exactamente igual y no hay nada que indique quién le factura. Aquí sí,
 * porque aquí es donde una persona necesita saber a quién llamar.
 *
 * Los datos de contacto vienen del servidor (`managedBy`), nunca del navegador.
 */

export interface ProveedorQueFactura {
  name: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
}

export default function ProviderManagedBilling({
  managedBy,
  plan,
}: {
  managedBy?: ProveedorQueFactura | null;
  plan?: string | null;
}) {
  const { t } = useTranslation();
  const nombre = managedBy?.name?.trim();

  return (
    <Section
      icon={<Building2 />}
      title={t("billing.managedByProvider.title", {
        defaultValue: "Tu proveedor gestiona la facturación",
      })}
    >
      <GlassPanel brand className="p-4">
        <div className="flex items-start gap-3">
          <IconTile size="sm">
            <Building2 />
          </IconTile>
          <p className="text-sm leading-relaxed">
            {nombre
              ? t("billing.managedByProvider.bodyNamed", {
                  defaultValue:
                    "El servicio lo contrataste a través de {{proveedor}}. " +
                    "Ellos se encargan de tu facturación y de tu plan.",
                  proveedor: nombre,
                })
              : t("billing.managedByProvider.body", {
                  defaultValue:
                    "El servicio lo contrataste a través de un proveedor. " +
                    "Ellos se encargan de tu facturación y de tu plan.",
                })}{" "}
            {t("billing.managedByProvider.contact", {
              defaultValue:
                "Para cualquier duda sobre cobros, precios o comprobantes, " +
                "escríbeles directamente.",
            })}
          </p>
        </div>
      </GlassPanel>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
        <Field
          label={t("billing.managedByProvider.provider", {
            defaultValue: "Proveedor",
          })}
          value={nombre || "—"}
        />
        {plan && (
          <Field
            label={t("billing.plan", { defaultValue: "Plan" })}
            value={plan}
          />
        )}
        {managedBy?.supportEmail && (
          <Field
            label={t("billing.managedByProvider.email", {
              defaultValue: "Correo de soporte",
            })}
            value={
              <a
                className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
                href={`mailto:${managedBy.supportEmail}`}
                style={{ color: "var(--brand-text)" }}
              >
                <Mail className="h-3.5 w-3.5" />
                {managedBy.supportEmail}
              </a>
            }
          />
        )}
        {managedBy?.supportPhone && (
          <Field
            label={t("billing.managedByProvider.phone", {
              defaultValue: "Teléfono de soporte",
            })}
            value={
              <a
                className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
                href={`tel:${managedBy.supportPhone}`}
                style={{ color: "var(--brand-text)" }}
              >
                <Phone className="h-3.5 w-3.5" />
                {managedBy.supportPhone}
              </a>
            }
          />
        )}
      </div>

      {/* Sin botón de pago, sin portal de tarjetas, sin precios por usuario y
          sin aviso de prueba: nada de eso existe para esta empresa. */}
    </Section>
  );
}
