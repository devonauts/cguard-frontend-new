import { useState, useCallback, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  EllipsisVertical,
  Filter,
  FileDown,
  FileSpreadsheet,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  Eye,
  Copy,
  Send,
  KeyRound,
  Archive,
  RotateCw,
  Trash,
  UserPlus,
  ShieldCheck,
  Clock,
  Users,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { loadXlsx } from "../../../lib/lazyXlsx";

import GuardCardsGrid, {
  type GuardCardAction,
  type AsignacionVigilante,
} from "./GuardCardsGrid";
import GuardRatingLevel from "./GuardRatingLevel";
import {
  eliminarVigilantes,
  type FalloAlEliminar,
  type ResultadoEliminar,
  type VigilanteAEliminar,
} from "./eliminarVigilantes";

import EtiquetaDeSucursal from "@/components/sucursales/EtiquetaDeSucursal";
import { useEtiquetasDeSucursal } from "@/hooks/useEtiquetasDeSucursal";
import { clientDisplayName } from "@/lib/clientName";
import { invalidateEntity, cachedFetch } from "@/lib/queryClient";
import guardRatingService from "@/lib/api/guardRatingService";
import {
  PageHeader,
  StatCard,
  StatsStrip,
  Modal,
  StatusBadge,
  Toolbar,
  Segmented,
  EmptyState,
  GlassPanel,
  SkeletonCards,
  Field,
  SearchInput,
  InfoNote,
} from "@/components/kit";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useDebouncedValue } from "@/hooks/useDebounce";
import securityGuardService from "@/lib/api/securityGuardService";
import { clientService } from "@/lib/api/clientService";
import { postSiteService } from "@/lib/api/postSiteService";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import { correoVisible } from "@/lib/correoVisible";
import { useCompartirAcceso } from "@/components/usuarioDeAcceso/CompartirAcceso";
import { useVistaGuardada } from "@/hooks/useVistaGuardada";

// Fallback local Breadcrumb component (avoid missing module error)
interface BreadcrumbItem {
  label: string;
  path?: string;
}
const Breadcrumb: React.FC<{ items: BreadcrumbItem[] }> = ({ items }) => (
  <nav aria-label="breadcrumb" className="py-2">
    <ol
      className="flex flex-wrap gap-2 text-sm"
      style={{ color: "var(--ink-soft)" }}
    >
      {items.map((it, idx) => (
        <li key={idx} className="flex items-center">
          {it.path ? (
            <a className="brand-text hover:underline" href={it.path}>
              {it.label}
            </a>
          ) : (
            <span>{it.label}</span>
          )}
          {idx < items.length - 1 && <span className="mx-2">/</span>}
        </li>
      ))}
    </ol>
  </nav>
);

// Tipos para los security-guards
type GuardStatus = "Activo" | "Pendiente" | "Archivado" | "Invitado";

interface SecurityGuard {
  id: string;
  name: string;
  /** Vacío si no tiene correo de verdad (ver lib/correoVisible). */
  email: string;
  /** Su usuario para entrar (alias), p. ej. `jmiranda`. */
  username?: string;
  phone: string;
  status: GuardStatus;
  station?: string;
  raw?: any; // Para detalles
}

// Shared normalizer used by both the initial load and the post-resend refresh
// so the two code paths cannot drift (status mapping in particular). The station
// label is intentionally NOT computed here — it is derived at render time from the
// stationByUserId lookup so that changes to that map don't require re-normalizing.
function normalizeGuard(item: any): SecurityGuard {
  const guardObj = item.guard ?? {};
  // Prefer the securityGuard record id (item.id). Some API responses include a
  // nested `guard` (user) object whose `guard.id` is the user id; using that as
  // the list `id` makes actions that expect the securityGuard record id
  // (delete/restore) fail with not-found.
  const id = item.id ?? guardObj.id ?? item.guardId ?? "";
  const name =
    guardObj.firstName && guardObj.lastName
      ? `${guardObj.firstName} ${guardObj.lastName}`
      : (item.fullName ??
        `${guardObj.firstName ?? ""} ${guardObj.lastName ?? ""}`.trim());
  // Un correo inventado (cuenta sin buzón, alta por teléfono) no se enseña.
  const email = correoVisible(guardObj.email ?? item.email) ?? "";
  const username = guardObj.username ?? item.username ?? "";
  const phone =
    guardObj.phone ??
    guardObj.phoneNumber ??
    item.guard?.phoneNumber ??
    item.phoneNumber ??
    item.phone ??
    item.mobile ??
    "";
  const status: GuardStatus = ((): GuardStatus => {
    const s = (guardObj.status ?? item.status ?? "").toString().toLowerCase();

    if (s === "archived" || s === "archivado") return "Archivado";
    if (s === "active" || s === "activo") return "Activo";
    if (s === "invited" || s === "invitado") return "Pendiente";
    if (s === "pending" || s === "pendiente") return "Pendiente";
    if (typeof item.isOnDuty === "boolean")
      return item.isOnDuty ? "Activo" : "Pendiente";

    return "Activo";
  })();

  return {
    id,
    name: name || "-",
    email,
    username,
    phone,
    status,
    raw: item,
  };
}

