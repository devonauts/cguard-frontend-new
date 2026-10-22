import i18n from "@/i18n";
/**
 * CLIENT BILLING — what the company charges ITS clients: contracts with
 * rates → billing runs from approved shifts → invoices → payments.
 * Also the quotes (proposals to prospects) that become a client + contract.
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
/** The six ways to pay every company has; it may add its own (`c_xxxxxxxx`). */
export type BuiltinPaymentMethod = "transfer" | "directDeposit" | "wire" | "check" | "card" | "cash";
/**
 * The method a payment is recorded with: a built-in, a company method key,
 * `other`, or the legacy `ach` older payments still carry.
 */
export type PaymentMethod = BuiltinPaymentMethod | "ach" | "other" | (string & {});
export type InvoiceEventType =
  | "created" | "edited" | "issued" | "sent" | "viewed" | "paymentRecorded" | "creditNote"
  | "voided" | "disputed" | "disputeResolved" | "overdue" | "lateFee" | "reminderSent" | "paymentMethods";

export const BILLING_CYCLES: BillingCycle[] = ["weekly", "biweekly", "semimonthly", "monthly"];
export const RATE_KINDS: RateKind[] = ["hourly", "fixed", "recurring", "patrol", "dispatch"];
export const SHIFT_TYPES: ShiftType[] = ["any", "day", "night", "weekend"];
export const RATE_UNITS: RateUnit[] = ["hour", "month", "week", "visit", "each"];
/** Canonical order, same as the server. */
export const BUILTIN_PAYMENT_METHODS: BuiltinPaymentMethod[] = ["transfer", "directDeposit", "wire", "check", "card", "cash"];
/** At most this many methods of the company's own. */
export const MAX_CUSTOM_PAYMENT_METHODS = 20;
export const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "issued", "sent", "viewed", "partiallyPaid", "paid", "overdue", "void", "disputed"];

/** A premium rule. `multiplier` is in hundredths (150 = 1.5×); `amount` is
 *  cents per hour added to the base rate. `priority` (holiday) wins over
 *  overtime. `null` on a contract = the company default from settings. */
export interface PremiumRule { mode: RuleMode; value: number; priority?: boolean }

/**
 * One way the company accepts payment. `description` is what the client reads
 * (bank details, payee, address); `note` is extra advice («write the invoice
 * number in the memo»). `label` names the company's own methods only.
 */
export interface PaymentMethodConfig {
  method: string;
  builtin: boolean;
  label: string | null;
  enabled: boolean;
  description: string | null;
  note: string | null;
}

/** A method one invoice offers, as the server resolves it. */
export interface OfferedPaymentMethod {
  method: string;
  label: string | null;
  description: string | null;
  note: string | null;
  online: boolean;
}

export const isBuiltinPaymentMethod = (m: string): m is BuiltinPaymentMethod => (BUILTIN_PAYMENT_METHODS as string[]).includes(m);

/** What the server assumes for a company that never configured its methods. */
export const defaultPaymentMethods = (): PaymentMethodConfig[] =>
  BUILTIN_PAYMENT_METHODS.map((method) => ({ method, builtin: true, label: null, enabled: method !== "cash", description: null, note: null }));

/**
 * What an invoice offers: its own list when it has one (a method the company
 * deleted is skipped), else the company's enabled methods. Same rule as the
 * server's `offeredMethods`.
 */
export function offeredPaymentMethodKeys(company: PaymentMethodConfig[], invoice: string[] | null | undefined): string[] {
  if (invoice && invoice.length) return invoice.filter((k) => company.some((c) => c.method === k));

  return company.filter((c) => c.enabled).map((c) => c.method);
}

export interface ClientAccountRef {
  id: string;
  name?: string | null;
  lastName?: string | null;
  commercialName?: string | null;
  email?: string | null;
}

// ── How the documents look (invoice and proposal PDFs) ──────────────────────
export const HEADER_STYLES = ["classic", "band", "minimal"] as const;
export type HeaderStyle = (typeof HEADER_STYLES)[number];
export const DOC_FONTS = ["helvetica", "times", "courier"] as const;
export type DocFont = (typeof DOC_FONTS)[number];

