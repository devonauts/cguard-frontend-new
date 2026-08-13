import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import Breadcrumb from '@/components/ui/breadcrumb';
import { PageContainer, PageHeader } from '@/components/kit';
import { Route as RouteIcon } from 'lucide-react';
import RouteForm from './RouteForm';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NUEVA RUTA
 *
 * Sólo el marco: título, migas y el tenant de la URL. El formulario ES
 * `RouteForm`, el mismo que usa «Editar ruta».
 *
 * ── POR QUÉ ESTE ARCHIVO ADELGAZÓ DE 847 LÍNEAS A ÉSTAS ─────────────────────
 * Era una COPIA entera de `RouteForm` que se había quedado atrás: las etiquetas
 * de los días estaban corrompidas («Mi�rcoles», «S�bado») y el botón «Guardar
 * como borrador» sólo escribía en la consola del navegador — un botón que no
 * guardaba nada delante de un operador que creía haber guardado.
 *
 * Mantener dos formularios significaba implementar DOS VECES el origen, el
 * destino y el botón de optimizar, y que la mitad de las rutas se crearan sin
 * ellos según por qué puerta se entrara. Ahora hay uno.
 * ════════════════════════════════════════════════════════════════════════════
 */
export default function NewRoutePage() {
  const params = useParams<{ tenantId?: string }>();
  const navigate = useNavigate();

  // El tenant de la URL manda: los servicios lo leen de aquí.
  useEffect(() => {
    if (!params?.tenantId) return;
    try {
      localStorage.setItem('tenantId', params.tenantId);
    } catch (error) {
      console.error(error);
    }
  }, [params?.tenantId]);

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: 'Panel de control', path: '/dashboard' },
          { label: 'Rutas', path: '/vehicle-patrol/routes' },
          { label: 'Nueva ruta' },
        ]}
      />
      <PageContainer width="wide" className="p-6">
        <PageHeader
          icon={<RouteIcon />}
          title="Nueva ruta"
          subtitle="Define las paradas del recorrido, quién lo hace y con qué vehículo."
        />
        <RouteForm
          mode="create"
          onSuccess={() => navigate('/vehicle-patrol/routes', { replace: true })}
        />
      </PageContainer>
    </AppLayout>
  );
}
