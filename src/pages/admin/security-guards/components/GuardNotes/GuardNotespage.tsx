import type { GuardDetail, GuardNote, NoteAttachment, FileDescriptor } from '../../guardDetailTypes';
import { SearchInput } from "@/components/kit";
import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, X, StickyNote, Calendar, User, Trash2, Paperclip, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import GuardsLayout from '@/layouts/GuardsLayout';
import AppLayout from '@/layouts/app-layout';
import { useParams } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Modal, Section, EmptyState, StatusBadge, PageContainer, SmartImage } from '@/components/kit';
import { MeterBar } from '@/components/charts';
import securityGuardService from '@/lib/api/securityGuardService';
import { toast } from 'sonner';
import api from '@/lib/api';


import { localeActual } from "@/lib/localeActual";
import { hoyEnLaEmpresa, zonaDeLaEmpresa} from "@/lib/horaDeLaEmpresa";
// Notes API shape the page consumes. Defaults to the guard endpoints; a
// supervisor route injects `notesApi` + `entityId` (+navKey/title) to reuse this
// exact page against the supervisor's user-keyed notes. Guard usage passes none
// of the new props, so its behaviour is unchanged.
type NotePayload = { title: string; description: string; noteDate: string };

type NotesApi = {
  list: (id: string) => Promise<unknown>;
  create: (id: string, payload: NotePayload) => Promise<unknown>;
  remove?: (id: string, noteId: string) => Promise<unknown>;
  update?: (
    id: string,
    noteId: string,
    payload: NotePayload,
  ) => Promise<unknown>;
};

type Props = {
  guard?: GuardDetail;
  entityId?: string;
  navKey?: string;
  title?: string;
  notesApi?: NotesApi;
};

const guardNotesApi: NotesApi = {
  list: (id) => securityGuardService.getSecurityGuardNotes(id),
  create: (id, payload) =>
    securityGuardService.createSecurityGuardNote(id, payload),
  remove: (id, noteId) =>
    securityGuardService.destroySecurityGuardNote(id, noteId),
  update: (id, noteId, payload) =>
    securityGuardService.updateSecurityGuardNote(id, noteId, payload),
};

// Render a translation string that may contain <br /> markers as real JSX line
// breaks, instead of feeding it through dangerouslySetInnerHTML (no HTML sink).
function renderWithLineBreaks(text: string): React.ReactNode {
  return text.split(/<br\s*\/?>/i).map((part, idx, arr) => (
    <React.Fragment key={idx}>
      {part}
      {idx < arr.length - 1 && <br />}
    </React.Fragment>
  ));
}

