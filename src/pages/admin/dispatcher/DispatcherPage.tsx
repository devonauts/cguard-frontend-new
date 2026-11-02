import { loadXlsx } from "../../../lib/lazyXlsx";
import {
  useMemo,
  useState,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { clientDisplayName } from "@/lib/clientName";
import { getStoredTenantBranding } from "@/lib/tenantBranding";
import { Link, useNavigate } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";

import {
  EllipsisVertical,
  Filter as FilterIcon,
  FileDown,
  FileSpreadsheet,
  Printer,
  Mail,
  Search,
  Eye,
  Tag,
  Archive,
  ExternalLink,
  Link as LinkIcon,
  Edit,
  X,
  Trash,
  Siren,
  FileText,
} from "lucide-react";
import {
  PageContainer,
  PageHeader,
  EmptyState,
  StatusBadge,
  Toolbar,
  SkeletonCards,
} from "@/components/kit";
import { toast } from "sonner";

// Validaciones (zod) y tipos
import {
  dispatcherFiltersSchema,
  type DispatcherFilters,
  defaultDispatcherFilters,
} from "@/lib/validators/dispatcher-filters";
import { clientService } from "@/lib/api/clientService";
import { postSiteService } from "@/lib/api/postSiteService";
import { ApiService } from "@/services/api/apiService";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "react-i18next";
import api from "@/lib/api";
import type { DispatchRow, DirectoryOption, DispatchApiError } from "./types";
import { localeActual } from "@/lib/localeActual";
import { hoyEnLaEmpresa, limitesDelDia, zonaDeLaEmpresa} from "@/lib/horaDeLaEmpresa";
import { resolveApiBase } from "@/lib/apiBase";
import i18n from "@/i18n";
import { callerTypeLabel } from "@/components/despacho/dispatchLabels";

// The list is paginated client-side over what we load. The backend hard-caps a
// no-limit /request query at 1000 rows, which silently truncated tenants past
// that. Request the backend's max (5000) explicitly so the practical ceiling is
// 5× higher — well beyond any real open-ticket volume. (A tenant approaching
// this would warrant true server-side pagination.)
const DISPATCH_FETCH_LIMIT = 5000;

/** Asunto por defecto del envío de despachos, con el nombre de LA empresa en sesión. */
function asuntoPorDefecto(): string {
  const empresa = getStoredTenantBranding().name;
  return empresa
    ? i18n.t("ui.DispatcherPage.asuntoDespachosEmpresa", {
        defaultValue: "Despachos | {{empresa}}",
        empresa,
      })
    : i18n.t("ui.DispatcherPage.despachos", "Despachos");
}

export default function DispatcherPage() {
  const { t } = useTranslation();
  const resolveServerMessage = (msg: unknown) => {
    if (!msg) return null;
    const s = String(msg);
    const translated = t(s);
    return translated && translated !== s ? translated : s;
  };
  const [openFilter, setOpenFilter] = useState(false);
  const navigate = useNavigate();

  // Estado local de filtros (validado con zod al aplicar)
  const [filters, setFilters] = useState<DispatcherFilters>(
    // default to show only 'abierto' tickets in the dispatcher view
    { ...defaultDispatcherFilters, status: "abierto" },
  );

  // Tabla: datos cargados desde backend
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [clients, setClients] = useState<DirectoryOption[]>([]);
  const [postSites, setPostSites] = useState<DirectoryOption[]>([]);
  const [stations, setStations] = useState<DirectoryOption[]>([]);
  const [stationFilter, setStationFilter] = useState("");
  const stationInputRef = useRef<HTMLInputElement | null>(null);
  const [allClients, setAllClients] = useState<DirectoryOption[] | null>(null);
  const [allPostSites, setAllPostSites] = useState<DirectoryOption[] | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [forbiddenRead, setForbiddenRead] = useState(false);
  const [forbiddenMessage, setForbiddenMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Shared monotonic guard across ALL row-loading paths (initial load, apply
  // filters, clear filters, search, refresh). Each captures a ticket before its
  // await and only applies its result if still the latest — so a slow filter
  // response can't clobber a newer search's rows, and vice-versa.
  const loadSeqRef = useRef(0);
  // Share modal state
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareTargetId, setShareTargetId] = useState<string | null>(null);
  const [shareExpiry, setShareExpiry] = useState<"1h" | "24h" | "7d" | "never">(
    "24h",
  );
  const [shareLoading, setShareLoading] = useState(false);
  const shareDialogRef = useRef<HTMLDivElement | null>(null);

  // Action select state so we can reset after use
  const [actionSelectValue, setActionSelectValue] = useState<string>("");

  // Send-email dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [emailFormat, setEmailFormat] = useState<"pdf" | "xlsx">("pdf");
  // El REMITENTE ya no lo elige el navegador: lo pone el servidor con la
  // identidad de la empresa (nombre visible + dirección verificada). Lo que
  // queda editable es a dónde van las RESPUESTAS, que sí se puede cambiar sin
  // romper la autenticación del correo.
  const [emailReplyTo, setEmailReplyTo] = useState("");
  const [emailTo, setEmailTo] = useState("");
  // El asunto por defecto llevaba pegado el nombre de OTRA empresa
  // («Seguridad BAS»), así que cada tenant mandaba despachos rotulados con un
  // cliente que no era el suyo. Sale del nombre real de la empresa en sesión.
  const [emailSubject, setEmailSubject] = useState(() => asuntoPorDefecto());
  const [emailMessage, setEmailMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  // Resolve the backend origin from VITE_API_URL. In production (non-DEV) builds we
  // do NOT fall back to a hardcoded localhost origin to avoid pointing prod at a dev host.
  const getApiOrigin = (): string | null => {
    try {
      const configured = resolveApiBase();
      if (configured) return configured.replace(/\/$/, "");
    } catch (e) {
      /* ignore */
    }
    return import.meta.env.DEV ? "http://localhost:3001" : null;
  };

  // Single place to read the bearer token (JWT in localStorage is XSS-exfiltratable;
  // centralizing keeps these raw-fetch paths consistent with the rest of the app).
  const getAuthHeaders = (): Record<string, string> => {
    const token =
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("authToken") ||
      localStorage.getItem("idToken");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // close share dialog when clicking outside its content
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("requestCreate");

  useEffect(() => {
    if (!shareDialogOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        shareDialogRef.current &&
        !shareDialogRef.current.contains(e.target as Node)
      ) {
        setShareDialogOpen(false);
        setShareTargetId(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [shareDialogOpen]);

  useEffect(() => {
    // options (clients/postSites) will be derived from loaded `rows`

    const loadRows = async () => {
      const mine = ++loadSeqRef.current;
      setLoading(true);
      try {
        const tenantId = localStorage.getItem("tenantId");
        if (!tenantId) return;
        const api = (await import("@/lib/api")).default;
        // Send status filter when present (skip 'todo' which means all)
        let url = `/tenant/${tenantId}/request`;
        if (
          filters &&
          filters.status &&
          String(filters.status).toLowerCase() !== "todo"
        ) {
          url += `?status=${encodeURIComponent(String(filters.status))}`;
        }
        url += `${url.includes("?") ? "&" : "?"}limit=${DISPATCH_FETCH_LIMIT}`;
        const resp = await api.get(url);
        if (mine !== loadSeqRef.current) return; // superseded
        const payload = resp && resp.data ? resp.data : resp;

        let rowsData: DispatchRow[] = [];
        let count = 0;

        if (payload && Array.isArray(payload.rows)) {
          rowsData = payload.rows;
        } else if (Array.isArray(payload)) {
          rowsData = payload;
        }
        // Client-side pagination: total must match the rows we actually hold,
        // otherwise Next would advance past the loaded slice (count from API can
        // exceed the returned page).
        count = rowsData.length;

        setRows(rowsData);
        setTotalCount(count);
      } catch (e) {
        if (mine !== loadSeqRef.current) return;
        console.error("Error cargando Incidentes:", e);
        // detect 403 forbidden and surface a friendly UI state
        const err = e as DispatchApiError;
        const status =
          err?.status ||
          err?.response?.status ||
          err?.data?.status ||
          err?.statusCode;
        if (status === 403) {
          setForbiddenRead(true);
          const serverMsg = err?.response?.data?.message || err?.message;
          setForbiddenMessage(serverMsg || null);
          try {
            toast.error(
              serverMsg
                ? resolveServerMessage(serverMsg)
                : t("dispatcher.noPermissionViewToast"),
            );
          } catch (err) {}
        } else {
          setRows([]);
          setTotalCount(0);
        }
      } finally {
        if (mine === loadSeqRef.current) setLoading(false);
      }
    };

    loadRows();
  }, []);

  // Clear the search debounce on unmount so its callback can't setState after
  // the page is gone.
  useEffect(
    () => () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    },
    [],
  );

  // Fetch all requests once (no status) to derive full list of clients/sites
  useEffect(() => {
    const loadAllOptions = async () => {
      // Prefer fetching full lists from dedicated services (client/postSite) for completeness.
      try {
        const [clientsResp, sitesResp] = await Promise.all([
          clientService.getClients(undefined, { limit: 1000, offset: 0 }),
          postSiteService.list({}, { limit: 1000, offset: 0 }),
        ]);

        const clientRows = (clientsResp as { rows?: DirectoryOption[] })?.rows;
        const siteRows = (sitesResp as { rows?: DirectoryOption[] })?.rows;
        if (clientsResp && Array.isArray(clientRows)) {
          setAllClients(clientRows);
        }
        if (sitesResp && Array.isArray(siteRows)) {
          setAllPostSites(siteRows);
        }

        return;
      } catch (e) {
        console.warn(
          "No se pudieron obtener clientes/sitios desde servicios (fallback a requests):",
          e,
        );
        // fallback to deriving from all requests
      }

      try {
        const tenantId = localStorage.getItem("tenantId");
        if (!tenantId) return;
        const api = (await import("@/lib/api")).default;
        const resp = await api.get(`/tenant/${tenantId}/request`);
        const payload = resp && resp.data ? resp.data : resp;

        let rowsData: DispatchRow[] = [];
        if (payload && Array.isArray(payload.rows)) {
          rowsData = payload.rows;
        } else if (Array.isArray(payload)) {
          rowsData = payload;
        }

        const clientMap = new Map<string, { id: string; name: string }>();
        const siteMap = new Map<string, { id: string; name: string }>();

        for (const r of rowsData) {
          let cid: string | undefined;
          let cname: string | undefined;
          if (r.client && typeof r.client === "object") {
            cid = r.client.id || r.client.clientId || r.clientId;
            cname = clientDisplayName(r.client, "") || undefined;
          } else if (r.clientId) {
            cid = String(r.clientId);
            cname = r.client || undefined;
          } else if (r.client) {
            cid = String(r.client);
            cname = String(r.client);
          }

          if (cid) clientMap.set(cid, { id: cid, name: cname || cid });

          let sid: string | undefined;
          let sname: string | undefined;
          if (r.site && typeof r.site === "object") {
            sid = r.site.id || r.site.siteId || r.siteId;
            sname = r.site.name || r.site.companyName || r.site.address;
          } else if (r.siteId) {
            sid = String(r.siteId);
            sname = r.site || undefined;
          } else if (r.site) {
            sid = String(r.site);
            sname = String(r.site);
          }

          if (sid) siteMap.set(sid, { id: sid, name: sname || sid });
        }

        setAllClients(Array.from(clientMap.values()));
        setAllPostSites(Array.from(siteMap.values()));
      } catch (e) {
        console.error("Error cargando todas las opciones de request:", e);
        setAllClients([]);
        setAllPostSites([]);
      }
    };

    loadAllOptions();
  }, []);

  // Derive distinct clients and post sites from the loaded requests
  useEffect(() => {
    try {
      const clientMap = new Map<string, { id: string; name: string }>();
      const siteMap = new Map<string, { id: string; name: string }>();

      for (const r of rows || []) {
        // client id/name can be in multiple shapes
        let cid: string | undefined;
        let cname: string | undefined;
        if (r.client && typeof r.client === "object") {
          cid = r.client.id || r.client.clientId || r.clientId;
          cname = r.client.name || r.client.fullName || r.client.displayName;
        } else if (r.clientId) {
          cid = String(r.clientId);
          cname = r.client || undefined;
        } else if (r.client) {
          cid = String(r.client);
          cname = String(r.client);
        }

        if (cid) {
          clientMap.set(cid, { id: cid, name: cname || cid });
        }

        // site
        let sid: string | undefined;
        let sname: string | undefined;
        if (r.site && typeof r.site === "object") {
          sid = r.site.id || r.site.siteId || r.siteId;
          sname = r.site.name || r.site.companyName || r.site.address;
        } else if (r.siteId) {
          sid = String(r.siteId);
          sname = r.site || undefined;
        } else if (r.site) {
          sid = String(r.site);
          sname = String(r.site);
        }

        if (sid) {
          siteMap.set(sid, { id: sid, name: sname || sid });
        }
      }

      setClients(Array.from(clientMap.values()));
      setPostSites(Array.from(siteMap.values()));
    } catch (e) {
      console.error("Error deriving clients/sites from requests", e);
      setClients([]);
      setPostSites([]);
    }
  }, [rows]);

  // Post sites to display depend on selected client. Prefer full list when available.
  const displayedPostSites = useMemo(() => {
    const list =
      (allPostSites && allPostSites.length > 0 ? allPostSites : postSites) ||
      [];
    // Until a client is selected, do not show any post sites
    if (!filters || !filters.clientId) return [];
    const cid = String(filters.clientId);
    return list.filter((s: DirectoryOption) => {
      if (!s) return false;
      // support various shapes: s.clientId, s.client?.id, s.client?.clientId
      if (s.clientId && String(s.clientId) === cid) return true;
      if (s.client && typeof s.client === "object") {
        if (s.client.id && String(s.client.id) === cid) return true;
        if (s.client.clientId && String(s.client.clientId) === cid) return true;
      }
      // also allow if site has a clientAccount or clientAccountId
      if (
        (s.clientAccountId && String(s.clientAccountId) === cid) ||
        (s.clientAccount &&
          s.clientAccount.id &&
          String(s.clientAccount.id) === cid)
      )
        return true;
      return false;
    });
  }, [allPostSites, postSites, filters]);

  // Load stations whenever the selected site in filters changes
  useEffect(() => {
    try {
      const sid = filters.siteId;
      fetchStationsFor(sid);
      // clear station filter when site changes
      setFilters((s) => ({ ...s, stationId: undefined }));
    } catch (e) {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.siteId]);

  // Apply filters by fetching rows according to current `filters`
  const aplicarFiltros = async (filtersParam?: DispatcherFilters) => {
    const usedFilters = filtersParam ?? filters;
    // Validate with zod but allow fetching even when validation fails (log and warn)
    const parse = dispatcherFiltersSchema.safeParse(usedFilters);
    if (!parse.success) {
      console.error("Errores de validación:", parse.error.flatten());
    }

    setOpenFilter(false);
    const mine = ++loadSeqRef.current;
    setLoading(true);
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) return;
      const api = (await import("@/lib/api")).default;

      const params = new URLSearchParams();
      // status as top-level param (backend expects ?status=... as used elsewhere)
      if (
        usedFilters &&
        usedFilters.status &&
        String(usedFilters.status).toLowerCase() !== "todo"
      ) {
        params.append("status", String(usedFilters.status));
      }
      if (usedFilters && usedFilters.clientId) {
        params.append("filter[clientId]", String(usedFilters.clientId));
      }
      if (usedFilters && usedFilters.siteId) {
        params.append("filter[siteId]", String(usedFilters.siteId));
      }
      if (filters && filters.stationId) {
        params.append("filter[stationId]", String(filters.stationId));
      }
      // single-date filters -> convert to ranges backend expects
      if (filters && filters.createdDate) {
        try {
          const d = filters.createdDate;
          // El día del filtro es el día del PUESTO, no el del portátil de quien
          // filtra: con `new Date()` estas cotas salían en la zona del
          // dispositivo y el «lunes» de una empresa mexicana empezaba el
          // domingo para quien mirara desde Madrid.
          const { start, end } = limitesDelDia(d);
          // append twice so backend receives an array: filter[createdAtRange]=start&filter[createdAtRange]=end
          params.append("filter[createdAtRange][]", start);
          params.append("filter[createdAtRange][]", end);
        } catch (e) {
          console.warn("Invalid createdDate format", filters.createdDate);
        }
      }

      if (filters && filters.incidentDate) {
        try {
          const d = filters.incidentDate;
          // El día del filtro es el día del PUESTO, no el del portátil de quien
          // filtra: con `new Date()` estas cotas salían en la zona del
          // dispositivo y el «lunes» de una empresa mexicana empezaba el
          // domingo para quien mirara desde Madrid.
          const { start, end } = limitesDelDia(d);
          // append twice so backend receives an array: filter[dateTimeRange]=start&filter[dateTimeRange]=end
          params.append("filter[dateTimeRange][]", start);
          params.append("filter[dateTimeRange][]", end);
        } catch (e) {
          console.warn("Invalid incidentDate format", filters.incidentDate);
        }
      }

      params.append("limit", String(DISPATCH_FETCH_LIMIT));
      let url = `/tenant/${tenantId}/request`;
      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const resp = await api.get(url);
      if (mine !== loadSeqRef.current) return; // superseded
      const payload = resp && resp.data ? resp.data : resp;

      let rowsData: DispatchRow[] = [];
      let count = 0;

      if (payload && Array.isArray(payload.rows)) {
        rowsData = payload.rows;
      } else if (Array.isArray(payload)) {
        rowsData = payload;
      }
      // Client-side pagination: total derives from loaded rows (see loadRows).
      count = rowsData.length;

      setRows(rowsData);
      setTotalCount(count);
      setPage(1);
    } catch (err) {
      if (mine !== loadSeqRef.current) return;
      console.error("Error aplicando filtros:", err);
    } finally {
      if (mine === loadSeqRef.current) setLoading(false);
    }
  };

  // Load stations for a given post-site id when user selects a site in filters
  const fetchStationsFor = async (siteToLoad: string | undefined | null) => {
    try {
      if (!siteToLoad) {
        setStations([]);
        return;
      }
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) return;

      // Try preferred stations endpoint with postSite/postSiteId query
      try {
        const url = `/tenant/${tenantId}/stations?postSite=${encodeURIComponent(String(siteToLoad))}&postSiteId=${encodeURIComponent(String(siteToLoad))}&limit=999`;
        const res = await api.get(url, { toast: { silentError: true } });
        const body = res && (res.data ?? res);
        let rows: any[] = [];
        if (Array.isArray(body)) rows = body;
        else if (body && Array.isArray(body.rows)) rows = body.rows;
        else if (body && Array.isArray(body.data)) rows = body.data;
        if (Array.isArray(rows) && rows.length) {
          // Defensive filter on the RAW station rows (they carry postSiteId) —
          // must run BEFORE mapping to {id,name}, or the reference is lost and the
          // filter becomes a no-op (kept every station regardless of site).
          const filtered = rows.filter((s: any) => {
            const pid =
              (s &&
                (s.postSiteId ||
                  s.post_site_id ||
                  (s.postSite && (s.postSite.id || s.postSite)) ||
                  s.post_site)) ||
              null;
            if (!pid) return true; // can't determine, keep
            return String(pid) === String(siteToLoad);
          });
          const source = filtered.length ? filtered : rows;
          const mapped = source.map((s: any) => ({
            id: s.id || s.stationId || s.uuid || s,
            name:
              s.name ||
              s.stationName ||
              s.displayName ||
              s.label ||
              s.address ||
              (s.postSite && (s.postSite.businessName || s.postSite.name)) ||
              String(s.id),
          }));
          setStations(mapped);
          return;
        }
      } catch (e) {
        // continue to nested endpoint
      }

      try {
        const res2 = await api.get(
          `/tenant/${tenantId}/post-site/${siteToLoad}/stations`,
          { toast: { silentError: true } },
        );
        const body2 = res2 && (res2.data ?? res2);
        let rows2: any[] = [];
        if (Array.isArray(body2)) rows2 = body2;
        else if (body2 && Array.isArray(body2.rows)) rows2 = body2.rows;
        else if (body2 && Array.isArray(body2.data)) rows2 = body2.data;
        const mapped2 = rows2.map((s: any) => ({
          id: s.id || s.stationId || s.uuid || s,
          name:
            s.name ||
            s.stationName ||
            s.displayName ||
            s.label ||
            s.address ||
            String(s.id),
        }));
        setStations(mapped2);
        return;
      } catch (e2) {
        // fallback
      }

      try {
        const res3 = await api.get(
          `/tenant/${tenantId}/stations?postSite=${encodeURIComponent(String(siteToLoad))}&postSiteId=${encodeURIComponent(String(siteToLoad))}`,
          { toast: { silentError: true } },
        );
        const body3 = res3 && (res3.data ?? res3);
        let rows3: any[] = [];
        if (Array.isArray(body3)) rows3 = body3;
        else if (body3 && Array.isArray(body3.rows)) rows3 = body3.rows;
        else if (body3 && Array.isArray(body3.data)) rows3 = body3.data;
        const mapped3 = rows3.map((s: any) => ({
          id: s.id || s.stationId || s.uuid || s,
          name:
            s.name ||
            s.stationName ||
            s.displayName ||
            s.label ||
            s.address ||
            String(s.id),
        }));
        setStations(mapped3);
        return;
      } catch (e3) {
        console.warn("Failed to load stations for post-site", siteToLoad, e3);
        setStations([]);
        return;
      }
    } catch (e) {
      console.error("Error loading stations", e);
      setStations([]);
      return;
    }
  };

  // Clear filters to defaults (keep default status 'abierto') and reload
  const clearFilters = async () => {
    const newFilters: DispatcherFilters = {
      ...defaultDispatcherFilters,
      status: "abierto",
    };
    setFilters(newFilters);
    const mine = ++loadSeqRef.current;
    setLoading(true);
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) return;
      const api = (await import("@/lib/api")).default;

      let url = `/tenant/${tenantId}/request`;
      if (
        newFilters &&
        newFilters.status &&
        String(newFilters.status).toLowerCase() !== "todo"
      ) {
        url += `?status=${encodeURIComponent(String(newFilters.status))}`;
      }
      url += `${url.includes("?") ? "&" : "?"}limit=${DISPATCH_FETCH_LIMIT}`;

      const resp = await api.get(url);
      if (mine !== loadSeqRef.current) return; // superseded
      const payload = resp && resp.data ? resp.data : resp;

      let rowsData: DispatchRow[] = [];
      let count = 0;

      if (payload && Array.isArray(payload.rows)) {
        rowsData = payload.rows;
      } else if (Array.isArray(payload)) {
        rowsData = payload;
      }
      // Client-side pagination: total derives from loaded rows (see loadRows).
      count = rowsData.length;

      setRows(rowsData);
      setTotalCount(count);
      setPage(1);
    } catch (err) {
      if (mine !== loadSeqRef.current) return;
      console.error("Error limpiando filtros:", err);
    } finally {
      if (mine === loadSeqRef.current) setLoading(false);
    }
  };

  // Keep selection valid when rows change (remove ids that no longer exist)
  useEffect(() => {
    if (!rows || !rows.length) {
      setSelectedIds([]);
      return;
    }

    setSelectedIds((prev) =>
      prev.filter((id) => rows.some((r) => r.id === id)),
    );
  }, [rows]);

  // remove automatic totalCount from rows; totalCount is set from API response

  const visibleRows = useMemo(() => {
    const start = (page - 1) * limit;
    return rows.slice(start, start + limit);
  }, [rows, page, limit]);

  // Helper to resolve a client's display name from various shapes
  const getClientDisplay = (r: DispatchRow) => {
    try {
      if (!r) return "-";
      // If client is an object with an explicit name, prefer that
      if (r.client && typeof r.client === "object") {
        return (
          r.client.name ||
          r.client.fullName ||
          r.client.displayName ||
          String(r.client.id || "-") ||
          "-"
        );
      }

      // Collect candidate client id strings from multiple possible fields
      const candidates: string[] = [];
      if (r.clientId) candidates.push(String(r.clientId));
      if (r.client && typeof r.client === "string")
        candidates.push(String(r.client));
      if (r.clientAccountId) candidates.push(String(r.clientAccountId));
      if (r.clientAccount && (r.clientAccount.id || r.clientAccount.clientId))
        candidates.push(String(r.clientAccount.id || r.clientAccount.clientId));

      // Also consider callerName or clientName fields that may already contain display name
      if (r.callerName && typeof r.callerName === "string") return r.callerName;
      if (r.clientName && typeof r.clientName === "string") return r.clientName;

      const list =
        (allClients && allClients.length > 0 ? allClients : clients) || [];
      for (const cid of candidates) {
        if (!cid) continue;
        const found = list.find((c: DirectoryOption) => {
          try {
            if (!c) return false;
            const keys = [
              c.id,
              c.clientId,
              c.clientAccountId,
              c.uuid,
              c._id,
              c.externalId,
              c.code,
            ];
            return keys.some(
              (k) => typeof k !== "undefined" && String(k) === String(cid),
            );
          } catch (e) {
            return false;
          }
        });
        if (found)
          return (
            found.name ||
            found.fullName ||
            found.displayName ||
            found.businessName ||
            String(found.id)
          );
      }

      // Fallbacks: use primitive client field if present, or display callerName
      if (r.client && typeof r.client === "string") return String(r.client);
      return "-";
    } catch (e) {
      return "-";
    }
  };

  // (Removed combined date-time range) separate created/incident dates used below

  const handleConfirmDelete = async () => {
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) return;
      setShowDeleteConfirm(false);

      const api = (await import("@/lib/api")).default;

      let lastSuccessMessage: string | null = null;
      let lastErrorMessage: string | null = null;
      try {
        const resp = await api.delete(`/tenant/${tenantId}/request`, {
          params: { ids: selectedIds },
        });
        const r = resp && resp.data ? resp.data : resp;
        if (r && r.message) lastSuccessMessage = String(r.message);
      } catch (err) {
        lastErrorMessage =
          (err as DispatchApiError)?.response?.data?.message ||
          (err as DispatchApiError)?.message ||
          null;
        console.error("Error deleting ids", selectedIds, err);
      }

      setSelectedIds([]);

      // Reload with the filters on screen (status, client, site, dates…) and
      // the same fetch limit: the old reload dropped them all, so the table no
      // longer matched what the filter bar said (QA-127).
      await aplicarFiltros();

      if (lastErrorMessage) {
        toast.error(
          resolveServerMessage(lastErrorMessage) ||
            t("dispatcher.deleted_error"),
        );
      } else if (lastSuccessMessage) {
        toast.success(
          resolveServerMessage(lastSuccessMessage) ||
            t("dispatcher.deleted_success"),
        );
      } else {
        toast.success(t("dispatcher.deleted_success"));
      }
    } catch (e) {
      console.error("Error eliminando Incidentes:", e);
      const msg =
        (e as DispatchApiError)?.response?.data?.message ||
        (e as DispatchApiError)?.message;
      toast.error(msg || t("dispatcher.deleted_error"));
    }
  };

  // Create share with selected expiration
  const handleCreateShare = async () => {
    if (!shareTargetId) return;
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        toast.error(t("dispatcher.tenantUnavailable"));
        return;
      }
      setShareLoading(true);

      const api = (await import("@/lib/api")).default;

      const now = Date.now();
      let expiresAt: string | null = null;
      if (shareExpiry === "1h")
        expiresAt = new Date(now + 1 * 60 * 60 * 1000).toISOString();
      else if (shareExpiry === "24h")
        expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
      else if (shareExpiry === "7d")
        expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
      else expiresAt = null;

      // backend pattern in this file uses { data: { ... } }
      // Some backends may expect expiresAt at root instead of inside `data`.
      // Send both to maximize compatibility so the value reaches the server/db.
      const payloadBody: { data: Record<string, string>; expiresAt?: string } =
        { data: {} };
      if (expiresAt) {
        payloadBody.data.expiresAt = expiresAt;
        payloadBody.expiresAt = expiresAt;
      }

      const resp = await api.post(
        `/tenant/${tenantId}/request/${shareTargetId}/share`,
        payloadBody,
      );
      const payload = resp && resp.data ? resp.data : resp;

      const url =
        payload && payload.token
          ? `${window.location.origin}/public/dispatch/${payload.token}`
          : payload && payload.url
            ? payload.url
            : null;

      // Prefer server-provided message when available
      if (url) {
        try {
          await navigator.clipboard.writeText(url);
        } catch (e) {}
        try {
          window.open(url, "_blank");
        } catch (e) {}
        if (payload && payload.message)
          toast.success(
            resolveServerMessage(payload.message) ||
              t("dispatcher.share_link_copied"),
          );
        else toast.success(t("dispatcher.share_link_copied"));
        setShareDialogOpen(false);
        setShareTargetId(null);
      } else {
        const serverMsg = payload && payload.message ? payload.message : null;
        toast.error(
          serverMsg
            ? resolveServerMessage(serverMsg)
            : t("dispatcher.share_link_failed"),
        );
      }
    } catch (err) {
      console.error(err);
      toast.error(t("dispatcher.share_error"));
    } finally {
      setShareLoading(false);
    }
  };

  // Export selected dispatches to Excel (.xlsx)
  const handleExportExcel = async () => {
    try {
      if (!selectedIds || selectedIds.length === 0) {
        toast.error(t("dispatcher.select_at_least_one_export"));
        return;
      }

      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        toast.error(t("dispatcher.tenantUnavailable"));
        return;
      }
      const api = (await import("@/lib/api")).default;

      /* UNA petición para toda la exportación.
         Antes se pedía el detalle de CADA solicitud —troceado de ocho en ocho—
         porque al listado le falta `internalNotes`, que es la columna «Notas».
         Con «seleccionar todo» sobre el tope del tablero eran 5.000 peticiones
         en 625 tandas encadenadas. El campo no se puede añadir al listado: ese
         mismo endpoint sirve a la app del vigilante y al portal del cliente, y
         las notas internas no son para ellos. Por eso hay un endpoint de
         exportación aparte, con autoridad de oficina (ver
         `api/request/requestExportRows.ts`). */
      const resp: any = await api.get(
        `/tenant/${tenantId}/request/export?ids=${selectedIds.map(encodeURIComponent).join(",")}`,
      );
      const cuerpo = resp?.data ?? resp;
      const records: any[] = cuerpo?.rows ?? [];

      const rows = records.map((r: any) => ({
        [t("dispatcher.client_name", "Cliente")]: getClientDisplay(r),
        [t("dispatcher.post_site", "Sede")]:
          r.site?.name ||
          r.site?.companyName ||
          (typeof r.site === "string" ? r.site : "") ||
          "",
        [t("dispatcher.caller_type", "Tipo de informador")]: callerTypeLabel(r.callerType),
        [t("dispatcher.caller_name", "Nombre del informante")]:
          r.callerName ||
          (r.guardName && (r.guardName.fullName || r.guardName.name)) ||
          "",
        [t("dispatcher.incident_type", "Tipo de incidente")]:
          (r.incidentType && (r.incidentType.name || r.incidentType)) ||
          r.incidentTypeId ||
          "",
        [t("dispatcher.incident_details", "Detalles del incidente")]: r.content || r.description || "",
        [t("dispatcher.incident_location", "Ubicación del incidente")]: r.location || "",
        [t("ui.DispatcherPage.notas", "Notas")]: r.internalNotes || r.notes || "",
        [t("ui.DispatcherPage.prioridad", "Prioridad")]: r.priority || "",
        [t("dispatcher.status", "Estado")]: r.status || "",
      }));

      // json_to_sheet defaults to starting at A1; avoid passing unsupported 'origin' option
      const XLSX = await loadXlsx();
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        ws,
        t("ui.DispatcherPage.incidentes", "Incidentes"),
      );

      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t("ui.DispatcherPage.incidentes", "Incidentes")}_${hoyEnLaEmpresa()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export Excel error", err);
      toast.error(t("dispatcher.export_excel_error"));
    }
  };

  // Print selected dispatches as PDF without opening a new window/tab
  const handlePrintSelected = async () => {
    try {
      if (!selectedIds || selectedIds.length === 0) {
        toast.error(t("dispatcher.select_at_least_one_print"));
        return;
      }

      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        toast.error(t("dispatcher.tenantUnavailable"));
        return;
      }

      // Determine backend origin from VITE_API_URL (no prod localhost fallback)
      const apiOrigin = getApiOrigin();
      if (!apiOrigin) {
        toast.error(t("dispatcher.pdf_generate_failed"));
        return;
      }

      const apiPrefix = apiOrigin.endsWith("/api") ? "" : "/api";
      const id = selectedIds[0];
      const idsParam = selectedIds.join(",");
      const url = `${apiOrigin}${apiPrefix}/tenant/${tenantId}/request/${id}/export/pdf?ids=${encodeURIComponent(idsParam)}`;

      const headers = getAuthHeaders();

      const resp = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => null);
        console.error("Export PDF failed", text || resp.statusText);
        toast.error(t("dispatcher.pdf_generate_failed"));
        return;
      }

      const contentType = resp.headers.get("content-type") || "";
      if (!contentType.includes("application/pdf")) {
        const text = await resp.text().catch(() => null);
        console.error("Expected PDF, got:", contentType, text);
        toast.error(t("dispatcher.pdf_invalid_response"));
        return;
      }

      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Create an off-screen iframe so the PDF can render, then call print()
      const iframe = document.createElement("iframe");
      // Use visibility + off-screen positioning so the PDF renderer has space to initialize
      iframe.style.visibility = "hidden";
      iframe.style.position = "fixed";
      iframe.style.left = "-10000px";
      iframe.style.top = "0";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.border = "0";
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      const cleanup = () => {
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch (_) {}
        try {
          URL.revokeObjectURL(blobUrl);
        } catch (_) {}
      };

      // Wait for load then give the PDF renderer a short moment before printing.
      // Some browsers need a delay for the PDF plugin to render; keep iframe for longer.
      iframe.onload = () => {
        // delay to allow rendering (500-800ms tends to work reliably)
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.error(
              "Print failed, opening blob in new tab as fallback",
              e,
            );
            try {
              window.open(blobUrl, "_blank");
            } catch (_) {}
          }
        }, 700);

        // Cleanup after a longer timeout to avoid closing the frame immediately
        setTimeout(cleanup, 15000);
      };
    } catch (err) {
      console.error("Print PDF error", err);
      toast.error(t("dispatcher.print_error"));
    }
  };

  // Open send-email dialog to collect details and send via backend
  const handleSendEmail = async () => {
    if (!selectedIds || selectedIds.length === 0) {
      toast.error(t("dispatcher.select_at_least_one_send"));
      return;
    }
    // Se propone el correo del propio operador como «responder a»: quien
    // conteste el despacho llega a quien lo mandó. Se puede borrar o cambiar.
    const suyo =
      localStorage.getItem("userEmail") || localStorage.getItem("email") || "";
    setEmailReplyTo(suyo);
    // default To empty
    setEmailTo("");
    setEmailSubject(asuntoPorDefecto());
    setEmailMessage("");
    setSendDialogOpen(true);
  };

  // Perform sending email using backend API
  const performSend = async () => {
    if (!selectedIds || selectedIds.length === 0) {
      toast.error(t("dispatcher.select_at_least_one_send"));
      return;
    }

    setSendingEmail(true);
    try {
      const tenantId = localStorage.getItem("tenantId");
      if (!tenantId) {
        toast.error(t("dispatcher.tenantUnavailable", "Tenant no disponible"));
        return;
      }

      const api = (await import("@/lib/api")).default;

      const toList = emailTo
        ? emailTo
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      const payload = {
        data: {
          ids: selectedIds,
          format: emailFormat,
          replyTo: emailReplyTo,
          to: toList,
          subject: emailSubject,
          message: emailMessage,
        },
      };

      const resp = await api.post(`/tenant/${tenantId}/request/email`, payload);
      const result = resp && resp.data ? resp.data : resp;
      if (result && result.message)
        toast.success(
          resolveServerMessage(result.message) || t("dispatcher.email_sent"),
        );
      else toast.success(t("dispatcher.email_sent"));
      setSendDialogOpen(false);
    } catch (err) {
      console.error("Error enviando correo:", err);
      const serverMsg =
        (err as DispatchApiError)?.response?.data?.message ||
        (err as DispatchApiError)?.message;
      toast.error(
        serverMsg
          ? resolveServerMessage(serverMsg)
          : t("dispatcher.email_send_error"),
      );
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <AppLayout>

      <PageContainer width="wide">
        <PageHeader
          icon={<Siren />}
          title={t("dispatcher.breadcrumbList")}
          subtitle={
            t(
              "dispatcher.subtitle",
              "Recibe, despacha y da seguimiento a los avisos de tus puestos",
            )
          }
        />
        {/* Acciones superiores */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Acción (izquierda) */}
          <div className="flex items-center gap-2">
            <Select
              value={actionSelectValue}
              onValueChange={(v) => {
                setActionSelectValue(v);
                if (v === "eliminar") {
                  if (!selectedIds || selectedIds.length === 0) {
                    // no items selected
                    toast.error(t("dispatcher.select_at_least_one_delete"));
                    // reset select after showing message
                    setActionSelectValue("");
                    return;
                  }
                  setShowDeleteConfirm(true);
                  // reset select so it returns to placeholder
                  setActionSelectValue("");
                  return;
                }
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t("dispatcher.actionPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eliminar">
                  {t("dispatcher.action_delete")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Derecha: buscador, nuevo, filtros, menú */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="w-full pl-9 sm:w-72"
                placeholder={t("dispatcher.searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchTerm(v);

                  // debounce search
                  if (searchTimeoutRef.current) {
                    clearTimeout(searchTimeoutRef.current);
                  }
                  searchTimeoutRef.current = setTimeout(async () => {
                    const mine = ++loadSeqRef.current;
                    try {
                      const tenantId = localStorage.getItem("tenantId");
                      if (!tenantId) return;
                      setLoading(true);
                      const api = (await import("@/lib/api")).default;

                      const params = new URLSearchParams();
                      // main query
                      if (v) params.append("query", String(v));
                      // include active filters so search respects them
                      if (
                        filters &&
                        filters.status &&
                        String(filters.status).toLowerCase() !== "todo"
                      ) {
                        params.append("status", String(filters.status));
                      }
                      if (filters && filters.clientId) {
                        params.append(
                          "filter[clientId]",
                          String(filters.clientId),
                        );
                      }
                      if (filters && filters.siteId) {
                        params.append("filter[siteId]", String(filters.siteId));
                      }

                      if (filters && filters.createdDate) {
                        try {
                          const d = filters.createdDate;
                          // El día del filtro es el día del PUESTO, no el del portátil de quien
                          // filtra: con `new Date()` estas cotas salían en la zona del
                          // dispositivo y el «lunes» de una empresa mexicana empezaba el
                          // domingo para quien mirara desde Madrid.
                          const { start, end } = limitesDelDia(d);
                          params.append("filter[createdAtRange][]", start);
                          params.append("filter[createdAtRange][]", end);
                        } catch (e) {
                          console.warn(
                            "Invalid createdDate format",
                            filters.createdDate,
                          );
                        }
                      }

                      if (filters && filters.incidentDate) {
                        try {
                          const d = filters.incidentDate;
                          // El día del filtro es el día del PUESTO, no el del portátil de quien
                          // filtra: con `new Date()` estas cotas salían en la zona del
                          // dispositivo y el «lunes» de una empresa mexicana empezaba el
                          // domingo para quien mirara desde Madrid.
                          const { start, end } = limitesDelDia(d);
                          params.append("filter[dateTimeRange][]", start);
                          params.append("filter[dateTimeRange][]", end);
                        } catch (e) {
                          console.warn(
                            "Invalid incidentDate format",
                            filters.incidentDate,
                          );
                        }
                      }

                      // archived
                      if (filters && filters.includeArchived) {
                        params.append("filter[archived]", "true");
                      }

                      params.append("limit", String(DISPATCH_FETCH_LIMIT));
                      let url = `/tenant/${tenantId}/request`;
                      const qs = params.toString();
                      if (qs) url += `?${qs}`;

                      const resp = await api.get(url);
                      if (mine !== loadSeqRef.current) return; // superseded
                      const payload = resp && resp.data ? resp.data : resp;

                      let rowsData: DispatchRow[] = [];
                      let count = 0;

                      if (payload && Array.isArray(payload.rows)) {
                        rowsData = payload.rows;
                      } else if (Array.isArray(payload)) {
                        rowsData = payload;
                      }
                      // Client-side pagination: total derives from loaded rows.
                      count = rowsData.length;

                      setRows(rowsData);
                      setTotalCount(count);
                      setPage(1);
                    } catch (err) {
                      if (mine !== loadSeqRef.current) return;
                      console.error("Error buscando Incidentes:", err);
                    } finally {
                      if (mine === loadSeqRef.current) setLoading(false);
                    }
                  }, 300);
                }}
              />
            </div>

            {canCreate ? (
              <Button variant="brand" asChild>
                <Link to="/dispatch-tickets/new">
                  {t("dispatcher.newDispatch")}
                </Link>
              </Button>
            ) : (
              <Button
                variant="brand"
                className="cursor-not-allowed"
                disabled
                onClick={() =>
                  toast.error(t("dispatcher.no_permission_create"))
                }
                title={t("dispatcher.no_permission_create")}
              >
                {t("dispatcher.newDispatch")}
              </Button>
            )}

            {/* Filtros */}
            <Sheet open={openFilter} onOpenChange={setOpenFilter}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  style={{
                    borderColor: "var(--brand-line)",
                    color: "var(--brand-text)",
                  }}
                >
                  <FilterIcon className="mr-2 h-4 w-4" />
                  {t("dispatcher.filters")}
                </Button>
              </SheetTrigger>

              <SheetContent
                side="right"
                className="w-full overflow-y-auto sm:w-[460px]"
              >
                <SheetHeader>
                  <SheetTitle>{t("dispatcher.filters")}</SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-5">
                  {/* Cliente */}
                  <div className="space-y-2">
                    <Label>{t("dispatcher.client")}</Label>
                    <Select
                      value={filters.clientId ?? ""}
                      onValueChange={(v) => {
                        const newFilters = {
                          ...filters,
                          clientId: v ? v : undefined,
                          siteId: undefined,
                        };
                        setFilters(newFilters);
                        void aplicarFiltros(newFilters);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("dispatcher.select_client")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Cargar clientes desde backend */}
                        {(allClients && allClients.length > 0
                          ? allClients
                          : clients
                        ).length > 0 ? (
                          (allClients && allClients.length > 0
                            ? allClients
                            : clients
                          ).map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {clientDisplayName(c, c.name)}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__no_clients" disabled>
                            {t("dispatcher.no_clients")}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Puesto de seguridad */}
                  <div className="space-y-2">
                    <Label>{t("dispatcher.post_site")}</Label>
                    <Select
                      value={filters.siteId ?? ""}
                      onValueChange={(v) => {
                        const newFilters = {
                          ...filters,
                          siteId: v,
                          stationId: undefined,
                        };
                        setFilters(newFilters);
                        void aplicarFiltros(newFilters);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("dispatcher.select_site")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {displayedPostSites && displayedPostSites.length > 0 ? (
                          displayedPostSites.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name ?? s.companyName ?? s.address ?? s.id}
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="__no_sites" disabled>
                            {t("dispatcher.no_sites")}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Estación (filtrado por puesto seleccionado) */}
                  <div className="space-y-2">
                    <Label>{t("dispatcher.station")}</Label>
                    <Select
                      value={filters.stationId ?? ""}
                      onValueChange={(v) =>
                        setFilters((s) => ({ ...s, stationId: v }))
                      }
                      onOpenChange={(open) => {
                        if (open)
                          setTimeout(
                            () => stationInputRef.current?.focus(),
                            50,
                          );
                        else setStationFilter("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            t("dispatcher.select_station") ||
                            "Seleccionar estación"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-2">
                          <Input
                            ref={(el) => {
                              stationInputRef.current = el;
                            }}
                            placeholder={
                              t("dispatcher.search_station") ||
                              "Buscar estación..."
                            }
                            value={stationFilter}
                            onChange={(e) => setStationFilter(e.target.value)}
                            disabled={!filters.siteId}
                          />
                        </div>
                        {stations && stations.length > 0 ? (
                          stations
                            .filter((s: DirectoryOption) =>
                              String(
                                s.name ||
                                  s.stationName ||
                                  s.businessName ||
                                  s.id ||
                                  "",
                              )
                                .toLowerCase()
                                .includes(stationFilter.trim().toLowerCase()),
                            )
                            .map((s: DirectoryOption) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name ||
                                  s.stationName ||
                                  s.businessName ||
                                  s.id}
                              </SelectItem>
                            ))
                        ) : (
                          <SelectItem
                            key="__no_stations"
                            value="__no_stations"
                            disabled
                          >
                            {filters.siteId
                              ? t("dispatcher.no_stations") || "Sin estaciones"
                              : t("dispatcher.select_site_first") ||
                                "Seleccione un puesto primero"}
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Estado */}
                  <div className="space-y-2">
                    <Label>{t("dispatcher.status")}</Label>
                    <Select
                      value={filters.status}
                      onValueChange={(v) =>
                        setFilters((s) => ({
                          ...s,
                          status: v as DispatcherFilters["status"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("dispatcher.status_all")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">
                          {t("dispatcher.status_all")}
                        </SelectItem>
                        <SelectItem value="abierto">
                          {t("dispatcher.status_open")}
                        </SelectItem>
                        <SelectItem value="cerrado">
                          {t("dispatcher.status_closed")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Fechas separadas: fecha de creación y fecha del incidente */}
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-2">
                      <Label>{t("dispatcher.created_date")}</Label>
                      <Input
                        type="date"
                        value={filters.createdDate ?? ""}
                        onChange={(e) =>
                          setFilters((s) => ({
                            ...s,
                            createdDate: e.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>{t("dispatcher.incident_date")}</Label>
                      <Input
                        type="date"
                        value={filters.incidentDate ?? ""}
                        onChange={(e) =>
                          setFilters((s) => ({
                            ...s,
                            incidentDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* Detail sheet component */}
                  {/* Detail page navigation: removed inline Sheet */}

                  {/* Archivados */}
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox
                      id="archived"
                      checked={filters.includeArchived}
                      onCheckedChange={(v) =>
                        setFilters((s) => ({
                          ...s,
                          includeArchived: Boolean(v),
                        }))
                      }
                    />
                    <Label htmlFor="archived" className="cursor-pointer">
                      {t("dispatcher.show_archived")}
                    </Label>
                  </div>

                  {/* Botón aplicar */}
                  {/* Las variantes del botón sacan relleno y tinta de `--brand`
                      / `--brand-ink`, que se recalculan solos al cambiar el
                      acento. Pintarlos con utilidades sueltas se salta esa
                      derivación y deja el borde y la sombra de cristal fuera. */}
                  <Button
                    variant="brand"
                    className="w-full"
                    onClick={() => void aplicarFiltros()}
                  >
                    {t("dispatcher.apply_filters")}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={clearFilters}
                  >
                    {t("dispatcher.clear_filters")}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Menú superior (exportar / imprimir / enviar) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("ui.Dispatcher.masAcciones", "Más acciones")}
                >
                  <EllipsisVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      // require exactly one selected id
                      if (!selectedIds || selectedIds.length === 0) {
                        toast.error(t("dispatcher.select_at_least_one_export"));
                        return;
                      }
                      // allow exporting multiple selected ids; backend will render one page per id
                      const id = selectedIds[0];
                      const idsParam = selectedIds.join(",");
                      const tenantId = localStorage.getItem("tenantId");
                      if (!tenantId) {
                        toast.error(t("dispatcher.tenantUnavailable"));
                        return;
                      }

                      // Determine backend origin from VITE_API_URL (no prod localhost fallback)
                      const apiOrigin = getApiOrigin();
                      if (!apiOrigin) {
                        toast.error(t("dispatcher.pdf_generate_failed"));
                        return;
                      }

                      // If `apiOrigin` already contains the `/api` prefix, avoid doubling it
                      const apiPrefix = apiOrigin.endsWith("/api")
                        ? ""
                        : "/api";
                      const url = `${apiOrigin}${apiPrefix}/tenant/${tenantId}/request/${id}/export/pdf?ids=${encodeURIComponent(idsParam)}`;

                      // Always fetch the PDF with credentials to ensure auth cookies or CORS credentials are sent.
                      // This avoids relying on `window.open(url)` which cannot attach Authorization headers.
                      const headers = getAuthHeaders();

                      const resp = await fetch(url, {
                        method: "GET",
                        credentials: "include",
                        headers,
                      });
                      if (!resp.ok) {
                        const text = await resp.text().catch(() => null);
                        console.error(
                          "Export PDF failed",
                          text || resp.statusText,
                        );
                        toast.error(t("dispatcher.pdf_generate_failed"));
                        return;
                      }

                      const contentType =
                        resp.headers.get("content-type") || "";
                      if (!contentType.includes("application/pdf")) {
                        const text = await resp.text().catch(() => null);
                        console.error("Expected PDF, got:", contentType, text);
                        toast.error(t("dispatcher.pdf_invalid_response"));
                        return;
                      }

                      const blob = await resp.blob();
                      const blobUrl = URL.createObjectURL(blob);
                      // open in new tab
                      window.open(blobUrl, "_blank");
                      // revoke after a delay
                      setTimeout(() => URL.revokeObjectURL(blobUrl), 60 * 1000);
                    } catch (err) {
                      console.error("Export PDF error", err);
                      toast.error(t("dispatcher.pdf_generate_failed"));
                    }
                  }}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {t("dispatcher.export_pdf")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportExcel}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  {t("dispatcher.export_excel")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrintSelected}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t("dispatcher.print")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleSendEmail}>
                  <Mail className="mr-2 h-4 w-4" />
                  {t("dispatcher.send_report_email")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tabla */}
        {forbiddenRead && (
          <div
            className="mb-4 rounded-xl border p-3 text-sm"
            style={{
              background: "color-mix(in oklab, var(--bad) 12%, transparent)",
              borderColor: "color-mix(in oklab, var(--bad) 30%, transparent)",
              color: "var(--bad-text)",
            }}
          >
            {forbiddenMessage
              ? resolveServerMessage(forbiddenMessage)
              : t("dispatcher.noPermissionViewBanner")}
          </div>
        )}
        <div className="mt-4 overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="cg-tabla-fichas w-full min-w-[1000px] border-collapse text-left text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b">
                  <th className="px-4 py-3">
                    <Checkbox
                      // Selects ALL filtered tickets (every loaded row), not just the
                      // current page — otherwise Export/Print silently ships only the
                      // ≤50 visible rows when the user believes they picked everything.
                      checked={
                        rows.length > 0 &&
                        rows.every((r) => selectedIds.includes(r.id))
                      }
                      onCheckedChange={(v) => {
                        const checked = Boolean(v);
                        if (checked) {
                          setSelectedIds((prev) => {
                            const ids = new Set(prev);
                            rows.forEach((r) => ids.add(r.id));
                            return Array.from(ids);
                          });
                        } else {
                          setSelectedIds((prev) =>
                            prev.filter((id) => !rows.some((r) => r.id === id)),
                          );
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("dispatcher.header_ticket_id")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("dispatcher.header_datetime")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("dispatcher.header_client")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("dispatcher.header_post_site")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("dispatcher.header_caller_type")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("dispatcher.header_incident_type")}
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    {t("dispatcher.header_status")}
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-4">
                      <SkeletonCards count={4} />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    {/* Antes había aquí una imagen «sin datos» servida desde un
                      dominio externo: si ese servidor no responde, la tabla
                      vacía se queda con un icono roto. El vacío lo dibuja el
                      sistema. */}
                    <td colSpan={9} className="py-10">
                      <EmptyState
                        icon={<FileText />}
                        title={t("dispatcher.no_results_title")}
                        description={t("dispatcher.no_results_subtitle")}
                        className="border-0"
                      />
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedIds.includes(r.id)}
                          onCheckedChange={(v) => {
                            const checked = Boolean(v);
                            setSelectedIds((prev) => {
                              if (checked) {
                                if (prev.includes(r.id)) return prev;
                                return [...prev, r.id];
                              }
                              return prev.filter((id) => id !== r.id);
                            });
                          }}
                        />
                      </td>
                      <td className="px-4 py-3" title={r.id} data-rotulo={t("dispatcher.header_ticket_id")}>
                        {r.id ? String(r.id).substring(0, 8) : "-"}
                      </td>
                      <td className="px-4 py-3" data-rotulo={t("dispatcher.header_datetime")}>
                        {(() => {
                          const dateValue = r.dateTime || r.incidentAt;
                          if (!dateValue) return "-";
                          const d = new Date(dateValue);
                          return isNaN(d.getTime()) ? "-" : d.toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() });
                        })()}
                      </td>
                      <td className="px-4 py-3" data-rotulo={t("dispatcher.header_client")} data-titulo>{getClientDisplay(r)}</td>
                      <td className="px-4 py-3" data-rotulo={t("dispatcher.header_post_site")}>
                        {r.site && typeof r.site === "object"
                          ? r.site.name ||
                            r.site.companyName ||
                            r.site.address ||
                            String(r.site.id || "")
                          : r.site || r.siteId || "-"}
                      </td>
                      <td className="px-4 py-3" data-rotulo={t("dispatcher.header_caller_type")}>
                        {callerTypeLabel(r.callerType) ||
                            r.guardName?.fullName ||
                            r.guardName?.name ||
                            "-"}
                      </td>
                      <td className="px-4 py-3" data-rotulo={t("dispatcher.header_incident_type")}>
                        {r.incidentType && typeof r.incidentType === "object"
                          ? r.incidentType.name || r.incidentType.id || "-"
                          : r.incidentType || r.incidentTypeId || "-"}
                      </td>
                      <td className="px-4 py-3" data-rotulo={t("dispatcher.header_status")}>
                        {(() => {
                          const s = (r.status || "").toString().toLowerCase();
                          if (s === "cerrado" || s === "closed") {
                            return (
                              <StatusBadge tone="ok">
                                {t("comun.cerrado")}
                              </StatusBadge>
                            );
                          }

                          if (s === "abierto" || s === "open") {
                            // Un despacho abierto es trabajo PENDIENTE, no un
                            // fallo. Iba en `--bad`, el mismo rojo que un
                            // pánico: si todo lo normal es rojo, el rojo deja
                            // de avisar de nada.
                            return (
                              <StatusBadge tone="warn">
                                {t("comun.abierto")}
                              </StatusBadge>
                            );
                          }

                          // Estado desconocido: píldora neutra con el valor tal cual.
                          return (
                            <StatusBadge tone="neutral" dot={false}>
                              {r.status || "-"}
                            </StatusBadge>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t(
                                "ui.Dispatcher.masAcciones",
                                "Más acciones",
                              )}
                            >
                              <EllipsisVertical className="h-5 w-5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem
                              onClick={() =>
                                navigate(`/dispatch-tickets/${r.id}`)
                              }
                            >
                              <div className="flex items-center w-full">
                                <Eye className="mr-2 h-4 w-4" />
                                {t("dispatcher.view_details")}
                              </div>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() =>
                                window.open(
                                  `${window.location.origin}/dispatch-tickets/${r.id}`,
                                  "_blank",
                                )
                              }
                            >
                              <div className="flex items-center">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                {t("dispatcher.open_new_tab")}
                              </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e: ReactMouseEvent) => {
                                // open modal to choose expiry before creating share
                                try {
                                  e?.preventDefault();
                                  e?.stopPropagation();
                                } catch (_) {}
                                setShareTargetId(r.id);
                                setShareExpiry("24h");
                                setShareDialogOpen(true);
                              }}
                            >
                              <div className="flex items-center">
                                <LinkIcon className="mr-2 h-4 w-4" />
                                {t("dispatcher.generate_share_link")}
                              </div>
                            </DropdownMenuItem>

                            <DropdownMenuItem>
                              <Link
                                to={`/dispatch-tickets/${r.id}/edit`}
                                className="flex items-center w-full"
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                {t("dispatcher.edit")}
                              </Link>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  const tenantId =
                                    localStorage.getItem("tenantId");
                                  if (!tenantId) return;
                                  const api = (await import("@/lib/api"))
                                    .default;
                                  // Use PATCH for partial updates so unspecified fields are not nulled
                                  await api.patch(
                                    `/tenant/${tenantId}/request/${r.id}`,
                                    { data: { status: "cerrado" } },
                                  );
                                  toast.success(t("dispatcher.ticket_closed"));

                                  // Refresh the page so the UI state and any other views update
                                  try {
                                    // small delay so the success toast is visible before reload
                                    setTimeout(
                                      () => window.location.reload(),
                                      400,
                                    );
                                  } catch (e) {
                                    console.warn("Reload failed:", e);
                                  }
                                } catch (err) {
                                  console.error("Error cerrando ticket:", err);
                                  toast.error(
                                    t("dispatcher.ticket_close_failed"),
                                  );
                                }
                              }}
                            >
                              <div className="flex items-center">
                                <X className="mr-2 h-4 w-4" />
                                {t("dispatcher.close_ticket")}
                              </div>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => {
                                // Reuse the shared delete modal: set the selected id and open the confirmation dialog
                                setSelectedIds([r.id]);
                                setShowDeleteConfirm(true);
                              }}
                            >
                              <div className="flex items-center">
                                <Trash className="mr-2 h-4 w-4" />
                                {t("dispatcher.action_delete_label")}
                              </div>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
                {/* Aquí mapear filas cuando haya datos */}
              </tbody>
            </table>
          </div>

          {/* Footer de tabla */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-foreground/70 bg-muted/30 border-x border-b rounded-b-lg">
            <div className="flex items-center gap-2">
              <span>{t("dispatcher.items_per_page")}</span>
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
              {/* Rows shown out of the total; «page – pages» read «1 – 1» for 9 rows. */}
              {t("ui.CatalogTable.rangoDeTotal", {
                defaultValue: "{{from}} – {{to}} de {{total}}",
                from: totalCount ? (page - 1) * limit + 1 : 0,
                to: Math.min(page * limit, totalCount),
                total: totalCount,
              })}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("dispatcher.prev")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * limit >= totalCount || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("dispatcher.next")}
              </Button>
            </div>
          </div>
        </div>
        {/* Delete confirmation dialog */}
        {/* Send email dialog */}
        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("dispatcher.send_report_title")}</DialogTitle>
              <DialogDescription>
                {t("dispatcher.send_report_desc")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-4">
              <div>
                <Label>{t("ui.DispatcherPage.formato", "Formato")}</Label>
                <Select
                  value={emailFormat}
                  onValueChange={(v) => setEmailFormat(v as "pdf" | "xlsx")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pdf">PDF</SelectItem>
                    <SelectItem value="xlsx">Excel</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>
                {t("ui.DispatcherPage.responderAOpcional", "Responder a (opcional)")}
              </Label>
                <Input
                  value={emailReplyTo}
                  onChange={(e) => setEmailReplyTo(e.target.value)}
                  placeholder={t("ui.DispatcherPage.porDefectoElCorreoDe")}
                />
              </div>

              <div>
                <Label>{t("ui.DispatcherPage.para")}</Label>
                <Input
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder={t(
                    "ui.DispatcherPage.correoEmpresaComSeparaVarios",
                  )}
                />
              </div>

              <div>
                <Label>{t("incidents.subject", "Asunto")}</Label>
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                />
              </div>

              <div>
                <Label>{t("ui.DispatcherPage.mensaje", "Mensaje")}</Label>
                <Textarea
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setSendDialogOpen(false)}
              >
                {t("dispatcher.cancel")}
              </Button>
              <Button
                variant="brand"
                onClick={performSend}
                disabled={sendingEmail}
              >
                {sendingEmail ? t("dispatcher.sending") : t("common.send")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share expiration dialog */}
        <AlertDialog
          open={shareDialogOpen}
          onOpenChange={(v) => {
            setShareDialogOpen(v);
            if (!v) setShareTargetId(null);
          }}
        >
          <AlertDialogContent>
            <div ref={shareDialogRef} onClick={(e) => e.stopPropagation()}>
              <AlertDialogHeader className="text-center">
                <AlertDialogTitle className="text-center text-lg font-semibold">
                  {t("dispatcher.generate_share_link", "Generar enlace compartible")}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-left">
                  {t(
                    "ui.DispatcherPage.seleccioneElPeriodoDeValidez",
                    'Seleccione el período de validez del enlace compartible. "Nunca" dejará el enlace sin expiración.',
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="mt-4 space-y-3 px-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="shareExpiry"
                    checked={shareExpiry === "1h"}
                    onChange={() => setShareExpiry("1h")}
                  />
                  <span>{t("ui.DispatcherPage.unaHora", "1 hora")}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="shareExpiry"
                    checked={shareExpiry === "24h"}
                    onChange={() => setShareExpiry("24h")}
                  />
                  <span>{t("ui.DocumentPackets.expiry24h", "24 horas")}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="shareExpiry"
                    checked={shareExpiry === "7d"}
                    onChange={() => setShareExpiry("7d")}
                  />
                  <span>{t("ui.Dispatcher.7Dias", "7 días")}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="shareExpiry"
                    checked={shareExpiry === "never"}
                    onChange={() => setShareExpiry("never")}
                  />
                  <span>{t("ui.DispatcherPage.nunca", "Nunca")}</span>
                </label>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  className="cg-btn-brand"
                  onClick={handleCreateShare}
                  disabled={shareLoading}
                >
                  {shareLoading
                    ? t("incidents.creating", "Creando...")
                    : t("ui.DispatcherPage.generarYCopiar", "Generar y copiar")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
        >
          <AlertDialogContent>
            <AlertDialogHeader className="text-center">
              <AlertDialogTitle className="text-center text-lg font-semibold">
                {t(
                  "ui.Dispatcher.confirmarEliminacion",
                  "Confirmar eliminación",
                )}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-left">
                {t("dispatcher.confirm_delete_desc", {
                  defaultValue:
                    "¿Estás seguro de eliminar {{count}} incidente(s)? Esta acción no se puede deshacer.",
                  count: selectedIds.length,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                className="cg-btn-bad"
                onClick={handleConfirmDelete}
              >
                {t("actions.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageContainer>
    </AppLayout>
  );
}
