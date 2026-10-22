import i18n from "@/i18n";
/**
 * CLIENT BILLING — what the company charges ITS clients: contracts with
 * rates → billing runs from approved shifts → invoices → payments.
 * See `backend/api/clientBilling` and `docs/facturacion-clientes.md`.
 *
 * Every amount is in integer CENTS; tax rates and late fees in basis points
 * (825 = 8.25 %); rule multipliers in hundredths (150 = 1.5×).
 * Mounted under /tenant/:tenantId/client-billing — never /billing, which is
 * the company's own subscription.
 */
import api from "../api";
import { descargarInforme } from "@/lib/export/serverDownload";

const getTenantId = (): string => {
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

const unwrap = <T,>(r: unknown): T => ((r as { data?: T })?.data ?? (r as T));
const base = () => `/tenant/${getTenantId()}/client-billing`;
const enc = (s: string) => encodeURIComponent(s);

const qs = (params: Record<string, string | number | undefined | null>): string => {
  const q = new URLSearchParams();

  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();

  return s ? `?${s}` : "";
};

// ── Closed sets ─────────────────────────────────────────────────────────────
export type BillingCycle = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type RuleMode = "none" | "multiplier" | "amount";
export type TaxJurisdiction = "state" | "postal" | "custom";
export type ContractStatus = "draft" | "active" | "ended" | "cancelled";
export type RateKind = "hourly" | "fixed" | "recurring" | "patrol" | "dispatch";
export type ShiftType = "any" | "day" | "night" | "weekend";
export type RateUnit = "hour" | "month" | "week" | "visit" | "each";
export type RunStatus = "draft" | "clientReview" | "approved" | "invoiced" | "cancelled";
export type RunItemKind = "shift" | "fixed" | "recurring" | "patrol" | "dispatch";
export type PremiumKind = "none" | "overtime" | "holiday" | "lastMinute";
export type DiscrepancyKind =
  | "noClockIn" | "openShift" | "noRate" | "missingPo" | "clientObjection"
  | "hoursOver" | "hoursUnder" | "unapprovedShift" | "unapprovedTimecard"
  | "overtime" | "holiday" | "lastMinuteCoverage";
export type DiscrepancySeverity = "block" | "warn" | "info";
export type DiscrepancyResolution = "pending" | "accepted" | "corrected" | "excluded";
export type InvoiceStatus =
  | "draft" | "issued" | "sent" | "viewed" | "partiallyPaid" | "paid" | "overdue" | "void" | "disputed";
/** `open` is a server-side alias: issued · sent · viewed · partiallyPaid · overdue. */
export type InvoiceFilterStatus = InvoiceStatus | "open";
export type PaymentMethod = "ach" | "card" | "check" | "wire" | "cash" | "other";
export type InvoiceEventType =
  | "created" | "edited" | "issued" | "sent" | "viewed" | "paymentRecorded" | "creditNote"
  | "voided" | "disputed" | "disputeResolved" | "overdue" | "lateFee" | "reminderSent";

export const BILLING_CYCLES: BillingCycle[] = ["weekly", "biweekly", "semimonthly", "monthly"];
export const RATE_KINDS: RateKind[] = ["hourly", "fixed", "recurring", "patrol", "dispatch"];
export const SHIFT_TYPES: ShiftType[] = ["any", "day", "night", "weekend"];
export const RATE_UNITS: RateUnit[] = ["hour", "month", "week", "visit", "each"];
export const PAYMENT_METHODS: PaymentMethod[] = ["ach", "card", "check", "wire", "cash", "other"];
export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "issued", "sent", "viewed", "partiallyPaid", "paid", "overdue", "void", "disputed"];

/** A premium rule. `multiplier` is in hundredths (150 = 1.5×); `amount` is
 *  cents per hour added to the base rate. `priority` (holiday) wins over
 *  overtime. `null` on a contract = the company default from settings. */
export interface PremiumRule { mode: RuleMode; value: number; priority?: boolean }

export interface ClientAccountRef {
  id: string;
  name?: string | null;
  lastName?: string | null;
  commercialName?: string | null;
  email?: string | null;
}

