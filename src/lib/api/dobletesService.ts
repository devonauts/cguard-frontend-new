import api from "../api";

import i18n from "@/i18n";
import { modoDemoDeDobletes } from "@/lib/dobletesDemo";

/**
 * DOBLETES (paid module `dobletes`) — every call the CRM makes for it lives
 * here, so aligning with the backend (`docs/dobletes/01-backend.md`) is a
 * local change. Routes follow `docs/dobletes/00-contrato.md`:
 *
 *   /tenant/:t/dobletes/searches            live offer searches (one per gap)
 *   /tenant/:t/dobletes/settings            waves, bonuses, levels, ranking…
 *   /tenant/:t/dobletes/bench               reserve, availability, suplentes
 *   /tenant/:t/dobletes/ranking?month=      monthly ranking + respaldo del mes
 *   /tenant/:t/dobletes/campaigns           banners for the guard app
 *   /tenant/:t/performance/settings         backup points (existing table)
 *
 * Without the module the office routes answer 402 `addon_required`.
 *
 * In development only, `localStorage["dobletes:demo"] = "1"` answers from an
 * in-memory fake (`dobletesDemo.ts`) so the screens can be seen before the
 * backend lands. A production build never ships that file.
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

const base = () => `/tenant/${tenantId()}/dobletes`;
const unwrap = <T>(r: unknown): T => {
  const d = (r as { data?: unknown })?.data ?? r;

  return ((d as { data?: T })?.data ?? d) as T;
};
/** Background reads: a 402 (no module) must not pop a toast on every poll. */

const SILENT = { toast: { silentError: true } } as any;

/* ── Types ──────────────────────────────────────────────────────────────── */

export type SearchStatus = "active" | "filled" | "exhausted" | "cancelled";
export type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "lost"
  | "withdrawn"
  | "failed";
export type OfferChannel = "app" | "whatsapp" | "voice";
export type SearchSource =
  "office" | "despachador" | "supervisor_app" | "vigia_chat";
export type Slot = "D" | "T" | "N";
export type ReserveLevel = "bronce" | "plata" | "oro";

export interface StationRef {
  id: string;
  stationName?: string | null;
  nickname?: string | null;
}

export interface ShiftOffer {
  id: string;
  guardUserId: string;
  guardName: string | null;
  channel: OfferChannel;
  status: OfferStatus;
  wave: number;
  bonusCents: number | null;
  expiresAt: string | null;
  respondedAt: string | null;
  resultShiftId?: string | null;
  failureCode?: string | null;
  level?: ReserveLevel | null;
}

export interface OfferSearch {
  id: string;
  coverageEventId: string;
  status: SearchStatus;
  source: SearchSource;
  startedBy?: { id: string; name: string | null } | null;
  channels: OfferChannel[];
  bonusCents: number | null;
  currency: string;
  urgent: boolean;
  wave: number;
  waveSizes: number[];
  waveMinutes: number;
  nextWaveAt: string | null;
  filledOfferId: string | null;
  createdAt: string;
  updatedAt: string;
  event?: {
    id: string;
    reason?: string | null;
    windowStart: string;
    windowEnd: string;
    station?: StationRef | null;
    absentGuardName?: string | null;
  } | null;
  offers?: ShiftOffer[];
}

export interface Candidate {
  guardId: string;
  fullName: string | null;
  reason?: string | null;
  score?: number;
  /** Hours already worked this week — information only, never a limit. */
  hoursThisWeek?: number | null;
  inReserve?: boolean;
  available?: boolean;
  level?: ReserveLevel | null;
}

export interface LevelRules {
  /** Dobletes covered in the month to reach each level (bronce = in the reserve). */
  plata: number;
  oro: number;
}

export interface DobletesSettings {
  waveSizes: number[];
  waveMinutes: number;
  defaultBonusCents: number | null;
  urgentBonusCents: number | null;
  earlyBonusCents: number | null;
  earlyMinutes: number;
  autoLaunchWithVigiaPro: boolean;
  voiceAsLastChannel: boolean;
  levels: { enabled: boolean; rules: LevelRules };
  ranking: boolean;
  reserveOfMonth: boolean;
}