/** Mirrors `services/clientBilling/documentStyle.ts` on the server. */
export interface DocumentStyle {
  accentColor: string;
  textColor: string;
  headerStyle: HeaderStyle;
  font: DocFont;
  showLogo: boolean;
  logoPosition: "left" | "right";
  showTaxId: boolean;
  showPoNumber: boolean;
  showServicePeriod: boolean;
  showPaymentMethods: boolean;
  showSignatureLines: boolean;
  showPageNumbers: boolean;
  /** Empty = the translated default («FACTURA» / «INVOICE»). */
  invoiceTitle: string;
  quoteTitle: string;
  /** Pre-fills the notes of a new invoice that brings none. */
  invoiceDefaultNotes: string;
  invoiceTerms: string;
  /** Pre-fills the intro of a new proposal that brings none. */
  quoteDefaultIntro: string;
  quoteClosing: string;
  quoteFooter: string;
}

export const DEFAULT_DOCUMENT_STYLE: DocumentStyle = {
  accentColor: "#0d5c63",
  textColor: "#0f172a",
  headerStyle: "classic",
  font: "helvetica",
  showLogo: true,
  logoPosition: "left",
  showTaxId: true,
  showPoNumber: true,
  showServicePeriod: true,
  showPaymentMethods: true,
  showSignatureLines: false,
  showPageNumbers: true,
  invoiceTitle: "",
  quoteTitle: "",
  invoiceDefaultNotes: "",
  invoiceTerms: "",
  quoteDefaultIntro: "",
  quoteClosing: "",
  quoteFooter: "",
};

/** Maximum length of each text, as the server cuts it. */
export const DOCUMENT_TEXT_LIMITS = { title: 40, text: 4000 } as const;

export const isHexColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim());

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
  /** Quote numbering: `QUO-YYYY-NNNNN`. */
  quotePrefix?: string | null;
  /** Days a new quote stays valid (default 30). */
  quoteValidityDays?: number | null;
  /** Default terms text of new quotes. */
  quoteTerms?: string | null;
  /** The six built-ins in canonical order, then the company's own. */
  paymentMethods?: PaymentMethodConfig[];
  /** How the invoice and proposal PDFs look, and the company's own texts. */
  documentStyle?: DocumentStyle;
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

export interface SettingsView {
  settings: BillingSettings;
  taxRates: TaxRate[];
  usStates: UsState[];
  /** The company logo from its general settings (changed there, not in billing). */
  logoUrl?: string | null;
}

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
  /** The methods this invoice offers; null = whatever the company has enabled. */
  paymentMethods?: string[] | null;
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

// ── Quotes to prospects ─────────────────────────────────────────────────────
export type QuoteStatus = "draft" | "sent" | "viewed" | "accepted" | "rejected" | "expired" | "converted" | "cancelled";
/** `open` is a server-side alias: draft · sent · viewed. */
export type QuoteFilterStatus = QuoteStatus | "open";
export type QuoteLineKind = "hourly" | "fixed" | "recurring" | "patrol" | "dispatch" | "oneTime";
export type QuoteLanguage = "en" | "es";
export type QuoteEventType = "created" | "edited" | "revised" | "sent" | "viewed" | "accepted" | "rejected" | "expired" | "cancelled" | "converted";

export const QUOTE_STATUSES: QuoteStatus[] = ["draft", "sent", "viewed", "accepted", "rejected", "expired", "converted", "cancelled"];
export const QUOTE_LINE_KINDS: QuoteLineKind[] = ["hourly", "fixed", "recurring", "patrol", "dispatch", "oneTime"];
/** Statuses a quote can still be edited in (editing a sent one starts a new revision). */
export const QUOTE_EDITABLE: QuoteStatus[] = ["draft", "sent", "viewed", "rejected", "expired"];

export interface QuoteProspect {
  company: string | null;
  contactName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  /** Two letters (US state). */
  state: string | null;
  postalCode: string | null;
  country: string | null;
}

export interface QuoteLine {
  id?: string;
  position?: number;
  kind: QuoteLineKind;
  description: string;
  siteLabel?: string | null;
  /** Hourly lines only; the server stores `any` for the rest. */
  shiftType?: ShiftType;
  /** Hourly: hours per WEEK; oneTime: quantity; others: units per MONTH — all in hundredths. */
  quantityHundredths: number;
  unitCents: number;
  monthlyCents?: number;
  oneTimeCents?: number;
  taxable?: boolean;
}

