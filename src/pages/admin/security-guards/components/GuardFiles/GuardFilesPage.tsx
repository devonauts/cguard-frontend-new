import type { GuardDetail } from "../../guardDetailTypes";

import { useParams } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { ChevronDown, X, Paperclip, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import AppLayout from "@/layouts/app-layout";
import GuardsLayout from "@/layouts/GuardsLayout";
import MobileCardList from "@/components/responsive/MobileCardList";
import { useRegistroDeFicha } from "@/layouts/FichaPersona";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  SkeletonCards,
  IconTile,
  SearchInput,
} from "@/components/kit";
import { Button } from "@/components/ui/button";

/**
 * A file row. NOTE: files live only in local component state — no file API is
 * wired, so uploads are lost on reload (see FLAGGED in audit).
 */
interface FileRow {
  id: string;
  name: string;
  date?: string;
  addedBy?: string;
}

export default function GuardFilesPage() {
  const { id } = useParams();
  const [guard, setGuard] = useState<GuardDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [filesData, setFilesData] = useState<FileRow[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const actionRef = useRef<HTMLDivElement | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const { t } = useTranslation();
  const [actionSelection, setActionSelection] = useState<string>(() =>
    t("guards.files.action.default", { defaultValue: "Action" }),
  );
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);

  // El registro lo trae la ruta padre; esta pestaña ya no lo pide por su cuenta.
  const { registro, cargando } = useRegistroDeFicha(id);

  useEffect(() => {
    setLoading(cargando);
    if (registro === null) {
      console.error("Error cargando vigilante");
      toast.error(
        t("guards.files.toasts.loadError", {
          defaultValue: "Could not load guard",
        }),
      );

      return;
    }
    if (!registro) return;
    const data = registro as GuardDetail & { guard?: GuardDetail };
    const g = data.guard ?? data;
    const fullName =
      g.fullName ?? `${g.firstName ?? ""} ${g.lastName ?? ""}`.trim();

    setGuard({ ...g, fullName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registro, cargando]);

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.archivos">
        <PageContainer>
          <PageHeader
            actions={
              <Button
                disabled={!guard}
                variant="brand"
                onClick={() => setShowUploadModal(true)}
              >
                {t("guards.files.uploadButton", { defaultValue: "Upload" })}
              </Button>
            }
            icon={<FolderOpen />}
            subtitle={
              guard?.fullName
                ? `${t("guards.files.subtitle", { defaultValue: "Documentos y archivos del vigilante." })} · ${guard.fullName}`
                : t("guards.files.subtitle", {
                    defaultValue: "Documentos y archivos del vigilante.",
                  })
            }
            title={t("guards.files.title", { defaultValue: "Archivos" })}
          />

          {loading ? (
            <SkeletonCards count={4} />
          ) : guard ? (
            <Section
              action={
                <div className="flex items-center gap-2">
                  <div ref={actionRef} className="relative">
                    <button
                      className="cg-btn-glass cg-focus flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold min-w-[100px]"
                      onClick={() => setActionOpen(!actionOpen)}
                    >
                      {actionSelection}
                      <ChevronDown size={16} />
                    </button>
                    {actionOpen && (
                      <div
                        className="glass-raised absolute left-0 z-10 mt-1 w-full overflow-hidden"
                        style={{ position: "absolute" }}
                      >
                        <button
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-muted"
                          onClick={() => {
                            setActionSelection(
                              t("guards.files.actions.delete", {
                                defaultValue: "Delete",
                              }),
                            );
                            setActionOpen(false);
                          }}
                        >
                          {t("guards.files.actions.delete", {
                            defaultValue: "Delete",
                          })}
                        </button>
                      </div>
                    )}
                  </div>
                  <SearchInput
                    placeholder={t("guards.files.searchPlaceholder", {
                        defaultValue: "Search files...",
                      })}
                    type="text"
                    value={searchQuery}
                    onChange={(v) => setSearchQuery(v)}
                  />
                </div>
              }
              icon={<FolderOpen />}
              title={t("guards.files.feedTitle", {
                defaultValue: "Archivos del vigilante",
              })}
            >
              <div className="overflow-x-auto">
                <div>
                  <div className="md:block hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-muted/30">
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                            <input
                              aria-label="select all files"
                              checked={
                                filesData.length > 0 &&
                                selectedFileIds.length === filesData.length
                              }
                              className="h-4 w-4"
                              type="checkbox"
                              onChange={(e) => {
                                if (e.target.checked)
                                  setSelectedFileIds(
                                    filesData.map((f) => f.id),
                                  );
                                else setSelectedFileIds([]);
                              }}
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                            {t("guards.files.table.date", {
                              defaultValue: "Date",
                            })}
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                            {t("guards.files.table.file", {
                              defaultValue: "File",
                            })}
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">
                            {t("guards.files.table.addedBy", {
                              defaultValue: "Added By",
                            })}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filesData.length === 0 ? (
                          <tr>
                            <td className="px-4 py-6" colSpan={4}>
                              <EmptyState
                                description={t(
                                  "guards.files.empty.description",
                                  {
                                    defaultValue:
                                      "Upload files using the button on the right",
                                  },
                                )}
                                icon={<FolderOpen />}
                                title={t("guards.files.empty.title", {
                                  defaultValue: "No Files Found",
                                })}
                              />
                            </td>
                          </tr>
                        ) : (
                          filesData.map((f) => (
                            <tr
                              key={f.id}
                              className="border-b hover:bg-muted/30"
                            >
                              <td className="px-4 py-3">
                                <input
                                  checked={selectedFileIds.includes(f.id)}
                                  className="h-4 w-4"
                                  type="checkbox"
                                  onChange={(e) => {
                                    if (e.target.checked)
                                      setSelectedFileIds((prev) => [
                                        ...prev,
                                        f.id,
                                      ]);
                                    else
                                      setSelectedFileIds((prev) =>
                                        prev.filter((id) => id !== f.id),
                                      );
                                  }}
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                {f.date}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                {f.name}
                              </td>
                              <td className="px-4 py-3 text-sm text-foreground">
                                {f.addedBy}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="md:hidden">
                  <MobileCardList
                    emptyMessage={
                      t("guards.files.empty.title", {
                        defaultValue: "No Files Found",
                      }) as string
                    }
                    items={filesData || []}
                    loading={false}
                    renderCard={(f: FileRow) => (
                      <>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold">
                            {f.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {f.date}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {f.addedBy}
                        </div>
                      </div>
                      </>
                    )}
                  />
                </div>
              </div>
            </Section>
          ) : (
            <EmptyState
              icon={<FolderOpen />}
              title={t("guards.files.loadError", {
                defaultValue: "Could not load guard",
              })}
            />
          )}
        </PageContainer>
        {/* Upload Files Modal */}
        {showUploadModal && (
          <div
            className="glass-scrim fixed inset-0 z-50"
            onClick={() => setShowUploadModal(false)}
          >
            <div
              className="glass-raised fixed bottom-0 right-0 top-0 flex w-full max-w-md flex-col rounded-l-3xl rounded-r-none"
              style={{ position: "fixed" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b sticky top-0 z-10 [background:var(--glass-solid)]">
                <div className="flex items-center gap-2.5">
                  <IconTile size="sm">
                    <FolderOpen />
                  </IconTile>
                  <h3 className="text-base font-semibold">
                    {t("guards.files.modal.title", {
                      defaultValue: "Upload Files",
                    })}
                  </h3>
                </div>
                <button
                  className="text-muted-foreground hover:text-foreground/70"
                  onClick={() => setShowUploadModal(false)}
                >
                  <X />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <div
                  className={`w-full border-dashed rounded-md p-8 mb-8 text-center ${dragOver ? "border-2 border-border bg-muted/30" : "border border-border"}`}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const files = Array.from(
                      e.dataTransfer?.files || ([] as File[]),
                    );

                    if (files.length)
                      setUploadFiles((prev) => [...prev, ...files]);
                  }}
                >
                  {uploadFiles.length > 0 ? (
                    <div className="flex justify-center">
                      <div className="bg-muted rounded-md px-3 py-2 text-sm text-foreground w-full min-w-0 overflow-hidden">
                        <span className="block truncate">
                          {uploadFiles.map((f) => f.name).join(", ")}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {t("guards.files.modal.dropHere", {
                        defaultValue: "Drop files here..",
                      })}
                    </div>
                  )}
                </div>

                <div className="text-center my-6 text-muted-foreground">
                  {t("guards.files.modal.orSelect", {
                    defaultValue: "Or Select",
                  })}
                </div>

                <div className="flex items-center gap-3 mt-6">
                  <div className="flex-1 relative min-w-0">
                    <div className="w-full border rounded-md px-3 py-2 text-sm flex items-center justify-between min-w-0">
                      <span className="block truncate text-sm text-foreground">
                        {uploadFiles.length > 0
                          ? uploadFiles.map((f) => f.name).join(", ")
                          : t("guards.files.modal.chooseFilesPlaceholder", {
                              defaultValue: "Choose files No files selected",
                            })}
                      </span>
                      <span className="text-muted-foreground ml-3">
                        <Paperclip />
                      </span>
                    </div>
                    <input
                      multiple
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      type="file"
                      onChange={(e) => {
                        const files = e.target.files
                          ? Array.from(e.target.files)
                          : [];

                        setUploadFiles((prev) => [...prev, ...files]);
                      }}
                    />
                  </div>
                </div>

                {uploadFiles.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2">
                      {t("guards.files.modal.filesToUpload", {
                        defaultValue: "Files to upload",
                      })}
                    </h4>
                    <ul className="space-y-2 max-h-40 overflow-y-auto">
                      {uploadFiles.map((f, i) => (
                        <li
                          key={i}
                          className="flex items-center justify-between text-sm min-w-0"
                        >
                          <span className="truncate mr-4 block min-w-0">
                            {f.name}
                          </span>
                          <button
                            aria-label={`Remove ${f.name}`}
                            className="cg-focus rounded-full p-1 transition hover:opacity-80"
                            style={{ color: "var(--bad-text)" }}
                            onClick={() =>
                              setUploadFiles((prev) =>
                                prev.filter((_, idx) => idx !== i),
                              )
                            }
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 p-4 border-t bg-muted/30">
                <Button
                  variant="brand"
                  onClick={() => {
                    if (uploadFiles.length === 0) {
                      setShowUploadModal(false);

                      return;
                    }
                    const newFiles = uploadFiles.map((f) => ({
                      id:
                        Date.now().toString() +
                        Math.random().toString(36).slice(2, 7),
                      name: f.name,
                      date: new Date().toISOString().slice(0, 10),
                      addedBy: "You",
                    }));

                    setFilesData((prev) => [...newFiles, ...prev]);
                    setUploadFiles([]);
                    setShowUploadModal(false);
                  }}
                >
                  {t("guards.files.modal.upload", { defaultValue: "Upload" })}
                </Button>
              </div>
            </div>
          </div>
        )}
      </GuardsLayout>
    </AppLayout>
  );
}