export const DEFAULT_SETTINGS: DobletesSettings = {
  waveSizes: [3, 5],
  waveMinutes: 15,
  defaultBonusCents: null,
  urgentBonusCents: null,
  earlyBonusCents: null,
  earlyMinutes: 5,
  autoLaunchWithVigiaPro: false,
  voiceAsLastChannel: false,
  levels: { enabled: true, rules: { plata: 2, oro: 5 } },
  ranking: true,
  reserveOfMonth: true,
};

export interface SettingsResponse {
  settings: DobletesSettings;
  currency: string;
  decimals?: 0 | 2;
}

export interface ReserveMember {
  userId: string;
  name: string | null;
  active: boolean;
  optedInAt: string | null;
  level: ReserveLevel | null;
  coveredThisMonth: number;
  pointsThisMonth?: number;
  /** Weekly availability: weekday 0 (Sunday) – 6 → slots. */
  weekly: Array<{ weekday: number; slots: Slot[] }>;
  /** Days marked one by one («hoy estoy disponible»). */
  dates?: Array<{ date: string; slots: Slot[] }>;
  stationId?: string | null;
  qualifiedStationIds: string[];
  availabilityUpdatedAt?: string | null;
}

export interface BenchStation {
  stationId: string;
  stationName: string | null;
  nickname: string | null;
  /** Reserve members qualified for this post (its own guards excluded). */
  suplentes: number;
}

export interface Bench {
  members: ReserveMember[];
  /** Members available per weekday (0-6) and slot. */
  grid: Array<{ weekday: number; slot: Slot; count: number }>;
  stations: BenchStation[];
  /** A post with fewer suplentes than this is flagged. */
  healthThreshold: number;
  guardsNotInReserve?: number;
}

export interface RankingRow {
  userId: string;
  name: string | null;
  covered: number;
  points: number;
  offered: number;
  accepted: number;
  avgResponseMinutes: number | null;
  level: ReserveLevel | null;
}

export interface Ranking {
  month: string;
  rows: RankingRow[];
  reserveOfMonth: RankingRow | null;
}

export type CtaAction =
  "join_reserve" | "available_today" | "open_offers" | "qualify_post" | "route";
export type Placement = "dashboard" | "reserve";

export interface CampaignAudience {
  branchIds: string[];
  stationIds: string[];
  notInReserve: boolean;
  staleAvailabilityDays: number | null;
  qualifiedForStationIds: string[];
}

export interface Campaign {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  /** Signed URL to show the image (imageUrl is the storage key). */
  imagePreviewUrl?: string | null;
  ctaLabel: string;
  ctaAction: CtaAction;
  ctaRoute: string | null;
  accent: string | null;
  template: string | null;
  placement: Placement;
  audience: CampaignAudience;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  active: boolean;
  pushOnPublish: boolean;
  reshowAfterDismissDays: number;
  createdAt?: string;
  stats?: CampaignStats;
}

export type CampaignDraft = Omit<Campaign, "id" | "createdAt" | "stats"> & {
  id?: string;
};

export interface CampaignStats {
  shown: number;
  seen: number;
  cta: number;
  converted: number;
  coveredShifts: number;
}

export interface CampaignTemplate {
  key: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaAction: CtaAction;
  accent?: string | null;
  audience?: Partial<CampaignAudience>;
}

export interface PointsSettings {
  volunteerPoints: number | null;
  coverPoints: number | null;
  bonusCap: number | null;
}

export const DEFAULT_POINTS = {
  volunteerPoints: 1,
  coverPoints: 4,
  bonusCap: 12,
};

/** True when an error means «the company does not have the module». */
export function sinModulo(e: unknown): boolean {
  const err = e as {
    status?: number;
    code?: string;
    data?: { code?: string };
  } | null;

  return (
    !!err &&
    (err.status === 402 ||
      err.code === "addon_required" ||
      err.data?.code === "addon_required")
  );
}

/* ── Calls ──────────────────────────────────────────────────────────────── */

