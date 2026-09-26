import type { SecurityGuard } from "@/types";
import { useMemo, useState, FormEvent, useEffect, useCallback } from "react";
import ExportMenu from "@/components/reports/ExportMenu";
import { exportMatrix, type ExportFormat } from "@/lib/export/reportExport";
import { clientDisplayName } from '@/lib/clientName';
import { useAsyncList } from "@/hooks/useAsyncList";
import AppLayout from "@/layouts/app-layout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
    Search,
    Filter as FilterIcon,
    MoreVertical,
    Upload,
    UserPlus,
    Users,
    Plus,
    Trash2,
    LogIn,
    LogOut,
} from "lucide-react";
import {
    PageContainer,
    PageHeader,
    Section,
    EmptyState,
    Modal,
    Toolbar,
    StatCard,
  StatsStrip,
    StatusBadge,
    SkeletonCards,
    Field,
} from "@/components/kit";
import visitorLogService from "@/lib/api/visitorLogService";
import { runOrQueue } from "@/lib/offline/offlineQueue";
import api from '@/lib/api';
import { useTranslation } from 'react-i18next';
import { clientService } from '@/lib/api/clientService';
import { postSiteService, type PostSiteFilters } from '@/lib/api/postSiteService';
import { stationService } from '@/lib/api/stationService';
import securityGuardService from '@/lib/api/securityGuardService';
import { toast } from "sonner";
import { confirmDialog } from '@/components/ui/confirmDialog';
import { VisitorLogFilters } from "@/lib/api/visitorLogService";
import { localeActual } from "@/lib/localeActual";
import { hoyEnLaEmpresa, zonaDeLaEmpresa} from "@/lib/horaDeLaEmpresa";

// Loose client shape covering the various name/id fields the association may carry.
type ClientLike = {
  id: string;
  _id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  companyName?: string;
};

// Post-site option/lookup shape (extends canonical model with legacy nested fields).
type PostSiteLike = {
  id: string;
  _id?: string;
  name?: string;
  companyName?: string;
  postSiteName?: string;
  company?: { name?: string; companyName?: string };
};

// Station option shape (station list reuses the post-site list response envelope).
type StationOption = { id: string; stationName?: string; name?: string };

// Guard option carries fallback name fields not present on the canonical model.
type GuardOption = SecurityGuard & { displayName?: string; name?: string };

// A single visitor-log (bitácora) record with the many optional fallback fields the UI reads.
type VisitLogRow = {
  id: string;
  visitDate?: string;
  exitTime?: string;
  exitAt?: string;
  leaveTime?: string;
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  reason?: string;
  visitReason?: string;
  numPeople?: number;
  peopleCount?: number;
  numberPeople?: number;
  /** Los que entraron CON el titular. La API la manda como lista; una ficha
   *  vieja puede traerla como texto JSON. Ver backend/src/lib/acompanantes.ts. */
  companions?: unknown;
  placeType?: string;
  client?: ClientLike | string | number;
  clientId?: string;
  clientAccountId?: string;
  clientAccount?: string;
  client_id?: string;
  clientIdAccount?: string;
  clientName?: string;
  clientAccountName?: string;
  postSite?: {
    companyName?: string;
    name?: string;
    postSiteName?: string;
    company?: { name?: string; companyName?: string };
    clientAccountName?: string;
    clientName?: string;
  };
  postSiteId?: string;
  postSite_id?: string;
  postSiteIdValue?: string;
  postSiteName?: string;
  postSiteTitle?: string;
  station?: { stationName?: string; name?: string };
  stationName?: string;
};

// Payload sent to create a visitor-log entry.
type VisitorLogCreatePayload = {
  visitDate: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  mobile: string;
  numPeople: number;
  reason?: string;
  clientId: string;
  postSiteId: string;
  stationId?: string;
  guardId: string;
  placeType?: string;
};

type VisitorFilters = {
  client: string;
  site: string;
  guard: string;
  placeType: string;
  tag: string;
  archived: boolean;
};

// Hora de salida: el registro la guarda en cualquiera de estos tres campos.
const salidaDe = (rec: VisitLogRow | null | undefined) =>
  rec?.exitTime || rec?.exitAt || rec?.leaveTime || null;

// Sin hora de salida el visitante sigue dentro. Pasadas 24 h desde la entrada la
// visita deja de leerse como «en curso» y pasa a ser una salida sin registrar.
const VISITA_VENCIDA_MS = 24 * 60 * 60 * 1000;
const visitaVencida = (rec: VisitLogRow) => {
  if (!rec.visitDate) return false;
  const d = new Date(rec.visitDate);

  if (isNaN(d.getTime())) return false;

  return Date.now() - d.getTime() > VISITA_VENCIDA_MS;
};

type NewVisitor = {
  client: string;
  site: string;
  station?: string;
  guard: string;
  placeTypeKind?: string;
  placeTypeValue?: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  mobile: string;
  numPeople?: number;
  reason?: string;
};

/**
 * Los acompañantes en una línea: «Ana Ruiz (0102) · Luis Paz».
 *
 * Acepta lista o texto JSON porque una ficha guardada antes de que la columna
 * existiera, o recuperada de la cola sin cobertura de la app, puede llegar de
 * cualquiera de las dos formas. Ante algo que no entiende devuelve cadena
 * vacía: una celda vacía informa, un «[object Object]» no.
 */
function acompanantesEnLinea(bruto: unknown): string {
  let lista: unknown = bruto;
  if (typeof lista === "string") {
    try {
      lista = JSON.parse(lista);
    } catch {
      return "";
    }
  }
  if (!Array.isArray(lista)) return "";
  return lista
    .map((a: any) => {
      if (!a || typeof a !== "object") return "";
      const nombre = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
      if (nombre && a.idNumber) return `${nombre} (${a.idNumber})`;
      return nombre || a.idNumber || "";
    })
    .filter(Boolean)
    .join(" · ");
}

