import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { Lock, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import {
  TRAINING_CATEGORIES,
  TRAINING_LEVELS,
  courseScoreProblem,
  PASSING_SCORE_MAX,
  PASSING_SCORE_MIN,
  POINTS_VALUE_MAX,
} from "./trainingConstants";
import LessonsManager from "./components/LessonsManager";
import QuizManager from "./components/QuizManager";
import AssignGuardsPanel from "./components/AssignGuardsPanel";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePermissions } from "@/hooks/usePermissions";
import {
  trainingCourseService,
  type TrainingCourse,
  type TrainingLesson,
} from "@/lib/api/trainingCourseService";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  EmptyState,
  Section,
  SkeletonCards,
} from "@/components/kit";

export default function TrainingCourseDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("trainingCourseEdit");
  const canAssign = hasPermission("trainingEnrollmentCreate");

  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [lessons, setLessons] = useState<TrainingLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // editable metadata
  const [meta, setMeta] = useState({
    title: "",
    description: "",
    coverUrl: "",
    category: "security",
    level: "beginner",
    pointsValue: 0,
    passingScore: 70,
    certificateTemplate: "",
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
        title: c.title ?? "",
        description: c.description ?? "",
        coverUrl: c.coverUrl ?? "",
        category: c.category ?? "security",
        level: c.level ?? "beginner",
        pointsValue: c.pointsValue ?? 0,
        passingScore: c.passingScore ?? 70,
        certificateTemplate: c.certificateTemplate ?? "",
        published: !!c.published,
      });
    } catch (err) {
      console.error(err);
      toast.error(t("ui.TrainingCourseDetailPage.noSePudoCargarEl"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const saveMeta = async () => {
    if (!id) return;
    if (!meta.title.trim()) {
      toast.error(t("comun.elTituloEsObligatorio"));

      return;
    }
    const scoreProblem = courseScoreProblem(meta);

    if (scoreProblem) {
      toast.error(scoreProblem);

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
      toast.success(t("ui.TrainingCourseDetailPage.cursoActualizado", "Curso actualizado."));
      load();
    } catch (err) {
      console.error(err);
      toast.error(t("ui.TrainingCourseDetailPage.noSePudoActualizarEl"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <SkeletonCards count={4} />
        </PageContainer>
      </AppLayout>
    );
  }

  if (!course) {
    return (
      <AppLayout>
        <PageContainer>
          <EmptyState
            description={t("ui.TrainingCourseDetailPage.elCursoQueBuscasNo")}
            icon={<GraduationCap />}
            title={t(
              "ui.TrainingCourseDetailPage.cursoNoEncontrado",
              "Curso no encontrado",
            )}
          />
        </PageContainer>
      </AppLayout>
    );
  }

  return (
    <AppLayout>

      <PageContainer width="wide">
        <PageHeader
          actions={
            <Button
              variant="outline"
              onClick={() => navigate("/training/courses")}
            >
              {t("ui.TrainingCourseDetailPage.volver", "Volver")}
            </Button>
          }
          badges={
            <>
              {isAddon && (
                <StatusBadge dot={false} tone="slate">
                  <Lock className="h-3 w-3" />{" "}
                  {t("ui.TrainingCourseDetailPage.cursoAddon", "Curso addon")}
                </StatusBadge>
              )}
              {course.published ? (
                <StatusBadge tone="green">
                  {t("ui.TrainingCourseDetailPage.publicado", "Publicado")}
                </StatusBadge>
              ) : (
                <StatusBadge tone="slate">
                  {t("ui.TrainingCourseDetailPage.borrador", "Borrador")}
                </StatusBadge>
              )}
            </>
          }
          icon={<GraduationCap />}
          subtitle={
            isAddon
              ? t(
                  "ui.TrainingCourseDetailPage.cursoDeLaPlataforma",
                  "Curso de la plataforma otorgado a tu empresa. Es de solo lectura; puedes asignarlo a tus vigilantes.",
                )
              : undefined
          }
          title={course.title}
        />

        <Tabs defaultValue="details">
          {/* Cuatro pestañas no caben en un teléfono: el carril se desplaza
              DENTRO de su píldora en vez de ensanchar la página. */}
          <TabsList className="max-w-full justify-start overflow-x-auto [&>*]:shrink-0">
            <TabsTrigger value="details">
              {t("ui.TrainingCourseDetailPage.detalles")}
            </TabsTrigger>
            <TabsTrigger value="lessons">
              {t("ui.TrainingCourseDetailPage.leccionesN", {
                defaultValue: "Lecciones ({{n}})",
                n: lessons.length,
              })}
            </TabsTrigger>
            <TabsTrigger value="quiz">
              {t("ui.TrainingCourseDetailPage.cuestionario", "Cuestionario")}
            </TabsTrigger>
            {canAssign && (
              <TabsTrigger value="assign">
                {t("ui.SecurityGuardsPage.asignar", "Asignar")}
              </TabsTrigger>
            )}
          </TabsList>

          {/* DETAILS */}
          <TabsContent className="mt-4" value="details">
            <Section
              contentClassName="max-w-2xl space-y-4"
              icon={<GraduationCap />}
              title={t("ui.TrainingCourseDetailPage.detallesDelCurso")}
            >
              <div className="space-y-2">
                <Label>{t("ui.TrainingCourseDetail.titulo", "Título *")}</Label>
                <Input
                  disabled={readOnly}
                  value={meta.title}
                  onChange={(e) => setMeta({ ...meta, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {t("ui.TrainingCourseDetail.descripcion", "Descripción")}
                </Label>
                <Textarea
                  disabled={readOnly}
                  rows={3}
                  value={meta.description}
                  onChange={(e) =>
                    setMeta({ ...meta, description: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>
                  {t(
                    "ui.TrainingCourseDetailPage.urlDePortada",
                    "URL de portada",
                  )}
                </Label>
                <Input
                  disabled={readOnly}
                  placeholder="https://..."
                  value={meta.coverUrl}
                  onChange={(e) =>
                    setMeta({ ...meta, coverUrl: e.target.value })
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>
                    {t("ui.TrainingCourseDetail.categoria", "Categoría")}
                  </Label>
                  <Select
                    disabled={readOnly}
                    value={meta.category}
                    onValueChange={(v) => setMeta({ ...meta, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAINING_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {t(c.labelKey, c.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("ui.TrainingCourseDetailPage.nivel", "Nivel")}</Label>
                  <Select
                    disabled={readOnly}
                    value={meta.level}
                    onValueChange={(v) => setMeta({ ...meta, level: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRAINING_LEVELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {t(l.labelKey, l.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>
                    {t("ui.TrainingCourseDetailPage.puntosAlCompletar", "Puntos al completar")}
                  </Label>
                  <Input
                    disabled={readOnly}
                    max={POINTS_VALUE_MAX}
                    min={0}
                    step={1}
                    type="number"
                    value={meta.pointsValue}
                    onChange={(e) =>
                      setMeta({ ...meta, pointsValue: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("comun.puntajeParaAprobar")}</Label>
                  <Input
                    disabled={readOnly}
                    max={PASSING_SCORE_MAX}
                    min={PASSING_SCORE_MIN}
                    step={1}
                    type="number"
                    value={meta.passingScore}
                    onChange={(e) =>
                      setMeta({ ...meta, passingScore: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>
                  {t(
                    "ui.TrainingCourseDetailPage.plantillaDeCertificadoHtmlOpcional",
                    "Plantilla de certificado (HTML opcional)",
                  )}
                </Label>
                <Textarea
                  className="font-mono text-xs"
                  disabled={readOnly}
                  placeholder={t("ui.TrainingCourseDetailPage.plantillaPlaceholder", {
                    defaultValue:
                      "Usa {{guardName}}, {{courseTitle}}, {{score}}, {{serialNumber}}, {{issuedAt}}. Déjalo vacío para usar el certificado predeterminado con tu marca.",
                    // Las variables de la plantilla se muestran literales.
                    guardName: "{{guardName}}",
                    courseTitle: "{{courseTitle}}",
                    score: "{{score}}",
                    serialNumber: "{{serialNumber}}",
                    issuedAt: "{{issuedAt}}",
                  })}
                  rows={4}
                  value={meta.certificateTemplate}
                  onChange={(e) =>
                    setMeta({ ...meta, certificateTemplate: e.target.value })
                  }
                />
              </div>
              <div className="glass-sunken flex items-center justify-between p-3">
                <div>
                  <Label className="cursor-pointer">
                    {t("ui.TrainingCourseDetailPage.publicado", "Publicado")}
                  </Label>
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t(
                      "ui.TrainingCourseDetailPage.losCursosPublicadosPuedenAsignarse",
                    )}
                  </p>
                </div>
                <Switch
                  checked={meta.published}
                  disabled={readOnly}
                  onCheckedChange={(v) => setMeta({ ...meta, published: v })}
                />
              </div>
              {!readOnly && (
                <div className="flex justify-end">
                  <Button disabled={saving} variant="brand" onClick={saveMeta}>
                    {saving
                      ? t("adminOfficeUsers.editUser.form.savingEdit", "Guardando...")
                      : t("ui.EditSecurityGuard.guardarCambios", "Guardar cambios")}
                  </Button>
                </div>
              )}
            </Section>
          </TabsContent>

          {/* LESSONS */}
          <TabsContent className="mt-4" value="lessons">
            <LessonsManager
              courseId={course.id}
              lessons={lessons}
              readOnly={readOnly}
              onChange={load}
            />
          </TabsContent>

          {/* QUIZ */}
          <TabsContent className="mt-4" value="quiz">
            <QuizManager
              courseId={course.id}
              passingScore={course.passingScore ?? 70}
              quiz={course.quiz ?? null}
              readOnly={readOnly}
              onChange={load}
            />
          </TabsContent>

          {/* ASSIGN */}
          {canAssign && (
            <TabsContent className="mt-4" value="assign">
              <AssignGuardsPanel
                courseId={course.id}
                published={!!course.published}
              />
            </TabsContent>
          )}
        </Tabs>
      </PageContainer>
    </AppLayout>
  );
}
