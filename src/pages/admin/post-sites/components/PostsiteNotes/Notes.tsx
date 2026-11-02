import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  ChevronDown,
  Plus,
  X,
  EllipsisVertical,
  Eye,
  Pencil,
  Trash,
  StickyNote,
  Paperclip,
} from "lucide-react";
import MobileCardList from "@/components/responsive/MobileCardList";
import { EmptyState, Modal, SearchInput } from "@/components/kit";
import {
  FIELD_CLS,
  FIELD_CLS_LG,
} from "@/pages/admin/clientes/components/_shared/tab-kit";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { postSiteService } from "@/lib/api/postSiteService";
import securityGuardService from "@/lib/api/securityGuardService";
import api from "@/lib/api";
import { toast } from "sonner";
import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import type { PostSite } from "@/types";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { filterNotes } from "./filterNotes";
import { fileUrlFromFile } from "@/lib/fileUrl";

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
  attachments?: NoteAttachmentRow[];
}
interface NoteAttachmentRow {
  id?: string;
  name?: string;
  publicUrl?: string | null;
  privateUrl?: string | null;
  downloadUrl?: string | null;
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
    date: hoyEnLaEmpresa(),
    attachments: [],
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewOnly, setViewOnly] = useState(false);
  const [detailsNote, setDetailsNote] = useState<NoteApiRow | null>(null);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // Bumped after uploading attachments so the list (and the detail view)
  // shows the files the server linked to the note.
  const [reloadKey, setReloadKey] = useState(0);
  const visibleNotes = useMemo(
    () => filterNotes(notesData, searchQuery),
    [notesData, searchQuery],
  );

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
      date: hoyEnLaEmpresa(),
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
  }, [site && site.id, reloadKey]);

  /**
   * Uploads the chosen files and links them to the note. Returns how many
   * failed, so the person is told instead of silently losing them.
   */
  const uploadAttachments = async (noteId: string, files: File[]) => {
    const tenantId = localStorage.getItem("tenantId");
    let failed = 0;
    for (const f of files) {
      try {
        const storageId =
          f.type === "application/pdf" ? "notesPdf" : "notesImages";
        const up: any = await securityGuardService.uploadFileToStorage(
          f,
          storageId,
        );
        await api.post(`/tenant/${tenantId}/attachments`, {
          name: up.name || f.name,
          mimeType: f.type || "application/octet-stream",
          sizeInBytes: up.sizeInBytes || f.size,
          storageId,
          fileToken: up.fileToken || null,
          // Without fileToken or privateUrl the server refuses the record (400).
          privateUrl: up.fileToken ? null : up.privateUrl || null,
          publicUrl: up.publicUrl || null,
          notableType: "note",
          notableId: noteId,
        });
      } catch (err) {
        console.warn("[PostSiteNotes] attachment upload failed", f.name, err);
        failed += 1;
      }
    }
    return failed;
  };

  const handleSubmitNote = () => {
    if (saving) return;
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
        setSaving(true);
        const files = formData.attachments || [];

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
          if (files.length) {
            const failed = await uploadAttachments(noteId, files);
            if (failed) reportFailedUploads(failed);
            setReloadKey((k) => k + 1);
          }
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
          if (files.length && created?.id) {
            const failed = await uploadAttachments(String(created.id), files);
            if (failed) reportFailedUploads(failed);
            setReloadKey((k) => k + 1);
          }
          setNotesData((prev) => [row, ...prev]);
          toast.success(t("notes.created", "Note created"));
        }

        setShowModal(false);
        setFormData({
          title: "",
          description: "",
          date: hoyEnLaEmpresa(),
          attachments: [],
        });
      } catch (err) {
        console.warn("[PostSiteNotes] submit error", err);
        toast.error(t("notes.saveError", "Could not save note"));
      } finally {
        setSaving(false);
      }
    })();
  };

  const reportFailedUploads = (count: number) =>
    toast.error(
      t("notes.attachmentsFailed", {
        defaultValue: "{{count}} archivo(s) no se pudieron subir",
        count,
      }),
    );

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
          <div className="relative" ref={actionRef}>
            <button
              onClick={() => setActionOpen((v) => !v)}
              className="cg-btn-glass cg-focus flex min-w-[100px] items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
            >
              {t("actions.action", "Action")}
              <ChevronDown size={16} />
            </button>
            {actionOpen && (
              <div className="glass-raised absolute left-0 z-10 mt-1 w-full">
                <button
                  onClick={() => {
                    setActionOpen(false);
                    setConfirmDeleteIds(selectedIds);
                  }}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                >
                  {t("clients.notes.delete", "Delete")}
                </button>
              </div>
            )}
          </div>

          <div className="min-w-48 flex-1 sm:max-w-xs">
            <SearchInput
              placeholder={t(
                  "clients.notes.notesearchPlaceholder",
                  "Search note",
                )}
              type="text"
              value={searchQuery}
              onChange={(v) => setSearchQuery(v)}
            />
          </div>

          <button
            onClick={handleAddNote}
            className="cg-btn-brand cg-focus flex items-center gap-2 rounded-md px-6 py-2 text-sm font-semibold transition-colors"
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
                      type="checkbox"
                      className="rounded"
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (checked)
                          setSelectedIds(
                            visibleNotes.map((n) => String(n.id)),
                          );
                        else setSelectedIds([]);
                      }}
                      checked={
                        visibleNotes.length > 0 &&
                        visibleNotes.every((n) =>
                          selectedIds.includes(String(n.id)),
                        )
                      }
                      aria-label={t(
                        "ui.PostSiteNotes.seleccionarTodasLasNotas",
                        "Seleccionar todas las notas",
                      )}
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
                  <th className="cg-eyebrow px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {visibleNotes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8">
                      <EmptyState
                        icon={<StickyNote />}
                        title={t("clients.empty.title")}
                        description={t("clients.empty.description")}
                      />
                    </td>
                  </tr>
                ) : (
                  visibleNotes.map((note, idx) => (
                    <tr
                      key={note.id || idx}
                      className="border-b hover:bg-muted/40"
                    >
                      <td className="px-2 py-2.5 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(String(note.id))}
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
                            onClick={() =>
                              setOpenMenuId((prev) =>
                                prev === note.id ? null : String(note.id),
                              )
                            }
                            className="p-2 rounded-full hover:bg-muted focus:outline-none"
                            title={t("actions.action") || "Actions"}
                          >
                            <EllipsisVertical size={18} />
                          </button>

                          {openMenuId === String(note.id) && (
                            <div className="glass-raised absolute right-0 z-50 mt-2 w-44">
                              <button
                                onClick={() => {
                                  setDetailsNote(note.raw || note);
                                  setOpenMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 focus:outline-none"
                              >
                                <Eye size={16} />
                                <span className="text-sm">
                                  {t("actions.viewDetails") || "View Details"}
                                </span>
                              </button>
                              <button
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
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 focus:outline-none"
                              >
                                <Pencil size={16} />
                                <span className="text-sm">
                                  {t("actions.edit") || "Edit"}
                                </span>
                              </button>
                              <button
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setConfirmDeleteIds([String(note.id)]);
                                }}
                                className="cg-btn-ghost cg-focus flex w-full items-center gap-2 px-3 py-2"
                                style={{ color: "var(--bad-text)" }}
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
              items={visibleNotes}
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
              loading={false}
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
                {formData.id
                  ? t("clients.notes.form.editTitle", "Editar nota")
                  : t("clients.notes.form.Title", "Agregar nueva nota")}
              </h2>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("clients.notes.form.Titlenote", "Title *")}{" "}
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder={t("clients.notes.form.Titlenote", "Title *")}
                  className={FIELD_CLS_LG}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("clients.notes.form.Description", "Description *")}{" "}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder={t(
                    "clients.notes.form.Descriptioninput",
                    "Description *",
                  )}
                  className={`${FIELD_CLS_LG} resize-none`}
                  rows={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("clients.notes.form.Date", "Date *")}{" "}
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                  className={`${FIELD_CLS_LG} cursor-pointer`}
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeAttachment(i);
                                }}
                                className="cg-focus rounded p-1"
                                style={{ color: "var(--bad-text)" }}
                                aria-label={t("ui.PostSiteNotes.quitarArchivo", {
                                  defaultValue: "Quitar {{nombre}}",
                                  nombre: f.name,
                                })}
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

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t p-6">
              <button
                onClick={handleSubmitNote}
                disabled={!isFormValid || saving}
                className={`cg-btn-brand cg-focus rounded-md px-6 py-2 font-semibold ${!isFormValid || saving ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {t("actions.save", "Save")}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={confirmDeleteIds.length > 0}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteIds([]);
        }}
        title={t("clients.notes.confirmDeleteTitle", "¿Eliminar nota(s)?")}
        icon={<Trash className="h-5 w-5" />}
        size="sm"
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
      >
        <p className="text-sm text-foreground/70">
          {t(
            "clients.notes.confirmDeleteMessage",
            "¿Seguro que deseas eliminar permanentemente la(s) nota(s) seleccionada(s)? Esta acción no se puede deshacer.",
          )}
        </p>
      </Modal>

      <Modal
        open={!!detailsNote}
        onOpenChange={(o) => {
          if (!o) setDetailsNote(null);
        }}
        title={t("clients.notes.detailsTitle", "Detalle de la nota")}
        icon={<StickyNote className="h-5 w-5" />}
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
      >
        {detailsNote && (
          <div className="space-y-2">
            <div className="text-sm text-foreground">
              <strong>{t("clients.notes.Title", "Título")}: </strong>
              {detailsNote.title}
            </div>
            <div className="text-sm text-foreground">
              <strong>{t("clients.notes.Date", "Fecha")}: </strong>
              {detailsNote.noteDate || detailsNote.createdAt?.split("T")?.[0]}
            </div>
            <div className="text-sm text-foreground">
              <strong>
                {t("clients.notes.description", "Descripción")}:{" "}
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
            {(detailsNote.attachments || []).length > 0 && (
              <div className="text-sm text-foreground">
                <strong>
                  {t("clients.notes.form.AttachFile", "Archivos adjuntos")}:
                </strong>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(detailsNote.attachments || []).map((att, ai) => {
                    // Never the bare privateUrl: it is a storage path, not a
                    // URL (the link opened the CRM). The API now signs
                    // downloadUrl; older payloads go through /file/download.
                    const href =
                      att.downloadUrl ||
                      att.publicUrl ||
                      fileUrlFromFile(att) ||
                      "";
                    return (
                      <a
                        key={att.id ?? ai}
                        href={href || undefined}
                        target="_blank"
                        rel="noreferrer"
                        title={att.name || ""}
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium [background:var(--glass-sunken)]"
                      >
                        <Paperclip size={12} />
                        <span className="max-w-[180px] truncate">
                          {att.name || "-"}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
