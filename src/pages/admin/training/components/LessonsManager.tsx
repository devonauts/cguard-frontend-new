import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus,
  Pencil,
  Trash2,
  Video,
  FileText,
  Paperclip,
  GripVertical,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Modal,
  EmptyState,
  FadeIn,
  Stagger,
  GlassPanel,
} from "@/components/kit";
import {
  trainingCourseService,
  type TrainingLesson,
  type TrainingResource,
  type TrainingLessonInput,
} from "@/lib/api/trainingCourseService";

interface Props {
  courseId: string;
  lessons: TrainingLesson[];
  readOnly: boolean;
  onChange: () => void;
}

interface LessonForm {
  title: string;
  description: string;
  videoUrl: string;
  richContent: string;
  durationMinutes: string;
  resources: TrainingResource[];
}

const emptyLesson: LessonForm = {
  title: "",
  description: "",
  videoUrl: "",
  richContent: "",
  durationMinutes: "",
  resources: [],
};

export default function LessonsManager({
  courseId,
  lessons,
  readOnly,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingLesson | null>(null);
  const [form, setForm] = useState<LessonForm>(emptyLesson);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const sorted = [...lessons].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const openNew = () => {
    setEditing(null);
    setForm(emptyLesson);
    setOpen(true);
  };

  const openEdit = (l: TrainingLesson) => {
    setEditing(l);
    setForm({
      title: l.title ?? "",
      description: l.description ?? "",
      videoUrl: l.videoUrl ?? "",
      richContent: l.richContent ?? "",
      durationMinutes:
        l.durationMinutes != null ? String(l.durationMinutes) : "",
      resources: Array.isArray(l.resources) ? l.resources : [],
    });
    setOpen(true);
  };

  const addResource = () =>
    setForm((f) => ({
      ...f,
      resources: [...f.resources, { name: "", url: "", type: "pdf" }],
    }));
  const updateResource = (i: number, patch: Partial<TrainingResource>) =>
    setForm((f) => ({
      ...f,
      resources: f.resources.map((r, idx) =>
        idx === i ? { ...r, ...patch } : r,
      ),
    }));
  const removeResource = (i: number) =>
    setForm((f) => ({
      ...f,
      resources: f.resources.filter((_, idx) => idx !== i),
    }));

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error(t("ui.LessonsManager.elTituloDeLaLeccion"));

      return;
    }
    const payload: TrainingLessonInput = {
      title: form.title,
      description: form.description || undefined,
      videoUrl: form.videoUrl || undefined,
      richContent: form.richContent || undefined,
      durationMinutes: form.durationMinutes
        ? Number(form.durationMinutes)
        : undefined,
      resources: form.resources.filter((r) => r.url && r.name),
    };

    setSaving(true);
    try {
      if (editing) {
        await trainingCourseService.updateLesson(editing.id, payload);
        toast.success(t("ui.LessonsManager.leccionActualizada"));
      } else {
        await trainingCourseService.createLesson(courseId, payload);
        toast.success(t("ui.LessonsManager.leccionAgregada"));
      }
      setOpen(false);
      onChange();
    } catch (err) {
      console.error(err);
      toast.error(t("ui.LessonsManager.noSePudoGuardarLa"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await trainingCourseService.removeLesson(deleteId);
      toast.success(t("ui.LessonsManager.leccionEliminada"));
      setDeleteId(null);
      onChange();
    } catch (err) {
      console.error(err);
      toast.error(t("ui.LessonsManager.noSePudoEliminarLa"));
    }
  };

  const move = async (l: TrainingLesson, dir: -1 | 1) => {
    const idx = sorted.findIndex((x) => x.id === l.id);
    const swap = sorted[idx + dir];

    if (!swap) return;
    try {
      await Promise.all([
        trainingCourseService.updateLesson(l.id, { order: swap.order }),
        trainingCourseService.updateLesson(swap.id, { order: l.order }),
      ]);
      onChange();
    } catch (err) {
      console.error(err);
      toast.error(t("ui.LessonsManager.noSePudoReordenar"));
    }
  };

  return (
    <FadeIn className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {t(
            "ui.LessonsManager.leccionesOrdenadasQueVeranLos",
            "Lecciones ordenadas que verán los vigilantes.",
          )}
        </p>
        {!readOnly && (
          <Button variant="brand" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" />{" "}
            {t("ui.LessonsManager.agregarLeccion", "Agregar lección")}
          </Button>
        )}
      </div>

      {sorted.length === 0 && (
        <EmptyState
          action={
            !readOnly ? (
              <Button variant="brand" onClick={openNew}>
                <Plus className="h-4 w-4 mr-1" />{" "}
                {t("ui.LessonsManager.agregarLeccion", "Agregar lección")}
              </Button>
            ) : undefined
          }
          description={t("ui.LessonsManager.agregaLeccionesConVideoTexto")}
          icon={<BookOpen />}
          title={t(
            "ui.LessonsManager.noHayLeccionesTodavia",
            "No hay lecciones todavía",
          )}
        />
      )}

      <Stagger className="space-y-3">
        {sorted.map((l, idx) => (
          <GlassPanel
            key={l.id}
            flat
            hover
            className="flex items-start gap-3 p-4"
          >
            <div
              className="flex shrink-0 flex-col items-center pt-1"
              style={{ color: "var(--ink-soft)" }}
            >
              {!readOnly ? (
                <div className="flex flex-col">
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md leading-none hover:text-foreground disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={() => move(l, -1)}
                  >
                    ▲
                  </button>
                  <GripVertical className="h-4 w-4 my-0.5" />
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md leading-none hover:text-foreground disabled:opacity-30"
                    disabled={idx === sorted.length - 1}
                    onClick={() => move(l, 1)}
                  >
                    ▼
                  </button>
                </div>
              ) : (
                <span className="text-sm font-semibold tabular-nums">
                  {idx + 1}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                <span className="tabular-nums">{idx + 1}.</span> {l.title}
              </div>
              {l.description && (
                <div
                  className="mt-0.5 text-sm"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {l.description}
                </div>
              )}
              <div
                className="mt-2 flex flex-wrap items-center gap-3 text-xs tabular-nums"
                style={{ color: "var(--ink-soft)" }}
              >
                {l.videoUrl && (
                  <span className="inline-flex items-center gap-1">
                    <Video className="h-3.5 w-3.5" /> Video
                  </span>
                )}
                {l.richContent && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> Texto
                  </span>
                )}
                {Array.isArray(l.resources) && l.resources.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="h-3.5 w-3.5" /> {l.resources.length}{" "}
                    recurso(s)
                  </span>
                )}
                {l.durationMinutes != null && (
                  <span>{l.durationMinutes} min</span>
                )}
              </div>
            </div>
            {!readOnly && (
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  aria-label={t(
                    "ui.LessonsManager.editarLeccion",
                    "Editar lección",
                  )}
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => openEdit(l)}
                >
                  <Pencil />
                </Button>
                <Button
                  aria-label={t(
                    "ui.LessonsManager.eliminarLeccion",
                    "Eliminar lección",
                  )}
                  size="icon-sm"
                  style={{ color: "var(--bad-text)" }}
                  variant="ghost"
                  onClick={() => setDeleteId(l.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            )}
          </GlassPanel>
        ))}
      </Stagger>

      {/* Lesson form */}
      <Modal
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button disabled={saving} variant="brand" onClick={handleSave}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </>
        }
        icon={<BookOpen />}
        open={open}
        title={
          editing
            ? t("ui.LessonsManager.editarLeccion", "Editar lección")
            : t("ui.LessonsManager.nuevaLeccion", "Nueva lección")
        }
        onOpenChange={setOpen}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("ui.LessonsManager.titulo", "Título *")}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("ui.LessonsManager.descripcion", "Descripción")}</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t(
                "ui.LessonsManager.urlDeVideoYoutubeVimeo",
                "URL de video (YouTube, Vimeo, etc.)",
              )}
            </Label>
            <Input
              placeholder="https://..."
              value={form.videoUrl}
              onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Contenido (texto enriquecido / HTML)</Label>
            <Textarea
              rows={5}
              value={form.richContent}
              onChange={(e) =>
                setForm({ ...form, richContent: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t("ui.LessonsManager.duracionMinutos", "Duración (minutos)")}
            </Label>
            <Input
              min={0}
              type="number"
              value={form.durationMinutes}
              onChange={(e) =>
                setForm({ ...form, durationMinutes: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Recursos (PDF, documentos)</Label>
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={addResource}
              >
                <Plus className="h-3 w-3 mr-1" /> {t("actions.add")}
              </Button>
            </div>
            {form.resources.map((r, i) => (
              /* Nombre + URL + papelera no caben en una fila de teléfono:
                   se apilan hasta `sm`. */
              <div
                key={i}
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                <Input
                  placeholder={t("comun.nombre")}
                  value={r.name}
                  onChange={(e) => updateResource(i, { name: e.target.value })}
                />
                <Input
                  placeholder="URL"
                  value={r.url}
                  onChange={(e) => updateResource(i, { url: e.target.value })}
                />
                <button
                  aria-label={t("ui.LessonsManager.eliminarRecurso")}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-md sm:self-auto"
                  style={{ color: "var(--bad-text)" }}
                  onClick={() => removeResource(i)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("ui.LessonsManager.eliminarLeccion2", "¿Eliminar lección?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "ui.LessonsManager.estaAccionNoSePuede",
                "Esta acción no se puede deshacer.",
              )}
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
    </FadeIn>
  );
}