function fmtDate(v: string | number | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);

  if (isNaN(d.getTime())) return String(v);

  return d.toLocaleDateString(localeActual(), { timeZone: zonaDeLaEmpresa(),
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initials(name: string): string {
  if (!name) return "?";

  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export default function GuardNotes({
  guard,
  entityId,
  navKey = "keep-safe",
  title = "guards.nav.notas",
  notesApi = guardNotesApi,
}: Props) {
  // The guard route (/guards/:id/notas) mounts this page WITHOUT a `guard`
  // prop or entityId, so fall back to the route id (the securityGuard id).
  const { id: routeId } = useParams();
  const resolvedId: string | undefined = entityId ?? guard?.id ?? routeId;
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [notesData, setNotesData] = useState<GuardNote[]>([]); // Vacío inicialmente
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GuardNote | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: hoyEnLaEmpresa(),
    attachments: [] as File[],
  });
  const [uploadProgress, setUploadProgress] = useState<Record<number, number>>(
    {},
  );

  const handleAddNote = () => {
    setShowModal(true);
    setFormData({
      title: "",
      description: "",
      date: hoyEnLaEmpresa(),
      attachments: [],
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const handleSubmitNote = () => {
    // Save note to backend
    (async () => {
      try {
        const payload: NotePayload = {
          title: formData.title,
          description: formData.description,
          noteDate: formData.date,
        };

        if (!resolvedId) {
          toast.error(
            t("guards.notes.missingId", {
              defaultValue: "No se encontró el identificador",
            }),
          );
          return;
        }

        // Upload attachments (pdf/images) to storage and collect metadata
        const attachments: FileDescriptor[] = [];
        const files = formData.attachments || [];

        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          // Validate mime/type
          const mime = f.type || "";
          let storageId = "";

          if (mime === "application/pdf") storageId = "notesPdf";
          else if (mime.startsWith("image/")) storageId = "notesImages";
          else {
            try {
              toast.error(
                t("guards.notes.form.attachments.invalidType", {
                  defaultValue: "Tipo de archivo no permitido",
                }),
              );
            } catch (e) {}
            continue;
          }

          // Validate size (<= 3MB)
          if (f.size > 3 * 1024 * 1024) {
            try {
              toast.error(
                t("guards.notes.form.attachments.tooLarge", {
                  defaultValue: "Archivo mayor a 3MB",
                }),
              );
            } catch (e) {}
            continue;
          }

          try {
            // initialize progress and upload with callback to update UI
            setUploadProgress((prev) => ({ ...prev, [i]: 0 }));
            const uploaded =
              await securityGuardService.uploadFileToStorageWithProgress(
                f,
                storageId,
                (p) => {
                  setUploadProgress((prev) => ({
                    ...prev,
                    [i]: Math.round(p),
                  }));
                },
              );
            setUploadProgress((prev) => ({ ...prev, [i]: 100 }));
            attachments.push(uploaded);
          } catch (err) {
            console.error("Upload failed for file", f.name, err);
            try {
              toast.error(
                t("guards.notes.form.attachments.uploadFailed", {
                  defaultValue: "Fallo al subir archivo",
                }),
              );
            } catch (e) {}
          }
        }

        const tenantId = localStorage.getItem("tenantId");

        // Create the note first (without attachments). We'll create attachment metadata afterwards.
        // The create adapter may return the raw {messageCode,message,data} API wrapper,
        // so unwrap to get the actual note object (and its real id).
        const created = (await notesApi.create(resolvedId, payload)) as
          | { data?: GuardNote; id?: string }
          | GuardNote;
        const createdNote = (
          created && "data" in created ? created.data : created
        ) as GuardNote | undefined;
        const noteId = createdNote?.id ?? (created as { id?: string })?.id;

        // For each uploaded file, create an attachment record linked to the created note
        if (tenantId && attachments.length > 0) {
          for (const up of attachments) {
            try {
              const attPayload = {
                name: up.name,
                mimeType: up.mimeType || "",
                sizeInBytes: up.sizeInBytes || up.size || 0,
                storageId:
                  up.storageId ||
                  (up.mimeType === "application/pdf"
                    ? "notesPdf"
                    : "notesImages"),
                // send encrypted token instead of raw privateUrl when available
                fileToken: up.fileToken || null,
                publicUrl: up.publicUrl || null,
                notableType: "note",
                notableId: noteId,
              };

              await api.post(`/tenant/${tenantId}/attachments`, attPayload);
            } catch (err) {
              console.error("Failed to create attachment metadata", err);
              try {
                toast.error(
                  t("guards.notes.form.attachments.metadataCreateFailed", {
                    defaultValue: "Fallo al guardar metadata del archivo",
                  }),
                );
              } catch (e) {}
            }
          }
        }

        // Refetch so the new note comes back with its attachments populated
        // (attachment records are created separately, above).
        await loadNotes();
        try {
          toast.success(
            t("guards.notes.noteCreated", {
              defaultValue: "Nota creada correctamente",
            }),
          );
        } catch (e) {}
        setShowModal(false);
        setFormData({
          title: "",
          description: "",
          date: hoyEnLaEmpresa(),
          attachments: [],
        });
        setUploadProgress({});
      } catch (err: any) {
        try {
          toast.error(
            t("guards.notes.noteCreateFailed", {
              defaultValue: "No se pudo crear la nota",
            }),
          );
        } catch (e) {}
        console.error("Failed to create note", err);
      }
    })();
  };

  // Load notes for guard
  const loadNotes = useCallback(async () => {
    if (!resolvedId) return;
    try {
      const resp = (await notesApi.list(resolvedId)) as
        | { rows?: GuardNote[]; data?: GuardNote[] }
        | GuardNote[];
      // resp may be { rows, count }, a { data } wrapper, or a bare array.
      const items = Array.isArray(resp)
        ? resp
        : (resp?.rows ?? resp?.data ?? []);

      setNotesData(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error("Failed to load notes", err);
      try {
        toast.error(
          t("guards.notes.loadError", {
            defaultValue: "Error al cargar notas",
          }),
        );
      } catch (e) {}
    }
  }, [resolvedId]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Delete a note (with confirmation via modal) then refetch.
  const handleConfirmDelete = async () => {
    if (!resolvedId || !deleteTarget) return;
    if (!notesApi.remove) {
      setDeleteTarget(null);
      return;
    }
    setDeleting(true);
    try {
      await notesApi.remove(resolvedId, deleteTarget.id);
      toast.success(
        t("guards.notes.noteDeleted", { defaultValue: "Nota eliminada" }),
      );
      setDeleteTarget(null);
      await loadNotes();
    } catch (err) {
      console.error("Failed to delete note", err);
      toast.error(
        t("guards.notes.noteDeleteFailed", {
          defaultValue: "No se pudo eliminar la nota",
        }),
      );
    } finally {
      setDeleting(false);
    }
  };

  const removeAttachment = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  const shortName = (name: string, max = 28) => {
    if (name.length <= max) return name;

    return name.slice(0, max) + "...";
  };

  // ── Derived: filtered feed ──────────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase();
  const filteredNotes = !q
    ? notesData
    : notesData.filter((n: GuardNote) => {
        const hay = [n?.title, n?.description, n?.addedBy]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return hay.includes(q);
      });

  return (
    <AppLayout>
      <GuardsLayout navKey={navKey} title={title}>
        <PageContainer>
          <Section
            title={t("guards.notes.sectionTitle", { defaultValue: "Notas" })}
            icon={<StickyNote size={16} />}
            action={
              <Button onClick={handleAddNote}>
                <Plus />
                {t("guards.notes.addButton", { defaultValue: "Agregar nota" })}
              </Button>
            }
          >
            {/* Search */}
            <SearchInput
              className="mb-5 max-w-sm"
              placeholder={
                  t("guards.notes.searchPlaceholder", {
                    defaultValue: "Buscar nota",
                  }) as string
                }
              type="text"
              value={searchQuery}
              onChange={(v) => setSearchQuery(v)}
            />

            {/* Notes feed */}
            {filteredNotes.length === 0 ? (
              <EmptyState
                action={!q ? (
                                    <Button size="sm" onClick={handleAddNote}>
                                        <Plus />
                                        {t('guards.notes.addButton', { defaultValue: 'Agregar nota' })}
                                    </Button>
                                ) : undefined}
                                description={q
                                    ? renderWithLineBreaks(t('guards.notes.empty.message', { defaultValue: 'No encontramos<br />notas que coincidan<br />con tu búsqueda' }))
                                    : t('guards.notes.empty.hint', { defaultValue: 'Crea la primera nota para este vigilante.' })}
                                icon={<StickyNote />}
                                title={q
                                    ? t('guards.notes.empty.title', { defaultValue: 'Sin resultados' })
                                    : t('guards.notes.empty.none', { defaultValue: 'Sin notas todavía' })}
              />
            ) : (
              <ul className="space-y-3">
                {filteredNotes.map((note: GuardNote, idx: number) => {
                  const author =
                    note?.addedBy || note?.createdBy?.fullName || "";
                  const when = fmtDate(
                    note?.noteDate ?? note?.date ?? note?.createdAt,
                  );
                  const attachments: NoteAttachment[] = Array.isArray(
                    note?.attachments,
                  )
                    ? note.attachments
                    : [];
                  return (
                    <li
                      key={note?.id ?? idx}
                      className="group glass-flat p-4 transition hover:border-foreground/20 hover:shadow"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold brand-fill">
                          {initials(author)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <h5 className="truncate text-sm font-semibold tracking-tight text-foreground">
                              {note?.title ||
                                t("guards.notes.untitled", {
                                  defaultValue: "Sin título",
                                })}
                            </h5>
                            <div className="flex shrink-0 items-center gap-1.5">
                              {when && (
                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium [background:var(--glass-sunken)] [color:var(--ink-soft)]">
                                  <Calendar size={11} />
                                  {when}
                                </span>
                              )}
                              {notesApi.remove && note?.id && (
                                <button
                                  onClick={() => setDeleteTarget(note)}
                                  title={
                                    t("guards.notes.actions.delete", {
                                      defaultValue: "Eliminar",
                                    }) as string
                                  }
                                  className="cg-focus rounded-lg p-1.5 opacity-0 transition hover:[color:var(--bad-text)] group-hover:opacity-100"
                                  style={{ color: "var(--ink-faint)" }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                          {note?.description && (
                            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm [color:var(--ink-soft)]">
                              {note.description}
                            </p>
                          )}

                          {/* Attachments */}
                          {attachments.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {attachments.map(
                                (att: NoteAttachment, ai: number) => {
                                  const href =
                                    att?.publicUrl ??
                                    att?.privateUrl ??
                                    att?.downloadUrl ??
                                    "";
                                  const mime = att?.mimeType || "";
                                  const isImg =
                                    mime.startsWith("image/") ||
                                    /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i.test(
                                      att?.name || "",
                                    );
                                  if (isImg && href) {
                                    return (
                                      <a
                                        key={att?.id ?? ai}
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                        title={att?.name || ""}
                                        className="block h-16 w-16 overflow-hidden rounded-lg border [background:var(--glass-sunken)]"
                                      >
                                        <SmartImage
                                          src={href}
                                          alt={att?.name || ""}
                                          rounded="rounded-lg"
                                          className="h-full w-full"
                                        />
                                      </a>
                                    );
                                  }
                                  return (
                                    <a
                                      key={att?.id ?? ai}
                                      href={href || undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={att?.name || ""}
                                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition [background:var(--glass-sunken)] hover:[border-color:var(--brand-line)]"
                                    >
                                      <Paperclip size={12} />
                                      <span className="max-w-[160px] truncate">
                                        {att?.name ||
                                          t("guards.notes.attachment", {
                                            defaultValue: "Adjunto",
                                          })}
                                      </span>
                                      {href && (
                                        <Download
                                          size={12}
                                          className="text-muted-foreground"
                                        />
                                      )}
                                    </a>
                                  );
                                },
                              )}
                            </div>
                          )}

                          {author && (
                            <div className="mt-2 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide [color:var(--ink-soft)]">
                              <User size={11} />
                              {author}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          {/* Modal */}
          {showModal && (
            <div
              className="glass-scrim fixed inset-0 z-50"
              onClick={handleCloseModal}
            >
              <div
                className="glass-raised fixed bottom-0 right-0 top-0 flex w-full max-w-md flex-col rounded-l-3xl rounded-r-none"
                style={{ position: "fixed" }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b px-6 py-5">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">
                      <StickyNote size={18} />
                    </span>
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      {t("guards.notes.modal.title", {
                        defaultValue: "Agregar nota",
                      })}
                    </h2>
                  </div>
                  <button
                    onClick={handleCloseModal}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={
                      t("guards.notes.modal.cancel", {
                        defaultValue: "Cancelar",
                      }) as string
                    }
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
                  {/* Título */}
                  <div>
                    <label className="cg-eyebrow mb-1 block">
                      {t("guards.notes.form.title.label", {
                        defaultValue: "Título",
                      })}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </label>
                    <Input
                      type="text"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      placeholder={
                        t("guards.notes.form.title.placeholder", {
                          defaultValue: "Ingresa el título de la nota",
                        }) as string
                      }
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* Descripción */}
                  <div>
                    <label className="cg-eyebrow mb-1 block">
                      {t("guards.notes.form.description.label", {
                        defaultValue: "Descripción",
                      })}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      placeholder={
                        t("guards.notes.form.description.placeholder", {
                          defaultValue: "Ingresa la descripción de la nota",
                        }) as string
                      }
                      className="cg-input w-full resize-none px-3 py-2 text-sm"
                      rows={6}
                    />
                  </div>

                  {/* Fecha */}
                  <div>
                    <label className="cg-eyebrow mb-1 block">
                      {t("guards.notes.form.date.label", {
                        defaultValue: "Fecha",
                      })}{" "}
                      <span style={{ color: "var(--bad-text)" }}>*</span>
                    </label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) =>
                        setFormData({ ...formData, date: e.target.value })
                      }
                      className="h-9 cursor-pointer text-sm"
                    />
                  </div>

                  {/* Attachments */}
                  <div>
                    <label className="cg-eyebrow mb-1 block">
                      {t("guards.notes.form.attachments.label", {
                        defaultValue: "Adjuntos",
                      })}
                    </label>

                    <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed p-3 transition-colors hover:border-foreground/30">
                      <div className="flex-1">
                        <div className="text-sm text-foreground/70">
                          {formData.attachments &&
                          formData.attachments.length > 0 ? (
                            <div className="space-y-2">
                              {formData.attachments.map((f, i) => (
                                <div
                                  key={i}
                                  className="flex w-full flex-col gap-2"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 truncate">
                                      <span
                                        className="truncate text-sm font-medium text-foreground"
                                        style={{ maxWidth: 200 }}
                                        title={f.name}
                                      >
                                        {shortName(f.name, 28)}
                                      </span>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeAttachment(i);
                                      }}
                                      className="cg-focus rounded p-1 transition-colors hover:[color:var(--bad-text)]"
                                      style={{ color: "var(--ink-faint)" }}
                                      aria-label={t("ui.RouteForm.quitar", { defaultValue: "Quitar {{name}}", name: f.name })}
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                  {/* Progress Bar */}
                                  {typeof uploadProgress[i] !== "undefined" && (
                                    <MeterBar
                                      pct={uploadProgress[i]}
                                      height={8}
                                      ariaLabel={t("ui.GuardNotespage.progresoDeSubida", "Progreso de subida")}
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                              <Plus size={14} />
                              {t("guards.notes.form.attachments.noFiles", {
                                defaultValue: "Ningún archivo seleccionado",
                              })}
                            </span>
                          )}
                        </div>
                      </div>

                      <input
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = e.target.files
                            ? Array.from(e.target.files)
                            : [];
                          setFormData({ ...formData, attachments: files });
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t px-6 py-5">
                  <button
                    onClick={handleCloseModal}
                    className="cg-btn-glass cg-focus h-9 rounded-full px-4 text-sm font-semibold transition"
                  >
                    {t("guards.notes.modal.cancel", {
                      defaultValue: "Cancelar",
                    })}
                  </button>
                  <button
                    onClick={handleSubmitNote}
                    className="cg-btn-brand cg-focus h-9 rounded-full px-5 text-sm font-semibold transition"
                  >
                    {t("guards.notes.modal.save", { defaultValue: "Guardar" })}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Delete confirmation */}
          {deleteTarget && (
            <Modal
              open={!!deleteTarget}
              onOpenChange={(o) => {
                if (!o && !deleting) setDeleteTarget(null);
              }}
              title={t("guards.notes.delete.title", {
                defaultValue: "Eliminar nota",
              })}
              icon={<Trash2 className="h-5 w-5" />}
              size="sm"
              footer={
                <>
                  <Button
                    variant="outline"
                    onClick={() => setDeleteTarget(null)}
                    disabled={deleting}
                  >
                    {t("guards.notes.modal.cancel", {
                      defaultValue: "Cancelar",
                    })}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleConfirmDelete}
                    disabled={deleting}
                  >
                    {deleting
                      ? t("actions.deleting", { defaultValue: "Eliminando…" })
                      : t("guards.notes.actions.delete", {
                          defaultValue: "Eliminar",
                        })}
                  </Button>
                </>
              }
            >
              <p className="text-sm text-muted-foreground">
                {t("guards.notes.delete.confirm", {
                  defaultValue:
                    '¿Seguro que deseas eliminar "{{title}}"? Esta acción no se puede deshacer.',
                  title:
                    deleteTarget?.title ||
                    t("guards.notes.untitled", { defaultValue: "Sin título" }),
                })}
              </p>
            </Modal>
          )}
        </PageContainer>
      </GuardsLayout>
    </AppLayout>
  );
}
