import type { CobroDelSocio } from "@/lib/api/partnerBillingService";
import type { BillingSummary } from "@/lib/api/subscriptionBillingService";

import {
  esMarcaDeSocio,
  type ContextoDeMarca,
} from "../contexts/WhiteLabelContext";

/**
 * Pure decisions behind the notices a partner's company sees (demo banner,
 * trial banner). Kept free of API clients so they can be unit-tested.
 */

/** CGuardPro's own sales line, only ever offered on the platform host. */
const WHATSAPP_DE_PLATAFORMA = "593995914128";

/**
 * Where "help me set it up" goes, or `null` to hide the button.
 *
 * A partner's company must never be sent to CGuardPro's WhatsApp: it would
 * reveal the provider and hand the partner's customer to us. It goes to the
 * partner's published support (phone → WhatsApp, else their support URL); a
 * partner that published neither simply gets no button.
 */
export function enlaceDeAyuda(
  ctx: Pick<ContextoDeMarca, "scope" | "support">,
  mensaje: string,
): string | null {
  const texto = encodeURIComponent(mensaje);

  if (!esMarcaDeSocio(ctx)) {
    return `https://wa.me/${WHATSAPP_DE_PLATAFORMA}?text=${texto}`;
  }
  const digitos = (ctx.support?.phone || "").replace(/\D/g, "");

  if (digitos.length >= 7) return `https://wa.me/${digitos}?text=${texto}`;
  const url = ctx.support?.url || "";

  if (/^https?:\/\//i.test(url)) return url;

  return null;
}

/** How close to its end a partner trial must be before the banner nags. */
const PARTNER_TRIAL_WARN_DAYS = 7;

/** Is this company billed by its partner rather than by the platform? */
export function esFacturadaPorSocio(summary: BillingSummary | null): boolean {
  return (
    summary?.billingOwnership === "reseller" ||
    summary?.status === "reseller_managed"
  );
}

/**
 * The end date of a partner trial worth warning about, or `null`.
 *
 * Same source as `PartnerBillingView` on /setting/billing: the partner's own
 * online billing. Only when the partner bills online, the company is still on
 * its trial, has no card on file, and the trial ends within the window — a
 * company that already added a card has nothing to do.
 */
export function finDePruebaDelSocio(
  cobro: CobroDelSocio | null,
  ahora: number = Date.now(),
): string | null {
  if (!cobro || !cobro.enabled) return null;
  if (cobro.status !== "trialing" || cobro.card || !cobro.trialEndsAt)
    return null;
  const fin = new Date(cobro.trialEndsAt).getTime();

  if (!Number.isFinite(fin)) return null;
  const dias = (fin - ahora) / 86_400_000;

  // Already past: the company is paused and /setting/billing says so.
  if (dias < 0 || dias > PARTNER_TRIAL_WARN_DAYS) return null;

  return cobro.trialEndsAt;
}
