import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { confirmDialog } from "@/components/ui/confirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useEsGerenteDeSucursal } from "@/hooks/useGerenteDeSucursal";
import { useEsAdminDeMarca } from "@/hooks/useAccesoDeMarca";
import { mensajeDeAccesoDeMarca } from "@/lib/multimarca/accesoDeMarca";
import { useMarcas } from "@/hooks/useMarcas";
import { useTiendaDeModulos } from "@/hooks/useTiendaDeModulos";
import { marcasService } from "@/lib/api/marcasService";
import { isFreeTierUser, storeReasonForCompany } from "@/lib/freeTier";
import { precioDeModulo } from "@/pages/admin/modulos/precioDeModulo";

/**
 * BUYING ONE MORE BRAND SLOT (50 USD, one-time, in the company's currency).
 *
 * The answer of `POST /brands/slots/purchase` has the same shape as a
 * one-time module purchase, so it is handled exactly like the store does
 * (`ModulosAdicionalesPage.comprar`): confirm with the amount, charge the card
 * the subscription already has; if the bank asks for verification (Stripe) or
 * the payment is a Mercado Pago order, go to the payment link IN THIS TAB (a
 * window opened after waiting for the server counts as a pop-up and is
 * blocked); the slot counts once the payment comes back through the same
 * webhooks that switch on a one-time module.
 */
export function useComprarCupoDeMarca() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { precioExtra } = useMarcas();
  const tienda = useTiendaDeModulos();
  const gerente = useEsGerenteDeSucursal();
  // Phase 2: a brand admin never buys slots (403 `marca_pago`).
  const adminDeMarca = useEsAdminDeMarca();
  const gratis = isFreeTierUser(user);
  const [comprando, setComprando] = useState(false);

  const motivo = storeReasonForCompany(tienda.data?.reason, gratis);
  /* A partner's company is billed by its partner: the server answers with the
     partner resale, so the button stays. A branch manager never pays. */
  const puede =
    !gerente &&
    !adminDeMarca &&
    (!!tienda.data?.canPurchase || tienda.data?.reason === "la_factura_el_socio");
  const precio = precioExtra
    ? precioDeModulo(precioExtra.amount, precioExtra.currency)
    : "";

  const textoDeMotivo = (reason?: string | null) =>
    t(`modulosAdicionales.motivos.${reason || "error"}`, {
      defaultValue: t("modulosAdicionales.motivos.error"),
    });

  /** Returns true when the slot is already usable (paid or comp). */
  const comprar = async (opts: { sinConfirmar?: boolean } = {}) => {
    if (!puede || comprando) return false;
    const ok =
      opts.sinConfirmar ||
      (await confirmDialog({
        title: t("ui.ComprarCupoDeMarca.titulo", "¿Agregar otra marca?"),
        message: precio
          ? t(
              "ui.ComprarCupoDeMarca.mensaje",
              "Se cobra un pago único de {{precio}} a la tarjeta de tu suscripción. La marca queda disponible para siempre.",
              { precio },
            )
          : t(
              "ui.ComprarCupoDeMarca.mensajeSinPrecio",
              "Se cobra un pago único a la tarjeta de tu suscripción. La marca queda disponible para siempre.",
            ),
        confirmText: precio
          ? t("ui.ComprarCupoDeMarca.boton", "Pagar {{precio}}", { precio })
          : t("ui.ComprarCupoDeMarca.botonSinPrecio", "Pagar"),
        cancelText: t("common.cancel", { defaultValue: "Cancelar" }),
      }));

    if (!ok) return false;
    setComprando(true);
    try {
      const r = await marcasService.comprarCupos(1);

      if (r.estado === "pending_payment") {
        toast.info(t("modulosAdicionales.pendienteAviso"));
        if (r.enlaceDePago) window.location.assign(r.enlaceDePago);

        return false;
      }
      // A partner company whose partner bills by hand: the slot is a request
      // the partner approves (the store path for such a company).
      if (r.estado !== "active" && r.estado !== "comp") {
        toast.info(
          t(
            "ui.ComprarCupoDeMarca.solicitada",
            "Pedido enviado a tu proveedor. La marca queda disponible en cuanto lo apruebe.",
          ),
        );

        return false;
      }
      toast.success(
        t("ui.ComprarCupoDeMarca.exito", "Listo: ya puedes agregar otra marca."),
      );

      return true;
    } catch (e: any) {
      toast.error(textoDeMotivo(storeReasonForCompany(e?.data?.reason, gratis)));

      return false;
    } finally {
      await qc.invalidateQueries({ queryKey: ["marcas"] });
      setComprando(false);
    }
  };

  return {
    comprar,
    comprando,
    puede,
    precio,
    /** Why buying is not possible now (plain words), when it is not. */
    motivo: puede
      ? null
      : adminDeMarca
        ? mensajeDeAccesoDeMarca("marca_pago")
        : gerente
          ? null
          : motivo
            ? textoDeMotivo(motivo)
            : null,
  };
}
