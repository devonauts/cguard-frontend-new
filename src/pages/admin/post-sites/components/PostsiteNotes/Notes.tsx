import type { PostSite } from "@/types";

import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  ChevronDown,
  Plus,
  X,
  EllipsisVertical,
  Eye,
  Pencil,
  Trash,
  StickyNote,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import MobileCardList from "@/components/responsive/MobileCardList";
import { EmptyState, Modal } from "@/components/kit";
import {
  FIELD_CLS,
  FIELD_CLS_LG,
} from "@/pages/admin/clientes/components/_shared/tab-kit";
import { Button } from "@/components/ui/button";
import { postSiteService } from "@/lib/api/postSiteService";
import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";

type Props = {
  site?: PostSite;
};

// Raw note row from the post-site notes endpoint.
interface NoteApiRow {
  id?: string;
  _id?: string;
  title?: string;
  description?: string;
  noteDate?: string;
  createdAt?: string;
  createdBy?: { fullName?: string; name?: string } | null;
  createdById?: string;
}
// Normalized note row for the table.
interface NoteRow {
  id: string;
  title: string;
  description: string;
  date: string;
  addedBy?: string;
  raw?: NoteApiRow;
}

export default function PostSiteNotes({ site }: Props) {
  const { t } = useTranslation();

  const actionRef = useRef<HTMLDivElement>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionSelection, setActionSelection] = useState<string>("Action");
  const [searchQuery, setSearchQuery] = useState("");
  const [notesData, setNotesData] = useState<NoteRow[]>([]);
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState<{
    title: string;
    description: string;
    date: string;
    attachments: File[];
    id?: string;
  }>({
    title: "",
    description: "",
    date: new Date().toISOString().split("T")[0],
    attachments: [],
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [detailsNote, setDetailsNote] = useState<NoteApiRow | null>(null);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([]);

  const isFormValid =
    formData.title.trim() !== "" &&
    formData.description.trim() !== "" &&
    Boolean(formData.date);

  const validateForm = () => {
    if (!formData.title || !formData.title.trim()) {
      toast.error(
        t("clients.notes.validation.titleRequired", "Title is required"),
      );

      return false;
    }
    if (!formData.description || !formData.description.trim()) {
      toast.error(
        t(
          "clients.notes.validation.descriptionRequired",
          "Description is required",
        ),
      );

      return false;
    }
    if (!formData.date) {
      toast.error(
        t("clients.notes.validation.dateRequired", "Date is required"),
      );

      return false;
    }

    return true;
  };

  const handleAddNote = () => {
    setViewOnly(false);
    setShowModal(true);
    setFormData({
      title: "",
      description: "",
      date: new Date().toISOString().split("T")[0],
      attachments: [],
    });
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setViewOnly(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        actionRef.current &&
        !actionRef.current.contains(event.target as Node)
      ) {
        setActionOpen(false);
      }
    };

    if (actionOpen) {
      document.addEventListener("mousedown", handleClickOutside);

      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [actionOpen]);

  // Load notes when site changes
  useEffect(() => {
    let mounted = true;

    async function loadNotes() {
      if (!site || !site.id) return;
      try {
        const resp = await postSiteService.getPostSiteNotes(String(site.id), {
          limit: 9999,
          offset: 0,
        });

        if (!mounted) return;
        const rows = Array.isArray(resp?.rows)
          ? resp.rows
          : Array.isArray(resp)
            ? resp
            : [];

        setNotesData(
          rows.map((r: NoteApiRow) => ({
            id: String(r.id || r._id),
            title: r.title || "",
            description: r.description || "",
            date: r.noteDate || (r.createdAt ? r.createdAt.split("T")[0] : ""),
            addedBy:
              (r.createdBy && r.createdBy.fullName) || r.createdById || "",
            raw: r,
          })),
        );
      } catch (err) {
        console.warn("[PostSiteNotes] load error", err);
        toast.error(t("notes.loadError", "Could not load notes"));
      }
    }
    loadNotes();

    return () => {
      mounted = false;
    };
  }, [site && site.id]);

  const handleSubmitNote = () => {
    if (!site || !site.id) {
      toast.error(t("notes.noSite", "No post site selected"));

      return;
    }

    (async () => {
      try {
        const payload: any = {
          title: formData.title,
          description: formData.description,
          noteDate: formData.date,
        };

        if (!validateForm()) return;

        // If editing an existing note (we store id in formData as well)
        if ((formData as any).id) {
          const noteId = String((formData as any).id);
          const resp = await postSiteService.updatePostSiteNote(
            String(site.id),
            noteId,
            payload,
          );
          const created = resp && resp.data ? resp.data : resp;

          setNotesData((prev) =>
            prev.map((n) =>
              String(n.id) === String(noteId)
                ? {
                    ...n,
                    title: created.title || payload.title,
                    description: created.description || payload.description,
                    date: created.noteDate || payload.noteDate,
                  }
                : n,
            ),
          );
          toast.success(t("notes.updated", "Note updated"));
        } else {
          const resp = await postSiteService.createPostSiteNote(
            String(site.id),
            payload,
          );
          const created = resp && resp.data ? resp.data : resp;
          const row = {
            id: String(created.id || created._id || Date.now()),
            title: created.title || payload.title,
            description: created.description || payload.description,
            date: created.noteDate || payload.noteDate,
            addedBy:
              (created.createdBy && created.createdBy.fullName) ||
              created.createdById ||
              "",
          };

          setNotesData((prev) => [row, ...prev]);
          toast.success(t("notes.created", "Note created"));
        }

        setShowModal(false);
        setFormData({
          title: "",
          description: "",
          date: new Date().toISOString().split("T")[0],
          attachments: [],
        });
      } catch (err) {
        console.warn("[PostSiteNotes] submit error", err);
        toast.error(t("notes.saveError", "Could not save note"));
      }
    })();
  };

  const removeAttachment = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function deleteSelected() {
    if (!site || !site.id) return;
    if (selectedIds.length === 0)
      return toast.error(t("notes.noSelection", "No notes selected"));
    const ids = [...selectedIds];

    try {
      for (const id of ids) {
        await postSiteService.destroyPostSiteNote(String(site.id), id);
      }
      setNotesData((prev) => prev.filter((n) => !ids.includes(String(n.id))));
      setSelectedIds([]);
      toast.success(t("notes.deleted", "Notes deleted"));
    } catch (err) {
      console.warn("[PostSiteNotes] delete error", err);
      toast.error(t("notes.deleteError", "Could not delete notes"));
    }
  }

  const shortName = (name: string, max = 28) =>
    name.length <= max ? name : name.slice(0, max) + "...";

  const containerRef = useRef<HTMLDivElement | null>(null);

  useScrollToTopOnMount(containerRef);

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col animate-fade-up"
    >
      <div className="glass flex min-h-0 flex-1 flex-col p-6">
        {/* Sin `flex-wrap` el buscador se quedaba en ~30 px de ancho entre los
            dos botones en un teléfono. */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div ref={actionRef} className="relative">
            <button
              className="cg-btn-glass cg-focus flex min-w-[100px] items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
              onClick={() => setActionOpen((v) => !v)}
            >
              {t("actions.action", "Action")}
              <ChevronDown size={16} />
            </button>
            {actionOpen && (
              <div className="glass-raised absolute left-0 z-10 mt-1 w-full">
                <button
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                  onClick={() => {
                    setActionOpen(false);
                    setConfirmDeleteIds(selectedIds);
                  }}
                >
                  {t("clients.notes.delete", "Delete")}
                </button>
              </div>
            )}
          </div>

          <div className="min-w-48 flex-1 sm:max-w-xs">
            <div className="relative">
              <Search
                className="absolute left-3 top-3 text-muted-foreground"
                size={16}
              />
              <input
                className={`${FIELD_CLS} pl-9`}
                placeholder={t(
                  "clients.notes.notesearchPlaceholder",
                  "Search note",
                )}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <button
            className="cg-btn-brand cg-focus flex items-center gap-2 rounded-md px-6 py-2 text-sm font-semibold transition-colors"
            onClick={handleAddNote}
          >
            <Plus size={18} />
            {t("clients.notes.addNote", "Add Note")}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="md:block hidden overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="cg-eyebrow px-2 py-2">
                    <input
                      aria-label="Select all notes"
                      checked={
                        (notesData || []).length > 0 &&
                        selectedIds.length === (notesData || []).length
                      }
                      className="rounded"
                      type="checkbox"
                      onChange={(e) => {
                        const checked = e.target.checked;

                        if (checked)
                          setSelectedIds(
                            (notesData || []).map((n) => String(n.id)),
                          );
                        else setSelectedIds([]);
                      }}
                    />
                  </th>
                  <th className="cg-eyebrow px-2 py-2">
                    {t("clients.notes.Title")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2">
                    {t("clients.notes.Date")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2">
                    {t("clients.notes.Added By")}
                  </th>
                  <th className="cg-eyebrow px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {notesData.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8" colSpan={6}>
                      <EmptyState
                        description={t("clients.empty.description")}
                        icon={<StickyNote />}
                        title={t("clients.empty.title")}
                      />
                    </td>
                  </tr>
                ) : (
                  notesData.map((note, idx) => (
                    <tr
                      key={note.id || idx}
                      className="border-b hover:bg-muted/40"
                    >
                      <td className="px-2 py-2.5 text-sm text-foreground">
                        <input
                          checked={selectedIds.includes(String(note.id))}
                          type="checkbox"
                          onChange={() => toggleSelect(String(note.id))}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-sm text-foreground">
                        {note.title}
                      </td>
                      <td className="px-2 py-2.5 text-sm text-foreground">
                        {note.date}
                      </td>
                      <td className="px-2 py-2.5 text-sm text-foreground">
                        {note.addedBy || "-"}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <div className="relative inline-block">
                          <button
                            className="p-2 rounded-full hover:bg-muted focus:outline-none"
                            title={t("actions.action") || "Actions"}
                            onClick={() =>
                              setOpenMenuId((prev) =>
                                prev === note.id ? null : String(note.id),
                              )
                            }
                          >
                            <EllipsisVertical size={18} />
                          </button>

                          {openMenuId === String(note.id) && (
                            <div className="glass-raised absolute right-0 z-50 mt-2 w-44">
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 focus:outline-none"
                                onClick={() => {
                                  setDetailsNote(note.raw || note);
                                  setOpenMenuId(null);
                                }}
                              >
                                <Eye size={16} />
                                <span className="text-sm">
                                  {t("actions.viewDetails") || "View Details"}
                                </span>
                              </button>
                              <button
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 focus:outline-none"
                                onClick={() => {
                                  setFormData({
                                    title: note.title,
                                    description: note.description,
                                    date: note.date,
                                    attachments: [],
                                    id: note.id,
                                  });
                                  setViewOnly(false);
                                  setShowModal(true);
                                  setOpenMenuId(null);
                                }}
                              >
                                <Pencil size={16} />
                                <span className="text-sm">
                                  {t("actions.edit") || "Edit"}
                                </span>
                              </button>
                              <button
                                className="cg-btn-ghost cg-focus flex w-full items-center gap-2 px-3 py-2"
                                style={{ color: "var(--bad-text)" }}
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setConfirmDeleteIds([String(note.id)]);
                                }}
                              >
                                <Trash size={16} />
                                <span className="text-sm">
                                  {t("actions.delete") || "Delete"}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden">
            <MobileCardList
              items={notesData}
              loading={false}
              renderCard={(note: NoteRow) => (
                <div>
                  <div className="text-sm font-semibold">{note.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {note.date}
                  </div>
                  <div className="text-sm text-foreground mt-2">
                    {note.description}
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center"
          onClick={handleCloseModal}
        >
          <div
            className="absolute inset-0"
            style={{ background: "oklch(0 0 0 / 0.45)" }}
            onClick={handleCloseModal}
          />

          {/* Sin tope de altura el `overflow-y-auto` no llega a activarse: el
              panel crecía por encima del borde superior de la pantalla. */}
          <div
            className="glass-raised max-h-[90vh] w-full overflow-y-auto sm:ml-auto sm:w-96"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b p-6">
              <h2 className="text-lg font-semibold text-foreground">
                {t("clients.notes.form.Title", "Add New Note")}
              </h2>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("clients.notes.form.Titlenote", "Title *")}{" "}
                </label>
                <input
                  className={FIELD_CLS_LG}
                  placeholder={t("clients.notes.form.Titlenote", "Title *")}
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("clients.notes.form.Description", "Description *")}{" "}
                </label>
                <textarea
                  className={`${FIELD_CLS_LG} resize-none`}
                  placeholder={t(
                    "clients.notes.form.Descriptioninput",
                    "Description *",
                  )}
                  rows={6}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("clients.notes.form.Date", "Date *")}{" "}
                </label>
                <input
                  className={`${FIELD_CLS_LG} cursor-pointer`}
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("clients.notes.form.AttachFile", "Attachments")}
                </label>

                <label className="glass-sunken flex w-full cursor-pointer items-center justify-between gap-3 p-3">
                  <div className="flex-1">
                    <div className="text-sm text-foreground/70">
                      {formData.attachments &&
                      formData.attachments.length > 0 ? (
                        <div className="space-y-2">
                          {formData.attachments.map((f, i) => (
                            <div
                              key={`${f.name}-${(f as any).size ?? ""}-${(f as any).lastModified ?? ""}-${i}`}
                              className="flex items-center justify-between gap-3"
                            >
                              <div className="flex items-center gap-3 truncate">
                                <span
                                  className="text-sm text-foreground font-medium truncate"
                                  style={{ maxWidth: 200 }}
                                  title={f.name}
                                >
                                  {shortName(f.name, 28)}
                                </span>
                              </div>
                              <button
                                aria-label={`Remove ${f.name}`}
                                className="cg-focus rounded p-1"
                                style={{ color: "var(--bad-text)" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeAttachment(i);
                                }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t(
                            "clients.notes.form.NoFilesSelected",
                            "No files selected",
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <input
                    multiple
                    className="sr-only"
                    type="file"
                    onChange={(e) => {
                      const files = e.target.files
                        ? Array.from(e.target.files)
                        : [];

                      setFormData({ ...formData, attachments: files });
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t p-6">
              <button
                className={`cg-btn-brand cg-focus rounded-md px-6 py-2 font-semibold ${!isFormValid ? "opacity-50 cursor-not-allowed" : ""}`}
                disabled={!isFormValid}
                onClick={handleSubmitNote}
              >
                {t("actions.save", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDeleteIds([])}>
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!site || !site.id) {
                  setNotesData((prev) =>
                    prev.filter(
                      (n) => !confirmDeleteIds.includes(String(n.id)),
                    ),
                  );
                  toast.success(t("notes.deleted", "Notas eliminadas"));
                  setConfirmDeleteIds([]);

                  return;
                }
                try {
                  const results = await Promise.allSettled(
                    confirmDeleteIds.map((id) =>
                      postSiteService.destroyPostSiteNote(String(site.id), id),
                    ),
                  );
                  const successes = results.reduce(
                    (acc, r, idx) =>
                      r.status === "fulfilled"
                        ? acc.concat(confirmDeleteIds[idx])
                        : acc,
                    [] as string[],
                  );

                  if (successes.length > 0) {
                    setNotesData((prev) =>
                      prev.filter((n) => !successes.includes(String(n.id))),
                    );
                    setSelectedIds((prev) =>
                      prev.filter((id) => !successes.includes(id)),
                    );
                    toast.success(t("notes.deleted", "Notas eliminadas"));
                  }
                  const failures = results.filter(
                    (r) => r.status === "rejected",
                  );

                  if (failures.length > 0) {
                    console.error("Some deletions failed", failures);
                    toast.error(
                      t(
                        "notes.deleteError",
                        "No se pudieron eliminar las notas",
                      ),
                    );
                  }
                } catch (err) {
                  console.warn("[PostSiteNotes] delete error", err);
                  toast.error(
                    t("notes.deleteError", "No se pudieron eliminar las notas"),
                  );
                } finally {
                  setConfirmDeleteIds([]);
                }
              }}
            >
              {t("actions.delete", "Eliminar")}
            </Button>
          </>
        }
        icon={<Trash className="h-5 w-5" />}
        open={confirmDeleteIds.length > 0}
        size="sm"
        title={t("clients.notes.confirmDeleteTitle", "¿Eliminar nota(s)?")}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteIds([]);
        }}
      >
        <p className="text-sm text-foreground/70">
          {t(
            "clients.notes.confirmDeleteMessage",
            "¿Seguro que deseas eliminar permanentemente la(s) nota(s) seleccionada(s)? Esta acción no se puede deshacer.",
          )}
        </p>
      </Modal>

      <Modal
        footer={
          detailsNote ? (
            <Button
              onClick={() => {
                setFormData({
                  title: detailsNote.title ?? "",
                  description: detailsNote.description ?? "",
                  date:
                    detailsNote.noteDate ||
                    detailsNote.createdAt?.split("T")?.[0] ||
                    "",
                  attachments: [],
                  id: detailsNote.id || detailsNote._id,
                });
                setViewOnly(false);
                setShowModal(true);
                setDetailsNote(null);
              }}
            >
              {t("actions.edit", "Editar")}
            </Button>
          ) : undefined
        }
        icon={<StickyNote className="h-5 w-5" />}
        open={!!detailsNote}
        title={t("clients.notes.detailsTitle", "Detalle de la nota")}
        onOpenChange={(o) => {
          if (!o) setDetailsNote(null);
        }}
      >
        {detailsNote && (
          <div className="space-y-2">
            <div className="text-sm text-foreground">
              <strong>{t("clients.notes.form.Title", "Título")}: </strong>
              {detailsNote.title}
            </div>
            <div className="text-sm text-foreground">
              <strong>{t("clients.notes.form.Date", "Fecha")}: </strong>
              {detailsNote.noteDate || detailsNote.createdAt?.split("T")?.[0]}
            </div>
            <div className="text-sm text-foreground">
              <strong>
                {t("clients.notes.form.Description", "Descripción")}:{" "}
              </strong>
              <div className="mt-1 whitespace-pre-wrap">
                {detailsNote.description}
              </div>
            </div>
            <div className="text-sm text-foreground">
              <strong>{t("clients.notes.addedBy", "Agregado por")}: </strong>
              {(detailsNote.createdBy &&
                (detailsNote.createdBy.fullName ||
                  detailsNote.createdBy.name)) ||
                detailsNote.createdById ||
                "-"}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
