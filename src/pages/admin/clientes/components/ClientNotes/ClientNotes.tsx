import type { Client } from "@/types/client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  ChevronDown,
  Plus,
  X,
  Calendar as CalendarIcon,
  EllipsisVertical,
  Pencil,
  Trash,
  Eye,
  FileText,
  Paperclip,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  FIELD_CLS,
  LabeledField,
  TabTable,
  THead,
  Th,
  Tr,
} from "../_shared/tab-kit";

import useScrollToTopOnMount from "@/hooks/useScrollToTopOnMount";
import { clientService } from "@/lib/api/clientService";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import MobileCardList from "@/components/responsive/MobileCardList";
import { Button } from "@/components/ui/button";
import { Section, EmptyState, Modal, SearchInput } from "@/components/kit";
import {
  diaCivilDe,
  hoyEnLaEmpresa,
  soloFechaCivil,
} from "@/lib/horaDeLaEmpresa";
import { useFileUrl } from "@/lib/fileUrl";

type Props = {
  client?: Client & { firstName?: string };
};

// A client note row from getClientNotes.
interface NoteAuthor {
  fullName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}
interface NoteAttachment {
  id?: string;
  name?: string;
  mimeType?: string;
  privateUrl?: string | null;
  publicUrl?: string | null;
  downloadUrl?: string | null;
}
interface ClientNote {
  id: string;
  title: string;
  description: string;
  noteDate?: string | null;
  createdAt?: string;
  createdBy?: NoteAuthor | null;
  createdById?: string | null;
  attachments?: NoteAttachment[];
}

/** Notes keep PDFs and images (storage `notesPdf` / `notesImages`, 3 MB). */
const NOTE_FILE_MAX = 3 * 1024 * 1024;
const noteStorageFor = (f: File): string | null =>
  f.type === "application/pdf"
    ? "notesPdf"
    : (f.type || "").startsWith("image/")
      ? "notesImages"
      : null;

/** The day of a note, as written: a civil day, never shifted by the zone. */
const noteDay = (n: ClientNote) =>
  soloFechaCivil(n.noteDate || n.createdAt || null, {}, "-");

function NoteFileLink({ file }: { file: NoteAttachment }) {
  const href = useFileUrl(file.publicUrl || file);

  return (
    <a
      className="inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium [background:var(--glass-sunken)]"
      href={href || undefined}
      rel="noreferrer"
      target="_blank"
      title={file.name || ""}
    >
      <Paperclip size={12} />
      <span className="max-w-[220px] truncate">{file.name}</span>
    </a>
  );
}

