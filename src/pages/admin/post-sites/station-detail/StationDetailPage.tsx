import React, { useEffect, useState } from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import StationLayout from '@/layouts/StationLayout';
import { ApiService } from '@/services/api/apiService';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState, FadeIn } from '@/components/kit';
import StationOverview from './components/StationOverview';
import StationHero from './components/StationHero';
import StationVisitors from './components/StationVisitors';
import StationGuards from './components/StationGuards';
import StationShifts from './components/StationShifts';
import StationSiteTours from './components/StationSiteTours';
import StationRondaHistory from './components/StationRondaHistory';
import StationInventory from './components/StationInventory';
import StationIncidents from './components/StationIncidents';
import StationPatrolQR from './components/StationPatrolQR';
import StationParking from './components/StationParking';
import StationOrders from './components/StationOrders';

export default function StationDetailPage() {
  const { t } = useTranslation();
  const { postSiteId, stationId } = useParams();
  const location = useLocation();

  // /post-sites/:postSiteId/stations/:stationId[/:tab]
  // parts: ['post-sites', postSiteId, 'stations', stationId, tab?]
  const parts = location.pathname.split('/').filter(Boolean);
  const currentTab = parts[4] || 'overview';

  const [station, setStation] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stationId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const tenantId = localStorage.getItem('tenantId') || '';
        const res = await ApiService.get(`/tenant/${tenantId}/station/${encodeURIComponent(stationId)}`);
        const data = (res && (res.data || res)) || res;
        if (mounted) setStation(data);
      } catch (e: any) {
        if (mounted) setError(e?.message || t('station.details.loadError', 'Error al cargar puesto'));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [stationId]);

  // Redirect bare /post-sites/:postSiteId/stations/:stationId → overview
  if (parts.length === 4) {
    return <Navigate to={`/post-sites/${postSiteId}/stations/${stationId}/overview`} replace />;
  }

  const tabProps = { station, stationId: stationId || '', postSiteId: postSiteId || '' };

  const renderTab = () => {
    switch (currentTab) {
      case 'overview':   return <StationOverview {...tabProps} />;
      case 'visitors':   return <StationVisitors {...tabProps} />;
      case 'guards':     return <StationGuards {...tabProps} />;
      case 'shifts':     return <StationShifts {...tabProps} />;
      case 'orders':     return <StationOrders {...tabProps} />;
      case 'site-tours': return <StationSiteTours {...tabProps} />;
      case 'tag-scans':  return <StationRondaHistory {...tabProps} />;
      case 'inventory':  return <StationInventory {...tabProps} />;
      case 'incidents':  return <StationIncidents {...tabProps} />;
      case 'etiquetas':  return <StationPatrolQR {...tabProps} />;
      case 'parking':    return <StationParking {...tabProps} />;
      default:           return <StationOverview {...tabProps} />;
    }
  };

  return (
    <StationLayout station={station}>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin brand-text" />
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertTriangle />}
            title={t('station.details.loadError', 'Error al cargar puesto')}
            description={error}
          />
        ) : (
          <FadeIn className="space-y-4">
            <StationHero
              station={station}
              stationId={stationId || ''}
              postSiteId={postSiteId || ''}
              onRenamed={(n) => setStation((prev: any) => ({ ...prev, stationName: n, name: n }))}
            />
            {renderTab()}
          </FadeIn>
        )}
      </div>
    </StationLayout>
  );
}
