import api from "../api";

import i18n from "@/i18n";
import { modoDemoDeDobletes } from "@/lib/dobletesDemo";

/**
 * DOBLETES (paid module `dobletes`) — every call the CRM makes for it lives
 * here. Routes and shapes follow the backend reference
 * (`backend/docs/dobletes/01-backend.md`, branch feat/dobletes-modulo):
 *
 *   /tenant/:t/dobletes/searches            offer searches (one live per gap)
 *   /tenant/:t/dobletes/candidates?eventId  ranked people, hours this week
 *   /tenant/:t/dobletes/settings            waves, bonuses, levels, ranking…
 *   /tenant/:t/dobletes/bench               reserve, availability, relief per post
 *   /tenant/:t/dobletes/reserve/:userId     office edits a member
 *   /tenant/:t/dobletes/ranking?month=      monthly ranking + respaldo del mes
 *   /tenant/:t/dobletes/campaigns           banners for the guard app
 *   /tenant/:t/performance/settings         backup points (existing table)
 *
 * The server's shapes are normalised here into the types below, so the screens
 * do not care about field names. Without the module the office routes answer
 * 402 `addon_required`; rule errors come back with a translated `message`,
 * which the API layer shows.
 *
 * In development only, `localStorage["dobletes:demo"] = "1"` answers from an
 * in-memory fake (`dobletesDemoApi.ts`). A production build never ships it.
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
const filas = <T>(r: unknown): T[] => {
  const d = unwrap<T[] | { rows?: T[] }>(r);

  return Array.isArray(d) ? d : (d?.rows ?? []);
};
/** Background reads: a 402 (no module) must not pop a toast on every poll. */
const SILENT = { toast: { silentError: true } } as any;
const enc = encodeURIComponent;

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
  seenAt?: string | null;
  resultShiftId?: string | null;
  failureCode?: string | null;
  /** Why the server ranked them: reserve_available, level_oro, picked… */
  reasons?: string[];
  level?: ReserveLevel | null;
}

export type OfferCounts = Record<OfferStatus, number>;

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
  closedReason?: string | null;
  createdAt: string;
  /** When it was filled or closed (time to fill = this − createdAt). */
  updatedAt: string;
  event?: {
    id: string;
    reason?: string | null;
    windowStart: string;
    windowEnd: string;
    station?: StationRef | null;
    absentGuardName?: string | null;
    /** 'vacancy': an empty seat, nobody absent. */
    kind?: string | null;
  } | null;
  counts?: Partial<OfferCounts>;
  /** Only in the detail (`GET searches/:id`), not in the list. */
  offers?: ShiftOffer[];
}

export interface Candidate {
  guardId: string;
  fullName: string | null;
  reason?: string | null;
  reasons?: string[];
  points?: number;
  /** Hours already worked this week — information only, never a limit. */
  hoursThisWeek?: number | null;
  inReserve?: boolean;
  available?: boolean;
  qualified?: boolean;
  level?: ReserveLevel | null;
}

export interface LevelRule {
  /** Dobletes covered in the month. */
  minCovered: number;
  /** Attendance of the month, in %. */
  minAttendancePct: number;
}

export interface DobletesSettings {
  waveSizes: number[];
  waveMinutes: number;
  defaultBonusCents: number | null;
  urgentBonusCents: number | null;
  earlyBonusCents: number | null;
  earlyMinutes: number;
  autoLaunchWithVigiaPro: boolean;
  whatsappWithVigiaPro: boolean;
  voiceAsLastChannel: boolean;
  /** Bronce = in the reserve; Plata and Oro by these rules. */
  levels: { enabled: boolean; rules: { plata: LevelRule; oro: LevelRule } };
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
  whatsappWithVigiaPro: true,
  voiceAsLastChannel: false,
  levels: {
    enabled: true,
    rules: {
      plata: { minCovered: 1, minAttendancePct: 90 },
      oro: { minCovered: 3, minAttendancePct: 95 },
    },
  },
  ranking: true,
  reserveOfMonth: true,
};

export interface SettingsResponse {
  settings: DobletesSettings;
  currency: string;
  decimals: 0 | 2;
}