export interface QuoteEvent {
  id: string;
  type: QuoteEventType | string;
  actorType: "user" | "client" | "system";
  actorId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

export interface Quote {
  id: string;
  number: string;
  revision: number;
  title: string;
  status: QuoteStatus;
  clientAccountId: string | null;
  prospect: QuoteProspect | null;
  currency: string;
  language: QuoteLanguage;
  validUntil: string | null;
  startDate: string | null;
  billingCycle: BillingCycle;
  paymentTermsDays: number;
  intro: string | null;
  terms: string | null;
  monthlySubtotalCents: number;
  oneTimeCents: number;
  taxCents: number;
  monthlyTotalCents: number;
  taxBreakdown: TaxBreakdownRow[] | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  signerName: string | null;
  signerTitle: string | null;
  signerEmail: string | null;
  /** PNG data URL of the drawn signature. */
  signature: string | null;
  /** SHA-256 of exactly what was signed. */
  contentHash: string | null;
  contractId: string | null;
  setupInvoiceId: string | null;
  convertedAt: string | null;
  lines?: QuoteLine[];
  events?: QuoteEvent[];
  clientAccount?: (ClientAccountRef & { state?: string | null; zipCode?: string | null; taxExempt?: boolean | null }) | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuotePipeline {
  byStatus: Partial<Record<QuoteStatus, { count: number; monthlyCents: number }>>;
  /** 0-100, or null while nothing has been won or lost. */
  winRate: number | null;
  openMonthlyCents: number;
}

export interface QuoteInput {
  prospect?: Partial<QuoteProspect>;
  clientAccountId?: string;
  title?: string;
  language?: QuoteLanguage;
  currency?: string;
  validUntil?: string | null;
  startDate?: string | null;
  billingCycle?: BillingCycle;
  paymentTermsDays?: number;
  intro?: string | null;
  terms?: string | null;
  lines?: Array<Pick<QuoteLine, "kind" | "description" | "siteLabel" | "shiftType" | "quantityHundredths" | "unitCents" | "taxable">>;
}

export interface QuoteDetail { quote: Quote; publicUrl: string | null }

export interface QuoteConversion { quote: Quote; contractId: string; clientAccountId: string; setupInvoiceId: string | null }

/**
 * Monthly and one-time cents of one quote line — the SAME arithmetic as the
 * server (`quoteMath.lineTotals`): hourly = hours/week × rate × 52 / 12,
 * oneTime apart, everything else units/month × price. The server's numbers
 * are the ones that count once the quote is saved.
 */
export function quoteLineTotals(l: Pick<QuoteLine, "kind" | "quantityHundredths" | "unitCents">): { monthlyCents: number; oneTimeCents: number } {
  const q = Math.max(0, Math.round(Number(l.quantityHundredths) || 0));
  const u = Math.max(0, Math.round(Number(l.unitCents) || 0));

  if (l.kind === "oneTime") return { monthlyCents: 0, oneTimeCents: Math.round((q * u) / 100) };
  if (l.kind === "hourly") return { monthlyCents: Math.round((q * u * 52) / (100 * 12)), oneTimeCents: 0 };

  return { monthlyCents: Math.round((q * u) / 100), oneTimeCents: 0 };
}

const normTax = (v: unknown) => String(v ?? "").trim().toUpperCase();

/** The company's tax rates that apply at an address (mirror of the server's `ratesForAddress`). */
export function taxRatesForAddress(rates: TaxRate[], address: { state?: string | null; postalCode?: string | null } | null): TaxRate[] {
  const state = normTax(address?.state);
  const postal = normTax(address?.postalCode);

  return rates.filter((r) => {
    if (r.active === false || !(r.rateBps > 0)) return false;
    if (r.jurisdiction === "custom") return true;
    if (r.jurisdiction === "postal") return !!r.postalCodePrefix && !!postal && postal.startsWith(normTax(r.postalCodePrefix)) && (!r.state || normTax(r.state) === state);

    return !!r.state && normTax(r.state) === state;
  });
}

/** Totals of a quote as the server computes them: the tax is the MONTHLY estimate at the prospect's address. */
export function quoteTotalsPreview(
  lines: Array<Pick<QuoteLine, "kind" | "quantityHundredths" | "unitCents" | "taxable">>,
  rates: TaxRate[],
  address: { state?: string | null; postalCode?: string | null } | null,
  taxExempt = false,
): { monthlySubtotalCents: number; oneTimeCents: number; taxCents: number; monthlyTotalCents: number; taxBreakdown: TaxBreakdownRow[] } {
  let monthly = 0;
  let oneTime = 0;
  let taxableBase = 0;

  for (const l of lines) {
    const t = quoteLineTotals(l);

    monthly += t.monthlyCents;
    oneTime += t.oneTimeCents;
    if (l.taxable !== false && t.monthlyCents > 0) taxableBase += t.monthlyCents;
  }
  const taxBreakdown: TaxBreakdownRow[] = taxExempt || !taxableBase
    ? []
    : taxRatesForAddress(rates, address).map((r) => ({ name: r.name, rateBps: r.rateBps, baseCents: taxableBase, taxCents: Math.round((taxableBase * r.rateBps) / 10_000) }));
  const taxCents = taxBreakdown.reduce((s, b) => s + b.taxCents, 0);

  return { monthlySubtotalCents: monthly, oneTimeCents: oneTime, taxCents, monthlyTotalCents: monthly + taxCents, taxBreakdown };
}

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

