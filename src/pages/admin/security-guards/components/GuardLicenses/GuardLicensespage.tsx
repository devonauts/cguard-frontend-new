import type {
  GuardDetail,
  GuardLicense,
  LicenseTypeOption,
  FileDescriptor,
} from "../../guardDetailTypes";

import React, { useState, useRef, useEffect } from "react";
import {
  Plus,
  X,
  Paperclip,
  Eye,
  FileDown,
  Trash,
  Pencil,
  IdCard,
  ShieldCheck,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import GuardsLayout from "@/layouts/GuardsLayout";
import AppLayout from "@/layouts/app-layout";
import securityGuardService from "@/lib/api/securityGuardService";
import licenseTypeService from "@/lib/api/licenseTypeService";
import LicenseTypeDialog from "@/pages/admin/Configuration/types-licenses/LicensesTypeDialog";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageContainer,
  PageHeader,
  Field,
  StatusBadge,
  EmptyState,
  SkeletonCards,
  IconTile,
  SearchInput,
  SmartImage,
} from "@/components/kit";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { enlaceDeImagen, licenciaIncompleta } from "./licencias";

/** Payload for creating/updating a guard license. */
type LicensePayload = {
  licenseTypeId?: string;
  customName?: string | null;
  number?: string;
  expiryDate?: string | null;
  frontImage?: FileDescriptor[];
  backImage?: FileDescriptor[];
};

/** A paginated license list response. */
type LicenseList = { rows: GuardLicense[]; count: number };

// Licenses data API the page consumes (id bound inside each method). Defaults to
// the guard endpoints; a supervisor route injects `licensesApi` (+navKey/title)
// to reuse this exact page against the supervisor's user-keyed licenses. Guard
// usage passes none of the new props → unchanged behaviour.
type LicensesApi = {
  get: (licenseId: string) => Promise<GuardLicense>;
  list: (pg: { limit?: number; offset?: number }) => Promise<LicenseList>;
  create: (payload: LicensePayload) => Promise<unknown>;
  update: (licenseId: string, payload: LicensePayload) => Promise<unknown>;
  remove: (ids: string[]) => Promise<unknown>;
  download: (licenseId: string) => Promise<Blob>;
};

type Props = {
  guard?: GuardDetail;
  navKey?: string;
  title?: string;
  licensesApi?: LicensesApi;
};

// ── Estado de vencimiento ────────────────────────────────────────────────────
// Vigente / Por vencer / Vencida son estados semánticos: verde, ámbar y rojo
// fijos, que no siguen al acento elegido (una licencia vencida sigue siendo roja).
function expiryStatus(
  expiryDate: string | Date | null | undefined,
  t: (k: string, o?: Record<string, unknown>) => string,
): { txt: string; tone: "ok" | "warn" | "bad" | "neutral" } {
  if (!expiryDate) {
    return {
      txt: t("guards.licenses.status.noExpiry", {
        defaultValue: "Sin vencimiento",
      }),
      tone: "neutral",
    };
  }
  const exp = new Date(expiryDate);
  const now = new Date();
  const days = Math.ceil((exp.getTime() - now.getTime()) / 86400000);

  if (days < 0) {
    return {
      txt: t("guards.licenses.status.expired", { defaultValue: "Vencida" }),
      tone: "bad",
    };
  }
  if (days <= 30) {
    return {
      txt: t("guards.licenses.status.soon", { defaultValue: "Por vencer" }),
      tone: "warn",
    };
  }

  return {
    txt: t("guards.licenses.status.valid", { defaultValue: "Vigente" }),
    tone: "ok",
  };
}

