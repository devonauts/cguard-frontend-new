/**
 * Demo dataset for the Control Center — a realistic, fully-populated snapshot so
 * a new tenant (with no real data yet) can preview the dashboard in operation.
 * Toggled on/off from the Panel de control; never written to the backend.
 *
 * - Guards sit AT their station → that station reads green (covered). One
 *   station is left uncovered (gold/yellow) and one has an active incident (red).
 * - Supervisors drive looping patrol routes across the map (animated via
 *   `useDemoData`).
 * Coordinates are around Quito, Ecuador.
 */
import type {
  ControlCenterData,
  Kpi,
  MapEntity,
  MonthPoint,
  ActivityItem,
  RevenueSeries,
} from "./types";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { DEFAULT_PREFS } from "./prefs";

import i18n from "@/i18n";
import { localeActual } from "@/lib/localeActual";

/* La API de marcadores de Google exige un color literal —no resuelve `var(--…)`—,
   así que estos pines no pueden salir de los tokens. Lo que sí se evita es tener
   TRES literales más: se leen de los mismos ajustes por defecto que pinta el mapa
   real, y así la muestra no se separa de lo que el usuario ve en producción. */
const GREEN = DEFAULT_PREFS.pinColors.guard; // cubierto
const RED = DEFAULT_PREFS.pinColors.incident; // incidente
const PURPLE = DEFAULT_PREFS.pinColors.supervisor;

/** Short month name in the UI language (was a hard-coded Spanish list). */
function monthLabel(i: number): string {
  const s = new Date(2024, i % 12, 1).toLocaleDateString(localeActual(), {
    month: "short",
  });

  return s.charAt(0).toUpperCase() + s.slice(1).replace(/\.$/, "");
}
const CENTER = { lat: -0.1807, lng: -78.4678 };

type LL = { lat: number; lng: number };

// Deterministic spread so pins don't jump between renders.
function around(i: number, spread = 0.05): LL {
  const a = i * 137.508 * (Math.PI / 180);
  const r = ((i % 5) + 1) / 5;

  return {
    lat: CENTER.lat + Math.sin(a) * spread * r,
    lng: CENTER.lng + Math.cos(a) * spread * r,
  };
}

const STATION_NAMES = [
  "Plaza Foch",
  "Torre Z",
  "Quicentro Shopping",
  "Hospital Metropolitano",
  "Edificio Banco Pichincha",
  "Condominio La Carolina",
  "Bodegas Cumbayá",
  "Mall El Jardín",
];
const GUARD_NAMES = [
  "Carlos Méndez",
  "Andrea Salazar",
  "Luis Quishpe",
  "María Tituaña",
  "Jorge Yánez",
  "Paola Cevallos",
  "Diego Andrade",
];
const SUPERVISOR_NAMES = [
  "Sup. Patricio Vélez",
  "Sup. Gabriela Ron",
  "Sup. Henry Cárdenas",
];

const STATION_COORDS: LL[] = STATION_NAMES.map((_, i) => around(i + 1, 0.05));

function monthSeries(values: number[]): MonthPoint[] {
  return values.map((v, i) => ({ month: monthLabel(i), value: v }));
}

function buildStations(): MapEntity[] {
  return STATION_NAMES.map((name, i) => {
    const incident = i === 6; // one station with an active incident → red
    const uncovered = i === 7; // one station with no guard → gold/yellow
    const color = incident ? RED : uncovered ? undefined : GREEN;

    return {
      id: `demo-st-${i}`,
      kind: "station",
      lat: STATION_COORDS[i].lat,
      lng: STATION_COORDS[i].lng,
      status: incident ? "incident" : uncovered ? "delayed" : "online",
      label: name,
      sub: incident
        ? i18n.t("ui.demoData.incidenteActivo", "Incidente activo")
        : uncovered
          ? i18n.t("dashboard.coverage.none", "Sin cobertura")
          : i18n.t("ui.demoData.cubierto1Vigilante", "Cubierto · 1 vigilante"),
      meta: { geofenceRadius: 80, ...(color ? { color } : {}) },
    };
  });
}

