import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  GraduationCap,
  Plus,
  Pencil,
  Trash2,
  Users,
  Award,
  Lock,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import {
  TRAINING_CATEGORIES,
  TRAINING_LEVELS,
  categoryLabel,
  levelLabel,
} from "./trainingConstants";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  Stagger,
  StatCard,
  StatsStrip,
  StatusBadge,
} from "@/components/kit";
import { DataTable, type Column } from "@/components/table/DataTable";
import { TableToolbar, TableSearch } from "@/components/table/TableToolbar";
import { usePermissions } from "@/hooks/usePermissions";
import {
  trainingCourseService,
  type TrainingCourse,
  type TrainingCourseInput,
} from "@/lib/api/trainingCourseService";

const emptyForm: TrainingCourseInput = {
  title: "",
  description: "",
  category: "security",
  level: "beginner",
  pointsValue: 10,
  passingScore: 70,
};

export default function TrainingCoursesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission("trainingCourseRead");
  const canCreate = hasPermission("trainingCourseCreate");
  const canEdit = hasPermission("trainingCourseEdit");
  const canDestroy = hasPermission("trainingCourseDestroy");

  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [openForm, setOpenForm] = useState(false);
  const [form, setForm] = useState<TrainingCourseInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await trainingCourseService.list(
        categoryFilter !== "all" ? { category: categoryFilter as any } : {},
        { limit: 100, offset: 0 },
      );

      setCourses(res.rows);
    } catch (err) {
      console.error(err);
      toast.error(t("ui.TrainingCoursesPage.noSePudieronCargarLos"));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    if (canRead) load();
    else setLoading(false);
  }, [canRead, load]);

  const filtered = courses.filter(
    (c) => !search || c.title.toLowerCase().includes(search.toLowerCase()),
  );

  const publishedCount = courses.filter((c) => c.published).length;
  const draftCount = courses.length - publishedCount;

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error(t("comun.elTituloEsObligatorio"));

      return;
    }
    setSaving(true);
    try {
      const created = await trainingCourseService.create(form);

      toast.success("Curso creado.");
      setOpenForm(false);
      setForm(emptyForm);
      navigate(`/training/courses/${created.id}`);
    } catch (err) {
      console.error(err);
      toast.error(t("ui.TrainingCoursesPage.noSePudoCrearEl"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await trainingCourseService.remove(deleteId);
      toast.success("Curso eliminado.");
      setDeleteId(null);
      load();
    } catch (err) {
      console.error(err);
      toast.error(t("ui.TrainingCoursesPage.noSePudoEliminarEl"));
    }
  };

  if (!canRead) {
    return (
      <AppLayout>
        <PageContainer width="wide">
          <EmptyState
            description={t("ui.TrainingCoursesPage.noTienesPermisoParaVer")}
            icon={<BookOpen />}
            title={t("ui.TrainingCoursesPage.sinAccesoALosCursos")}
          />
        </PageContainer>
      </AppLayout>
    );
  }

  const courseColumns: Column<TrainingCourse>[] = [
    {
      key: "title",
      header: "Curso",
      className: "max-w-[260px]",
      render: (_v, c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{c.title}</span>
            {c.isAddon && (
              <StatusBadge className="shrink-0" dot={false} tone="neutral">
                <Lock className="h-3 w-3" /> Addon
              </StatusBadge>
            )}
          </div>
          {c.description && (
            <div
              className="mt-0.5 truncate text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              {c.description}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: t("ui.TrainingCourses.categoria", "Categoría"),
      render: (_v, c) => categoryLabel(c.category),
    },
    { key: "level", header: "Nivel", render: (_v, c) => levelLabel(c.level) },
    {
      key: "pointsValue",
      header: "Puntos",
      numeric: true,
      render: (_v, c) => (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Award
            className="h-3.5 w-3.5"
            style={{ color: "var(--brand-text)" }}
          />{" "}
          {c.pointsValue ?? 0}
        </span>
      ),
    },
    {
      key: "published",
      header: "Estado",
      render: (_v, c) =>
        c.published ? (
          <StatusBadge tone="ok">Publicado</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Borrador</StatusBadge>
        ),
    },
  ];

  return (
    <AppLayout>

      <PageContainer width="wide">
        <PageHeader
          actions={
            canCreate ? (
              <Button
                variant="brand"
                onClick={() => {
                  setForm(emptyForm);
                  setOpenForm(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />{" "}
                {t("ui.TrainingCoursesPage.nuevoCurso")}{" "}
              </Button>
            ) : undefined
          }
          icon={<GraduationCap />}
          subtitle={t(
            "ui.TrainingCoursesPage.creaCursosProfesionalesAgregaLecciones",
          )}
          title={t(
            "ui.TrainingCoursesPage.cursosDeEntrenamiento",
            "Cursos de Entrenamiento",
          )}
        />

        <StatsStrip className="grid gap-4 sm:grid-cols-3">
          <StatCard
            accent="brand"
            icon={<BookOpen />}
            label="Cursos"
            value={courses.length}
          />
          <StatCard
            accent="ok"
            icon={<CheckCircle2 />}
            label="Publicados"
            value={publishedCount}
          />
          <StatCard
            accent="warn"
            icon={<Pencil />}
            label="Borradores"
            value={draftCount}
          />
        </StatsStrip>

        {/* La barra de filtros del sistema: una sola superficie de cristal, con
            el buscador y los filtros dentro. Antes era una fila de divs suelta
            con su propio gris y su propia altura. */}
        <TableToolbar
          search={
            <TableSearch
              placeholder={t("ui.TrainingCoursesPage.buscarCursos")}
              value={search}
              onChange={setSearch}
            />
          }
        >
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue
                placeholder={t("ui.TrainingCourses.categoria", "Categoría")}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t(
                  "ui.TrainingCourses.todasLasCategorias",
                  "Todas las categorías",
                )}
              </SelectItem>
              {TRAINING_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {t(c.labelKey, c.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableToolbar>

        <Section
          contentClassName="-mx-5 -mb-5"
          icon={<BookOpen />}
          title={t("ui.TrainingCourses.catalogoDeCursos", "Catálogo de cursos")}
        >
          <DataTable
            columns={courseColumns}
            data={filtered}
            emptyState={
              <EmptyState
                action={
                  canCreate ? (
                    <Button
                      variant="brand"
                      onClick={() => {
                        setForm(emptyForm);
                        setOpenForm(true);
                      }}
                    >
                      <Plus /> {t("ui.TrainingCoursesPage.nuevoCurso")}{" "}
                    </Button>
                  ) : undefined
                }
                className="border-0"
                description={t("ui.TrainingCoursesPage.creaTuPrimerCursoDe")}
                icon={<GraduationCap />}
                title={t("ui.TrainingCoursesPage.noSeEncontraronCursos")}
              />
            }
            loading={loading}
            rowActions={(c) => [
              {
                label: "Abrir / Editar",
                icon: <Pencil className="h-4 w-4" />,
                onClick: () => navigate(`/training/courses/${c.id}`),
              },
              {
                label: t(
                  "ui.TrainingCourses.progresoDeVigilantes",
                  "Progreso de vigilantes",
                ),
                icon: <Users className="h-4 w-4" />,
                onClick: () =>
                  navigate(`/training/courses/${c.id}/enrollments`),
              },
              ...(canDestroy && !c.isAddon
                ? [
                    {
                      label: "Eliminar",
                      icon: <Trash2 className="h-4 w-4" />,
                      destructive: true,
                      onClick: () => setDeleteId(c.id),
                    },
                  ]
                : []),
            ]}
            surface="none"
            onRowClick={(c) => navigate(`/training/courses/${c.id}`)}
          />
        </Section>
      </PageContainer>

      {/* Create dialog */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        {/* `max-w-lg` a secas borraba el tope móvil del propio diálogo
            (`max-w-[calc(100%-2rem)]`, misma familia en twMerge) y la ficha salía
            512 px de ancho en un teléfono de 375. Se repone el tope y el ancho
            grande queda a partir de `sm`. */}
        <DialogContent className="max-h-[90vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("ui.TrainingCoursesPage.nuevoCurso")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t("ui.TrainingCourses.titulo", "Título *")}</Label>
              <Input
                placeholder="Ej. Primeros auxilios en seguridad"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>
                {t("ui.TrainingCourses.descripcion", "Descripción")}
              </Label>
              <Textarea
                rows={3}
                value={form.description ?? ""}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("ui.TrainingCourses.categoria2", "Categoría")}</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    setForm({ ...form, category: v as any })
                  }
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
                <Label>Nivel</Label>
                <Select
                  value={form.level}
                  onValueChange={(v) => setForm({ ...form, level: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRAINING_LEVELS.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Puntos al completar</Label>
                <Input
                  min={0}
                  type="number"
                  value={form.pointsValue ?? 0}
                  onChange={(e) =>
                    setForm({ ...form, pointsValue: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>{t("comun.puntajeParaAprobar")}</Label>
                <Input
                  max={100}
                  min={0}
                  type="number"
                  value={form.passingScore ?? 70}
                  onChange={(e) =>
                    setForm({ ...form, passingScore: Number(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenForm(false)}>
              {t("actions.cancel")}
            </Button>
            <Button disabled={saving} variant="brand" onClick={handleCreate}>
              {saving ? "Creando..." : "Crear curso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ui.TrainingCourses.eliminarCurso", "¿Eliminar curso?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción archivará el curso. Las inscripciones y certificados
              existentes se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="cg-btn-bad" onClick={handleDelete}>
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
