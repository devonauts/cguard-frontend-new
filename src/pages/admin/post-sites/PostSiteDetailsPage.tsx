import React, { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import PostSiteLayout from '@/layouts/PostSiteLayout';
import { postSiteService, setTenantId as setGlobalTenantId } from '@/lib/api/postSiteService';
import { Loader2, AlertTriangle, MapPinOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { EmptyState } from '@/components/kit';
import Overview from './components/PostsiteOverview/Overview';
import Profile from './components/PostsiteProfile/Profile';
import Contacts from './components/PostsiteContacts/Contacts';
import KPIs from './components/PostSiteKPIs/PostSiteKPIs';
import Notes from './components/PostsiteNotes/Notes';
import AssignGuards from './components/PostsiteAssignGuards/AssignGuards';
import Stations from './components/PostsiteStations/Stations';
import Incidents from './components/PostsiteIncidents/Incidents';
import SiteTours from './components/PostsiteSiteTours/SiteTours';
import Inventory from './components/PostsiteInventory/Inventory';
import OperationSetupAlert from './components/OperationSetup/OperationSetupAlert';
import { useTranslation } from "react-i18next";

export default function PostSiteDetailsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [site, setSite] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean);
  const currentTab = parts[2] || 'overview';

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    // Clear the previous site so switching :id A→B never shows A under B's URL.
    setSite(null);
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await postSiteService.get(id);
        if (!mounted) return;
        setSite(data);
        // Ensure tenantId is available globally for components that rely on localStorage fallback
        try {
          const tid = data?.tenantId || (data?.tenant && typeof data.tenant === "object" && (data.tenant.id || data.tenant.tenantId));
          if (tid) {
            setGlobalTenantId(tid);
          }
        } catch (e) {}
      } catch (e: any) {
        if (!mounted) return;
        console.error(e);
        setSite(null);
        setError(e?.message || `${t('postsite.Details.unexpected', 'Ocurrió un error inesperado')}`);
        toast.error(`${t('postsite.Details.unexpected', 'Ocurrió un error inesperado')}`);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [id]);

  const renderTab = () => {
    switch (currentTab) {
      case 'overview':
        return <Overview site={site} />;
      case 'profile':
        return <Profile site={site} />;
      case 'contacts':
        return <Contacts site={site} />;
      case 'kpis':
        return <KPIs site={site} />;
      case 'notes':
        return <Notes site={site} />;
      case 'assign-guards':
        return <AssignGuards site={site} />;
      case 'stations':
        return <Stations site={site} />;
      case 'incidents':
        return <Incidents site={site} />;
      case 'site-tours':
        return <SiteTours site={site} />;
      case 'inventory':
        return <Inventory site={site} />;
      default:
        return <Overview site={site} />;
    }
  };

  

  return (
    <PostSiteLayout title={site?.businessName || site?.companyName || site?.name || t('postSites.Details.title', '-')} site={site}>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin brand-text" />
          </div>
        ) : error ? (
          <EmptyState
            icon={<AlertTriangle />}
            title={t('postSites.Details.errorTitle', 'No se pudo cargar la sede')}
            description={error}
          />
        ) : site ? (
          <div className="space-y-4 animate-fade-up">
            {/* Va FUERA del switch de pestañas a propósito: el hueco no es de
                una pestaña, es de la sede entera. Quien entra por «Puestos» o
                por «Asignar vigilantes» —justo los dos sitios donde el hueco
                hace daño— tiene que verlo igual que quien entra por Resumen. */}
            <OperationSetupAlert site={site} siteId={id} />
            {renderTab()}
          </div>
        ) : (
          <EmptyState
            icon={<MapPinOff />}
            title={t('postSites.Details.notfoundpostsite', 'No se encontró la sede')}
          />
        )}
      </div>
    </PostSiteLayout>
  );
}
