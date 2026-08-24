import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import Breadcrumb from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Award, GraduationCap, Lock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { trainingCourseService, type TrainingCourse } from '@/lib/api/trainingCourseService';
import { categoryLabel, levelLabel } from './trainingConstants';
import {
  PageContainer, PageHeader, EmptyState, SkeletonCards, GlassPanel, StatusBadge, SmartImage,
} from '@/components/kit';

export default function TrainingCatalogPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('trainingCourseRead');
  const canAssign = hasPermission('trainingEnrollmentCreate');

  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trainingCourseService.list({}, { limit: 200, offset: 0 });
      setCourses(res.rows.filter((c) => c.isAddon));
    } catch (err) {
      console.error(err);
      toast.error('No se pudo cargar el catálogo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canRead) load();
    else setLoading(false);
  }, [canRead, load]);

  if (!canRead) {
    return (
      <AppLayout>
        <Breadcrumb items={[{ label: 'Panel de control', path: '/dashboard' }, { label: 'Entrenamiento' }]} />
        <PageContainer width="wide" className="p-4 sm:p-6">
          <EmptyState
            icon={<Lock />}
            title={t("ui.TrainingCatalog.sinAccesoAlCatalogo", "Sin acceso al catálogo")}
            description="No tienes permiso para ver el catálogo."
          />
        </PageContainer>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: 'Panel de control', path: '/dashboard' },
          { label: 'Entrenamiento', path: '/training/courses' },
          { label: 'Catálogo de la plataforma' },
        ]}
      />

      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<GraduationCap />}
          title="Cursos de la plataforma"
          subtitle="Cursos addon otorgados a tu empresa por C-Guard Pro. Son de solo lectura, pero puedes asignarlos a tus vigilantes."
        />

        {loading && <SkeletonCards count={6} className="lg:grid-cols-3" />}
        {!loading && courses.length === 0 && (
          <EmptyState
            icon={<GraduationCap />}
            title="Sin cursos addon"
            description="Tu empresa aún no tiene cursos addon otorgados."
          />
        )}

        {/* El catálogo pide hasta 200 cursos: la tarjeta se repite, así que va
            en cristal PLANO. Con `.glass` serían 200 desenfoques y el
            desplazamiento se cae. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!loading && courses.map((c) => (
            <GlassPanel key={c.id} flat hover className="flex flex-col overflow-hidden">
              {c.coverUrl && (
                <div className="h-32 w-full overflow-hidden" style={{ background: 'var(--glass-sunken)' }}>
                  <SmartImage src={c.coverUrl} alt={c.title} fit="cover" rounded="rounded-none" className="h-full w-full" />
                </div>
              )}
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="truncate text-sm font-semibold tracking-tight">{c.title}</h3>
                  <StatusBadge tone="neutral" dot={false} className="shrink-0"><Lock className="h-3 w-3" /> Addon</StatusBadge>
                </div>
                {c.description && (
                  <p className="mt-2 line-clamp-3 text-sm" style={{ color: 'var(--ink-soft)' }}>{c.description}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge tone="neutral" dot={false}>{categoryLabel(c.category)}</StatusBadge>
                  <StatusBadge tone="neutral" dot={false}>{levelLabel(c.level)}</StatusBadge>
                  <span className="inline-flex items-center gap-1 tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                    <Award className="h-3.5 w-3.5" style={{ color: 'var(--brand-text)' }} /> {c.pointsValue ?? 0} pts
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/training/courses/${c.id}`)}>
                    Ver
                  </Button>
                  {canAssign && (
                    <Button
                      size="sm"
                      variant="brand"
                      className="flex-1"
                      onClick={() => navigate(`/training/courses/${c.id}`)}
                    >
                      <Users /> Asignar
                    </Button>
                  )}
                </div>
              </div>
            </GlassPanel>
          ))}
        </div>
      </PageContainer>
    </AppLayout>
  );
}
