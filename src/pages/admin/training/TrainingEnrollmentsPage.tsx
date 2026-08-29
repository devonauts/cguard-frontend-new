import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import Breadcrumb from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { MeterBar } from '@/components/charts';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, Clock, GraduationCap, Users, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { trainingCourseService, type TrainingCourse } from '@/lib/api/trainingCourseService';
import {
  trainingEnrollmentService,
  type EnrollmentRow,
  type EnrollmentDetail,
} from '@/lib/api/trainingEnrollmentService';
import { ENROLLMENT_STATUS_KEYS, enrollmentStatusLabel, ENROLLMENT_STATUS_TONE } from './trainingConstants';
import { PageContainer, PageHeader, Section, StatCard, Stagger, StatusBadge, EmptyState, SkeletonCards } from '@/components/kit';
import { DataTable, type Column } from '@/components/table/DataTable';

import { localeActual } from '@/lib/localeActual'
export default function TrainingEnrollmentsPage() {
  const { t } = useTranslation();
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('trainingEnrollmentRead');

  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [rows, setRows] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const [detail, setDetail] = useState<EnrollmentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const [c, res] = await Promise.all([
        trainingCourseService.get(courseId),
        trainingEnrollmentService.listByCourse(courseId, {
          limit: 200,
          offset: 0,
          status: statusFilter !== 'all' ? (statusFilter as any) : undefined,
        }),
      ]);
      setCourse(c);
      setRows(res.rows);
    } catch (err) {
      console.error(err);
      toast.error(t('ui.TrainingEnrollmentsPage.noSePudoCargarEl'));
    } finally {
      setLoading(false);
    }
  }, [courseId, statusFilter]);

  useEffect(() => {
    if (canRead) load();
    else setLoading(false);
  }, [canRead, load]);

  const openDetail = async (enrollmentId: string) => {
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await trainingEnrollmentService.detail(enrollmentId);
      setDetail(d);
    } catch (err) {
      console.error(err);
      toast.error(t('ui.TrainingEnrollmentsPage.noSePudoCargarEl'));
    } finally {
      setDetailLoading(false);
    }
  };

  if (!canRead) {
    return (
      <AppLayout>
        <Breadcrumb items={[{ label: 'Panel de control', path: '/dashboard' }, { label: 'Entrenamiento' }]} />
        <PageContainer width="wide" className="p-4 sm:p-6"><EmptyState icon={<Users />} title={t('ui.TrainingEnrollmentsPage.sinAcceso')} description={t('ui.TrainingEnrollmentsPage.noTienesPermisoParaVer')} /></PageContainer>
      </AppLayout>
    );
  }

  const completedCount = rows.filter((r) => r.status === 'completed').length;
  const realEnrollments = rows.filter((r) => r.guardId || r.assignmentType === 'individual');

  /* Las columnas van a `DataTable` en vez de a un `<table>` a mano: es lo que
     da las cabeceras `cg-eyebrow`, los filos de pelo, el esqueleto de carga y
     el estado vacío que el resto de tablas del CRM ya tienen. */
  const enrollmentColumns: Column<EnrollmentRow>[] = [
    {
      key: 'guardName',
      header: 'Vigilante',
      render: (_v, r) =>
        r.assignmentType === 'all_guards' && !r.guardId
          ? <StatusBadge tone="neutral" dot={false}>{t('comun.todosLosVigilantesPlantilla')}</StatusBadge>
          : (r.guardName || '—'),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (_v, r) => (
        <StatusBadge tone={ENROLLMENT_STATUS_TONE[r.status]} dot={false}>
          {enrollmentStatusLabel(r.status)}
        </StatusBadge>
      ),
    },
    {
      key: 'progressPercentage',
      header: 'Progreso',
      render: (_v, r) => (
        <div className="flex items-center gap-2">
          <MeterBar className="w-24" height={6} pct={r.progressPercentage ?? 0} ariaLabel="Progreso" />
          <span className="text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>{r.progressPercentage ?? 0}%</span>
        </div>
      ),
    },
    {
      key: 'quizPassed',
      header: 'Cuestionario',
      render: (_v, r) => (r.quizPassed
        ? <StatusBadge tone="ok" dot={false}><span className="tabular-nums">Aprobado{r.quizScore != null ? ` (${r.quizScore}%)` : ''}</span></StatusBadge>
        : <span style={{ color: 'var(--ink-soft)' }}>—</span>),
    },
    {
      key: 'dueDate',
      header: 'Fecha límite',
      render: (_v, r) => (
        <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
          {r.dueDate ? new Date(r.dueDate).toLocaleDateString(localeActual()) : '—'}
        </span>
      ),
    },
    {
      key: 'completedAt',
      header: 'Completado',
      render: (_v, r) => (
        <span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>
          {r.completedAt ? new Date(r.completedAt).toLocaleDateString(localeActual()) : '—'}
        </span>
      ),
    },
    {
      key: 'detalle',
      header: 'Detalle',
      align: 'right',
      render: (_v, r) => (r.assignmentType === 'all_guards' && !r.guardId ? null : (
        <Button size="sm" variant="ghost" onClick={() => openDetail(r.id)}>Ver</Button>
      )),
    },
  ];

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: 'Panel de control', path: '/dashboard' },
          { label: 'Entrenamiento', path: '/training/courses' },
          { label: 'Cursos', path: '/training/courses' },
          { label: course?.title ?? 'Curso', path: courseId ? `/training/courses/${courseId}` : undefined },
          { label: 'Progreso' },
        ]}
      />

      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<GraduationCap />}
          title={course?.title ?? t('training.enrollments.title', 'Progreso del curso')}
          subtitle={`${completedCount} de ${realEnrollments.length} vigilantes completaron el curso.`}
          actions={
            <>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('comun.todosLosEstados')}</SelectItem>
                  {Object.keys(ENROLLMENT_STATUS_KEYS).map((v) => (
                    <SelectItem key={v} value={v}>{enrollmentStatusLabel(v)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => navigate(`/training/courses/${courseId}`)}>{t('ui.TrainingEnrollmentsPage.editarCurso')}</Button>
            </>
          }
        />

        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Inscripciones" value={realEnrollments.length} icon={<Users />} accent="info" />
          <StatCard label="Completaron" value={completedCount} icon={<BadgeCheck />} accent="ok" />
          <StatCard label="Pendientes" value={Math.max(realEnrollments.length - completedCount, 0)} icon={<Clock />} accent="warn" />
        </Stagger>

        <Section title={t('ui.TrainingEnrollmentsPage.progresoDeVigilantes', 'Progreso de vigilantes')} icon={<Users />} contentClassName="-mx-5 -mb-5">
          <DataTable
            surface="none"
            loading={loading}
            data={rows}
            columns={enrollmentColumns}
            emptyState={
              <EmptyState
                icon={<Users />}
                title={t('ui.TrainingEnrollmentsPage.noHayInscripciones')}
                description={t('ui.TrainingEnrollmentsPage.cuandoAsignesEsteCursoA')}
                className="border-0"
              />
            }
          />
        </Section>
      </PageContainer>

      <Sheet open={!!detail || detailLoading} onOpenChange={(o) => { if (!o) { setDetail(null); } }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{t('ui.TrainingEnrollmentsPage.detalleDeProgreso')}</SheetTitle>
          </SheetHeader>
          {detailLoading && <div className="mt-6"><SkeletonCards count={2} className="sm:grid-cols-1" /></div>}
          {detail && (
            <div className="mt-6 space-y-4">
              <div>
                <div className="text-sm font-semibold tracking-tight">{detail.guardName}</div>
                <StatusBadge tone={ENROLLMENT_STATUS_TONE[detail.status]} dot={false} className="mt-1.5">{enrollmentStatusLabel(detail.status)}</StatusBadge>
              </div>
              <div className="flex items-center gap-2">
                <MeterBar className="flex-1" height={8} pct={detail.progressPercentage ?? 0} ariaLabel="Progreso" />
                <span className="text-sm tabular-nums">{detail.progressPercentage ?? 0}%</span>
              </div>
              <div className="text-sm">
                Cuestionario:{' '}
                {detail.quizPassed
                  ? <span className="font-medium tabular-nums" style={{ color: 'var(--ok-text)' }}>Aprobado{detail.quizScore != null ? ` (${detail.quizScore}%)` : ''}</span>
                  : <span style={{ color: 'var(--ink-soft)' }}>{t('ui.TrainingEnrollmentsPage.noAprobado')}</span>}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold tracking-tight">Lecciones</h4>
                <div className="space-y-2">
                  {detail.lessonCompletions.length === 0 && (
                    <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t("ui.TrainingEnrollments.aunNoHaCompletadoLecciones", "Aún no ha completado lecciones.")}</p>
                  )}
                  {detail.lessonCompletions.map((lc) => (
                    <div key={lc.lessonId} className="flex items-center gap-2 text-sm">
                      {lc.completedAt
                        ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--ok-text)' }} />
                        : <Clock className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} />}
                      <span className="flex-1">{lc.title}</span>
                      <span className="text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>
                        {lc.completedAt ? new Date(lc.completedAt).toLocaleDateString(localeActual()) : 'Pendiente'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
