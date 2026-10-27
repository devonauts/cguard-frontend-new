/**
 * DEVELOPMENT ONLY — an in-memory stand-in for the Dobletes routes, so the
 * screens can be built and looked at before the backend lands. Loaded by
 * `dobletesService` behind `import.meta.env.DEV` + `localStorage
 * ["dobletes:demo"] = "1"`; a production build never includes it.
 *
 * Everything here is fictional.
 */
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  type Bench,
  type Campaign,
  type CampaignDraft,
  type Candidate,
  type DobletesApi,
  type DobletesSettings,
  type OfferSearch,
  type PointsSettings,
  type ReserveLevel,
  type ShiftOffer,
  type Slot,
} from "./dobletesService";

const espera = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const id = () => Math.random().toString(36).slice(2, 10);
const haceMin = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const enMin = (m: number) => new Date(Date.now() + m * 60000).toISOString();

const PUESTOS = [
  { stationId: "st1", stationName: "Puerta norte", nickname: "P-031" },
  {
    stationId: "st2",
    stationName: "Centro comercial · garita",
    nickname: "P-014",
  },
  { stationId: "st3", stationName: "Bodega Las Palmas", nickname: "P-022" },
  {
    stationId: "st4",
    stationName: "Edificio Torres del Río",
    nickname: "P-007",
  },
  { stationId: "st5", stationName: "Hospital San Rafael", nickname: "P-040" },
  {
    stationId: "st6",
    stationName: "Planta industrial · acceso 2",
    nickname: "P-052",
  },
];

const PERSONAS: Array<{
  id: string;
  nombre: string;
  nivel: ReserveLevel | null;
  horas: number;
}> = [
  { id: "g1", nombre: "Mariana Torres", nivel: "oro", horas: 36 },
  { id: "g2", nombre: "Luis Andrade", nivel: "oro", horas: 48 },
  { id: "g3", nombre: "Carlos Mena", nivel: "plata", horas: 24 },
  { id: "g4", nombre: "Diana Paredes", nivel: "plata", horas: 40 },
  { id: "g5", nombre: "Jorge Salazar", nivel: "bronce", horas: 12 },
  { id: "g6", nombre: "Paola Ríos", nivel: "bronce", horas: 56 },
  { id: "g7", nombre: "Esteban Cruz", nivel: "bronce", horas: 32 },
  { id: "g8", nombre: "Valeria Gómez", nivel: null, horas: 44 },
  { id: "g9", nombre: "Andrés Villacís", nivel: null, horas: 20 },
];

function oferta(
  p: (typeof PERSONAS)[number],
  ola: number,
  status: ShiftOffer["status"],
  hace: number | null,
): ShiftOffer {
  return {
    id: id(),
    guardUserId: p.id,
    guardName: p.nombre,
    channel: "app",
    status,
    wave: ola,
    bonusCents: 1500,
    expiresAt: enMin(9),
    respondedAt: hace == null ? null : haceMin(hace),
    level: p.nivel,
  };
}

