import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Modal, Field, StatusBadge, SkeletonBlock, EmptyState } from '@/components/kit';
import { Route, MapPin, Pencil } from 'lucide-react';
import RouteMap, { type RouteMapStop } from './RouteMap';
import { InsigniaOptimizada, PanelAhorro } from './OptimizacionPanel';
import { aCoord, leerAhorro, leerExtremo } from './routeOptimizacion';
import routeService from '@/lib/api/routeService';
import userService from '@/lib/api/userService';
import vehicleService from '@/lib/api/vehicleService';
import { postSiteService } from '@/lib/api/postSiteService';
import { useNavigate } from 'react-router-dom';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routeId: string | null;
};

interface RoutePoint {
  id?: string;
  siteId?: string;
  postSiteId?: string;
  siteName?: string;
  address?: string;
  scheduledHits?: number;
  duration?: number;
  /** El orden del recorrido. Es lo que decide qué parada es la número 1. */
  order?: number;
  lat?: number | string | null;
  lng?: number | string | null;
}

interface RouteType {
  id?: string;
  name?: string;
  continuous?: boolean;
  days?: string[];
  assignedGuard?: string | { firstName?: string; lastName?: string; email?: string; id?: string } | null;
  guard?: any;
  assignedTo?: any;
  vehicle?: string | { name?: string; licensePlate?: string; id?: string } | null;
  vehicleId?: string;
  supervisorId?: string;
  completed?: boolean;
  active?: boolean;
  windowStart?: string;
  windowEnd?: string;
  startTime?: string;
  endTime?: string;
  points?: RoutePoint[];
  status?: string;
  /* ── Recorrido: extremos opcionales y estado de la optimización ────────── */
  originLat?: number | string | null;
  originLng?: number | string | null;
  originLabel?: string | null;
  destinationLat?: number | string | null;
  destinationLng?: number | string | null;
  destinationLabel?: string | null;
  optimized?: boolean | null;
  optimizedAt?: string | null;
  optimizedMeta?: unknown;
  roadPolyline?: string | null;
}

/** Constante de módulo: guarda la CLAVE, no la etiqueta. Traducir aquí
 *  congelaría el idioma de arranque; el español queda de valor por defecto y
 *  se resuelve al pintar, dentro del componente. */
const DAY_LABEL: Record<string, { clave: string; etiqueta: string }> = {
  sun: { clave: 'siteTour.options.sunday', etiqueta: 'Domingo' },
  mon: { clave: 'siteTour.options.monday', etiqueta: 'Lunes' },
  tue: { clave: 'siteTour.options.tuesday', etiqueta: 'Martes' },
  wed: { clave: 'siteTour.options.wednesday', etiqueta: 'Miércoles' },
  thu: { clave: 'siteTour.options.thursday', etiqueta: 'Jueves' },
  fri: { clave: 'siteTour.options.friday', etiqueta: 'Viernes' },
  sat: { clave: 'siteTour.options.saturday', etiqueta: 'Sábado' },
};

