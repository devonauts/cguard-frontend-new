import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  GraduationCap,
  Users,
  BadgeCheck,
} from "lucide-react";
import { toast } from "sonner";

import {
  ENROLLMENT_STATUS_KEYS,
  enrollmentStatusLabel,
  ENROLLMENT_STATUS_TONE,
} from "./trainingConstants";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { MeterBar } from "@/components/charts";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
} from "@/lib/api/trainingCourseService";
import {
  trainingEnrollmentService,
  type EnrollmentRow,
  type EnrollmentDetail,
} from "@/lib/api/trainingEnrollmentService";
import {
  PageContainer,
  PageHeader,
  Section,
  StatCard,
  StatsStrip,
  Stagger,
  StatusBadge,
  EmptyState,
  SkeletonCards,
} from "@/components/kit";
import { DataTable, type Column } from "@/components/table/DataTable";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
export default function TrainingEnrollmentsPage() {
  const { t } = useTranslation();
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission("trainingEnrollmentRead");

  const [course, setCourse] = useState<TrainingCourse | null>(null);
  const [rows, setRows] = useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

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
          status: statusFilter !== "all" ? (statusFilter as any) : undefined,
        }),
      ]);

      setCourse(c);
      setRows(res.rows);
    } catch (err) {
      console.error(err);
      toast.error(t("ui.TrainingEnrollmentsPage.noSePudoCargarEl"));
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
      toast.error(t("ui.TrainingEnrollmentsPage.noSePudoCargarEl"));
    } finally {
      setDetailLoading(false);
    }
  };

  if (!canRead) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <EmptyState
            description={t("ui.TrainingEnrollmentsPage.noTienesPermisoParaVer")}
            icon={<Users />}
            title={t("ui.TrainingEnrollmentsPage.sinAcceso")}
          />
        </PageContainer>
      </AppLayout>
    );
  }

  const completedCount = rows.filter((r) => r.status === "completed").length;
  const realEnrollments = rows.filter(
    (r) => r.guardId || r.assignmentType === "individual",
  );

  /* Las columnas van a `DataTable` en vez de a un `<table>` a mano: es lo que
     da las cabeceras `cg-eyebrow`, los filos de pelo, el esqueleto de carga y
     el estado vacío que el resto de tablas del CRM ya tienen. */
  const enrollmentColumns: Column<EnrollmentRow>[] = [
    {
      key: "guardName",
      header: t("ui.SiteTour.vigilante", "Vigilante"),
      render: (_v, r) =>
        r.assignmentType === "all_guards" && !r.guardId ? (
          <StatusBadge dot={false} tone="neutral">
            {t("comun.todosLosVigilantesPlantilla")}
          </StatusBadge>
        ) : (
          r.guardName || "—"
        ),
    },
    {
      key: "status",
      header: t("comun.estado", "Estado"),
      render: (_v, r) => (
        <StatusBadge dot={false} tone={ENROLLMENT_STATUS_TONE[r.status]}>
          {enrollmentStatusLabel(r.status)}
        </StatusBadge>
      ),
    },
    {
      key: "progressPercentage",
      header: t("ui.TrainingEnrollmentsPage.progreso", "Progreso"),
      render: (_v, r) => (
        <div className="flex items-center gap-2">
          <MeterBar
            ariaLabel={t("ui.TrainingEnrollmentsPage.progreso", "Progreso")}
            className="w-24"
            height={6}
            pct={r.progressPercentage ?? 0}
          />
          <span
            className="text-xs tabular-nums"
            style={{ color: "var(--ink-soft)" }}
          >
            {r.progressPercentage ?? 0}%
          </span>
        </div>
      ),
    },
    {
      key: "quizPassed",
      header: t("ui.TrainingCourseDetailPage.cuestionario", "Cuestionario"),
      render: (_v, r) =>
        r.quizPassed ? (
          <StatusBadge dot={false} tone="ok">
            <span className="tabular-nums">
              {t("ui.TrainingEnrollmentsPage.aprobado", "Aprobado")}
              {r.quizScore != null ? ` (${r.quizScore}%)` : ""}
            </span>
          </StatusBadge>
        ) : (
          <span style={{ color: "var(--ink-soft)" }}>—</span>
        ),
    },
    {
      key: "dueDate",
      header: t("ui.TrainingEnrollmentsPage.fechaLimite", "Fecha límite"),
      render: (_v, r) => (
        <span className="tabular-nums" style={{ color: "var(--ink-soft)" }}>
          {r.dueDate
            ? new Date(r.dueDate).toLocaleDateString(localeActual())
            : "—"}
        </span>
      ),
    },
    {
      key: "completedAt",
      header: t("ui.TrainingEnrollmentsPage.completado", "Completado"),
      render: (_v, r) => (
        <span className="tabular-nums" style={{ color: "var(--ink-soft)" }}>
          {r.completedAt
            ? new Date(r.completedAt).toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa() })
            : "—"}
        </span>
      ),
    },
    {
      key: "detalle",
      header: t("ui.GuardAsistencia.detalle", "Detalle"),
      align: "right",
      render: (_v, r) =>
        r.assignmentType === "all_guards" && !r.guardId ? null : (
          <Button size="sm" variant="ghost" onClick={() => openDetail(r.id)}>
            {t("ui.RoutesPage.ver", "Ver")}
          </Button>
        ),
    },
  ];

  return (
    <AppLayout>

      <PageContainer width="wide">
        <PageHeader
          actions={
            <>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t("comun.todosLosEstados")}
                  </SelectItem>
                  {Object.keys(ENROLLMENT_STATUS_KEYS).map((v) => (
                    <SelectItem key={v} value={v}>
                      {enrollmentStatusLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => navigate(`/training/courses/${courseId}`)}
              >
                {t("ui.TrainingEnrollmentsPage.editarCurso")}
              </Button>
            </>
          }
          icon={<GraduationCap />}
          subtitle={t("ui.TrainingEnrollmentsPage.nDeMCompletaron", {
            defaultValue: "{{done}} de {{total}} vigilantes completaron el curso.",
            done: completedCount,
            total: realEnrollments.length,
          })}
          title={
            course?.title ??
            t("training.enrollments.title", "Progreso del curso")
          }
        />

        <StatsStrip className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            accent="info"
            icon={<Users />}
            label={t("ui.TrainingEnrollmentsPage.inscripciones", "Inscripciones")}
            value={realEnrollments.length}
          />
          <StatCard
            accent="ok"
            icon={<BadgeCheck />}
            label={t("ui.TrainingEnrollmentsPage.completaron", "Completaron")}
            value={completedCount}
          />
          <StatCard
            accent="warn"
            icon={<Clock />}
            label={t("guards.list.filter.statusPending", "Pendientes")}
            value={Math.max(realEnrollments.length - completedCount, 0)}
          />
        </StatsStrip>

        <Section
          contentClassName="-mx-5 -mb-5"
          icon={<Users />}
          title={t(
            "ui.TrainingEnrollmentsPage.progresoDeVigilantes",
            "Progreso de vigilantes",
          )}
        >
          <DataTable
            columns={enrollmentColumns}
            data={rows}
            emptyState={
              <EmptyState
                className="border-0"
                description={t(
                  "ui.TrainingEnrollmentsPage.cuandoAsignesEsteCursoA",
                )}
                icon={<Users />}
                title={t("ui.TrainingEnrollmentsPage.noHayInscripciones")}
              />
            }
            loading={loading}
            surface="none"
          />
        </Section>
      </PageContainer>

      <Sheet
        open={!!detail || detailLoading}
        onOpenChange={(o) => {
          if (!o) {
            setDetail(null);
          }
        }}
      >
        <SheetContent
          className="w-full overflow-y-auto sm:max-w-md"
          side="right"
        >
          <SheetHeader>
            <SheetTitle>
              {t("ui.TrainingEnrollmentsPage.detalleDeProgreso")}
            </SheetTitle>
          </SheetHeader>
          {detailLoading && (
            <div className="mt-6">
              <SkeletonCards className="sm:grid-cols-1" count={2} />
            </div>
          )}
          {detail && (
            <div className="mt-6 space-y-4">
              <div>
                <div className="text-sm font-semibold tracking-tight">
                  {detail.guardName}
                </div>
                <StatusBadge
                  className="mt-1.5"
                  dot={false}
                  tone={ENROLLMENT_STATUS_TONE[detail.status]}
                >
                  {enrollmentStatusLabel(detail.status)}
                </StatusBadge>
              </div>
              <div className="flex items-center gap-2">
                <MeterBar
                  ariaLabel={t("ui.TrainingEnrollmentsPage.progreso", "Progreso")}
                  className="flex-1"
                  height={8}
                  pct={detail.progressPercentage ?? 0}
                />
                <span className="text-sm tabular-nums">
                  {detail.progressPercentage ?? 0}%
                </span>
              </div>
              <div className="text-sm">
                {t("ui.TrainingEnrollmentsPage.cuestionarioDosPuntos", "Cuestionario:")}{" "}
                {detail.quizPassed ? (
                  <span
                    className="font-medium tabular-nums"
                    style={{ color: "var(--ok-text)" }}
                  >
                    {t("ui.TrainingEnrollmentsPage.aprobado", "Aprobado")}
                    {detail.quizScore != null ? ` (${detail.quizScore}%)` : ""}
                  </span>
                ) : (
                  <span style={{ color: "var(--ink-soft)" }}>
                    {t("ui.TrainingEnrollmentsPage.noAprobado")}
                  </span>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold tracking-tight">
                  {t("ui.TrainingEnrollmentsPage.lecciones", "Lecciones")}
                </h4>
                <div className="space-y-2">
                  {detail.lessonCompletions.length === 0 && (
                    <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                      {t(
                        "ui.TrainingEnrollments.aunNoHaCompletadoLecciones",
                        "Aún no ha completado lecciones.",
                      )}
                    </p>
                  )}
                  {detail.lessonCompletions.map((lc) => (
                    <div
                      key={lc.lessonId}
                      className="flex items-center gap-2 text-sm"
                    >
                      {lc.completedAt ? (
                        <CheckCircle2
                          className="h-4 w-4"
                          style={{ color: "var(--ok-text)" }}
                        />
                      ) : (
                        <Clock
                          className="h-4 w-4"
                          style={{ color: "var(--ink-faint)" }}
                        />
                      )}
                      <span className="flex-1">{lc.title}</span>
                      <span
                        className="text-xs tabular-nums"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {lc.completedAt
                          ? new Date(lc.completedAt).toLocaleDateString(
                              localeActual(), { timeZone: zonaDeLaEmpresa() })
                          : t("comun.pendiente", "Pendiente")}
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
