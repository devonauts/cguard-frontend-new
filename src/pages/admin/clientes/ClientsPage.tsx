import type { Client } from "@/types/client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAppDelCliente } from "@/lib/appDelCliente";
import {
  EllipsisVertical,
  Filter,
  FileDown,
  FileSpreadsheet,
  ArrowDownUp,
  Search,
  Eye,
  Tag,
  Archive,
  Trash,
  RotateCcw,
  Smartphone,
  Download,
  Users,
  Plus,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LayoutGrid, List as ListIcon } from "lucide-react";

import ClientCardsGrid, {
  type ClientCardMeta,
} from "./components/ClientCardsGrid";

import EtiquetaDeSucursal from "@/components/sucursales/EtiquetaDeSucursal";
import { useEtiquetasDeSucursal } from "@/hooks/useEtiquetasDeSucursal";
import { clientDisplayName } from "@/lib/clientName";
import { usePageTitle } from "@/hooks/usePageTitle";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  Toolbar,
  Segmented,
  EmptyState,
  IconTile,
} from "@/components/kit";
import { clientService } from "@/lib/api/clientService";
import { useAppInviteEnabled } from "@/hooks/useAppInviteEnabled";

type ClientFilters = {
  active?: boolean;
  /** La sección de Archivados. Ver la nota del selector. */
  archived?: boolean;
  email?: string;
  phoneNumber?: string;
  city?: string;
  country?: string;
  category?: string;
  name?: string;
  lastName?: string;
};

import { type Category } from "@/lib/api/categoryService";
import { useCategories } from "@/hooks/data";
import CategoryManagerDialog from "@/components/categories/CategoryManagerDialog";
import {
  BulkActionsSelect,
  type BulkAction,
} from "@/components/table/BulkActionsSelect";
import { DataTable, type Column } from "@/components/table/DataTable";

import type { RowAction } from "@/components/table/RowActionsMenu";

import { RowActionsMenu } from "@/components/table/RowActionsMenu";
import MobileCardList from "@/components/responsive/MobileCardList";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { CategorySelect } from "@/components/categories/CategorySelect";
import { ImportDialog } from "@/components/clients/ImportDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useClientSelection } from "@/contexts/ClientSelectionContext";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { enLotes } from "@/lib/enLotes";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { useVistaGuardada } from "@/hooks/useVistaGuardada";
import { ejemploDeTelefono } from "@/lib/telefonoDeLaEmpresa";

// Guard against the literal string 'undefined' that some legacy records persisted
// for lastName (from a String(undefined) concat on save). Hides bad data until cleaned.
const cleanLastName = (lastName: unknown): string =>
  lastName && lastName !== "undefined" ? String(lastName) : "";

const getServerErrorMessage = (error: any, defaultMessage = "Error") => {
  try {
    return error?.response?.data?.message ?? error?.message ?? defaultMessage;
  } catch {
    return defaultMessage;
  }
};