function crearEstado() {
  const settings: DobletesSettings = {
    ...DEFAULT_SETTINGS,
    defaultBonusCents: 1500,
    urgentBonusCents: 3000,
    earlyBonusCents: 500,
    earlyMinutes: 5,
  };
  const searches: OfferSearch[] = [
    {
      id: "s1",
      coverageEventId: "ev-demo-1",
      status: "active",
      source: "office",
      startedBy: { id: "u1", name: "Central de monitoreo" },
      channels: ["app"],
      bonusCents: 1500,
      currency: "USD",
      urgent: false,
      wave: 1,
      waveSizes: [3, 5],
      waveMinutes: 15,
      nextWaveAt: enMin(9),
      filledOfferId: null,
      createdAt: haceMin(6),
      updatedAt: haceMin(2),
      event: {
        id: "ev-demo-1",
        reason: "enfermedad",
        windowStart: enMin(50),
        windowEnd: enMin(50 + 12 * 60),
        station: { id: "st1", stationName: "Puerta norte", nickname: "P-031" },
        absentGuardName: "Ramiro Lema",
      },
      offers: [
        oferta(PERSONAS[0], 1, "pending", null),
        oferta(PERSONAS[1], 1, "declined", 3),
        oferta(PERSONAS[2], 1, "pending", null),
      ],
    },
    {
      id: "s2",
      coverageEventId: "ev-demo-2",
      status: "active",
      source: "despachador",
      startedBy: { id: "u2", name: null },
      channels: ["app", "whatsapp"],
      bonusCents: 3000,
      currency: "USD",
      urgent: true,
      wave: 2,
      waveSizes: [3, 5],
      waveMinutes: 15,
      nextWaveAt: null,
      filledOfferId: null,
      createdAt: haceMin(22),
      updatedAt: haceMin(1),
      event: {
        id: "ev-demo-2",
        reason: "no_call_no_show",
        windowStart: haceMin(20),
        windowEnd: enMin(11 * 60),
        station: {
          id: "st5",
          stationName: "Hospital San Rafael",
          nickname: "P-040",
        },
        absentGuardName: "Fernando Ortiz",
      },
      offers: [
        oferta(PERSONAS[3], 1, "expired", null),
        oferta(PERSONAS[4], 1, "declined", 17),
        oferta(PERSONAS[5], 1, "expired", null),
        { ...oferta(PERSONAS[6], 2, "pending", null), channel: "whatsapp" },
        oferta(PERSONAS[7], 2, "pending", null),
      ],
    },
    {
      id: "s3",
      coverageEventId: "ev-demo-3",
      status: "filled",
      source: "office",
      startedBy: { id: "u1", name: "Central de monitoreo" },
      channels: ["app"],
      bonusCents: 1500,
      currency: "USD",
      urgent: false,
      wave: 1,
      waveSizes: [3, 5],
      waveMinutes: 15,
      nextWaveAt: null,
      filledOfferId: "o-win",
      createdAt: haceMin(180),
      updatedAt: haceMin(172),
      event: {
        id: "ev-demo-3",
        reason: "permiso_con_sueldo",
        windowStart: haceMin(120),
        windowEnd: enMin(10 * 60),
        station: {
          id: "st2",
          stationName: "Centro comercial · garita",
          nickname: "P-014",
        },
        absentGuardName: "Sofía Medina",
      },
      offers: [
        { ...oferta(PERSONAS[0], 1, "accepted", 172), id: "o-win" },
        oferta(PERSONAS[2], 1, "lost", 170),
        oferta(PERSONAS[3], 1, "withdrawn", null),
      ],
    },
    {
      id: "s4",
      coverageEventId: "ev-demo-4",
      status: "exhausted",
      source: "office",
      startedBy: { id: "u1", name: "Central de monitoreo" },
      channels: ["app"],
      bonusCents: null,
      currency: "USD",
      urgent: false,
      wave: 2,
      waveSizes: [3, 5],
      waveMinutes: 15,
      nextWaveAt: null,
      filledOfferId: null,
      createdAt: haceMin(60 * 26),
      updatedAt: haceMin(60 * 25),
      event: {
        id: "ev-demo-4",
        reason: "calamidad_domestica",
        windowStart: haceMin(60 * 24),
        windowEnd: haceMin(60 * 12),
        station: {
          id: "st6",
          stationName: "Planta industrial · acceso 2",
          nickname: "P-052",
        },
        absentGuardName: null,
      },
      offers: [
        oferta(PERSONAS[4], 1, "declined", 60 * 25 + 40),
        oferta(PERSONAS[8], 1, "expired", null),
      ],
    },
  ];

  const disp = (dias: number[], slots: Slot[]) =>
    dias.map((weekday) => ({ weekday, slots }));
  const members = PERSONAS.slice(0, 7).map((p, i) => ({
    userId: p.id,
    name: p.nombre,
    active: true,
    optedInAt: haceMin(60 * 24 * (40 - i * 4)),
    level: p.nivel,
    coveredThisMonth: [7, 6, 3, 2, 1, 0, 1][i] ?? 0,
    weekly:
      i % 3 === 0
        ? disp([1, 2, 3, 4, 5], ["D", "T"])
        : i % 3 === 1
          ? disp([5, 6, 0], ["N"])
          : disp([6, 0], ["D", "T", "N"]),
    qualifiedStationIds: i < 3 ? ["st1", "st2", "st5"] : ["st3"],
    availabilityUpdatedAt: haceMin(60 * 24 * (i * 9 + 2)),
  }));

  const campaigns: Campaign[] = [
    {
      id: "c1",
      title: "Únete a la reserva de {{empresa}}",
      body: "Cubre turnos extra cuando tú quieras y gana {{bono}} por cada doblete. Tú eliges los días.",
      imageUrl: null,
      imagePreviewUrl: null,
      ctaLabel: "Quiero unirme",
      ctaAction: "join_reserve",
      ctaRoute: null,
      accent: null,
      template: "join_reserve",
      placement: "dashboard",
      audience: {
        branchIds: [],
        stationIds: [],
        notInReserve: true,
        staleAvailabilityDays: null,
        qualifiedForStationIds: [],
      },
      startsAt: haceMin(60 * 24 * 12),
      endsAt: enMin(60 * 24 * 18),
      priority: 3,
      active: true,
      pushOnPublish: true,
      reshowAfterDismissDays: 7,
      stats: {
        shown: 214,
        seen: 168,
        cta: 41,
        converted: 12,
        coveredShifts: null,
        conversionPct: 5.6,
      },
    },
    {
      id: "c2",
      title: "¿Libre hoy?",
      body: "Marca que estás disponible y las ofertas de hoy te llegan primero.",
      imageUrl: null,
      imagePreviewUrl: null,
      ctaLabel: "Hoy estoy disponible",
      ctaAction: "available_today",
      ctaRoute: null,
      accent: null,
      template: "available_today",
      placement: "dashboard",
      audience: {
        branchIds: [],
        stationIds: [],
        notInReserve: false,
        staleAvailabilityDays: 30,
        qualifiedForStationIds: [],
      },
      startsAt: null,
      endsAt: null,
      priority: 1,
      active: false,
      pushOnPublish: false,
      reshowAfterDismissDays: 7,
    },
  ];

  return {
    settings,
    searches,
    members,
    campaigns,
    points: {
      volunteerPoints: null,
      coverPoints: null,
      bonusCap: null,
    } as PointsSettings,
  };
}