export default function SecurityGuardsPage() {
  const { t } = useTranslation();
  // Módulo Sucursales (vista global): la sucursal de casa de cada persona; si no
  // tiene, la de la sede donde está asignada.
  const etiquetas = useEtiquetasDeSucursal({ personas: true });

  usePageTitle(t("guards.list.headerTitle", "Vigilantes de Seguridad"));
  const { hasPermission } = usePermissions();
  const [openFilter, setOpenFilter] = useState(false);
  // Vista Tarjetas ⇄ Lista (persistida). Tarjetas por defecto, como en Clientes.
  const [viewMode, setViewMode] = useVistaGuardada<"cards" | "list">(
    "guards.viewMode",
    "cards",
  );
  const [searchQuery, setSearchQuery] = useState("");
  /* La búsqueda tiene DOS velocidades a propósito: `searchQuery` filtra en el
     acto lo que ya está en pantalla, y `busquedaAplazada` es la que viaja al
     servidor cuando quien escribe se detiene. */
  const busquedaAplazada = useDebouncedValue(searchQuery, 400);
  const [selectedGuards, setSelectedGuards] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  // Mostrar vigilantes activos por defecto; el usuario puede cambiar el filtro.
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  // Filtros adicionales (controlados) para permitir "Limpiar filtros"
  const [filterClient, setFilterClient] = useState<string>("todos");
  const [filterSite, setFilterSite] = useState<string>("todos");
  // Options loaded from backend for filters
  const [availableClients, setAvailableClients] = useState<any[]>([]);
  const [availablePostSites, setAvailablePostSites] = useState<any[]>([]);
  const [loadingFilters, setLoadingFilters] = useState(false);
  // Dónde está asignado cada vigilante: userId → estación (de `guardAssignment`).
  const [stationByUserId, setStationByUserId] = useState<
    Record<string, AsignacionVigilante>
  >({});

  // Estado principal SIN datos de prueba
  const [guards, setGuards] = useState<SecurityGuard[]>([]);
  // «Usuario: jmiranda · comparte este enlace» (cuentas sin correo).
  const compartir = useCompartirAcceso();
  // Per-guard client-review level (keyed by securityGuard id = the /guards/:id
  // route param). Loaded once the roster is known; badges click → Perfil › Reseñas.
  const [ratings, setRatings] = useState<
    Record<string, { average: number; count: number }>
  >({});

  useEffect(() => {
    const ids = guards.map((g: any) => g.raw?.id || g.id).filter(Boolean);

    if (!ids.length) return;
    let alive = true;

    guardRatingService
      .summary(ids)
      .then((m) => {
        if (alive) setRatings(m);
      })
      .catch(() => {});

    return () => {
      alive = false;
    };
  }, [guards]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsGuard, setDetailsGuard] = useState<SecurityGuard | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [guardToArchive, setGuardToArchive] = useState<SecurityGuard | null>(
    null,
  );
  const [archiveLoading, setArchiveLoading] = useState(false);
  // La baja se REGISTRA, no solo se aplica: fecha, motivo y equipo por devolver
  // alimentan el expediente laboral (guardTermination) del servidor.
  const [bajaFecha, setBajaFecha] = useState<string>(hoyEnLaEmpresa());
  const [bajaMotivo, setBajaMotivo] = useState<string>("resignation");
  const [bajaNota, setBajaNota] = useState<string>("");
  const [bajaRecontratable, setBajaRecontratable] = useState<boolean>(true);
  const [bajaEquipo, setBajaEquipo] = useState<
    Array<{ item: string; returned: boolean }>
  >([]);
  const EQUIPO_BASE = [
    "Uniforme",
    "Credencial",
    "Radio",
    "Chaleco antibalas",
    "Arma y municiones",
    "Llaves y accesos",
  ];
  // El nombre del equipo viaja tal cual al expediente (`equipmentReturn`); sólo
  // se traduce al pintarlo.
  const EQUIPO_LABEL: Record<string, string> = {
    Uniforme: t("ui.SecurityGuardsPage.equipo.uniforme", "Uniforme"),
    Credencial: t("ui.SecurityGuardsPage.equipo.credencial", "Credencial"),
    Radio: t("ui.SecurityGuardsPage.equipo.radio", "Radio"),
    "Chaleco antibalas": t(
      "ui.SecurityGuardsPage.equipo.chaleco",
      "Chaleco antibalas",
    ),
    "Arma y municiones": t(
      "ui.SecurityGuardsPage.equipo.arma",
      "Arma y municiones",
    ),
    "Llaves y accesos": t(
      "ui.SecurityGuardsPage.equipo.llaves",
      "Llaves y accesos",
    ),
  };
  const MOTIVOS_BAJA: Array<[string, string]> = [
    [
      "resignation",
      t("ui.SecurityGuardsPage.motivo.resignation", "Renuncia voluntaria"),
    ],
    [
      "dismissal_with_cause",
      t("ui.SecurityGuardsPage.motivo.dismissalWithCause", "Despido con causa"),
    ],
    [
      "dismissal_without_cause",
      t(
        "ui.SecurityGuardsPage.motivo.dismissalWithoutCause",
        "Despido sin causa",
      ),
    ],
    [
      "end_of_contract",
      t("ui.SecurityGuardsPage.motivo.endOfContract", "Fin de contrato"),
    ],
    [
      "abandonment",
      t("ui.SecurityGuardsPage.motivo.abandonment", "Abandono del puesto"),
    ],
    ["retirement", t("ui.SecurityGuardsPage.motivo.retirement", "Jubilación")],
    ["death", t("ui.SecurityGuardsPage.motivo.death", "Fallecimiento")],
    ["other", t("ui.SecurityGuardsPage.motivo.other", "Otro")],
  ];
  const abrirDialogoDeBaja = () => {
    setBajaFecha(hoyEnLaEmpresa());
    setBajaMotivo("resignation");
    setBajaNota("");
    setBajaRecontratable(true);
    setBajaEquipo(EQUIPO_BASE.map((item) => ({ item, returned: false })));
  };
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [guardToDelete, setGuardToDelete] = useState<SecurityGuard | null>(
    null,
  );
  const [deleteLoading, setDeleteLoading] = useState(false);
  /* Why the last delete attempt was refused, shown INSIDE the dialog with the
     way out. `porAgenda` = future shifts / pending rounds, which the person can
     resolve here («cancel their shifts and delete»); otherwise (punched in
     right now) the only way is to archive. Reset every time the dialog opens. */
  const [deleteBlocked, setDeleteBlocked] = useState<{
    message: string;
    porAgenda: boolean;
  } | null>(null);

  useEffect(() => {
    if (deleteDialogOpen) setDeleteBlocked(null);
  }, [deleteDialogOpen, guardToDelete]);
  /* Same for the bulk delete: who could not be deleted and why. */
  const [bulkDeleteBlocked, setBulkDeleteBlocked] = useState<{
    blockedBySchedule: FalloAlEliminar[];
    failed: FalloAlEliminar[];
  } | null>(null);

  /** Rows the API confirmed as gone leave the list (and only those). */
  const quitarEliminados = (r: ResultadoEliminar) => {
    if (!r.removed.length) return;
    const fuera = new Set(r.removed);

    setGuards((prev) => prev.filter((g) => !fuera.has(g.id)));
    setSelectedGuards((prev) => prev.filter((id) => !fuera.has(id)));
    toast.success(
      r.shiftsCancelled > 0
        ? t("guards.list.toasts.deletedWithShifts", {
            count: r.shiftsCancelled,
            defaultValue:
              "Eliminado. Se cancelaron {{count}} turnos: quedan como huecos en el Horario.",
          })
        : r.removed.length > 1
          ? t(
              "guards.list.toasts.bulkDeleted",
              "Vigilantes eliminados permanentemente",
            )
          : t(
              "guards.list.toasts.deleteSuccess",
              "Vigilante eliminado permanentemente",
            ),
    );
  };

  const aEliminar = (rowIds: string[]): VigilanteAEliminar[] =>
    rowIds.map((rowId) => {
      const g = guards.find((x) => x.id === rowId);

      return {
        id: rowId,
        realId: g?.raw?.id || rowId,
        name: g?.name || rowId,
      };
    });
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [guardToRestore, setGuardToRestore] = useState<SecurityGuard | null>(
    null,
  );
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState(false);

  useEffect(() => {
    if (bulkActionDialogOpen) setBulkDeleteBlocked(null);
  }, [bulkActionDialogOpen]);
  const [bulkActionType, setBulkActionType] = useState<string | null>(null);
  const [bulkActionTargetIds, setBulkActionTargetIds] = useState<string[]>([]);
  const [bulkActionValue, setBulkActionValue] = useState<string>("");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);

  // Assign-to-station dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignGuard, setAssignGuard] = useState<SecurityGuard | null>(null);
  const [assignStationId, setAssignStationId] = useState<string>("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignStations, setAssignStations] = useState<
    { id: string; name: string; postSiteId: string }[]
  >([]);

  // Estado legible para las exportaciones: `g.status` es el valor interno.
  function statusText(s: GuardStatus): string {
    switch (s) {
      case "Activo":
        return t("common.active", "Activo");
      case "Archivado":
        return t("adminOfficeUsers.statuses.archived", "Archivado");
      default:
        return t("comun.pendiente", "Pendiente");
    }
  }

  // Export helpers
  function exportCSV(list: SecurityGuard[]) {
    const rows = list.map((g) => ({
      name: g.name,
      email: g.email,
      phone: g.phone,
      status: statusText(g.status),
    }));
    const header = ["name", "email", "phone", "status"];
    const csv = [header.join(",")]
      .concat(
        rows.map(
          (r) =>
            `${escapeCsv(r.name)},${escapeCsv(r.email)},${escapeCsv(r.phone)},${escapeCsv(r.status)}`,
        ),
      )
      .join("\r\n");
    // Prepend UTF-8 BOM so Excel renders accented guard names (ñ/á/é) correctly.
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `vigilantes_${hoyEnLaEmpresa()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function escapeCsv(v: any) {
    if (v == null) return "";
    const s = String(v);

    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }

    return s;
  }

  function exportPDF(list: SecurityGuard[]) {
    const htmlRows = list
      .map(
        (g) =>
          `<tr><td>${escapeHtml(g.name)}</td><td>${escapeHtml(g.email)}</td><td>${escapeHtml(g.phone)}</td><td>${escapeHtml(statusText(g.status))}</td></tr>`,
      )
      .join("\n");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t("guards.list.title", "Vigilantes"))}</title><style>table{width:100%;border-collapse:collapse}td,th{border:1px solid;padding:8px}</style></head><body><h2>${escapeHtml(t("guards.list.title", "Vigilantes"))}</h2><table><thead><tr><th>${escapeHtml(t("comun.nombre", "Nombre"))}</th><th>${escapeHtml(t("comun.correo", "Correo"))}</th><th>${escapeHtml(t("ui.SecurityGuardsPage.telefono", "Teléfono"))}</th><th>${escapeHtml(t("comun.estado", "Estado"))}</th></tr></thead><tbody>${htmlRows}</tbody></table></body></html>`;
    const w = window.open("", "_blank");

    if (!w) {
      toast.error(
        t(
          "guards.list.toasts.printWindowOpenError",
          "No se pudo abrir la ventana de impresión",
        ),
      );

      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Give browser a moment to render then trigger print
    setTimeout(() => {
      try {
        w.print();
      } catch (e) {
        console.error(e);
      }
    }, 500);
  }

  // Try backend export first; fallback to client export helpers above
  async function exportFromBackend(format: "excel" | "csv" | "pdf") {
    try {
      const blob = await securityGuardService.export(format);
      const ext = format === "csv" ? "csv" : format === "pdf" ? "pdf" : "xlsx";
      const filename = `vigilantes_${hoyEnLaEmpresa()}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      return true;
    } catch (err) {
      console.warn(
        "Backend export failed, falling back to client export:",
        err,
      );

      return false;
    }
  }

  function downloadFallback(
    format: "csv" | "pdf" | "excel",
    list: SecurityGuard[],
  ) {
    if (format === "csv" || format === "excel") exportCSV(list);
    else exportPDF(list);
  }

  function escapeHtml(s: any) {
    if (s == null) return "";

    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* Las estaciones del diálogo «Asignar a estación», SÓLO cuando se abre.
     Se pedían en cada carga de la pantalla —doscientas filas— para rellenar un
     desplegable que la mayoría de las visitas no llega a abrir nunca. Medido:
     era una de las cuatro peticiones que costaba volver a esta pantalla. */
  useEffect(() => {
    if (!assignDialogOpen) return;
    if (assignStations.length) return; // ya están, no volver a pedirlas
    const tenantId = localStorage.getItem("tenantId") || "";

    if (!tenantId) return;
    import("@/lib/api").then(({ default: api }) => {
      api
        .get(`/tenant/${tenantId}/stations?limit=200&offset=0`)
        .then((resp: any) => {
          const rows: any[] = resp?.data?.rows ?? resp?.rows ?? [];

          setAssignStations(
            rows.map((s: any) => ({
              id: s.id,
              name:
                s.stationName ||
                s.name ||
                t("ui.SecurityGuards.estacion", "Estación"),
              postSiteId: s.postSiteId || s.businessInfoId || "",
            })),
          );
        })
        .catch(() => {});
    });
    /* `assignStations.length` NO va en las dependencias a propósito: lo lee la
       guarda de arriba para no repetir la petición, y ponerlo aquí volvería a
       disparar el efecto justo al llegar la respuesta. */
  }, [assignDialogOpen]);

  const handleAssignStation = async () => {
    if (!assignGuard || !assignStationId) return;
    setAssignLoading(true);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      // raw.guard is the nested user object; raw.id is the securityGuard record id.
      const guardUserId =
        assignGuard.raw?.guard?.id ||
        assignGuard.raw?.guardId ||
        assignGuard.raw?.userId ||
        assignGuard.id;
      const securityGuardId = assignGuard.raw?.id || assignGuard.id;
      const { default: api } = await import("@/lib/api");

      // Goes through the assignment service, which binds an OPEN puesto at the
      // station → the guard shows up in the Horario scheduler (vs the old raw
      // /shift call that created an orphaned shift with no assignment).
      await api.post(
        `/tenant/${tenantId}/stations/${assignStationId}/assign-guard`,
        {
          data: {
            guardId: guardUserId,
            securityGuardId,
            stationId: assignStationId,
          },
        },
      );
      invalidateEntity("stations");
      toast.success(
        t("guards.list.toasts.assigned", "Vigilante asignado exitosamente"),
      );
      setAssignDialogOpen(false);
      setAssignGuard(null);
      setAssignStationId("");
      // Show the result in the scheduler with the station pre-selected.
      navigate(`/schedule?stationId=${assignStationId}`);
    } catch (err: any) {
      console.error(err);
      toast.error(
        err?.data?.message ||
          err?.message ||
          t("guards.list.toasts.assignError", "Error al asignar vigilante"),
      );
    } finally {
      setAssignLoading(false);
    }
  };

  /**
   * Dónde está asignado cada vigilante.
   *
   * Esto salía de `/shift?limit=1000`: se cogía la estación del primer turno
   * de cada uno. Un turno NO es una asignación —es lo que la asignación
   * genera—, así que un vigilante recién asignado, o uno cuya rotación aún no
   * había generado turnos, salía «Sin asignación» teniendo puesto. Y el tope
   * de mil turnos remataba la faena: en una operación real hay miles, así que
   * ese millar era un recorte arbitrario y la mayoría de la plantilla se
   * quedaba fuera pasara lo que pasara.
   *
   * Ahora se lee la asignación de verdad (`guardAssignment`), en una sola
   * llamada para toda la plantilla.
   */
  useEffect(() => {
    const tenantId = localStorage.getItem("tenantId") || "";

    if (!tenantId) return;
    import("@/lib/api").then(({ default: api }) => {
      /* Bajo la clave ["stations", …]: el mapa ES el reparto vigilante↔puesto,
         así que CUALQUIER escritura de asignación, turno u horario ya lo tira
         por la regla de `URL_ENTITY_MAP`. Con eso, volver a la pantalla deja de
         pedirlo y un cambio de asignación se ve igual de rápido que antes. */
      cachedFetch(
        ["stations", tenantId, "assignment-map"],
        () =>
          api.get(`/tenant/${tenantId}/security-guard/assignment-map`, {
            toast: { silentError: true },
          }) as Promise<any>,
        20_000,
      )
        .then((resp: any) => {
          const mapa = resp?.data?.byGuardId ?? resp?.byGuardId ?? {};

          setStationByUserId(mapa);
        })
        .catch(() => {
          /* la tarjeta enseña «Sin asignación», no rompe la lista */
        });
    });
  }, []);

  // Ejemplo de dónde cargar datos reales: carga lista desde backend cuando cambian filtros relevantes
  useEffect(() => {
    let mounted = true;

    setLoading(true);
    setError(null);
    // Always load all guards — status tabs filter client-side for instant switching
    // without refetch. Explicit high limit so a backend default page size can't
    // silently truncate the list (and the client-side export that reads it).
    const params: Record<string, any> = {
      "filter[status]": "ALL,archived",
      limit: 100000,
    };

    // Additional filters — only client + site are backend-supported (resolved
    // via guardAssignment). Category/skills/department have no guard-level data.
    if (filterClient && filterClient !== "todos")
      params["filter[clientId]"] = filterClient;
    if (filterSite && filterSite !== "todos")
      params["filter[postSiteId]"] = filterSite;
    if (busquedaAplazada) params["q"] = busquedaAplazada;

    securityGuardService
      .list(params)
      .then((data: any) => {
        if (!mounted) return;
        // Algunos endpoints devuelven { rows, count } u otras formas
        let normalizedList: SecurityGuard[] = [];

        if (Array.isArray(data)) normalizedList = data.map(normalizeGuard);
        else if (data && Array.isArray((data as any).rows))
          normalizedList = (data as any).rows.map(normalizeGuard);
        else normalizedList = [];

        setGuards(normalizedList);
      })
      .catch((err: any) => {
        if (!mounted) return;
        console.error("Error cargando vigilantes:", err);
        setError(String(err?.message || err));
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
    /* `busquedaAplazada`, no `searchQuery`: este efecto pide el censo COMPLETO
       (`limit: 100000`), asi que atado a la tecla escribir «Rodríguez» eran
       nueve censos seguidos y sólo valía el último. El filtro de más abajo
       sigue usando `searchQuery` en vivo, de modo que la lista ya visible se
       estrecha mientras se teclea y la petición sale una vez al parar. */
  }, [filterClient, filterSite, busquedaAplazada]);

  // Load filter options when sheet opens
  useEffect(() => {
    if (openFilter) {
      setLoadingFilters(true);
      Promise.all([
        clientService.getClients(),
        postSiteService.list({}, { limit: 100, offset: 0 }),
      ])
        .then(([clientsRes, postSitesRes]) => {
          setAvailableClients(clientsRes.rows ?? []);
          // postSiteService.list returns { rows, count }
          setAvailablePostSites(postSitesRes.rows ?? []);
        })
        .catch((err) => {
          console.error("Error loading filter options", err);
        })
        .finally(() => setLoadingFilters(false));
    }
  }, [openFilter]);

  // Reiniciar página cuando cambie criterio de búsqueda o tamaño de página
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  // Derive the station label at render time from the lookup map so that changes
  // to stationByUserId never re-trigger the heavy guard list fetch.
  const guardsWithStation = useMemo(
    () =>
      guards.map((g) => {
        const guardUserId = g.raw?.guard?.id ?? g.raw?.guardId ?? null;
        const a = guardUserId ? stationByUserId[guardUserId] : null;
        // Para la tabla y la búsqueda basta una etiqueta: el nominativo manda,
        // y el nombre del puesto va detrás para que buscar por cualquiera de
        // los dos encuentre al vigilante.
        /* `esCobertura` = no es su plaza, es dónde está cubriendo HOY. El relevo
           no tiene asignación NUNCA —cubre los puestos según hagan falta—, así
           que sin esto su tarjeta salía en blanco. Se dice cuál es para que
           nadie lo confunda con un fijo de ese puesto. */
        const station = a
          ? [a.nickname, a.stationName].filter(Boolean).join(" · ") +
            (a.esCobertura ? ` · ${t("comun.cobertura", "cobertura")}` : "")
          : "";

        return station ? { ...g, station } : g;
      }),
    [guards, stationByUserId],
  );

  // Filtrado por búsqueda
  const filteredGuards = useMemo(() => {
    let list = guardsWithStation;

    // Apply status filter
    if (filterStatus && filterStatus !== "todos") {
      list = list.filter((g) => {
        if (filterStatus === "activos") return g.status === "Activo";
        if (filterStatus === "pendientes") return g.status === "Pendiente";
        if (filterStatus === "archivados") return g.status === "Archivado";

        return true;
      });
    }

    if (!searchQuery) return list;
    const lowerQuery = searchQuery.toLowerCase();

    return list.filter(
      (g) =>
        g.name.toLowerCase().includes(lowerQuery) ||
        g.email.toLowerCase().includes(lowerQuery) ||
        (g.username || "").toLowerCase().includes(lowerQuery) ||
        g.phone.includes(searchQuery),
    );
  }, [guardsWithStation, searchQuery, filterStatus]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredGuards.length / itemsPerPage),
  );

  // Paginado
  const paginatedGuards = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;

    return filteredGuards.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredGuards, currentPage, itemsPerPage]);

  // Selección individual
  const handleSelectGuard = useCallback((guardId: string, checked: boolean) => {
    setSelectedGuards((prev) =>
      checked ? [...prev, guardId] : prev.filter((id) => id !== guardId),
    );
  }, []);

  // Seleccionar/deseleccionar todos EN LA PÁGINA ACTUAL
  const allOnPageSelected =
    paginatedGuards.length > 0 &&
    paginatedGuards.every((g) => selectedGuards.includes(g.id));

  const handleSelectAllGuards = useCallback(
    (checked: boolean) => {
      setSelectedGuards((prev) => {
        const idsOnPage = paginatedGuards.map((g) => g.id);

        if (checked) {
          const merged = new Set([...prev, ...idsOnPage]);

          return Array.from(merged);
        } else {
          return prev.filter((id) => !idsOnPage.includes(id));
        }
      });
    },
    [paginatedGuards],
  );

  // Insignias de estado — el tono sale de los semánticos del sistema.
  const renderStatus = useCallback((status: GuardStatus) => {
    switch (status) {
      case "Activo":
        return <StatusBadge tone="ok">{t("common.active")}</StatusBadge>;
      case "Pendiente":
        return <StatusBadge tone="warn">{t("comun.pendiente")}</StatusBadge>;
      case "Invitado":
        // Compatibilidad: el antiguo «Invitado» se muestra como «Pendiente».
        return <StatusBadge tone="warn">{t("comun.pendiente")}</StatusBadge>;
      case "Archivado":
        return (
          <StatusBadge tone="neutral">
            {t("adminOfficeUsers.statuses.archived", "Archivado")}
          </StatusBadge>
        );
      default:
        return null;
    }
  }, []);

  const activeCount = useMemo(
    () => guards.filter((g) => g.status === "Activo").length,
    [guards],
  );
  const pendingCount = useMemo(
    () => guards.filter((g) => g.status === "Pendiente").length,
    [guards],
  );
  const archivedCount = useMemo(
    () => guards.filter((g) => g.status === "Archivado").length,
    [guards],
  );

  /**
   * ── ¿ESTA PERSONA TODAVÍA NO HA ENTRADO NUNCA? ────────────────────────────
   * La regla vivía escrita DOS VECES dentro de la tabla, con dos criterios
   * distintos (uno miraba `status === 'Pendiente'`, el otro `!hasPassword ||
   * invited || pending`), y en la vista de TARJETAS —que es la que sale por
   * defecto— no existía en absoluto. Resultado: la opción de reenviar la
   * invitación estaba, pero sólo si te acordabas de cambiar a vista de lista.
   *
   * Aquí, una sola vez: hace falta invitación mientras no tenga contraseña
   * puesta. Eso es lo que de verdad impide entrar — el estado del alta puede
   * decir «Activo» y la persona seguir sin haber creado nunca su acceso.
   */
  const necesitaInvitacion = useCallback((guard: any): boolean => {
    const g = guard?.raw?.guard || guard?.raw || {};

    if (g.hasPassword === true) return false;
    const estado = String(g.status || guard?.raw?.status || "").toLowerCase();

    if (estado === "archived" || guard?.status === "Archivado") return false;

    return true;
  }, []);

  /** ¿Y el enlace que ya se le mandó, sigue vivo? (30 días de vigencia.) */
  const invitacionCaducada = useCallback((guard: any): boolean => {
    const exp =
      guard?.raw?.guard?.invitationTokenExpiresAt ||
      guard?.raw?.invitationTokenExpiresAt;

    if (!exp) return false;
    const t = new Date(exp).getTime();

    return Number.isFinite(t) && t < Date.now();
  }, []);

  /** Reenviar la invitación de acceso a la app. Compartido por las dos vistas. */
  const reenviarInvitacion = useCallback(
    async (guard: any) => {
      try {
        // El servidor acepta el id del usuario, o el correo si aún no hay usuario.
        const payload: any = {};

        if (guard.raw?.guard?.id) payload.guard = guard.raw.guard.id;
        else if (guard.email) payload.contact = guard.email;
        else if (guard.raw?.contact) payload.contact = guard.raw.contact;
        if (guard.id) payload.securityGuardId = guard.raw?.id || guard.id;
        const nombre = guard.raw?.guard?.firstName || guard.raw?.firstName;
        const apellido = guard.raw?.guard?.lastName || guard.raw?.lastName;

        if (nombre) payload.firstName = nombre;
        if (apellido) payload.lastName = apellido;
        // Sin correo de verdad no hay a dónde mandarla: `compartir` pide al
        // servidor el enlace para dárselo en mano (copiar / WhatsApp).
        const sinBuzon = !correoVisible(guard.email);

        if (sinBuzon) payload.compartir = true;

        if (!payload.guard && !payload.contact) {
          toast.error(
            t(
              "guards.list.toasts.inviteNoContact",
              "Este vigilante no tiene correo: añádele uno para poder invitarlo.",
            ),
          );

          return;
        }

        const r: any = await securityGuardService.resendInvite(payload);
        const enlace = r?.invitationLink || r?.link || null;

        if (sinBuzon && enlace) {
          compartir.abrir(
            [
              {
                nombre: guard.name,
                username: r?.username || guard.username || null,
                link: enlace,
              },
            ],
            "invitacion",
          );
        } else {
          toast.success(
            t("guards.list.toasts.inviteResent", "Invitación reenviada"),
          );
        }
        // La fecha de caducidad del enlace cambia con el reenvío: se recarga para
        // que la ficha no siga diciendo «caducada» con el enlace ya renovado.
        try {
          const refreshed: any = await securityGuardService.list();

          if (Array.isArray(refreshed))
            setGuards(refreshed.map(normalizeGuard));
          else if (refreshed && Array.isArray(refreshed.rows))
            setGuards(refreshed.rows.map(normalizeGuard));
        } catch {
          /* el reenvío ya salió; el refresco es cosmético */
        }
      } catch (err) {
        console.error(err);
        toast.error(
          t(
            "guards.list.toasts.inviteResendError",
            "Error reenviando invitación",
          ),
        );
      }
    },
    [t, compartir.abrir],
  );

  /**
   * «Restablecer contraseña». Una sola vez para las tres entradas (tarjeta,
   * fila y menú). Sin buzón el servidor devuelve el `link` —es la única forma
   * de hacérselo llegar— y se ofrece para copiar o compartir por WhatsApp.
   */
  const restablecerContrasena = useCallback(
    async (guard: any) => {
      try {
        const realId = guard.raw?.id || guard.id;
        const r: any = await securityGuardService.sendPasswordReset(realId);

        if (r?.link) {
          compartir.abrir(
            [
              {
                nombre: guard.name,
                username: r?.username || guard.username || null,
                link: r.link,
              },
            ],
            "restablecer",
          );
          if (r?.pushed)
            toast.success(
              t("ui.SecurityGuardsPage.enlaceEnviadoYCopiado", {
                defaultValue: "Enlace de restablecimiento enviado por {{via}}",
                via: "push",
              }),
            );

          return;
        }
        const via = [
          r?.emailed && t("ui.SecurityGuardsPage.viaCorreo", "correo"),
          r?.pushed && "push",
        ]
          .filter(Boolean)
          .join(" + ");

        toast.success(
          via
            ? t("ui.SecurityGuardsPage.enlaceEnviadoYCopiado", {
                defaultValue: "Enlace de restablecimiento enviado por {{via}}",
                via,
              })
            : t(
                "ui.SecurityGuardsPage.enlaceCopiado",
                "No se pudo enviar el enlace: esta persona no tiene correo ni la app instalada",
              ),
        );
      } catch (err: any) {
        toast.error(
          err?.message ||
            t(
              "guards.list.toasts.resetError",
              "No se pudo restablecer la contraseña",
            ),
        );
      }
    },
    [t, compartir.abrir],
  );

  // Acciones del menú de cada tarjeta (mismos handlers que la tabla).
  const guardCardActions = useCallback(
    (guard: any): GuardCardAction[] => {
      const realId = guard.raw?.id || guard.id;
      const acts: GuardCardAction[] = [];

      if (hasPermission("securityGuardRead")) {
        acts.push({
          label: t("guards.list.actions.viewDetails", "Ver Detalles"),
          icon: <Eye className="h-4 w-4" />,
          onClick: () => navigate(`/guards/${realId}/resumen`),
        });
      }
      if (hasPermission("securityGuardEdit") && guard.status !== "Archivado") {
        acts.push({
          label: t("guards.list.actions.assignStation", "Asignar a estación"),
          icon: <ShieldCheck className="h-4 w-4" />,
          onClick: () => {
            setAssignGuard(guard);
            setAssignStationId("");
            setAssignDialogOpen(true);
          },
        });
        // Sólo a quien todavía no ha creado su acceso. Ofrecérselo a quien ya
        // entra a diario sería invitar ruido: el enlace de invitación no le
        // sirve de nada, y para el que olvidó su clave está «Restablecer».
        if (necesitaInvitacion(guard)) {
          acts.push({
            label: invitacionCaducada(guard)
              ? t(
                  "guards.list.actions.resendInviteExpired",
                  "Reenviar invitación (caducada)",
                )
              : t("guards.list.actions.resendInvite", "Reenviar invitación"),
            icon: <Send className="h-4 w-4" />,
            onClick: () => reenviarInvitacion(guard),
          });
        }
        acts.push({
          label: t(
            "guards.list.actions.resetPassword",
            "Restablecer contraseña",
          ),
          icon: <KeyRound className="h-4 w-4" />,
          onClick: () => restablecerContrasena(guard),
        });
      }
      if (hasPermission("securityGuardEdit")) {
        if (guard.status === "Archivado") {
          acts.push({
            label: t("guards.list.actions.restore", "Restaurar"),
            icon: <RotateCw className="h-4 w-4" />,
            onClick: () => {
              setGuardToRestore(guard);
              setRestoreDialogOpen(true);
            },
          });
        } else {
          acts.push({
            label: t("guards.list.actions.archive", "Archivar"),
            icon: <Archive className="h-4 w-4" />,
            onClick: () => {
              setGuardToArchive(guard);
              (abrirDialogoDeBaja(), setArchiveDialogOpen(true));
            },
          });
        }
      }
      if (hasPermission("securityGuardDestroy")) {
        acts.push({
          label: t("guards.list.actions.remove", "Remover"),
          icon: <Trash className="h-4 w-4" />,
          destructive: true,
          onClick: () => {
            setGuardToDelete(guard);
            setDeleteDialogOpen(true);
          },
        });
      }

      return acts;
    },
    [hasPermission, navigate, t, restablecerContrasena],
  );

  return (
    <AppLayout>
      {/* Page Header */}
      <div className="px-4 pt-5 sm:px-6">
        <PageHeader
          actions={
            hasPermission("securityGuardCreate") ? (
              <>
                <Button asChild variant="outline">
                  <Link to="/personal/varias">
                    {t("agregarVarias.boton", "Agregar varias")}
                  </Link>
                </Button>
                <Button asChild variant="brand">
                  <Link to="/personal/nueva?tipo=vigilante">
                    <UserPlus className="mr-2 h-4 w-4" />
                    {t("guards.list.newGuard", "Nuevo Vigilante")}
                  </Link>
                </Button>
              </>
            ) : undefined
          }
          className="mt-2"
          icon={<ShieldCheck />}
          subtitle={t(
            "guards.list.subtitle",
            "Gestiona el personal de seguridad de tu organización",
          )}
          title={t("sidebar.personal.guardias", "Vigilantes")}
        />
      </div>

      {error && (
        <div
          className="mx-6 mt-4 rounded-2xl border p-4 text-sm"
          style={{
            background: "color-mix(in oklab, var(--bad) 12%, transparent)",
            borderColor: "color-mix(in oklab, var(--bad) 28%, transparent)",
            color: "var(--bad-text)",
          }}
        >
          {t(
            "guards.list.error.loading",
            "Error cargando vigilantes: {{msg}}",
            { msg: error },
          )}
        </div>
      )}

      {/* Indicadores */}
      <div className="px-4 pb-2 pt-5 sm:px-6">
        <StatsStrip className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            accent="info"
            icon={<Users />}
            label={t("comun.total")}
            value={guards.length}
          />
          <StatCard
            accent="ok"
            icon={<ShieldCheck />}
            label={t("guards.list.filter.statusActive", "Activos")}
            value={activeCount}
          />
          <StatCard
            accent="warn"
            icon={<Clock />}
            label={t("guards.list.filter.statusPending", "Pendientes")}
            value={pendingCount}
          />
          <StatCard
            accent="neutral"
            icon={<Archive />}
            label={t("guards.list.filter.statusArchived", "Archivados")}
            value={archivedCount}
          />
        </StatsStrip>
      </div>

      <div className="px-4 pb-6 pt-2 sm:px-6">
        <section>
          {/* Pestañas de estado */}
          <div className="mb-4">
            <Segmented
              options={[
                {
                  key: "todos",
                  label: t("guards.list.filter.clientAll", "Todos"),
                  count: guards.length,
                },
                {
                  key: "activos",
                  label: t("guards.list.filter.statusActive", "Activos"),
                  count: activeCount,
                },
                {
                  key: "pendientes",
                  label: t("guards.list.filter.statusPending", "Pendientes"),
                  count: pendingCount,
                },
                {
                  key: "archivados",
                  label: t("guards.list.filter.statusArchived", "Archivados"),
                  count: archivedCount,
                },
              ].map((tab) => ({
                value: tab.key,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {tab.label}
                    {/* El recuento hereda la tinta del segmento: legible activo e inactivo. */}
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[11px] tabular-nums"
                      style={{
                        background:
                          "color-mix(in oklab, currentColor 16%, transparent)",
                        color: "inherit",
                      }}
                    >
                      {tab.count}
                    </span>
                  </span>
                ),
              }))}
              value={filterStatus}
              onChange={(v) => {
                setFilterStatus(v);
                setCurrentPage(1);
              }}
            />
          </div>

          {/* Barra de acciones y filtros */}
          <Toolbar className="mt-2 justify-between gap-3">
            <div className="order-2 flex w-full items-center gap-2 md:order-1 md:w-auto">
              <Select
                disabled={bulkActionLoading}
                value={bulkActionValue}
                onValueChange={(v) => {
                  // set and immediately clear to avoid leaving the option selected
                  setBulkActionValue(v);
                  if (selectedGuards.length === 0) {
                    toast.error(
                      t(
                        "guards.list.toasts.selectAtLeastOne",
                        "Selecciona al menos un vigilante",
                      ),
                    );
                    setBulkActionValue("");

                    return;
                  }

                  // Permission checks for bulk actions
                  if (
                    v === "eliminar" &&
                    !hasPermission("securityGuardDestroy")
                  ) {
                    toast.error(
                      t(
                        "guards.list.toasts.noPermissionDelete",
                        "No tienes permiso para eliminar vigilantes",
                      ),
                    );
                    setBulkActionValue("");

                    return;
                  }
                  if (
                    (v === "archivar" || v === "restaurar" || v === "mover") &&
                    !hasPermission("securityGuardEdit")
                  ) {
                    toast.error(
                      t(
                        "guards.list.toasts.noPermissionEdit",
                        "No tienes permiso para modificar vigilantes",
                      ),
                    );
                    setBulkActionValue("");

                    return;
                  }

                  const ids = selectedGuards.map((sid) => {
                    const g = guards.find((x) => x.id === sid);

                    return g?.raw?.id || sid;
                  });

                  setBulkActionTargetIds(ids);
                  setBulkActionType(v);
                  setBulkActionDialogOpen(true);
                  // clear selection so UI shows placeholder
                  setBulkActionValue("");
                }}
              >
                <SelectTrigger
                  className="w-full md:w-40"
                  disabled={selectedGuards.length === 0}
                >
                  <SelectValue placeholder={t("actions.action", "Acción")} />
                </SelectTrigger>
                <SelectContent>
                  {selectedGuards.length > 0 &&
                  selectedGuards.some(
                    (sid) =>
                      guards.find((g) => g.id === sid)?.status === "Archivado",
                  ) ? (
                    <>
                      <SelectItem value="restaurar">
                        {t("guards.list.actions.restore", "Restaurar")}
                      </SelectItem>
                      <SelectItem value="eliminar">
                        {t("actions.delete", "Eliminar")}
                      </SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="archivar">
                        {t("guards.list.actions.archive", "Archivar")}
                      </SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* En móvil la búsqueda se lleva su propia línea entera y los botones
                comparten la siguiente: apretados en una sola fila, el campo se
                quedaba en un muñón donde no cabía ni un apellido. */}
            <div className="order-1 flex w-full flex-wrap items-center gap-2 md:order-2 md:w-auto md:flex-nowrap">
              <SearchInput
                className="w-full md:w-auto"
                placeholder={t(
                  "guards.list.searchPlaceholder",
                  "Buscar vigilante",
                )}
                value={searchQuery}
                onChange={(v) => setSearchQuery(v)}
              />

              {/* Filtros */}
              <Sheet open={openFilter} onOpenChange={setOpenFilter}>
                <SheetTrigger asChild>
                  <Button
                    className="flex-1 justify-center md:flex-none"
                    variant="outline"
                  >
                    <Filter className="mr-2 h-4 w-4" />
                    {t("guards.list.filters", "Filtros")}
                  </Button>
                </SheetTrigger>
                {/* Ancho fijo de 400px en una pantalla de 375: la hoja se salía.
                    `w-full` en móvil, medida fija a partir de sm. */}
                <SheetContent className="w-full sm:w-[460px]" side="right">
                  <SheetHeader>
                    <SheetTitle>
                      {t("guards.list.filters", "Filtros")}
                    </SheetTitle>
                  </SheetHeader>

                  <div className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label>{t("guards.list.filter.client", "Cliente")}</Label>
                      <Select
                        value={filterClient}
                        onValueChange={(v) => setFilterClient(v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("comun.cliente")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">
                            {t("guards.list.filter.clientAll", "Todos")}
                          </SelectItem>
                          {availableClients.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              {/* This filter is labeled "Cliente": show the company.
                                  It used to work hard to assemble a PERSON's full
                                  name, which is the legal rep. */}
                              {clientDisplayName(c, String(c.email ?? c.id))}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        {t("guards.list.filter.site", "Puesto de seguridad")}
                      </Label>
                      <Select
                        value={filterSite}
                        onValueChange={(v) => setFilterSite(v)}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={t("comun.puestoDeSeguridad")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todos">
                            {t("guards.list.filter.siteAll", "Todos")}
                          </SelectItem>
                          {availablePostSites.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.companyName ||
                                s.name ||
                                (s.company &&
                                  (s.company.name || s.company.companyName)) ||
                                String(s.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      className="w-full"
                      variant="brand"
                      onClick={() => {
                        // Aplica tus filtros reales aquí
                        setOpenFilter(false);
                      }}
                    >
                      {t("guards.list.applyFilters", "Filtro")}
                    </Button>
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => {
                        // Limpiar filtros: resetear filtros controlados y mantener la hoja abierta
                        setFilterClient("todos");
                        setFilterSite("todos");
                        setFilterStatus("activos");
                      }}
                    >
                      {t("guards.list.clearFilters", "Limpiar filtros")}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              {/* Conmutador Tarjetas ⇄ Lista (escritorio) */}
              <Segmented
                className="hidden md:inline-flex"
                options={[
                  {
                    value: "cards" as const,
                    label: (
                      <span className="flex items-center gap-1.5">
                        <LayoutGrid className="h-3.5 w-3.5" />{" "}
                        {t("ui.AdminOfficeUsersPage.tarjetas", "Tarjetas")}
                      </span>
                    ),
                  },
                  {
                    value: "list" as const,
                    label: (
                      <span className="flex items-center gap-1.5">
                        <ListIcon className="h-3.5 w-3.5" /> {t("comun.lista")}
                      </span>
                    ),
                  },
                ]}
                value={viewMode}
                onChange={(v) => setViewMode(v)}
              />

              {/* Menú superior (exportar/importar) */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <EllipsisVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onClick={async () => {
                      if (!(await exportFromBackend("pdf")))
                        downloadFallback("pdf", filteredGuards);
                    }}
                  >
                    <FileDown className="mr-2 h-4 w-4" />{" "}
                    {t("guards.list.export.pdf", "Exportar como PDF")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      if (!(await exportFromBackend("excel")))
                        downloadFallback("excel", filteredGuards);
                    }}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />{" "}
                    {t("guards.list.export.excel", "Exportar como Excel")}
                  </DropdownMenuItem>
                  {hasPermission("securityGuardImport") && (
                    <DropdownMenuItem onClick={() => setImportDialogOpen(true)}>
                      <ArrowDownUp className="mr-2 h-4 w-4" />{" "}
                      {t("guards.list.import", "Importar")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Toolbar>

          {/* Tabla */}
          <GlassPanel className="mt-4 overflow-hidden p-0">
            <div className="mt-2">
              {/*
                MÓVIL = TARJETAS, SIEMPRE.
                El conmutador Tarjetas ⇄ Lista sólo existe en escritorio, así
                que en un teléfono la tabla no se puede ni elegir ni leer. La
                rejilla de tarjetas YA es de una columna en móvil y trae el
                menú de acciones, el estado, la asignación y la reseña — que es
                justo lo que la lista móvil anterior no tenía.

                Por eso no hay dos ramas duplicadas: las tarjetas se pintan
                siempre y sólo se esconden a partir de `md` cuando el usuario
                pidió Lista; la tabla nunca se pinta por debajo de `md`.
              */}
              {loading ? (
                <div className="p-4">
                  <SkeletonCards count={4} />
                </div>
              ) : (
                <>
                  <div
                    className={viewMode === "cards" ? undefined : "md:hidden"}
                  >
                    <GuardCardsGrid
                      actions={guardCardActions}
                      guards={paginatedGuards}
                      loading={false}
                      ratings={ratings}
                      selectedIds={selectedGuards}
                      stationByUserId={stationByUserId}
                      onOpen={(g) => {
                        const realId = g.raw?.id || g.id;

                        navigate(`/guards/${realId}/resumen`);
                      }}
                      onOpenReviews={(realId) =>
                        navigate(`/guards/${realId}/reviews`)
                      }
                      onSelect={handleSelectGuard}
                    />
                  </div>
                  {viewMode !== "cards" && (
                    <div className="hidden md:block overflow-x-auto">
                      <table className="min-w-full text-sm text-left border-collapse">
                        <thead style={{ background: "var(--glass-sunken)" }}>
                          <tr className="border-b">
                            <th className="px-4 py-3">
                              <Checkbox
                                aria-label={t(
                                  "guards.list.selectAllAria",
                                  "Seleccionar todos los vigilantes de esta página",
                                )}
                                checked={allOnPageSelected}
                                onCheckedChange={(v) =>
                                  handleSelectAllGuards(Boolean(v))
                                }
                              />
                            </th>
                            <th className="px-4 py-3 font-semibold">
                              {t("guards.list.table.name", "Nombre")}
                            </th>
                            <th className="px-4 py-3 font-semibold">
                              {t(
                                "guards.list.table.email",
                                "Correo Electrónico",
                              )}
                            </th>
                            <th className="px-4 py-3 font-semibold">
                              {t("guards.list.table.phone", "Número de Móvil")}
                            </th>
                            <th className="px-4 py-3 font-semibold">
                              {t("guards.list.table.assignment", "Asignación")}
                            </th>
                            <th className="px-4 py-3 font-semibold">
                              {t("guards.list.table.status", "Estado")}
                            </th>
                            <th />
                          </tr>
                        </thead>

                        <tbody>
                          {paginatedGuards.length > 0 ? (
                            paginatedGuards.map((guard) => (
                              <tr
                                key={guard.id}
                                className="border-b transition-colors hover:[background:var(--glass-sunken)]"
                              >
                                <td className="px-4 py-3">
                                  <Checkbox
                                    aria-label={t(
                                      "guards.list.selectAria",
                                      "Seleccionar {{name}}",
                                      { name: guard.name },
                                    )}
                                    checked={selectedGuards.includes(guard.id)}
                                    onCheckedChange={(v) =>
                                      handleSelectGuard(guard.id, Boolean(v))
                                    }
                                  />
                                </td>
                                <td className="px-4 py-3 flex items-center gap-3">
                                  {/* Avatar de cristal plano: la lista se desplaza, nada de desenfoque por fila. */}
                                  <div
                                    className="glass-flat flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                                    style={{
                                      background: "var(--brand-wash)",
                                      color: "var(--brand-text)",
                                    }}
                                  >
                                    {(
                                      guard.name?.trim()?.[0] ?? "G"
                                    ).toUpperCase()}
                                  </div>
                                  <div
                                    aria-label={t(
                                      "guards.list.openOverviewAria",
                                      "Abrir resumen de {{name}}",
                                      { name: guard.name },
                                    )}
                                    className="brand-text flex-1 cursor-pointer select-none font-medium hover:underline"
                                    role="link"
                                    tabIndex={0}
                                    onClick={() => {
                                      const realId = guard.raw?.id || guard.id;

                                      navigate(`/guards/${realId}/resumen`);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        const realId =
                                          guard.raw?.id || guard.id;

                                        navigate(`/guards/${realId}/resumen`);
                                      }
                                    }}
                                  >
                                    {guard.name}
                                  </div>
                                  {etiquetas.activo &&
                                    (() => {
                                      const uid =
                                        guard.raw?.guard?.id ??
                                        guard.raw?.guardId ??
                                        null;

                                      return (
                                        <EtiquetaDeSucursal
                                          sucursal={
                                            etiquetas.dePersona(uid) ??
                                            etiquetas.deSede(
                                              uid
                                                ? stationByUserId[uid]
                                                    ?.postSiteId
                                                : null,
                                            )
                                          }
                                        />
                                      );
                                    })()}
                                  {(() => {
                                    const realId = guard.raw?.id || guard.id;
                                    const r = ratings[realId];

                                    return r ? (
                                      <GuardRatingLevel
                                        average={r.average}
                                        count={r.count}
                                        onClick={() =>
                                          navigate(`/guards/${realId}/reviews`)
                                        }
                                      />
                                    ) : null;
                                  })()}
                                </td>
                                <td className="px-4 py-3">
                                  {guard.email || (
                                    <span style={{ color: "var(--ink-faint)" }}>
                                      {t(
                                        "usuarioDeAcceso.sinCorreoCorto",
                                        "Sin correo",
                                      )}
                                    </span>
                                  )}
                                  {guard.username && (
                                    <div
                                      className="font-mono text-xs"
                                      style={{ color: "var(--ink-soft)" }}
                                      title={t(
                                        "usuarioDeAcceso.etiqueta",
                                        "Usuario para entrar",
                                      )}
                                    >
                                      {guard.username}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3">{guard.phone}</td>
                                <td className="px-4 py-3 text-sm">
                                  {guard.station || (
                                    <span style={{ color: "var(--ink-faint)" }}>
                                      {t(
                                        "ui.SecurityGuardsPage.ninguna",
                                        "Ninguna",
                                      )}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {renderStatus(guard.status)}
                                  {/* Archivado AL TERMINAR UN EVENTO (no es una
                                     baja): se reactiva solo al asignarlo. */}
                                  {guard.status === "Archivado" &&
                                    guard.raw?.archivadoTrasEvento && (
                                      <div
                                        className="mt-1 text-xs"
                                        style={{ color: "var(--ink-soft)" }}
                                      >
                                        {t("guards.list.archivadoTras", {
                                          defaultValue:
                                            "Archivado tras {{evento}}",
                                          evento:
                                            guard.raw.archivadoTrasEvento
                                              .nombre,
                                        })}
                                      </div>
                                    )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="icon" variant="ghost">
                                        <EllipsisVertical className="h-5 w-5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      {guard.status === "Pendiente" ? (
                                        <>
                                          {/* Mismo reenvío que la vista de tarjetas — una
                                    sola función, para que las dos vistas no
                                    puedan volver a discrepar. */}
                                          <DropdownMenuItem
                                            onClick={() =>
                                              reenviarInvitacion(guard)
                                            }
                                          >
                                            <Send className="mr-2 h-4 w-4" />{" "}
                                            {invitacionCaducada(guard)
                                              ? t(
                                                  "guards.list.actions.resendInviteExpired",
                                                  "Reenviar invitación (caducada)",
                                                )
                                              : t(
                                                  "guards.list.actions.resendInvite",
                                                  "Reenviar invitación",
                                                )}
                                          </DropdownMenuItem>

                                          <DropdownMenuItem
                                            onClick={() =>
                                              restablecerContrasena(guard)
                                            }
                                          >
                                            <KeyRound className="mr-2 h-4 w-4" />{" "}
                                            {t(
                                              "guards.list.actions.resetPassword",
                                              "Restablecer contraseña",
                                            )}
                                          </DropdownMenuItem>

                                          <DropdownMenuItem
                                            onClick={async () => {
                                              try {
                                                // Only build a registration link from a real server-issued
                                                // invite link/code. Never fabricate one from the internal
                                                // record id — a guessable id must not act as an auth code.
                                                const inviteCode =
                                                  guard.raw?.inviteCode ||
                                                  guard.raw?.code;
                                                const link =
                                                  guard.raw?.inviteLink ||
                                                  (inviteCode
                                                    ? `${window.location.origin}/guard/registration?code=${encodeURIComponent(inviteCode)}`
                                                    : null);

                                                if (!link) {
                                                  toast.error(
                                                    t(
                                                      "ui.SecurityGuardsPage.noHayEnlaceDeRegistro",
                                                    ),
                                                  );

                                                  return;
                                                }
                                                await navigator.clipboard.writeText(
                                                  link,
                                                );
                                                toast.success(
                                                  t(
                                                    "guards.list.toasts.copyLinkSuccess",
                                                    "Enlace de registro copiado",
                                                  ),
                                                );
                                              } catch (err) {
                                                if (import.meta.env.DEV)
                                                  console.error(err);
                                                toast.error(
                                                  t("comun.noSePudoCopiarEl"),
                                                );
                                              }
                                            }}
                                          >
                                            <Copy className="mr-2 h-4 w-4" />{" "}
                                            {t(
                                              "guards.list.actions.copyInviteLink",
                                              "Copiar enlace de registro",
                                            )}
                                          </DropdownMenuItem>

                                          {hasPermission(
                                            "securityGuardDestroy",
                                          ) && (
                                            <DropdownMenuItem
                                              onClick={() => {
                                                setGuardToDelete(guard);
                                                setDeleteDialogOpen(true);
                                              }}
                                            >
                                              <Trash className="mr-2 h-4 w-4" />{" "}
                                              {t(
                                                "guards.list.actions.remove",
                                                "Remover",
                                              )}
                                            </DropdownMenuItem>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          {hasPermission(
                                            "securityGuardRead",
                                          ) && (
                                            <DropdownMenuItem
                                              onClick={() => {
                                                const realId =
                                                  guard.raw?.id || guard.id;

                                                navigate(
                                                  `/guards/${realId}/resumen`,
                                                );
                                              }}
                                            >
                                              <Eye className="mr-2 h-4 w-4" />{" "}
                                              {t(
                                                "guards.list.actions.viewDetails",
                                                "Ver Detalles",
                                              )}
                                            </DropdownMenuItem>
                                          )}
                                          {hasPermission(
                                            "securityGuardEdit",
                                          ) && (
                                            <DropdownMenuItem
                                              onClick={() => {
                                                setAssignGuard(guard);
                                                setAssignStationId("");
                                                setAssignDialogOpen(true);
                                              }}
                                            >
                                              <ShieldCheck className="mr-2 h-4 w-4" />{" "}
                                              {t(
                                                "guards.list.actions.assignStation",
                                                "Asignar a estación",
                                              )}
                                            </DropdownMenuItem>
                                          )}
                                          {hasPermission(
                                            "securityGuardEdit",
                                          ) && (
                                            <DropdownMenuItem
                                              onClick={() =>
                                                restablecerContrasena(guard)
                                              }
                                            >
                                              <KeyRound className="mr-2 h-4 w-4" />{" "}
                                              {t(
                                                "guards.list.actions.resetPassword",
                                                "Restablecer contraseña",
                                              )}
                                            </DropdownMenuItem>
                                          )}
                                          {/* Reenviar la invitación a quien todavía no ha
                                    creado su acceso. La regla es `necesitaInvitacion`,
                                    la MISMA que usan las tarjetas. */}
                                          {necesitaInvitacion(guard) && (
                                            <DropdownMenuItem
                                              onClick={() =>
                                                reenviarInvitacion(guard)
                                              }
                                            >
                                              <Send className="mr-2 h-4 w-4" />{" "}
                                              {invitacionCaducada(guard)
                                                ? t(
                                                    "guards.list.actions.resendInviteExpired",
                                                    "Reenviar invitación (caducada)",
                                                  )
                                                : t(
                                                    "guards.list.actions.resendInvite",
                                                    "Reenviar invitación",
                                                  )}
                                            </DropdownMenuItem>
                                          )}
                                          {guard.status === "Archivado" ? (
                                            <>
                                              {hasPermission(
                                                "securityGuardEdit",
                                              ) && (
                                                <DropdownMenuItem
                                                  onClick={() => {
                                                    setGuardToRestore(guard);
                                                    setRestoreDialogOpen(true);
                                                  }}
                                                >
                                                  <RotateCw className="mr-2 h-4 w-4" />{" "}
                                                  {t(
                                                    "guards.list.actions.restore",
                                                    "Restaurar",
                                                  )}
                                                </DropdownMenuItem>
                                              )}
                                              {hasPermission(
                                                "securityGuardDestroy",
                                              ) && (
                                                <DropdownMenuItem
                                                  onClick={() => {
                                                    setGuardToDelete(guard);
                                                    setDeleteDialogOpen(true);
                                                  }}
                                                >
                                                  <Archive className="mr-2 h-4 w-4" />{" "}
                                                  {t(
                                                    "guards.list.actions.deletePermanently",
                                                    "Eliminar permanentemente",
                                                  )}
                                                </DropdownMenuItem>
                                              )}
                                            </>
                                          ) : (
                                            <>
                                              {hasPermission(
                                                "securityGuardEdit",
                                              ) && (
                                                <DropdownMenuItem
                                                  onClick={() => {
                                                    setGuardToArchive(guard);
                                                    (abrirDialogoDeBaja(),
                                                      setArchiveDialogOpen(
                                                        true,
                                                      ));
                                                  }}
                                                >
                                                  <Archive className="mr-2 h-4 w-4" />{" "}
                                                  {t(
                                                    "guards.list.actions.archive",
                                                    "Archivar",
                                                  )}
                                                </DropdownMenuItem>
                                              )}
                                              {hasPermission(
                                                "securityGuardDestroy",
                                              ) && (
                                                <DropdownMenuItem
                                                  onClick={() => {
                                                    setGuardToDelete(guard);
                                                    setDeleteDialogOpen(true);
                                                  }}
                                                >
                                                  <Trash className="mr-2 h-4 w-4" />{" "}
                                                  {t(
                                                    "guards.list.actions.remove",
                                                    "Remover",
                                                  )}
                                                </DropdownMenuItem>
                                              )}
                                            </>
                                          )}
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="p-6" colSpan={7}>
                                <EmptyState
                                  action={
                                    hasPermission("securityGuardCreate") &&
                                    filterStatus === "todos" &&
                                    !searchQuery ? (
                                      <Button asChild variant="brand">
                                        <Link to="/personal/nueva?tipo=vigilante">
                                          <UserPlus className="mr-2 h-4 w-4" />
                                          {t(
                                            "guards.list.newGuard",
                                            "Nuevo Vigilante",
                                          )}
                                        </Link>
                                      </Button>
                                    ) : undefined
                                  }
                                  description={
                                    filterStatus !== "todos"
                                      ? t(
                                          "ui.SecurityGuardsPage.pruebaConOtroFiltro",
                                          "Prueba con otro filtro de estado.",
                                        )
                                      : searchQuery
                                        ? t(
                                            "ui.SecurityGuardsPage.ningunVigilanteCoincide",
                                            "Ningún vigilante coincide con tu búsqueda.",
                                          )
                                        : t(
                                            "ui.SecurityGuardsPage.agregaTuPrimerVigilante",
                                            "Agrega tu primer vigilante para comenzar.",
                                          )
                                  }
                                  icon={<Users />}
                                  title={
                                    filterStatus !== "todos"
                                      ? t(
                                          "guards.list.empty.byStatusTitle",
                                          "Sin vigilantes en este estado",
                                        )
                                      : t(
                                          "guards.list.empty.noneFoundTitle",
                                          "No se encontraron vigilantes",
                                        )
                                  }
                                />
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Paginación (única). En móvil se parte en dos líneas: los cinco
                controles en una sola fila de 375px se pisaban unos a otros. */}
            <div
              className="flex flex-col gap-3 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              style={{
                color: "var(--ink-soft)",
                background: "var(--glass-sunken)",
              }}
            >
              <div className="flex items-center gap-2">
                <span>
                  {t(
                    "guards.list.pagination.itemsPerPage",
                    "Elementos por página",
                  )}
                </span>
                <Select
                  value={String(itemsPerPage)}
                  onValueChange={(value) => setItemsPerPage(Number(value))}
                >
                  <SelectTrigger className="h-8 w-20">
                    <SelectValue placeholder={String(itemsPerPage)} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-2 sm:justify-end">
                <div>
                  {filteredGuards.length > 0
                    ? t(
                        "guards.list.pagination.range",
                        "{{start}} - {{end}} de {{total}}",
                        {
                          start: (currentPage - 1) * itemsPerPage + 1,
                          end: Math.min(
                            currentPage * itemsPerPage,
                            filteredGuards.length,
                          ),
                          total: filteredGuards.length,
                        },
                      )
                    : t("guards.list.pagination.emptyRange", "0 – 0 de 0")}
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    aria-label={t(
                      "ui.SecurityGuards.paginaAnterior",
                      "Página anterior",
                    )}
                    disabled={currentPage === 1}
                    size="icon-sm"
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label={t(
                      "ui.SecurityGuards.paginaSiguiente",
                      "Página siguiente",
                    )}
                    disabled={currentPage >= totalPages}
                    size="icon-sm"
                    variant="outline"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(p + 1, totalPages))
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </GlassPanel>
        </section>
      </div>
      {/* Modal de detalles del vigilante */}
      {/* Diálogo de confirmación para archivar vigilante */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("guards.list.dialog.archive.title", "Archivar vigilante")}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {t(
              "guards.list.dialog.archive.description",
              "La baja queda registrada en el expediente: fecha, motivo y equipo por devolver. Se puede revertir desde el filtro.",
            )}
          </DialogDescription>
          <div className="mt-4 space-y-3">
            <div className="text-sm text-foreground">
              <strong>{t("guards.list.labels.name", "Nombre")}:</strong>{" "}
              {guardToArchive?.name ?? "-"}
              <span className="ml-2 text-muted-foreground">
                {guardToArchive?.email ?? ""}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">
                  {t("guards.list.dialog.archive.date", "Último día trabajado")}
                </Label>
                <Input
                  type="date"
                  value={bajaFecha}
                  onChange={(e) => setBajaFecha(e.target.value)}
                />
                {bajaFecha > hoyEnLaEmpresa() && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(
                      "guards.list.dialog.archive.futureHint",
                      "Trabaja hasta ese día. Sus turnos posteriores se quitan ahora y el acceso se corta al terminar ese día.",
                    )}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">
                  {t("guards.list.dialog.archive.reason", "Motivo")}
                </Label>
                <select
                  className="cg-input w-full"
                  value={bajaMotivo}
                  onChange={(e) => setBajaMotivo(e.target.value)}
                >
                  {MOTIVOS_BAJA.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs">
                {t("guards.list.dialog.archive.note", "Nota (opcional)")}
              </Label>
              <Input
                placeholder={t(
                  "guards.list.dialog.archive.notePh",
                  "Detalle del motivo",
                )}
                value={bajaNota}
                onChange={(e) => setBajaNota(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">
                {t(
                  "guards.list.dialog.archive.equipment",
                  "¿Qué equipo devolvió hoy? Lo no marcado queda pendiente.",
                )}
              </Label>
              <div className="mt-1 grid grid-cols-2 gap-1">
                {bajaEquipo.map((eq, i) => (
                  <label
                    key={eq.item}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={eq.returned}
                      onCheckedChange={(v) =>
                        setBajaEquipo((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, returned: v === true } : x,
                          ),
                        )
                      }
                    />
                    {EQUIPO_LABEL[eq.item] ?? eq.item}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={bajaRecontratable}
                onCheckedChange={(v) => setBajaRecontratable(v === true)}
              />
              {t(
                "guards.list.dialog.archive.rehire",
                "Elegible para recontratación",
              )}
            </label>
          </div>
          <DialogFooter>
            <Button
              disabled={archiveLoading}
              variant="outline"
              onClick={() => setArchiveDialogOpen(false)}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button
              disabled={archiveLoading}
              variant="brand"
              onClick={async () => {
                if (!guardToArchive) return;
                setArchiveLoading(true);
                try {
                  const realId = guardToArchive.raw?.id || guardToArchive.id;
                  // Prevent archiving if guard is currently on duty
                  const isOnDuty =
                    guardToArchive.raw?.isOnDuty ??
                    guardToArchive.raw?.onDuty ??
                    false;

                  if (isOnDuty) {
                    toast.error(
                      t(
                        "guards.list.toasts.archiveOnDutyError",
                        "No se puede archivar: el vigilante está actualmente en servicio.",
                      ),
                    );
                    setArchiveLoading(false);

                    return;
                  }
                  await securityGuardService.archive([realId], {
                    terminationDate: bajaFecha,
                    reason: bajaMotivo,
                    reasonNote: bajaNota.trim() || undefined,
                    rehireEligible: bajaRecontratable,
                    equipmentReturn: bajaEquipo,
                  });
                  /* A future last day is a SCHEDULED termination: the person
                     keeps working (and stays active here) until that day ends. */
                  if (bajaFecha > hoyEnLaEmpresa()) {
                    toast.success(
                      t(
                        "guards.list.toasts.archiveScheduled",
                        "Baja programada: el acceso se corta al terminar el {{date}}.",
                        { date: bajaFecha },
                      ),
                    );
                    setArchiveDialogOpen(false);

                    return;
                  }
                  // mark as archived in UI
                  setGuards((prev) =>
                    prev.map((g) =>
                      g.id === guardToArchive.id
                        ? {
                            ...g,
                            status: "Archivado",
                            raw: { ...g.raw, status: "archived" },
                          }
                        : g,
                    ),
                  );
                  toast.success(
                    t("guards.list.toasts.archived", "Vigilante archivado"),
                  );
                  setArchiveDialogOpen(false);
                } catch (err: any) {
                  console.error("Error archivando vigilante:", err);
                  toast.error(
                    t(
                      "guards.list.toasts.archiveError",
                      "Error archivando vigilante: {{msg}}",
                      { msg: err?.message || String(err) },
                    ),
                  );
                } finally {
                  setArchiveLoading(false);
                }
              }}
            >
              {archiveLoading
                ? t("guards.list.buttons.archiving", "Archivando…")
                : t("guards.list.actions.archive", "Archivar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Diálogo para eliminar permanentemente */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(
                "guards.list.dialog.delete.title",
                "Eliminar vigilante permanentemente",
              )}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {t(
              "guards.list.dialog.delete.description.default",
              "Esta acción eliminará permanentemente al vigilante y no podrá recuperarse. Si el vigilante está activo, será archivado antes de ser eliminado.",
            )}
          </DialogDescription>
          <div className="mt-4">
            <div className="text-sm text-foreground">
              <strong>{t("guards.list.labels.name", "Nombre")}:</strong>{" "}
              {guardToDelete?.name ?? "-"}
            </div>
            <div className="text-sm text-foreground">
              {guardToDelete?.email ?? ""}
            </div>
          </div>
          {deleteBlocked && (
            <InfoNote
              className="mt-4"
              title={t(
                "guards.list.dialog.delete.blockedTitle",
                "Todavía no se puede eliminar",
              )}
              tone="warn"
            >
              <p>{deleteBlocked.message}</p>
              <p className="mt-2">
                {deleteBlocked.porAgenda
                  ? t(
                      "guards.list.dialog.delete.freeScheduleHint",
                      "Si es un vigilante de prueba o ya no va a trabajar aquí, puedes cancelar sus turnos y rondas pendientes y eliminarlo ahora. Los turnos cancelados quedan como huecos en el Horario para que los cubras.",
                    )
                  : t(
                      "guards.list.dialog.delete.archiveHint",
                      "Archívalo primero: eso le cierra el turno y conserva su historial. Después podrás eliminarlo.",
                    )}
              </p>
            </InfoNote>
          )}
          <DialogFooter className="gap-2">
            <Button
              disabled={deleteLoading}
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
            {deleteBlocked && hasPermission("securityGuardEdit") && (
              <Button
                disabled={deleteLoading}
                variant="outline"
                onClick={() => {
                  if (!guardToDelete) return;
                  setDeleteDialogOpen(false);
                  setGuardToArchive(guardToDelete);
                  abrirDialogoDeBaja();
                  setArchiveDialogOpen(true);
                }}
              >
                {t(
                  "guards.list.actions.archiveInstead",
                  "Archivar en su lugar",
                )}
              </Button>
            )}
            {(!deleteBlocked || deleteBlocked.porAgenda) && (
              <Button
                disabled={deleteLoading}
                variant="destructive"
                onClick={async () => {
                  if (!guardToDelete) return;
                  setDeleteLoading(true);
                  try {
                    const freeSchedule = deleteBlocked?.porAgenda === true;
                    const r = await eliminarVigilantes(
                      [
                        {
                          id: guardToDelete.id,
                          realId: guardToDelete.raw?.id || guardToDelete.id,
                          name: guardToDelete.name,
                        },
                      ],
                      securityGuardService.destroy,
                      { freeSchedule },
                    );

                    if (r.removed.length) {
                      quitarEliminados(r);
                      setDeleteDialogOpen(false);

                      return;
                    }
                    // Refused: the row STAYS, and the dialog says why and what to do.
                    const fallo = r.blockedBySchedule[0] || r.failed[0];

                    if (r.blockedBySchedule.length) {
                      setDeleteBlocked({
                        message: fallo.message,
                        porAgenda: true,
                      });
                    } else if (fallo && fallo.openShift) {
                      setDeleteBlocked({
                        message: fallo.message,
                        porAgenda: false,
                      });
                    } else {
                      toast.error(
                        t(
                          "guards.list.toasts.deleteError",
                          "No se pudo eliminar el vigilante: {{msg}}",
                          { msg: fallo?.message || "" },
                        ),
                      );
                    }
                  } finally {
                    setDeleteLoading(false);
                  }
                }}
              >
                {deleteLoading
                  ? t("guards.list.buttons.deleting", "Eliminando…")
                  : deleteBlocked?.porAgenda
                    ? t(
                        "guards.list.actions.freeScheduleAndDelete",
                        "Cancelar sus turnos y eliminar",
                      )
                    : t("actions.delete", "Eliminar")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Diálogo para restaurar vigilante (si está archivado) */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("guards.list.dialog.restore.title", "Restaurar vigilante")}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {t(
              "guards.list.dialog.restore.description",
              "¿Deseas restaurar este vigilante? La acción lo devolverá al estado activo.",
            )}
          </DialogDescription>
          <div className="mt-4">
            <div className="text-sm text-foreground">
              <strong>{t("guards.list.labels.name", "Nombre")}:</strong>{" "}
              {guardToRestore?.name ?? "-"}
            </div>
            <div className="text-sm text-foreground">
              {guardToRestore?.email ?? ""}
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={restoreLoading}
              variant="outline"
              onClick={() => setRestoreDialogOpen(false)}
            >
              {t("actions.cancel", "Cancelar")}
            </Button>
            <Button
              disabled={restoreLoading}
              variant="brand"
              onClick={async () => {
                if (!guardToRestore) return;
                setRestoreLoading(true);
                try {
                  const realId = guardToRestore.raw?.id || guardToRestore.id;

                  await securityGuardService.restore([realId]);
                  // mark as active in UI
                  setGuards((prev) =>
                    prev.map((g) =>
                      g.id === guardToRestore.id
                        ? {
                            ...g,
                            status: "Activo",
                            raw: { ...g.raw, status: "active" },
                          }
                        : g,
                    ),
                  );
                  toast.success(
                    t(
                      "guards.list.toasts.restoreSuccess",
                      "Vigilante restaurado",
                    ),
                  );
                  setRestoreDialogOpen(false);
                } catch (err: any) {
                  console.error("Error restaurando vigilante:", err);
                  toast.error(
                    t(
                      "guards.list.toasts.restoreError",
                      "Error restaurando vigilante: {{msg}}",
                      { msg: err?.message || String(err) },
                    ),
                  );
                } finally {
                  setRestoreLoading(false);
                }
              }}
            >
              {restoreLoading
                ? t("guards.list.buttons.restoring", "Restaurando…")
                : t("guards.list.actions.restore", "Restaurar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Diálogo de confirmación para acciones masivas */}
      <Dialog
        open={bulkActionDialogOpen}
        onOpenChange={setBulkActionDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkActionType === "archivar"
                ? t(
                    "guards.list.dialog.bulk.archiveTitle",
                    "Archivar vigilantes",
                  )
                : bulkActionType === "restaurar"
                  ? t(
                      "guards.list.dialog.bulk.restoreTitle",
                      "Restaurar vigilantes",
                    )
                  : bulkActionType === "eliminar"
                    ? t(
                        "guards.list.dialog.bulk.deleteTitle",
                        "Eliminar vigilantes",
                      )
                    : t(
                        "guards.list.dialog.bulk.confirmTitle",
                        "Confirmar acción",
                      )}
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {bulkActionType === "archivar" && (
              <>
                {t(
                  "guards.list.dialog.bulk.archiveDescription",
                  "¿Estás seguro de que deseas archivar {{count}} vigilante(s)? Esta acción se puede revertir desde el filtro de archivados.",
                  { count: selectedGuards.length },
                )}
              </>
            )}
            {bulkActionType === "restaurar" && (
              <>
                {t(
                  "guards.list.dialog.bulk.restoreDescription",
                  "¿Deseas restaurar {{count}} vigilante(s)? Estos vigilantes volverán al estado activo.",
                  { count: selectedGuards.length },
                )}
              </>
            )}
            {bulkActionType === "eliminar" && (
              <>
                {t(
                  "guards.list.dialog.bulk.deleteDescription",
                  "Esta acción eliminará permanentemente {{count}} vigilante(s). ¿Deseas continuar?",
                  { count: selectedGuards.length },
                )}
              </>
            )}
          </DialogDescription>
          <div className="mt-4">
            <div className="text-sm text-foreground">
              <strong>
                {t(
                  "guards.list.labels.selectedGuards",
                  "Vigilantes seleccionados",
                )}
                :{" "}
              </strong>
              {selectedGuards.length}
            </div>
          </div>
          {bulkActionType === "eliminar" && bulkDeleteBlocked && (
            <InfoNote
              className="mt-4"
              title={t(
                "guards.list.dialog.bulk.blockedTitle",
                "Estos vigilantes no se pudieron eliminar",
              )}
              tone="warn"
            >
              <ul className="list-disc space-y-1 pl-4">
                {[
                  ...bulkDeleteBlocked.blockedBySchedule,
                  ...bulkDeleteBlocked.failed,
                ].map((f) => (
                  <li key={f.guard.id}>
                    <strong>{f.guard.name}</strong>: {f.message}
                  </li>
                ))}
              </ul>
              {bulkDeleteBlocked.blockedBySchedule.length > 0 && (
                <p className="mt-2">
                  {t(
                    "guards.list.dialog.delete.freeScheduleHint",
                    "Si es un vigilante de prueba o ya no va a trabajar aquí, puedes cancelar sus turnos y rondas pendientes y eliminarlo ahora. Los turnos cancelados quedan como huecos en el Horario para que los cubras.",
                  )}
                </p>
              )}
            </InfoNote>
          )}
          <DialogFooter>
            <Button
              disabled={bulkActionLoading}
              variant="outline"
              onClick={() => setBulkActionDialogOpen(false)}
            >
              {bulkDeleteBlocked
                ? t("actions.close", "Cerrar")
                : t("actions.cancel", "Cancelar")}
            </Button>
            {!(
              bulkActionType === "eliminar" &&
              bulkDeleteBlocked &&
              bulkDeleteBlocked.blockedBySchedule.length === 0
            ) && (
              <Button
                disabled={bulkActionLoading}
                variant={
                  bulkActionType === "eliminar" ? "destructive" : "brand"
                }
                onClick={async () => {
                  setBulkActionLoading(true);
                  /* Some guards could not be deleted: keep the dialog (and its
                   action) open so the list of who and why stays on screen. */
                  let mantenerAbierto = false;

                  try {
                    const ids = bulkActionTargetIds;

                    if (bulkActionType === "archivar") {
                      await securityGuardService.archive(ids);
                      setGuards((prev) =>
                        prev.map((g) =>
                          selectedGuards.includes(g.id)
                            ? {
                                ...g,
                                status: "Archivado",
                                raw: { ...g.raw, status: "archived" },
                              }
                            : g,
                        ),
                      );
                      toast.success(
                        t(
                          "guards.list.toasts.bulkArchived",
                          "Vigilantes archivados",
                        ),
                      );
                    } else if (bulkActionType === "restaurar") {
                      await securityGuardService.restore(ids);
                      setGuards((prev) =>
                        prev.map((g) =>
                          selectedGuards.includes(g.id)
                            ? {
                                ...g,
                                status: "Activo",
                                raw: { ...g.raw, status: "active" },
                              }
                            : g,
                        ),
                      );
                      toast.success(
                        t(
                          "guards.list.toasts.bulkRestored",
                          "Vigilantes restaurados",
                        ),
                      );
                    } else if (bulkActionType === "eliminar") {
                      // Second pass = the person chose «cancel their shifts and
                      // delete them» for the ones the agenda blocked.
                      const reintento = !!bulkDeleteBlocked;
                      const objetivo = reintento
                        ? bulkDeleteBlocked!.blockedBySchedule.map(
                            (f) => f.guard,
                          )
                        : aEliminar(selectedGuards);
                      const r = await eliminarVigilantes(
                        objetivo,
                        securityGuardService.destroy,
                        { freeSchedule: reintento },
                      );

                      quitarEliminados(r);
                      if (r.blockedBySchedule.length || r.failed.length) {
                        setBulkDeleteBlocked({
                          blockedBySchedule: r.blockedBySchedule,
                          failed: r.failed,
                        });
                        mantenerAbierto = true;

                        return;
                      }
                    }
                    setSelectedGuards([]);
                    setBulkActionDialogOpen(false);
                  } catch (err: any) {
                    console.error("Error ejecutando acción masiva:", err);
                    // The request is `silentError`: if this does not say it,
                    // nothing does (it used to fail without a word).
                    toast.error(
                      t(
                        "guards.list.toasts.bulkActionError",
                        "No se pudo completar la acción: {{msg}}",
                        { msg: err?.message || String(err) },
                      ),
                    );
                  } finally {
                    setBulkActionLoading(false);
                    if (!mantenerAbierto) {
                      setBulkActionType(null);
                      setBulkActionTargetIds([]);
                    }
                    setBulkActionValue("");
                  }
                }}
              >
                {bulkActionLoading
                  ? t("guards.list.buttons.processing", "Procesando…")
                  : bulkActionType === "eliminar"
                    ? bulkDeleteBlocked
                      ? t(
                          "guards.list.actions.freeScheduleAndDeleteMany",
                          "Cancelar sus turnos y eliminarlos",
                        )
                      : t("actions.delete", "Eliminar")
                    : t("actions.confirm", "Confirmar")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {detailsGuard && (
        <Modal
          footer={
            <>
              <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                {t("actions.close", "Cerrar")}
              </Button>
              {hasPermission("securityGuardEdit") && (
                <Button
                  onClick={() => {
                    setDetailsOpen(false);
                    const realId = detailsGuard.raw?.id || detailsGuard.id;

                    navigate(`/security-guards/edit/${realId}`);
                  }}
                >
                  {t("actions.edit", "Editar")}
                </Button>
              )}
            </>
          }
          icon={<Eye className="h-5 w-5" />}
          open={detailsOpen}
          size="lg"
          title={t("guards.list.details.title", "Detalles del Vigilante")}
          onOpenChange={(o) => {
            if (!o) setDetailsOpen(false);
          }}
        >
          <div
            className="mb-4 text-xs sm:text-sm"
            style={{ color: "var(--ink-soft)" }}
          >
            {t(
              "guards.list.details.description",
              "Información detallada del vigilante seleccionado.",
            )}
          </div>
          <div className="mb-2 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field
              label={t("guards.list.details.fields.firstName", "Nombre")}
              value={detailsGuard.raw?.guard?.firstName}
            />
            <Field
              label={t("guards.list.details.fields.lastName", "Apellidos")}
              value={detailsGuard.raw?.guard?.lastName}
            />
            <Field
              label={t("guards.list.details.fields.email", "Correo")}
              value={
                correoVisible(
                  detailsGuard.raw?.guard?.email ?? detailsGuard.email,
                ) || t("usuarioDeAcceso.sinCorreoCorto", "Sin correo")
              }
            />
            <Field
              label={t("usuarioDeAcceso.etiqueta", "Usuario para entrar")}
              value={detailsGuard.raw?.guard?.username ?? detailsGuard.username}
            />
            <Field
              label={t("guards.list.details.fields.phone", "Teléfono")}
              value={detailsGuard.raw?.guard?.phoneNumber ?? detailsGuard.phone}
            />
            <Field
              label={t("guards.list.details.fields.governmentId", "Cédula")}
              value={detailsGuard.raw?.governmentId}
            />
            <Field
              label={t(
                "guards.list.details.fields.guardCredentials",
                "Credencial Vigilante",
              )}
              value={detailsGuard.raw?.guardCredentials}
            />
            <Field
              label={t("guards.list.details.fields.address", "Dirección")}
              value={detailsGuard.raw?.address}
            />
            <Field
              label={t(
                "guards.list.details.fields.birthDate",
                "Fecha de nacimiento",
              )}
              value={detailsGuard.raw?.birthDate}
            />
            <Field
              label={t(
                "guards.list.details.fields.birthPlace",
                "Lugar de nacimiento",
              )}
              value={detailsGuard.raw?.birthPlace}
            />
            <Field
              label={t(
                "guards.list.details.fields.maritalStatus",
                "Estado civil",
              )}
              value={detailsGuard.raw?.maritalStatus}
            />
            <Field
              label={t(
                "guards.list.details.fields.bloodType",
                "Tipo de sangre",
              )}
              value={detailsGuard.raw?.bloodType}
            />
            <Field
              label={t(
                "guards.list.details.fields.academicInstruction",
                "Instrucción académica",
              )}
              value={detailsGuard.raw?.academicInstruction}
            />
            <Field
              label={t(
                "guards.list.details.fields.hiringContractDate",
                "Contrato",
              )}
              value={detailsGuard.raw?.hiringContractDate}
            />
            <Field
              className="sm:col-span-2"
              label={t("guards.list.details.fields.gender", "Género")}
              value={detailsGuard.raw?.gender}
            />
          </div>
        </Modal>
      )}

      {/* Import dialog (styled like clients import) */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t(
                "guards.list.importDialog.title",
                "Importar Vigilantes desde Excel",
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                "guards.list.importDialog.description",
                "Sube un archivo .xlsx/.xls/.csv para importar vigilantes.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "guards.list.importDialog.howTo",
                  "Antes de cargar, asegúrese de:",
                )}
              </p>
              <ul
                className="list-inside list-disc space-y-1 text-sm"
                style={{ color: "var(--ink-soft)" }}
              >
                <li>
                  {t(
                    "guards.list.importDialog.fileFormat",
                    "El archivo debe ser formato .xlsx, .xls o .csv",
                  )}
                </li>
                <li>
                  <strong>
                    {t(
                      "guards.list.importDialog.requiredColumnsLabel",
                      "Columnas obligatorias:",
                    )}
                  </strong>{" "}
                  {t(
                    "guards.list.importDialog.requiredColumns",
                    "Nombre, Correo, Teléfono, Estado, Cédula, Fecha Contrato, Género, Tipo Sangre, Credenciales, Fecha Nac., Lugar Nac., Estado Civ., Educación, Dirección",
                  )}
                </li>
              </ul>
              <Button
                className="px-0"
                variant="link"
                onClick={() => {
                  const csvContent = `Nombre,Correo,Teléfono,Estado,Cédula,Fecha Contrato,Género,Tipo Sangre,Credenciales,Fecha Nac.,Lugar Nac.,Estado Civ.,Educación,Dirección\nFrank Mendoza,frankmendoza12@gmail.com,+593123456789,Activo,12345678888,30/11/2025,Femenino,AB-,7878787887878usahuia,10/6/2004,Pastocalle,Casado,Universidad,Calle principal`;
                  const blob = new Blob([csvContent], {
                    type: "text/csv;charset=utf-8;",
                  });
                  const url = window.URL.createObjectURL(blob);
                  const link = document.createElement("a");

                  link.href = url;
                  link.download = "plantilla-vigilantes.csv";
                  link.click();
                  window.URL.revokeObjectURL(url);
                  toast.success(
                    t(
                      "guards.list.importDialog.templateDownloaded",
                      "Plantilla descargada",
                    ),
                  );
                }}
              >
                {t(
                  "guards.list.importDialog.downloadTemplate",
                  "Descargar plantilla de ejemplo",
                )}
              </Button>
            </div>

            <div
              className="rounded-2xl border-2 border-dashed p-8 text-center"
              style={{
                borderColor: importFile
                  ? "var(--brand-line)"
                  : "var(--hairline)",
                background: "var(--glass-sunken)",
              }}
            >
              <input
                accept=".xlsx,.xls,.csv"
                className="hidden"
                id="guard-file-upload"
                type="file"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
              <label
                className="block cursor-pointer"
                htmlFor="guard-file-upload"
              >
                <svg
                  className="mx-auto mb-2 h-12 w-12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  style={{ color: "var(--brand-text)" }}
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 16v-8m0 0l-3 3m3-3 3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="text-sm font-medium">
                  {importFile
                    ? importFile.name
                    : t(
                        "guards.list.importDialog.browsePlaceholder",
                        "Explorar tu archivo Excel aquí....",
                      )}
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t(
                    "guards.list.importDialog.clickToSelect",
                    "Click para seleccionar",
                  )}
                </p>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                disabled={importLoading}
                variant="outline"
                onClick={() => setImportDialogOpen(false)}
              >
                {t("actions.cancel", "Cancelar")}
              </Button>
              <Button
                disabled={!importFile || importLoading}
                onClick={async () => {
                  if (!importFile) {
                    toast.error(
                      t(
                        "guards.list.importDialog.errors.selectFile",
                        "Selecciona un archivo",
                      ),
                    );

                    return;
                  }

                  if (importFile.size === 0) {
                    toast.error(
                      t(
                        "guards.list.importDialog.errors.emptyFile",
                        "El archivo está vacío",
                      ),
                    );

                    return;
                  }

                  // Validate CSV/XLSX client-side to avoid sending empty or malformed files
                  const requiredHeaders = [
                    "Nombre",
                    "Correo",
                    "Teléfono",
                    "Estado",
                    "Cédula",
                    "Fecha Contrato",
                    "Género",
                    "Tipo Sangre",
                    "Credenciales",
                    "Fecha Nac.",
                    "Lugar Nac.",
                    "Estado Civ.",
                    "Educación",
                    "Dirección",
                  ];

                  const lowerName = importFile.name.toLowerCase();

                  if (lowerName.endsWith(".csv")) {
                    try {
                      // Try decode as UTF-8 first, fallback to windows-1252 / latin1 if headers look mojibake
                      const arrayBuffer = await new Promise<ArrayBuffer>(
                        (resolve, reject) => {
                          const fr = new FileReader();

                          fr.onload = () => resolve(fr.result as ArrayBuffer);
                          fr.onerror = () => reject(fr.error);
                          fr.readAsArrayBuffer(importFile);
                        },
                      );

                      const tryDecode = (
                        buf: ArrayBuffer,
                        encoding: string,
                      ) => {
                        try {
                          const dec = new TextDecoder(encoding as any);

                          return dec.decode(buf);
                        } catch (e) {
                          return null;
                        }
                      };

                      let text = tryDecode(arrayBuffer, "utf-8") ?? "";

                      const firstLineUtf = (
                        text.split(/\r?\n/)[0] || ""
                      ).trim();
                      const headersUtf = firstLineUtf
                        .split(",")
                        .map((h) => h.replace(/^"|"$/g, "").trim());
                      const hasRequiredUtf = requiredHeaders.every((rh) =>
                        headersUtf.some(
                          (hh) => hh.toLowerCase() === rh.toLowerCase(),
                        ),
                      );

                      if (!hasRequiredUtf) {
                        // Try windows-1252 (common for Excel/CSV saved on Windows)
                        const alt =
                          tryDecode(arrayBuffer, "windows-1252") ??
                          tryDecode(arrayBuffer, "iso-8859-1");

                        if (alt) {
                          text = alt;
                        }
                      }

                      const lines = text
                        .split(/\r?\n/)
                        .filter((l) => l.trim() !== "");

                      if (lines.length <= 1) {
                        toast.error(
                          t(
                            "guards.list.importDialog.errors.emptyCsvRows",
                            "El CSV no contiene filas de datos",
                          ),
                        );

                        return;
                      }
                      const firstLine = (lines[0] || "").trim();
                      const headers = firstLine
                        .split(",")
                        .map((h) => h.replace(/^"|"$/g, "").trim());
                      const missing = requiredHeaders.filter(
                        (h) =>
                          !headers.some(
                            (hh) => hh.toLowerCase() === h.toLowerCase(),
                          ),
                      );

                      if (missing.length > 0) {
                        console.debug("CSV headers found:", headers);
                        toast.error(
                          t(
                            "guards.list.importDialog.errors.missingColumns",
                            "Faltan columnas obligatorias: {{columns}}. Si tu archivo contiene acentos, guarda como UTF-8 o intenta abrirlo en Excel y volver a exportar en UTF-8.",
                            { columns: missing.join(", ") },
                          ),
                        );

                        return;
                      }
                      console.debug("CSV preview lines:", lines.slice(0, 5));
                    } catch (err) {
                      console.error("Error leyendo CSV para validación:", err);
                      toast.error(
                        t(
                          "guards.list.importDialog.errors.csvValidationFailed",
                          "No se pudo validar el archivo CSV antes de subir. Asegúrate del formato.",
                        ),
                      );

                      return;
                    }
                  } else if (
                    lowerName.endsWith(".xls") ||
                    lowerName.endsWith(".xlsx")
                  ) {
                    try {
                      const arrBuf = await new Promise<ArrayBuffer>(
                        (resolve, reject) => {
                          const fr = new FileReader();

                          fr.onload = () => resolve(fr.result as ArrayBuffer);
                          fr.onerror = () => reject(fr.error);
                          fr.readAsArrayBuffer(importFile);
                        },
                      );
                      const XLSX = await loadXlsx();
                      const wb = XLSX.read(arrBuf, { type: "array" });
                      const sheetName = wb.SheetNames[0];
                      const sheet = wb.Sheets[sheetName];
                      const rows = XLSX.utils.sheet_to_json(sheet, {
                        header: 1,
                      }) as any[];

                      if (!rows || rows.length <= 1) {
                        toast.error(
                          t(
                            "guards.list.importDialog.errors.emptyExcelRows",
                            "El archivo Excel no contiene filas de datos válidas",
                          ),
                        );

                        return;
                      }
                      console.debug("Excel preview rows:", rows.slice(0, 5));
                    } catch (err) {
                      console.error(
                        "Error leyendo Excel para validación:",
                        err,
                      );
                      toast.error(
                        t(
                          "guards.list.importDialog.errors.excelValidationFailed",
                          "No se pudo validar el archivo Excel antes de subir. Asegúrate del formato.",
                        ),
                      );

                      return;
                    }
                  } else {
                    console.debug(
                      "Archivo con extensión no reconocida:",
                      importFile.name,
                      importFile.type,
                    );
                  }

                  setImportLoading(true);
                  const toastId = toast.loading(
                    t(
                      "guards.list.importDialog.processing",
                      "Procesando archivo...",
                    ),
                  );

                  try {
                    // Prepare file to upload: normalize headers (remove accents, trim, lowercase)
                    const normalizeHeader = (h: string) =>
                      h
                        .normalize("NFD")
                        .replace(/\p{Diacritic}/gu, "")
                        .replace(/[\s]+/g, " ")
                        .trim();

                    const normalizeCsvContent = (csvText: string) => {
                      // Remove UTF-8 BOM if present
                      let text = csvText.replace(/^\uFEFF/, "");

                      const rawLines = text
                        .split(/\r?\n/)
                        .filter((l) => l !== undefined && l !== null);

                      if (rawLines.length === 0) return text;

                      const headerLine = (rawLines[0] || "").trim();

                      // detect delimiter by choosing the one with the most columns in header
                      const delimiters = [",", ";", "\t", "|"];
                      let delim = ",";
                      let bestCount = -1;

                      for (const d of delimiters) {
                        const count = headerLine.split(d).length - 1;

                        if (count > bestCount) {
                          bestCount = count;
                          delim = d;
                        }
                      }

                      const parseLine = (line: string) => {
                        // Basic split on detected delimiter. This does not fully handle
                        // quoted delimiters but works for common exports from Excel/Sheets.
                        const parts = line.split(delim);

                        return parts.map((p) => p.replace(/^"|"$/g, "").trim());
                      };

                      const headers = parseLine(headerLine).map((h) =>
                        normalizeHeader(h),
                      );

                      const rest = rawLines.slice(1).map((line) => {
                        if (!line) return "";
                        const cols = parseLine(line);

                        // Re-join using comma for backend consistency
                        return cols.join(",");
                      });

                      // Log detection results for debugging
                      try {
                        console.debug(
                          "[SecurityGuardsPage] CSV normalize: detected delimiter=",
                          JSON.stringify(delim),
                          "headers=",
                          headers,
                        );
                        console.debug(
                          "[SecurityGuardsPage] CSV normalize: sample lines=",
                          [headerLine].concat(rest).slice(0, 5),
                        );
                      } catch (e) {
                        /* ignore logging errors */
                      }

                      return [headers.join(",")].concat(rest).join("\n");
                    };

                    let uploadFile: File | Blob = importFile;

                    const lowerName = importFile.name.toLowerCase();

                    if (lowerName.endsWith(".csv")) {
                      // read as text (we already validated earlier but re-read to create normalized blob)
                      const text = await new Promise<string>(
                        (resolve, reject) => {
                          const fr = new FileReader();

                          fr.onload = () => resolve(String(fr.result ?? ""));
                          fr.onerror = () => reject(fr.error);
                          fr.readAsText(importFile, "utf-8");
                        },
                      ).catch(() => {
                        // fallback to latin1
                        return new Promise<string>((resolve, reject) => {
                          const fr = new FileReader();

                          fr.onload = () => resolve(String(fr.result ?? ""));
                          fr.onerror = () => reject(fr.error);
                          try {
                            fr.readAsText(importFile, "windows-1252");
                          } catch {
                            fr.readAsText(importFile);
                          }
                        });
                      });

                      const normalized = normalizeCsvContent(text);

                      // parse to objects for preview
                      try {
                        const XLSX = await loadXlsx();
                        const wbPreview = XLSX.read(normalized, {
                          type: "string",
                        });
                        const objs = XLSX.utils.sheet_to_json(
                          wbPreview.Sheets[wbPreview.SheetNames[0]],
                          { defval: "" },
                        ) as any[];

                        console.debug(
                          "Parsed CSV rows (preview):",
                          objs.slice(0, 5),
                        );
                      } catch (e) {
                        console.debug("No se pudo parsear preview CSV:", e);
                      }
                      uploadFile = new Blob([normalized], { type: "text/csv" });
                    } else if (
                      lowerName.endsWith(".xls") ||
                      lowerName.endsWith(".xlsx")
                    ) {
                      // convert first sheet to CSV and normalize headers
                      const arrBuf = await new Promise<ArrayBuffer>(
                        (resolve, reject) => {
                          const fr = new FileReader();

                          fr.onload = () => resolve(fr.result as ArrayBuffer);
                          fr.onerror = () => reject(fr.error);
                          fr.readAsArrayBuffer(importFile);
                        },
                      );
                      const XLSX = await loadXlsx();
                      const wb = XLSX.read(arrBuf, { type: "array" });
                      const sheetName = wb.SheetNames[0];
                      const sheet = wb.Sheets[sheetName];
                      let csv = XLSX.utils.sheet_to_csv(sheet);

                      csv = normalizeCsvContent(csv);
                      try {
                        const wbPreview = XLSX.read(csv, { type: "string" });
                        const objs = XLSX.utils.sheet_to_json(
                          wbPreview.Sheets[wbPreview.SheetNames[0]],
                          { defval: "" },
                        ) as any[];

                        console.debug(
                          "Parsed Excel->CSV rows (preview):",
                          objs.slice(0, 5),
                        );
                      } catch (e) {
                        console.debug(
                          "No se pudo parsear preview Excel->CSV:",
                          e,
                        );
                      }
                      uploadFile = new Blob([csv], { type: "text/csv" });
                    }

                    // Log FormData preview (file size and type)
                    try {
                      const fd = new FormData();

                      fd.append("file", uploadFile as Blob, importFile.name);
                      console.debug("FormData preview:", {
                        fileName: importFile.name,
                        size: (uploadFile as Blob).size,
                        type: (uploadFile as Blob).type,
                      });
                    } catch (e) {
                      console.debug("No se pudo crear preview FormData:", e);
                    }

                    // Debug: log what we'll send to the backend
                    try {
                      const blob = uploadFile as Blob;
                      let sample = "<binary or non-text>";

                      if (
                        blob &&
                        blob.size &&
                        /text|csv|plain/.test(blob.type || "")
                      ) {
                        try {
                          // read first KB of text safely
                          sample = String(
                            await blob.slice(0, 1024).text(),
                          ).slice(0, 1024);
                        } catch (err) {
                          sample = "<unable to read sample>";
                        }
                      }

                      console.log(
                        "[SecurityGuardsPage] Import payload preview",
                        {
                          originalName: importFile?.name,
                          originalType: importFile?.type,
                          uploadType: blob.type,
                          uploadSize: blob.size,
                          sample,
                        },
                      );
                    } catch (e) {
                      console.log(
                        "[SecurityGuardsPage] Error building import preview",
                        e,
                      );
                    }

                    // Pass filename explicitly so backend receives a proper file name when a Blob was used
                    const result = await securityGuardService.import(
                      uploadFile as any,
                      importFile?.name,
                    );

                    toast.dismiss(toastId);
                    toast.success(
                      t(
                        "guards.list.importDialog.completed",
                        "Importación completada",
                      ),
                    );
                    // Optionally process result if backend returns details
                    setImportDialogOpen(false);
                    setImportFile(null);
                    // reload list
                    setLoading(true);
                    try {
                      const data = await securityGuardService.list();

                      if (Array.isArray(data)) {
                        const normalize = (item: any): SecurityGuard => {
                          const guardObj = item.guard ?? {};
                          const id =
                            guardObj.id ?? item.guardId ?? item.id ?? "";
                          const name =
                            (item.fullName ??
                              `${guardObj.firstName ?? ""} ${guardObj.lastName ?? ""}`.trim()) ||
                            "-";
                          const email =
                            correoVisible(guardObj.email ?? item.email) ?? "";
                          const username =
                            guardObj.username ?? item.username ?? "";
                          const phone =
                            guardObj.phone ??
                            guardObj.phoneNumber ??
                            item.guard?.phoneNumber ??
                            item.phoneNumber ??
                            item.phone ??
                            item.mobile ??
                            "";
                          const status: GuardStatus = ((): GuardStatus => {
                            const s = (guardObj.status ?? item.status ?? "")
                              .toString()
                              .toLowerCase();

                            if (s === "active" || s === "activo")
                              return "Activo";
                            if (s === "invited" || s === "invitado")
                              return "Pendiente";
                            if (s === "pending" || s === "pendiente")
                              return "Pendiente";
                            if (s === "archived" || s === "archivado")
                              return "Archivado";

                            return "Pendiente";
                          })();

                          return {
                            id,
                            name,
                            email,
                            username,
                            phone,
                            status,
                            raw: item,
                          };
                        };

                        setGuards(data.map(normalize));
                      }
                    } catch (e) {
                      console.error("Error recargando vigilantes:", e);
                    } finally {
                      setLoading(false);
                    }
                  } catch (error: any) {
                    toast.dismiss(toastId);
                    console.error("Error importando vigilantes:", error);
                    const msg =
                      error?.details ||
                      error?.response?.data?.message ||
                      error?.message ||
                      t(
                        "ui.SecurityGuardsPage.errorAlImportar",
                        "Error al importar",
                      );

                    toast.error(msg);
                  } finally {
                    setImportLoading(false);
                  }
                }}
              >
                {importLoading
                  ? t("guards.list.importDialog.importing", "Importando...")
                  : t("guards.list.importDialog.import", "Importar")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Assign-to-Station Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("ui.SecurityGuards.asignarAEstacion", "Asignar a estación")}
            </DialogTitle>
            <DialogDescription>
              {assignGuard
                ? t("ui.SecurityGuardsPage.asignarAEstacionNombre", {
                    defaultValue: "Asignar a {{name}} a una estación",
                    name: assignGuard.name,
                  })
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block">
              {t("ui.SecurityGuards.estacion", "Estación")}
            </Label>
            <Select value={assignStationId} onValueChange={setAssignStationId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={t(
                    "ui.SecurityGuards.seleccionarEstacion",
                    "Seleccionar estación",
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {assignStations.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs" style={{ color: "var(--ink-soft)" }}>
              {t(
                "ui.SecurityGuardsPage.seAsignaraAlPrimerPuesto",
                "Se asignará al primer puesto disponible de la estación y aparecerá en el Horario.",
              )}
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("actions.cancel")}</Button>
            </DialogClose>
            <Button
              disabled={!assignStationId || assignLoading}
              variant="brand"
              onClick={handleAssignStation}
            >
              {assignLoading
                ? t("ui.SecurityGuardsPage.asignando", "Asignando...")
                : t("ui.SecurityGuardsPage.asignar", "Asignar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {compartir.dialogo}
    </AppLayout>
  );
}
