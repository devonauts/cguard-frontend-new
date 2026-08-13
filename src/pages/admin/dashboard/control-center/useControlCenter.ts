import { useCallback, useEffect, useRef, useState } from "react";
import api, { getAuthToken } from "@/lib/api";
import { crearSocket, cerrarSocket } from "@/lib/socket";
import { openEventStream } from "@/lib/api/eventStream";
import securityGuardService from "@/lib/api/securityGuardService";
import { supervisorService } from "@/lib/api/supervisorService";
import tenantService from "@/services/tenant.service";
import { resolveDefaultCenter, companyCenter } from "./defaultCenter";
import type {
  ControlCenterData, DashboardStats, Kpi, MapEntity, MapEntityMeta, MonthPoint,
  RevenueSeries, ActivityItem, LiveStatus,
} from "./types";

const tenantId = () => localStorage.getItem("tenantId") || "";
// ── loosely-typed rows returned by the dashboard/stats + list endpoints ──
interface StationRow {
  id?: string | number;
  latitud?: number | string; latitude?: number | string;
  longitud?: number | string; longitude?: number | string;
  stationName?: string; name?: string; postSiteName?: string;
  geofenceRadius?: number;
  /** JSON con [{lat,lng}] cuando el puesto tiene geocerca poligonal. */
  geofencePolygon?: unknown;
  isMobile?: boolean;
  address?: string;
  postSiteId?: string;
  postSite?: { id?: string; businessName?: string } | null;
  /** Alias de la asociación con el cliente en el listado de puestos. */
  stationOrigin?: { id?: string; name?: string; commercialName?: string } | null;
  guardsCount?: number; assignedGuardsCount?: number;
}
interface PostSiteRow {
  id?: string | number;
  companyName?: string; businessName?: string; name?: string;
  latitud?: number | string; longitud?: number | string;
  address?: string; city?: string; contactPhone?: string;
  clientAccountId?: string;
  active?: boolean;
}
interface ClientRow {
  id?: string | number;
  name?: string; commercialName?: string;
  latitude?: number | string; longitude?: number | string;
  address?: string; city?: string; phoneNumber?: string; landline?: string;
  riskLevel?: string; active?: boolean;
}
interface ActiveGuardRow {
  id?: string | number; guardId?: string | number; userId?: string | number;
  latitude?: number | string; lat?: number | string; punchInLatitude?: number | string;
  longitude?: number | string; lng?: number | string; punchInLongitude?: number | string;
  fullName?: string; name?: string; postSiteName?: string; stationName?: string;
  punchInTime?: string;
  // Telemetría: el endpoint devuelve hoy sólo posición + `punchInTime`. Estos
  // campos EXISTEN en `guardShifts` (liveBattery/liveSpeed/liveAccuracy) y se
  // leen aquí para que aparezcan solos el día que el listado los exponga; sin
  // ellos el globo simplemente no pinta esas filas.
  punchInBattery?: number; liveBattery?: number; battery?: number;
  liveSpeed?: number; speed?: number;
  liveAccuracy?: number; accuracy?: number;
  liveLocationAt?: string; lastSeenAt?: string;
}
interface IncidentRow {
  id?: string | number; status?: string; severity?: string; priority?: string;
  title?: string; subject?: string; location?: string; stationName?: string;
  latitude?: number | string; longitude?: number | string;
  incidentAt?: string; createdAt?: string;
}
interface UserRow {
  roles?: string[]; role?: string[] | string;
  tenants?: Array<{ roles?: string[] }>;
}
interface EventRow {
  id?: string | number; eventType?: string; type?: string;
  payload?: { stationName?: string; siteName?: string; guardName?: string; visitorName?: string; [k: string]: unknown };
  title?: string; body?: string; createdAt?: string; severity?: string;
  sourceEntityType?: string; sourceEntityId?: string | number;
}
interface LocationUpdate {
  id?: string | number; lat?: number | string; lng?: number | string;
  kind?: string; status?: LiveStatus; label?: string; sub?: string;
  meta?: MapEntityMeta;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const count = (r: unknown): number => {
  if (!r) return 0;
  if (Array.isArray(r)) return r.length;
  const o = r as { total?: number; count?: number; rows?: unknown[] };
  return o.total ?? o.count ?? (Array.isArray(o.rows) ? o.rows.length : 0);
};
const rows = (r: unknown): unknown[] => {
  if (Array.isArray(r)) return r;
  const o = r as { rows?: unknown[]; data?: unknown[] } | null | undefined;
  return o?.rows ?? o?.data ?? [];
};
const coord = (v: unknown): number | null => { const n = parseFloat(v as string); return Number.isFinite(n) ? n : null; };
const texto = (v: unknown): string | undefined => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s || undefined;
};
const entero = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};
/** `geofencePolygon` viaja como TEXT en la base y como array ya parseado según
 *  el camino; se acepta cualquiera de los dos y se descarta lo que no sea un
 *  polígono de verdad (menos de 3 vértices no encierra nada). */