export interface ReserveMember {
  userId: string;
  name: string | null;
  active: boolean;
  optedInAt: string | null;
  level: ReserveLevel | null;
  /** Only when the server sends it. */
  coveredThisMonth?: number;
  /** Weekly availability: weekday 0 (Sunday) – 6 → slots. */
  weekly: Array<{ weekday: number; slots: Slot[]; stationIds?: string[] }>;
  qualifiedStationIds: string[];
  availabilityUpdatedAt?: string | null;
}

export interface BenchStation {
  stationId: string;
  stationName: string | null;
  nickname: string | null;
  /** Distinct relief people for the post (server `count`). */
  suplentes: number;
  /** Fewer than the threshold (server `short`). */
  short: boolean;
}

export interface Bench {
  members: ReserveMember[];
  /** Members available per weekday (0-6) and slot over the next 7 days. */
  grid: Array<{ weekday: number; slot: Slot; count: number }>;
  stations: BenchStation[];
  /** A post with fewer suplentes than this is flagged. */
  healthThreshold: number;
  guardsNotInReserve?: number | null;
}

export interface RankingRow {
  userId: string;
  name: string | null;
  /** Accepted offers for gaps of the month. */
  covered: number;
  /** Of those, clocked in. */
  confirmed: number;
  bonusCents: number;
  inReserve: boolean;
  level: ReserveLevel | null;
  position: number;
}

export interface Ranking {
  month: string;
  currency: string;
  rankingEnabled: boolean;
  rows: RankingRow[];
  reserveOfMonth: {
    userId: string;
    name: string | null;
    confirmed: number;
    level?: ReserveLevel | null;
  } | null;
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
  /** The STORED key (what is sent back on save). */
  imageUrl: string | null;
  /** Signed URL to show the image. */
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
  /** People who saw it / tapped / joined through it. */
  shown: number;
  seen: number;
  cta: number;
  converted: number;
  /**
   * Shifts covered thanks to the campaign: offers ACCEPTED by people who
   * converted through it, within `windowDays` (30) of their first conversion;
   * `confirmed` = of those, clocked in. Null when the server does not send it.
   */
  coveredShifts?: CoveredByCampaign | null;
  conversionPct?: number | null;
}

export interface CoveredByCampaign {
  windowDays: number;
  people: number;
  accepted: number;
  confirmed: number;
  bonusCents: number;
}