const real = {
  async searches(params: { status?: string } = {}): Promise<OfferSearch[]> {
    const q = params.status
      ? `?status=${encodeURIComponent(params.status)}`
      : "";
    const r = unwrap<OfferSearch[] | { rows: OfferSearch[] }>(
      await api.get(`${base()}/searches${q}`, SILENT),
    );

    return Array.isArray(r) ? r : (r?.rows ?? []);
  },
  async search(id: string): Promise<OfferSearch> {
    return unwrap(
      await api.get(`${base()}/searches/${encodeURIComponent(id)}`, SILENT),
    );
  },
  async start(body: {
    eventId: string;
    bonusCents?: number | null;
    urgent?: boolean;
    pickedUserIds?: string[];
  }): Promise<OfferSearch> {
    return unwrap(await api.post(`${base()}/searches`, body));
  },
  async raiseBonus(id: string, bonusCents: number): Promise<OfferSearch> {
    return unwrap(
      await api.post(`${base()}/searches/${encodeURIComponent(id)}/bonus`, {
        bonusCents,
      }),
    );
  },
  async cancel(id: string): Promise<OfferSearch> {
    return unwrap(
      await api.post(`${base()}/searches/${encodeURIComponent(id)}/cancel`, {}),
    );
  },
  /**
   * Ranked people for a gap with hours this week (information only). Falls
   * back to the base-plan suggestions when the module route is not there.
   */
  async candidates(eventId: string): Promise<Candidate[]> {
    try {
      const r = unwrap<Candidate[] | { rows: Candidate[] }>(
        await api.get(
          `${base()}/candidates?eventId=${encodeURIComponent(eventId)}`,
          SILENT,
        ),
      );

      return Array.isArray(r) ? r : (r?.rows ?? []);
    } catch (e) {
      if ((e as { status?: number })?.status !== 404) throw e;
      const r = unwrap<Candidate[]>(
        await api.get(
          `/tenant/${tenantId()}/coverage/candidates?eventId=${encodeURIComponent(eventId)}`,
          SILENT,
        ),
      );

      return Array.isArray(r) ? r : [];
    }
  },
  async settings(): Promise<SettingsResponse> {
    const r = unwrap<Partial<SettingsResponse> & Partial<DobletesSettings>>(
      await api.get(`${base()}/settings`, SILENT),
    );
    const s = (r?.settings ?? r) as Partial<DobletesSettings>;

    return {
      settings: mergeSettings(s),
      currency: String(r?.currency || "USD"),
      decimals: r?.decimals === 0 ? 0 : 2,
    };
  },
  async saveSettings(s: Partial<DobletesSettings>): Promise<SettingsResponse> {
    const r = unwrap<Partial<SettingsResponse> & Partial<DobletesSettings>>(
      await api.put(`${base()}/settings`, { data: s }),
    );
    const out = (r?.settings ?? r) as Partial<DobletesSettings>;

    return {
      settings: mergeSettings(out),
      currency: String(r?.currency || "USD"),
      decimals: r?.decimals === 0 ? 0 : 2,
    };
  },
  async bench(): Promise<Bench> {
    return unwrap(await api.get(`${base()}/bench`, SILENT));
  },
  async ranking(month: string): Promise<Ranking> {
    return unwrap(
      await api.get(
        `${base()}/ranking?month=${encodeURIComponent(month)}`,
        SILENT,
      ),
    );
  },
  async campaigns(): Promise<Campaign[]> {
    const r = unwrap<Campaign[] | { rows: Campaign[] }>(
      await api.get(`${base()}/campaigns`, SILENT),
    );

    return Array.isArray(r) ? r : (r?.rows ?? []);
  },
  async templates(): Promise<CampaignTemplate[]> {
    const r = unwrap<CampaignTemplate[] | { rows: CampaignTemplate[] }>(
      await api.get(`${base()}/campaigns/templates`, SILENT),
    );

    return Array.isArray(r) ? r : (r?.rows ?? []);
  },
  async saveCampaign(c: CampaignDraft): Promise<Campaign> {
    return c.id
      ? unwrap(
          await api.put(`${base()}/campaigns/${encodeURIComponent(c.id)}`, {
            data: c,
          }),
        )
      : unwrap(await api.post(`${base()}/campaigns`, { data: c }));
  },
  async deleteCampaign(id: string): Promise<void> {
    await api.delete(`${base()}/campaigns/${encodeURIComponent(id)}`);
  },
  async campaignStats(id: string): Promise<CampaignStats> {
    return unwrap(
      await api.get(
        `${base()}/campaigns/${encodeURIComponent(id)}/stats`,
        SILENT,
      ),
    );
  },
  async uploadImage(
    file: File,
  ): Promise<{ imageUrl: string; previewUrl: string | null }> {
    const form = new FormData();

    form.append("file", file);

    return unwrap(
      await api.post(`${base()}/campaigns/image`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60_000,
      }),
    );
  },
  async points(): Promise<PointsSettings> {
    const r = unwrap<{ settings?: Partial<PointsSettings> }>(
      await api.get(`/tenant/${tenantId()}/performance/settings`, SILENT),
    );
    const s = r?.settings ?? {};

    return {
      volunteerPoints: s.volunteerPoints ?? null,
      coverPoints: s.coverPoints ?? null,
      bonusCap: s.bonusCap ?? null,
    };
  },
  /** Partial PUT: only these three fields are written. */
  async savePoints(p: PointsSettings): Promise<PointsSettings> {
    const r = unwrap<{ settings?: Partial<PointsSettings> }>(
      await api.put(`/tenant/${tenantId()}/performance/settings`, { data: p }),
    );
    const s = r?.settings ?? {};

    return {
      volunteerPoints: s.volunteerPoints ?? null,
      coverPoints: s.coverPoints ?? null,
      bonusCap: s.bonusCap ?? null,
    };
  },
};