export default function ClientesPage() {
  const { t } = useTranslation();
  const appDelCliente = useAppDelCliente();

  usePageTitle(t("clients.nav.title", "Clientes"));
  const { hasPermission } = usePermissions();
  const navigate = useNavigate();
  const [openFilter, setOpenFilter] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [openCategoryManager, setOpenCategoryManager] = useState(false);
  // Details now open in separate page; modal state removed

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  // Categories are cached + shared via react-query (was a re-fetch on every
  // mount/navigation). loadCategories() below just refetches on demand.
  const { data: categories = [] as Category[], refetch: refetchCategories } =
    useCategories("clientAccount");

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<ClientFilters>({ active: true });
  const [bulkKey, setBulkKey] = useState(0);
  // Vista Cards ⇄ Lista (persistida). Cards por defecto: es la experiencia
  // renovada; la lista queda a un clic para power users.
  const [viewMode, setViewMode] = useVistaGuardada<"cards" | "list">(
    "clients.viewMode",
    "cards",
  );
  const [cardMeta, setCardMeta] = useState<Record<string, ClientCardMeta>>({});

  // Meta de tarjetas (logo firmado + conteos) por lote, solo en vista cards.
  useEffect(() => {
    if (viewMode !== "cards" || !clients.length) return;
    const missing = clients.map((c) => c.id).filter((id) => !(id in cardMeta));

    if (!missing.length) return;
    clientService
      .getCardMeta(missing)
      .then((m) => setCardMeta((prev) => ({ ...prev, ...m })))
      .catch(() => {});
  }, [viewMode, clients]);
  // Sorting state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [openMoveDialog, setOpenMoveDialog] = useState(false);
  const [moveCategories, setMoveCategories] = useState<string[]>([]);
  const [moveLoading, setMoveLoading] = useState(false);
  const [openCategorizeDialog, setOpenCategorizeDialog] = useState(false);
  const [categorizeClientId, setCategorizeClientId] = useState<string | null>(
    null,
  );
  const [categorizeClientName, setCategorizeClientName] = useState<string>("");
  const [categorizeCategories, setCategorizeCategories] = useState<string[]>(
    [],
  );
  const [categorizeLoading, setCategorizeLoading] = useState(false);
  const [categorizeSaving, setCategorizeSaving] = useState(false);
  const [openArchiveBulkDialog, setOpenArchiveBulkDialog] = useState(false);
  /* Qué se va a llevar por delante el archivado. Archivar suelta vigilantes de
     sus puestos y anula sus turnos: quien lo pulsa tiene que verlo ANTES, no
     enterarse después. Para un solo cliente se pide al abrir el diálogo. */
  const [alcanceArchivado, setAlcanceArchivado] = useState<{
    sedes: number;
    estaciones: number;
    vigilantes: number;
    nombresDeSedes: string[];
    nombresDeVigilantes: string[];
  } | null>(null);
  const [openArchiveSingleDialog, setOpenArchiveSingleDialog] = useState(false);
  const [archiveSingleClient, setArchiveSingleClient] = useState<Client | null>(
    null,
  );
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);
  const [openRestoreDialog, setOpenRestoreDialog] = useState(false);
  const [restoreClient, setRestoreClient] = useState<Client | null>(null);
  const [openRestoreBulkDialog, setOpenRestoreBulkDialog] = useState(false);
  const [openDeleteBulkDialog, setOpenDeleteBulkDialog] = useState(false);
  const [openSendAccessDialog, setOpenSendAccessDialog] = useState(false);
  const [sendAccessClient, setSendAccessClient] = useState<Client | null>(null);
  const [sendingAccess, setSendingAccess] = useState(false);
  const [openAppInviteDialog, setOpenAppInviteDialog] = useState(false);
  const [appInviteClient, setAppInviteClient] = useState<Client | null>(null);
  const [sendingAppInvite, setSendingAppInvite] = useState(false);

  // El correo de invitación a la app se puede apagar en Preferencias de correo;
  // si está apagado, esta acción no se ofrece (ver el hook).
  const appInviteEnabled = useAppInviteEnabled();
  const { setSelectedClient } = useClientSelection();

  const debouncedSearch = useDebouncedValue(searchQuery, 500);

  // Ensure we only notify tenant-missing once per page lifecycle
  const tenantMissingNotifiedRef = useRef(false);
  const loadClientsSeqRef = useRef(0);

  const loadClients = async () => {
    // Monotonic guard: filters/page/sort changes fire overlapping loads (the
    // setPage(1) effect + the load effect both react to filters); only the
    // latest response may apply, else a slow earlier one clobbers newer rows.
    const mine = ++loadClientsSeqRef.current;

    setLoading(true);
    try {
      const tenantId = localStorage.getItem("tenantId");

      if (!tenantId) {
        if (!tenantMissingNotifiedRef.current) {
          toast.error(t("ui.ClientsPage.elUsuarioDebeEstarVinculado"));
          tenantMissingNotifiedRef.current = true;
        }
        if (mine === loadClientsSeqRef.current) {
          setClients([]);
          setTotalCount(0);
        }

        return;
      }
      const pagination: { limit: number; offset: number; orderBy?: string } = {
        limit,
        offset: (page - 1) * limit,
      };

      if (sortKey && sortDir) pagination.orderBy = `${sortKey}:${sortDir}`;

      const data = await clientService.getClients(
        {
          ...filters,
          name: debouncedSearch || undefined,
          lastName: debouncedSearch || undefined,
        },
        pagination,
      );

      if (mine !== loadClientsSeqRef.current) return; // superseded by a newer load
      setClients(data.rows);
      setTotalCount(data.count);
    } catch (error: any) {
      if (mine !== loadClientsSeqRef.current) return;
      console.error(error);
      toast.error(
        getServerErrorMessage(error, t("clients.errorLoadingClients")),
      );
    } finally {
      if (mine === loadClientsSeqRef.current) setLoading(false);
    }
  };

  // Backed by react-query (useCategories): refetch on demand. The initial load
  // is handled by the hook with a 2-min staleTime, so navigating back to this
  // page no longer re-queries categories every time.
  const loadCategories = async () => {
    await refetchCategories();
  };

  useEffect(() => {
    if (openCategorizeDialog) {
      loadCategories();
    }
  }, [openCategorizeDialog]);

  useEffect(() => {
    if (openMoveDialog) {
      loadCategories();
    }
  }, [openMoveDialog]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filters]);

  // When changing between responsive layouts (mobile <-> desktop)
  // ensure the page scrolls to the top so the user always sees
  // the beginning of the new layout. This listens to the MD
  // breakpoint used in the UI (`md:` = 768px).
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(min-width: 768px)");
    const scrollTopMain = () => {
      try {
        // AppLayout renders the scrollable area inside a <main> element
        const main = document.querySelector("main");

        if (main && typeof (main as HTMLElement).scrollTo === "function") {
          (main as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });

          return;
        }
      } catch (e) {
        // ignore and fallthrough to window
      }
      try {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        window.scrollTo(0, 0);
      }
    };

    const onChange = () => scrollTopMain();

    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener)
        mq.removeEventListener("change", onChange as any);
      else mq.removeListener(onChange as any);
    };
  }, []);

  // Reset bulk action selector when filter (active state) changes to reflect new options
  useEffect(() => {
    setBulkKey((k) => k + 1);
  }, [filters.active, filters.archived]);

  useEffect(() => {
    loadClients();
  }, [page, limit, debouncedSearch, filters, sortKey, sortDir]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(clients.map((c) => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((item) => item !== id));
    }
  };

  const openCategorizeForClient = async (client: Client) => {
    setCategorizeClientId(client.id);
    setCategorizeClientName(clientDisplayName(client, client.name));
    setCategorizeLoading(true);
    setCategorizeCategories([]);
    setOpenCategorizeDialog(true);
    try {
      const data = await clientService.getClient(client.id);

      setCategorizeCategories((data as any).categoryIds ?? []);
    } catch (error: any) {
      // error handled by backend
      setOpenCategorizeDialog(false);
    } finally {
      setCategorizeLoading(false);
    }
  };

  const handleBulkAction = async (action: string) => {
    if (action === "gestionar-Sectores") {
      // Permitir reabrir/retocar el diálogo aunque ya esté abierto
      setOpenCategoryManager((prev) => {
        if (prev) {
          // toggle para forzar re-render del diálogo
          setTimeout(() => setOpenCategoryManager(true), 0);

          return false;
        }

        return true;
      });
      // Resetear el selector para poder re-seleccionar la misma opción
      setBulkKey((k) => k + 1);

      return;
    }

    if (action === "mover") {
      if (selectedIds.length === 0) {
        toast.error(t("clients.selectAtLeastOne"));
        setBulkKey((k) => k + 1);

        return;
      }
      setMoveCategories([]);
      setOpenMoveDialog(true);
      setBulkKey((k) => k + 1);

      return;
    }

    if (selectedIds.length === 0) {
      toast.error(t("clients.selectAtLeastOne"));
      setBulkKey((k) => k + 1);

      return;
    }

    if (action === "archivar") {
      const invalid = selectedIds.filter((id) => {
        const c = clients.find((x) => x.id === id);

        return !c || c.active === false;
      });

      if (invalid.length > 0) {
        // Say why nothing happened instead of silently clearing the selection.
        toast.error(t("clients.selectOnlyActiveToArchive"));
        setSelectedIds([]);
        setBulkKey((k) => k + 1);

        return;
      }
      setAlcanceArchivado(null);
      if (selectedIds.length === 1) {
        clientService
          .archiveImpact(selectedIds[0])
          .then(setAlcanceArchivado)
          .catch(() => setAlcanceArchivado(null));
      }
      setOpenArchiveBulkDialog(true);
      setBulkKey((k) => k + 1);

      return;
    }

    if (action === "restaurar") {
      const invalid = selectedIds.filter((id) => {
        const c = clients.find((x) => x.id === id);

        return !c || c.active === true;
      });

      if (invalid.length > 0) {
        // Say why nothing happened instead of silently clearing the selection.
        toast.error(t("clients.selectOnlyArchivedToRestore"));
        setSelectedIds([]);
        setBulkKey((k) => k + 1);

        return;
      }
      setOpenRestoreBulkDialog(true);
      setBulkKey((k) => k + 1);

      return;
    }

    if (action === "eliminar") {
      const invalid = selectedIds.filter((id) => {
        const c = clients.find((x) => x.id === id);

        return !c || c.active === true;
      });

      if (invalid.length > 0) {
        // Say why nothing happened instead of silently clearing the selection.
        toast.error(t("clients.selectOnlyArchivedToDelete"));
        setSelectedIds([]);
        setBulkKey((k) => k + 1);

        return;
      }
      setOpenDeleteBulkDialog(true);
      setBulkKey((k) => k + 1);

      return;
    }

    toast.info(t("clients.actionNotImplemented", { action }));
    // Resetear el selector tras cualquier acción
    setBulkKey((k) => k + 1);
  };

  const handleExportPDF = async () => {
    try {
      toast.loading(t("clients.generatingPDF"));
      const blob = await clientService.exportPDF({
        ...filters,
        name: debouncedSearch || undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `clientes-${hoyEnLaEmpresa()}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success(t("clients.pdfDownloaded"));
    } catch (error: any) {
      toast.dismiss();
      // backend handles error notification
    }
  };

  const handleExportExcel = async () => {
    try {
      toast.loading(t("clients.generatingExcel"));
      const blob = await clientService.exportExcel({
        ...filters,
        name: debouncedSearch || undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `clientes-${hoyEnLaEmpresa()}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success(t("clients.excelDownloaded"));
    } catch (error: any) {
      toast.dismiss();
      // backend handles error notification
    }
  };

  const handleCategorizeSubmit = async () => {
    if (!categorizeClientId) return;
    setCategorizeSaving(true);
    try {
      await clientService.updateClient(categorizeClientId, {
        categoryIds: categorizeCategories,
      } as any);
      toast.success(t("clients.categoriesUpdated"));
      setOpenCategorizeDialog(false);
      loadClients();
      loadCategories();
    } catch (error: any) {
      // backend handles error notification
    } finally {
      setCategorizeSaving(false);
    }
  };

  const handleMoveSubmit = async () => {
    if (moveCategories.length === 0) {
      toast.warning(t("clients.selectAtLeastOneCategory"));

      return;
    }
    setMoveLoading(true);
    try {
      /* `enLotes` y no `allSettled(map(...))`: dentro de un `.map` la petición
         ARRANCA al construir el array, así que «esperar» después no limita
         nada. Con «seleccionar todo» sobre una lista cargada entera esto eran
         cientos de PUT simultáneos. Misma forma de resultado que `allSettled`. */
      const results = await enLotes(selectedIds, (id) =>
        clientService.updateClient(id, {
          categoryIds: moveCategories,
        } as any),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      const succeeded = results.length - failed;

      if (failed === 0) {
        toast.success(t("clients.categoriesUpdated"));
      } else if (succeeded === 0) {
        toast.error(
          getServerErrorMessage(null, t("clients.errorLoadingClients")),
        );
      } else {
        toast.warning(
          t(
            "clients.bulkPartialSuccess",
            "{{succeeded}} actualizados, {{failed}} con error",
            { succeeded, failed },
          ),
        );
      }
      setOpenMoveDialog(false);
      setSelectedIds([]);
    } finally {
      // Always refresh so the UI reflects whatever actually persisted.
      loadClients();
      loadCategories();
      setMoveLoading(false);
    }
  };

  const bulkActions: BulkAction[] = useMemo(() => {
    const actions: BulkAction[] = [];

    // mover (cambiar categoría) requires edit
    if (hasPermission("clientAccountEdit"))
      actions.push({ value: "mover", label: t("actions.move") });
    if (filters.archived) {
      // En Archivados sólo cabe devolverlo o eliminarlo del todo.
      if (hasPermission("clientAccountDestroy"))
        actions.push({ value: "restaurar", label: t("actions.restore") });
      if (hasPermission("clientAccountDestroy"))
        actions.push({ value: "eliminar", label: t("actions.delete") });
    } else if (filters.active === true) {
      if (hasPermission("clientAccountDestroy"))
        actions.push({ value: "archivar", label: t("actions.archive") });
    } else if (filters.active === false) {
      if (hasPermission("clientAccountEdit"))
        actions.push({ value: "restaurar", label: t("actions.restore") });
      if (hasPermission("clientAccountDestroy"))
        actions.push({ value: "eliminar", label: t("actions.delete") });
    } else {
      if (hasPermission("clientAccountEdit"))
        actions.push({ value: "archivar", label: t("actions.archive") });
      if (hasPermission("clientAccountEdit"))
        actions.push({ value: "restaurar", label: t("actions.restore") });
      if (hasPermission("clientAccountDestroy"))
        actions.push({ value: "eliminar", label: t("actions.delete") });
    }
    if (hasPermission("clientAccountEdit"))
      actions.push({
        value: "gestionar-Sectores",
        label: t("actions.manageCategories"),
      });

    return actions;
    /* `archived` también: de «Todos» a «Archivados» `active` no cambia (sigue
       sin poner) y sin esto no aparecía «Restaurar». */
  }, [filters.active, filters.archived, hasPermission, t]);

  const etiquetas = useEtiquetasDeSucursal();

  const columns: Column<Client>[] = useMemo(
    () => [
      {
        key: "name",
        header: t("clients.columns.name"),
        className: "font-medium",
        render: (value, row) => {
          const lastName = cleanLastName(row.lastName);
          const nombre =
            row.commercialName ||
            (lastName ? `${row.name} ${lastName}` : row.name);

          if (!etiquetas.activo) return nombre;

          return (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span className="truncate">{nombre}</span>
              <EtiquetaDeSucursal
                empresa={!row.branchId}
                sucursal={etiquetas.sucursal(row.branchId)}
              />
            </span>
          );
        },
      },
      // Hide less-important columns on smaller breakpoints to favor compact layouts
      {
        key: "address",
        header: t("clients.columns.address"),
        className: "hidden lg:table-cell",
      },
      {
        key: "email",
        header: t("clients.columns.email"),
        className: "hidden lg:table-cell",
      },
      {
        key: "phoneNumber",
        header: t("clients.columns.phone"),
        className: "hidden lg:table-cell",
      },
      {
        key: "more",
        header: t("clients.columns.more", "Más"),
        className: "hidden",
        render: (_v: unknown, row: Client) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("clients.columns.more", "Más")}
                  size="icon"
                  variant="ghost"
                >
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2 text-sm">
                  <div className="font-medium truncate">
                    {row.commercialName ||
                      (cleanLastName(row.lastName)
                        ? `${row.name} ${cleanLastName(row.lastName)}`
                        : row.name)}
                  </div>
                  <div
                    className="truncate text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {row.email || "-"}
                  </div>
                  <div
                    className="truncate text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {row.phoneNumber || "-"}
                  </div>
                  <div className="mt-2">
                    <Link
                      className="text-sm font-semibold"
                      style={{ color: "var(--brand-text)" }}
                      to={`/clients/${row.id}/overview`}
                    >
                      {t("actions.viewDetails", "Ver")}
                    </Link>
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
      {
        key: "active",
        header: t("clients.columns.status"),
        render: (_value: unknown, row: Client) => {
          // El backend puede enviar booleano o entero (0/1)
          const isActive = row.active === true;

          return (
            <StatusBadge tone={isActive ? "ok" : "bad"}>
              {isActive
                ? t("clients.status.active")
                : t("clients.status.archived")}
            </StatusBadge>
          );
        },
      },
      {
        key: "onboardingStatus",
        header: t("clients.columns.appAccess", "App"),
        render: (_value: unknown, row: Client) => {
          const status = row.onboardingStatus || "not_invited";
          const map: Record<
            string,
            { label: string; tone: "neutral" | "warn" | "ok" | "bad" }
          > = {
            not_invited: {
              label: t("clients.onboarding.not_invited", "Sin acceso"),
              tone: "neutral",
            },
            invited: {
              label: t("clients.onboarding.invited", "Invitado"),
              tone: "warn",
            },
            active: {
              label: t("clients.onboarding.active", "En app"),
              tone: "ok",
            },
            suspended: {
              label: t("clients.onboarding.suspended", "Suspendido"),
              tone: "bad",
            },
          };
          const badge = map[status] || map.not_invited;

          return (
            <StatusBadge className="whitespace-nowrap" tone={badge.tone}>
              {badge.label}
            </StatusBadge>
          );
        },
      },
    ],
    [t, etiquetas],
  );

  const rowActions = (client: Client): RowAction[] => {
    const isActive = client.active === true;
    const actions: RowAction[] = [];

    if (hasPermission("clientAccountRead")) {
      actions.push({
        label: t("actions.viewDetails"),
        icon: <Eye className="h-4 w-4" />,
        onClick: () => {
          // Navigate to client details page instead of opening modal
          navigate(`/clients/${client.id}/overview`);
        },
      });
    }

    if (isActive) {
      if (hasPermission("clientAccountEdit")) {
        actions.push({
          label: t("actions.categorize"),
          icon: <Tag className="h-4 w-4" />,
          onClick: () => openCategorizeForClient(client),
        });

        actions.push({
          label: t("actions.archive"),
          icon: <Archive className="h-4 w-4" />,
          onClick: async () => {
            try {
              /* Archivar de verdad: baja sedes y estaciones y suelta a los
                 vigilantes. Antes esto sólo ponía `active: false`, una bandera
                 que no archivaba nada — el cliente seguía con su operación
                 viva y visible. */
              await clientService.archiveClients([client.id]);
              toast.success(t("clients.clientArchived"));
              loadClients();
            } catch (error: any) {
              toast.error(
                getServerErrorMessage(error, t("clients.errorArchiveClient")),
              );
            }
          },
        });
      }

      if (hasPermission("clientAccountDestroy")) {
        actions.push({
          label: t("actions.delete", "Eliminar"),
          icon: (
            <Trash className="h-4 w-4" style={{ color: "var(--bad-text)" }} />
          ),
          onClick: () => {
            setDeleteClient(client);
            setOpenDeleteDialog(true);
          },
        });
      }
    } else {
      if (hasPermission("clientAccountDestroy")) {
        actions.push({
          label: t("actions.delete", "Eliminar"),
          icon: (
            <Trash className="h-4 w-4" style={{ color: "var(--bad-text)" }} />
          ),
          onClick: () => {
            setDeleteClient(client);
            setOpenDeleteDialog(true);
          },
        });
      }

      if (hasPermission("clientAccountEdit")) {
        actions.push({
          label: t("actions.restore"),
          icon: <RotateCcw className="h-4 w-4" />,
          onClick: () => {
            setRestoreClient(client);
            setOpenRestoreDialog(true);
          },
        });
      }
    }

    if (hasPermission("clientAccountEdit")) {
      actions.push({
        label:
          client.onboardingStatus === "invited" ||
          client.onboardingStatus === "active"
            ? t("clients.resendAppAccess", "Reenviar invitación")
            : t("clients.sendAppAccess", "Enviar acceso a la app"),
        icon: <Smartphone className="h-4 w-4" />,
        onClick: () => {
          setSendAccessClient(client);
          setOpenSendAccessDialog(true);
        },
      });

      if (appInviteEnabled) {
        actions.push({
          label: t("clients.inviteToApp", "Invitar a la app"),
          icon: <Download className="h-4 w-4" />,
          onClick: () => {
            setAppInviteClient(client);
            setOpenAppInviteDialog(true);
          },
        });
      }
    }

    return actions;
  };

  const from = clients.length > 0 ? (page - 1) * limit + 1 : 0;
  const to = Math.min(page * limit, totalCount);

  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      try {
        setIsSmallScreen(window.innerWidth < 640);
      } catch {
        setIsSmallScreen(false);
      }
    };

    onResize();
    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, []);

  const sheetSide = isSmallScreen ? ("bottom" as const) : ("right" as const);
  const sheetClass = isSmallScreen
    ? "w-full h-[85vh] overflow-y-auto rounded-t-lg px-4 py-3"
    : "w-full sm:w-[400px] md:w-[460px] h-[calc(100vh-6rem)] sm:h-auto overflow-y-auto";

  return (
    <AppLayout>
      <section>
        <PageContainer width="wide">
          <PageHeader
            actions={
              hasPermission("clientAccountCreate") ? (
                <Button asChild variant="brand">
                  <Link to="/clients/add-new">
                    <Plus className="h-4 w-4" />
                    {t("clients.newClient")}
                  </Link>
                </Button>
              ) : undefined
            }
            icon={<Users />}
            subtitle={t(
              "clients.header.subtitle",
              "Gestiona tus clientes, su acceso a la app y su categorización.",
            )}
            title={t("clients.breadcrumb.clients")}
          />
          <Toolbar className="grid grid-cols-1 items-center gap-3 p-3 md:grid-cols-[auto_1fr_auto]">
            <div className="flex items-center gap-2">
              <BulkActionsSelect
                key={bulkKey}
                actions={bulkActions}
                onChange={handleBulkAction}
              />
              {/* La puerta a Archivados, a la vista. Antes sólo estaba dentro
                  del panel de Filtros y nadie la encontraba: un cliente que
                  suspendió el servicio no tenía por dónde volver. */}
              <Segmented
                options={[
                  {
                    value: "active",
                    label: t("clients.sections.active", "Activos"),
                  },
                  {
                    value: "archived",
                    label: t("clients.sections.archived", "Archivados"),
                  },
                ]}
                value={
                  filters.archived
                    ? "archived"
                    : filters.active === true
                      ? "active"
                      : ("" as "active")
                }
                onChange={(v) => {
                  setSelectedIds([]);
                  setFilters(
                    v === "archived"
                      ? { ...filters, active: undefined, archived: true }
                      : { ...filters, active: true, archived: undefined },
                  );
                }}
              />
            </div>

            <div className="flex justify-center">
              <div className="glass-sunken flex w-full items-center gap-2 px-2.5">
                <Search
                  className="h-4 w-4 shrink-0"
                  style={{ color: "var(--ink-faint)" }}
                />
                <Input
                  className="h-9 w-full border-0 bg-transparent px-0 shadow-none"
                  placeholder={t("clients.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row items-center gap-2 justify-end w-full md:w-auto">
              <div className="flex w-full md:w-auto gap-2">
                <Sheet open={openFilter} onOpenChange={setOpenFilter}>
                  <SheetTrigger asChild>
                    <Button
                      className="flex-1 justify-center md:flex-none"
                      style={{
                        borderColor: "var(--brand-line)",
                        color: "var(--brand-text)",
                      }}
                      variant="outline"
                    >
                      <Filter className="mr-2 h-4 w-4" />
                      {t("clients.filters.title")}
                    </Button>
                  </SheetTrigger>
                  <SheetContent className={sheetClass} side={sheetSide}>
                    <SheetHeader>
                      <SheetTitle>{t("clients.filters.title")}</SheetTitle>
                    </SheetHeader>

                    <div className="mt-6 space-y-4">
                      <div className="space-y-2">
                        <Label>{t("clients.filters.email")}</Label>
                        <Input
                          placeholder={t("clients.placeholders.emailExample")}
                          value={filters.email || ""}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              email: e.target.value || undefined,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("clients.filters.phone")}</Label>
                        <Input
                          placeholder={t("clients.placeholders.phoneExample", {
                            ejemplo: ejemploDeTelefono(),
                          })}
                          value={filters.phoneNumber || ""}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              phoneNumber: e.target.value || undefined,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("clients.filters.city")}</Label>
                        <Input
                          placeholder={t("clients.placeholders.cityExample")}
                          value={filters.city || ""}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              city: e.target.value || undefined,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("clients.filters.country")}</Label>
                        <Input
                          placeholder={t("clients.placeholders.countryExample")}
                          value={filters.country || ""}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              country: e.target.value || undefined,
                            })
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>{t("clients.filters.categories")}</Label>
                        <Select
                          value={filters.category || "all"}
                          onValueChange={(v: string) =>
                            setFilters({
                              ...filters,
                              category: v === "all" ? undefined : v,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t("clients.filters.all")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              {t("clients.filters.all")}
                            </SelectItem>
                            {categories.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                {category.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>{t("clients.filters.status")}</Label>
                        <Select
                          value={
                            /* `archived` PRIMERO: al entrar en Archivados se
                               limpia `active`, y mirándolo antes el selector
                               decía «Todos» estando en Archivados. */
                            filters.archived
                              ? "inactive"
                              : filters.active === undefined
                                ? "all"
                                : filters.active
                                  ? "active"
                                  : "inactive"
                          }
                          onValueChange={(v: string) => {
                            /* «Archivados» es su propia consulta, no un valor
                               de `active`: lo archivado lleva `deletedAt` y no
                               sale en ninguna otra vista. Por eso se limpia
                               `active` al entrar y se quita `archived` al
                               salir — si no, se pedirían las dos cosas a la
                               vez y no saldría nada. */
                            if (v === "all")
                              setFilters({
                                ...filters,
                                active: undefined,
                                archived: undefined,
                              });
                            else if (v === "active")
                              setFilters({
                                ...filters,
                                active: true,
                                archived: undefined,
                              });
                            else
                              setFilters({
                                ...filters,
                                active: undefined,
                                archived: true,
                              });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t("clients.filters.all")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">
                              {t("clients.filters.all")}
                            </SelectItem>
                            <SelectItem value="active">
                              {t("clients.filters.active")}
                            </SelectItem>
                            <SelectItem value="inactive">
                              {t("clients.filters.archived")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        className="w-full"
                        variant="brand"
                        onClick={() => setOpenFilter(false)}
                      >
                        {t("clients.applyFilters")}
                      </Button>
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => {
                          setFilters({ active: true });
                          setOpenFilter(false);
                        }}
                      >
                        {t("clients.clearFilters")}
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>

                {/* Vista de tarjetas ⇄ lista */}
                <Segmented
                  className="hidden md:inline-flex"
                  options={[
                    {
                      value: "cards",
                      label: (
                        <span className="flex items-center gap-1.5">
                          <LayoutGrid className="h-3.5 w-3.5" />{" "}
                          {t("ui.AdminOfficeUsersPage.tarjetas", "Tarjetas")}
                        </span>
                      ),
                    },
                    {
                      value: "list",
                      label: (
                        <span className="flex items-center gap-1.5">
                          <ListIcon className="h-3.5 w-3.5" />{" "}
                          {t("comun.lista")}
                        </span>
                      ),
                    },
                  ]}
                  value={viewMode}
                  onChange={setViewMode}
                />

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="flex w-12 items-center justify-center md:w-auto"
                      variant="outline"
                    >
                      <EllipsisVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={handleExportPDF}>
                      <FileDown className="mr-2 h-4 w-4" />{" "}
                      {t("clients.exportPDF", "Exportar PDF")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportExcel}>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />{" "}
                      {t("clients.exportExcel", "Exportar Excel")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setOpenImport(true)}>
                      <ArrowDownUp className="mr-2 h-4 w-4" />{" "}
                      {t("clients.import", "Importar")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </Toolbar>

          <div className="mt-4 md:block hidden">
            {viewMode === "cards" ? (
              <ClientCardsGrid
                clients={clients}
                loading={loading}
                meta={cardMeta}
                rowActions={rowActions}
                onOpen={(c) => navigate(`/clients/${c.id}/overview`)}
              />
            ) : (
              <DataTable<Client>
                columns={columns}
                data={clients}
                emptyState={
                  <EmptyState
                    className="border-0"
                    description={t("clients.empty.description")}
                    icon={<Users />}
                    title={t("clients.empty.title")}
                  />
                }
                loading={loading}
                rowActions={rowActions}
                selectedIds={selectedIds}
                sortDir={sortDir ?? undefined}
                sortKey={sortKey ?? undefined}
                onRowClick={(r) => navigate(`/clients/${r.id}/overview`)}
                onSelectAll={handleSelectAll}
                onSelectOne={handleSelectOne}
                onSortChange={(key, dir) => {
                  setSortKey(dir ? key : null);
                  setSortDir(dir);
                  setPage(1);
                }}
              />
            )}

            <div
              className={
                viewMode === "cards"
                  ? "glass-sunken mt-4 flex items-center justify-between px-4 py-3 text-sm"
                  : "glass-sunken flex items-center justify-between rounded-t-none px-4 py-3 text-sm"
              }
              style={{ color: "var(--ink-soft)" }}
            >
              <div className="flex items-center gap-2">
                <span>{t("clients.pagination.itemsPerPage")}</span>
                <Select
                  value={limit.toString()}
                  onValueChange={(v: string) => {
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
                {page} – {Math.max(1, Math.ceil(totalCount / limit))}
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
          </div>

          {/* Mobile cards */}
          <div className="mt-4 md:hidden">
            <MobileCardList
              emptyMessage={t("clients.empty.title") as string}
              items={clients}
              loading={loading}
              renderCard={(client: Client) => (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Mobile cards must match the desktop table, which already
                      shows commercialName. */}
                      <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                        <span className="truncate">
                          {clientDisplayName(client, client.name)}
                        </span>
                        {etiquetas.activo && (
                          <EtiquetaDeSucursal
                            empresa={!client.branchId}
                            sucursal={etiquetas.sucursal(client.branchId)}
                          />
                        )}
                      </div>
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {client.email || "-"}
                      </div>
                    </div>

                    {/* El menú va ARRIBA, pegado a la esquina; las etiquetas
                      bajan a su propia fila. Apilados los tres en una columna
                      a la derecha —dos etiquetas y un menú de 44 px— esa
                      columna medía 112 px contra los 36 del nombre, y el
                      hueco que quedaba debajo del correo era medio tarjeta
                      de vacío con el menú flotando en mitad de la nada. */}
                    <div className="-mr-1 -mt-1 shrink-0">
                      <RowActionsMenu actions={rowActions(client)} />
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge tone={client.active ? "ok" : "bad"}>
                      {client.active
                        ? t("clients.status.active")
                        : t("clients.status.archived")}
                    </StatusBadge>
                    {(() => {
                      const s = client.onboardingStatus || "not_invited";
                      const mobileMap: Record<
                        string,
                        {
                          label: string;
                          tone: "neutral" | "warn" | "ok" | "bad";
                        }
                      > = {
                        not_invited: {
                          label: t(
                            "clients.onboarding.not_invited",
                            "Sin acceso",
                          ),
                          tone: "neutral",
                        },
                        invited: {
                          label: t("clients.onboarding.invited", "Invitado"),
                          tone: "warn",
                        },
                        active: {
                          label: t("clients.onboarding.active", "En app"),
                          tone: "ok",
                        },
                        suspended: {
                          label: t(
                            "clients.onboarding.suspended",
                            "Suspendido",
                          ),
                          tone: "bad",
                        },
                      };
                      const b = mobileMap[s] || mobileMap.not_invited;

                      return <StatusBadge tone={b.tone}>{b.label}</StatusBadge>;
                    })()}
                  </div>
                  <div
                    className="mt-3 space-y-1 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    <div className="truncate">{client.phoneNumber || "-"}</div>
                    <div className="truncate">{client.address || "-"}</div>
                  </div>
                </>
              )}
            />
          </div>
        </PageContainer>
      </section>

      <ImportDialog
        open={openImport}
        onOpenChange={setOpenImport}
        onSuccess={loadClients}
      />
      <Dialog open={openMoveDialog} onOpenChange={setOpenMoveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("clients.dialogs.changeCategories.title")}
            </DialogTitle>
            <DialogDescription>
              {t("clients.dialogs.changeCategories.desc", {
                count: selectedIds.length,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>{t("clients.dialogs.changeCategories.newCategories")}</Label>
            <CategorySelect
              multiple
              module="clientAccount"
              options={categories.map((c) => ({ id: c.id, name: c.name }))}
              placeholder={
                categories.length === 0
                  ? t("categories.loading")
                  : t("clients.selectCategories")
              }
              value={moveCategories}
              onCategoryCreated={loadCategories}
              onChange={(val) =>
                setMoveCategories(Array.isArray(val) ? val : [])
              }
            />
          </div>

          <DialogFooter>
            <Button
              disabled={moveLoading}
              variant="outline"
              onClick={() => setOpenMoveDialog(false)}
            >
              {t("clients.cancel")}
            </Button>
            <Button disabled={moveLoading} onClick={handleMoveSubmit}>
              {moveLoading ? t("clients.saving") : t("clients.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={openCategorizeDialog}
        onOpenChange={setOpenCategorizeDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("clients.dialogs.categorize.title")}</DialogTitle>
            <DialogDescription>
              {categorizeClientName || t("clients.client")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>{t("clients.filters.categories")}</Label>
            <CategorySelect
              multiple
              module="clientAccount"
              options={categories.map((c) => ({ id: c.id, name: c.name }))}
              placeholder={
                categorizeLoading || categories.length === 0
                  ? t("clients.loading")
                  : t("clients.selectCategories")
              }
              value={categorizeCategories}
              onCategoryCreated={loadCategories}
              onChange={(val) =>
                setCategorizeCategories(Array.isArray(val) ? val : [])
              }
            />
          </div>

          <DialogFooter>
            <Button
              disabled={categorizeSaving}
              variant="outline"
              onClick={() => setOpenCategorizeDialog(false)}
            >
              {t("clients.cancel")}
            </Button>
            <Button
              disabled={categorizeSaving || categorizeLoading}
              variant="brand"
              onClick={handleCategorizeSubmit}
            >
              {categorizeSaving ? t("clients.saving") : t("clients.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CategoryManagerDialog
        module="clientAccount"
        open={openCategoryManager}
        onChanged={loadCategories}
        onOpenChange={setOpenCategoryManager}
      />
      {/* ClientDetailsDialog removed: navigation uses ClientsDetails page instead of modal */}

      <AlertDialog
        open={openArchiveBulkDialog}
        onOpenChange={setOpenArchiveBulkDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("clients.alerts.archiveClients.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.alerts.archiveClients.desc", {
                count: selectedIds.length,
              })}
            </AlertDialogDescription>
            {alcanceArchivado && (
              <div className="glass-sunken mt-3 space-y-1 p-3 text-sm">
                <div className="font-semibold">
                  {t(
                    "clients.alerts.archiveClients.impactTitle",
                    "Esto se archiva con él:",
                  )}
                </div>
                <div>
                  {t("clients.alerts.archiveClients.impactSites", {
                    defaultValue:
                      "{{sedes}} sede(s) y {{estaciones}} puesto(s)",
                    sedes: alcanceArchivado.sedes,
                    estaciones: alcanceArchivado.estaciones,
                  })}
                </div>
                {alcanceArchivado.vigilantes > 0 && (
                  <div style={{ color: "var(--ink-soft)" }}>
                    {t("clients.alerts.archiveClients.impactGuards", {
                      defaultValue:
                        "{{n}} vigilante(s) quedan sin punto de vigilancia: {{nombres}}",
                      n: alcanceArchivado.vigilantes,
                      nombres: alcanceArchivado.nombresDeVigilantes.join(" · "),
                    })}
                  </div>
                )}
                <div style={{ color: "var(--ink-faint)" }}>
                  {t(
                    "clients.alerts.archiveClients.impactUndo",
                    "Se puede restaurar desde Archivados. Los vigilantes no vuelven solos a este puesto.",
                  )}
                </div>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clients.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  const results = await enLotes(selectedIds, (id) =>
                    clientService.archiveClients([id]),
                  );
                  const failed = results.filter(
                    (r) => r.status === "rejected",
                  ).length;
                  const succeeded = results.length - failed;

                  if (failed === 0) {
                    toast.success(t("clients.clientsArchived"));
                  } else if (succeeded === 0) {
                    toast.error(
                      getServerErrorMessage(
                        null,
                        t("clients.errorArchiveClient"),
                      ),
                    );
                  } else {
                    toast.warning(
                      t(
                        "clients.bulkPartialSuccess",
                        "{{succeeded}} actualizados, {{failed}} con error",
                        { succeeded, failed },
                      ),
                    );
                  }
                  setSelectedIds([]);
                  setOpenArchiveBulkDialog(false);
                } finally {
                  loadClients();
                }
              }}
            >
              {t("clients.accept")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={openRestoreBulkDialog}
        onOpenChange={setOpenRestoreBulkDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("clients.alerts.restoreClients.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.alerts.restoreClients.desc", {
                count: selectedIds.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clients.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="cg-btn-brand"
              onClick={async () => {
                try {
                  const results = await enLotes(selectedIds, (id) =>
                    clientService.restoreClients([id]),
                  );
                  const failed = results.filter(
                    (r) => r.status === "rejected",
                  ).length;
                  const succeeded = results.length - failed;

                  if (failed === 0) {
                    toast.success(t("clients.clientsRestored"));
                  } else if (succeeded === 0) {
                    toast.error(
                      getServerErrorMessage(
                        null,
                        t("clients.errorLoadingClients"),
                      ),
                    );
                  } else {
                    toast.warning(
                      t(
                        "clients.bulkPartialSuccess",
                        "{{succeeded}} actualizados, {{failed}} con error",
                        { succeeded, failed },
                      ),
                    );
                  }
                  setSelectedIds([]);
                  setOpenRestoreBulkDialog(false);
                } finally {
                  loadClients();
                }
              }}
            >
              {t("clients.accept")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={openDeleteBulkDialog}
        onOpenChange={setOpenDeleteBulkDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("clients.alerts.deleteClients.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.alerts.deleteClients.desc", {
                count: selectedIds.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clients.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="cg-btn-bad"
              onClick={async () => {
                try {
                  await clientService.deleteClients(selectedIds);
                  toast.success(t("clients.clientsDeleted"));
                  setSelectedIds([]);
                  loadClients();
                  setOpenDeleteBulkDialog(false);
                } catch (error: any) {
                  toast.error(
                    getServerErrorMessage(error, t("clients.deleteError")),
                  );
                }
              }}
            >
              {t("clients.accept")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openDeleteDialog} onOpenChange={setOpenDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("clients.alerts.deleteClient.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.alerts.deleteClient.desc", {
                name: clientDisplayName(deleteClient, deleteClient?.name),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clients.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="cg-btn-bad"
              onClick={async () => {
                if (!deleteClient) return;
                try {
                  await clientService.deleteClients([deleteClient.id]);
                  toast.success(t("clients.clientDeleted"));
                  loadClients();
                } catch (error: any) {
                  toast.error(
                    getServerErrorMessage(error, t("clients.deleteError")),
                  );
                }
              }}
            >
              {t("clients.accept")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={openRestoreDialog} onOpenChange={setOpenRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("clients.alerts.restoreClient.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("clients.alerts.restoreClient.desc", {
                name: clientDisplayName(restoreClient, restoreClient?.name),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("clients.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="cg-btn-brand"
              onClick={async () => {
                if (!restoreClient) return;
                try {
                  await clientService.updateClient(restoreClient.id, {
                    active: true,
                  } as any);
                  toast.success(t("clients.clientRestored"));
                  loadClients();
                } catch (error: any) {
                  // backend handles errors
                }
              }}
            >
              {t("clients.accept")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send app access dialog */}
      <AlertDialog
        open={openSendAccessDialog}
        onOpenChange={(v) => {
          if (!sendingAccess) setOpenSendAccessDialog(v);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <IconTile size="sm">
                <Smartphone />
              </IconTile>
              <AlertDialogTitle className="text-base">
                {sendAccessClient?.onboardingStatus === "invited" ||
                sendAccessClient?.onboardingStatus === "active"
                  ? t("clients.resendAppAccess", "Reenviar invitación")
                  : t("clients.sendAppAccess", "Enviar acceso a la app")}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div
                className="space-y-3 text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                {sendAccessClient?.email ? (
                  <>
                    <p>
                      {t("ui.ClientsPage.seEnviaraCorreoInvitacion", {
                        defaultValue:
                          "Se enviará un correo de invitación a {{email}} para que {{name}} pueda acceder a la app móvil.",
                        email: sendAccessClient?.email,
                        name: sendAccessClient?.name,
                      })}
                    </p>
                    <div
                      className="space-y-1 rounded-xl border p-3 text-xs"
                      style={{
                        background:
                          "color-mix(in oklab, var(--warn) 12%, transparent)",
                        borderColor:
                          "color-mix(in oklab, var(--warn) 28%, transparent)",
                        color: "var(--warn-text)",
                      }}
                    >
                      <p className="font-medium">
                        {t("ui.Clients.comoFunciona", "¿Cómo funciona?")}
                      </p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>{t("ui.ClientsPage.elClienteRecibeUnCorreo")}</li>
                        <li>
                          {t(
                            "ui.Clients.haceClicEnElEnlace",
                            "Hace clic en el enlace y establece su contraseña",
                          )}
                        </li>
                        <li>
                          {t(
                            "ui.Clients.iniciaSesionEnLaApp",
                            "Inicia sesión en la app con su correo y contraseña",
                          )}
                        </li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <div
                    className="rounded-xl border p-3 text-xs"
                    style={{
                      background:
                        "color-mix(in oklab, var(--bad) 12%, transparent)",
                      borderColor:
                        "color-mix(in oklab, var(--bad) 28%, transparent)",
                      color: "var(--bad-text)",
                    }}
                  >
                    <p className="font-medium">
                      {t(
                        "ui.Clients.esteClienteNoTieneCorreo",
                        "Este cliente no tiene correo electrónico configurado.",
                      )}
                    </p>
                    <p className="mt-1">
                      {t(
                        "ui.Clients.editaElClienteAgregaUn",
                        "Edita el cliente, agrega un correo electrónico y vuelve a intentarlo.",
                      )}
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingAccess}>
              {t("clients.cancel", "Cancelar")}
            </AlertDialogCancel>
            {sendAccessClient?.email && (
              <AlertDialogAction
                className="cg-btn-brand"
                disabled={sendingAccess}
                onClick={async (e) => {
                  e.preventDefault();
                  if (!sendAccessClient?.id) return;
                  setSendingAccess(true);
                  try {
                    await clientService.sendClientPortalInvitation(
                      sendAccessClient.id,
                      sendAccessClient.email || undefined,
                    );
                    toast.success(
                      t("ui.ClientsPage.invitacionEnviadaA", {
                        defaultValue: "Invitación enviada a {{to}}",
                        to: sendAccessClient.email || sendAccessClient.name,
                      }),
                    );
                    // Update local state so the badge reflects the new status immediately
                    setClients((prev) =>
                      prev.map((c) =>
                        c.id === sendAccessClient.id
                          ? { ...c, onboardingStatus: "invited" }
                          : c,
                      ),
                    );
                    setOpenSendAccessDialog(false);
                  } catch (err: any) {
                    toast.error(
                      err?.response?.data?.message ||
                        err?.message ||
                        t(
                          "ui.ClientsPage.errorEnviarInvitacion",
                          "No se pudo enviar la invitación",
                        ),
                    );
                  } finally {
                    setSendingAccess(false);
                  }
                }}
              >
                {sendingAccess
                  ? t("ui.RouteForm.enviando", "Enviando...")
                  : t("ui.ClientsPage.enviarInvitacion", "Enviar invitación")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invitar a la app (Mi Seguridad app-download invitation) */}
      <AlertDialog
        open={openAppInviteDialog}
        onOpenChange={(v) => {
          if (!sendingAppInvite) setOpenAppInviteDialog(v);
        }}
      >
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <IconTile size="sm" tone="info">
                <Download />
              </IconTile>
              <AlertDialogTitle className="text-base">
                {t("clients.inviteToApp", "Invitar a la app")}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div
                className="space-y-3 text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                {appInviteClient?.email ? (
                  <>
                    <p>
                      {t("ui.ClientsPage.seEnviaraInvitacionApp", {
                        defaultValue:
                          "Se enviará una invitación para descargar y usar la app {{app}} a {{email}}.",
                        app: appDelCliente,
                        email: appInviteClient?.email,
                      })}
                    </p>
                    <div
                      className="space-y-1 rounded-xl border p-3 text-xs"
                      style={{
                        background:
                          "color-mix(in oklab, var(--info) 12%, transparent)",
                        borderColor:
                          "color-mix(in oklab, var(--info) 28%, transparent)",
                        color: "var(--info-text)",
                      }}
                    >
                      <p className="font-medium">
                        {t("ui.Clients.queIncluye", "¿Qué incluye?")}
                      </p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>
                          {t("ui.Clients.presentacionDeLaAppMi", {
                            defaultValue: "Presentación de la app {{app}}",
                            app: appDelCliente,
                          })}
                        </li>
                        <li>
                          {t(
                            "ui.ClientsPage.enlacesAGooglePlay",
                            "Enlaces a Google Play y App Store",
                          )}
                        </li>
                        <li>
                          {t(
                            "ui.Clients.enlaceParaActivarSuCuenta",
                            "Enlace para activar su cuenta y crear contraseña",
                          )}
                        </li>
                      </ul>
                    </div>
                  </>
                ) : (
                  <div
                    className="rounded-xl border p-3 text-xs"
                    style={{
                      background:
                        "color-mix(in oklab, var(--bad) 12%, transparent)",
                      borderColor:
                        "color-mix(in oklab, var(--bad) 28%, transparent)",
                      color: "var(--bad-text)",
                    }}
                  >
                    <p className="font-medium">
                      {t(
                        "ui.Clients.esteClienteNoTieneCorreo",
                        "Este cliente no tiene correo electrónico configurado.",
                      )}
                    </p>
                    <p className="mt-1">
                      {t(
                        "ui.Clients.editaElClienteAgregaUn",
                        "Edita el cliente, agrega un correo electrónico y vuelve a intentarlo.",
                      )}
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sendingAppInvite}>
              {t("clients.cancel", "Cancelar")}
            </AlertDialogCancel>
            {appInviteClient?.email && (
              <AlertDialogAction
                className="cg-btn-brand"
                disabled={sendingAppInvite}
                onClick={async (e) => {
                  e.preventDefault();
                  if (!appInviteClient?.id) return;
                  setSendingAppInvite(true);
                  try {
                    await clientService.sendClientAppInvitation(
                      appInviteClient.id,
                      appInviteClient.email || undefined,
                    );
                    toast.success(
                      t("ui.ClientsPage.invitacionAppEnviadaA", {
                        defaultValue: "Invitación a la app enviada a {{to}}",
                        to: appInviteClient.email || appInviteClient.name,
                      }),
                    );
                    setOpenAppInviteDialog(false);
                  } catch (err: any) {
                    toast.error(
                      err?.response?.data?.message ||
                        err?.message ||
                        t(
                          "ui.ClientsPage.errorEnviarInvitacion",
                          "No se pudo enviar la invitación",
                        ),
                    );
                  } finally {
                    setSendingAppInvite(false);
                  }
                }}
              >
                {sendingAppInvite
                  ? t("ui.RouteForm.enviando", "Enviando...")
                  : t("ui.ClientsPage.enviarInvitacion", "Enviar invitación")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
