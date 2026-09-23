import { ApiService } from "@/services/api/apiService";

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
      "No pudimos identificar tu empresa. Cierra sesión y vuelve a entrar.",
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
  lastError: string | null;
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
  amountDueCents: number;
  invoices: ReciboDelSocio[];
}

/** `enabled: false` → el socio no cobra en línea: se queda la pantalla de «tu proveedor gestiona la facturación». */
export type CobroDelSocio = { enabled: false } | CobroDelSocioActivo;

/** Lo que contesta el servidor al guardar la tarjeta o al pagar: intenta cobrar lo pendiente en el acto. */
export interface ResultadoDelCobro {
  tenantId?: string;
  estado: string;
  cobradas: string[];
  fallidas: Array<{ number: string | null; motivo: string }>;
  /** 3-D Secure: el banco pide que el titular confirme el cargo. */
  requiereAccion: null | {
    invoiceId: string;
    clientSecret: string;
    publicKey: string;
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
  /** Cobra ya los recibos abiertos, con la empresa delante (puede pedir 3-D Secure). */
  pagar(): Promise<ResultadoDelCobro> {
    return ApiService.post(`/tenant/${tenantId()}/partner-billing/pay`, {});
  },
  /** Tras `confirmCardPayment`: `cargo` es el id del PaymentIntent. */
  confirmarPago(
    invoiceId: string,
    cargo: string,
  ): Promise<{ estado: "pagada" | "rechazada"; companyStatus?: string }> {
    return ApiService.post(
      `/tenant/${tenantId()}/partner-billing/pay/confirm`,
      { invoiceId, cargo },
    );
  },
};

export default partnerBillingService;
