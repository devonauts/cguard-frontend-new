import i18n from "@/i18n";
/**
 * ROLES DE PAGO (módulo `payroll_slips`) — ajustes, catálogo de conceptos,
 * perfiles de pago y puesta en marcha. Las corridas y los roles llegan en la
 * siguiente entrega del módulo. Ver `backend/api/payrollSlips`.
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

// The screens turn a 403 into a no-access notice (roles/comun usePayrollAccess):
// one «Prohibido» toast per request on top of it was noise (QA 2026-11-01).
const sin403 = { toast: { silentStatuses: [403] } };

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type DoubleShiftMode = "overtime" | "normal_plus_advance" | "double" | "bonus";
export type ConceptKind = "earning" | "deduction" | "employer" | "info";
export type ConceptMethod = "fixed" | "percent" | "hours" | "days" | "table" | "manual";
export type ConceptBase = "base_salary" | "gross" | "ss_base" | "tax_base" | "legal_minimum" | "net";
export type HoursOf = "ordinary" | "overtime1" | "overtime2" | "night" | "holiday" | "rest_day" | "sunday" | "double_shift" | "night_overtime" | "saturday";
export type Population = "vigilante" | "supervisor" | "oficina";

export interface TaxBracket { upTo: number | null; pct: number; fixed: number }

export interface IncomeTaxSettings {
  kind: "none" | "flat" | "table" | "manual";
  period?: "annual" | "monthly";
  base?: "gross" | "gross_minus_ss";
  allowance?: number;
  credit?: number;
  flatPct?: number;
  table?: TaxBracket[];
  note: string;
}

export interface SlipSettings {
  setupDone: boolean;
  countryCode: string;
  currency: string;
  decimals: 0 | 2;
  frequency: PayFrequency;
  hourDivisor: number;
  weeklyHours: number;
  dailyHours: number;
  nightShiftHours: number;
  globalBaseSalaryCents: number;
  legalMinimumCents: number;
  weeklyOvertimeThreshold: number;
  exemptMaxDailyHours: number;
  maxShiftHours: number;
  doubleShift: { mode: DoubleShiftMode; bonusPct: number; bonusCents: number; listSeparately: boolean };
  /** Timecard hours the slips pay only when the company turns them on. */
  cardHours?: { restDay: boolean; nightOvertime: boolean };
  incomeTax: IncomeTaxSettings;
  document: {
    prefix: string;
    nextNumber: number;
    padding: number;
    official: boolean;
    language: string;
    footer: string;
    showEmployerCost: boolean;
    showProvisions: boolean;
    showNetInWords: boolean;
  };
}

export interface CountryTemplateView {
  code: string;
  currency: string;
  decimals: 0 | 2;
  hourDivisor: number | "actual";
  weeklyHours: number;
  dailyHours: number;
  nightShiftHours: number;
  night: { from: string; to: string; pct: number } | null;
  holidayPct: number;
  restDayPct: number;
  legalMinimumCents: number | null;
  minimumNote: string;
  officialCatalog: string | null;
  documentName: Record<string, string>;
  incomeTax: IncomeTaxSettings;
  contractor: { regimes: Array<{ code: string; name: Record<string, string>; withholdingPct: number; issuesInvoice: boolean; note?: string }> };
  notes: string[];
  verifiedAt: string;
  exemptMaxDailyHours: number | null;
  maxShiftHours: number | null;
}

export interface SlipSettingsView {
  settings: SlipSettings;
  detectedCountry: string;
  template: CountryTemplateView;
  countries: string[];
  missing: string[];
}

export interface PayrollConcept {
  id: string;
  code: string;
  officialCode: string | null;
  name: Record<string, string>;
  kind: ConceptKind;
  method: ConceptMethod;
  rate: number | string | null;
  base: ConceptBase | null;
  hoursOf: HoursOf | null;
  table: TaxBracket[] | null;
  affectsSocialSecurity: boolean;
  affectsIncomeTax: boolean;
  recurring: boolean;
  active: boolean;
  source: "country" | "tenant";
  sortOrder: number;
  note: string | null;
  /** What the country template suggests for this code (only a hint; null = none). */
  suggestedRate?: number | null;
}

export interface ConceptSeed extends Omit<PayrollConcept, "id" | "active" | "source" | "sortOrder" | "table" | "rate"> {
  rate?: number | null;
  defaultOff?: boolean;
  monthlyOption?: boolean;
}