export default function RouteDetailModal({ open, onOpenChange, routeId }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [route, setRoute] = useState<RouteType | null>(null);
  const [guardLabel, setGuardLabel] = useState<string | null>(null);
  const [vehicleLabel, setVehicleLabel] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    if (!open || !routeId) {
      setRoute(null);
      return () => { mounted = false; };
    }

    (async () => {
      try {
        setLoading(true);
        const resp: any = await routeService.find(String(routeId));
        if (!mounted) return;
        const r = (resp?.data || resp || null) as RouteType | null;
        setRoute(r);
        // If points are present but missing siteName, try to fetch their names
        (async () => {
          try {
            if (!r || !r.points || !Array.isArray(r.points)) return;
            const missing = (r.points || []).filter((p: RoutePoint) => !p.siteName && (p.siteId || p.postSiteId));
            if (missing.length === 0) return;
            const ids = Array.from(new Set(missing.map((p: RoutePoint) => String(p.siteId || p.postSiteId))));
            const results = await Promise.all(ids.map((id) => postSiteService.get(String(id)).catch(() => null)));
            const map = new Map<string, any>();
            results.forEach((res: any, i: number) => {
              const id = ids[i];
              if (res) map.set(id, res.companyName || res.name || (res.company && (res.company.name || res.company.companyName)) || String(res.id));
            });
            if (map.size > 0) {
              const patched: RouteType = { ...r, points: (r.points || []).map((p: RoutePoint) => ({ ...p, siteName: p.siteName || map.get(String(p.siteId || p.postSiteId)) || p.siteName })) };
              if (mounted) setRoute(patched);
            }
          } catch (e) {
            console.warn('Failed to resolve post site names for route', e);
          }
        })();
      } catch (e) {
        console.error('Error loading route details', e);
        setRoute(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [open, routeId]);

  // Resolve guard and vehicle display labels when route changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!route) {
        setGuardLabel(null);
        setVehicleLabel(null);
        return;
      }

      // Guard
      try {
        const g = route.assignedGuard || route.guard || route.assignedTo || null;
        if ((typeof g === 'string') || (typeof g === 'number')) {
          const gId = String(g);
          const u = await userService.fetchUser(gId);
          if (!mounted) return;
          const name = u ? (u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : (u.email || u.id)) : gId;
          setGuardLabel(name || gId);
        } else if (g && typeof g === 'object') {
          const name = (g.firstName || g.lastName) ? `${g.firstName || ''} ${g.lastName || ''}`.trim() : (g.email || g.id || null);
          setGuardLabel(name || null);
        } else {
          setGuardLabel(null);
        }
      } catch (e) {
        console.warn('Failed to fetch guard info', e);
      }

      // Vehicle
      try {
        const v = route.vehicle || route.vehicleId || null;
        if ((typeof v === 'string') || (typeof v === 'number')) {
          const vId = String(v);
          const vehResp: any = await vehicleService.find(vId);
          if (!mounted) return;
          const veh = vehResp?.data || vehResp || null;
          const label = veh ? (veh.name || veh.licensePlate || veh.id) : vId;
          setVehicleLabel(label || vId);
        } else if (v && typeof v === 'object') {
          const label = v.name || v.licensePlate || v.id || null;
          setVehicleLabel(label || null);
        } else {
          setVehicleLabel(null);
        }
      } catch (e) {
        console.warn('Failed to fetch vehicle info', e);
      }
    })();

    return () => { mounted = false; };
  }, [route]);

  /** Las paradas EN SU ORDEN. `routePoint.order` es lo que manda. */
  const paradasOrdenadas = useMemo<RoutePoint[]>(
    () => (route?.points ? route.points.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) : []),
    [route],
  );

  const paradasMapa = useMemo<RouteMapStop[]>(
    () =>
      paradasOrdenadas
        .map((p) => {
          const c = aCoord(p.lat, p.lng);
          if (!c) return null;
          return {
            id: String(p.id || p.siteId || p.postSiteId || ''),
            nombre: p.siteName || p.address || String(p.siteId || ''),
            direccion: p.address,
            lat: c.lat,
            lng: c.lng,
            duracion: p.duration ?? null,
            pasadas: p.scheduledHits ?? null,
          } as RouteMapStop;
        })
        .filter((x): x is RouteMapStop => x != null),
    [paradasOrdenadas],
  );

  const origen = useMemo(
    () => leerExtremo(route?.originLat, route?.originLng, route?.originLabel),
    [route],
  );
  const destino = useMemo(
    () => leerExtremo(route?.destinationLat, route?.destinationLng, route?.destinationLabel),
    [route],
  );
  const ahorro = useMemo(() => leerAhorro(route?.optimizedMeta), [route]);

  const handleEdit = () => {
    try {
      const t = localStorage.getItem('tenantId');
      const id = route?.id || routeId;
      if (!id) {
        console.error('Cannot edit route without id');
        return;
      }
      const path = t ? `/tenant/${t}/vehicle-patrol/routes/${id}/edit` : `/vehicle-patrol/routes/${id}/edit`;
      navigate(path);
      onOpenChange(false);
    } catch (e) {
      console.error('Navigation error', e);
    }
  };

  const supervisorValue = guardLabel ?? (
    (typeof route?.assignedGuard === 'object' && (route?.assignedGuard?.firstName || route?.assignedGuard?.lastName))
      ? `${route?.assignedGuard?.firstName || ''} ${route?.assignedGuard?.lastName || ''}`.trim()
      : (typeof route?.assignedGuard === 'object' && route?.assignedGuard?.email)
        ? route.assignedGuard.email
        : (typeof route?.assignedGuard === 'string')
          ? route.assignedGuard
          : (route?.supervisorId || '—')
  );

  const vehicleValue = vehicleLabel ?? (
    (typeof route?.vehicle === 'object')
      ? (route?.vehicle?.name || route?.vehicle?.licensePlate || route?.vehicle?.id)
      : (typeof route?.vehicle === 'string')
        ? route.vehicle
        : (route?.vehicleId || '—')
  );

  return (
    <Modal
      open={open}
      onOpenChange={(v) => { if (!v) onOpenChange(false); else onOpenChange(true); }}
      size="lg"
      icon={<Route />}
      title={t('ui.RouteDetailModal.detalleDeLaRuta')}
      description={loading ? 'Cargando...' : route ? `Información de ${route.name || route.id}` : 'Sin datos'}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('actions.close')}</Button>
          <Button variant="brand" onClick={handleEdit}><Pencil className="size-4" />{t('actions.edit')}</Button>
        </div>
      }
    >
      {loading && (
        <div className="space-y-3">
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-4 w-2/3" />
          <SkeletonBlock className="h-4 w-1/3" />
        </div>
      )}
      {!loading && route && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('comun.nombre')} value={route.name || '—'} />
            <Field label={t('comun.tipo')} value={route.continuous ? 'Continua' : 'Programada'} />
            <Field label={t('comun.supervisor')} value={supervisorValue} />
            <Field label={t("ui.RouteDetailModal.vehiculo", "Vehículo")} value={vehicleValue} />
            {/* Mismo tono que la lista de rutas, que ya pintaba «Activo» en
                verde. Aquí iba en el acento de marca: el mismo estado tenía dos
                colores según por dónde se entrara, y gastaba el acento en un
                dato que no es un aviso. */}
            <Field
              label={t('comun.estado')}
              value={(
                <StatusBadge tone={route.completed ? 'ok' : (route.active === false ? 'neutral' : 'ok')}>
                  {route.completed ? 'Completada' : (route.active === false ? 'Inactivo' : 'Activo')}
                </StatusBadge>
              )}
            />
            <Field
              label="Ventana"
              value={`${route.windowStart ? new Date(route.windowStart).toLocaleDateString() : '—'} — ${route.windowEnd ? new Date(route.windowEnd).toLocaleDateString() : '—'}`}
            />
            <Field
              label={t('comun.horaDeInicio')}
              value={(route.windowStart ? new Date(route.windowStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : route.startTime) || '—'}
            />
            <Field
              label={t('comun.horaDeFin')}
              value={(route.windowEnd ? new Date(route.windowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : route.endTime) || '—'}
            />
            {route.days && route.days.length > 0 && (
              <Field className="sm:col-span-2" label={t("ui.RouteDetailModal.dias", "Días")} value={route.days.map((day) => (DAY_LABEL[day] ? t(DAY_LABEL[day].clave, DAY_LABEL[day].etiqueta) : day)).join(', ')} />
            )}
            <Field label="Origen" value={origen ? origen.label : t('routes.detail.originFallback', 'Empieza en la primera parada')} />
            <Field label="Destino" value={destino ? destino.label : t('routes.detail.destinationFallback', 'Termina en la última parada')} />
          </div>

          {/* El estado del orden y, si lo hay, lo que se ahorró. Va antes que la
              lista: es lo primero que se pregunta quien abre una ruta. */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="cg-eyebrow">{t('ui.RouteDetailModal.ordenDelRecorrido')}</div>
              <InsigniaOptimizada optimizada={route.optimized} optimizadaEn={route.optimizedAt} />
            </div>
            <PanelAhorro ahorro={ahorro} optimizadaEn={route.optimizedAt} />
          </div>

          {paradasMapa.length > 0 && (
            <RouteMap
              stops={paradasMapa}
              origen={origen}
              destino={destino}
              roadPolyline={route.roadPolyline ?? null}
              optimizada={Boolean(route.optimized)}
              height={280}
            />
          )}

          <div>
            <div className="cg-eyebrow mb-2 flex items-center gap-1.5">
              <MapPin className="size-3.5" /> Puestos
            </div>
            {paradasOrdenadas.length ? (
              <div className="space-y-2">
                {paradasOrdenadas.map((p, idx) => (
                  <div
                    key={p.id || p.siteId || idx}
                    className="flex items-start gap-3 rounded-xl border p-3"
                    style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
                  >
                    <span
                      className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums"
                      style={{
                        background: `color-mix(in oklab, var(--${route.optimized ? 'ok' : 'brand'}) 16%, transparent)`,
                        color: `var(--${route.optimized ? 'ok' : 'brand'}-text)`,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.siteName || p.address || p.siteId}</div>
                      <div className="mt-0.5 text-xs" style={{ color: 'var(--ink-soft)' }}>
                        Pasadas: {(p.scheduledHits !== undefined && p.scheduledHits !== null) ? String(p.scheduledHits) : '—'} — Duración: {(p.duration !== undefined && p.duration !== null) ? String(p.duration) + ' min' : '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={<MapPin />} title={t('comun.sinPuestos')} description={t('ui.RouteDetailModal.estaRutaNoTienePuestos')} />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
