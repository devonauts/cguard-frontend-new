import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InfoNote } from "@/components/kit";
import {
  partnerBillingService,
  type PreparacionDeTarjeta,
  type ResultadoDelCobro,
} from "@/lib/api/partnerBillingService";

/**
 * EL CAMPO DE TARJETA DE MERCADO PAGO (Card Payment Brick), con la public key
 * DEL SOCIO. Igual que con Stripe, el número nunca pasa por nuestro servidor:
 * Mercado Pago devuelve un token de un solo uso y con él el servidor:
 *   · `guardar`: abre la SUSCRIPCIÓN de la empresa en la cuenta del socio
 *     (Mercado Pago la cobra solo cada mes), o le cambia la tarjeta;
 *   · `pagar`: paga lo pendiente ahora mismo con esa tarjeta («Pagar ahora»),
 *     o sólo las facturas de `invoiceIds` (un módulo): una ORDEN de Mercado Pago.
 *
 * El SDK (`sdk.mercadopago.com/js/v2`) se carga sólo al abrir este formulario.
 */
const SDK = "https://sdk.mercadopago.com/js/v2";
let cargando: Promise<any> | null = null;

function cargarSdk(): Promise<any> {
  const w = window as any;
  if (w.MercadoPago) return Promise.resolve(w.MercadoPago);
  if (!cargando) {
    cargando = new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = SDK;
      s.async = true;
      s.onload = () => (w.MercadoPago ? ok(w.MercadoPago) : mal(new Error("mp-unavailable")));
      s.onerror = () => {
        cargando = null;
        mal(new Error("mp-unavailable"));
      };
      document.head.appendChild(s);
    });
  }
  return cargando;
}

let contador = 0;

export default function FormularioMercadoPago({
  prep,
  modo = "guardar",
  amountCents = 0,
  invoiceIds,
  onSaved,
  onCancel,
}: {
  prep: PreparacionDeTarjeta;
  modo?: "guardar" | "pagar";
  /** Lo pendiente, en centavos: el Brick lo enseña al pagar. */
  amountCents?: number;
  /** Sólo estas facturas (un módulo); sin ellas, todo lo pendiente. */
  invoiceIds?: string[];
  onSaved: (r: ResultadoDelCobro) => Promise<void>;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const idHueco = useRef(`cg-mp-card-${++contador}`);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let brick: any = null;

    (async () => {
      try {
        const MercadoPago = await cargarSdk();
        if (!vivo) return;
        const mp = new MercadoPago(prep.publicKey, {
          locale: String(i18n.language || "es").startsWith("en") ? "en-US" : "es-MX",
        });
        brick = await mp.bricks().create("cardPayment", idHueco.current, {
          // El Brick pide un importe. Al pagar es lo pendiente; al guardar la
          // tarjeta da igual (lo que se cobre lo decide el servidor).
          initialization: {
            amount: modo === "pagar" && amountCents > 0 ? amountCents / 100 : 1,
          },
          customization: {
            paymentMethods: { maxInstallments: 1 },
            visual: {
              texts: {
                formSubmit:
                  modo === "pagar"
                    ? t("billing.partner.payNow", { defaultValue: "Pagar ahora" })
                    : t("billing.partner.saveCard", { defaultValue: "Guardar tarjeta" }),
              },
            },
          },
          callbacks: {
            onReady: () => vivo && setListo(true),
            onError: () =>
              vivo &&
              setError(
                t("billing.partner.cardError", {
                  defaultValue: "No se pudo guardar la tarjeta. Revisa los datos.",
                }),
              ),
            onSubmit: async (
              datos: {
                token?: string;
                payment_method_id?: string;
                issuer_id?: string | number;
              },
              extra?: { paymentTypeId?: string },
            ) => {
              if (!datos?.token) throw new Error("sin-token");
              setError(null);
              try {
                await onSaved(
                  modo === "pagar"
                    ? await partnerBillingService.pagar({
                        token: datos.token,
                        paymentMethodId: datos.payment_method_id,
                        issuerId:
                          datos.issuer_id === undefined ? undefined : String(datos.issuer_id),
                        paymentTypeId: extra?.paymentTypeId,
                        invoiceIds: invoiceIds?.length ? invoiceIds : undefined,
                      })
                    : await partnerBillingService.confirmarTarjeta(datos.token),
                );
              } catch (e: any) {
                setError(
                  e?.message ||
                    t("billing.partner.cardError", {
                      defaultValue: "No se pudo guardar la tarjeta. Revisa los datos.",
                    }),
                );
                throw e;
              }
            },
          },
        });
      } catch {
        if (!vivo) return;
        setError(
          t("billing.partner.stripeLoadError", {
            defaultValue:
              "No se pudo cargar el formulario de pago. Revisa tu conexión y vuelve a intentarlo.",
          }),
        );
      }
    })();

    return () => {
      vivo = false;
      try {
        brick?.unmount?.();
      } catch {
        /* ya desmontado */
      }
    };
  }, [prep.publicKey, modo, amountCents, (invoiceIds || []).join(",")]);

  return (
    <div className="space-y-4">
      <div id={idHueco.current} />
      {!listo && !error && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--ink-soft)" }}>
          <Loader2 className="animate-spin" size={14} />
          {t("billing.partner.loadingForm", { defaultValue: "Cargando el formulario seguro…" })}
        </div>
      )}
      {error && (
        <InfoNote icon={<AlertTriangle />} tone="bad">
          {error}
        </InfoNote>
      )}
      <div className="flex justify-end">
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel", { defaultValue: "Cancelar" })}
        </Button>
      </div>
    </div>
  );
}