export default function ClientNotes({ client }: Props) {
  const { t } = useTranslation();
  const actionRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pickerMonth, setPickerMonth] = useState<Date>(() => new Date());

  const [actionOpen, setActionOpen] = useState(false);
  const [actionSelection, setActionSelection] =
    useState<string>("actions.action");
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [notesData, setNotesData] = useState<ClientNote[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([]);
  const [detailsNote, setDetailsNote] = useState<ClientNote | null>(null);
  const [saving, setSaving] = useState(false);

  // selection state for checkboxes (master + per-row)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const toggleSelect = (id: string) => {
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    date: hoyEnLaEmpresa(),
    attachments: [] as File[],
  });

  const isFormValid =
    formData.title.trim() !== "" &&
    formData.description.trim() !== "" &&
    Boolean(formData.date);

  const handleAddNote = () => {
    setIsEditing(false);
    setEditingNoteId(null);
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
    setIsEditing(false);
    setEditingNoteId(null);
  };

  // Load notes for client
  useEffect(() => {
    let mounted = true;

    async function loadNotes() {
      if (!client || !client.id) {
        setNotesData([]);

        return;
      }
      try {
        const resp = await clientService.getClientNotes(client.id, {
          limit: 9999,
          offset: 0,
        });

        if (!mounted) return;
        const rows = Array.isArray(resp?.rows) ? resp.rows : [];

        setNotesData(rows);
      } catch (err) {
        console.warn("[ClientNotes] failed to load notes", err);
        setNotesData([]);
      }
    }
    loadNotes();

    return () => {
      mounted = false;
    };
  }, [client?.id]);

  const confirmNames = (confirmDeleteIds || []).map((id) => {
    const found = (notesData || []).find((n) => n.id === id);

    return found ? found.title || String(found.id) : String(id);
  });

  const filtered = useMemo(() => {
    const q = (searchQuery || "").toLowerCase().trim();

    if (!q) return notesData;

    return (notesData || []).filter((n) => {
      const title = (n.title || "").toString().toLowerCase();
      const desc = (n.description || "").toString().toLowerCase();
      const date = (n.noteDate || n.createdAt || "").toString().toLowerCase();
      const cbName = n.createdBy
        ? (
            (n.createdBy.name || n.createdBy.firstName || "") +
            " " +
            (n.createdBy.lastName || "")
          ).toLowerCase()
        : "";
      const clientName = client
        ? (
            (client.name || client.firstName || "") +
            " " +
            (client.lastName || "")
          ).toLowerCase()
        : "";

      return (
        title.includes(q) ||
        desc.includes(q) ||
        date.includes(q) ||
        cbName.includes(q) ||
        clientName.includes(q)
      );
    });
  }, [notesData, searchQuery, client]);

  // keep selection in sync with visible/filtered notes (remove ids no longer in view)
  useEffect(() => {
    setSelectedNoteIds((prev) =>
      prev.filter((id) => filtered.some((n) => n.id === id)),
    );
  }, [filtered]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        actionRef.current &&
        !actionRef.current.contains(event.target as Node)
      )
        setActionOpen(false);
    };

    if (actionOpen) {
      document.addEventListener("mousedown", handleClickOutside);

      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [actionOpen]);

  useScrollToTopOnMount(containerRef);

  const handleSubmitNote = async () => {
    if (!formData.title || !formData.title.trim()) {
      toast.error(
        t("clients.notes.validation.titleRequired", "Title is required"),
      );

      return;
    }
    if (!formData.description || !formData.description.trim()) {
      toast.error(
        t(
          "clients.notes.validation.descriptionRequired",
          "Description is required",
        ),
      );

      return;
    }
    if (!formData.date) {
      toast.error(
        t("clients.notes.validation.dateRequired", "Date is required"),
      );

      return;
    }
    const payload: {
      title: string;
      description: string;
      noteDate: string | null;
      attachment?: Record<string, unknown>[];
    } = {
      title: formData.title,
      description: formData.description,
      noteDate: formData.date || null,
    };

    /* The chosen files are uploaded and sent with the note. They used to be
       dropped: the payload carried `attachment: null` and nothing was
       uploaded, while the toast said the note was saved (QA G6). A failed
       upload stops the save and keeps the form open with what was typed. */
    if (client?.id && formData.attachments.length) {
      setSaving(true);
      try {
        const subidos: Record<string, unknown>[] = [];

        for (const f of formData.attachments) {
          const storageId = noteStorageFor(f);

          if (!storageId) continue;
          const up = await clientService.uploadFile(f, storageId);

          subidos.push({
            ...up,
            mimeType: f.type || "application/octet-stream",
            storageId,
          });
        }
        if (subidos.length) payload.attachment = subidos;
      } catch (err) {
        console.warn("[ClientNotes] upload failed", err);
        toast.error(
          t("guards.notes.form.attachments.uploadFailed", {
            defaultValue: "Fallo al subir archivo",
          }),
        );
        setSaving(false);

        return;
      }
    }

    if (!client || !client.id) {
      // local-only
      const local = {
        id: String(Date.now()),
        ...payload,
        addedBy: t("ui.ClientNotes.tu", "Tú"),
      };

      setNotesData((prev) => [local, ...prev]);
      setShowModal(false);
      setFormData({
        title: "",
        description: "",
        date: hoyEnLaEmpresa(),
        attachments: [],
      });

      return;
    }

    try {
      if (isEditing && editingNoteId) {
        const resp = await clientService.updateClientNote(
          client.id,
          editingNoteId,
          payload,
        );
        const updated = resp && resp.data ? resp.data : resp;

        setNotesData((prev) =>
          prev.map((n) => (n.id === updated.id ? updated : n)),
        );
        // The server's `messageCode` («notes.noteUpdated») is a SERVER key;
        // passed to t() it showed raw (QA M8).
        toast.success(t("clients.notes.noteUpdated"));
      } else {
        const resp = await clientService.createClientNote(client.id, payload);
        const created = resp && resp.data ? resp.data : resp;

        setNotesData((prev) => [created, ...prev]);
        toast.success(t("clients.notes.noteCreated"));
      }

      setShowModal(false);
      setFormData({
        title: "",
        description: "",
        date: hoyEnLaEmpresa(),
        attachments: [],
      });
      setIsEditing(false);
      setEditingNoteId(null);
      setSaving(false);
    } catch (err) {
      console.warn("[ClientNotes] failed to save note", err);
      const errorMsg = isEditing
        ? t("clients.notes.noteUpdateFailed", "Could not update note")
        : t("clients.notes.noteCreateFailed", "Could not create note");

      toast.error(errorMsg);
      setSaving(false);
      /* NO se inventa una nota local.
         Aquí había un «fallback to local»: si el guardado fallaba, se avisaba
         del error Y ADEMÁS se metía en la lista una nota fabricada en el
         navegador. La pantalla se contradecía a sí misma —error arriba, nota
         nueva abajo— y al recargar la nota desaparecía. Editando era peor:
         quedaba una copia falsa arriba y el original sin cambiar debajo.
         Lo correcto ante un fallo es no tocar la lista y dejar el formulario
         ABIERTO con lo escrito, para poder reintentar sin volver a teclearlo. */
    }
  };

  const removeAttachment = (index: number) =>
    setFormData((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));

  const shortName = (name: string, max = 28) =>
    name.length <= max ? name : name.slice(0, max) + "...";

  return (
    <div ref={containerRef}>
      <Section icon={<FileText />} title={t("clients.nav.notes", "Notas")}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div ref={actionRef} className="relative">
            <button
              className="cg-btn-glass cg-focus flex min-w-[100px] items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"
              onClick={() => setActionOpen(!actionOpen)}
            >
              {t("actions.action", "-")}
              <ChevronDown size={16} />
            </button>
            {actionOpen && (
              <div className="glass-raised absolute left-0 z-10 mt-1 w-full p-1">
                <button
                  className={`cg-focus block w-full rounded-md px-3 py-2 text-left text-sm transition-opacity hover:opacity-70 ${selectedNoteIds.length === 0 ? "cursor-not-allowed text-muted-foreground" : ""}`}
                  onClick={() => {
                    if (selectedNoteIds.length > 0)
                      setConfirmDeleteIds(selectedNoteIds);
                    setActionOpen(false);
                  }}
                >
                  {t("actions.delete")}
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 max-w-xs">
            <SearchInput
              placeholder={t(
                "clients.notes.notesearchPlaceholder",
                "Search notes",
              )}
              type="text"
              value={searchQuery}
              onChange={(v) => setSearchQuery(v)}
            />
          </div>

          <Button className="gap-2" variant="brand" onClick={handleAddNote}>
            <Plus size={18} />
            {t("clients.notes.addNote", "New Note")}
          </Button>
        </div>

        <div className="flex-1 min-h-0">
          <div className="hidden md:block">
            <TabTable minWidth={520}>
              <THead>
                <Th>
                  <input
                    aria-label={t(
                      "ui.ClientNotes.seleccionarTodasLasNotas",
                      "Seleccionar todas las notas",
                    )}
                    checked={
                      selectedNoteIds.length === filtered.length &&
                      filtered.length > 0
                    }
                    className="rounded"
                    type="checkbox"
                    onChange={(e) => {
                      const checked = e.target.checked;

                      if (checked)
                        setSelectedNoteIds(filtered.map((n) => n.id));
                      else setSelectedNoteIds([]);
                    }}
                  />
                </Th>
                <Th>{t("clients.notes.Title", "Title")}</Th>
                <Th>{t("clients.notes.Date", "Date")}</Th>
                <Th>{t("clients.notes.Added By", "Added By")}</Th>
                <Th aria-label={t("ui.RouteForm.acciones", "Acciones")} />
              </THead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td className="px-2 py-8" colSpan={5}>
                      <EmptyState
                        description={t(
                          "clients.empty.description",
                          "We couldn't find any items matching your search",
                        )}
                        icon={<FileText />}
                        title={t("clients.empty.title", "No results found")}
                      />
                    </td>
                  </tr>
                ) : (
                  filtered.map((note) => (
                    <Tr key={note.id}>
                      <td className="px-2 py-2.5">
                        <input
                          aria-label={t("ui.ClientNotes.seleccionarNota", {
                            defaultValue: "Seleccionar nota {{id}}",
                            id: note.id,
                          })}
                          checked={selectedNoteIds.includes(note.id)}
                          className="rounded"
                          type="checkbox"
                          onChange={() => toggleSelect(note.id)}
                        />
                      </td>
                      <td className="px-2 py-2.5 font-medium">{note.title}</td>
                      <td className="px-2 py-2.5 tabular-nums">
                        {noteDay(note)}
                      </td>
                      <td className="px-2 py-2.5">
                        {(() => {
                          const cb = note.createdBy;
                          const name = cb
                            ? (cb.fullName || cb.name || cb.firstName || "") +
                              (cb.lastName ? " " + cb.lastName : "")
                            : "";

                          return name && name.trim()
                            ? name
                            : note.createdById || "-";
                        })()}
                      </td>
                      <td className="relative px-2 py-2.5 text-right">
                        <Popover
                          open={openPopoverId === note.id}
                          onOpenChange={(open) =>
                            setOpenPopoverId(open ? note.id : null)
                          }
                        >
                          <PopoverTrigger asChild>
                            <button
                              aria-label={t("header.openMenu") || "Open menu"}
                              className="cg-focus rounded-md p-1.5 transition-opacity hover:opacity-70"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              <EllipsisVertical className="h-4 w-4" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-44 p-1 rounded-md shadow-lg">
                            <button
                              className="flex items-center gap-2 px-3 py-2 text-sm w-full hover:bg-muted/30"
                              onClick={() => {
                                setDetailsNote(note);
                                setOpenPopoverId(null);
                              }}
                            >
                              <Eye className="h-4 w-4 text-muted-foreground" />
                              {t("actions.viewDetails", "Details")}
                            </button>
                            <button
                              className="flex items-center gap-2 px-3 py-2 text-sm w-full hover:bg-muted/30"
                              onClick={() => {
                                setFormData({
                                  title: note.title,
                                  description: note.description,
                                  date:
                                    note.noteDate ||
                                    note.createdAt?.split("T")?.[0] ||
                                    "",
                                  attachments: [],
                                });
                                setIsEditing(true);
                                setEditingNoteId(note.id);
                                setShowModal(true);
                                setOpenPopoverId(null);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                              {t("actions.edit") || "Edit"}
                            </button>
                            <button
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/30"
                              style={{ color: "var(--bad-text)" }}
                              onClick={() => {
                                setConfirmDeleteIds([note.id]);
                                setOpenPopoverId(null);
                              }}
                            >
                              <Trash className="h-4 w-4" />
                              {t("actions.delete") || "Delete"}
                            </button>
                          </PopoverContent>
                        </Popover>
                      </td>
                    </Tr>
                  ))
                )}
              </tbody>
            </TabTable>
          </div>

          <div className="md:hidden">
            <MobileCardList
              emptyMessage={t("clients.empty.title") as string}
              items={filtered}
              loading={false}
              renderCard={(note: ClientNote) => (
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-medium">
                        {note.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {noteDay(note)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="mt-2">
                        <button
                          className="px-2 py-1 text-sm"
                          onClick={() => {
                            setDetailsNote(note);
                          }}
                        >
                          {t("actions.viewDetails")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      </Section>

      <Modal
        footer={
          <Button
            disabled={!isFormValid || saving}
            variant="brand"
            onClick={handleSubmitNote}
          >
            {isEditing
              ? t("clients.notes.SaveChanges", "Save changes")
              : t("clients.notes.Save", "Save")}
          </Button>
        }
        icon={<FileText className="h-5 w-5" />}
        open={showModal}
        title={
          isEditing
            ? t("clients.notes.form.editTitle", "Editar nota")
            : t("clients.notes.form.Title", "Agregar nueva nota")
        }
        onOpenChange={(o) => {
          if (!o) handleCloseModal();
        }}
      >
        <div className="space-y-3">
          <LabeledField label={t("clients.notes.form.Titlenote", "Title")}>
            <input
              className={FIELD_CLS}
              placeholder={t(
                "clients.notes.form.Titleinput",
                "Enter note title",
              )}
              type="text"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </LabeledField>

          <LabeledField
            label={t("clients.notes.form.Description", "Description")}
          >
            <textarea
              className={`${FIELD_CLS} h-auto resize-none py-2`}
              placeholder={t(
                "clients.notes.form.Descriptioninput",
                "Enter note description",
              )}
              rows={6}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </LabeledField>

          <LabeledField label={t("clients.notes.form.Date", "Date")}>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  className="w-full justify-between text-left font-normal"
                  variant="outline"
                >
                  {formData.date ? (
                    soloFechaCivil(formData.date, {
                      month: "short",
                      day: "2-digit",
                      year: "numeric",
                    })
                  ) : (
                    <span>{t("clients.notes.form.selectDate", "Select")}</span>
                  )}
                  <CalendarIcon className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-3 rounded-lg shadow-lg">
                <Calendar
                  mode="single"
                  selected={
                    formData.date
                      ? new Date(`${formData.date.slice(0, 10)}T00:00:00`)
                      : undefined
                  }
                  onSelect={(d) => {
                    if (d) {
                      // Local parts of the picked day; toISOString moved it a
                      // day back east of Greenwich.
                      setFormData((prev) => ({
                        ...prev,
                        date: diaCivilDe(d),
                      }));
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
          </LabeledField>

          <LabeledField
            label={t("clients.notes.form.AttachFile", "Attachments")}
          >
            <label className="glass-sunken flex w-full cursor-pointer items-center justify-between gap-3 p-3 transition-colors">
              <div className="flex-1">
                <div className="text-sm text-foreground/70">
                  {formData.attachments && formData.attachments.length > 0 ? (
                    <div className="space-y-2">
                      {formData.attachments.map((f, i) => (
                        <div
                          key={i}
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
                            aria-label={t("ui.RouteForm.quitar", {
                              defaultValue: "Quitar {{name}}",
                              name: f.name,
                            })}
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
                        "clients.notes.form.AttachFileinput",
                        "No files selected",
                      )}
                    </span>
                  )}
                </div>
              </div>
              <input
                multiple
                accept="application/pdf,image/*"
                className="sr-only"
                type="file"
                onChange={(e) => {
                  const picked = e.target.files
                    ? Array.from(e.target.files)
                    : [];
                  const files = picked.filter((f) => {
                    if (!noteStorageFor(f)) {
                      toast.error(
                        `${t("guards.notes.form.attachments.invalidType", {
                          defaultValue: "Tipo de archivo no permitido",
                        })}: ${f.name}`,
                      );

                      return false;
                    }
                    if (f.size > NOTE_FILE_MAX) {
                      toast.error(
                        `${t("guards.notes.form.attachments.tooLarge", {
                          defaultValue: "Archivo mayor a 3MB",
                        })}: ${f.name}`,
                      );

                      return false;
                    }

                    return true;
                  });

                  setFormData({ ...formData, attachments: files });
                  e.target.value = "";
                }}
              />
            </label>
          </LabeledField>
        </div>
      </Modal>

      <Modal
        footer={
          detailsNote ? (
            <Button
              onClick={() => {
                setFormData({
                  title: detailsNote.title,
                  description: detailsNote.description,
                  date:
                    detailsNote.noteDate ||
                    detailsNote.createdAt?.split("T")?.[0] ||
                    "",
                  attachments: [],
                });
                setIsEditing(true);
                setEditingNoteId(detailsNote.id);
                setShowModal(true);
                setDetailsNote(null);
              }}
            >
              {t("actions.edit", "Editar")}
            </Button>
          ) : undefined
        }
        icon={<FileText className="h-5 w-5" />}
        open={!!detailsNote}
        title={t("clients.notes.detailsTitle", "Detalle de la nota")}
        onOpenChange={(o) => {
          if (!o) setDetailsNote(null);
        }}
      >
        {detailsNote && (
          <div className="space-y-2">
            <div className="text-sm text-foreground">
              <strong>{t("clients.notes.Details.Title", "Título")}: </strong>
              {detailsNote.title}
            </div>
            <div className="text-sm text-foreground">
              <strong>{t("clients.notes.Details.Date", "Fecha")}: </strong>
              {noteDay(detailsNote)}
            </div>
            <div className="text-sm text-foreground">
              <strong>
                {t("clients.notes.Details.Description", "Descripción")}:{" "}
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
            {Array.isArray(detailsNote.attachments) &&
              detailsNote.attachments.length > 0 && (
                <div className="text-sm text-foreground">
                  <strong>
                    {t("clients.notes.form.AttachFile", "Archivos adjuntos")}:
                  </strong>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {detailsNote.attachments.map((a, i) => (
                      <NoteFileLink key={a.id ?? i} file={a} />
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </Modal>

      <Modal
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDeleteIds([])}>
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirmDeleteIds || confirmDeleteIds.length === 0)
                  return setConfirmDeleteIds([]);
                if (!client || !client.id) {
                  setNotesData((prev) =>
                    prev.filter((n) => !confirmDeleteIds.includes(n.id)),
                  );
                  toast.success(t("clients.notes.noteDeleted"));
                  setSelectedNoteIds([]);

                  return setConfirmDeleteIds([]);
                }
                try {
                  const results = await Promise.allSettled(
                    confirmDeleteIds.map((id) =>
                      clientService.destroyClientNote(client.id, id),
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
                      prev.filter((n) => !successes.includes(n.id)),
                    );
                    setSelectedNoteIds((prev) =>
                      prev.filter((id) => !successes.includes(id)),
                    );
                    toast.success(t("clients.notes.noteDeleted"));
                  }
                  const failures = results.filter(
                    (r) => r.status === "rejected",
                  );

                  if (failures.length > 0) {
                    console.error("Some deletions failed", failures);
                    toast.error(t("clients.notes.deleteFailed"));
                  }
                } catch (err) {
                  console.error("Error deleting notes", err);
                  toast.error(t("clients.notes.deleteFailed"));
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
        <p className="text-sm font-medium text-foreground mb-2">
          {confirmNames.join(", ")}
        </p>
        <p className="text-sm text-foreground/70">
          {t(
            "clients.notes.confirmDeleteMessage",
            "¿Seguro que deseas eliminar permanentemente la(s) nota(s) seleccionada(s)? Esta acción no se puede deshacer.",
          )}
        </p>
      </Modal>
    </div>
  );
}