export interface PayrollProfile {
  id?: string;
  employmentType: "employee" | "contractor";
  payBasis: "monthly" | "hourly";
  baseSalaryCents: number | null;
  currency: string | null;
  weeklyHours: number | null;
  hourDivisor: number | null;
  employeeNumber: string | null;
  jobTitle: string | null;
  hiredAt: string | null;
  socialSecurityNumber: string | null;
  pensionScheme: string | null;
  pensionProvider: string | null;
  healthProvider: string | null;
  dependents: number;
  taxMode: "inherit" | "none" | "flat" | "table";
  taxFlatPct: number | null;
  exemptFromSchedule: boolean;
  contractorRegime: string | null;
  contractorWithholdingPct: number | null;
  contractorIssuesInvoice: boolean;
  bankName: string | null;
  bankAccount: string | null;
  fixedConcepts: Array<{ code: string; amountCents: number | null; rate: number | null }> | null;
  overrides: Record<string, number> | null;
  notes: string | null;
}

export interface PersonWithProfile {
  userId: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  population: Population;
  departmentId: string | null;
  branchId: string | null;
  legacy: { hourlyRateCents: number | null; monthlyRateCents: number | null; horasMesDivisor: number | null };
  profile: PayrollProfile | null;
  effective: {
    employmentType: "employee" | "contractor";
    payBasis: "monthly" | "hourly";
    baseSalaryCents: number;
    inheritsSalary: boolean;
    currency: string;
    weeklyHours: number;
    hourDivisor: number;
    hasSalary: boolean;
  };
}

export interface SetupStatus {
  setupDone: boolean;
  countryCode: string;
  currency: string;
  frequency: PayFrequency;
  hasGlobalSalary: boolean;
  concepts: number;
  people: number;
  peopleWithoutSalary: number;
  byPopulation: Record<Population, number>;
  ready: boolean;
}


export type RunStatus = "generating" | "review" | "published" | "voided" | "error";
export type SlipStatus = "draft" | "published" | "voided";
export type AdjustmentKind = "bonus" | "fine" | "advance" | "deduction" | "refund" | "custom" | "loan_installment";

export interface SlipLine {
  code: string;
  officialCode: string | null;
  kind: ConceptKind;
  name: string;
  qty: number | null;
  rate: number | null;
  amountCents: number;
  base?: string | null;
  flags: { ss: boolean; tax: boolean };
  source: "recurring" | "hours" | "adjustment" | "loan" | "tax" | "manual" | "fixed" | "contractor";
  adjustmentId?: string | null;
  loanId?: string | null;
  note?: string | null;
}

export interface SlipAlert { code: string; message: string; severity: "info" | "warn" | "bad" }

