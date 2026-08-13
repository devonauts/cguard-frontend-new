import { useEffect, useState } from "react";
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import RouteForm from "./RouteForm";
import routeService from "@/lib/api/routeService";
import { PageContainer, PageHeader, SkeletonCards, EmptyState } from "@/components/kit";
import { Route as RouteIcon, AlertCircle } from "lucide-react";

const _lpad = (n: number) => String(n).padStart(2, "0");
function localDatePart(iso: string) { const d = new Date(iso); return `${d.getFullYear()}-${_lpad(d.getMonth() + 1)}-${_lpad(d.getDate())}`; }
function localTimePart(iso: string) { const d = new Date(iso); return `${_lpad(d.getHours())}:${_lpad(d.getMinutes())}`; }

export default function EditRoutePage() {
  const params = useParams<{ tenantId?: string; id?: string }>();
  const navigate = useNavigate();
  const [routeData, setRouteData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params?.tenantId) {
      try {
        localStorage.setItem('tenantId', params.tenantId);
      } catch (error) {
        console.error(error);
      }
    }

    const routeId = params?.id;
    if (!routeId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        const route: any = await routeService.find(routeId);
        if (!mounted || !route) return;

        // assignedGuard may be an object or a plain string id depending on backend
        let supervisorId = '';
        let supervisorName = '';
        if (route.assignedGuard) {
          if (typeof route.assignedGuard === 'string') {
            supervisorId = String(route.assignedGuard);
          } else if (route.assignedGuard.id) {
            supervisorId = String(route.assignedGuard.id);
            supervisorName = route.assignedGuard.displayName || route.assignedGuard.name || route.assignedGuard.email || '';
          }
        }
        if (!supervisorId && route.supervisorId) supervisorId = String(route.supervisorId);
        // El orden lo manda `routePoint.order` — es el recorrido, no un detalle.
        const puntos: any[] = Array.isArray(route.points)
          ? route.points.slice().sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
          : [];
        const vehicleId = route.vehicle?.id ? String(route.vehicle.id) : route.vehicleId ? String(route.vehicleId) : '';
        const vehicleName = route.vehicle?.name || '';
        const vehicleLicensePlate = route.vehicle?.licensePlate || '';

        setRouteData({
          name: route.name || '',
          description: route.description || '',
          continuous: route.continuous !== undefined ? route.continuous : true,
          // Prefill from LOCAL wall-clock (the create path builds windowStart from
          // `${date}T${time}` local → UTC); using toISOString() here shifted the
          // window by the tz offset on every save.
          dateFrom: route.windowStart ? localDatePart(route.windowStart) : '',
          startTime: route.windowStart ? localTimePart(route.windowStart) : '00:00',
          dateTo: route.windowEnd ? localDatePart(route.windowEnd) : '',
          endTime: route.windowEnd ? localTimePart(route.windowEnd) : '23:59',
          days: route.days || [],
          supervisorId,
          supervisorName,
          siteIds: puntos.map((point: any) => point.siteId),
          vehicleId,
          vehicleName,
          vehicleLicensePlate,
          syncHitsBetweenGuards: route.syncHitsBetweenGuards || false,
          forceVehicleRouteOrder: route.forceVehicleRouteOrder || false,
          notifyBefore: route.notifyBefore || '00:15',
          autoCheckInByGeofence: route.autoCheckInByGeofence || false,
          forceCheckInBeforeStart: route.forceCheckInBeforeStart || false,
          points: puntos.map((point: any) => ({
            siteId: point.siteId,
            siteName: point.siteName,
            address: point.address || '',
            duration: point.duration ?? 5,
            scheduledHits: point.scheduledHits ?? 1,
            lat: point.lat ?? null,
            lng: point.lng ?? null,
          })),
          // Extremos opcionales del recorrido.
          originLat: route.originLat ?? null,
          originLng: route.originLng ?? null,
          originLabel: route.originLabel ?? null,
          destinationLat: route.destinationLat ?? null,
          destinationLng: route.destinationLng ?? null,
          destinationLabel: route.destinationLabel ?? null,
          // Estado de la optimización.
          optimized: route.optimized ?? false,
          optimizedAt: route.optimizedAt ?? null,
          optimizedMeta: route.optimizedMeta ?? null,
          roadPolyline: route.roadPolyline ?? null,
        });
      } catch (error) {
        console.error(error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [params]);

  if (loading) {
    return (
      <AppLayout>
        <Breadcrumb
          items={[
            { label: 'Panel de control', path: '/dashboard' },
            { label: 'Editar ruta' },
          ]}
        />
        <PageContainer width="wide" className="p-6">
          <PageHeader icon={<RouteIcon />} title="Editar ruta" subtitle="Cargando ruta..." />
          <SkeletonCards count={4} />
        </PageContainer>
      </AppLayout>
    );
  }

  if (!routeData) {
    return (
      <AppLayout>
        <Breadcrumb
          items={[
            { label: 'Panel de control', path: '/dashboard' },
            { label: 'Editar ruta' },
          ]}
        />
        <PageContainer width="wide" className="p-6">
          <PageHeader icon={<RouteIcon />} title="Editar ruta" />
          <EmptyState icon={<AlertCircle />} title="No se encontró la ruta" description="La ruta solicitada no existe o no está disponible." />
        </PageContainer>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: 'Panel de control', path: '/dashboard' },
          { label: 'Editar ruta' },
        ]}
      />
      <PageContainer width="wide" className="p-6">
        <PageHeader
          icon={<RouteIcon />}
          title="Editar ruta"
          subtitle={routeData?.name ? `Modifica «${routeData.name}»` : 'Modifica la configuración de la ruta'}
        />
        <RouteForm
          mode="edit"
          routeId={params.id}
          initialData={routeData}
          onSuccess={() => navigate('/vehicle-patrol/routes', { replace: true })}
        />
      </PageContainer>
    </AppLayout>
  );
}