// ── Settings and the tax table ──────────────────────────────────────────────
export interface BillingSettings {
  id?: string;
  currency: string;
  invoicePrefix: string;
  invoicePadding: number;
  creditNotePrefix: string;
  defaultTermsDays: number;
  defaultBillingCycle: BillingCycle;
  roundingMinutes: number;
  overtimeRule: PremiumRule | null;
  holidayRule: PremiumRule | null;
  lateFeeBps: number;
  lateFeeGraceDays: number;
  reminderDays: number[];
  invoiceFooter: string | null;
  paymentInstructions: string | null;
  legalName: string | null;
  taxId: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
  w9DocumentUrl: string | null;
  attachShiftDetail: boolean;
}

export interface TaxRate {
  id: string;
  name: string;
  jurisdiction: TaxJurisdiction;
  state: string | null;
  postalCodePrefix: string | null;
  rateBps: number;
  active: boolean;
  notes: string | null;
}

export interface UsState { code: string; name: string }

export interface SettingsView { settings: BillingSettings; taxRates: TaxRate[]; usStates: UsState[] }

// ── Contracts and rates ─────────────────────────────────────────────────────
export interface ContractRate {
  id: string;
  contractId: string;
  postSiteId: string | null;
  stationId: string | null;
  kind: RateKind;
  shiftType: ShiftType;
  description: string | null;
  unit: RateUnit;
  unitCents: number;
  quantityPerCycle: number;
  taxable: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  overtimeRule: PremiumRule | null;
  holidayRule: PremiumRule | null;
  position: number;
}

export type RateInput = Partial<Omit<ContractRate, "id" | "contractId" | "position">>;

export interface Contract {
  id: string;
  clientAccountId: string;
  quoteId?: string | null;
  number: string | null;
  name: string;
  status: ContractStatus;
  currency: string;
  startsAt: string;
  endsAt: string | null;
  billingCycle: BillingCycle;
  prebill: boolean;
  paymentTermsDays: number;
  poNumber: string | null;
  poRequired: boolean;
  apEmail: string | null;
  apContactName: string | null;
  taxExempt: boolean;
  taxCertificateUrl: string | null;
  clientReviewBeforeInvoice: boolean;
  autopay: boolean;
  lateFeeBps: number | null;
  lateFeeGraceDays: number | null;
  overtimeRule: PremiumRule | null;
  holidayRule: PremiumRule | null;
  lastMinuteCoverageRule: PremiumRule | null;
  roundingMinutes: number | null;
  minBillableMinutes: number | null;
  notes: string | null;
  rates?: ContractRate[];
  clientAccount?: ClientAccountRef | null;
  createdAt?: string;
  updatedAt?: string;
}

export type ContractInput = Partial<Omit<Contract, "id" | "rates" | "clientAccount" | "createdAt" | "updatedAt">> & {
  rates?: RateInput[];
};

// ── Billing runs ────────────────────────────────────────────────────────────
export interface RunSummary {
  shifts?: number;
  scheduledMinutes?: number;
  workedMinutes?: number;
  billableMinutes?: number;
  premiumMinutes?: number;
  subtotalCents?: number;
  byKind?: Record<string, number>;
  blocking?: number;
  warnings?: number;
  clientApproved?: boolean;
}

export interface RunItem {
  id: string;
  runId: string;
  kind: RunItemKind;
  guardShiftId: string | null;
  rateId: string | null;
  postSiteId: string | null;
  stationId: string | null;
  guardId: string | null;
  guardName: string | null;
  siteName: string | null;
  date: string | null;
  description: string | null;
  scheduledMinutes: number;
  workedMinutes: number;
  billableMinutes: number;
  quantityHundredths: number;
  unit: RateUnit;
  unitCents: number;
  premiumKind: PremiumKind;
  amountCents: number;
  taxable: boolean;
  excluded: boolean;
  excludeReason: string | null;
  note: string | null;
}

export interface Discrepancy {
  id: string;
  runId: string;
  itemId: string | null;
  kind: DiscrepancyKind;
  severity: DiscrepancySeverity;
  detail: Record<string, unknown> | string | null;
  resolution: DiscrepancyResolution;
  resolvedById: string | null;
  resolvedAt: string | null;
  note: string | null;
}

export interface BillingRun {
  id: string;
  clientAccountId: string;
  contractId: string;
  periodStart: string;
  periodEnd: string;
  status: RunStatus;
  summary: RunSummary | null;
  invoiceId: string | null;
  clientReviewToken: string | null;
  clientReviewedAt: string | null;
  clientReviewNote: string | null;
  generatedById: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  items?: RunItem[];
  discrepancies?: Discrepancy[];
  contract?: { id: string; name: string; number: string | null; currency: string } | null;
  clientAccount?: ClientAccountRef | null;
  createdAt?: string;
}