export interface PayrollRun {
  id: string;
  number: string;
  periodFrom: string;
  periodTo: string;
  frequency: PayFrequency;
  /** branchIds: planilla de esas sucursales (null = de toda la empresa). */
  /** brandIds (Multimarca): the one brand whose registered people this run pays. */
  population: { roles: Population[]; userIds: string[] | null; branchIds?: string[] | null; brandIds?: string[] | null } | null;
  /** Multimarca: the brand of the run (also in `population.brandIds`). */
  brandId?: string | null;
  currency: string;
  status: RunStatus;
  countryCode: string | null;
  totals: { gross?: number; deductions?: number; net?: number; employer?: number; people?: number; alerts?: number; withoutTimecard?: number; jobId?: string; error?: string; computedAt?: string } | null;
  settingsSnapshot?: SlipSettings | null;
  generatedAt: string | null;
  publishedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface PayrollSlipRow {
  id: string;
  runId: string;
  userId: string;
  number: string | null;
  timecardId: string | null;
  employmentType: "employee" | "contractor";
  profileSnapshot: { name: string; population: Population; jobTitle: string | null; employeeNumber: string | null; payBasis: string; baseSalaryCents: number } & Record<string, unknown>;
  lines?: SlipLine[];
  /** En la planilla: el importe de cada concepto del rol (sin las líneas enteras). */
  byConcept?: Array<{ code: string; name: string; kind: ConceptKind; amountCents: number }>;
  grossCents: number | string;
  deductionsCents: number | string;
  netCents: number | string;
  employerCostCents: number | string;
  bases: { hourlyRateCents: number; baseSalaryCents: number; ssBaseCents: number; taxBaseCents: number; paidDays: number; hours: Record<HoursOf, number>;
    /** Dobladas del periodo: días, tripletas, turnos extra que suman y la jornada contra la que se midieron. */
    doubleShifts?: { days: number; tripleDays: number; extraShifts: number; hours: number; shiftHours: number };
    manualLines?: Array<{ code: string; amountCents: number; name?: string; kind?: ConceptKind; note?: string | null }> } | null;
  alerts: SlipAlert[] | null;
  status: SlipStatus;
  hash: string | null;
  publishedAt: string | null;
  viewedAt: string | null;
  run?: Pick<PayrollRun, "id" | "number" | "periodFrom" | "periodTo" | "currency" | "frequency">;
}

export interface PayrollAdjustment {
  id: string;
  userId: string;
  conceptId: string | null;
  kind: AdjustmentKind;
  amountCents: number | string;
  quantity: number | string | null;
  periodFrom: string | null;
  periodTo: string | null;
  loanId: string | null;
  runId: string | null;
  note: string | null;
  createdAt: string;
  persona?: { id: string; fullName?: string; firstName?: string; lastName?: string } | null;
  concept?: { id: string; code: string; name: Record<string, string>; kind: ConceptKind } | null;
}

export interface PayrollLoan {
  id: string;
  userId: string;
  principalCents: number | string;
  installments: number;
  installmentCents: number | string;
  paidInstallments: number;
  balanceCents: number | string;
  startsOn: string;
  status: "active" | "paused" | "settled" | "cancelled";
  note: string | null;
  persona?: { id: string; fullName?: string; firstName?: string; lastName?: string } | null;
}

const base = () => `/tenant/${getTenantId()}/payroll/slips`;

const payrollSlipsService = {
  async setup(): Promise<SetupStatus> {
    return unwrap(await api.get(`${base()}/setup`, sin403));
  },

  async settings(): Promise<SlipSettingsView> {
    return unwrap(await api.get(`${base()}/settings`, sin403));
  },

  async saveSettings(parcial: Partial<SlipSettings>): Promise<{ settings: SlipSettings }> {
    return unwrap(await api.put(`${base()}/settings`, { data: parcial }));
  },

  async applyCountry(countryCode: string, seed = true): Promise<{ settings: SlipSettings; seeded: { added: number; total: number } }> {
    return unwrap(await api.post(`${base()}/settings/apply-country`, { data: { countryCode, seed } }));
  },

  async template(countryCode: string): Promise<{ template: CountryTemplateView; concepts: ConceptSeed[]; countries: string[] }> {
    return unwrap(await api.get(`${base()}/templates/${encodeURIComponent(countryCode)}`));
  },

  async concepts(all = true): Promise<{ rows: PayrollConcept[]; count: number }> {
    return unwrap(await api.get(`${base()}/concepts${all ? "?all=1" : ""}`, sin403));
  },

  async createConcept(c: Partial<PayrollConcept>): Promise<PayrollConcept> {
    return unwrap(await api.post(`${base()}/concepts`, { data: c }));
  },

  async updateConcept(id: string, c: Partial<PayrollConcept>): Promise<PayrollConcept> {
    return unwrap(await api.put(`${base()}/concepts/${encodeURIComponent(id)}`, { data: c }));
  },

  async deleteConcept(id: string): Promise<{ deleted?: boolean; deactivated?: boolean }> {
    return unwrap(await api.delete(`${base()}/concepts/${encodeURIComponent(id)}`));
  },

  async seedConcepts(countryCode?: string): Promise<{ added: number; total: number }> {
    return unwrap(await api.post(`${base()}/concepts/seed`, { data: { countryCode } }));
  },

  async reorderConcepts(ids: string[]): Promise<{ ok: boolean }> {
    return unwrap(await api.put(`${base()}/concepts/reorder`, { data: { ids } }));
  },

  async people(filtro: { population?: Population; missing?: boolean } = {}): Promise<{ rows: PersonWithProfile[]; count: number }> {
    const q = new URLSearchParams();

    if (filtro.population) q.set("population", filtro.population);
    if (filtro.missing) q.set("missing", "1");
    const qs = q.toString();

    return unwrap(await api.get(`${base()}/profiles${qs ? `?${qs}` : ""}`, sin403));
  },

  async profile(userId: string): Promise<PersonWithProfile | null> {
    return unwrap(await api.get(`${base()}/profiles/${encodeURIComponent(userId)}`));
  },

  async saveProfile(userId: string, p: Partial<PayrollProfile>): Promise<PersonWithProfile> {
    return unwrap(await api.put(`${base()}/profiles/${encodeURIComponent(userId)}`, { data: p }));
  },

  async saveProfiles(rows: Array<Partial<PayrollProfile> & { userId: string }>): Promise<{ saved: number; errors: Array<{ userId: string; message: string }> }> {
    return unwrap(await api.put(`${base()}/profiles/bulk`, { data: { rows } }));
  },

  // ── Novedades y préstamos ─────────────────────────────────────────────────
  async adjustments(filtro: { userId?: string; pending?: boolean; runId?: string } = {}): Promise<{ rows: PayrollAdjustment[]; count: number }> {
    const q = new URLSearchParams();

    if (filtro.userId) q.set("userId", filtro.userId);
    if (filtro.pending) q.set("pending", "1");
    if (filtro.runId) q.set("runId", filtro.runId);
    const qs = q.toString();

    return unwrap(await api.get(`${base()}/adjustments${qs ? `?${qs}` : ""}`, sin403));
  },

  async createAdjustment(a: Partial<PayrollAdjustment>): Promise<PayrollAdjustment> {
    return unwrap(await api.post(`${base()}/adjustments`, { data: a }));
  },

  async updateAdjustment(id: string, a: Partial<PayrollAdjustment>): Promise<PayrollAdjustment> {
    return unwrap(await api.put(`${base()}/adjustments/${encodeURIComponent(id)}`, { data: a }));
  },

  async deleteAdjustment(id: string): Promise<{ deleted: boolean }> {
    return unwrap(await api.delete(`${base()}/adjustments/${encodeURIComponent(id)}`));
  },

  async loans(filtro: { userId?: string; status?: string } = {}): Promise<{ rows: PayrollLoan[]; count: number }> {
    const q = new URLSearchParams();

    if (filtro.userId) q.set("userId", filtro.userId);
    if (filtro.status) q.set("status", filtro.status);
    const qs = q.toString();

    return unwrap(await api.get(`${base()}/loans${qs ? `?${qs}` : ""}`, sin403));
  },

  async createLoan(l: Partial<PayrollLoan>): Promise<PayrollLoan> {
    return unwrap(await api.post(`${base()}/loans`, { data: l }));
  },

  async updateLoan(id: string, l: Partial<PayrollLoan>): Promise<PayrollLoan> {
    return unwrap(await api.put(`${base()}/loans/${encodeURIComponent(id)}`, { data: l }));
  },

  // ── Corridas y roles ──────────────────────────────────────────────────────
  async runs(): Promise<{ rows: PayrollRun[]; count: number }> {
    return unwrap(await api.get(`${base()}/runs`, sin403));
  },

  async createRun(body: { from: string; to?: string; populations?: Population[]; userIds?: string[]; branchIds?: string[]; brandId?: string }): Promise<PayrollRun> {
    return unwrap(await api.post(`${base()}/runs`, { data: body }));
  },

  async run(id: string): Promise<{ run: PayrollRun; slips: PayrollSlipRow[]; unapprovedTimecards?: number; listoParaCalcular?: boolean }> {
    return unwrap(await api.get(`${base()}/runs/${encodeURIComponent(id)}`, sin403));
  },

  async recompute(id: string): Promise<{ run: PayrollRun; slips: PayrollSlipRow[] }> {
    return unwrap(await api.post(`${base()}/runs/${encodeURIComponent(id)}/recompute`, { data: {} }));
  },

  async publish(id: string): Promise<{ run: PayrollRun; slips: PayrollSlipRow[] }> {
    return unwrap(await api.post(`${base()}/runs/${encodeURIComponent(id)}/publish`, { data: {} }));
  },

  async void(id: string, reason: string): Promise<PayrollRun> {
    return unwrap(await api.post(`${base()}/runs/${encodeURIComponent(id)}/void`, { data: { reason } }));
  },

  async downloadSheet(run: PayrollRun, format: "pdf" | "xlsx"): Promise<void> {
    await descargarInforme(`${base()}/runs/${encodeURIComponent(run.id)}/download?format=${format}`, { format: format === "pdf" ? "pdf" : "excel", nombreBase: `${run.number}_${run.periodFrom}_${run.periodTo}` });
  },

  async slip(id: string): Promise<{ slip: PayrollSlipRow; run: PayrollRun | null }> {
    return unwrap(await api.get(`${base()}/slips/${encodeURIComponent(id)}`, sin403));
  },

  async slipsOf(userId: string, all = false): Promise<{ rows: PayrollSlipRow[]; count: number }> {
    return unwrap(await api.get(`${base()}/slips?userId=${encodeURIComponent(userId)}${all ? "&all=1" : ""}`));
  },

  async setLine(slipId: string, line: { code: string; amountCents?: number; name?: string; kind?: ConceptKind; note?: string | null; remove?: boolean }): Promise<{ slip: PayrollSlipRow; run: PayrollRun | null }> {
    return unwrap(await api.put(`${base()}/slips/${encodeURIComponent(slipId)}/line`, { data: line }));
  },

  async downloadSlip(slip: PayrollSlipRow): Promise<void> {
    await descargarInforme(`${base()}/slips/${encodeURIComponent(slip.id)}/download`, { format: "pdf", nombreBase: `${slip.number || "borrador"}_${slip.profileSnapshot?.name || ""}` });
  },
};

export default payrollSlipsService;