export interface CampaignTemplate {
  key: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaAction: CtaAction;
  ctaRoute?: string | null;
  accent?: string | null;
  placement?: Placement;
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

/** Currencies paid without cents. */
const SIN_DECIMALES = new Set([
  "CLP",
  "COP",
  "PYG",
  "JPY",
  "KRW",
  "VND",
  "ISK",
  "HUF",
  "UGX",
]);

export function decimalesDe(currency: string): 0 | 2 {
  return SIN_DECIMALES.has(String(currency || "").toUpperCase()) ? 0 : 2;
}

/* ── Normalisers (server shape → screen types) ─────────────────────────── */

type Raw = Record<string, any>;

export function normalizarBusqueda(r: Raw): OfferSearch {
  const ev = r.event as Raw | null | undefined;

  return {
    id: String(r.id),
    coverageEventId: String(r.coverageEventId ?? ev?.id ?? ""),
    status: r.status,
    source: r.source,
    startedBy:
      r.startedBy ??
      (r.startedById || r.startedByName
        ? { id: String(r.startedById ?? ""), name: r.startedByName ?? null }
        : null),
    channels: Array.isArray(r.channels) ? r.channels : ["app"],
    bonusCents: r.bonusCents ?? null,
    currency: String(r.currency || "USD"),
    urgent: !!r.urgent,
    wave: Number(r.wave) || 1,
    waveSizes:
      Array.isArray(r.waveSizes) && r.waveSizes.length ? r.waveSizes : [3, 5],
    waveMinutes: Number(r.waveMinutes) || 15,
    nextWaveAt: r.nextWaveAt ?? null,
    filledOfferId: r.filledOfferId ?? null,
    closedReason: r.closedReason ?? null,
    createdAt: r.createdAt,
    updatedAt: r.filledAt ?? r.closedAt ?? r.updatedAt ?? r.createdAt,
    event: ev
      ? {
          id: String(ev.id),
          reason: ev.reason ?? null,
          windowStart: ev.windowStart,
          windowEnd: ev.windowEnd,
          station:
            ev.station ??
            (ev.stationId || ev.stationName
              ? {
                  id: String(ev.stationId ?? ""),
                  stationName: ev.stationName ?? null,
                  nickname: ev.nickname ?? null,
                }
              : null),
          absentGuardName: ev.absentGuardName ?? null,
          kind: ev.kind ?? null,
        }
      : null,
    counts: r.counts ?? undefined,
    offers: Array.isArray(r.offers)
      ? r.offers.map((o: Raw): ShiftOffer => ({
          id: String(o.id),
          guardUserId: String(o.guardUserId),
          guardName: o.guardName ?? null,
          channel: o.channel ?? "app",
          status: o.status,
          wave: Number(o.wave) || 1,
          bonusCents: o.bonusCents ?? null,
          expiresAt: o.expiresAt ?? null,
          respondedAt: o.respondedAt ?? null,
          seenAt: o.seenAt ?? null,
          resultShiftId: o.resultShiftId ?? null,
          failureCode: o.failureCode ?? null,
          reasons: Array.isArray(o.reasons) ? o.reasons : [],
          level:
            o.level ??
            (Array.isArray(o.reasons)
              ? o.reasons.includes("level_oro")
                ? "oro"
                : o.reasons.includes("level_plata")
                  ? "plata"
                  : null
              : null),
        }))
      : undefined,
  };
}

/** Pending offers of a search, from its detail or from its counts. */
export function pendientesDe(s: OfferSearch): number {
  if (s.offers) return s.offers.filter((o) => o.status === "pending").length;

  return Number(s.counts?.pending ?? 0);
}

function normalizarCampana(r: Raw): Campaign {
  return {
    id: String(r.id),
    title: r.title ?? "",
    body: r.body ?? "",
    // The server returns the stored key as `imageKey` and a signed URL as
    // `imageUrl`; a save must send the KEY back.
    imageUrl:
      r.imageKey ??
      (r.imageUrl && !/^https?:/.test(r.imageUrl) ? r.imageUrl : null),
    imagePreviewUrl:
      r.imagePreviewUrl ??
      (r.imageUrl && /^(https?:|blob:)/.test(r.imageUrl) ? r.imageUrl : null),
    ctaLabel: r.ctaLabel ?? "",
    ctaAction: r.ctaAction ?? "join_reserve",
    ctaRoute: r.ctaRoute ?? null,
    accent: r.accent ?? null,
    template: r.template ?? null,
    placement: r.placement ?? "dashboard",
    audience: {
      branchIds: r.audience?.branchIds ?? [],
      stationIds: r.audience?.stationIds ?? [],
      notInReserve: !!r.audience?.notInReserve,
      staleAvailabilityDays: r.audience?.staleAvailabilityDays ?? null,
      qualifiedForStationIds: r.audience?.qualifiedForStationIds ?? [],
    },
    startsAt: r.startsAt ?? null,
    endsAt: r.endsAt ?? null,
    priority: Number(r.priority) || 0,
    active: !!r.active,
    pushOnPublish: !!r.pushOnPublish,
    reshowAfterDismissDays: Number(r.reshowAfterDismissDays) || 7,
    createdAt: r.createdAt,
    stats: r.stats ? normalizarEstadisticas(r.stats) : undefined,
  };
}

export function normalizarEstadisticas(r: Raw): CampaignStats {
  // `{ people: {shown, seen, dismissed, cta, converted}, total, conversionPct, ctaPct }`
  const p = (r.people ?? r) as Raw;

  return {
    shown: Number(p.shown) || 0,
    seen: Number(p.seen) || 0,
    cta: Number(p.cta) || 0,
    converted: Number(p.converted) || 0,
    coveredShifts: normalizarCubiertos(r.coveredShifts ?? p.coveredShifts),
    conversionPct: r.conversionPct ?? null,
  };
}

function normalizarCubiertos(c: unknown): CoveredByCampaign | null {
  if (c == null) return null;
  // An older/demo shape carried just the number.
  if (typeof c === "number")
    return {
      windowDays: 30,
      people: 0,
      accepted: c,
      confirmed: c,
      bonusCents: 0,
    };
  const x = c as Raw;

  return {
    windowDays: Number(x.windowDays) || 30,
    people: Number(x.people) || 0,
    accepted: Number(x.accepted) || 0,
    confirmed: Number(x.confirmed) || 0,
    bonusCents: Number(x.bonusCents) || 0,
  };
}

/** What a campaign save sends: the editable fields only, image as its key. */
function cuerpoDeCampana(c: CampaignDraft): Raw {
  return {
    title: c.title,
    body: c.body,
    imageUrl: c.imageUrl,
    ctaLabel: c.ctaLabel,
    ctaAction: c.ctaAction,
    ctaRoute: c.ctaAction === "route" ? c.ctaRoute : null,
    accent: c.accent,
    template: c.template,
    placement: c.placement,
    audience: c.audience,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    priority: c.priority,
    active: c.active,
    pushOnPublish: c.pushOnPublish,
    reshowAfterDismissDays: c.reshowAfterDismissDays,
  };
}

/**
 * The server's bench: members, availability per date and band, and EVERY post
 * in scope (also those with nobody), emptiest first, with `count` (distinct
 * relief people) and `short` (fewer than 2).
 */
export function normalizarBanca(r: Raw): Bench {
  const names = (r.names ?? {}) as Record<string, string>;
  const members: ReserveMember[] = (r.members ?? []).map((m: Raw) => ({
    userId: String(m.userId),
    name: m.name ?? names[m.userId] ?? null,
    active: m.active ?? true,
    optedInAt: m.optedInAt ?? null,
    level: m.level ?? null,
    coveredThisMonth: m.coveredThisMonth,
    weekly: (m.weekly ?? []).map((w: Raw) => ({
      weekday: Number(w.weekday),
      slots: (w.slots ?? []) as Slot[],
      stationIds: w.stationIds ?? [],
    })),
    qualifiedStationIds: m.qualifiedStationIds ?? [],
    availabilityUpdatedAt: m.availabilityUpdatedAt ?? null,
  }));

  // `grid` comes per date ({date, weekday, slots: {D: [ids]…}}) or already
  // counted ({weekday, slot, count}).
  const cuenta = new Map<string, Set<string> | number>();

  for (const g of (r.grid ?? []) as Raw[]) {
    if (g.slot) {
      cuenta.set(`${g.weekday}-${g.slot}`, Number(g.count) || 0);
      continue;
    }
    for (const s of ["D", "T", "N"]) {
      const k = `${g.weekday}-${s}`;
      const prev = cuenta.get(k);
      const set = prev instanceof Set ? prev : new Set<string>();

      for (const id of (g.slots?.[s] ?? []) as string[]) set.add(String(id));
      cuenta.set(k, set);
    }
  }
  const grid: Bench["grid"] = [];

  for (let d = 0; d < 7; d++)
    for (const s of ["D", "T", "N"] as Slot[]) {
      const v = cuenta.get(`${d}-${s}`);

      grid.push({
        weekday: d,
        slot: s,
        count: v instanceof Set ? v.size : Number(v) || 0,
      });
    }

  const umbral = Number(r.healthThreshold) || 2;
  const vistos = new Set<string>();
  const stations: BenchStation[] = [];

  for (const p of (r.posts ?? r.stations ?? []) as Raw[]) {
    const id = String(p.stationId);

    if (vistos.has(id)) continue;
    vistos.add(id);
    const suplentes =
      typeof p.count === "number"
        ? p.count
        : typeof p.suplentes === "number"
          ? p.suplentes
          : new Set([...(p.relief ?? []), ...(p.qualified ?? [])].map(String))
              .size;

    stations.push({
      stationId: id,
      stationName: p.stationName ?? null,
      nickname: p.nickname ?? null,
      suplentes,
      short: typeof p.short === "boolean" ? p.short : suplentes < umbral,
    });
  }

  return {
    members,
    grid,
    stations,
    healthThreshold: umbral,
    guardsNotInReserve: r.guardsNotInReserve ?? null,
  };
}

function normalizarRanking(r: Raw, month: string): Ranking {
  const rows: RankingRow[] = (r.rows ?? []).map((x: Raw, i: number) => ({
    userId: String(x.userId),
    name: x.name ?? null,
    covered: Number(x.covered) || 0,
    confirmed: Number(x.confirmed) || 0,
    bonusCents: Number(x.bonusCents) || 0,
    inReserve: !!x.inReserve,
    level: x.level ?? null,
    position: Number(x.position) || i + 1,
  }));
  const rm = r.reserveOfMonth as Raw | null | undefined;

  return {
    month: r.month ?? month,
    currency: String(r.currency || "USD"),
    rankingEnabled: r.rankingEnabled !== false,
    rows,
    reserveOfMonth: rm
      ? {
          userId: String(rm.userId),
          name: rm.name ?? null,
          confirmed: Number(rm.confirmed ?? rm.covered) || 0,
          level:
            rm.level ??
            rows.find((x) => x.userId === String(rm.userId))?.level ??
            null,
        }
      : null,
  };
}

function respuestaDeAjustes(r: Raw): SettingsResponse {
  const s = (r?.settings ?? r) as Partial<DobletesSettings>;
  const currency = String(r?.currency || "USD");

  return {
    settings: mergeSettings(s),
    currency,
    decimals: decimalesDe(currency),
  };
}

/* ── Calls ──────────────────────────────────────────────────────────────── */

const real = {
  async searches(
    params: { status?: string; eventId?: string; limit?: number } = {},
  ): Promise<OfferSearch[]> {
    const q = new URLSearchParams();

    if (params.status) q.set("status", params.status);
    if (params.eventId) q.set("eventId", params.eventId);
    q.set("limit", String(params.limit ?? 50));

    return filas<Raw>(await api.get(`${base()}/searches?${q}`, SILENT)).map(
      normalizarBusqueda,
    );
  },
  async search(id: string): Promise<OfferSearch> {
    return normalizarBusqueda(
      unwrap(await api.get(`${base()}/searches/${enc(id)}`, SILENT)),
    );
  },
  /**
   * Start a search on a novedad (`eventId`) or on an empty seat (`vacancy`):
   * the server opens the seat as a vacancy in the same call.
   */
  async start(body: {
    eventId?: string;
    vacancy?:
      | { shiftId: string }
      | { stationId: string; windowStart: string; windowEnd: string };
    /** An unreported falta: the server reports it and withdraws it if the offer cannot start. */
    absence?: { guardId: string; shiftId: string };
    bonusCents?: number | null;
    urgent?: boolean;
    pickedUserIds?: string[];
  }): Promise<OfferSearch> {
    const cuerpo: Raw = { urgent: !!body.urgent };

    if (body.eventId) cuerpo.eventId = body.eventId;
    else if (body.vacancy) cuerpo.vacancy = body.vacancy;
    else if (body.absence) cuerpo.absence = body.absence;

    // Omitted = the company default (plus the urgent bonus when urgent).
    if (body.bonusCents != null) cuerpo.bonusCents = body.bonusCents;
    if (body.pickedUserIds?.length) cuerpo.pickedUserIds = body.pickedUserIds;

    return normalizarBusqueda(
      unwrap(await api.post(`${base()}/searches`, cuerpo)),
    );
  },
  async raiseBonus(id: string, bonusCents: number): Promise<OfferSearch> {
    return normalizarBusqueda(
      unwrap(
        await api.post(`${base()}/searches/${enc(id)}/bonus`, { bonusCents }),
      ),
    );
  },
  async cancel(id: string): Promise<OfferSearch> {
    return normalizarBusqueda(
      unwrap(await api.post(`${base()}/searches/${enc(id)}/cancel`, {})),
    );
  },
  async withdraw(id: string, offerId: string): Promise<OfferSearch> {
    return normalizarBusqueda(
      unwrap(
        await api.post(
          `${base()}/searches/${enc(id)}/offers/${enc(offerId)}/withdraw`,
          {},
        ),
      ),
    );
  },
  /** Ranked people for a gap with hours this week (information only). */
  async candidates(eventId: string): Promise<Candidate[]> {
    return filas<Raw>(
      await api.get(`${base()}/candidates?eventId=${enc(eventId)}`, SILENT),
    ).map((c) => ({
      guardId: String(c.guardId),
      fullName: c.fullName ?? null,
      reason: c.baseReason ?? c.reason ?? null,
      reasons: Array.isArray(c.reasons) ? c.reasons : [],
      points: c.points,
      hoursThisWeek: c.hoursThisWeek ?? null,
      inReserve: !!c.inReserve,
      available: !!c.available,
      qualified: !!c.qualified,
      level: c.level ?? null,
    }));
  },
  async settings(): Promise<SettingsResponse> {
    return respuestaDeAjustes(
      unwrap(await api.get(`${base()}/settings`, SILENT)),
    );
  },
  /** Only the keys sent change. */
  async saveSettings(s: Partial<DobletesSettings>): Promise<SettingsResponse> {
    const r = unwrap<Raw>(await api.put(`${base()}/settings`, { data: s }));
    const out = respuestaDeAjustes(r);

    // The PUT answers `{ settings }` without the currency.
    if (!r?.currency) {
      const ahora = await real.settings().catch(() => null);

      if (ahora)
        return { ...out, currency: ahora.currency, decimals: ahora.decimals };
    }

    return out;
  },
  async bench(): Promise<Bench> {
    return normalizarBanca(
      unwrap(await api.get(`${base()}/bench?days=7`, SILENT)),
    );
  },
  /** Office edits a member: pause/return, or the posts they can cover. */
  async saveReserve(
    userId: string,
    body: { active?: boolean; qualifiedStationIds?: string[] },
  ): Promise<void> {
    await api.put(`${base()}/reserve/${enc(userId)}`, { data: body });
  },
  async ranking(month: string): Promise<Ranking> {
    return normalizarRanking(
      unwrap(await api.get(`${base()}/ranking?month=${enc(month)}`, SILENT)),
      month,
    );
  },
  async campaigns(): Promise<Campaign[]> {
    return filas<Raw>(await api.get(`${base()}/campaigns`, SILENT)).map(
      normalizarCampana,
    );
  },
  async templates(lang: string): Promise<CampaignTemplate[]> {
    return filas<CampaignTemplate>(
      await api.get(`${base()}/campaigns/templates?lang=${enc(lang)}`, SILENT),
    );
  },
  async saveCampaign(c: CampaignDraft): Promise<Campaign> {
    const data = cuerpoDeCampana(c);
    const r = c.id
      ? await api.put(`${base()}/campaigns/${enc(c.id)}`, { data })
      : await api.post(`${base()}/campaigns`, { data });

    return normalizarCampana(unwrap(r));
  },
  async deleteCampaign(id: string): Promise<void> {
    await api.delete(`${base()}/campaigns/${enc(id)}`);
  },
  async campaignStats(id: string): Promise<CampaignStats> {
    return normalizarEstadisticas(
      unwrap(await api.get(`${base()}/campaigns/${enc(id)}/stats`, SILENT)),
    );
  },
  /** → the stored key (save it in `imageUrl`) and a URL to show it. */
  async uploadImage(
    file: File,
  ): Promise<{ imageUrl: string; previewUrl: string | null }> {
    const form = new FormData();

    form.append("file", file);
    const r = unwrap<Raw>(
      await api.post(`${base()}/campaigns/image`, form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60_000,
      }),
    );

    return {
      imageUrl: r.privateUrl ?? r.imageUrl,
      previewUrl: r.url ?? r.previewUrl ?? null,
    };
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
  const v = (s || {}) as Partial<DobletesSettings>;
  const regla = (k: "plata" | "oro") => {
    const x = (v.levels?.rules as Raw | undefined)?.[k];

    // An older shape carried just the number of dobletes.
    if (typeof x === "number")
      return { ...DEFAULT_SETTINGS.levels.rules[k], minCovered: x };

    return { ...DEFAULT_SETTINGS.levels.rules[k], ...(x || {}) };
  };

  return {
    ...DEFAULT_SETTINGS,
    ...v,
    waveSizes:
      Array.isArray(v.waveSizes) && v.waveSizes.length
        ? v.waveSizes
        : DEFAULT_SETTINGS.waveSizes,
    levels: {
      enabled: v.levels?.enabled ?? DEFAULT_SETTINGS.levels.enabled,
      rules: { plata: regla("plata"), oro: regla("oro") },
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
  withdraw: via("withdraw"),
  candidates: via("candidates"),
  settings: via("settings"),
  saveSettings: via("saveSettings"),
  bench: via("bench"),
  saveReserve: via("saveReserve"),
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