function buildGuards(): MapEntity[] {
  // A guard at each of the first 7 stations (so 6 covered + 1 incident station).
  return GUARD_NAMES.map((name, i) => ({
    id: `demo-g-${i}`,
    kind: "guard",
    // sit on the station, nudged a touch so both pins read.
    lat: STATION_COORDS[i].lat + 0.0012,
    lng: STATION_COORDS[i].lng + 0.0012,
    status: i === 2 ? "patrol" : "online",
    label: name,
    sub: STATION_NAMES[i],
    meta: {
      entityId: `demo-g-${i}`,
      battery: 62 + ((i * 9) % 36),
      punchInTime: new Date(Date.now() - (i + 1) * 36e5).toISOString(),
      // El mapa sólo late con señal FRESCA. Uno de la muestra lleva rato mudo a
      // propósito: así se ve la diferencia entre «reportando» y «sin señal».
      lastSeenAt: new Date(
        Date.now() - (i === 5 ? 52 * 60e3 : 40e3),
      ).toISOString(),
      stationName: STATION_NAMES[i],
      phone: "+593 99 000 00" + (10 + i),
    },
  }));
}

const CLIENT_NAMES = [
  "Grupo Andina",
  "Corporación Delta",
  "Banco Pichincha",
  "Hospital Metropolitano",
  "Mall El Jardín",
  "Bodegas Cumbayá",
];

/** Las sedes de los clientes — el cuarto tipo de entidad del mapa. Se colocan
 *  cerca de sus puestos, y dos de ellas casi encima para que se vea el racimo. */
function buildClients(): MapEntity[] {
  return CLIENT_NAMES.map((name, i) => {
    const base = STATION_COORDS[i % STATION_COORDS.length];
    // Las dos últimas comparten manzana: el mapa las agrupa hasta que se acerca.
    const juntas = i >= CLIENT_NAMES.length - 2;

    return {
      id: `demo-cl-${i}`,
      kind: "client",
      lat: base.lat + (juntas ? 0.0006 * (i % 2) : 0.004),
      lng: base.lng + (juntas ? 0.0006 : -0.004),
      status: "online",
      label: i18n.t("ui.demoData.sedeNombre", {
        nombre: name,
        defaultValue: "Sede {{nombre}}",
      }),
      sub: name,
      meta: {
        entityId: `demo-cl-${i}`,
        clientId: `demo-cli-${i}`,
        clientName: name,
        address: i18n.t("ui.demoData.direccionDemo", {
          numero: 100 + i * 7,
          defaultValue: "Av. Demostración {{numero}}, Quito",
        }),
        city: "Quito",
        phone: "+593 2 250 00" + (10 + i),
        riskLevel:
          i % 3 === 0
            ? i18n.t("clients.riskLevel.high", "Alto")
            : i18n.t("clients.riskLevel.medium", "Medio"),
        stationsCount: 1 + (i % 3),
      },
    };
  });
}

// ── Supervisor patrol routes (looping rings of different radii) ──────────────
function ring(radius: number, n: number, phase: number): LL[] {
  return Array.from({ length: n }, (_, i) => {
    const a = phase + (i / n) * 2 * Math.PI;

    return {
      lat: CENTER.lat + Math.sin(a) * radius,
      lng: CENTER.lng + Math.cos(a) * radius,
    };
  });
}
const SUP_ROUTES: LL[][] = [
  ring(0.04, 14, 0),
  ring(0.026, 12, 0.7),
  ring(0.047, 16, 1.5),
];
const SUP_SPEED = 0.09; // segments advanced per tick (~1.2s) → a smooth drive

function lerp(a: LL, b: LL, t: number): LL {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}
function pointOnRoute(route: LL[], p: number): LL {
  const n = route.length;
  const pp = ((p % n) + n) % n;
  const i = Math.floor(pp);

  return lerp(route[i], route[(i + 1) % n], pp - i);
}

function supervisorsAt(step: number): MapEntity[] {
  return SUPERVISOR_NAMES.map((name, i) => {
    const route = SUP_ROUTES[i % SUP_ROUTES.length];
    const pos = pointOnRoute(route, step * SUP_SPEED + i * 2.3);

    return {
      id: `demo-sup-${i}`,
      kind: "supervisor",
      lat: pos.lat,
      lng: pos.lng,
      status: "patrol",
      label: name,
      sub: i18n.t("ui.demoData.recorridoDeSupervision", "Recorrido de supervisión"),
      meta: {
        color: PURPLE,
        entityId: `demo-sup-${i}`,
        zone: [
          i18n.t("ui.demoData.norte", "Norte"),
          i18n.t("ui.demoData.centro", "Centro"),
          i18n.t("ui.demoData.valles", "Valles"),
        ][i % 3],
        vehicle: i18n.t("ui.demoData.camioneta", {
          placa: ["PDA-120", "PBX-455", "PCT-981"][i % 3],
          defaultValue: "Camioneta {{placa}}",
        }),
        phone: "+593 99 111 11" + (10 + i),
        onDutySince: new Date(Date.now() - (i + 2) * 36e5).toISOString(),
        // Se está moviendo AHORA: su marca de tiempo es de este instante.
        lastSeenAt: new Date().toISOString(),
      },
    };
  });
}