export default function Visitors() {
  const [openFilter, setOpenFilter] = useState(false);
  const [openAddVisitor, setOpenAddVisitor] = useState(false);
  const [filters, setFilters] = useState<VisitorFilters>({
    client: "",
    site: "",
    guard: "",
    placeType: "",
    tag: "",
    archived: false,
  });
  const [newVisitor, setNewVisitor] = useState<NewVisitor>({
    client: "",
    site: "",
    station: "",
    guard: "",
    placeTypeKind: "",
    placeTypeValue: "",
    firstName: "",
    lastName: "",
    idNumber: "",
    mobile: "",
    numPeople: 1,
    reason: "",
  });
  const [idImageFile, setIdImageFile] = useState<File | null>(null);
  const [perPage, setPerPage] = useState("25");
  const [action, setAction] = useState<string | undefined>(undefined);

  const rows: Array<never> = [];

  // --- Visitor Logs (Bitácoras) integration ---
  const [logsLimit, setLogsLimit] = useState(25);
  const [logsOffset, setLogsOffset] = useState(0);
  const [logsSearch, setLogsSearch] = useState("");
  const [selectedLogs, setSelectedLogs] = useState<Record<string, boolean>>({});
  const [viewLogOpen, setViewLogOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<VisitLogRow | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientLike[]>([]);
  const [postSites, setPostSites] = useState<PostSiteLike[]>([]);
  const [postSitesForFilter, setPostSitesForFilter] = useState<PostSiteLike[]>(
    [],
  );
  const [postSitesForNewVisitor, setPostSitesForNewVisitor] = useState<
    PostSiteLike[]
  >([]);
  const [stationsForNewVisitor, setStationsForNewVisitor] = useState<
    StationOption[]
  >([]);
  const [guards, setGuards] = useState<GuardOption[]>([]);
  const [guardsForFilter, setGuardsForFilter] = useState<GuardOption[]>([]);
  const [guardsForNewVisitor, setGuardsForNewVisitor] = useState<GuardOption[]>(
    [],
  );
  const { t } = useTranslation();

  // Local helper removed: it preferred name+lastName (the legal representative)
  // and never looked at commercialName. Now uses the shared @/lib/clientName.

  const getClientLabelFromRecord = (rec: VisitLogRow | null | undefined) => {
    if (!rec) return "-";
    if (rec.client) {
      if (typeof rec.client === "string" || typeof rec.client === "number")
        return String(rec.client);

      return clientDisplayName(rec.client as ClientLike);
    }
    // common id fields
    const id =
      rec.clientId ||
      rec.clientAccountId ||
      rec.clientAccount ||
      rec.client_id ||
      rec.clientIdAccount;

    if (id && clients && clients.length) {
      const found = clients.find(
        (c) => String(c.id) === String(id) || String(c._id) === String(id),
      );
      if (found) return clientDisplayName(found);
    }
    // fallback to any names present on the record
    // rec.clientAccount is an id string, not a client object — only feed
    // clientDisplayName something object-shaped.
    const clientObj =
      rec.client && typeof rec.client === "object"
        ? (rec.client as ClientLike)
        : null;
    const fallback =
      clientDisplayName(clientObj, "") ||
      rec.clientName ||
      rec.clientAccountName ||
      (rec.postSite &&
        (rec.postSite.clientAccountName || rec.postSite.clientName));

    if (fallback) return fallback;
    if (id) return String(id);

    return "-";
  };

  const getPostSiteLabelFromRecord = (rec: VisitLogRow | null | undefined) => {
    if (!rec) return "-";
    if (rec.postSite && typeof rec.postSite === "object") {
      return (
        rec.postSite.companyName ||
        rec.postSite.name ||
        (rec.postSite.company &&
          (rec.postSite.company.name || rec.postSite.company.companyName)) ||
        rec.postSite.postSiteName ||
        "-"
      );
    }
    const id =
      rec.postSiteId || rec.postSite || rec.postSite_id || rec.postSiteIdValue;

    if (id && postSites && postSites.length) {
      const found = postSites.find(
        (p) => String(p.id) === String(id) || String(p._id) === String(id),
      );
      if (found)
        return (
          found.companyName ||
          found.name ||
          (found.company &&
            (found.company.name || found.company.companyName)) ||
          found.postSiteName ||
          String(id)
        );
    }
    return rec.postSiteName || rec.postSiteTitle || "-";
  };

  const toggleSelectLog = (id: string) => {
    setSelectedLogs((s) => ({ ...s, [id]: !s[id] }));
  };

  const selectAllLogs = async (checked: boolean) => {
    if (!checked) {
      setSelectedLogs({});

      return;
    }
    // Select across ALL pages of the filtered set, not just the visible page,
    // so a subsequent export isn't silently truncated to the current page.
    const map: Record<string, boolean> = {};

    try {
      const all = logsCount > logs.length ? await fetchAllLogs() : logs;

      all.forEach((l) => (map[l.id] = true));
    } catch (e) {
      console.error("select-all fetch failed", e);
      logs.forEach((l) => (map[l.id] = true));
    }
    setSelectedLogs(map);
  };

  // Resolves selected ids to full row objects. When the selection spans pages
  // (ids not all present in the current page), fetch the full filtered set.
  const resolveExportRows = async (ids: string[]): Promise<VisitLogRow[]> => {
    const fromPage = logs.filter((r) => ids.includes(String(r.id)));

    if (fromPage.length === ids.length || logsCount <= logs.length)
      return fromPage;
    try {
      const all = await fetchAllLogs();

      return all.filter((r) => ids.includes(String(r.id)));
    } catch (e) {
      console.error("export full-set fetch failed", e);
      toast.error(t("comun.noSePudoObtenerEl"));

      return fromPage;
    }
  };

  const handleDeleteSelected = async () => {
    const ids = Object.keys(selectedLogs).filter((k) => selectedLogs[k]);

    if (!ids.length) {
      toast.error(
        t("guards.deleteNoneSelected") || "No hay elementos seleccionados",
      );
      return;
    }
    // open confirm modal for bulk delete
    setConfirmDeleteIds(ids);
    setConfirmDeleteOpen(true);
  };

  const handleActionChange = (v: string | undefined) => {
    setAction(v);
    if (!v) return;
    if (v === "eliminar") {
      handleDeleteSelected();
    } else {
      toast.error(t("guards.actionNotImplemented") || "Acción no implementada");
    }
    // reset the select so options are ready for next use
    setAction(undefined);
  };

  const viewLog = async (id: string) => {
    try {
      const data = await visitorLogService.get(id);

      setSelectedLog(data || null);
      setViewLogOpen(true);
    } catch (e) {
      console.error("Error loading log", e);
      toast.error(t("visitantes.loadError") || "No se pudo cargar el registro");
    }
  };

  const markExit = async (id: string) => {
    try {
      const now = new Date().toISOString();

      await visitorLogService.update(id, { exitTime: now });
      toast.success(t("visitantes.exitMarked") || "Salida marcada");
      setSelectedLogs({});
      fetchLogs();
    } catch (e) {
      console.error("Error marking exit time", e);
      toast.error(t("visitantes.exitError") || "Error marcando la salida");
    }
  };

  const formatDateTime = (val: string | undefined | null) => {
    if (!val) return "-";
    try {
      const d = new Date(val);

      if (isNaN(d.getTime())) return String(val);

      return d.toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() });
    } catch (e) {
      return String(val);
    }
  };

  const archiveLog = async (id: string) => {
    if (
      !(await confirmDialog({
        message: t("visitantes.confirmArchive") || "Archivar este registro?",
        confirmText: t("actions.archive", "Archivar"),
      }))
    )
      return;
    try {
      await visitorLogService.update(id, { archived: true });
      toast.success(t("visitantes.archived") || "Registro archivado");
      fetchLogs();
    } catch (e) {
      console.error("Error archiving log", e);
      toast.error(t("visitantes.archiveError") || "Error archivando registro");
    }
  };

  const deleteLog = async (id: string) => {
    // open confirm modal for single delete
    setConfirmDeleteIds([id]);
    setConfirmDeleteOpen(true);
  };

  const performDeleteConfirmed = async () => {
    if (!confirmDeleteIds || confirmDeleteIds.length === 0) {
      setConfirmDeleteOpen(false);

      return;
    }
    try {
      await visitorLogService.delete(confirmDeleteIds);
      toast.success(t("visitantes.deleted") || "Registro(s) eliminado(s)");
      setSelectedLogs({});
      setConfirmDeleteOpen(false);
      setConfirmDeleteIds([]);
      fetchLogs();
    } catch (e) {
      console.error("Error deleting logs", e);
      toast.error(
        t("visitantes.deleteError") || "Error eliminando registro(s)",
      );
    }
  };

  /**
   * ══════════════════════════════════════════════════════════════════════
   * LA BITÁCORA DE VISITAS, FUERA DEL SISTEMA
   *
   * ── QUÉ HABÍA ────────────────────────────────────────────────────────
   * CUATRO copias de la misma tabla de diez columnas: una en el CSV, otra
   * en el Excel, otra en el PDF y otra en la impresión. Y no eran iguales
   * —el CSV y el Excel rotulaban en inglés, el PDF en el idioma del
   * usuario—, así que el mismo periodo daba archivos con cabeceras
   * distintas. Además el exportador de Excel estaba HUÉRFANO: la función
   * existía entera y ningún botón del menú la llamaba, así que la opción
   * de bajar un `.xlsx` no existía para el usuario.
   *
   * Ahora la tabla es una sola y los cuatro caminos salen de ella.
   * ══════════════════════════════════════════════════════════════════════
   */
  const COLUMNAS_BITACORA: {
    label: string;
    get: (r: VisitLogRow) => string;
  }[] = [
    {
      label: t("visitantes.logTable.date", "Fecha"),
      get: (r) => formatDateTime(r.visitDate),
    },
    {
      label: t("visitantes.logTable.lastName", "Apellidos"),
      get: (r) => r.lastName || "",
    },
    {
      label: t("visitantes.logTable.firstName", "Nombre"),
      get: (r) => r.firstName || "",
    },
    {
      label: t("visitantes.logTable.idNumber", "ID"),
      get: (r) => r.idNumber || "",
    },
    {
      label: t("visitantes.logTable.reason", "Motivo"),
      get: (r) => r.reason || "",
    },
    {
      label: t("visitantes.logTable.exitTime", "Hora de salida"),
      get: (r) => formatDateTime(r.exitTime) || "",
    },
    {
      label: t("visitantes.logTable.numPeople", "Número de personas"),
      get: (r) => String(r.numPeople ?? ""),
    },
    {
      // Sin esto, «Personas: 4» en la bitácora que se le manda al cliente
      // sigue sin decir quiénes entraron. Va aquí y no en cada exportador
      // porque de esta tabla salen los cuatro caminos (CSV, Excel, PDF e
      // impresión) — ese fue justo el arreglo que documenta la cabecera.
      label: t("visitantes.logTable.companions", "Acompañantes"),
      get: (r) => acompanantesEnLinea(r.companions),
    },
    {
      label: t("visitantes.logTable.station", "Estación"),
      get: (r) =>
        r.station?.stationName || r.station?.name || r.stationName || "",
    },
    {
      label: t("visitantes.logTable.client", "Cliente"),
      get: (r) => getClientLabelFromRecord(r) || "",
    },
    {
      label: t("visitantes.logTable.postSite", "Sitio"),
      get: (r) => getPostSiteLabelFromRecord(r) || "",
    },
  ];

  /** Las filas marcadas, ya resueltas contra el conjunto completo. */
  const filasSeleccionadas = async (
    mensajeVacio: string,
  ): Promise<VisitLogRow[] | null> => {
    const ids = Object.keys(selectedLogs).filter((k) => selectedLogs[k]);

    if (!ids.length) {
      toast.error(mensajeVacio);
      return null;
    }
    const filas = await resolveExportRows(ids);

    if (!filas.length) {
      toast.error(mensajeVacio);
      return null;
    }
    return filas;
  };

  const exportarBitacoras = async (format: ExportFormat) => {
    const filas = await filasSeleccionadas(
      t("visitantes.noSelectionExport") ||
        "No hay registros seleccionados para exportar",
    );

    if (!filas) return;
    try {
      await exportMatrix(
        format,
        COLUMNAS_BITACORA.map((c) => c.label),
        filas.map((r) => COLUMNAS_BITACORA.map((c) => c.get(r))),
        {
          title: t("visitantes.bitacoras", "Bitácoras"),
          subtitle: t("ui.Visitors.registrosCount", {
            count: filas.length,
            defaultValue: "{{count}} registro(s)",
          }),
          fileBase: `bitacoras_export_${hoyEnLaEmpresa()}`,
        },
      );
    } catch (e) {
      console.error("Export bitácoras failed", e);
      toast.error(t("visitantes.exportError") || "Error exportando");
    }
  };

  // Escape any user/server-supplied value before interpolating into print HTML.
  // Visitor fields (names, idNumber, reason) and client/site labels are free-text and
  // attacker-influenced; without escaping a value like `<img src=x onerror=...>` would
  // execute in the same-origin print popup and could read localStorage tokens.
  const escapeHtml = (val: unknown): string =>
    String(val ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  /**
   * La vista de impresión, sobre las MISMAS columnas.
   *
   * Se conserva junto al PDF descargable, y no por costumbre: las fuentes
   * estándar del PDF cubren el español, el portugués, el francés, el
   * italiano, el alemán y el neerlandés, pero no la ł ni la ą del polaco.
   * En polaco, la ventana del navegador sigue siendo la salida fiel.
   */
  const handlePrintSelected = async () => {
    const filas = await filasSeleccionadas(
      t("visitantes.notprint") ||
        "No hay registros seleccionados para imprimir",
    );

    if (!filas) return;

    const cabecera = COLUMNAS_BITACORA.map(
      (c) => `<th>${escapeHtml(c.label)}</th>`,
    ).join("");
    const cuerpo = filas
      .map(
        (r) =>
          `<tr>${COLUMNAS_BITACORA.map((c) => `<td>${escapeHtml(c.get(r))}</td>`).join("")}</tr>`,
      )
      .join("");

    const html = `
            <html>
            <head>
                <title>${escapeHtml(t("visitantes.bitacorasImprimir", "Bitácoras - Imprimir"))}</title>
                <style>
                    table{border-collapse:collapse;width:100%}
                    th,td{border:1px solid rgba(0,0,0,0.22);padding:6px;text-align:left}
                    th{background:rgba(0,0,0,0.05)}
                </style>
            </head>
            <body>
                <h2>${escapeHtml(t("visitantes.bitacoras") || "Bitácoras")}</h2>
                <table><thead><tr>${cabecera}</tr></thead><tbody>${cuerpo}</tbody></table>
            </body>
            </html>
        `;

    const w = window.open("", "_blank");

    if (!w) {
      toast.error(
        t("visitantes.printError") || "No se pudo abrir ventana para imprimir",
      );
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 500);
  };

  // Shared async-list hook: debounced (one request per typing burst),
  // latest-response-wins, unmount-safe. refetch() reloads after a mutation.
  // Shared by the paginated list query and the full-dataset export fetch so
  // both always scope to the same active filters.
  const buildLogsFilter = useCallback((): VisitorLogFilters & {
    query?: string;
  } => {
    const f: VisitorLogFilters & { query?: string } = {};

    if (logsSearch) {
      const s = String(logsSearch).trim();

      if (/^[0-9]+$/.test(s)) f.idNumber = s;
      else if (s) f.query = s;
    }
    if (filters.client) f.clientId = filters.client;
    if (filters.site) f.postSiteId = filters.site;
    if (filters.guard) f.guardId = filters.guard;
    if (filters.placeType) f.placeType = filters.placeType;
    if (filters.tag) f.tag = filters.tag;
    if (typeof filters.archived === "boolean") f.archived = filters.archived;

    return f;
  }, [
    logsSearch,
    filters.client,
    filters.site,
    filters.guard,
    filters.placeType,
    filters.tag,
    filters.archived,
  ]);

  // Fetches the FULL filtered log set (all pages) for select-all / export.
  const fetchAllLogs = useCallback(async (): Promise<VisitLogRow[]> => {
    const resp = await visitorLogService.list(buildLogsFilter(), {
      limit: 10000,
      offset: 0,
    });
    return (resp?.rows as VisitLogRow[]) || [];
  }, [buildLogsFilter]);

  const {
    data: logsData,
    loading: logsLoading,
    refetch: fetchLogs,
  } = useAsyncList(
    () => {
      return visitorLogService.list(buildLogsFilter(), {
        limit: logsLimit,
        offset: logsOffset,
      });
    },
    [
      logsSearch,
      logsLimit,
      logsOffset,
      filters.client,
      filters.site,
      filters.guard,
      filters.placeType,
      filters.tag,
      filters.archived,
    ],
    {
      debounceMs: 300,
      onError: (err) => console.error("Error fetching visitor logs", err),
    },
  );
  const logs: VisitLogRow[] = logsData?.rows || [];
  const logsCount = logsData?.count || 0;
  // Recuento sobre los registros mostrados: quién sigue dentro y quién ya salió.
  const dentro = logs.filter((l) => !salidaDe(l)).length;
  const conSalida = logs.length - dentro;

  // when filter client changes, load postSites for that client
  useEffect(() => {
    const load = async () => {
      try {
        if (!filters.client) {
          // no client selected -> empty list
          setPostSitesForFilter([]);

          return;
        }
        const resp = await postSiteService.list(
          { clientId: filters.client },
          { limit: 200, offset: 0 },
        );
        setPostSitesForFilter(resp.rows || []);
        // clear dependent selects when client changes
        setFilters((s) => ({ ...s, site: "", guard: "" }));
      } catch (e) {
        console.error("Failed to load post sites for filter", e);
      }
    };

    load();
  }, [filters.client]);

  // when newVisitor.client changes, load postSites for that client (used in add visitor form)
  useEffect(() => {
    const load = async () => {
      try {
        if (!newVisitor.client) {
          setPostSitesForNewVisitor([]);

          return;
        }
        const resp = await postSiteService.list(
          { clientId: newVisitor.client },
          { limit: 200, offset: 0 },
        );
        setPostSitesForNewVisitor(resp.rows || []);
        setNewVisitor((s) => ({ ...s, site: "", guard: "" }));
      } catch (e) {
        console.error("Failed to load post sites for new visitor form", e);
      }
    };

    load();
  }, [newVisitor.client]);

  // when filter client changes, load guards for that client
  useEffect(() => {
    const loadGuards = async () => {
      try {
        if (!filters.client) {
          setGuardsForFilter([]);

          return;
        }
        const resp = await securityGuardService.list({
          "filter[clientId]": filters.client,
          limit: 200,
          offset: 0,
        });
        const list = Array.isArray(resp) ? resp : resp.rows || [];

        setGuardsForFilter(list || []);
      } catch (e) {
        console.error("Failed to load guards for filter", e);
      }
    };

    loadGuards();
  }, [filters.client]);

  // when newVisitor.site changes, load stations for that post site (used in add visitor form)
  useEffect(() => {
    const loadStations = async () => {
      try {
        if (!newVisitor.site) {
          setStationsForNewVisitor([]);
          // clear dependent selects
          setNewVisitor((s) => ({ ...s, station: "", guard: "" }));

          return;
        }
        const resp = await stationService.list(
          { postSite: newVisitor.site } as PostSiteFilters & {
            postSite: string;
          },
          { limit: 200, offset: 0 },
        );
        setStationsForNewVisitor(resp.rows || []);
        // clear dependent selects when site changes
        setNewVisitor((s) => ({ ...s, station: "", guard: "" }));
      } catch (e) {
        console.error("Failed to load stations for new visitor form", e);
      }
    };

    loadStations();
  }, [newVisitor.site]);

  // load guards only when a station is selected — show guards linked to that station
  useEffect(() => {
    const loadGuards = async () => {
      try {
        if (!newVisitor.station) {
          setGuardsForNewVisitor([]);

          return;
        }

        const resp = await securityGuardService.list({
          "filter[stationId]": newVisitor.station,
          limit: 200,
          offset: 0,
        });
        const list = Array.isArray(resp) ? resp : resp.rows || [];

        setGuardsForNewVisitor(list || []);
      } catch (e) {
        console.error("Failed to load guards for new visitor form", e);
      }
    };

    loadGuards();
  }, [newVisitor.station]);
  useEffect(() => {
    // load clients, post sites and guards for selects
    const load = async () => {
      try {
        const cResp = await clientService.getClients(undefined, {
          limit: 100,
          offset: 0,
        });
        setClients(cResp.rows || []);
      } catch (e) {
        console.error("Failed to load clients", e);
      }

      try {
        const pResp = await postSiteService.list({}, { limit: 100, offset: 0 });
        const rows = pResp.rows || [];

        setPostSites(rows);
        // Do not preload per-client lists — keep them empty until a client is selected
        setPostSitesForFilter([]);
        setPostSitesForNewVisitor([]);
      } catch (e) {
        console.error("Failed to load post sites", e);
      }

      try {
        const gResp = await securityGuardService.list({
          limit: 100,
          offset: 0,
        });
        // securityGuardService.list returns { rows, count } or array
        const guardsList = Array.isArray(gResp) ? gResp : gResp.rows || [];

        setGuards(guardsList || []);
        // Do not preload per-client guard lists
        setGuardsForFilter([]);
        setGuardsForNewVisitor([]);
      } catch (e) {
        console.error("Failed to load guards", e);
      }
    };

    load();
  }, []);

  const perPageText = useMemo(() => {
    if (perPage === "10") return "10";
    if (perPage === "50") return "50";

    return "25";
  }, [perPage]);

  const onSubmitFilters = (e: FormEvent) => {
    e.preventDefault();
    // reset paging; the consolidated effect refetches when offset/filters change
    setLogsOffset(0);
    setOpenFilter(false);
  };

  const onSubmitVisitor = async (e: FormEvent) => {
    e.preventDefault();
    // Validate required fields
    const missing: string[] = [];

    if (!newVisitor.client) missing.push(t("visitantes.client") || "Cliente");
    if (!newVisitor.site) missing.push(t("visitantes.site") || "Sitio");
    if (!newVisitor.guard) missing.push(t("visitantes.guard") || "Vigilante");
    if (!newVisitor.firstName)
      missing.push(t("visitantes.form.name") || "Nombre");
    if (!newVisitor.lastName)
      missing.push(t("visitantes.form.lastName") || "Apellidos");
    if (!newVisitor.idNumber)
      missing.push(t("visitantes.form.idNumber") || "Número de identificación");
    if (!newVisitor.mobile)
      missing.push(t("visitantes.form.mobile") || "Número de Móvil");
    if (!newVisitor.numPeople || Number(newVisitor.numPeople) < 1)
      missing.push(t("visitantes.form.numPeople") || "Número de personas");

    if (missing.length) {
      toast.error(
        `${t("visitantes.missingFields") || "Faltan campos obligatorios"}: ${missing.join(", ")}`,
      );
      return;
    }

    try {
      // Build payload. Set visitDate to now (ISO)
      const now = new Date();
      const payload: VisitorLogCreatePayload = {
        visitDate: now.toISOString(),
        firstName: newVisitor.firstName,
        lastName: newVisitor.lastName,
        idNumber: newVisitor.idNumber,
        mobile: newVisitor.mobile,
        numPeople: newVisitor.numPeople || 1,
        reason: newVisitor.reason || undefined,
        clientId: newVisitor.client,
        postSiteId: newVisitor.site,
        stationId: newVisitor.station || undefined,
        guardId: newVisitor.guard,
        // combine type and value into a single string, e.g. "DEPARTAMENTO - 24"
        placeType:
          newVisitor.placeTypeKind && newVisitor.placeTypeValue
            ? `${newVisitor.placeTypeKind.toUpperCase()} - ${newVisitor.placeTypeValue}`
            : newVisitor.placeTypeValue || undefined,
      };

      // Sin red, la visita queda en cola y sale sola al reconectar; la
      // foto del documento no viaja en la cola (se agrega luego).
      const { queued, result: created } = await runOrQueue(
        "visitorLog.create",
        payload,
        () => visitorLogService.create(payload),
        t("ui.Visitors.visita", "Visita"),
      );

      if (queued) {
        toast.warning(
          idImageFile
            ? t(
                "ui.Visitors.sinConexionVisitaEnColaSinFoto",
                "Sin conexión: la visita quedó en cola y se registrará sola al reconectar. La foto del documento no viaja en la cola — agrégala después desde el registro.",
              )
            : t(
                "ui.Visitors.sinConexionVisitaEnCola",
                "Sin conexión: la visita quedó en cola y se registrará sola al reconectar.",
              ),
          { duration: 9000 },
        );
        setOpenAddVisitor(false);
        setNewVisitor((s) => ({
          ...s,
          firstName: "",
          lastName: "",
          idNumber: "",
          mobile: "",
          client: "",
          site: "",
          guard: "",
          placeTypeKind: "",
          placeTypeValue: "",
          numPeople: 1,
          reason: "",
        }));
        return;
      }
      // created should include visitDate from backend
      const createdVisitDate = created?.visitDate;
      const createdDateObj = createdVisitDate
        ? new Date(createdVisitDate)
        : null;
      const diffMs = createdDateObj
        ? Math.abs(createdDateObj.getTime() - now.getTime())
        : null;

      // If an ID image file was provided, upload to storage and create attachment metadata
      try {
        if (idImageFile) {
          // upload file to storage (securityGuardService handles tenant id)
          const uploaded = await securityGuardService.uploadFileToStorage(
            idImageFile,
            "notesImages",
          );

          const tenantId = localStorage.getItem("tenantId");

          if (tenantId) {
            const attPayload: {
              name: string;
              mimeType: string;
              sizeInBytes: number;
              storageId: string;
              fileToken: string | null;
              publicUrl: string | null;
              notableType: string;
              notableId: string;
            } = {
              name: uploaded.name || idImageFile.name,
              mimeType: idImageFile.type || "image/*",
              sizeInBytes: uploaded.sizeInBytes || idImageFile.size,
              storageId: "notesImages",
              // prefer fileToken when present (encrypted privateUrl)
              fileToken: uploaded.fileToken || null,
              publicUrl: uploaded.publicUrl || null,
              notableType: "visitorLog",
              notableId: created.id,
            };

            await api.post(`/tenant/${tenantId}/attachments`, attPayload);
            // clear selected file after successful upload
            setIdImageFile(null);
          }
        }
      } catch (err) {
        console.warn("Failed to upload/create attachment for visitor", err);
        try {
          toast.error(
            t("visitantes.attachUploadError") || "Fallo al subir adjunto",
          );
        } catch (e) {}
      }

      toast.success(t("visitantes.created") || "Visitante creado");
      setOpenAddVisitor(false);
      setNewVisitor((s) => ({
        ...s,
        firstName: "",
        lastName: "",
        idNumber: "",
        mobile: "",
        client: "",
        site: "",
        guard: "",
        placeTypeKind: "",
        placeTypeValue: "",
        numPeople: 1,
        reason: "",
      }));
      fetchLogs();

      // Internal logging only: do not display visitDate information to the user
      if (diffMs !== null && diffMs <= 5000) {
        console.debug("visitDate synced:", createdVisitDate);
      } else if (createdVisitDate) {
        console.debug("visitDate received:", createdVisitDate);
      } else {
        console.debug("visitDate missing from create response");
      }
    } catch (e) {
      console.error("Error creating visitor", e);
      toast.error(t("visitantes.createError") || "Error creando visitante");
    }
  };

  return (
    <AppLayout>

      <section>
        <PageContainer width="wide">
          <PageHeader
            actions={
                        <>
                            <Select value={action} onValueChange={(v) => { handleActionChange(v); setAction(''); }}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder={t('actions.action') || 'Acción'} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="eliminar">{t('actions.delete') || 'Eliminar'}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                variant="brand"
                                type="button"
                                onClick={() => setOpenAddVisitor(true)}
                            >
                                <Plus className="mr-2 h-4 w-4" />
                                {t('visitantes.addVisitor') || 'Añadir visitante'}
                            </Button>
                        </>
                    }
                    icon={<Users />}
                    subtitle={t('visitantes.subtitle') || 'Bitácoras de visitantes registrados en sus puestos'}
                    title={t('visitantes.title') || 'Visitantes'}
          />

          <StatsStrip className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label={t("visitantes.bitacoras") || "Bitácoras"}
              value={logsCount}
              icon={<Users />}
              accent="brand"
              hint={t("comun.conLosFiltrosAplicados")}
            />
            <StatCard
              label={t("comun.dentroDeLasInstalaciones")}
              value={dentro}
              icon={<LogIn />}
              accent="ok"
              hint={t("comun.deLosRegistrosMostrados")}
            />
            <StatCard
              label={t("comun.conSalidaRegistrada")}
              value={conSalida}
              icon={<LogOut />}
              accent="neutral"
              hint={t("comun.deLosRegistrosMostrados")}
            />
          </StatsStrip>

          <Toolbar>
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--ink-faint)" }}
              />
              <Input
                className="w-full pl-9"
                placeholder={
                  t("visitantes.searchVisitor") || "Buscar visitante"
                }
                onChange={(e) => {
                  setLogsSearch(e.target.value);
                  setLogsOffset(0);
                }}
              />
            </div>

            <Sheet open={openFilter} onOpenChange={setOpenFilter}>
              <SheetTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  style={{
                    color: "var(--brand-text)",
                    borderColor: "var(--brand-line)",
                  }}
                >
                  <FilterIcon className="mr-2 h-4 w-4" />
                  {t("visitantes.filters") || "Filtros"}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-full max-w-md h-full sm:h-auto"
              >
                <SheetHeader>
                  <SheetTitle>
                    {t("visitantes.filters") || "Filtros"}
                  </SheetTitle>
                </SheetHeader>

                <form className="mt-6 space-y-5" onSubmit={onSubmitFilters}>
                  <div className="space-y-2">
                    <Label>{t("visitantes.client") || "Cliente*"}</Label>
                    <Select
                      value={filters.client}
                      onValueChange={(v) =>
                        setFilters((s) => ({ ...s, client: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            t("visitantes.selectClient") ||
                            "Selecciona un cliente"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {clientDisplayName(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>
                      {t("visitantes.site") || "Puesto de seguridad*"}
                    </Label>
                    <Select
                      value={filters.site}
                      onValueChange={(v) =>
                        setFilters((s) => ({ ...s, site: v }))
                      }
                      disabled={postSitesForFilter.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            t("visitantes.selectSite") || "Selecciona un sitio"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {postSitesForFilter.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.companyName ||
                              p.name ||
                              (p.company &&
                                (p.company.name || p.company.companyName)) ||
                              String(p.id)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("visitantes.guard") || "Vigilante"}</Label>
                    <Select
                      value={filters.guard}
                      onValueChange={(v) =>
                        setFilters((s) => ({ ...s, guard: v }))
                      }
                      disabled={guardsForFilter.length === 0}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            t("visitantes.selectGuard") ||
                            "Selecciona un vigilante"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {guardsForFilter.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.fullName || g.displayName || g.name || g.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {t("visitantes.placeTypeLabel", "Tipo de lugar")}
                    </Label>
                    <Input
                      value={filters.placeType}
                      onChange={(e) =>
                        setFilters((s) => ({ ...s, placeType: e.target.value }))
                      }
                      placeholder={
                        t("visitantes.placeTypeFilterPlaceholder") ||
                        "Ej: DEPARTAMENTO - 24"
                      }
                    />
                  </div>
                  {/*
                                    <div className="space-y-2">
                                        <Label>{t('visitantes.tagLabel', 'Etiqueta')}</Label>
                                        <Select
                                            value={filters.tag}
                                            onValueChange={(v) =>
                                                setFilters((s) => ({ ...s, tag: v }))
                                            }
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={t('visitantes.selectTag') || 'Selecciona una etiqueta'} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="vip">{t('visitantes.tag.vip') || 'VIP'}</SelectItem>
                                                <SelectItem value="proveedor">{t('visitantes.tag.provider') || 'Proveedor'}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>*/}
                  <div className="flex items-center gap-2 pt-2">
                    <Checkbox
                      id="archived"
                      checked={filters.archived}
                      onCheckedChange={(checked) =>
                        setFilters((s) => ({
                          ...s,
                          archived: Boolean(checked),
                        }))
                      }
                    />
                    <Label className="text-sm font-normal" htmlFor="archived">
                      {t("visitantes.showArchived") ||
                        "Mostrar datos archivados"}
                    </Label>
                  </div>

                  <Button type="submit" variant="brand" className="mt-4 w-full">
                    {t("visitantes.filterButton") || "Filtro"}
                  </Button>
                </form>
              </SheetContent>
            </Sheet>

            {/* Un icono de tres puntos sin rótulo no dice que ahí
                            se exporta; y de los tres formatos sólo ofrecía dos,
                            porque el de Excel se había quedado sin botón. */}
            <ExportMenu
              onExport={exportarBitacoras}
              onPrint={handlePrintSelected}
              label={t("visitantes.exportar", "Exportar")}
            />
          </Toolbar>

          <Section
            title={t("visitantes.bitacoras") || "Bitácoras"}
            icon={<Users />}
          >
            <div className="overflow-hidden rounded-xl border">
              {/* Desktop table (hidden on small screens) */}
              <div className="md:block hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] divide-y divide-border">
                    <thead
                      className="bg-muted/30 text-left text-sm"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      <tr>
                        <th className="cg-eyebrow px-2 py-2">
                          <Checkbox
                            checked={
                              logs.length > 0 &&
                              Object.keys(selectedLogs).length > 0 &&
                              logs.every((l) => selectedLogs[l.id])
                            }
                            onCheckedChange={(c) => selectAllLogs(Boolean(c))}
                          />
                        </th>
                        <th className="cg-eyebrow px-2 py-2">
                          {t("visitantes.logTable.firstName") || "Nombre"}
                        </th>
                        <th className="cg-eyebrow px-2 py-2">
                          {t("visitantes.logTable.lastName") || "Apellidos"}
                        </th>
                        <th className="cg-eyebrow px-2 py-2">
                          {t("visitantes.logTable.idNumber") || "ID"}
                        </th>
                        <th className="cg-eyebrow px-2 py-2">
                          {t("visitantes.logTable.client") || "Cliente"}
                        </th>
                        <th className="cg-eyebrow px-2 py-2">
                          {t("visitantes.logTable.postSite") ||
                            "Puesto de seguridad"}
                        </th>
                        <th className="cg-eyebrow px-2 py-2">
                          {t("visitantes.logTable.station") || "Estación"}
                        </th>
                        <th className="cg-eyebrow px-2 py-2">
                          {t("visitantes.logTable.date") || "Fecha"}
                        </th>
                        <th className="cg-eyebrow px-2 py-2">
                          {t("comun.estado")}
                        </th>
                        <th className="cg-eyebrow px-2 py-2 text-right" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {logsLoading ? (
                        <tr>
                          <td className="p-4" colSpan={10}>
                            <SkeletonCards count={4} />
                          </td>
                        </tr>
                      ) : logs.length === 0 ? (
                        <tr>
                          <td className="p-4" colSpan={10}>
                            <EmptyState
                              className="border-0"
                                                    description={t('ui.Visitors.ajustaLaBusquedaORegistra')}
                                                    icon={<Users />}
                                                    title={t('visitantes.noLogs') || 'No se encontraron registros de bitácoras'}
                            />
                          </td>
                        </tr>
                      ) : (
                        logs.map((r) => (
                          <tr
                            key={r.id}
                            className="text-sm cursor-pointer hover:bg-muted/40"
                            onClick={() => viewLog(r.id)}
                          >
                            <td
                              className="px-2 py-2.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Checkbox
                                checked={!!selectedLogs[r.id]}
                                onCheckedChange={() => toggleSelectLog(r.id)}
                              />
                            </td>
                            <td className="px-2 py-2.5 font-medium">
                              {r.firstName}
                            </td>
                            <td className="px-2 py-2.5">{r.lastName}</td>
                            <td className="px-2 py-2.5">{r.idNumber}</td>
                            <td className="px-2 py-2.5">
                              {getClientLabelFromRecord(r)}
                            </td>
                            <td className="px-2 py-2.5">
                              {r.postSite?.companyName ||
                                r.postSite?.name ||
                                r.postSiteName ||
                                "-"}
                            </td>
                            <td className="px-2 py-2.5">
                              {r.station?.stationName ||
                                r.station?.name ||
                                r.stationName ||
                                "-"}
                            </td>
                            <td className="px-2 py-2.5">
                              {formatDateTime(r.visitDate)}
                            </td>
                            <td className="px-2 py-2.5">
                              {salidaDe(r) ? (
                                <StatusBadge tone="neutral">
                                  {t("visitantes.logTable.exitTime") ||
                                    "Hora de salida"}
                                  : {formatDateTime(salidaDe(r))}
                                </StatusBadge>
                              ) : visitaVencida(r) ? (
                                <StatusBadge tone="warn">
                                  {t("comun.sinSalidaRegistrada")}
                                </StatusBadge>
                              ) : (
                                <StatusBadge dot={false} tone="ok">
                                  <span
                                    className="cc-dot"
                                    style={{ background: "var(--ok)" }}
                                  />
                                  {t("ui.Visitors.enCurso", "En curso")}
                                </StatusBadge>
                              )}
                            </td>
                            <td
                              className="px-2 py-3 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => viewLog(r.id)}
                                  >
                                    {t("actions.viewDetails") || "Ver detalles"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => markExit(r.id)}
                                    disabled={!!r.exitTime}
                                  >
                                    {t("visitantes.markExit") ||
                                      "Marcar salida"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => deleteLog(r.id)}
                                  >
                                    {t("actions.delete") || "Eliminar"}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile list (cards) visible on small screens */}
              <div className="md:hidden p-2 space-y-3">
                {logsLoading ? (
                  <SkeletonCards className="sm:grid-cols-1" count={3} />
                ) : logs.length === 0 ? (
                  <EmptyState
                    icon={<Users />}
                    title={
                      t("visitantes.noLogs") ||
                      "No se encontraron registros de bitácoras"
                    }
                    description={t("ui.Visitors.ajustaLaBusquedaORegistra")}
                  />
                ) : (
                  logs.map((r) => (
                    <div
                      key={r.id}
                      className="glass-flat flex cursor-pointer flex-col gap-2 p-3"
                      onClick={() => viewLog(r.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate text-base font-semibold">
                          {r.firstName} {r.lastName}
                        </div>
                        <div
                          className="shrink-0 text-xs"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {formatDateTime(r.visitDate)}
                        </div>
                      </div>
                      <div>
                        {salidaDe(r) ? (
                          <StatusBadge tone="neutral">
                            {t("visitantes.logTable.exitTime") ||
                              "Hora de salida"}
                            : {formatDateTime(salidaDe(r))}
                          </StatusBadge>
                        ) : visitaVencida(r) ? (
                          <StatusBadge tone="warn">
                            {t("comun.sinSalidaRegistrada")}
                          </StatusBadge>
                        ) : (
                          <StatusBadge dot={false} tone="ok">
                            <span
                              className="cc-dot"
                              style={{ background: "var(--ok)" }}
                            />
                            {t("ui.Visitors.enCurso", "En curso")}
                          </StatusBadge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Field
                          label={t("visitantes.logTable.idNumber") || "ID"}
                          value={r.idNumber || "-"}
                        />
                        <Field
                          label={t("visitantes.logTable.client") || "Cliente"}
                          value={getClientLabelFromRecord(r)}
                        />
                        <Field
                          label={
                            t("visitantes.logTable.postSite") ||
                            "Puesto de seguridad"
                          }
                          value={
                            r.postSite?.companyName ||
                            r.postSite?.name ||
                            r.postSiteName ||
                            "-"
                          }
                        />
                        <Field
                          label={t("visitantes.logTable.station") || "Estación"}
                          value={
                            r.station?.stationName ||
                            r.station?.name ||
                            r.stationName ||
                            "-"
                          }
                        />
                      </div>
                      <div
                        className="mt-2 flex items-center justify-end gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => viewLog(r.id)}
                        >
                          {t("actions.viewDetails") || "Ver"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => markExit(r.id)}
                          disabled={!!r.exitTime}
                        >
                          {t("visitantes.markExit") || "Salida"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteLog(r.id)}
                        >
                          {t("actions.delete") || "Eliminar"}
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <div className="flex items-center gap-3">
                <span className="text-sm" style={{ color: "var(--ink-soft)" }}>
                  {t("clients.pagination.itemsPerPage") ||
                    "Elementos por página"}
                </span>
                <select
                  className="cg-input cg-focus px-2 py-1 text-sm"
                  value={logsLimit}
                  onChange={(e) => {
                    setLogsLimit(Number(e.target.value));
                    setLogsOffset(0);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {t("guards.list.pagination.range", {
                    defaultValue: "{{start}} - {{end}} de {{total}}",
                    start: logsCount === 0 ? 0 : Math.min(logsOffset + 1, logsCount),
                    end:
                      logsCount === 0
                        ? 0
                        : Math.min(logsOffset + logsLimit, logsCount),
                    total: logsCount,
                  })}
                </div>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logsOffset === 0}
                    onClick={() =>
                      setLogsOffset(Math.max(0, logsOffset - logsLimit))
                    }
                  >
                    ◀
                  </Button>

                  <div className="text-sm text-muted-foreground">
                    {Math.floor(logsOffset / logsLimit) + 1} /{" "}
                    {Math.max(1, Math.ceil(logsCount / logsLimit))}
                  </div>

                  <Button
                    disabled={logsOffset + logsLimit >= logsCount}
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLogsOffset(
                        Math.min(
                          logsOffset + logsLimit,
                          (Math.ceil(logsCount / logsLimit) - 1) * logsLimit,
                        ),
                      )
                    }
                  >
                    ▶
                  </Button>
                </div>
              </div>
            </div>
          </Section>
        </PageContainer>
      </section>

      <Modal
        open={confirmDeleteOpen}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmDeleteOpen(false);
            setConfirmDeleteIds([]);
          }
        }}
        title={t("visitantes.confirmDeleteTitle") || "Confirmar eliminación"}
        icon={<Trash2 className="h-5 w-5" />}
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmDeleteOpen(false);
                setConfirmDeleteIds([]);
              }}
            >
              {t("actions.cancel") || "Cancelar"}
            </Button>
            <Button variant="destructive" onClick={performDeleteConfirmed}>
              {t("actions.delete") || "Eliminar"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t("visitantes.confirmDeleteMessage") ||
            `¿Estás seguro de que deseas eliminar ${confirmDeleteIds.length} registro(s)? Esta acción no se puede deshacer.`}
        </p>
      </Modal>
      <>
        <Sheet open={viewLogOpen} onOpenChange={setViewLogOpen}>
          <SheetContent
            side="right"
            className="w-full max-w-lg h-full sm:h-auto"
          >
            <SheetHeader>
              <SheetTitle>
                {t("visitantes.logDetails") || "Detalles del registro"}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              {!selectedLog ? (
                <SkeletonCards className="sm:grid-cols-1" count={2} />
              ) : (
                <>
                  <div>
                    {salidaDe(selectedLog) ? (
                      <StatusBadge tone="neutral">
                        {t("visitantes.logTable.exitTime") || "Hora de salida"}:{" "}
                        {formatDateTime(salidaDe(selectedLog))}
                      </StatusBadge>
                    ) : visitaVencida(selectedLog) ? (
                      <StatusBadge tone="warn">
                        {t("comun.sinSalidaRegistrada")}
                      </StatusBadge>
                    ) : (
                      <StatusBadge dot={false} tone="ok">
                        <span
                          className="cc-dot"
                          style={{ background: "var(--ok)" }}
                        />{" "}
                        {t("comun.dentroDeLasInstalaciones")}{" "}
                      </StatusBadge>
                    )}
                  </div>
                  <div className="glass-sunken grid grid-cols-2 gap-4 p-4">
                    <Field
                      label={t("visitantes.logTable.date") || "Fecha"}
                      value={formatDateTime(selectedLog.visitDate)}
                    />
                    <Field
                      label={
                        t("visitantes.logTable.exitTime") || "Hora de salida"
                      }
                      value={formatDateTime(salidaDe(selectedLog))}
                    />
                    <Field
                      label={t("visitantes.logTable.firstName") || "Nombre"}
                      value={selectedLog.firstName || "-"}
                    />
                    <Field
                      label={t("visitantes.logTable.lastName") || "Apellidos"}
                      value={selectedLog.lastName || "-"}
                    />
                    <Field
                      label={t("visitantes.logTable.idNumber") || "ID"}
                      value={selectedLog.idNumber || "-"}
                    />
                    <Field
                      label={
                        t("visitantes.logTable.numPeople") ||
                        "Número de personas"
                      }
                      value={
                        selectedLog.numPeople ||
                        selectedLog.peopleCount ||
                        selectedLog.numberPeople ||
                        "-"
                      }
                    />
                    <Field
                      label={t("visitantes.logTable.client") || "Cliente"}
                      value={getClientLabelFromRecord(selectedLog)}
                    />
                    <Field
                      label={
                        t("visitantes.logTable.postSite") ||
                        "Puesto de seguridad"
                      }
                      value={getPostSiteLabelFromRecord(selectedLog)}
                    />
                    <Field
                      label={t("visitantes.logTable.station") || "Estación"}
                      value={
                        selectedLog.station?.stationName ||
                        selectedLog.station?.name ||
                        selectedLog.stationName ||
                        "-"
                      }
                    />
                    <Field
                      label={
                        t("visitantes.logTable.placeType") || "Tipo de lugar"
                      }
                      value={selectedLog.placeType || "-"}
                    />
                  </div>
                  <div>
                    <div className="cg-eyebrow mb-1">
                      {t("visitantes.logTable.reason") || "Motivo"}
                    </div>
                    <p
                      className="whitespace-pre-line text-sm"
                      style={{ color: "var(--ink)" }}
                    >
                      {selectedLog.reason || selectedLog.visitReason || "-"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>

        <Sheet open={openAddVisitor} onOpenChange={setOpenAddVisitor}>
          <SheetContent
            side="right"
            className="w-full max-w-xl h-full sm:h-auto"
          >
            <SheetHeader className="mb-4">
              <SheetTitle>
                {t("visitantes.newVisitor") || "Nuevo Visitante"}
              </SheetTitle>
            </SheetHeader>

            <form className="space-y-4" onSubmit={onSubmitVisitor}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.client") || "Cliente"}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </Label>
                  <Select
                    value={newVisitor.client}
                    onValueChange={(v) =>
                      setNewVisitor((s) => ({ ...s, client: v }))
                    }
                    aria-required="true"
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          t("visitantes.selectClient") ||
                          "Selecciona un cliente"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {clientDisplayName(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.site") || "Puesto de seguridad"}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </Label>
                  <Select
                    aria-required="true"
                                disabled={postSitesForNewVisitor.length === 0}
                                value={newVisitor.site}
                                onValueChange={(v) =>
                                    setNewVisitor((s) => ({ ...s, site: v }))
                                }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          t("visitantes.selectSite") || "Selecciona un sitio"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {postSitesForNewVisitor.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.companyName || p.name || p.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("visitantes.station") || "Estación"}</Label>
                  <Select
                    disabled={stationsForNewVisitor.length === 0}
                                value={newVisitor.station}
                                onValueChange={(v) => setNewVisitor((s) => ({ ...s, station: v, guard: '' }))}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          t("visitantes.selectStation") ||
                          "Selecciona una estación"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {stationsForNewVisitor.map((st) => (
                        <SelectItem key={st.id} value={st.id}>
                          {st.stationName || st.name || st.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.guard") || "Vigilante"}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </Label>
                  <Select
                    aria-required="true"
                                disabled={!newVisitor.station || guardsForNewVisitor.length === 0}
                                value={newVisitor.guard}
                                onValueChange={(v) =>
                                    setNewVisitor((s) => ({ ...s, guard: v }))
                                }
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          t("visitantes.selectGuard") ||
                          "Selecciona un vigilante"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {guardsForNewVisitor.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.fullName || g.displayName || g.name || g.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Sin esto, una estación recién creada dejaba al operador
                      encallado: el desplegable salía vacío y apagado, y al
                      guardar sólo decía «Completa los campos obligatorios:
                      Vigilante», sin explicar que no hay a quién elegir. */}
                  {newVisitor.station && guardsForNewVisitor.length === 0 && (
                    <p
                      className="text-xs leading-snug"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {t(
                        "visitantes.sinVigilantesEnEstacion",
                        "Esta estación todavía no tiene vigilantes asignados. Asígnale uno desde la ficha del puesto para poder registrar la visita.",
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.placeTypeSelect") || "Tipo de lugar"}
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={newVisitor.placeTypeKind}
                      onValueChange={(v) =>
                        setNewVisitor((s) => ({ ...s, placeTypeKind: v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            t("visitantes.placeTypeSelect") || "Selecciona tipo"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Casa">
                          {t("visitantes.placeType.house") || "Casa"}
                        </SelectItem>
                        <SelectItem value="Departamento">
                          {t("visitantes.placeType.apartment") ||
                            "Departamento"}
                        </SelectItem>
                        <SelectItem value="Oficina">
                          {t("visitantes.placeType.office") || "Oficina"}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      value={newVisitor.placeTypeValue}
                      onChange={(e) =>
                        setNewVisitor((s) => ({
                          ...s,
                          placeTypeValue: e.target.value,
                        }))
                      }
                      placeholder={
                        t("visitantes.placeTypeValue") || "Nro/Detalle (24)"
                      }
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.form.name") || "Nombre"}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </Label>
                  <Input
                    required
                                placeholder={t('visitantes.placeholder.name') || 'Nombre'}
                                value={newVisitor.firstName}
                                onChange={(e) =>
                                    setNewVisitor((s) => ({ ...s, firstName: e.target.value }))
                                }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.form.lastName") || "Apellidos"}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </Label>
                  <Input
                    required
                                placeholder={t('visitantes.placeholder.lastName') || 'Apellidos'}
                                value={newVisitor.lastName}
                                onChange={(e) =>
                                    setNewVisitor((s) => ({ ...s, lastName: e.target.value }))
                                }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.form.idNumber") ||
                      "Número de identificación"}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </Label>
                  <Input
                    required
                                placeholder={t('visitantes.placeholder.idNumber') || 'e.g. 12015550123'}
                                value={newVisitor.idNumber}
                                onChange={(e) =>
                                    setNewVisitor((s) => ({ ...s, idNumber: e.target.value }))
                                }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.form.idImage") || "Imagen del ID"}
                  </Label>
                  <Input
                    type="file"
                    onChange={(e) => {
                      const f =
                        e.target.files && e.target.files.length
                          ? e.target.files[0]
                          : null;
                      setIdImageFile(f);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.form.mobile") || "Número de Móvil"}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </Label>
                  <Input
                    required
                                placeholder={t('visitantes.placeholder.mobile') || 'e.g. +12015550123'}
                                value={newVisitor.mobile}
                                onChange={(e) =>
                                    setNewVisitor((s) => ({ ...s, mobile: e.target.value }))
                                }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>
                    {t("visitantes.form.numPeople") || "Número de personas"}
                    <span style={{ color: "var(--bad-text)" }}>*</span>
                  </Label>
                  <Input
                    required
                                min={1}
                                placeholder={t('visitantes.placeholder.numPeople') || '1'}
                                type="number"
                                value={newVisitor.numPeople ?? ''}
                                onChange={(e) =>
                                    setNewVisitor((s) => ({ ...s, numPeople: e.target.value ? Number(e.target.value) : undefined }))
                                }
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label>{t("visitantes.form.reason") || "Motivo"}</Label>
                  <textarea
                    className="cg-input cg-focus w-full px-3 py-2 text-sm"
                                placeholder={t('visitantes.placeholder.reason') || 'Motivo de la visita'}
                                rows={3}
                                value={newVisitor.reason ?? ''}
                                onChange={(e) =>
                                    setNewVisitor((s) => ({ ...s, reason: e.target.value }))
                                }
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" variant="brand">
                  {t("visitantes.save") || "Guardar"}
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>
      </>
    </AppLayout>
  );
}
