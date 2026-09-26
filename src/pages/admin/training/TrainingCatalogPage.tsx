import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Award, GraduationCap, Lock, Users } from "lucide-react";
import { toast } from "sonner";

import { categoryLabel, levelLabel } from "./trainingConstants";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useWhiteLabel } from "@/contexts/WhiteLabelContext";
import {
  trainingCourseService,
  type TrainingCourse,
} from "@/lib/api/trainingCourseService";
import {
  PageContainer,
  PageHeader,
  EmptyState,
  SkeletonCards,
  GlassPanel,
  StatusBadge,
  SmartImage,
} from "@/components/kit";

export default function TrainingCatalogPage() {
  const { t } = useTranslation();
  /* El nombre del anfitrión: «C-Guard Pro» en el de la plataforma, el del
     socio en el suyo. Por eso estos textos ya no lo llevan escrito. */
  const { platformName: nombreDeMarca } = useWhiteLabel();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission("trainingCourseRead");
  const canAssign = hasPermission("trainingEnrollmentCreate");

  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trainingCourseService.list(
        {},
        { limit: 200, offset: 0 },
      );

      setCourses(res.rows.filter((c) => c.isAddon));
    } catch (err) {
      console.error(err);
      toast.error(t("ui.TrainingCatalogPage.noSePudoCargarEl"));
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
        <PageContainer width="wide">
          <EmptyState
            description={t("ui.TrainingCatalogPage.noTienesPermisoParaVer")}
            icon={<Lock />}
            title={t(
              "ui.TrainingCatalog.sinAccesoAlCatalogo",
              "Sin acceso al catálogo",
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
          icon={<GraduationCap />}
          subtitle={t("ui.TrainingCatalogPage.cursosAddonOtorgadosATu", { marca: nombreDeMarca })}
          title={t("ui.TrainingCatalogPage.cursosDeLaPlataforma")}
        />

        {loading && <SkeletonCards className="lg:grid-cols-3" count={6} />}
        {!loading && courses.length === 0 && (
          <EmptyState
            description={t("ui.TrainingCatalogPage.tuEmpresaAunNoTiene")}
            icon={<GraduationCap />}
            title={t("ui.TrainingCatalogPage.sinCursosAddon")}
          />
        )}

        {/* El catálogo pide hasta 200 cursos: la tarjeta se repite, así que va
            en cristal PLANO. Con `.glass` serían 200 desenfoques y el
            desplazamiento se cae. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!loading &&
            courses.map((c) => (
              <GlassPanel
                key={c.id}
                flat
                hover
                className="flex flex-col overflow-hidden"
              >
                {c.coverUrl && (
                  <div
                    className="h-32 w-full overflow-hidden"
                    style={{ background: "var(--glass-sunken)" }}
                  >
                    <SmartImage
                      alt={c.title}
                      className="h-full w-full"
                      fit="cover"
                      rounded="rounded-none"
                      src={c.coverUrl}
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-sm font-semibold tracking-tight">
                      {c.title}
                    </h3>
                    <StatusBadge
                      className="shrink-0"
                      dot={false}
                      tone="neutral"
                    >
                      <Lock className="h-3 w-3" /> {t("ui.TrainingCoursesPage.addon", "Addon")}
                    </StatusBadge>
                  </div>
                  {c.description && (
                    <p
                      className="mt-2 line-clamp-3 text-sm"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {c.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <StatusBadge dot={false} tone="neutral">
                      {categoryLabel(c.category)}
                    </StatusBadge>
                    <StatusBadge dot={false} tone="neutral">
                      {levelLabel(c.level)}
                    </StatusBadge>
                    <span
                      className="inline-flex items-center gap-1 tabular-nums"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      <Award
                        className="h-3.5 w-3.5"
                        style={{ color: "var(--brand-text)" }}
                      />{" "}
                      {t("ui.TrainingCatalogPage.nPts", {
                        defaultValue: "{{n}} pts",
                        n: c.pointsValue ?? 0,
                      })}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      className="flex-1"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/training/courses/${c.id}`)}
                    >
                      {t("ui.RoutesPage.ver", "Ver")}
                    </Button>
                    {canAssign && (
                      <Button
                        className="flex-1"
                        size="sm"
                        variant="brand"
                        onClick={() => navigate(`/training/courses/${c.id}`)}
                      >
                        <Users /> {t("ui.SecurityGuardsPage.asignar", "Asignar")}
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