function buildRevenue(): RevenueSeries {
  const points = monthSeries([
    8200, 9100, 9800, 11200, 12600, 13400, 14900, 16100, 17800, 19200, 20600,
    22400,
  ]);
  const total = points.reduce((a, b) => a + b.value, 0);

  return {
    points,
    total,
    paid: Math.round(total * 0.78),
    pending: Math.round(total * 0.22),
    currency: "USD",
    hasData: true,
  };
}

function buildActivity(): ActivityItem[] {
  const now = Date.now();
  const min = (m: number) => new Date(now - m * 60000).toISOString();

  return [
    {
      id: "d1",
      kind: "alert",
      title: i18n.t("ui.demoData.botonDePanicoActivado", "Botón de pánico activado"),
      sub: "Bodegas Cumbayá",
      at: min(3),
      status: "emergency",
    },
    {
      id: "d2",
      kind: "checkin",
      title: i18n.t("ui.demoData.inicioTurno", {
        nombre: "Carlos Méndez",
        defaultValue: "{{nombre}} inició turno",
      }),
      sub: "Plaza Foch",
      at: min(9),
      status: "online",
    },
    {
      id: "d3",
      kind: "patrol",
      title: i18n.t("ui.demoData.enRecorrido", {
        nombre: "Sup. Patricio Vélez",
        defaultValue: "{{nombre}} en recorrido",
      }),
      sub: i18n.t("ui.demoData.sectorLaCarolina", "Sector La Carolina"),
      at: min(14),
      status: "patrol",
    },
    {
      id: "d4",
      kind: "incident",
      title: i18n.t("ui.demoData.accesoNoAutorizado", "Acceso no autorizado"),
      sub: "Bodegas Cumbayá",
      at: min(18),
      status: "incident",
    },
    {
      id: "d5",
      kind: "patrol",
      title: i18n.t("ui.demoData.rondaCompletada", {
        hechos: 12,
        total: 12,
        defaultValue: "Ronda completada ({{hechos}}/{{total}} puntos)",
      }),
      sub: "Quicentro Shopping",
      at: min(26),
      status: "online",
    },
    {
      id: "d6",
      kind: "checkin",
      title: i18n.t("ui.demoData.fichoSalida", {
        nombre: "Andrea Salazar",
        defaultValue: "{{nombre}} fichó salida",
      }),
      sub: "Torre Z",
      at: min(41),
      status: "online",
    },
    {
      id: "d7",
      kind: "event",
      title: i18n.t("ui.demoData.visitanteRegistrado", "Visitante registrado"),
      sub: "Mall El Jardín",
      at: min(55),
      status: "online",
    },
    {
      id: "d8",
      kind: "incident",
      title: i18n.t("ui.demoData.incidenteResuelto", "Incidente resuelto"),
      sub: "Hospital Metropolitano",
      at: min(95),
      status: "online",
    },
  ];
}

function kpi(
  key: string,
  label: string,
  value: number | string,
  extra: Partial<Kpi> = {},
): Kpi {
  return { key, label, value, status: "neutral", trend: null, ...extra };
}

/**
 * `idioma` is not read here: it is an argument so the memo in `useDemoData`
 * rebuilds the sample (all its labels go through i18n) when the language changes.
 */