  /**
   * A sample invoice or proposal (fictitious client) drawn with the company's
   * real header and the settings still being edited. Nothing is saved.
   */
  async previewDocument(kind: "invoice" | "quote", unsaved: Partial<BillingSettings>, lang: "es" | "en", signal?: AbortSignal): Promise<Blob> {
    const resp = await api.post(`${base()}/settings/preview/${kind}?lang=${lang}`, { data: unsaved }, { responseType: "blob", signal, toast: { silentError: true } } as never);
    const data = (resp as { data?: Blob })?.data ?? (resp as unknown as Blob);

    return data instanceof Blob ? new Blob([data], { type: "application/pdf" }) : new Blob([data as BlobPart], { type: "application/pdf" });
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
  async sendInvoice(id: string, body: { to?: string[]; message?: string; lang?: string; paymentMethods?: string[] | null } = {}): Promise<{ invoice: Invoice; sent: boolean; to: string[]; reason?: string | null }> {
    return unwrap(await api.post(`${base()}/invoices/${enc(id)}/send`, { data: body }));
  },

  async downloadPdf(inv: Pick<Invoice, "id" | "number">, lang?: string): Promise<void> {
    await descargarInforme(`${base()}/invoices/${enc(inv.id)}/pdf?download=1${lang ? `&lang=${enc(lang)}` : ""}`, {
      format: "pdf",
      nombreBase: inv.number || "borrador",
    });
  },

  /** Which methods this invoice offers (null = the company's). Any status but void. */
  async setInvoicePaymentMethods(id: string, paymentMethods: string[] | null): Promise<{ invoice: Invoice; paymentOptions: OfferedPaymentMethod[] }> {
    return unwrap(await api.put(`${base()}/invoices/${enc(id)}/payment-methods`, { data: { paymentMethods } }));
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

  // ── Quotes to prospects ───────────────────────────────────────────────────
  async quotes(filter: { status?: QuoteFilterStatus; q?: string } = {}): Promise<{ quotes: Quote[]; pipeline: QuotePipeline }> {
    return unwrap(await api.get(`${base()}/quotes${qs(filter)}`));
  },

  async createQuote(body: QuoteInput): Promise<QuoteDetail> {
    return unwrap(await api.post(`${base()}/quotes`, { data: body }));
  },

  async quote(id: string): Promise<QuoteDetail> {
    return unwrap(await api.get(`${base()}/quotes/${enc(id)}`));
  },

  /** Editing a quote already sent starts a new revision with a new link (the old one dies). */
  async updateQuote(id: string, body: QuoteInput): Promise<QuoteDetail> {
    return unwrap(await api.put(`${base()}/quotes/${enc(id)}`, { data: body }));
  },

  /** E-mails the PDF and the signing link. */
  async sendQuote(id: string, body: { to?: string[]; message?: string } = {}): Promise<{ quote: Quote; sent: boolean; to: string[]; reason?: string | null; publicUrl: string | null }> {
    return unwrap(await api.post(`${base()}/quotes/${enc(id)}/send`, { data: body }));
  },

  /** Sent without e-mail: the company shares the link itself. */
  async markQuoteSent(id: string): Promise<QuoteDetail> {
    return unwrap(await api.post(`${base()}/quotes/${enc(id)}/mark-sent`, { data: {} }));
  },

  async downloadQuotePdf(q: Pick<Quote, "id" | "number" | "revision">): Promise<void> {
    await descargarInforme(`${base()}/quotes/${enc(q.id)}/pdf?download=1`, {
      format: "pdf",
      nombreBase: q.revision > 1 ? `${q.number}-r${q.revision}` : q.number,
    });
  },

  async duplicateQuote(id: string): Promise<{ quote: Quote }> {
    return unwrap(await api.post(`${base()}/quotes/${enc(id)}/duplicate`, { data: {} }));
  },

  async cancelQuote(id: string): Promise<{ quote: Quote }> {
    return unwrap(await api.post(`${base()}/quotes/${enc(id)}/cancel`, { data: {} }));
  },

  /** Accepted quote → client (when a prospect) + draft contract + draft invoice for the one-time items. */
  async convertQuote(id: string): Promise<QuoteConversion> {
    return unwrap(await api.post(`${base()}/quotes/${enc(id)}/convert`, { data: {} }));
  },
};

export default clientBillingService;