// ── Invoices ────────────────────────────────────────────────────────────────
export interface TaxBreakdownRow { name: string; rateBps: number; baseCents: number; taxCents: number }

export interface BillTo {
  name: string | null;
  attention: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  taxId: string | null;
}

export interface InvoiceLine {
  id?: string;
  position?: number;
  kind?: RunItemKind | string;
  description: string;
  postSiteId?: string | null;
  date?: string | null;
  quantityHundredths: number;
  unit?: RateUnit | string;
  unitCents: number;
  amountCents?: number;
  taxable?: boolean;
  premiumKind?: PremiumKind;
  runItemId?: string | null;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  status: string;
  amountCents: number;
  refundedCents: number;
  currency: string;
  receivedAt: string | null;
  reference: string | null;
  providerRef: string | null;
  note: string | null;
  recordedById: string | null;
  createdAt?: string;
}

export interface CreditNote {
  id: string;
  number: string;
  status: string;
  reason: string | null;
  amountCents: number;
  issuedAt: string | null;
  createdAt?: string;
}

export interface InvoiceEvent {
  id: string;
  type: InvoiceEventType | string;
  actorType: "user" | "client" | "system";
  actorId: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface Invoice {
  id: string;
  clientAccountId: string;
  contractId: string | null;
  billingRunId: string | null;
  number: string | null;
  status: InvoiceStatus;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  poNumber: string | null;
  subtotalCents: number;
  taxCents: number;
  lateFeeCents: number;
  totalCents: number;
  paidCents: number;
  creditedCents: number;
  taxBreakdown: TaxBreakdownRow[] | null;
  billTo: BillTo | null;
  notes: string | null;
  publicToken: string | null;
  remindersSent: number[] | null;
  lines?: InvoiceLine[];
  payments?: Payment[];
  creditNotes?: CreditNote[];
  events?: InvoiceEvent[];
  clientAccount?: ClientAccountRef | null;
  contract?: { id: string; name: string; number: string | null } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceDetail { invoice: Invoice; publicUrl: string | null }

export interface ManualInvoiceInput {
  clientAccountId: string;
  contractId?: string;
  lines: Array<{
    description: string;
    kind?: string;
    unit?: RateUnit;
    quantityHundredths: number;
    unitCents: number;
    taxable?: boolean;
    postSiteId?: string | null;
    date?: string | null;
  }>;
  poNumber?: string;
  notes?: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface InvoiceUpdateInput {
  dueAt?: string | null;
  poNumber?: string | null;
  notes?: string | null;
  billTo?: Partial<BillTo>;
  lines?: InvoiceLine[];
}

export interface PaymentInput {
  amountCents: number;
  method: PaymentMethod;
  receivedAt?: string;
  reference?: string;
  note?: string;
}

// ── Aging ───────────────────────────────────────────────────────────────────
export type AgingBucketKey = "current" | "d1_30" | "d31_60" | "d61_90" | "d90plus";

export interface AgingClientRow {
  clientAccountId: string;
  name: string;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
  invoices: number;
  oldestDueAt: string | null;
}

export interface AgingReport {
  asOf: string;
  totalCents: number;
  buckets: Record<AgingBucketKey, number>;
  clients: AgingClientRow[];
}

// ── Payment gateway (the company's OWN Stripe account; phase 2) ─────────────
export interface GatewayStatus {
  connected: boolean;
  provider: string | null;
  mode: "test" | "live" | string | null;
  accountLabel: string | null;
  status: string | null;
  lastError: string | null;
  verifiedAt: string | null;
  eventsStatus: string | null;
  eventsError: string | null;
  eventsLastAt: string | null;
  allowCard: boolean;
  allowAch: boolean;
  /** The stored secret is never returned; only this. */
  publicKeyLast4: string | null;
}

export interface GatewayView { gateway: GatewayStatus; eventsUrl: string | null }

/** Balance = total − paid − credited. Same arithmetic as the server. */
export const balanceCents = (i: Pick<Invoice, "totalCents" | "paidCents" | "creditedCents">): number =>
  Math.max(0, Number(i.totalCents || 0) - Number(i.paidCents || 0) - Number(i.creditedCents || 0));

const clientBillingService = {
  // ── Settings and the tax table ────────────────────────────────────────────
  async settings(): Promise<SettingsView> {
    return unwrap(await api.get(`${base()}/settings`));
  },

  async saveSettings(patch: Partial<BillingSettings>): Promise<{ settings: BillingSettings }> {
    return unwrap(await api.put(`${base()}/settings`, { data: patch }));
  },

  async createTaxRate(r: Partial<TaxRate>): Promise<{ taxRate: TaxRate }> {
    return unwrap(await api.post(`${base()}/tax-rates`, { data: r }));
  },

  async updateTaxRate(id: string, r: Partial<TaxRate>): Promise<{ taxRate: TaxRate }> {
    return unwrap(await api.put(`${base()}/tax-rates/${enc(id)}`, { data: r }));
  },

  async deleteTaxRate(id: string): Promise<{ ok: boolean }> {
    return unwrap(await api.delete(`${base()}/tax-rates/${enc(id)}`));
  },

  // ── Contracts and rates ───────────────────────────────────────────────────
  async contracts(filter: { clientAccountId?: string; status?: ContractStatus } = {}): Promise<{ contracts: Contract[] }> {
    return unwrap(await api.get(`${base()}/contracts${qs(filter)}`));
  },

  async createContract(c: ContractInput): Promise<{ contract: Contract }> {
    return unwrap(await api.post(`${base()}/contracts`, { data: c }));
  },

  async contract(id: string): Promise<{ contract: Contract }> {
    return unwrap(await api.get(`${base()}/contracts/${enc(id)}`));
  },

  async updateContract(id: string, c: ContractInput): Promise<{ contract: Contract }> {
    return unwrap(await api.put(`${base()}/contracts/${enc(id)}`, { data: c }));
  },

  async setContractStatus(id: string, status: ContractStatus): Promise<{ contract: Contract }> {
    return unwrap(await api.post(`${base()}/contracts/${enc(id)}/status`, { data: { status } }));
  },

  async addRate(contractId: string, r: RateInput): Promise<{ rate: ContractRate; contract: Contract }> {
    return unwrap(await api.post(`${base()}/contracts/${enc(contractId)}/rates`, { data: r }));
  },

  async updateRate(contractId: string, rateId: string, r: RateInput): Promise<{ rate: ContractRate; contract: Contract }> {
    return unwrap(await api.put(`${base()}/contracts/${enc(contractId)}/rates/${enc(rateId)}`, { data: r }));
  },

  async deleteRate(contractId: string, rateId: string): Promise<{ contract: Contract }> {
    return unwrap(await api.delete(`${base()}/contracts/${enc(contractId)}/rates/${enc(rateId)}`));
  },

  // ── Billing runs ──────────────────────────────────────────────────────────
  async runs(filter: { status?: RunStatus; clientAccountId?: string } = {}): Promise<{ runs: BillingRun[] }> {
    return unwrap(await api.get(`${base()}/runs${qs(filter)}`));
  },

  /** Period comes from the contract's cycle when omitted (`date` picks which period). */
  async createRun(body: { contractId: string; periodStart?: string; periodEnd?: string; date?: string }): Promise<{ run: BillingRun }> {
    return unwrap(await api.post(`${base()}/runs`, { data: body }));
  },

  async run(id: string): Promise<{ run: BillingRun }> {
    return unwrap(await api.get(`${base()}/runs/${enc(id)}`));
  },

  async resolveDiscrepancy(
    runId: string,
    discrepancyId: string,
    body: { resolution: Exclude<DiscrepancyResolution, "pending">; note?: string; billableMinutes?: number },
  ): Promise<{ run: BillingRun }> {
    return unwrap(await api.post(`${base()}/runs/${enc(runId)}/discrepancies/${enc(discrepancyId)}`, { data: body }));
  },

  async updateItem(
    runId: string,
    itemId: string,
    body: { excluded?: boolean; billableMinutes?: number; unitCents?: number; note?: string },
  ): Promise<{ run: BillingRun }> {
    return unwrap(await api.put(`${base()}/runs/${enc(runId)}/items/${enc(itemId)}`, { data: body }));
  },

  async sendToClientReview(runId: string): Promise<{ run: BillingRun; reviewUrl: string | null }> {
    return unwrap(await api.post(`${base()}/runs/${enc(runId)}/client-review`, { data: {} }));
  },

  async approveRun(runId: string): Promise<{ run: BillingRun }> {
    return unwrap(await api.post(`${base()}/runs/${enc(runId)}/approve`, { data: {} }));
  },

  async cancelRun(runId: string): Promise<{ run: BillingRun }> {
    return unwrap(await api.post(`${base()}/runs/${enc(runId)}/cancel`, { data: {} }));
  },

  async invoiceRun(runId: string): Promise<{ invoice: Invoice }> {
    return unwrap(await api.post(`${base()}/runs/${enc(runId)}/invoice`, { data: {} }));
  },

  // ── Invoices ──────────────────────────────────────────────────────────────
  async invoices(filter: { status?: InvoiceFilterStatus; clientAccountId?: string; from?: string; to?: string; limit?: number } = {}): Promise<{ invoices: Invoice[] }> {
    return unwrap(await api.get(`${base()}/invoices${qs(filter)}`));
  },

  async createInvoice(body: ManualInvoiceInput): Promise<{ invoice: Invoice }> {
    return unwrap(await api.post(`${base()}/invoices`, { data: body }));
  },

  async invoice(id: string): Promise<InvoiceDetail> {
    return unwrap(await api.get(`${base()}/invoices/${enc(id)}`));
  },

  /** Draft only. */
  async updateInvoice(id: string, body: InvoiceUpdateInput): Promise<{ invoice: Invoice }> {
    return unwrap(await api.put(`${base()}/invoices/${enc(id)}`, { data: body }));
  },

  /** Draft only. */
  async deleteInvoice(id: string): Promise<{ ok: boolean }> {
    return unwrap(await api.delete(`${base()}/invoices/${enc(id)}`));
  },

  async issueInvoice(id: string): Promise<{ invoice: Invoice }> {
    return unwrap(await api.post(`${base()}/invoices/${enc(id)}/issue`, { data: {} }));
  },

  /** Issues a draft first; e-mails the PDF and the public link. */
  async sendInvoice(id: string, body: { to?: string[]; message?: string; lang?: string } = {}): Promise<{ invoice: Invoice; sent: boolean; to: string[]; reason?: string | null }> {
    return unwrap(await api.post(`${base()}/invoices/${enc(id)}/send`, { data: body }));
  },

  async downloadPdf(inv: Pick<Invoice, "id" | "number">, lang?: string): Promise<void> {
    await descargarInforme(`${base()}/invoices/${enc(inv.id)}/pdf?download=1${lang ? `&lang=${enc(lang)}` : ""}`, {
      format: "pdf",
      nombreBase: inv.number || "borrador",
    });
  },

  async recordPayment(id: string, body: PaymentInput): Promise<{ invoice: Invoice }> {
    return unwrap(await api.post(`${base()}/invoices/${enc(id)}/payments`, { data: body }));
  },

  async creditNote(id: string, body: { amountCents: number; reason: string }): Promise<{ invoice: Invoice }> {
    return unwrap(await api.post(`${base()}/invoices/${enc(id)}/credit-notes`, { data: body }));
  },

  /** Refused once a payment exists — credit it instead. */
  async voidInvoice(id: string, reason: string): Promise<{ invoice: Invoice }> {
    return unwrap(await api.post(`${base()}/invoices/${enc(id)}/void`, { data: { reason } }));
  },

  async setDisputed(id: string, disputed: boolean, note: string): Promise<{ invoice: Invoice }> {
    return unwrap(await api.post(`${base()}/invoices/${enc(id)}/dispute`, { data: { disputed, note } }));
  },

  // ── Aging ─────────────────────────────────────────────────────────────────
  async aging(): Promise<AgingReport> {
    return unwrap(await api.get(`${base()}/aging`));
  },

  // ── Payment gateway ───────────────────────────────────────────────────────
  async gateway(): Promise<GatewayView> {
    return unwrap(await api.get(`${base()}/gateway`));
  },

  /** Keys are verified server-side; a bad key comes back as a 400 with a message. */
  async connectGateway(body: { secretKey: string; publishableKey: string; allowCard?: boolean; allowAch?: boolean }): Promise<GatewayView> {
    return unwrap(await api.put(`${base()}/gateway`, { data: body }));
  },

  async updateGatewayOptions(body: { allowCard: boolean; allowAch: boolean }): Promise<GatewayView> {
    return unwrap(await api.put(`${base()}/gateway`, { data: body }));
  },

  async disconnectGateway(): Promise<GatewayView | { ok: boolean }> {
    return unwrap(await api.delete(`${base()}/gateway`));
  },
};

export default clientBillingService;