function buildBase(_idioma?: string): ControlCenterData {
  const tenant: MapEntity = {
    id: "demo-tenant",
    kind: "tenant",
    lat: CENTER.lat,
    lng: CENTER.lng,
    status: "online",
    label: i18n.t("ui.useControlCenter.sedeCentral", "Sede central"),
    sub: i18n.t("ui.demoData.oficinaPrincipalQuito", "Oficina principal · Quito"),
  };
  const stations = buildStations();
  const guards = buildGuards();
  const clients = buildClients();

  const responseTrend = monthSeries([
    6.1, 5.8, 5.5, 5.2, 5.0, 4.8, 4.7, 4.5, 4.4, 4.3, 4.3, 4.2,
  ]);
  const incidentsTrend = monthSeries([14, 12, 15, 11, 9, 10, 8, 7, 9, 6, 5, 4]);
  const acquisitionTrend = monthSeries([1, 2, 1, 3, 2, 2, 3, 1, 4, 2, 3, 4]);

  return {
    kpis: [
      kpi("onDuty", i18n.t("dashboard.kpi.onDuty"), guards.length, {
        status: "online",
        trend: 0.09,
        sub: i18n.t("dashboard.kpi.onDutySub", { count: guards.length + 4 }),
      }),
      kpi("stations", i18n.t("dashboard.kpi.stations"), stations.length, {
        status: "patrol",
        sub: i18n.t("dashboard.kpi.sites", { count: 6 }),
      }),
      kpi("openIncidents", i18n.t("dashboard.kpi.incidents"), 1, {
        status: "incident",
        trend: -0.33,
        sub: i18n.t("dashboard.kpi.today", { count: 2 }),
        spark: [3, 4, 2, 5, 3, 2, 1, 1],
      }),
      kpi("patrolsToday", i18n.t("dashboard.kpi.patrols"), 27, {
        status: "patrol",
        trend: 0.21,
        sub: i18n.t("dashboard.kpi.scanned"),
      }),
      kpi("coverage", i18n.t("dashboard.coverage.title"), 92, {
        unit: "%",
        status: "online",
        sub: i18n.t("dashboard.kpi.coveredOf", {
          cubiertos: guards.length,
          total: stations.length,
        }),
      }),
      kpi(
        "supervisors",
        i18n.t("dashboard.kpi.supervisors", "Supervisores"),
        SUPERVISOR_NAMES.length,
        {
          status: "online",
          sub: i18n.t("dashboard.kpi.teamOf", {
            total: 18,
            defaultValue: "equipo de {{total}}",
          }),
        },
      ),
      kpi(
        "response",
        i18n.t("dashboard.kpi.response", "Tiempo de respuesta"),
        4.2,
        {
          unit: "min",
          status: "neutral",
          trend: -0.12,
          sub: i18n.t("dashboard.kpi.monthlyAverage", "promedio mensual"),
          spark: [6.1, 5.4, 5.8, 4.9, 4.6, 4.4, 4.5, 4.2],
        },
      ),
      kpi("clients", i18n.t("dashboard.kpi.clients", "Clientes"), 14, {
        status: "neutral",
        trend: 0.16,
        sub: i18n.t("dashboard.kpi.clientsSub", {
          count: stations.length,
          defaultValue: "{{count}} puestos",
        }),
      }),
    ],
    entities: [tenant, ...clients, ...stations, ...guards],
    revenue: buildRevenue(),
    incidentsTrend,
    responseTrend,
    acquisitionTrend,
    activity: buildActivity(),
    health: {
      sseConnected: true,
      onlineDevices: guards.length + SUPERVISOR_NAMES.length,
      lastSync: new Date().toISOString(),
    },
    counts: {
      clients: 14,
      postSites: 9,
      stations: stations.length,
      guards: 18,
      team: 7,
      onDuty: guards.length,
      openIncidents: 1,
      supervisors: SUPERVISOR_NAMES.length,
    },
    loading: false,
    error: null,
    gaps: [],
  };
}

/** Static snapshot (no animation) — used where a one-shot build is enough. */
export function buildDemoData(): ControlCenterData {
  const base = buildBase();

  return { ...base, entities: [...base.entities, ...supervisorsAt(0)] };
}

/**
 * Live demo data: the static fleet + supervisors driving their routes. The
 * supervisor positions advance on an interval while `active`, so they visibly
 * move across the map.
 */
export function useDemoData(active: boolean): ControlCenterData {
  // Labels are translated when built: rebuild on a language switch.
  const { i18n: i18nVivo } = useTranslation();
  const idioma = i18nVivo.language;
  const base = useMemo(() => buildBase(idioma), [idioma]);
  const [sups, setSups] = useState<MapEntity[]>(() => supervisorsAt(0));

  useEffect(() => {
    if (!active) return;
    let step = 0;

    setSups(supervisorsAt(step));
    const id = setInterval(() => {
      step += 1;
      setSups(supervisorsAt(step));
    }, 1200);

    return () => clearInterval(id);
  }, [active, idioma]);

  return useMemo(
    () => ({ ...base, entities: [...base.entities, ...sups] }),
    [base, sups],
  );
}
