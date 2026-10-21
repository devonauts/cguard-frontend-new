import i18n from "@/i18n";
/**
 * ROLES DE PAGO (módulo `payroll_slips`) — ajustes, catálogo de conceptos,
 * perfiles de pago y puesta en marcha. Las corridas y los roles llegan en la
 * siguiente entrega del módulo. Ver `backend/api/payrollSlips`.
 */
import api from "../api";

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

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export type DoubleShiftMode = "overtime" | "normal_plus_advance" | "double" | "bonus";
export type ConceptKind = "earning" | "deduction" | "employer" | "info";
export type ConceptMethod = "fixed" | "percent" | "hours" | "days" | "table" | "manual";
export type ConceptBase = "base_salary" | "gross" | "ss_base" | "tax_base" | "legal_minimum" | "net";
export type HoursOf = "ordinary" | "overtime1" | "overtime2" | "night" | "holiday" | "rest_day" | "sunday" | "double_shift";
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

const base = () => `/tenant/${getTenantId()}/payroll/slips`;

const payrollSlipsService = {
  async setup(): Promise<SetupStatus> {
    return unwrap(await api.get(`${base()}/setup`));
  },

  async settings(): Promise<SlipSettingsView> {
    return unwrap(await api.get(`${base()}/settings`));
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
    return unwrap(await api.get(`${base()}/concepts${all ? "?all=1" : ""}`));
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

    return unwrap(await api.get(`${base()}/profiles${qs ? `?${qs}` : ""}`));
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
};

export default payrollSlipsService;