export function crearApiDeDemo(): DobletesApi {
  const e = crearEstado();

  const bench = (): Bench => {
    const grid: Bench["grid"] = [];

    for (let d = 0; d < 7; d++)
      for (const s of ["D", "T", "N"] as Slot[])
        grid.push({
          weekday: d,
          slot: s,
          count: e.members.filter(
            (m) =>
              m.active &&
              m.weekly.some((w) => w.weekday === d && w.slots.includes(s)),
          ).length,
        });
    const stations = PUESTOS.map((p) => ({
      ...p,
      suplentes: e.members.filter(
        (m) => m.active && m.qualifiedStationIds.includes(p.stationId),
      ).length,
    }));

    return {
      members: e.members,
      grid,
      stations,
      healthThreshold: 2,
      guardsNotInReserve: 23,
    };
  };

  return {
    async searches(params = {}) {
      await espera();

      return e.searches.filter(
        (s) => !params.status || params.status.split(",").includes(s.status),
      );
    },
    async search(sid) {
      await espera();
      const s = e.searches.find((x) => x.id === sid);

      if (!s) throw { status: 404, message: "not found" };

      return s;
    },
    async start(body) {
      await espera(400);
      const picked = body.pickedUserIds?.length
        ? PERSONAS.filter((p) => body.pickedUserIds!.includes(p.id))
        : PERSONAS.slice(0, e.settings.waveSizes[0] ?? 3);
      const s: OfferSearch = {
        id: id(),
        coverageEventId: body.eventId,
        status: "active",
        source: "office",
        startedBy: { id: "me", name: "Tú" },
        channels: ["app"],
        bonusCents: body.bonusCents ?? null,
        currency: "USD",
        urgent: !!body.urgent,
        wave: 1,
        waveSizes: e.settings.waveSizes,
        waveMinutes: e.settings.waveMinutes,
        nextWaveAt: body.pickedUserIds?.length
          ? null
          : enMin(e.settings.waveMinutes),
        filledOfferId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        event: {
          id: body.eventId,
          reason: "enfermedad",
          windowStart: enMin(30),
          windowEnd: enMin(30 + 12 * 60),
          station: {
            id: "st3",
            stationName: "Bodega Las Palmas",
            nickname: "P-022",
          },
          absentGuardName: null,
        },
        offers: picked.map((p) => ({
          ...oferta(p, 1, "pending", null),
          bonusCents: body.bonusCents ?? null,
        })),
      };

      e.searches.unshift(s);

      return s;
    },
    async raiseBonus(sid, bonusCents) {
      await espera();
      const s = e.searches.find((x) => x.id === sid)!;

      s.bonusCents = bonusCents;
      s.offers = (s.offers ?? []).map((o) =>
        o.status === "pending" ? { ...o, bonusCents } : o,
      );

      return s;
    },
    async withdraw(sid, offerId) {
      await espera();
      const s = e.searches.find((x) => x.id === sid)!;

      s.offers = (s.offers ?? []).map((o) =>
        o.id === offerId ? { ...o, status: "withdrawn" } : o,
      );

      return s;
    },
    async saveReserve(userId, body) {
      await espera();
      e.members = e.members.map((m) =>
        m.userId === userId
          ? {
              ...m,
              ...(body.qualifiedStationIds
                ? { qualifiedStationIds: body.qualifiedStationIds }
                : {}),
            }
          : m,
      );
      if (body.active === false)
        e.members = e.members.filter((m) => m.userId !== userId);
    },
    async cancel(sid) {
      await espera();
      const s = e.searches.find((x) => x.id === sid)!;

      s.status = "cancelled";
      s.offers = (s.offers ?? []).map((o) =>
        o.status === "pending" ? { ...o, status: "withdrawn" } : o,
      );

      return s;
    },
    async candidates() {
      await espera(350);

      return PERSONAS.map((p, i): Candidate => ({
        guardId: p.id,
        fullName: p.nombre,
        reason:
          i < 7 ? "Disponible en la reserva para esa franja" : "Libre ese día",
        points: 100 - i * 7,
        hoursThisWeek: p.horas,
        inReserve: i < 7,
        available: true,
        level: p.nivel,
      }));
    },
    async settings() {
      await espera();

      return { settings: e.settings, currency: "USD", decimals: 2 };
    },
    async saveSettings(s) {
      await espera();
      e.settings = mergeSettings({ ...e.settings, ...s });

      return { settings: e.settings, currency: "USD", decimals: 2 };
    },
    async bench() {
      await espera();

      return bench();
    },
    async ranking(month) {
      await espera();
      const rows = e.members
        .filter((m) => (m.coveredThisMonth ?? 0) > 0)
        .sort((a, b) => (b.coveredThisMonth ?? 0) - (a.coveredThisMonth ?? 0))
        .map((m, i) => ({
          userId: m.userId,
          name: m.name,
          covered: m.coveredThisMonth ?? 0,
          confirmed: Math.max(0, (m.coveredThisMonth ?? 0) - (i % 2)),
          bonusCents: (m.coveredThisMonth ?? 0) * 1500,
          inReserve: true,
          level: m.level,
          position: i + 1,
        }));
      const r = rows[0];

      return {
        month,
        currency: "USD",
        rankingEnabled: true,
        rows,
        reserveOfMonth: r
          ? {
              userId: r.userId,
              name: r.name,
              confirmed: r.confirmed,
              level: r.level,
            }
          : null,
      };
    },
    async campaigns() {
      await espera();

      return e.campaigns;
    },
    async templates() {
      await espera();

      return [];
    },
    async saveCampaign(c: CampaignDraft) {
      await espera(350);
      if (c.id) {
        const i = e.campaigns.findIndex((x) => x.id === c.id);

        e.campaigns[i] = { ...e.campaigns[i], ...c, id: c.id };

        return e.campaigns[i];
      }
      const nueva: Campaign = {
        ...c,
        id: id(),
        createdAt: new Date().toISOString(),
      };

      e.campaigns.unshift(nueva);

      return nueva;
    },
    async deleteCampaign(cid) {
      await espera();
      e.campaigns = e.campaigns.filter((x) => x.id !== cid);
    },
    async campaignStats(cid) {
      await espera();

      return (
        e.campaigns.find((x) => x.id === cid)?.stats ?? {
          shown: 0,
          seen: 0,
          cta: 0,
          converted: 0,
          coveredShifts: 0,
        }
      );
    },
    async uploadImage(file) {
      await espera(500);
      const url = URL.createObjectURL(file);

      return { imageUrl: `demo/${file.name}`, previewUrl: url };
    },
    async points() {
      await espera();

      return e.points;
    },
    async savePoints(p) {
      await espera();
      e.points = { ...e.points, ...p };

      return e.points;
    },
  };
}