const poligono = (v: unknown): Array<{ lat: number; lng: number }> | undefined => {
  let bruto: unknown = v;
  if (typeof bruto === "string") { try { bruto = JSON.parse(bruto); } catch { return undefined; } }
  if (!Array.isArray(bruto)) return undefined;
  const puntos = bruto
    .map((p) => {
      const la = coord((p as any)?.lat ?? (p as any)?.latitude);
      const ln = coord((p as any)?.lng ?? (p as any)?.longitude);
      return la != null && ln != null ? { lat: la, lng: ln } : null;
    })
    .filter((p): p is { lat: number; lng: number } => !!p);
  return puntos.length >= 3 ? puntos : undefined;
};
const sameDay = (iso?: string): boolean => {
  if (!iso) return false;
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return false;
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

/**
 * Los datos de un vigilante en servicio, en el MISMO formato tanto en la carga
 * inicial como en el sondeo de posiciones. Estaban duplicados y divergían: el
 * sondeo perdía la hora de entrada, así que a los 15 s el globo dejaba de saber
 * desde cuándo estaba el vigilante en el puesto.
 */
function guardMeta(g: ActiveGuardRow): MapEntity["meta"] {
  return {
    entityId: texto(g.guardId ?? g.id),
    userId: texto(g.userId),
    punchInTime: texto(g.punchInTime),
    lastSeenAt: texto(g.liveLocationAt ?? g.lastSeenAt ?? g.punchInTime),
    battery: entero(g.liveBattery ?? g.battery ?? g.punchInBattery),
    speed: entero(g.liveSpeed ?? g.speed),
    accuracy: entero(g.liveAccuracy ?? g.accuracy),
    stationName: texto(g.postSiteName ?? g.stationName),
  };
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}
const get = (path: string) => api.get(`/tenant/${tenantId()}${path}`).then((r) => r.data);

/** Single hook that powers the whole Control Center. Wires the real backend
 *  endpoints discovered in the audit; documents gaps via `gaps[]` and marks
 *  any fallback KPI with `fallback: true` instead of inventing data. */
export function useControlCenter(intervalSec = 15): ControlCenterData & { refresh: () => void } {
  const [state, setState] = useState<ControlCenterData>({
    kpis: [], entities: [], revenue: emptyRevenue(), incidentsTrend: [], responseTrend: [],
    acquisitionTrend: [], activity: [], health: { sseConnected: false, onlineDevices: 0, lastSync: "" },
    counts: {}, loading: true, error: null, gaps: [],
  });
  const sseRef = useRef<EventSource | null>(null);
  const locSeqRef = useRef(0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // ── primary load (stats + entities) ─────────────────────────────────────
  useEffect(() => {
    if (!tenantId()) { setState((s) => ({ ...s, loading: false, error: "no-tenant" })); return; }
    let alive = true;
    (async () => {
      const gaps: string[] = [];
      const [stats, active, stationsR, postsR, clientsR, guardsR, incidentsR, openIncR, usersR, tenantR, eventsR, opsR, supsR] = await Promise.all([
        safe<DashboardStats>(get("/dashboard/stats"), {}),
        safe(securityGuardService.activeLocations(), null as any),
        safe(get("/station?limit=500"), null),
        safe(get("/post-site?limit=500"), null),
        safe(get("/client-account?limit=500"), null),
        safe(get("/security-guard?limit=1"), null),
        safe(get("/incident?limit=50&orderBy=createdAt_DESC"), null),
        // Server-side OPEN count — counting client-side inside the latest 50
        // undercounted tenants with older open incidents.
        safe(get("/incident?limit=1&filter[status]=abierto"), null),
        safe(get("/user"), null),
        safe(tenantService.findById(tenantId()), null as any),
        // Recent platform events (clock-ins, visitors, patrols, incidents, memos…) —
        // this is the real "Actividad reciente". NOTE: the events route is
        // /:tenantId/events (no /tenant/ prefix), so it bypasses the get() helper.
        safe(api.get(`/${tenantId()}/events?limit=40`).then((r) => r.data), null),
        // Operational "today" counters (incidents today, rondas/tag-scans today) —
        // computed server-side with correct day boundaries. Route has no /tenant/ prefix.
        safe(api.get(`/operations/kpis`).then((r) => r.data), null),
        // On-duty supervisors with a live position — so a clocked-in supervisor
        // shows on the map immediately (not only when a socket ping happens to
        // land while the map is open). Mirrors the guard activeLocations feed.
        safe(supervisorService.list(), null as any),
      ]);
      if (!alive) return;

      const stationRows = rows(stationsR) as StationRow[];
      const postRows = rows(postsR) as PostSiteRow[];
      const clientRows = rows(clientsR) as ClientRow[];
      const activeRows = rows(active) as ActiveGuardRow[];
      const incidentRows = rows(incidentsR) as IncidentRow[];
      const userRows = rows(usersR) as UserRow[];

      // ── live entities for the map ──
      const entities: MapEntity[] = [];
      const tenant = tenantR?.data ?? tenantR ?? null;
      const tLat = coord(tenant?.latitude), tLng = coord(tenant?.longitude);
      if (tLat != null && tLng != null) {
        entities.push({ id: "tenant", kind: "tenant", lat: tLat, lng: tLng, status: "online",
          label: tenant?.name || "Sede central", sub: tenant?.address || "Oficina principal",
          meta: { address: texto(tenant?.address), phone: texto(tenant?.phoneNumber ?? tenant?.phone) } });
      } else gaps.push("Tenant sin coordenadas (latitude/longitude) — pin de sede oculto.");

      // Cuántos PUESTOS cuelgan de cada cliente — la cifra que el globo del
      // cliente enseña sin tener que pedir nada más.
      const puestosPorCliente = new Map<string, number>();

      stationRows.forEach((s: StationRow) => {
        const la = coord(s.latitud ?? s.latitude), ln = coord(s.longitud ?? s.longitude);
        const clienteId = texto(s.stationOrigin?.id);
        if (clienteId) puestosPorCliente.set(clienteId, (puestosPorCliente.get(clienteId) || 0) + 1);
        if (la == null || ln == null) return;
        const sitio = texto(s.postSite?.businessName ?? s.postSiteName);
        const cliente = texto(s.stationOrigin?.commercialName ?? s.stationOrigin?.name);
        entities.push({
          id: `st-${s.id}`, kind: "station", lat: la, lng: ln, status: "online",
          label: s.stationName || s.name || "Puesto",
          sub: cliente || sitio || "",
          meta: {
            entityId: texto(s.id),
            geofenceRadius: entero(s.geofenceRadius),
            geofencePolygon: poligono(s.geofencePolygon),
            isMobile: !!s.isMobile,
            postSiteId: texto(s.postSiteId ?? s.postSite?.id),
            postSiteName: sitio,
            clientId: clienteId,
            clientName: cliente,
            address: texto(s.address),
            guardsCount: entero(s.guardsCount ?? s.assignedGuardsCount),
          },
        });
      });

      // ── CLIENTES: sus SEDES sobre el terreno ──────────────────────────────
      // Un cliente no es un punto abstracto: es donde están sus instalaciones.
      // Primero sus sedes (post-sites con coordenadas) y, si no tiene ninguna
      // ubicada, la dirección del propio cliente — así no desaparece del mapa.
      // Ambas listas YA se piden arriba para las cifras: cero peticiones nuevas.
      const clientePorId = new Map<string, ClientRow>();
      clientRows.forEach((c) => { const id = texto(c.id); if (id) clientePorId.set(id, c); });
      const clientesUbicados = new Set<string>();

      postRows.forEach((p: PostSiteRow) => {
        const la = coord(p.latitud), ln = coord(p.longitud);
        if (la == null || ln == null) return;
        const clienteId = texto(p.clientAccountId);
        const cliente = clienteId ? clientePorId.get(clienteId) : undefined;
        const nombreCliente = texto(cliente?.commercialName ?? cliente?.name);
        if (clienteId) clientesUbicados.add(clienteId);
        entities.push({
          id: `cl-${p.id}`, kind: "client", lat: la, lng: ln, status: "online",
          label: texto(p.companyName ?? p.businessName ?? p.name) || "Sede",
          sub: nombreCliente || "Sede del cliente",
          meta: {
            entityId: texto(p.id),
            clientId: clienteId,
            clientName: nombreCliente,
            address: texto(p.address),
            city: texto(p.city),
            phone: texto(p.contactPhone ?? cliente?.phoneNumber ?? cliente?.landline),
            riskLevel: texto(cliente?.riskLevel),
            stationsCount: clienteId ? puestosPorCliente.get(clienteId) : undefined,
          },
        });
      });

      clientRows.forEach((c: ClientRow) => {
        const id = texto(c.id);
        if (!id || clientesUbicados.has(id)) return;
        const la = coord(c.latitude), ln = coord(c.longitude);
        if (la == null || ln == null) return;
        entities.push({
          id: `cl-acc-${id}`, kind: "client", lat: la, lng: ln, status: "online",
          label: texto(c.commercialName ?? c.name) || "Cliente",
          sub: texto(c.city) || "Cliente",
          meta: {
            entityId: id, clientId: id, clientName: texto(c.commercialName ?? c.name),
            address: texto(c.address), city: texto(c.city),
            phone: texto(c.phoneNumber ?? c.landline), riskLevel: texto(c.riskLevel),
            stationsCount: puestosPorCliente.get(id),
          },
        });
      });

      // ── Incidentes ABIERTOS con coordenadas ───────────────────────────────
      // Salen de la misma lista que ya alimenta las cifras y el parte de
      // novedades. Sólo los abiertos: un incidente cerrado en el mapa es ruido,
      // y además cuentan para marcar «en riesgo» el puesto que los rodea.
      incidentRows.forEach((i: IncidentRow) => {
        if (String(i.status || "").toLowerCase() !== "abierto") return;
        const la = coord(i.latitude), ln = coord(i.longitude);
        if (la == null || ln == null) return;
        const critico = ["critica", "crítica", "alta", "critical", "high"]
          .includes(String(i.severity ?? i.priority ?? "").toLowerCase());
        entities.push({
          id: `inc-${i.id}`, kind: "incident", lat: la, lng: ln,
          status: critico ? "emergency" : "incident",
          label: texto(i.title ?? i.subject) || "Incidente",
          sub: texto(i.location ?? i.stationName) || "",
          meta: {
            entityId: texto(i.id),
            address: texto(i.location),
            lastSeenAt: texto(i.incidentAt ?? i.createdAt),
          },
        });
      });

      let onDuty = 0;
      activeRows.forEach((g: ActiveGuardRow) => {
        const la = coord(g.latitude ?? g.lat ?? g.punchInLatitude), ln = coord(g.longitude ?? g.lng ?? g.punchInLongitude);
        onDuty++;
        if (la == null || ln == null) return;
        entities.push({ id: `g-${g.guardId || g.id}`, kind: "guard", lat: la, lng: ln, status: "online",
          label: g.fullName || g.name || "Vigilante", sub: g.postSiteName || g.stationName || "En servicio",
          meta: guardMeta(g) });
      });

      // Supervisores en servicio con posición (profile lat/lng, sembrada al fichar
      // y refrescada por el ping del app). Mismo id `sup-<userId>` que el emit
      // realtime, así el location:update solo mueve el marcador, no lo duplica.
      const supRows = rows(supsR) as any[];
      supRows.forEach((sup: any) => {
        if (!sup || !(sup.isOnDuty ?? sup.onDuty)) return;
        const la = coord(sup.latitude ?? sup.lat), ln = coord(sup.longitude ?? sup.lng);
        if (la == null || ln == null) return;
        entities.push({ id: `sup-${sup.id}`, kind: "supervisor", lat: la, lng: ln, status: "patrol",
          label: sup.fullName || "Supervisor", sub: texto(sup.zone) || "En patrulla",
          meta: {
            entityId: texto(sup.id), userId: texto(sup.id),
            phone: texto(sup.phoneNumber), zone: texto(sup.zone),
            vehicle: texto(sup.assignedVehicle), photoUrl: texto(sup.photoUrl),
            onDutySince: texto(sup.onDutySince),
            dutyLateMinutes: entero(sup.dutyLateMinutes),
          } });
      });

      // ── revenue from /dashboard/stats (billing.montoPorPagar by month) ──
      const revPoints: MonthPoint[] = (stats.revenue || []).map((r) => ({ month: r.month, value: num(r.revenue) }));
      const revTotal = revPoints.reduce((a, b) => a + b.value, 0);
      const revenue: RevenueSeries = {
        points: revPoints, total: revTotal,
        paid: 0, pending: 0, currency: "USD", hasData: revPoints.some((p) => p.value > 0),
      };
      if (!revenue.hasData) gaps.push("Sin datos de facturación (billing) — sección de ingresos en estado vacío.");
      // paid/pending split: no aggregation endpoint — leave 0 + documented gap
      gaps.push("No existe endpoint de desglose pagado/pendiente; se requiere /revenue/summary.");

      const incidentsTrend: MonthPoint[] = (stats.securityPerformance || []).map((m) => ({ month: m.month?.slice(0, 3), value: num(m.incidents) }));
      const responseTrend: MonthPoint[] = (stats.securityPerformance || []).map((m) => ({ month: m.month?.slice(0, 3), value: num(m.responseTime) }));
      const acquisitionTrend: MonthPoint[] = (stats.clientAcquisition || []).map((m) => ({ month: m.month, value: num(m.count) }));

      // ── counts ──
      const openFromApi = count(openIncR);
      const openIncidents = openFromApi || incidentRows.filter((i: IncidentRow) => (i.status || "").toLowerCase() === "abierto").length;
      // Only REAL security supervisors — the old match also counted
      // dispatchers/ops managers and disagreed with /supervisors.
      const supervisors = userRows.filter((u: UserRow) => {
        const roles = ([] as string[]).concat(u.roles || u.role || [], ...((u.tenants || []).map((t) => t.roles || [])));
        return roles.map((r) => String(r).toLowerCase()).some((r: string) => r === "securitysupervisor");
      }).length;
      const counts = {
        clients: count(clientsR), postSites: postRows.length || count(postsR),
        stations: stationRows.length || count(stationsR), guards: count(guardsR),
        team: userRows.length, onDuty, openIncidents, supervisors,
      };

      const lastResponse = responseTrend.length ? responseTrend[responseTrend.length - 1].value : null;

      // Server-computed operational "today" counters (correct day boundaries).
      const opsBy: Record<string, number> = {};
      for (const r of (rows(opsR) as Array<{ id?: string; value?: string | number }>)) {
        if (r && r.id != null) opsBy[String(r.id)] = num(r.value);
      }
      const incidentsToday = opsBy.incidents ?? incidentRows.filter((i) => sameDay(i.incidentAt || i.createdAt)).length;
      const patrolsToday = opsBy.rondas ?? null;
      // Coverage: on-duty guards vs. active posts — a real, at-a-glance operational health metric.
      const coverage = counts.stations > 0 ? Math.min(100, Math.round((onDuty / counts.stations) * 100)) : null;
      const incSpark = incidentsTrend.map((p) => p.value).slice(-8);
      const respSpark = responseTrend.map((p) => p.value).slice(-8);

      // ── KPIs (real where available; fallback flagged otherwise) ──
      const kpis: Kpi[] = [
        kpi("onDuty", "Vigilantes en servicio", onDuty, { status: onDuty > 0 ? "online" : "offline", sub: `de ${counts.guards || onDuty} vigilantes` }),
        kpi("stations", "Puestos activos", counts.stations, { status: "patrol", sub: `${counts.postSites || 0} sedes` }),
        kpi("openIncidents", "Incidentes abiertos", openIncidents, { status: openIncidents > 0 ? "incident" : "online", sub: `${incidentsToday} hoy`, spark: incSpark }),
        kpi("patrolsToday", "Rondas hoy", patrolsToday ?? "—", { status: (patrolsToday ?? 0) > 0 ? "patrol" : "neutral", sub: "puntos escaneados", fallback: patrolsToday == null }),
        kpi("coverage", "Cobertura de puestos", coverage ?? "—", { unit: coverage != null ? "%" : "", status: coverage == null ? "neutral" : coverage >= 80 ? "online" : coverage >= 50 ? "delayed" : "incident", sub: `${onDuty}/${counts.stations} cubiertos`, fallback: coverage == null }),
        kpi("supervisors", "Supervisores", supervisors, { status: "online", sub: `equipo de ${counts.team || 0}`, hint: "Estado en línea no disponible en backend.", fallback: supervisors === 0 }),
        kpi("response", "Tiempo de respuesta", lastResponse ?? "—", { unit: lastResponse != null ? "min" : "", status: "neutral", trend: trendOf(responseTrend, true), spark: respSpark, sub: "promedio mensual", fallback: lastResponse == null, hint: lastResponse == null ? "Sin datos de desempeño." : undefined }),
        kpi("clients", "Clientes", counts.clients, { status: "neutral", sub: `${counts.stations} puestos` }),
      ];

      // Primary feed: recent platform events (the rich activity stream). Falls back
      // to incidents only when there are no events yet.
      const eventRows = rows(eventsR) as EventRow[];
      const eventActivity: ActivityItem[] = eventRows.map((e: EventRow) => {
        const type = String(e.eventType || e.type || "");
        const p: NonNullable<EventRow["payload"]> = e.payload || {};
        return {
          id: `ev-${e.id}`,
          kind: mapEventKind(type),
          title: e.title || e.body || type || "Evento",
          sub: e.body || p.stationName || p.siteName || p.guardName || p.visitorName || "",
          at: e.createdAt || new Date().toISOString(),
          status: (e.severity === "critical" || type.toLowerCase().includes("panic")) ? "emergency" : "online",
          to: e.sourceEntityType === "incident" && e.sourceEntityId ? `/reports/incident/${e.sourceEntityId}` : undefined,
        } as ActivityItem;
      });
      const incidentActivity: ActivityItem[] = incidentRows.slice(0, 8).map((i: IncidentRow) => ({
        id: `inc-${i.id}`, kind: "incident",
        title: i.title || i.subject || "Incidente",
        sub: i.location || i.stationName || "",
        at: i.incidentAt || i.createdAt || new Date().toISOString(),
        status: (i.status || "").toLowerCase() === "abierto" ? "incident" : "online",
        to: i.id ? `/reports/incident/${i.id}` : undefined,
      }));
      const activity: ActivityItem[] = (eventActivity.length ? eventActivity : incidentActivity)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 30);

      setState((s) => ({
        ...s, kpis, entities, revenue, incidentsTrend, responseTrend, acquisitionTrend,
        activity, counts, loading: false, error: null, gaps: dedupe(gaps),
        // Instant company-coordinate center; the async resolve below fills in the
        // address-geocode / IP-country fallback when the company has no coords.
        defaultCenter: companyCenter(tenant) ?? s.defaultCenter,
        health: { ...s.health, onlineDevices: onDuty, lastSync: new Date().toISOString() },
      }));

      // Default map center: company coords → company address → IP country → fallback.
      resolveDefaultCenter(tenant)
        .then((center) => { if (alive) setState((s) => ({ ...s, defaultCenter: center })); })
        .catch(() => { /* never blocks the dashboard */ });
    })();
    return () => { alive = false; };
  }, [tick]);

  // ── live polling of on-duty guard locations ─────────────────────────────
  useEffect(() => {
    if (!tenantId()) return;
    const iv = setInterval(async () => {
      // Monotonic guard: a slow poll must not overwrite a newer one's positions
      // (markers were jumping backward / clocked-out guards reappearing).
      const mine = ++locSeqRef.current;
      const active = await safe(securityGuardService.activeLocations(), null as any);
      if (mine !== locSeqRef.current) return;
      const activeRows = rows(active) as ActiveGuardRow[];
      setState((s) => {
        const others = s.entities.filter((e) => e.kind !== "guard");
        const guards: MapEntity[] = [];
        let onDuty = 0;
        activeRows.forEach((g: ActiveGuardRow) => {
          onDuty++;
          const la = coord(g.latitude ?? g.punchInLatitude), ln = coord(g.longitude ?? g.punchInLongitude);
          if (la == null || ln == null) return;
          guards.push({ id: `g-${g.guardId || g.id}`, kind: "guard", lat: la, lng: ln, status: "online",
            label: g.fullName || "Vigilante", sub: g.postSiteName || g.stationName || "En servicio",
            meta: guardMeta(g) });
        });
        return { ...s, entities: [...others, ...guards],
          health: { ...s.health, onlineDevices: onDuty, lastSync: new Date().toISOString() } };
      });
    }, Math.max(5, intervalSec) * 1000);
    return () => clearInterval(iv);
  }, [intervalSec]);

  // ── SSE live event feed (real-time layer the backend already exposes) ────
  useEffect(() => {
    if (!tenantId()) return;
    // Shared helper centralizes the token-in-URL setup (see eventStream.ts security note).
    const es = openEventStream(tenantId());
    if (!es) return; // SSE unsupported — polling above still drives the map
    sseRef.current = es;
    es.onopen = () => setState((s) => ({ ...s, health: { ...s.health, sseConnected: true } }));
    es.onerror = () => setState((s) => ({ ...s, health: { ...s.health, sseConnected: false } }));
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        const item: ActivityItem = {
          id: data.id || `ev-${Date.now()}`, kind: mapEventKind(data.type),
          title: data.title || data.message || data.type || "Evento",
          sub: data.subtitle || data.stationName || "", at: data.createdAt || new Date().toISOString(),
          status: data.severity === "critical" ? "emergency" : "online",
        };
        setState((s) => ({ ...s, activity: [item, ...s.activity].slice(0, 30) }));
      } catch { /* heartbeat / non-JSON */ }
    };
    return () => { es.close(); sseRef.current = null; };
  }, []);

  // ── live positions over socket.io (location:update) ──────────────────────
  // Real-time moving markers (e.g. a supervisor's vehicle on patrol). The
  // backend emits `location:update` to the tenant room; we upsert the marker by
  // id. Purely additive — when no event fires, the map is unchanged. Non-guard
  // entities survive the 15s guard poll, so a moving supervisor isn't wiped.
  useEffect(() => {
    const tid = tenantId();
    if (!tid) return;
    const socket = crearSocket(getAuthToken() || "", tid);
    const onLocation = (e: LocationUpdate) => {
      const la = coord(e?.lat), ln = coord(e?.lng);
      if (la == null || ln == null || !e?.id) return;
      setState((s) => {
        const others = s.entities.filter((x) => x.id !== String(e.id));
        const previa = s.entities.find((x) => x.id === String(e.id));
        const entity: MapEntity = {
          id: String(e.id),
          kind: (e.kind as MapEntity["kind"]) || "supervisor",
          lat: la, lng: ln,
          status: e.status || "patrol",
          label: e.label || "Supervisor",
          sub: e.sub || "Patrulla",
          // Se conserva lo que ya se sabía (teléfono, zona, vehículo: el emit de
          // posición no los repite) y se SELLA la hora: esta coordenada acaba de
          // llegar por el socket, así que su marca de tiempo es AHORA. De ahí
          // sale el latido del mapa, que sólo late con señal fresca de verdad.
          meta: { ...previa?.meta, ...e.meta, lastSeenAt: new Date().toISOString() },
        };
        return { ...s, entities: [...others, entity] };
      });
    };
    socket.on("location:update", onLocation);
    return () => { socket.off("location:update", onLocation); cerrarSocket(socket); };
  }, []);

  return { ...state, refresh };
}

function kpi(key: string, label: string, value: number | string, extra: Partial<Kpi> = {}): Kpi {
  return { key, label, value, status: "neutral", trend: null, ...extra };
}
function trendOf(points: MonthPoint[], inverse = false): number | null {
  if (points.length < 2) return null;
  const a = points[points.length - 2].value, b = points[points.length - 1].value;
  if (a === 0) return null;
  const t = (b - a) / Math.abs(a);
  return inverse ? -t : t;
}
function mapEventKind(type?: string): ActivityItem["kind"] {
  const t = (type || "").toLowerCase();
  if (t.includes("incident")) return "incident";
  if (t.includes("alert") || t.includes("panic") || t.includes("emergency")) return "alert";
  if (t.includes("tour") || t.includes("patrol") || t.includes("ronda")) return "patrol";
  if (t.includes("clock") || t.includes("check") || t.includes("attendance") || t.includes("guard.")) return "checkin";
  return "event"; // visitors, memos, tasks, etc.
}
function emptyRevenue(): RevenueSeries { return { points: [], total: 0, paid: 0, pending: 0, currency: "USD", hasData: false }; }
function dedupe(a: string[]) { return Array.from(new Set(a)); }
