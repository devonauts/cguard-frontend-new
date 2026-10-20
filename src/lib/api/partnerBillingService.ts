import i18n from "@/i18n";
import { ApiService } from "@/services/api/apiService";
import api from "@/lib/api";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA EMPRESA LE PAGA A SU SOCIO — `/tenant/:tenantId/partner-billing`
 *
 * Una empresa que trajo un socio de marca blanca no le paga a la plataforma: le
 * paga a él, con la pasarela DEL SOCIO (hoy Stripe; luego Mercado Pago, Kushki,
 * Tilopay). Estas rutas son lo que ve y hace la oficina en su Facturación.
 *
 * Dos reglas del servidor que la pantalla da por hechas:
 *   - El importe NO viaja nunca en la petición. Se paga «lo pendiente», y lo
 *     pendiente lo calcula el servidor.
 *   - Estas rutas quedan ABIERTAS aunque la empresa esté pausada por impago
 *     (todo lo demás contesta 402 `company_payment_required`): son justo el
 *     camino para salir de la pausa.
 *
 * Todos los importes son centavos enteros.
 * ════════════════════════════════════════════════════════════════════════════
 */

const tenantId = (): string => {
  const t = localStorage.getItem("tenantId");

  if (!t)
    throw new Error(
      i18n.t(
        "ui.apiService.noPudimosIdentificarTuEmpresa",
        "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
      ),
    );

  return t;
};

export type EstadoDeCobroDeEmpresa =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "exempt";

export interface TarjetaGuardada {
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

export interface LineaDeRecibo {
  kind: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  amountCents: number;
}

export interface ReciboDelSocio {
  id: string;
  number: string | null;
  /** `inicio` = alta + primer mes · `renovacion` = mes nuevo · `asientos` = usuarios añadidos a mitad de ciclo. */
  kind: "inicio" | "renovacion" | "asientos" | string;
  status: "open" | "paid" | "void" | string;
  currency: string;
  totalCents: number;
  amountPaidCents: number;
  issuedAt: string | null;
  paidAt: string | null;
  /** Ya no trae el texto de la pasarela: siempre null. El motivo va en `lastErrorKind`/`lastErrorCode`. */
  lastError: string | null;
  /** De quién es el último fallo: tarjeta · autenticacion · configuracion (de tu proveedor) · temporal. */
  lastErrorKind?: string | null;
  lastErrorCode?: string | null;
  /** Con qué tarjeta se pagó (sellada al cobrar). */
  paidCard?: { brand: string | null; last4: string } | null;
  lines: LineaDeRecibo[];
}

export interface CobroDelSocioActivo {
  enabled: true;
  gateway: {
    provider: "stripe" | "mercadopago" | "kushki" | "tilopay" | string;
    name: string;
    publicKey: string;
  };
  status: EstadoDeCobroDeEmpresa;
  trialEndsAt: string | null;
  anchorAt: string | null;
  cycle: { start: string; end: string; seatsPaid: number } | null;
  price: {
    currency: string;
    setupFeeCents: number;
    monthlyFeeCents: number;
    perUserCents: number;
    graceDays: number;
  };
  setupFeePending: boolean;
  seatsNow: number;
  nextChargeCents: number;
  card: TarjetaGuardada | null;
  /**
   * Cómo cobra esta pasarela. `subscription` (Mercado Pago): la pasarela cobra
   * sola cada mes con la tarjeta que guarda; `card` (Stripe): el servidor cobra
   * la tarjeta guardada. Con `payNowWithCard`, «Pagar ahora» pide la tarjeta
   * otra vez y su token de un uso paga lo pendiente.
   */
  payment?: { mode: "subscription" | "card"; payNowWithCard: boolean };
  /** La suscripción en la pasarela del socio, cuando la hay. */
  subscription?: {
    status: string;
    amountCents: number;
    nextChargeAt: string | null;
  } | null;
  amountDueCents: number;
  invoices: ReciboDelSocio[];
}

/**
 * `enabled: false` → el socio no cobra en línea: se queda la pantalla de «tu
 * proveedor gestiona la facturación». After the trial such a company is
 * `paused` until its provider activates it (`activationByPartner`).
 */
export type CobroDelSocio =
  | { enabled: false; status?: string | null; trialEndsAt?: string | null; activationByPartner?: boolean }
  | CobroDelSocioActivo;

/** Lo que contesta el servidor al guardar la tarjeta o al pagar: intenta cobrar lo pendiente en el acto. */
export interface ResultadoDelCobro {
  tenantId?: string;
  estado: string;
  cobradas: string[];
  fallidas: Array<{ number: string | null; motivo: string }>;
  /**
   * 3-D Secure: el banco pide que el titular confirme el cargo.
   *  · Stripe        `clientSecret` → `stripe.confirmCardPayment`.
   *  · Mercado Pago  `challenge { url, creq }` → the issuer's page in an
   *                  iframe; then `confirmarPago(invoiceId, chargeRef)`.
   */
  requiereAccion: null | {
    provider?: string;
    invoiceId: string;
    publicKey: string;
    clientSecret?: string;
    chargeRef?: string;
    challenge?: { url: string; creq: string };
  };
}

export interface PreparacionDeTarjeta {
  provider: string;
  publicKey: string;
  clientSecret: string;
  customerRef: string;
}

export const partnerBillingService = {
  resumen(): Promise<CobroDelSocio> {
    return ApiService.get(`/tenant/${tenantId()}/partner-billing`);
  },
  /** Tu factura en PDF (la misma que te llega por correo al pagarla). */
  async descargarRecibo(id: string, numero: string | null): Promise<void> {
    const { data } = await api.get(
      `/tenant/${tenantId()}/partner-billing/invoices/${encodeURIComponent(id)}/pdf`,
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(numero || id).replace(/[^A-Za-z0-9._-]+/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  },
  /** SetupIntent en la cuenta de Stripe DEL SOCIO (su clave pública). */
  prepararTarjeta(): Promise<PreparacionDeTarjeta> {
    return ApiService.post(
      `/tenant/${tenantId()}/partner-billing/card/setup`,
      {},
    );
  },
  /** `token` = el `pm_…` que devuelve `confirmCardSetup`. Guarda y cobra lo pendiente. */
  confirmarTarjeta(token: string): Promise<ResultadoDelCobro> {
    return ApiService.post(
      `/tenant/${tenantId()}/partner-billing/card/confirm`,
      { token },
    );
  },
  /**
   * Cobra ya los recibos abiertos, con la empresa delante (puede pedir 3-D Secure).
   * Con `token` (el del Brick de Mercado Pago, con su método y emisor) paga con
   * la tarjeta recién tecleada.
   */
  pagar(datos?: {
    token: string;
    paymentMethodId?: string;
    issuerId?: string;
  }): Promise<ResultadoDelCobro> {
    return ApiService.post(
      `/tenant/${tenantId()}/partner-billing/pay`,
      datos ?? {},
    );
  },
  /**
   * Tras `confirmCardPayment` (`cargo` = el id del PaymentIntent) o tras el
   * reto 3-D Secure de Mercado Pago (`cargo` = el id del pago). «pendiente»:
   * la pasarela aún decide; se asienta solo (aviso o siguiente barrido).
   */
  confirmarPago(
    invoiceId: string,
    cargo: string,
  ): Promise<{ estado: "pagada" | "rechazada" | "pendiente"; companyStatus?: string }> {
    return ApiService.post(
      `/tenant/${tenantId()}/partner-billing/pay/confirm`,
      { invoiceId, cargo },
    );
  },
};

export default partnerBillingService;
