import { useCallback, useEffect, useRef, useState } from "react";
import i18n from "@/i18n";
import api, { getAuthToken } from "@/lib/api";
import { crearSocket, cerrarSocket } from "@/lib/socket";
import { openEventStream } from "@/lib/api/eventStream";
import securityGuardService from "@/lib/api/securityGuardService";
import { supervisorService } from "@/lib/api/supervisorService";
import tenantService from "@/services/tenant.service";
import { useAuth } from "@/contexts/AuthContext";
import { hasMinAuthority, AUTHORITY } from "@/lib/access";
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
/**
 * ════════════════════════════════════════════════════════════════════════════
 * UN PUESTO CERRADO NO ES UN PUESTO SIN CUBRIR
 *
 * La cobertura era `vigilantes en servicio / TODOS los puestos de la empresa`.
 * A las tres de la mañana, una empresa con 20 puestos de los que 5 operan de
 * noche mostraba 5/20 = 25 %, en rojo — estando cubierta al cien por cien. El
 * indicador que debería avisar de un puesto vacío se pasaba las noches enteras
 * en rojo, y un indicador que siempre está en rojo es uno que nadie mira.
 *
 * El denominador correcto son los puestos que DEBERÍAN estar atendidos ahora, y
 * eso lo sabe `coverage/live`: cuenta los puestos por estado, y `idle` significa
 * exactamente «ahora no toca nadie aquí».
 *
 *     cobertura = cubiertos / (cubiertos + en riesgo + sin cubrir)
 *
 * Los `idle` salen de la cuenta y se dicen aparte, para que se vea que no se han
 * perdido.
 *
 * Vive aquí fuera, y no dentro del cargador, porque el sondeo en vivo la usa
 * también: dos copias de esta regla acabarían dando dos porcentajes distintos
 * en la misma pantalla según cuál se hubiera ejecutado la última.
 *
 * Si la consulta falla o quien mira no tiene permiso de cobertura, se cae al
 * cálculo de antes. Un panel con una cifra imperfecta es mejor que uno con un
 * hueco.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function calcularCobertura(
  respuesta: any,
  onDuty: number,
  totalPuestos: number,
): { coverage: number | null; coverageSub: string } {
  const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const resumen = respuesta?.summary || respuesta?.data?.summary || null;
  const cubiertos = n(resumen?.covered);
  const enRiesgo = n(resumen?.at_risk);
  const sinCubrir = n(resumen?.uncovered);
  const fueraDeTurno = n(resumen?.idle);
  const queTocan = cubiertos + enRiesgo + sinCubrir;

  if (resumen && queTocan > 0) {
    return {
      coverage: Math.min(100, Math.round((cubiertos / queTocan) * 100)),
      coverageSub:
        i18n.t("dashboard.kpi.coveredOf", { cubiertos, total: queTocan }) +
        (fueraDeTurno > 0 ? " · " + i18n.t("dashboard.kpi.offShift", { count: fueraDeTurno }) : ""),
    };
  }
  if (resumen && fueraDeTurno > 0) {
    // Todo cerrado ahora mismo. NO es un 0 %: no hay nada que cubrir, y pintar
    // un cero rojo diría exactamente lo contrario de lo que pasa.
    return { coverage: null, coverageSub: i18n.t("dashboard.kpi.postsOffShift", { count: fueraDeTurno }) };
  }
  return {
    coverage: totalPuestos > 0 ? Math.min(100, Math.round((onDuty / totalPuestos) * 100)) : null,
    coverageSub: `${onDuty}/${totalPuestos} cubiertos`,
  };
}

export function useControlCenter(intervalSec = 15): ControlCenterData & { refresh: () => void } {
  const [state, setState] = useState<ControlCenterData>({
    kpis: [], entities: [], revenue: emptyRevenue(), incidentsTrend: [], responseTrend: [],
    acquisitionTrend: [], activity: [], health: { sseConnected: false, onlineDevices: 0, lastSync: "" },
    counts: {}, loading: true, error: null, gaps: [],
  });
  // El panel ejecutivo (/dashboard/stats) agrega facturación y la cartera de
  // clientes completa: el backend le pone un piso de DIRECCIÓN (staffTierGuard,
  // AUTHORITY.MANAGEMENT). Despachadores, vigilantes y clientes que abrían el
  // Centro de Control lo pedían igual y se comían un 403 por carga — invisible
  // aquí (lo tragaba `safe`), pero dejaba un error con traza en el log del
  // servidor cada vez. Si no alcanza el piso, ni se pide: los KPIs de esa
  // tarjeta ya tienen su camino de respaldo.
  const { user, loading: cargandoAuth } = useAuth();
  const puedeVerPanelEjecutivo = hasMinAuthority(user, AUTHORITY.MANAGEMENT, tenantId());
  const sseRef = useRef<EventSource | null>(null);
  const locSeqRef = useRef(0);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // ── primary load (stats + entities) ─────────────────────────────────────
  useEffect(() => {
    if (!tenantId()) { setState((s) => ({ ...s, loading: false, error: "no-tenant" })); return; }
    // Auth todavía resolviendo: esperar evita la segunda tanda de 14 peticiones.
    if (cargandoAuth) return;
    let alive = true;
    (async () => {
      const gaps: string[] = [];
      const [stats, active, stationsR, postsR, clientsR, guardsR, incidentsR, openIncR, usersR, tenantR, eventsR, opsR, supsR, cobR] = await Promise.all([
        puedeVerPanelEjecutivo ? safe<DashboardStats>(get("/dashboard/stats"), {}) : Promise.resolve({} as DashboardStats),
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
        // Cobertura EN VIVO, por estado. Es lo que permite que un puesto fuera
        // de turno deje de contar como puesto sin cubrir — ver el cálculo de
        // `coverage` más abajo. `summaryOnly` para traer sólo los cuatro
        // recuentos y no la ficha de cada puesto.
        safe(get("/coverage/live?summaryOnly=1"), null),
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
      const { coverage, coverageSub } = calcularCobertura(cobR, onDuty, counts.stations);
      const resumenVivo = (cobR as any)?.summary || (cobR as any)?.data?.summary || null;
      const puestosQueTocanAhora: number | null = resumenVivo
        ? num(resumenVivo.covered) + num(resumenVivo.at_risk) + num(resumenVivo.uncovered)
        : null;
      const incSpark = incidentsTrend.map((p) => p.value).slice(-8);
      const respSpark = responseTrend.map((p) => p.value).slice(-8);

      // ── KPIs (real where available; fallback flagged otherwise) ──
      const kpis: Kpi[] = [
        kpi("onDuty", i18n.t("dashboard.kpi.onDuty"), onDuty, { status: onDuty > 0 ? "online" : "offline", sub: i18n.t("dashboard.kpi.onDutySub", { count: counts.guards || onDuty }) }),
        // «Puestos activos» es el total de puestos dados de alta, no los que
        // están operando ahora — la palabra «activos» se leía como lo segundo.
        // Se dice cuántos tocan ahora mismo, que es la pregunta real.
        kpi("stations", i18n.t("dashboard.kpi.stations"), counts.stations, {
          status: "patrol",
          sub: puestosQueTocanAhora != null
            ? i18n.t("dashboard.kpi.stationsSub", { ahora: puestosQueTocanAhora, sedes: counts.postSites || 0 })
            : i18n.t("dashboard.kpi.sites", { count: counts.postSites || 0 }),
        }),
        kpi("openIncidents", i18n.t("dashboard.kpi.incidents"), openIncidents, { status: openIncidents > 0 ? "incident" : "online", sub: i18n.t("dashboard.kpi.today", { count: incidentsToday }), spark: incSpark }),
        kpi("patrolsToday", i18n.t("dashboard.kpi.patrols"), patrolsToday ?? "—", { status: (patrolsToday ?? 0) > 0 ? "patrol" : "neutral", sub: i18n.t("dashboard.kpi.scanned"), fallback: patrolsToday == null }),
        kpi("coverage", i18n.t("dashboard.coverage.title"), coverage ?? "—", { unit: coverage != null ? "%" : "", status: coverage == null ? "neutral" : coverage >= 80 ? "online" : coverage >= 50 ? "delayed" : "incident", sub: coverageSub, fallback: coverage == null }),
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
    /* ── POR QUÉ YA NO SE DEPENDE DE `puedeVerPanelEjecutivo` ────────────────
       Estaba en las dependencias por una razón real: el usuario llega de forma
       asíncrona, así que en el primer render vale `false` incluso para un
       administrador, y sin re-ejecutar el efecto quien sí tiene nivel se
       quedaba sin los KPIs ejecutivos hasta recargar.

       Pero el precio era que las CATORCE peticiones de la carga inicial se
       lanzaban DOS VECES enteras en cada apertura del panel: una con el usuario
       todavía vacío y otra al resolverse. Veintisiete peticiones donde debían
       ser catorce — y tres tandas en desarrollo, por StrictMode.

       La solución no es quitar la dependencia, que reintroduciría el fallo
       original: es no arrancar hasta que Auth haya terminado. Con
       `cargandoAuth` en la guarda, el efecto corre UNA vez y ya con el nivel
       correcto. La dependencia se queda por si el usuario cambia de verdad
       (cambio de empresa), que es el único caso en que debe rehacerse. */
  }, [tick, puedeVerPanelEjecutivo, cargandoAuth]);

  // ── live polling of on-duty guard locations ─────────────────────────────
  /* Refresca QUIÉN está en servicio y cómo va la cobertura.
     Lo llaman tres sitios —el evento `shift:punch`, la reconexión del socket y
     el reloj de respaldo— a propósito: mientras el reloj siga existiendo tiene
     que hacer EXACTAMENTE lo mismo que el evento, o las dos vías se separan y
     el tablero enseña una cosa distinta según cuál corrió última. */
  const refrescarPresencia = useCallback(async () => {
    if (!tenantId()) return;
      // Monotonic guard: a slow poll must not overwrite a newer one's positions
      // (markers were jumping backward / clocked-out guards reappearing).
      const mine = ++locSeqRef.current;
      // La cobertura viaja EN EL MISMO sondeo. Sin esto, el indicador se
      // quedaba con la foto del momento en que se abrió el panel: un puesto que
      // cerraba a las once seguía contando como puesto por cubrir hasta que
      // alguien recargaba la página — que es justo lo que se pidió arreglar.
      const [active, cobViva] = await Promise.all([
        safe(securityGuardService.activeLocations(), null as any),
        safe(get("/coverage/live?summaryOnly=1"), null),
      ]);
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
        // Se recalcula con la MISMA función que la carga inicial, para que el
        // panel no enseñe dos porcentajes distintos según cuál corrió última.
        //
        // Si el sondeo NO trajo el resumen (red, permiso, servidor), se deja el
        // indicador como está: recalcularlo con el respaldo lo haría PEOR que
        // el que ya se pintó al cargar, y un número que empeora solo cada
        // treinta segundos es peor que uno quieto.
        const hayResumen = !!((cobViva as any)?.summary || (cobViva as any)?.data?.summary);
        const { coverage, coverageSub } = calcularCobertura(cobViva, onDuty, 0);
        const kpis = !hayResumen ? s.kpis : s.kpis.map((k) =>
          k.key === "coverage"
            ? {
                ...k,
                value: coverage ?? "—",
                unit: coverage != null ? "%" : "",
                sub: coverageSub,
                fallback: coverage == null,
                status: coverage == null ? "neutral"
                  : coverage >= 80 ? "online"
                  : coverage >= 50 ? "delayed"
                  : "incident",
              }
            : k,
        ) as typeof s.kpis;
        return { ...s, kpis, entities: [...others, ...guards],
          health: { ...s.health, onlineDevices: onDuty, lastSync: new Date().toISOString() } };
      });
  }, []);

  /* ── EL RELOJ, EN RETIRADA ─────────────────────────────────────────────────
     Sigue aquí a propósito, conviviendo con el evento, hasta que se compruebe
     en producción que `shift:punch` llega SIEMPRE —desde los dos workers de
     PM2, y tras una desconexión real de las de modo avión—. Quitarlo antes de
     esa prueba cambiaría un tablero que gasta de más por uno que miente, que es
     mucho peor. Cuando la prueba pase, esto se borra entero: la recuperación
     vive en `socket.on("connect")`, no aquí. */
  useEffect(() => {
    if (!tenantId()) return;
    let iv: ReturnType<typeof setInterval> | null = null;
    /* Nadie mira un tablero que no está en pantalla. Y no basta con confiar en
       el navegador: Chrome NO estrangula las pestañas con websocket abierto, y
       el CRM tiene varios — o sea que sin esta guarda el reloj seguía a ritmo
       completo toda la noche. Al volver se refresca de golpe. */
    const visible = () => document.visibilityState !== "hidden";
    const arrancar = () => { if (!iv && visible()) iv = setInterval(() => { void refrescarPresencia(); }, Math.max(5, intervalSec) * 1000); };
    const parar = () => { if (iv) { clearInterval(iv); iv = null; } };
    const alCambiar = () => { if (visible()) { void refrescarPresencia(); arrancar(); } else parar(); };
    arrancar();
    document.addEventListener("visibilitychange", alCambiar);
    return () => { parar(); document.removeEventListener("visibilitychange", alCambiar); };
  }, [intervalSec, refrescarPresencia]);

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
        /* ── TRES COSAS QUE ESTE MANEJADOR HACÍA MAL ─────────────────────────
           Corre por CADA ping de CADA vigilante: con 1000 en movimiento son 33
           veces por segundo. Lo que costaba cada una:

            1. REORDENABA. `filter` + poner al final movía la entidad
               actualizada al fondo del array, así que el ORDEN cambiaba en cada
               ping. Eso invalida cualquier `useMemo` de aguas abajo aunque el
               contenido sea idéntico — y aguas abajo está `calcularCobertura`,
               que es O(puestos × personas) con haversine por par.
            2. RE-RENDERIZABA POR PINGS QUE NO IMPORTAN. Un ping de alguien que
               ya no está en el mapa (fichó salida) creaba estado nuevo igual.
            3. RE-RENDERIZABA SIN CAMBIOS. Un vigilante parado manda su posición
               cada cinco minutos, idéntica, y el tablero entero se repintaba.

           Ahora: se sustituye EN SITIO (el orden no cambia), se ignora lo que no
           está en el mapa, y si la coordenada es la misma se devuelve el estado
           TAL CUAL — React no re-renderiza cuando la identidad no cambia. El
           patrón se copia de `LiveTracking.tsx`, que ya lo hacía bien. */
        const idx = s.entities.findIndex((x) => x.id === String(e.id));
        if (idx < 0) return s;
        const previa = s.entities[idx];
        if (previa.lat === la && previa.lng === ln) return s;
        const others = s.entities;
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
        const siguientes = others.slice();
        siguientes[idx] = entity;
        return { ...s, entities: siguientes };
      });
    };
    /* La sala del mapa se PIDE. `location:update` ya no llega por rol: sin esta
       línea el chorro de posiciones no entra — y ése es el objetivo, que sólo lo
       reciba quien está pintando un mapa. Se pide en cada `connect` porque tras
       una reconexión la pertenencia a salas se rehace desde cero. */
    const pedirMapa = () => socket.emit("map:subscribe");
    pedirMapa();
    socket.on("connect", pedirMapa);
    socket.on("location:update", onLocation);

    /* ── FICHAJES: EL AVISO QUE SUSTITUYE AL RELOJ DE 15 s ──────────────────
       `active-locations` hace DOS trabajos: dice dónde está la gente y dice
       quién está en servicio. El movimiento ya llegaba por `location:update`;
       lo que no tenía evento era el fichaje, así que la única forma de saber
       que alguien entró a trabajar era volver a pedir la lista entera cada 15
       segundos. Ése —y no la ubicación— era el motivo del sondeo.

       El evento trae ids, no filas: se reconsulta con el endpoint de siempre,
       que aplica el permiso fino por puesto. Ver el backend en
       services/realtime/shiftPunchEvent.ts. */
    const onPunch = () => { void refrescarPresencia(); };
    socket.on("shift:punch", onPunch);

    /* Cobertura: el otro motivo por el que este panel sondeaba cada 15 s.
       `refrescarPresencia` pide las dos cosas en la misma tanda —vigilantes en
       servicio y resumen de cobertura— así que el mismo manejador vale para los
       dos eventos. El servidor ya agrupa las ráfagas de planificación, de modo
       que una carga de vacaciones llega como un aviso, no como cuarenta. */
    socket.on("coverage:changed", onPunch);

    /* ── LA RECUPERACIÓN VA EN LA RECONEXIÓN, NO EN UN RELOJ ────────────────
       Un websocket entrega lo que pasa MIENTRAS escuchas. No puede contarte lo
       que pasó mientras el portátil dormía, el wifi saltaba o PM2 reciclaba un
       worker: los eventos son un flujo, no un estado. Ése es el único trabajo
       que hacía de verdad el sondeo.

       Pero el disparador correcto es volver a estar conectado, no que hayan
       pasado N segundos. Y se pide el ESTADO ACTUAL en vez de reproducir los
       fichajes perdidos: reconstruir «quién está en servicio» a partir de una
       secuencia de avisos es más frágil y más caro que preguntarlo — si se
       pierde uno o llegan desordenados, el estado reconstruido queda mal para
       siempre; el estado preguntado de nuevo siempre es correcto.

       socket.io reconecta solo; este manejador corre en cada `connect`,
       incluidos los que siguen a una caída. */
    socket.on("connect", onPunch);

    return () => {
      socket.emit("map:unsubscribe");
      socket.off("connect", pedirMapa);
      socket.off("location:update", onLocation);
      socket.off("shift:punch", onPunch);
      socket.off("coverage:changed", onPunch);
      socket.off("connect", onPunch);
      cerrarSocket(socket);
    };
  }, [refrescarPresencia]);

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