export type DobletesApi = typeof real;

export function mergeSettings(
  s: Partial<DobletesSettings> | null | undefined,
): DobletesSettings {
  const v = s || {};

  return {
    ...DEFAULT_SETTINGS,
    ...v,
    waveSizes:
      Array.isArray(v.waveSizes) && v.waveSizes.length
        ? v.waveSizes
        : DEFAULT_SETTINGS.waveSizes,
    levels: {
      enabled: v.levels?.enabled ?? DEFAULT_SETTINGS.levels.enabled,
      rules: { ...DEFAULT_SETTINGS.levels.rules, ...(v.levels?.rules || {}) },
    },
  };
}

/* In development the demo fake can stand in for the server; the dynamic
   import sits behind `import.meta.env.DEV`, so production drops it. */
let demo: Promise<DobletesApi> | null = null;
const api_ = (): Promise<DobletesApi> => {
  if (import.meta.env.DEV && modoDemoDeDobletes()) {
    demo ??= import("./dobletesDemoApi").then((m) => m.crearApiDeDemo());

    return demo;
  }

  return Promise.resolve(real);
};

type Async<F> = F extends (...a: infer A) => Promise<infer R>
  ? (...a: A) => Promise<R>
  : never;
const via = <K extends keyof DobletesApi>(k: K): Async<DobletesApi[K]> =>
  (async (...args: unknown[]) => {
    const impl = await api_();

    return (impl[k] as (...a: unknown[]) => Promise<unknown>)(...args);
  }) as Async<DobletesApi[K]>;

export const dobletesService = {
  searches: via("searches"),
  search: via("search"),
  start: via("start"),
  raiseBonus: via("raiseBonus"),
  cancel: via("cancel"),
  candidates: via("candidates"),
  settings: via("settings"),
  saveSettings: via("saveSettings"),
  bench: via("bench"),
  ranking: via("ranking"),
  campaigns: via("campaigns"),
  templates: via("templates"),
  saveCampaign: via("saveCampaign"),
  deleteCampaign: via("deleteCampaign"),
  campaignStats: via("campaignStats"),
  uploadImage: via("uploadImage"),
  points: via("points"),
  savePoints: via("savePoints"),
};

export default dobletesService;
