import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import Breadcrumb from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lock, GraduationCap } from 'lucide-react';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import {
  trainingCourseService,
  type TrainingCourse,
  type TrainingLesson,
} from '@/lib/api/trainingCourseService';
import { TRAINING_CATEGORIES, TRAINING_LEVELS } from './trainingConstants';
import LessonsManager from './components/LessonsManager';
import QuizManager from './components/QuizManager';
import AssignGuardsPanel from './components/AssignGuardsPanel';
import { PageContainer, PageHeader, StatusBadge, EmptyState, Section, SkeletonCards } from '@/components/kit';

export default function TrainingCourseDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('trainingCourseEdit');
  const canAssign = hasPermission('trainingEnrollmentCreate');

  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // editable metadata
  const [meta, setMeta] = useState({
    title: '',
    description: '',
    coverUrl: '',
    category: 'security',
    level: 'beginner',
    pointsValue: 0,
    passingScore: 70,
    certificateTemplate: '',
    published: false,
  });

  const isAddon = !!course?.isAddon;
  const readOnly = isAddon || !canEdit;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const c = await trainingCourseService.get(id);
      setCourse(c);
      setLessons(c.lessons ?? []);
      setMeta({
        title: c.title ?? '',
        description: c.description ?? '',
        coverUrl: c.coverUrl ?? '',
        category: c.category ?? 'security',
        level: c.level ?? 'beginner',
        pointsValue: c.pointsValue ?? 0,
        passingScore: c.passingScore ?? 70,
        certificateTemplate: c.certificateTemplate ?? '',
        published: !!c.published,
      });
    } catch (err) {
      console.error(err);
      toast.error(t('ui.TrainingCourseDetailPage.noSePudoCargarEl'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const saveMeta = async () => {
    if (!id) return;
    if (!meta.title.trim()) {
      toast.error(t('comun.elTituloEsObligatorio'));
      return;
    }
    setSaving(true);
    try {
      await trainingCourseService.update(id, {
        title: meta.title,
        description: meta.description,
        coverUrl: meta.coverUrl,
        category: meta.category as any,
        level: meta.level as any,
        pointsValue: Number(meta.pointsValue),
        passingScore: Number(meta.passingScore),
        certificateTemplate: meta.certificateTemplate,
        published: meta.published,
      });
      toast.success('Curso actualizado.');
      load();
    } catch (err) {
      console.error(err);
      toast.error(t('ui.TrainingCourseDetailPage.noSePudoActualizarEl'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <PageContainer width="wide" className="p-4 sm:p-6"><SkeletonCards count={4} /></PageContainer>
      </AppLayout>
    );
  }

  if (!course) {
    return (
      <AppLayout>
        <PageContainer className="p-4">
          <EmptyState
            icon={<GraduationCap />}
            title={t('ui.TrainingCourseDetailPage.cursoNoEncontrado', 'Curso no encontrado')}
            description={t('ui.TrainingCourseDetailPage.elCursoQueBuscasNo')}
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
          { label: 'Cursos', path: '/training/courses' },
          { label: course.title },
        ]}
      />

      <PageContainer width="wide" className="p-4 sm:p-6">
        <PageHeader
          icon={<GraduationCap />}
          title={course.title}
          subtitle={isAddon
            ? 'Curso de la plataforma otorgado a tu empresa. Es de solo lectura; puedes asignarlo a tus vigilantes.'
            : undefined}
          badges={
            <>
              {isAddon && (
                <StatusBadge tone="slate" dot={false}><Lock className="h-3 w-3" /> Curso addon</StatusBadge>
              )}
              {course.published
                ? <StatusBadge tone="green">Publicado</StatusBadge>
                : <StatusBadge tone="slate">Borrador</StatusBadge>}
            </>
          }
          actions={<Button variant="outline" onClick={() => navigate('/training/courses')}>Volver</Button>}
        />

        <Tabs defaultValue="details">
          {/* Cuatro pestañas no caben en un teléfono: el carril se desplaza
              DENTRO de su píldora en vez de ensanchar la página. */}
          <TabsList className="max-w-full justify-start overflow-x-auto [&>*]:shrink-0">
            <TabsTrigger value="details">{t('ui.TrainingCourseDetailPage.detalles')}</TabsTrigger>
            <TabsTrigger value="lessons">Lecciones ({lessons.length})</TabsTrigger>
            <TabsTrigger value="quiz">Cuestionario</TabsTrigger>
            {canAssign && <TabsTrigger value="assign">Asignar</TabsTrigger>}
          </TabsList>

          {/* DETAILS */}
          <TabsContent value="details" className="mt-4">
            <Section title={t('ui.TrainingCourseDetailPage.detallesDelCurso')} icon={<GraduationCap />} contentClassName="max-w-2xl space-y-4">
                <div className="space-y-2">
                  <Label>{t("ui.TrainingCourseDetail.titulo", "Título *")}</Label>
                  <Input disabled={readOnly} value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t("ui.TrainingCourseDetail.descripcion", "Descripción")}</Label>
                  <Textarea disabled={readOnly} rows={3} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>{t('ui.TrainingCourseDetailPage.urlDePortada', 'URL de portada')}</Label>
                  <Input disabled={readOnly} value={meta.coverUrl} onChange={(e) => setMeta({ ...meta, coverUrl: e.target.value })} placeholder="https://..." />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t("ui.TrainingCourseDetail.categoria", "Categoría")}</Label>
                    <Select value={meta.category} onValueChange={(v) => setMeta({ ...meta, category: v })} disabled={readOnly}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRAINING_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{t(c.labelKey, c.label)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nivel</Label>
                    <Select value={meta.level} onValueChange={(v) => setMeta({ ...meta, level: v })} disabled={readOnly}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRAINING_LEVELS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Puntos al completar</Label>
                    <Input type="number" min={0} disabled={readOnly} value={meta.pointsValue} onChange={(e) => setMeta({ ...meta, pointsValue: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('comun.puntajeParaAprobar')}</Label>
                    <Input type="number" min={0} max={100} disabled={readOnly} value={meta.passingScore} onChange={(e) => setMeta({ ...meta, passingScore: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('ui.TrainingCourseDetailPage.plantillaDeCertificadoHtmlOpcional', 'Plantilla de certificado (HTML opcional)')}</Label>
                  <Textarea
                    disabled={readOnly}
                    rows={4}
                    className="font-mono text-xs"
                    placeholder="Usa {{guardName}}, {{courseTitle}}, {{score}}, {{serialNumber}}, {{issuedAt}}. Déjalo vacío para usar el certificado de marca C-Guard Pro."
                    value={meta.certificateTemplate}
                    onChange={(e) => setMeta({ ...meta, certificateTemplate: e.target.value })}
                  />
                </div>
                <div className="glass-sunken flex items-center justify-between p-3">
                  <div>
                    <Label className="cursor-pointer">Publicado</Label>
                    <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('ui.TrainingCourseDetailPage.losCursosPublicadosPuedenAsignarse')}</p>
                  </div>
                  <Switch checked={meta.published} disabled={readOnly} onCheckedChange={(v) => setMeta({ ...meta, published: v })} />
                </div>
                {!readOnly && (
                  <div className="flex justify-end">
                    <Button variant="brand" disabled={saving} onClick={saveMeta}>
                      {saving ? 'Guardando...' : 'Guardar cambios'}
                    </Button>
                  </div>
                )}
            </Section>
          </TabsContent>

          {/* LESSONS */}
          <TabsContent value="lessons" className="mt-4">
            <LessonsManager
              courseId={course.id}
              lessons={lessons}
              readOnly={readOnly}
              onChange={load}
            />
          </TabsContent>

          {/* QUIZ */}
          <TabsContent value="quiz" className="mt-4">
            <QuizManager
              courseId={course.id}
              quiz={course.quiz ?? null}
              passingScore={course.passingScore ?? 70}
              readOnly={readOnly}
              onChange={load}
            />
          </TabsContent>

          {/* ASSIGN */}
          {canAssign && (
            <TabsContent value="assign" className="mt-4">
              <AssignGuardsPanel courseId={course.id} published={!!course.published} />
            </TabsContent>
          )}
        </Tabs>
      </PageContainer>
    </AppLayout>
  );
}