export default function GuardLicenses({
  guard,
  navKey = "keep-safe",
  title = "guards.nav.licencias",
  licensesApi,
}: Props) {
  const { id } = useParams();
  const { t } = useTranslation();
  // Default (guard) API binds the route id; supervisor injects its own.
  const api: LicensesApi = licensesApi ?? {
    get: (licenseId) =>
      securityGuardService.getSecurityGuardLicense(id as string, licenseId),
    list: (pg) =>
      securityGuardService.getSecurityGuardLicenses(id as string, pg),
    create: (payload) =>
      securityGuardService.createSecurityGuardLicense(id as string, payload),
    update: (licenseId, payload) =>
      securityGuardService.updateSecurityGuardLicense(
        id as string,
        licenseId,
        payload,
      ),
    remove: (ids) =>
      securityGuardService.destroySecurityGuardLicenses(id as string, ids),
    download: (licenseId) =>
      securityGuardService.downloadSecurityGuardLicenseReport(
        id as string,
        licenseId,
      ),
  };
  const actionRef = useRef<HTMLDivElement>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionSelection, setActionSelection] = useState<string>(() =>
    t("guards.licenses.action.default", { defaultValue: "Action" }),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [licenseData, setLicenseData] = useState<GuardLicense[]>([]); // Vacío inicialmente
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkKey, setBulkKey] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [currentLicense, setCurrentLicense] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsData, setDetailsData] = useState<GuardLicense | null>(null);

  // Form state. Images may be a freshly-picked File, an existing stored
  // descriptor, or null.
  const [formData, setFormData] = useState<{
    licenseType: string;
    customLicenseName: string;
    licenseNumber: string;
    expiryDate: string;
    frontImage: File | FileDescriptor | null;
    backImage: File | FileDescriptor | null;
  }>({
    licenseType: "",
    customLicenseName: "",
    licenseNumber: "",
    expiryDate: "",
    frontImage: null,
    backImage: null,
  });

  const [licenseTypes, setLicenseTypes] = useState<LicenseTypeOption[]>([]);
  const [showCreateLicenseType, setShowCreateLicenseType] = useState(false);
  const { hasPermission } = useAuth();

  const handleAddLicense = () => {
    setShowModal(true);
    setFormData({
      licenseType: "",
      customLicenseName: "",
      licenseNumber: "",
      expiryDate: "",
      frontImage: null,
      backImage: null,
    });
    setCurrentLicense("");
  };

  const handleCloseModal = () => {
    setShowModal(false);
  };

  const openDetails = async (licenseId: string) => {
    if (!id) return;
    setDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const data = await api.get(licenseId);

      setDetailsData(data || null);
    } catch (err) {
      console.error("Error loading license details", err);
      toast.error(
        t("guards.licenses.toasts.loadError", {
          defaultValue: "Could not load licenses",
        }),
      );
      setDetailsData(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setDetailsData(null);
  };

  // Cerrar dropdown al hacer clic fuera
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

      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [actionOpen]);

  /* Aquí vivía un SEGUNDO efecto con las MISMAS dependencias `[id, page, limit]`
     que pedía la misma lista que `loadLicenses()` unas líneas más abajo: cada
     visita a la pestaña de licencias salía con dos
     `GET /security-guard/:id/licenses` separadas por 4 ms. Se quedó el que
     llama al cargador extraído, que es el que además reutilizan el alta, la
     edición y el borrado para refrescar. */

  // Extracted loader so we can refresh after creating
  const loadLicenses = async (pageToUse = page, limitToUse = limit) => {
    if (!id) return;
    setLoading(true);
    try {
      const data: LicenseList = await api.list({
        limit: limitToUse,
        offset: (pageToUse - 1) * limitToUse,
      });

      setLicenseData(data.rows || []);
      setTotalCount(data.count || 0);
    } catch (err: any) {
      console.error("Error loading licenses", err);
      toast.error(
        t("guards.licenses.toasts.loadError", {
          defaultValue: "Could not load licenses",
        }),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLicenses();
  }, [id, page, limit]);

  // load license types for tenant to populate select
  useEffect(() => {
    let mounted = true;

    licenseTypeService
      .list({ limit: "100" })
      .then(
        (
          data:
            | { rows?: LicenseTypeOption[]; data?: LicenseTypeOption[] }
            | LicenseTypeOption[],
        ) => {
          if (!mounted) return;
          // backend returns { rows, count }
          const rows = Array.isArray(data)
            ? data
            : (data?.rows ?? data?.data ?? []);

          setLicenseTypes(rows);
        },
      )
      .catch((err) => {
        console.error("Error loading license types", err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const onSelectOne = (selId: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, selId] : prev.filter((x) => x !== selId),
    );
  };

  const onSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? licenseData.map((r) => r.id) : []);
  };

  // Row-level actions, preserved verbatim from the previous DataTable rowActions.
  const startEdit = (row: GuardLicense) => {
    setCurrentLicense(row.id);
    setFormData({
      licenseType: row.licenseType?.id ?? (row.customName ? "other" : ""),
      customLicenseName: row.customName || "",
      licenseNumber: row.number || "",
      expiryDate: row.expiryDate
        ? new Date(row.expiryDate).toISOString().slice(0, 10)
        : "",
      frontImage:
        row.frontImage && row.frontImage.length ? row.frontImage[0] : null,
      backImage:
        row.backImage && row.backImage.length ? row.backImage[0] : null,
    });
    setShowModal(true);
  };

  const abrirPrimeraImagen = (row: GuardLicense): boolean => {
    const href = enlaceDeImagen(row.frontImage?.[0] || row.backImage?.[0]);

    if (!href) return false;
    window.open(href, "_blank", "noopener,noreferrer");

    return true;
  };

  // «Descargar» on the card and in the details: the license PDF (it carries
  // both images), for guards and supervisors alike. If the PDF cannot be
  // made, the image opens instead.
  const downloadRow = async (row: GuardLicense) => {
    try {
      const blob = await api.download(row.id);
      const url = window.URL.createObjectURL(
        new Blob([blob], { type: "application/pdf" }),
      );
      const a = document.createElement("a");

      a.href = url;
      a.download = `license-${row.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (abrirPrimeraImagen(row)) return;
      console.error("Error downloading report", err);
      toast.error(
        t("guards.licenses.toasts.downloadError", {
          defaultValue: "No se pudo descargar la licencia",
        }),
      );
    }
  };

  const confirmarBorrado = (count: number) =>
    confirmDialog({
      message: t("guards.licenses.confirmDelete", {
        count,
        defaultValue:
          "¿Eliminar {{count}} licencias? Esta acción no se puede deshacer.",
      }),
      confirmText: t("actions.delete", { defaultValue: "Eliminar" }),
      tone: "danger",
    });

  const deleteRow = async (row: GuardLicense) => {
    if (!(await confirmarBorrado(1))) return;
    try {
      await api.remove([row.id]);
      toast.success(
        t("guards.licenses.toasts.deleted", { defaultValue: "Deleted" }),
      );
      await loadLicenses(1, limit);
    } catch {
      toast.error(
        t("guards.licenses.toasts.deleteError", {
          defaultValue: "Could not delete",
        }),
      );
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirmarBorrado(selectedIds.length))) return;
    try {
      await api.remove(selectedIds);
      toast.success(
        t("guards.licenses.toasts.deletedBulk", { defaultValue: "Deleted" }),
      );
      setSelectedIds([]);
      await loadLicenses(1, limit);
    } catch (err) {
      toast.error(
        t("guards.licenses.toasts.deleteError", {
          defaultValue: "Could not delete",
        }),
      );
    }
  };

  const handleSubmitLicense = async () => {
    const falta = licenciaIncompleta(formData);

    if (falta) {
      toast.error(
        falta === "tipo"
          ? t("guards.licenses.errors.typeRequired", {
              defaultValue: "Elige el tipo de licencia.",
            })
          : t("guards.licenses.errors.numberRequired", {
              defaultValue: "Escribe el número de la licencia.",
            }),
      );

      return;
    }
    try {
      const payload: LicensePayload = {};

      // If user selected an existing license type, send its id. If 'other', send custom name.
      if (formData.licenseType && formData.licenseType !== "other") {
        payload.licenseTypeId = formData.licenseType;
      } else if (formData.licenseType === "other") {
        payload.customName = formData.customLicenseName;
      } else {
        payload.customName = formData.customLicenseName || null;
      }
      payload.number = formData.licenseNumber;
      payload.expiryDate = formData.expiryDate || null;

      // Images: if user provided a File, upload; if existing descriptor (has id), pass through
      if (formData.frontImage) {
        if (formData.frontImage instanceof File) {
          const front = await securityGuardService.uploadGuardLicenseImage(
            formData.frontImage,
          );

          payload.frontImage = [front];
        } else if (formData.frontImage.id) {
          payload.frontImage = [formData.frontImage];
        }
      }

      if (formData.backImage) {
        if (formData.backImage instanceof File) {
          const back = await securityGuardService.uploadGuardLicenseImage(
            formData.backImage,
          );

          payload.backImage = [back];
        } else if (formData.backImage.id) {
          payload.backImage = [formData.backImage];
        }
      }

      if (currentLicense) {
        await api.update(currentLicense, payload);
        toast.success(
          t("guards.licenses.toasts.updated", {
            defaultValue: "License updated",
          }),
        );
      } else {
        await api.create(payload);
        toast.success(
          t("guards.licenses.toasts.created", {
            defaultValue: "License created",
          }),
        );
      }
      setCurrentLicense("");
      setShowModal(false);
      setSelectedIds([]);
      // refresh list and go to first page to show the new item
      setPage(1);
      await loadLicenses(1, limit);
    } catch (err: any) {
      console.error("Error creating license", err);
      toast.error(
        t("guards.licenses.toasts.createError", {
          defaultValue: "Could not create license",
        }),
      );
    }
  };

  // ── Client-side search over the loaded page (purely presentational filter) ──
  const visibleLicenses = licenseData.filter((lic: GuardLicense) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = (lic.licenseType?.name || lic.customName || "").toLowerCase();
    const num = (lic.number || "").toLowerCase();

    return name.includes(q) || num.includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const isEditing = !!currentLicense;

  return (
    <AppLayout>
      <GuardsLayout navKey={navKey} title={title}>
        <PageContainer>
          {/* ── HEADER / TOOLBAR ──────────────────────────────────────────────── */}
          <PageHeader
            actions={
              <>
                <SearchInput
                  placeholder={t("guards.licenses.searchPlaceholder", {
                      defaultValue: "Search license",
                    })}
                  value={searchQuery}
                  onChange={(v) => setSearchQuery(v)}
                />
                <Button
                  className="whitespace-nowrap"
                  variant="brand"
                  onClick={handleAddLicense}
                >
                  <Plus size={16} />
                  {t("guards.licenses.newLicense", {
                    defaultValue: "New License",
                  })}
                </Button>
              </>
            }
            icon={<IdCard />}
            subtitle={
              navKey === "supervisors"
                ? t("guards.licenses.subtitleSupervisor", {
                    defaultValue: "Documentos y credenciales del supervisor",
                  })
                : t("guards.licenses.subtitle", {
                    defaultValue: "Documentos y credenciales del vigilante",
                  })
            }
            title={t("guards.nav.licencias") || "Licencias"}
          />

          {/* ── BULK ACTION BAR (shown only with a selection) ─────────────────── */}
          {selectedIds.length > 0 && (
            <div className="glass-sunken flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm font-medium">
                {selectedIds.length}{" "}
                {t("guards.licenses.selected", {
                  defaultValue: "seleccionadas",
                })}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedIds([])}
                >
                  {t("actions.cancel", { defaultValue: "Cancelar" })}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleBulkDelete}
                >
                  <Trash className="h-4 w-4" />
                  {t("actions.delete", { defaultValue: "Eliminar" })}
                </Button>
              </div>
            </div>
          )}

          {/* ── LICENSE CARDS ─────────────────────────────────────────────────── */}
          {loading ? (
            <SkeletonCards count={4} />
          ) : visibleLicenses.length === 0 ? (
            <EmptyState
              action={
                <Button variant="brand" onClick={handleAddLicense}>
                  <Plus size={16} />
                  {t("guards.licenses.newLicense", {
                    defaultValue: "New License",
                  })}
                </Button>
              }
              description={
                searchQuery.trim() ? (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: t("guards.licenses.empty.description"),
                    }}
                  />
                ) : (
                  t("guards.licenses.empty.hint", {
                    defaultValue: "Agrega la primera licencia o credencial.",
                  })
                )
              }
              icon={<IdCard />}
              title={
                searchQuery.trim()
                  ? t("guards.licenses.empty.title")
                  : t("guards.licenses.empty.none", {
                      defaultValue: "Sin licencias todavía",
                    })
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {visibleLicenses.map((lic: GuardLicense) => {
                const status = expiryStatus(lic.expiryDate, t);
                const selected = selectedIds.includes(lic.id);
                const typeName =
                  lic.licenseType?.name ||
                  lic.customName ||
                  t("guards.licenses.untitled", { defaultValue: "Licencia" });

                return (
                  /* Se repite por licencia → cristal plano, sin desenfoque. */
                  <div
                    key={lic.id}
                    className={`glass-flat glass-hover cg-focus group relative cursor-pointer p-5 ${selected ? "glass-brand" : ""}`}
                    onClick={() => openDetails(lic.id)}
                  >
                    {/* casilla de selección */}
                    <input
                      checked={selected}
                      className="absolute right-4 top-4 h-4 w-4 cursor-pointer rounded opacity-0 transition checked:opacity-100 group-hover:opacity-100 focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
                      style={{ accentColor: "var(--brand)" }}
                      type="checkbox"
                      onChange={(e) => onSelectOne(lic.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                    />

                    <div className="flex items-start gap-3 pr-6">
                      <IconTile tone="brand">
                        <IdCard />
                      </IconTile>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold tracking-tight">
                          {typeName}
                        </div>
                        <div
                          className="truncate text-xs"
                          style={{ color: "var(--ink-soft)" }}
                        >
                          {lic.number ||
                            t("guards.licenses.noNumber", {
                              defaultValue: "Sin número",
                            })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <Field
                        label={t("guards.licenses.form.issueDate", {
                          defaultValue: "Emitida",
                        })}
                        value={
                          lic.issueDate
                            ? soloFechaCivil(lic.issueDate, {}, "")
                            : null
                        }
                      />
                      <Field
                        label={t("guards.licenses.table.expires", {
                          defaultValue: "Expires On",
                        })}
                        value={
                          lic.expiryDate
                            ? soloFechaCivil(lic.expiryDate, {}, "")
                            : null
                        }
                      />
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-2">
                      <StatusBadge tone={status.tone}>{status.txt}</StatusBadge>

                      <div
                        className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="icon-sm"
                          title={t("actions.viewDetails", {
                            defaultValue: "View",
                          })}
                          variant="ghost"
                          onClick={() => openDetails(lic.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          title={t("actions.edit", { defaultValue: "Editar" })}
                          variant="ghost"
                          onClick={() => startEdit(lic)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon-sm"
                          title={t("actions.download", {
                            defaultValue: "Download",
                          })}
                          variant="ghost"
                          onClick={() => downloadRow(lic)}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                        <Button
                          className="hover:[color:var(--bad-text)]"
                          size="icon-sm"
                          title={t("actions.delete", {
                            defaultValue: "Delete",
                          })}
                          variant="ghost"
                          onClick={() => deleteRow(lic)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── PAGINATION ────────────────────────────────────────────────────── */}
          {!loading && visibleLicenses.length > 0 && (
            <div
              className="glass flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              style={{ color: "var(--ink-soft)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span>{t("clients.pagination.itemsPerPage")}</span>
                <Select
                  value={String(limit)}
                  onValueChange={(v) => {
                    setLimit(Number(v));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                {page} {t("clients.pagination.of", { defaultValue: "de" })}{" "}
                {totalPages}
              </div>

              <div className="flex gap-2">
                <Button
                  disabled={page === 1 || loading}
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("clients.pagination.prev")}
                </Button>
                <Button
                  disabled={page * limit >= totalCount || loading}
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("clients.pagination.next")}
                </Button>
              </div>
            </div>
          )}

          {/* Modal (add / edit) */}
          {showModal && (
            <div
              className="glass-scrim fixed inset-0 z-50"
              onClick={handleCloseModal}
            >
              <div
                className="glass-raised fixed bottom-0 right-0 top-0 w-full max-w-md overflow-y-auto rounded-l-3xl rounded-r-none"
                style={{ position: "fixed" }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Cabecera */}
                <div
                  className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-5"
                  style={{
                    borderColor: "var(--hairline)",
                    background: "var(--glass-solid)",
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <IconTile size="sm" tone="brand">
                      <ShieldCheck />
                    </IconTile>
                    <h2 className="text-base font-semibold tracking-tight">
                      {isEditing
                        ? t("guards.licenses.modal.editTitle", {
                            defaultValue: "Editar licencia",
                          })
                        : t("guards.licenses.modal.title", {
                            defaultValue: "Add New License",
                          })}
                    </h2>
                  </div>
                  <Button
                    aria-label={t("actions.close")}
                    size="icon-sm"
                    variant="ghost"
                    onClick={handleCloseModal}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                {/* Body */}
                <div className="p-6">
                  <form className="space-y-5">
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("guards.licenses.form.licenseType", {
                          defaultValue: "Tipo de licencia",
                        })}{" "}
                        <span style={{ color: "var(--bad-text)" }}>*</span>
                      </label>
                      <Select
                        value={formData.licenseType}
                        onValueChange={(v) => {
                          // placeholder token
                          if (v === "__empty") {
                            setFormData({
                              ...formData,
                              licenseType: "",
                              customLicenseName: "",
                            });

                            return;
                          }
                          // if user chose to create a new license type
                          if (v === "other") {
                            // check permission
                            if (!hasPermission("licenseTypeCreate")) {
                              toast.error(
                                t(
                                  "guards.licenses.toasts.noPermissionCreateType",
                                  {
                                    defaultValue:
                                      "No tiene permiso para crear tipos de licencia",
                                  },
                                ),
                              );

                              return;
                            }
                            // open dialog to create new type
                            setShowCreateLicenseType(true);

                            return;
                          }
                          setFormData({
                            ...formData,
                            licenseType: v,
                            customLicenseName: "",
                          });
                        }}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue
                            placeholder={t(
                              "guards.licenses.form.selectLicenseType",
                              { defaultValue: "Selecciona tipo" },
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {licenseTypes.map((lt: LicenseTypeOption) => (
                            <SelectItem key={lt.id} value={lt.id}>
                              {lt.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="other">
                            {t("guards.licenses.form.option.other", {
                              defaultValue: "Other",
                            })}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("guards.licenses.form.licenseNumber", {
                          defaultValue: "Número de licencia",
                        })}{" "}
                        <span style={{ color: "var(--bad-text)" }}>*</span>
                      </label>
                      <Input
                        className="h-9 text-sm"
                        placeholder={t(
                          "guards.licenses.form.licenseNumberPlaceholder",
                          { defaultValue: "Ingresa número" },
                        )}
                        type="text"
                        value={formData.licenseNumber}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            licenseNumber: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="cg-eyebrow mb-1.5 block">
                        {t("guards.licenses.form.expiryDate", {
                          defaultValue: "Vence el",
                        })}
                      </label>
                      <Input
                        className="h-9 text-sm cursor-pointer"
                        type="date"
                        value={formData.expiryDate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            expiryDate: e.target.value,
                          })
                        }
                      />
                    </div>

                    {(formData.licenseType === "other" ||
                      !formData.licenseType) && (
                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          {t("guards.licenses.form.customLicenseName", {
                            defaultValue: "Nombre personalizado",
                          })}
                        </label>
                        <Input
                          className="h-9 text-sm"
                          placeholder={t(
                            "guards.licenses.form.customLicensePlaceholder",
                            { defaultValue: "Nombre (si aplica)" },
                          )}
                          type="text"
                          value={formData.customLicenseName}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              customLicenseName: e.target.value,
                            })
                          }
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          {t("guards.licenses.form.frontImageLabel", {
                            defaultValue: "Imagen frontal",
                          })}
                        </label>
                        <input
                          accept="image/*"
                          className="hidden"
                          id="frontImage"
                          type="file"
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              frontImage: e.target.files?.[0] || null,
                            })
                          }
                        />
                        <label
                          className="cg-input flex h-9 cursor-pointer items-center gap-2 px-3 text-sm transition"
                          htmlFor="frontImage"
                        >
                          <Paperclip
                            className="h-4 w-4 shrink-0"
                            style={{ color: "var(--ink-faint)" }}
                          />
                          <span
                            className="truncate text-sm"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {formData.frontImage
                              ? formData.frontImage.name ||
                                t("guards.licenses.form.fileSelected", {
                                  defaultValue: "Archivo seleccionado",
                                })
                              : t("guards.licenses.form.chooseFile", {
                                  defaultValue: "Seleccionar archivo",
                                })}
                          </span>
                        </label>
                      </div>

                      <div>
                        <label className="cg-eyebrow mb-1.5 block">
                          {t("guards.licenses.form.backImageLabel", {
                            defaultValue: "Imagen trasera",
                          })}
                        </label>
                        <input
                          accept="image/*"
                          className="hidden"
                          id="backImage"
                          type="file"
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              backImage: e.target.files?.[0] || null,
                            })
                          }
                        />
                        <label
                          className="cg-input flex h-9 cursor-pointer items-center gap-2 px-3 text-sm transition"
                          htmlFor="backImage"
                        >
                          <Paperclip
                            className="h-4 w-4 shrink-0"
                            style={{ color: "var(--ink-faint)" }}
                          />
                          <span
                            className="truncate text-sm"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {formData.backImage
                              ? formData.backImage.name ||
                                t("guards.licenses.form.fileSelected", {
                                  defaultValue: "Archivo seleccionado",
                                })
                              : t("guards.licenses.form.chooseFile", {
                                  defaultValue: "Seleccionar archivo",
                                })}
                          </span>
                        </label>
                      </div>
                    </div>
                  </form>
                </div>

                {/* Pie */}
                <div
                  className="sticky bottom-0 flex items-center justify-end gap-3 border-t px-6 py-4"
                  style={{
                    borderColor: "var(--hairline)",
                    background: "var(--glass-solid)",
                  }}
                >
                  <Button variant="outline" onClick={handleCloseModal}>
                    {t("guards.licenses.modal.cancel", {
                      defaultValue: "Cancelar",
                    })}
                  </Button>
                  <Button variant="brand" onClick={handleSubmitLicense}>
                    {t("guards.licenses.modal.save", {
                      defaultValue: "Guardar",
                    })}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </PageContainer>
        {/* Dialog to create a new license type (tenant-scoped). */}
        <LicenseTypeDialog
          open={showCreateLicenseType}
          onOpenChange={(v) => setShowCreateLicenseType(v)}
          onSubmit={async (values) => {
            try {
              const created = await licenseTypeService.create({
                name: values.name,
              });
              const newType =
                created && (created.data ?? created)
                  ? (created.data ?? created)
                  : created;
              const added = Array.isArray(newType) ? newType[0] : newType;

              if (added) {
                setLicenseTypes((prev) => [...prev, added]);
                setFormData((f) => ({ ...f, licenseType: String(added.id) }));
              }
              setShowCreateLicenseType(false);
            } catch (err) {
              console.error("Error creating license type", err);
              toast.error(
                t("licenseTypes.dialog.createError", {
                  defaultValue: "Could not create license type",
                }),
              );
            }
          }}
        />

        {/* Details modal */}
        {detailsOpen && (
          <div
            className="glass-scrim fixed inset-0 z-50"
            onClick={closeDetails}
          >
            <div
              className="glass-raised fixed bottom-0 right-0 top-0 w-full max-w-md overflow-y-auto rounded-l-3xl rounded-r-none"
              style={{ position: "fixed" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-5"
                style={{
                  borderColor: "var(--hairline)",
                  background: "var(--glass-solid)",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <IconTile size="sm" tone="brand">
                    <IdCard />
                  </IconTile>
                  <h2 className="text-base font-semibold tracking-tight">
                    {t("guards.licenses.details.title", {
                      defaultValue: "License details",
                    })}
                  </h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="cg-btn-ghost cg-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition"
                    onClick={() => {
                      // Prefill form and open edit modal
                      if (!detailsData) return;
                      setCurrentLicense(detailsData.id);
                      setFormData({
                        licenseType:
                          detailsData.licenseType?.id ??
                          (detailsData.customName ? "other" : ""),
                        customLicenseName: detailsData.customName || "",
                        licenseNumber: detailsData.number || "",
                        expiryDate: detailsData.expiryDate
                          ? new Date(detailsData.expiryDate)
                              .toISOString()
                              .slice(0, 10)
                          : "",
                        frontImage:
                          detailsData.frontImage &&
                          detailsData.frontImage.length
                            ? detailsData.frontImage[0]
                            : null,
                        backImage:
                          detailsData.backImage && detailsData.backImage.length
                            ? detailsData.backImage[0]
                            : null,
                      });
                      setDetailsOpen(false);
                      setShowModal(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    {t("guards.licenses.details.edit", {
                      defaultValue: "Editar",
                    })}
                  </button>
                  <Button
                    aria-label={t("actions.close")}
                    size="icon-sm"
                    variant="ghost"
                    onClick={closeDetails}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </div>

              <div className="p-6">
                {detailsLoading && (
                  <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t("loading", { defaultValue: "Loading..." })}
                  </div>
                )}
                {!detailsLoading && !detailsData && (
                  <div className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {t("guards.licenses.details.notFound", {
                      defaultValue: "Details not available",
                    })}
                  </div>
                )}

                {!detailsLoading && detailsData && (
                  <div className="space-y-5">
                    {(() => {
                      const status = expiryStatus(detailsData.expiryDate, t);

                      return (
                        <StatusBadge tone={status.tone}>
                          {status.txt}
                        </StatusBadge>
                      );
                    })()}

                    <div className="grid grid-cols-2 gap-4">
                      <Field
                        label={t("guards.licenses.table.type", {
                          defaultValue: "License Type",
                        })}
                        value={
                          detailsData.licenseType?.name ||
                          detailsData.customName
                        }
                      />
                      <Field
                        label={t("guards.licenses.form.licenseNumber", {
                          defaultValue: "Número de licencia",
                        })}
                        value={detailsData.number}
                      />
                      <Field
                        label={t("guards.licenses.form.issueDate", {
                          defaultValue: "Issued",
                        })}
                        value={
                          detailsData.issueDate
                            ? soloFechaCivil(detailsData.issueDate, {}, "")
                            : null
                        }
                      />
                      <Field
                        label={t("guards.licenses.form.expiryDate", {
                          defaultValue: "Vence el",
                        })}
                        value={
                          detailsData.expiryDate
                            ? soloFechaCivil(detailsData.expiryDate, {}, "")
                            : null
                        }
                      />
                      <Field
                        label={t("guards.licenses.table.addedBy", {
                          defaultValue: "Added By",
                        })}
                        value={
                          detailsData.createdBy?.fullName ||
                          detailsData.createdBy?.email
                        }
                      />
                    </div>

                    <div
                      className="grid grid-cols-1 gap-4 border-t pt-4"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <div>
                        <div className="cg-eyebrow mb-1.5">
                          {t("guards.licenses.form.frontImageLabel", {
                            defaultValue: "Imagen frontal",
                          })}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {detailsData.frontImage?.map(
                            (f: FileDescriptor, idx: number) => (
                              <a
                                key={idx}
                                className="inline-flex items-center gap-2 rounded-xl border p-1.5 pr-3 text-xs font-medium transition hover:[border-color:var(--brand-line)]"
                                href={enlaceDeImagen(f) ?? undefined}
                                rel="noreferrer"
                                style={{
                                  background: "var(--glass-sunken)",
                                  borderColor: "var(--hairline)",
                                }}
                                target="_blank"
                              >
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                                  <SmartImage
                                    alt={f.name || ""}
                                    className="h-full w-full"
                                    fallback={
                                      <Paperclip className="h-3.5 w-3.5" />
                                    }
                                    rounded="rounded-lg"
                                    src={enlaceDeImagen(f)}
                                  />
                                </span>
                                {f.name ||
                                  (f.publicUrl
                                    ? t("actions.view", { defaultValue: "Ver" })
                                    : t("actions.download", {
                                        defaultValue: "Descargar",
                                      }))}
                              </a>
                            ),
                          )}
                          {!detailsData.frontImage?.length && (
                            <div
                              className="text-sm"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              —
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <div className="cg-eyebrow mb-1.5">
                          {t("guards.licenses.form.backImageLabel", {
                            defaultValue: "Imagen trasera",
                          })}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {detailsData.backImage?.map(
                            (f: FileDescriptor, idx: number) => (
                              <a
                                key={idx}
                                className="inline-flex items-center gap-2 rounded-xl border p-1.5 pr-3 text-xs font-medium transition hover:[border-color:var(--brand-line)]"
                                href={enlaceDeImagen(f) ?? undefined}
                                rel="noreferrer"
                                style={{
                                  background: "var(--glass-sunken)",
                                  borderColor: "var(--hairline)",
                                }}
                                target="_blank"
                              >
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                                  <SmartImage
                                    alt={f.name || ""}
                                    className="h-full w-full"
                                    fallback={
                                      <Paperclip className="h-3.5 w-3.5" />
                                    }
                                    rounded="rounded-lg"
                                    src={enlaceDeImagen(f)}
                                  />
                                </span>
                                {f.name ||
                                  (f.publicUrl
                                    ? t("actions.view", { defaultValue: "Ver" })
                                    : t("actions.download", {
                                        defaultValue: "Descargar",
                                      }))}
                              </a>
                            ),
                          )}
                          {!detailsData.backImage?.length && (
                            <div
                              className="text-sm"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              —
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div
                className="sticky bottom-0 flex items-center justify-end gap-3 border-t px-6 py-4"
                style={{
                  borderColor: "var(--hairline)",
                  background: "var(--glass-solid)",
                }}
              >
                <button
                  className="cg-btn-glass cg-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition"
                  onClick={() => {
                    if (detailsData) downloadRow(detailsData);
                  }}
                >
                  <FileDown className="h-4 w-4" />
                  {t("guards.licenses.details.download", {
                    defaultValue: "Descargar",
                  })}
                </button>
                <Button variant="outline" onClick={closeDetails}>
                  {t("guards.licenses.modal.close", { defaultValue: "Cerrar" })}
                </Button>
              </div>
            </div>
          </div>
        )}
      </GuardsLayout>
    </AppLayout>
  );
}
