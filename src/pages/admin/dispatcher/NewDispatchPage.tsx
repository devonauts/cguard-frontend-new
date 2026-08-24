import { useState, useEffect, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { clientDisplayName } from '@/lib/clientName';
import { Link, useNavigate, useLocation } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import {
  dispatchCreateSchema,
  type DispatchCreateSchema,
} from "@/lib/validators/dispatch-create.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, ClipboardPlus, Users, FileText, Paperclip, NotebookPen } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { PageContainer, PageHeader, Section, FadeIn } from "@/components/kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { clientService } from "@/lib/api/clientService";
import IncidentTypesService from "@/services/incident-types.service";
import api from "@/lib/api";
import { postSiteService } from "@/lib/api/postSiteService";
import { runOrQueue } from "@/lib/offline/offlineQueue";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import securityGuardService from '@/lib/api/securityGuardService';

// Datos cargados desde backend
// Se usan estados vacíos y se rellenan en useEffect
// Cada elemento tiene { id, name }


const prioridades = [
  { id: "alta", name: "Alta" },
  { id: "media", name: "Media" },
  { id: "baja", name: "Baja" },
];

const tiposLlamador = [
  { id: "cliente", name: "Cliente" },
  { id: "vigilante", name: "Vigilante" },
  { id: "supervisor", name: "Supervisor" },
];

type AssignedGuard = {
  id?: string | number | null;
  name?: string | null;
  // `raw` is the untouched backend guard row, probed via deep arbitrary paths
  // (e.g. raw.station?.id); it is genuinely dynamic so stays `any`.
  raw?: any;
  stationId?: string | number | null;
  stationIdCanonical?: string | number | null;
  stationName?: string | null;
  postSiteId?: string | number | null;
  guardId?: string | number | null;
  guardIdCanonical?: string | number | null;
  securityGuardId?: string | number | null;
  securityGuardRecordId?: string | number | null;
};

// tiposIncidente se carga desde backend en el estado `tiposIncidente`

export default function NewDispatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [attachments, setAttachments] = useState<File[]>([]);
  const [clientes, setClientes] = useState<Array<{ id: string; name: string }>>([]);
  const [sitios, setSitios] = useState<Array<{
    businessName: string; id: string; name: string 
}>>([]);
  const [stations, setStations] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [stationFilter, setStationFilter] = useState("");
  const stationInputRef = useRef<HTMLInputElement | null>(null);
  const [callerNameEdited, setCallerNameEdited] = useState<boolean>(false);
  const [vigilantes, setVigilantes] = useState<Array<{ id: string; name: string }>>([]);
  const [assignedVigilantes, setAssignedVigilantes] = useState<AssignedGuard[]>([]);
  const [tiposIncidente, setTiposIncidente] = useState<Array<{ id: string; name: string }>>([]);
  const [clienteFilter, setClienteFilter] = useState("");
  const [sitioFilter, setSitioFilter] = useState("");
  const [guardFilter, setGuardFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const clienteInputRef = useRef<HTMLInputElement | null>(null);
  const sitioInputRef = useRef<HTMLInputElement | null>(null);
  const guardInputRef = useRef<HTMLInputElement | null>(null);
  const tipoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const incidentDateRef = useRef<HTMLInputElement | null>(null);
  const incidentTimeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // Cargar clientes
    (async () => {
      try {
        const clientsResp = await clientService.getClients({ active: true }, { limit: 100, offset: 0 });
        if (clientsResp && Array.isArray(clientsResp.rows)) {
          setClientes(
            clientsResp.rows.map((c: any) => {
              // El selector dice "Cliente": mostrar la empresa. Este bloque
              // priorizaba fullName/firstName+lastName, o sea el representante legal.
              const display = clientDisplayName(c, c.company || "Sin nombre");

              return { id: c.id, name: display };
            })
          );
        }
      } catch (e) {
        // silent: dejar el arreglo vacío si falla
        console.error("Error cargando clientes:", e);
      }
    })();

    // NOTA: la carga de `sitios` se hace cuando cambia el `clientId` seleccionado

    // Cargar vigilantes (securityGuard) — intentamos múltiples endpoints/formatos por compatibilidad
    (async () => {
      try {
        const tenantId = localStorage.getItem("tenantId");
        if (!tenantId) return;

        const tryPaths = [
          `/tenant/${tenantId}/security-guard?limit=100&offset=0`,
          `/tenant/${tenantId}/security-guards?limit=100&offset=0`,
          `/tenant/${tenantId}/securityGuard?limit=100&offset=0`,
          `/tenant/${tenantId}/securityGuards?limit=100&offset=0`,
          `/tenant/${tenantId}/user?limit=100&offset=0&role=guard`,
        ];

        let rows: any[] | undefined;
        for (const path of tryPaths) {
          try {
            const resp = await api.get(path, { toast: { silentError: true } });
            const body = resp.data ?? resp; // axios returns { data }
            // Log response for debugging guard list endpoints
            // eslint-disable-next-line no-console
            if (Array.isArray(body)) {
              rows = body;
            } else if (body && Array.isArray(body.rows)) {
              rows = body.rows;
            } else if (body && Array.isArray(body.data)) {
              rows = body.data;
            }
            if (rows && rows.length > 0) break;
          } catch (err) {
            // intentar siguiente path
            // eslint-disable-next-line no-console
          }
        }

        if (rows && Array.isArray(rows)) {
          const filtered = rows.filter((g: any) => {
            const gov = g.governmentId ?? g.government_id ?? g.user?.governmentId ?? g.user?.government_id;
            return gov && String(gov).toLowerCase() !== "pending";
          });
          setVigilantes(
            filtered.map((g: any) => {
              const display =
                g.fullName ||
                g.displayName ||
                g.name ||
                g.user?.fullName ||
                g.employeeName ||
                ((g.firstName || g.firstname || g.givenName || "") + " " + (g.lastName || g.lastname || g.surname || "")).trim() ||
                g.username ||
                g.email ||
                "Sin nombre";
              return { id: g.id || g.userId || g.guardId || g.uuid, name: display };
            })
          );
        } else {
          // No se encontraron vigilantes; limpiar
          setVigilantes([]);
        }
      } catch (e) {
        console.error("Error cargando vigilantes:", e);
        setVigilantes([]);
      }
    })();

    // Cargar tipos de incidente
    (async () => {
      try {
        const res = await IncidentTypesService.list("", 1, 100);
        if (res && Array.isArray(res.rows)) {
          setTiposIncidente(res.rows.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
        }
      } catch (e) {
        console.error("Error cargando tipos de incidente:", e);
      }
    })();
  }, []);

  // Determine if we were opened with a duplicate that includes a siteId (from Incidents)
  const dup = (location?.state as { duplicate?: { siteId?: string; postSiteId?: string; site?: string; stationId?: string } } | null)?.duplicate || null;
  const dupSiteId = dup ? (dup.siteId || dup.postSiteId || dup.site || null) : null;
  const isFromPostSite = Boolean(dupSiteId);

  const [prefillClientName, setPrefillClientName] = useState<string | null>(null);
  const [prefillSiteName, setPrefillSiteName] = useState<string | null>(null);

  const form = useForm<DispatchCreateSchema>({
    resolver: zodResolver(dispatchCreateSchema),
    defaultValues: {
      clientId: "",
      stationId: "",
      siteId: "",
      guardId: "",
      priority: "media",
      callerType: "",
      callerName: "",
      location: "",
      incidentType: "",
      incidentDate: "",
      incidentTime: "",
      incidentDetails: "",
      actionsTaken: "",
      internalNotes: "",
      attachment: undefined,
    },
    mode: "onBlur",
  });

  const watchedSiteId = useWatch({ control: form.control, name: "siteId" }) as string | undefined;
  const watchedClientId = useWatch({ control: form.control, name: "clientId" }) as string | undefined;

  // Debug flag: show assignedVigilantes in-page when URL contains ?debugGuards=1
  const debugGuards = typeof window !== "undefined" && window.location.search.indexOf("debugGuards=1") !== -1;

  // Helper to fetch stations for a given post-site id. Extracted so
  // other handlers (e.g. site selector onChange) can trigger it.
  const fetchStationsFor = async (siteToLoad: string | null) => {
    try {
      if (!siteToLoad) {
        setStations([]);
        setSelectedStationId(null);
        try { form.setValue('stationId', ''); } catch (e) { /* ignore */ }
        return;
      }
      const tenantId = localStorage.getItem('tenantId');
      if (!tenantId) return;

      // Preferred endpoint (singular 'station' with postSiteId filter)
      try {
        const res = await api.get(`/tenant/${tenantId}/station?postSiteId=${encodeURIComponent(String(siteToLoad))}&limit=999`, { toast: { silentError: true } });
        const body = res && (res.data ?? res);
        // eslint-disable-next-line no-console
        let rows: any[] = [];
        if (Array.isArray(body)) rows = body;
        else if (body && Array.isArray(body.rows)) rows = body.rows;
        else if (body && Array.isArray(body.data)) rows = body.data;
        // Prefer stations explicitly linked to this postSite. If none are linked, fall back to whatever the endpoint returned.
        const exactRows = (rows || []).filter((r: any) => {
          const link = r?.postSiteId || r?.post_site_id || r?.businessInfoId || r?.siteId || r?.site || r?.postSite || r?.business_info_id;
          return link && String(link) === String(siteToLoad);
        });
        // Debug: log counts to help diagnose stations appearing under wrong post-site
        // eslint-disable-next-line no-console
        if (!exactRows.length) {
          // No stations explicitly linked to this postSite in this response — try next fallback
          throw new Error('noExactRows');
        }
        const rowsToMap = exactRows;

        const mapped = (rowsToMap || []).map((s: any) => {
          const id = s?.id || s?.stationId || s || null;
          const name =
            s?.name ||
            s?.stationName ||
            s?.displayName ||
            s?.title ||
            s?.label ||
            s?.description ||
            s?.address ||
            (s?.location && (s.location.name || s.location.address)) ||
            (typeof s === 'string' ? s : (s && s.id) ? s.id : String(id));
          return { id, name };
        });
        setStations(mapped);
        if (dup && dup.stationId) {
          setSelectedStationId(dup.stationId);
          try { form.setValue('stationId', dup.stationId); } catch (e) { /* ignore */ }
        }
        return;
      } catch (err) {
        // try fallbacks below
      }

      try {
        const res2 = await api.get(`/tenant/${tenantId}/post-site/${siteToLoad}/stations`, { toast: { silentError: true } });
        const body2 = res2 && (res2.data ?? res2);
        let rows2: any[] = [];
        if (Array.isArray(body2)) rows2 = body2;
        else if (body2 && Array.isArray(body2.rows)) rows2 = body2.rows;
        else if (body2 && Array.isArray(body2.data)) rows2 = body2.data;
        const exactRows2 = (rows2 || []).filter((r: any) => {
          const link = r?.postSiteId || r?.post_site_id || r?.businessInfoId || r?.siteId || r?.site || r?.postSite || r?.business_info_id;
          return link && String(link) === String(siteToLoad);
        });
        // Debug: log counts for this fallback
        // eslint-disable-next-line no-console
        if (!exactRows2.length) {
          // No exact matches here — continue to next fallback
          throw new Error('noExactRows2');
        }
        const rows2ToMap = exactRows2;

        const mapped2 = (rows2ToMap || []).map((s: any) => {
          const id = s?.id || s?.stationId || s || null;
          const name =
            s?.name ||
            s?.stationName ||
            s?.displayName ||
            s?.title ||
            s?.label ||
            s?.description ||
            s?.address ||
            (s?.location && (s.location.name || s.location.address)) ||
            (typeof s === 'string' ? s : (s && s.id) ? s.id : String(id));
          return { id, name };
        });
        setStations(mapped2);
        if (dup && dup.stationId) {
          setSelectedStationId(dup.stationId);
          try { form.setValue('stationId', dup.stationId); } catch (e) { /* ignore */ }
        }
        return;
      } catch (err2) {
        // try another fallback
      }

      try {
        const res3 = await api.get(`/tenant/${tenantId}/stations?postSiteId=${encodeURIComponent(String(siteToLoad))}`, { toast: { silentError: true } });
        const body3 = res3 && (res3.data ?? res3);
        let rows3: any[] = [];
        if (Array.isArray(body3)) rows3 = body3;
        else if (body3 && Array.isArray(body3.rows)) rows3 = body3.rows;
        else if (body3 && Array.isArray(body3.data)) rows3 = body3.data;
        const exactRows3 = (rows3 || []).filter((r: any) => {
          const link = r?.postSiteId || r?.post_site_id || r?.businessInfoId || r?.siteId || r?.site || r?.postSite || r?.business_info_id;
          return link && String(link) === String(siteToLoad);
        });
        if (!exactRows3.length) {
          // No exact matches in final stations response
          throw new Error('noExactRows3');
        }
        const rows3ToMap = exactRows3;
        const mapped3 = (rows3ToMap || []).map((s: any) => {
          const id = s?.id || s?.stationId || s || null;
          const name =
            s?.name ||
            s?.stationName ||
            s?.displayName ||
            s?.title ||
            s?.label ||
            s?.description ||
            s?.address ||
            (s?.location && (s.location.name || s.location.address)) ||
            (typeof s === 'string' ? s : (s && s.id) ? s.id : String(id));
          return { id, name };
        });
        setStations(mapped3);
        // Debug: log final stations set
        // eslint-disable-next-line no-console
        if (dup && dup.stationId) {
          setSelectedStationId(dup.stationId);
          try { form.setValue('stationId', dup.stationId); } catch (e) { /* ignore */ }
        }
        return;
      } catch (err3) {
        console.warn('Fallback stations endpoints failed', err3);
        setStations([]);
      }
    } catch (e) {
      console.error('Error loading stations', e);
      setStations([]);
    }
  };

  useEffect(() => {
    const siteToLoad = dupSiteId || watchedSiteId;
    fetchStationsFor(siteToLoad ?? null);
  }, [dupSiteId, watchedSiteId, location]);

  // Load assigned guards for selected post-site (so we can filter by station)
  useEffect(() => {
    let mounted = true;
    const loadAssignedForSite = async () => {
      try {
        const siteToLoad = dupSiteId || watchedSiteId;
        const tenantId = localStorage.getItem('tenantId');
        if (!tenantId || !siteToLoad) {
          if (mounted) setAssignedVigilantes([]);
          return;
        }

        // If station is selected, try the precise POSTSITE+STATION endpoint first (returns canonical assigned guards)
        if (selectedStationId) {
          try {
            const resp = await api.get(`/tenant/${tenantId}/post-site/${siteToLoad}/station/${selectedStationId}/assigned-guards?activeOnly=1`, { toast: { silentError: true } });
            const body = resp && (resp.data ?? resp);
            let exactRows: any[] = [];
            if (Array.isArray(body)) exactRows = body;
            else if (body && Array.isArray(body.rows)) exactRows = body.rows;
            else if (body && Array.isArray(body.data)) exactRows = body.data;
            if (exactRows && exactRows.length) {
              const mappedExact = (exactRows || []).map((r: any) => {
                const display = r.fullName || r.guardName || r.displayName || r.name || (r.raw && (r.raw.guard && ((r.raw.guard.firstName || '') + ' ' + (r.raw.guard.lastName || '')).trim())) || 'Sin nombre';
                const id = r.id || r.guardUserId || r.securityGuardRecordId || r.tenantUserId || r.guardId || (r.raw && (r.raw.guardId || r.raw.id)) || null;
                const stationIdFromRow = r.stationId || r.stationIdCanonical || (r.raw && (r.raw.stationId || r.raw.station?.id)) || null;
                const stationNameFromRow = r.stationName || (r.raw && (r.raw.stationName || r.raw.station?.name)) || null;
                const postSiteIdFromRow = r.postSiteId || (r.raw && (r.raw.postSiteId || r.raw.post_site_id)) || null;
                return { id, name: display, raw: r, stationId: stationIdFromRow, stationName: stationNameFromRow, postSiteId: postSiteIdFromRow };
              }).filter((x:any) => x.id);
              if (mounted) setAssignedVigilantes(mappedExact);
              return;
            }
          } catch (err) {
            // ignore and continue with other fallbacks
          }
        }

        // Prefer the explicit assigned-guards endpoint for this post-site
        const preferredPaths = [
          `/tenant/${tenantId}/post-site/${siteToLoad}/assigned-guards`,
          `/tenant/${tenantId}/post-site/${siteToLoad}/guards`,
          `/tenant/${tenantId}/post-site/${siteToLoad}/security-guards`,
        ];

        let rows: any[] | undefined;

        const siteStrShort = String(siteToLoad);

        for (const path of preferredPaths) {
          try {
            const resp = await api.get(path, { toast: { silentError: true } });
            const body = resp && (resp.data ?? resp);
            // eslint-disable-next-line no-console
            if (Array.isArray(body)) rows = body;
            else if (body && Array.isArray(body.rows)) rows = body.rows;
            else if (body && Array.isArray(body.data)) rows = body.data;

            if (rows && rows.length) {
              // Keep only rows that are explicitly linked to this post-site (by id or by station linkage)
              const linked = (rows || []).filter((r: any) => {
                if (String(r.postSiteId || r.post_site_id || r.businessInfoId || r.siteId || r.site_id || r.postSite || r.site) === siteStrShort) return true;
                const candStation = r.stationId || r.station?.id || r.station_id || r.postSiteStationId || r.post_site_station_id || null;
                if (candStation) {
                  // If station linkage present, accept — we'll further filter against loaded stations later
                  return true;
                }
                return false;
              });

              if (linked && linked.length) {
                rows = linked;
                break;
              }
              // no linked rows in this response; continue to next fallback
              rows = undefined;
            }
          } catch (e) {
            // try next
            // eslint-disable-next-line no-console
          }
        }

        // Fallback to security-guard endpoint with postSiteId filter
        if ((!rows || !rows.length)) {
          try {
            const resp = await api.get(`/tenant/${tenantId}/security-guard?postSiteId=${encodeURIComponent(siteToLoad)}&limit=999`, { toast: { silentError: true } });
            const body = resp && (resp.data ?? resp);
            // eslint-disable-next-line no-console
            if (Array.isArray(body)) rows = body;
            else if (body && Array.isArray(body.rows)) rows = body.rows;
            else if (body && Array.isArray(body.data)) rows = body.data;
          } catch (e) {
            // ignore
            // eslint-disable-next-line no-console
          }
        }

        // If still no rows, try extracting guards from shift endpoints (some backends expose assignments via shifts)
        if ((!rows || !rows.length)) {
          try {
            const shiftPaths = [
              `/tenant/${tenantId}/post-site/${siteToLoad}/shifts`,
              `/tenant/${tenantId}/shift?postSiteId=${encodeURIComponent(siteToLoad)}&limit=999`,
              `/tenant/${tenantId}/shifts?postSiteId=${encodeURIComponent(siteToLoad)}&limit=999`,
            ];
            let shiftRows: any[] = [];
            for (const sp of shiftPaths) {
              try {
                const r = await api.get(sp, { toast: { silentError: true } });
                const b = r && (r.data ?? r);
                // eslint-disable-next-line no-console
                let sarr: any[] = [];
                if (Array.isArray(b)) sarr = b;
                else if (b && Array.isArray(b.rows)) sarr = b.rows;
                else if (b && Array.isArray(b.data)) sarr = b.data;
                if (sarr && sarr.length) {
                  shiftRows = sarr;
                  break;
                }
              } catch (err) {
                // try next shift path
                // eslint-disable-next-line no-console
              }
            }

            if (shiftRows && shiftRows.length) {
              const extracted: any[] = [];
              for (const sh of shiftRows) {
                const stationForShift = sh.stationId || sh.station?.id || sh.station_id || sh.postSiteStationId || sh.post_site_station_id || null;
                const postSiteForShift = sh.postSiteId || sh.post_site_id || sh.siteId || sh.site || siteToLoad;
                const cand = sh.assignedGuards || sh.guards || sh.securityGuards || sh.users || sh.assignees || sh.assignments;
                if (Array.isArray(cand)) {
                  for (const c of cand) {
                    let guardObj: any = null;
                    if (!c) continue;
                    // If c is a primitive id (string/number), resolve name from loaded guard list if possible
                    if (typeof c === 'string' || typeof c === 'number') {
                      const gid = String(c);
                      const found = (vigilantes || []).find((g) => String(g.id) === gid);
                      guardObj = { id: gid, name: found?.name || null, raw: c };
                    } else if (typeof c === 'object') {
                      const gid = c.id || c.userId || c.guardId || c.user?.id || null;
                      const found = gid ? (vigilantes || []).find((g) => String(g.id) === String(gid)) : null;
                      const display = c.fullName || c.displayName || c.name || c.user?.fullName || found?.name || null;
                      guardObj = { id: gid || null, name: display, raw: c };
                    }
                    if (guardObj) {
                      guardObj.postSiteId = postSiteForShift;
                      guardObj.stationId = stationForShift;
                      guardObj.rawShift = sh;
                      extracted.push(guardObj);
                    }
                  }
                } else if (sh.guard || sh.user || sh.guardId) {
                  const c = sh.guard || sh.user || sh.guardId;
                  let guardObj: any = null;
                  if (typeof c === 'string' || typeof c === 'number') {
                    const gid = String(c);
                    const found = (vigilantes || []).find((g) => String(g.id) === gid);
                    guardObj = { id: gid, name: found?.name || null, raw: c };
                  } else if (typeof c === 'object') {
                    const gid = c.id || c.userId || c.guardId || c.user?.id || null;
                    const found = gid ? (vigilantes || []).find((g) => String(g.id) === String(gid)) : null;
                    const display = c.fullName || c.displayName || c.name || c.user?.fullName || found?.name || null;
                    guardObj = { id: gid || null, name: display, raw: c };
                  }
                  if (guardObj) {
                    guardObj.postSiteId = postSiteForShift;
                    guardObj.stationId = stationForShift;
                    guardObj.rawShift = sh;
                    extracted.push(guardObj);
                  }
                }
              }
              if (extracted.length) {
                rows = extracted;
                // eslint-disable-next-line no-console
              }
            }
          } catch (e) {
            // ignore
          }
        }

        // eslint-disable-next-line no-console
        try {
          // Print full JSON for easier copy-paste debugging
          // eslint-disable-next-line no-console
          if ((rows || []).length) {
            // eslint-disable-next-line no-console
          }
        } catch (err) {
          // ignore stringify errors
        }
        if (!rows || !Array.isArray(rows) || rows.length === 0) {
          if (mounted) setAssignedVigilantes([]);
          return;
        }

        // If endpoint returned rows without explicit linkage (no postSiteId/stationId),
        // but we requested for a specific post-site, annotate them so frontend can treat
        // them as belonging to this post-site (common for legacy endpoints that only return guard records).
        try {
          const anyLinked = (rows || []).some((r: any) => {
            return Boolean(r.postSiteId || r.post_site_id || r.businessInfoId || r.siteId || r.site || r.stationId || r.station?.id || r.station_id || r.postSiteStationId || r.post_site_station_id);
          });
          if (!anyLinked && siteToLoad && (rows || []).length) {
            // annotate each row with the current post-site id
            rows = (rows || []).map((r: any) => ({ ...(r || {}), postSiteId: r.postSiteId || r.post_site_id || r.businessInfoId || r.siteId || r.site || siteToLoad }));
            // eslint-disable-next-line no-console
          }
        } catch (err) {
          // ignore
        }

        // Limit to guards that actually belong to this post-site or to stations of this post-site
        const siteStr = String(siteToLoad);
        const stationIdsForSite = new Set((stations || []).map((s) => String(s.id)));

        const filteredRows = rows.filter((r: any) => {
          // direct postSite linkage
          if (String(r.postSiteId || r.post_site_id || r.businessInfoId || r.siteId || r.site_id || r.postSite || r.site) === siteStr) return true;

          // station linkage (stationId or nested station.id)
          const candStation = r.stationId || r.station?.id || r.station_id || r.postSiteStationId || r.post_site_station_id || null;
          if (candStation && stationIdsForSite.has(String(candStation))) return true;

          // sometimes responses include stationName only — try to match by name among loaded stations
          const candStationName = (r.stationName || r.station?.stationName || r.station?.name || r.postSiteStationName || r.post_site_station_name || '').trim();
          if (candStationName) {
            const match = (stations || []).some((s) => String((s.name || '')).trim().toLowerCase() === String(candStationName).toLowerCase());
            if (match) return true;
          }

          return false;
        });

        const mapped = filteredRows.map((g: any) => {
          const display =
            g.fullName ||
            g.displayName ||
            g.name ||
            g.user?.fullName ||
            ((g.firstName || g.firstname || '') + ' ' + (g.lastName || g.lastname || '')).trim() ||
            g.username ||
            g.email ||
            'Sin nombre';
          const id = g.id || g.userId || g.guardId || g.uuid || g.securityGuardId || g.guard_user_id || g.user?.id || null;
          const stationIdFromRow = g.stationId || g.stationIdCanonical || g.station?.id || g.station_id || g.postSiteStationId || g.post_site_station_id || g.station?.stationId || g.rawShift?.stationId || (g.rawShift && g.rawShift.station && (g.rawShift.station.id || g.rawShift.station.stationId)) || null;
          const stationNameFromRow = (g.stationName || g.station?.stationName || g.station?.name || g.postSiteStationName || g.post_site_station_name || (g.rawShift && (g.rawShift.stationName || g.rawShift.station?.name)) || '').trim() || null;
          const postSiteIdFromRow = g.postSiteId || g.post_site_id || g.businessInfoId || g.siteId || g.site || (g.rawShift && (g.rawShift.postSiteId || g.rawShift.post_site_id)) || null;
          return { id, name: display, raw: g, stationId: stationIdFromRow, stationName: stationNameFromRow, postSiteId: postSiteIdFromRow };
        }).filter((x: any) => x.id);

        // Debug: show what rows we received, how we filtered them and the final mapped guards
        // eslint-disable-next-line no-console

        // If we found no station-matching guards but a station is selected, try station-scoped shift endpoints
        if ((!mapped || mapped.length === 0) && selectedStationId) {
          // First try canonical assigned-guards endpoint which should include station linkage
          try {
            const respCanon = await api.get(`/tenant/${tenantId}/post-site/${siteToLoad}/assigned-guards`, { toast: { silentError: true } });
            const bodyCanon = respCanon && (respCanon.data ?? respCanon);
            let canonRows: any[] = [];
            if (Array.isArray(bodyCanon)) canonRows = bodyCanon;
            else if (bodyCanon && Array.isArray(bodyCanon.rows)) canonRows = bodyCanon.rows;
            else if (bodyCanon && Array.isArray(bodyCanon.data)) canonRows = bodyCanon.data;
            // eslint-disable-next-line no-console
            if (canonRows && canonRows.length) {
              const mappedCanon = (canonRows || []).map((r: any) => ({ id: r.id || r.guardUserId || r.securityGuardRecordId || r.tenantUserId || r.guardId, name: r.fullName || r.guardName || r.displayName || r.name || (r.guard && `${r.guard.firstName || ''} ${r.guard.lastName || ''}`.trim()) || '', raw: r, stationId: r.stationId || r.stationIdCanonical || r.station?.id || r.station_id || null, stationName: r.stationName || r.station?.name || r.stationName, postSiteId: r.postSiteId || r.post_site_id || null })).filter((x:any) => x.id);
              const stationMatches = mappedCanon.filter((m:any) => String(m.stationId) === String(selectedStationId) || String(m.stationId || '').trim() === String(selectedStationId).trim());
              // eslint-disable-next-line no-console
              if (stationMatches && stationMatches.length) {
                if (mounted) setAssignedVigilantes(stationMatches);
                return;
              }
            }
          } catch (err) {
            // ignore canonical endpoint errors
            // eslint-disable-next-line no-console
          }

          // Next fallback: try station-scoped shift endpoints
          try {
            // Try fetching shifts by stationId which often include guard assignments
            const spResp = await api.get(`/tenant/${tenantId}/shift?stationId=${encodeURIComponent(String(selectedStationId))}&limit=999`, { toast: { silentError: true } });
            const spBody = spResp && (spResp.data ?? spResp);
            let spRows: any[] = [];
            if (Array.isArray(spBody)) spRows = spBody;
            else if (spBody && Array.isArray(spBody.rows)) spRows = spBody.rows;
            else if (spBody && Array.isArray(spBody.data)) spRows = spBody.data;
            // Extract guard objects from shifts
            const extracted: any[] = [];
            for (const sh of (spRows || [])) {
              const stationForShift = sh.stationId || sh.station?.id || sh.station_id || null;
              const postSiteForShift = sh.postSiteId || sh.post_site_id || sh.siteId || sh.site || siteToLoad;
              const cand = sh.assignedGuards || sh.guards || sh.securityGuards || sh.users || sh.assignees || sh.assignments;
              if (Array.isArray(cand)) {
                for (const c of cand) {
                  let guardObj: any = null;
                  if (!c) continue;
                  if (typeof c === 'string' || typeof c === 'number') {
                    const gid = String(c);
                    const found = (vigilantes || []).find((g) => String(g.id) === gid);
                    guardObj = { id: gid, name: found?.name || null, raw: c };
                  } else if (typeof c === 'object') {
                    const gid = c.id || c.userId || c.guardId || c.user?.id || null;
                    const found = gid ? (vigilantes || []).find((g) => String(g.id) === String(gid)) : null;
                    const display = c.fullName || c.displayName || c.name || c.user?.fullName || found?.name || null;
                    guardObj = { id: gid || null, name: display, raw: c };
                  }
                  if (guardObj) {
                    guardObj.postSiteId = postSiteForShift;
                    guardObj.stationId = stationForShift;
                    guardObj.rawShift = sh;
                    extracted.push(guardObj);
                  }
                }
              } else if (sh.guard || sh.user || sh.guardId) {
                const c = sh.guard || sh.user || sh.guardId;
                let guardObj: any = null;
                if (typeof c === 'string' || typeof c === 'number') {
                  const gid = String(c);
                  const found = (vigilantes || []).find((g) => String(g.id) === gid);
                  guardObj = { id: gid, name: found?.name || null, raw: c };
                } else if (typeof c === 'object') {
                  const gid = c.id || c.userId || c.guardId || c.user?.id || null;
                  const found = gid ? (vigilantes || []).find((g) => String(g.id) === String(gid)) : null;
                  const display = c.fullName || c.displayName || c.name || c.user?.fullName || found?.name || null;
                  guardObj = { id: gid || null, name: display, raw: c };
                }
                if (guardObj) {
                  guardObj.postSiteId = postSiteForShift;
                  guardObj.stationId = stationForShift;
                  guardObj.rawShift = sh;
                  extracted.push(guardObj);
                }
              }
            }
            if (extracted.length) {
              const mappedStation = extracted.map((g: any) => ({ id: g.id, name: g.name, raw: g, stationId: g.stationId, stationName: null, postSiteId: g.postSiteId })).filter((x: any) => x.id);
              // eslint-disable-next-line no-console
              if (mounted) setAssignedVigilantes(mappedStation);
              return;
            }
          } catch (err) {
            // ignore station-specific fallback errors
            // eslint-disable-next-line no-console
          }
        }

        if (mounted) setAssignedVigilantes(mapped);
      } catch (e) {
        if (mounted) setAssignedVigilantes([]);
      }
    };

    loadAssignedForSite();
    return () => { mounted = false; };
  }, [dupSiteId, watchedSiteId, stations, /* ensure guards reload when client changes */ watchedClientId, selectedStationId]);

  // If navigated with a duplicate state, prefill the form
  useEffect(() => {
    try {
      const dup = (location?.state as { duplicate?: unknown } | null)?.duplicate || null;
      if (!dup) return;

      const data: any = dup;

      let incidentDate = "";
      let incidentTime = "";
      const dateVal = data.incidentAt || data.dateTime || null;
      if (dateVal) {
        const d = new Date(dateVal);
        if (!isNaN(d.getTime())) {
          incidentDate = d.toISOString().slice(0, 10);
          // format HH:MM
          incidentTime = d.toTimeString().slice(0,5);
        }
      }

      const prefill: any = {
        clientId: data.clientId || data.clientId || "",
        siteId: data.siteId || "",
        guardId: data.guardId || data.guardName || "",
        priority: data.priority || "media",
        callerType: data.callerType || "",
        callerName: data.callerName || "",
        location: data.location || "",
        incidentType: data.incidentTypeId || data.incidentType || "",
        incidentDate,
        incidentTime,
        incidentDetails: data.content || data.incidentDetails || "",
        actionsTaken: data.action || "",
        internalNotes: data.internalNotes || "",
        subject: data.subject || "",
      };

      form.reset(prefill);
      // Reset manual-edit flag when we programmatically reset the form (dup prefill)
      try { setCallerNameEdited(false); } catch (e) { /* ignore */ }
      // If opened from a post-site context, fetch the post-site to populate names and client
      (async () => {
        try {
          const siteId = prefill.siteId || dupSiteId;
          if (!siteId) return;
          // fetch post-site details to show human-friendly names in readonly fields
          const ps = await postSiteService.get(String(siteId));
          const siteName = ps?.companyName || ps?.name || ps?.businessName || '';
          setPrefillSiteName(siteName || String(siteId));
          setSitios([{
            id: ps.id ?? "", name: siteName || ps.id || "",
            businessName: ""
          }]);

          const cid = ps?.clientId || (typeof ps?.client === "object" ? ps?.client?.id : ps?.client) || null;
          if (cid) {
            form.setValue('clientId', cid);
            // Ensure siteId is set on the form when opened from a post-site context
            try { form.setValue('siteId', String(siteId)); } catch (e) { /* ignore */ }
            try {
              const existing = clientes.find((c) => c.id === cid);
              if (existing) setPrefillClientName(existing.name);
              else {
                const cdata = await clientService.getClient(String(cid));
                const cname = cdata?.fullName || cdata?.company || cdata?.name || '';
                setPrefillClientName(cname || String(cid));
                setClientes((prev) => (prev || []).concat({ id: String(cid), name: cname || String(cid) }));
              }
            } catch (e) {
              // ignore client fetch errors
            }
          }

          // Ensure stations for that site are loaded
          try { await fetchStationsFor(siteId); } catch (e) { /* ignore */ }
        } catch (err) {
          // ignore
        }
      })();
      // fill sitios when clientId present (the useEffect watching watchedClientId will load sitios)
    } catch (err) {
      // ignore
    }
  }, [location]);

  // Watch selected clientId and load sitios (postSite) solo para ese cliente

  useEffect(() => {
    (async () => {
      try {
        if (!watchedClientId) {
          setSitios([]);
          // clear site and stations when client cleared
          try { form.setValue('siteId', ''); } catch (e) { /* ignore */ }
          setStations([]);
          return;
        }
        const resp = await postSiteService.list({ clientId: watchedClientId }, { limit: 100, offset: 0 });
        if (resp && Array.isArray(resp.rows)) {
          setSitios(
            resp.rows.map((s: any) => ({
              id: String(s.id ?? s.postSiteId ?? s.uuid ?? ""),
              name: s.name || s.businessName || s.companyName || s.address || "Sitio",
              businessName: s.businessName || s.companyName || s.name || s.address || "",
            }))
          );
        } else {
          setSitios([]);
        }
      } catch (e) {
        console.error("Error cargando sitios por cliente:", e);
        setSitios([]);
      }
    })();
  }, [watchedClientId]);


  // Auto-fill `callerName` when caller type or related selections change
  const watchedCallerType = useWatch({ control: form.control, name: "callerType" }) as string | undefined;
  const watchedGuardId = useWatch({ control: form.control, name: "guardId" }) as string | undefined;
  const { user } = useAuth();

  useEffect(() => {
    try {
      const ct = watchedCallerType;
      if (!ct) return;

      // If user manually edited callerName, do not overwrite it
      if (callerNameEdited) return;

      if (ct === 'vigilante') {
        if (watchedGuardId) {
          const id = String(watchedGuardId);
          // Prefer the global guard list, then assigned guards returned for the site/station
          const g = (vigilantes || []).find((x) => String(x.id) === id) || (assignedVigilantes || []).find((x) => String(x.id) === id);
          if (g && g.name) form.setValue('callerName', g.name);
        }
      } else if (ct === 'cliente') {
        if (watchedClientId) {
          const c = clientes.find((x) => String(x.id) === String(watchedClientId));
          if (c && c.name) form.setValue('callerName', c.name);
        }
      } else if (ct === 'supervisor') {
        const name = user?.fullName || user?.displayName || user?.name || (user?.firstName && user?.lastName ? `${user.firstName} ${user.lastName}` : null) || user?.email || '';
        if (name) form.setValue('callerName', name);
      }
    } catch (e) {
      // noop
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCallerType, watchedGuardId, watchedClientId, vigilantes, clientes, user, callerNameEdited, assignedVigilantes]);

  const onSubmit = async (data: DispatchCreateSchema) => {
    const incidentAt =
      data.incidentDate && data.incidentTime
        ? new Date(`${data.incidentDate}T${data.incidentTime}:00`).toISOString()
        : null;

    // Build explicit payload mapping form fields to backend field names
    const payload: Record<string, string | null> = {
      clientId: data.clientId || null,
      siteId: data.siteId || null,
      stationId: data.stationId || selectedStationId || null,
      guardId: data.guardId || null,
      priority: data.priority || null,
      // default to 'abierto' when creating a new dispatch
      status: 'abierto',
      callerType: data.callerType || null,
      callerName: data.callerName || null,
      location: data.location || null,
      incidentTypeId: data.incidentType || null,
      incidentAt,
      // Map textual fields to backend expected names
      content: data.incidentDetails || null,
      // `action` on backend is an enum (validated with isIn).
      // Do not send free-form text there to avoid validation errors.
      action: null,
      // Send `actionsTaken` as its own field and keep `internalNotes` separate.
      actionsTaken: data.actionsTaken || null,
      internalNotes: data.internalNotes || null,
      // Derive a subject if not provided
      subject:
        (data as DispatchCreateSchema & { subject?: string }).subject ||
        `${data.location || ''}${data.incidentDetails ? ' - ' + String(data.incidentDetails).slice(0, 80) : ''}`,
    };

    // Ensure we don't accidentally send File objects
    // (form has `attachment` but attachments are handled separately)
    // Log payload for debugging in DevTools / network
    // eslint-disable-next-line no-console

    try {
      const tenantId = localStorage.getItem('tenantId');
      if (!tenantId) {
        console.error('No tenantId found');
        return;
      }

      // Note: attachments are not uploaded in this flow. Send payload to `incident` endpoint
      // Normalize payload keys to backend expectations
      // Try to resolve selected guard to a securityGuard record id (guardNameId) when possible
      let resolvedGuardNameId: string | null = null;
      try {
        const sel = payload.guardId;
        if (sel) {
          const found = (assignedVigilantes || []).find((g) => String(g.id) === String(sel));
          if (found) {
            // Safely resolve candidate using optional chaining to avoid undefined errors
            const candidate =
              found?.securityGuardRecordId ??
              found?.securityGuardId ??
              found?.guardId ??
              found?.raw?.securityGuardRecordId ??
              found?.raw?.securityGuardId ??
              found?.raw?.guardNameId ??
              found?.raw?.guardName ??
              null;
            resolvedGuardNameId = candidate != null ? String(candidate) : null;
          }
        }
      } catch (e) {
        // ignore resolution errors
      }

      const incidentPayload = {
        ...payload,
        // Clave de idempotencia, generada UNA vez por envío: los reintentos de
        // la cola offline (y el caso "timeout pero sí llegó") repiten la misma
        // clave y el backend devuelve el incidente original en vez de duplicarlo.
        idempotencyKey: (globalThis.crypto as any)?.randomUUID?.() || `crm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        incidentType: payload.incidentTypeId || payload.incidentType || null,
        // send the security-guard record id expected by the backend as `guardNameId` when available
        guardNameId: resolvedGuardNameId || payload.guardId || payload.guardNameId || null,
        // still include guardId for compatibility (may be a user id)
        guardId: payload.guardId || null,
        postSiteId: payload.siteId || payload.postSiteId || null,
      };

      // Debug: log final payload that will be sent to the API
      // eslint-disable-next-line no-console

      // Sin red, el incidente NO se pierde: entra a la cola offline y sale solo
      // al reconectar (lib/offline). Un error DEL SERVIDOR (4xx/5xx) sigue
      // reventando abajo como siempre — eso significa que la petición SÍ llegó.
      const { queued, result: resp } = await runOrQueue(
        "incident.create",
        incidentPayload,
        () => api.post(`/tenant/${tenantId}/incident`, { data: incidentPayload }),
        "Incidente",
        // Los timeouts también se encolan: la clave de idempotencia de arriba
        // hace que el reintento sea inocuo aunque el primero SÍ hubiera llegado.
        { queueTimeouts: true },
      );
      if (queued) {
        toast.warning(
          attachments && attachments.length > 0
            ? "Sin conexión: el incidente quedó en cola y se enviará solo. Los adjuntos no viajan en la cola — agrégalos desde el detalle cuando vuelva la red."
            : "Sin conexión: el incidente quedó en cola y se enviará solo al reconectar.",
          { duration: 9000 },
        );
        setAttachments([]);
        navigate('/dispatch-tickets');
        return;
      }
      const created = (resp && (resp.data && (resp.data.data || resp.data)) ) || resp;

      // Show success toast
      toast.success('Incidente creado');

      // If frontend provided attachments, upload them to storage and create attachment metadata linked to the incident
      try {
        if (attachments && attachments.length > 0) {
          for (const f of attachments) {
            try {
              const uploaded = await securityGuardService.uploadFileToStorage(f, 'notesImages');
              const attPayload: Record<string, string | number | null> = {
                name: uploaded.name || f.name,
                mimeType: f.type || 'application/octet-stream',
                sizeInBytes: uploaded.sizeInBytes || f.size,
                storageId: 'notesImages',
                fileToken: uploaded.fileToken || null,
                publicUrl: uploaded.publicUrl || null,
                notableType: 'incident',
                notableId: created && (created.id || (created.data && created.data.id)) ? (created.id || created.data.id) : null,
              };

              if (attPayload.notableId) {
                await api.post(`/tenant/${tenantId}/attachments`, attPayload);
              }
            } catch (e) {
              console.warn('Failed to upload/create attachment for incident', e);
            }
          }
        }
      } catch (e) {
        console.warn('Unhandled error while processing incident attachments', e);
      }

      // Clear attachments and navigate back
      setAttachments([]);
      const targetSiteId = incidentPayload.postSiteId || payload.siteId || dupSiteId || null;
      if (targetSiteId) {
        navigate(`/post-sites/${targetSiteId}/incidents`);
      } else {
        navigate('/dispatch-tickets');
      }
    } catch (error) {
      console.error('Error creating request:', error);
      try {
        const msg = ((error as { message?: string } | null)?.message) || 'Error al crear Incidente';
        toast.error(msg);
      } catch (e) {
        toast.error('Error al crear Incidente');
      }
    }
  };

  // Compute guard options depending on selected station: prefer assigned guards filtered by station
  // If no station selected, show guards assigned to the current post-site (do not hide everything)
  const guardOptions = (() => {
    const sid = selectedStationId ? String(selectedStationId) : null;
    // Debug: overall state when computing options
    // eslint-disable-next-line no-console
    try {
      const stationNameForSid = (stations || []).find((s) => String(s.id) === sid)?.name || '';

      const byStation = (assignedVigilantes || []).filter((m) => {
        // Prefer direct mapped stationId on the mapped object
        if (m.stationId && String(m.stationId) === sid) return true;
        // Also consider backend-provided canonical station id
        if (m.stationIdCanonical && String(m.stationIdCanonical) === sid) return true;

        // Prefer direct mapped stationName equality
        if (m.stationName && stationNameForSid && String(m.stationName).trim().toLowerCase() === String(stationNameForSid).trim().toLowerCase()) return true;

        const r = m.raw || {};
        const candidateIds = [r.stationId, r.station?.id, r.station_id, r.postSiteStationId, r.post_site_station_id, r.station?.stationId];
        // include canonical ids from raw rows
        if (r.stationIdCanonical) candidateIds.push(r.stationIdCanonical);
        if (m.stationIdCanonical) candidateIds.push(m.stationIdCanonical);
        if (candidateIds.some((c: unknown) => c && String(c) === sid)) return true;

        // Match by station name if provided in the raw row
        const candStationName = (r.stationName || r.station?.stationName || r.station?.name || r.postSiteStationName || r.post_site_station_name || r.station?.stationName || '').trim();
        if (candStationName && stationNameForSid && candStationName.toLowerCase() === stationNameForSid.trim().toLowerCase()) return true;

        return false;
      }).map((m) => ({ id: m.id as string, name: m.name }));
      // Debug: inspect assignedVigilantes and matches
      // eslint-disable-next-line no-console
      console.debug('guardOptions compute', { sid, stationNameForSid, assignedCount: (assignedVigilantes || []).length, matchCount: byStation.length, sampleMatch: byStation[0] });

      // If a station is selected, only return guards that match that station (no fallbacks)
      if (sid) {
        if (byStation && byStation.length) return byStation;
        // No guards for this station
        return [] as { id: string; name: string }[];
      }

      // No station selected: return guards assigned to the current post-site (if any)
      try {
        const currentSite = dupSiteId || watchedSiteId || null;
        if (currentSite) {
          const byPostSite = (assignedVigilantes || []).filter((m) => String(m.postSiteId || m.raw?.postSiteId || m.raw?.post_site_id || m.raw?.siteId || m.raw?.site || '') === String(currentSite)).map((m) => ({ id: m.id as string, name: m.name }));
          if (byPostSite && byPostSite.length) {
            // eslint-disable-next-line no-console
            console.debug('guardOptions fallback byPostSite', { currentSite, count: byPostSite.length, sample: byPostSite[0] });
            return byPostSite;
          }
        }
      } catch (e) {
        // ignore
      }

      // Fallback: return all assigned guards for this post-site (last resort)
      // eslint-disable-next-line no-console
      console.debug('guardOptions fallback to all assignedVigilantes', { assignedCount: (assignedVigilantes || []).length });
      return (assignedVigilantes || []).map((m) => ({ id: m.id as string, name: m.name }));
    } catch (e) {
      return [];
    }
  })();

  // When station changes, if current selected guard is not in options, clear it
  useEffect(() => {
    try {
      const current = form.getValues ? form.getValues('guardId') : null;
      if (!current) return;
      const found = guardOptions && guardOptions.some((g) => String(g.id) === String(current));
      if (!found) {
        form.setValue('guardId', '');
      }
    } catch (e) {
      // ignore
    }
  }, [selectedStationId, assignedVigilantes, vigilantes]);

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: "Panel de control", path: "/dashboard" },
          { label: "Nuevo Incidente" },
        ]}
      />

      <PageContainer width="wide" className="px-6 pt-4">
        <PageHeader
          icon={<ClipboardPlus />}
          title="Nuevo Incidente"
          subtitle="Registra un nuevo incidente y notifica al vigilante correspondiente."
        />
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Section title={t("ui.NewDispatch.informacionDelIncidente", "Información del incidente")} icon={<Users />}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {!isFromPostSite ? (
                  <>
                    <FormField
                      control={form.control}
                      name="clientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cliente*</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value} onOpenChange={(open) => {
                            if (open) {
                              setTimeout(() => clienteInputRef.current?.focus(), 50);
                            } else {
                              setClienteFilter("");
                            }
                          }}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent>
                              <div className="px-2 py-2">
                                <Input
                                  ref={(el) => (clienteInputRef.current = el)}
                                  placeholder="Buscar cliente..."
                                  value={clienteFilter}
                                  onChange={(e) => setClienteFilter(e.target.value)}
                                />
                              </div>
                              {clientes
                                .filter((c) => c.name.toLowerCase().includes(clienteFilter.trim().toLowerCase()))
                                .map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="siteId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Puesto de seguridad*</FormLabel>
                          <Select onValueChange={(v) => { field.onChange(v); fetchStationsFor(v); }} value={field.value} onOpenChange={(open) => {
                            if (open) {
                              setTimeout(() => sitioInputRef.current?.focus(), 50);
                            } else {
                              setSitioFilter("");
                            }
                          }}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar" />
                            </SelectTrigger>
                            <SelectContent>
                              <div className="px-2 py-2">
                                <Input
                                  ref={(el) => (sitioInputRef.current = el)}
                                  placeholder="Buscar sitio..."
                                  value={sitioFilter}
                                  onChange={(e) => setSitioFilter(e.target.value)}
                                />
                              </div>
                              {sitios
                                .filter((s) => s.name.toLowerCase().includes(sitioFilter.trim().toLowerCase()))
                                .map((s) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                ) : (
                  <>
                    <FormField
                      control={form.control}
                      name="clientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cliente</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value ?? (prefillClientName || (clientes.find(c => c.id === form.getValues('clientId'))?.name) || '')} disabled />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="siteId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Puesto de seguridad</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value ?? (prefillSiteName || (sitios && sitios[0] && sitios[0].name) || '')} disabled />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Station selector: visible even when creating manually. Disabled/empty until site selected */}
                <FormField
                  control={form.control}
                  name="stationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("ui.NewDispatch.estacion", "Estación")}</FormLabel>
                      <Select
                        value={field.value || ''}
                        onValueChange={(v) => {
                          field.onChange(v);
                          setSelectedStationId(v || null);
                        }}
                        onOpenChange={(open) => {
                          if (open) setTimeout(() => stationInputRef.current?.focus(), 50);
                          else setStationFilter('');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={stations && stations.length > 0 ? 'Seleccionar estación' : (watchedSiteId || dupSiteId ? 'Sin estaciones' : 'Seleccione un puesto primero')} />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-2">
                            <Input
                              ref={(el) => (stationInputRef.current = el)}
                              placeholder={t("ui.NewDispatch.buscarEstacion", "Buscar estación...")}
                              value={stationFilter}
                              onChange={(e) => setStationFilter(e.target.value)}
                              disabled={!(watchedSiteId || dupSiteId)}
                            />
                          </div>
                          {stations && stations.length > 0 ? stations
                            .filter((s) => s.name.toLowerCase().includes(stationFilter.trim().toLowerCase()))
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            )) : (
                              <SelectItem key="__no_stations" value="__no_stations" disabled>{watchedSiteId || dupSiteId ? 'Sin estaciones' : 'Seleccione un puesto primero'}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              <FormField
                control={form.control}
                name="guardId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vigilante a Informar</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} onOpenChange={(open) => {
                      if (open) {
                        setTimeout(() => guardInputRef.current?.focus(), 50);
                      } else {
                        setGuardFilter("");
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-2">
                          <Input
                            ref={(el) => (guardInputRef.current = el)}
                            placeholder="Buscar vigilante..."
                            value={guardFilter}
                            onChange={(e) => setGuardFilter(e.target.value)}
                          />
                        </div>
                          {(!selectedStationId)
                            ? (
                              <>
                                <SelectItem key="__no_station_selected" value="__no_station_selected" disabled>
                                  Seleccione una estación primero
                                </SelectItem>
                              </>
                            ) : (
                              (guardOptions && guardOptions.length > 0)
                                ? (guardOptions || [])
                                    .filter((g) => (g.name || '').toLowerCase().includes(guardFilter.trim().toLowerCase()))
                                    .map((g) => (
                                      <SelectItem key={g.id} value={g.id}>
                                        {g.name}
                                      </SelectItem>
                                    ))
                                : (
                                    <SelectItem key="__no_assigned_guards" value="__no_assigned_guards" disabled>
                                      No hay vigilantes asignados a esta estación
                                    </SelectItem>
                                  )
                            )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridad*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} onOpenChange={(open) => {
                      if (open) {
                        setTimeout(() => tipoInputRef.current?.focus(), 50);
                      } else {
                        setTipoFilter("");
                      }
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {prioridades.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="callerType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Llamador*</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposLlamador.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="callerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del llamador*</FormLabel>
                    <FormControl>
                      <Input {...field} onChange={(e) => { setCallerNameEdited(true); field.onChange(e); }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            </Section>

            <Section title="Detalles del incidente" icon={<FileText />}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem className="md:col-span-1">
                      <FormLabel>{t("ui.NewDispatch.ubicacionDelIncidente", "Ubicación del incidente*")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="incidentType"
                  render={({ field }) => (
                    <FormItem className="md:col-span-1">
                      <FormLabel>Tipo de Incidente*</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-2">
                            <Input
                              ref={(el) => (tipoInputRef.current = el)}
                              placeholder="Buscar tipo..."
                              value={tipoFilter}
                              onChange={(e) => setTipoFilter(e.target.value)}
                            />
                          </div>
                          {tiposIncidente
                            .filter((t) => t.name.toLowerCase().includes(tipoFilter.trim().toLowerCase()))
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 gap-4 md:col-span-2 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="incidentDate"
                    render={({ field }) => (
                      <FormItem
                        className="cursor-pointer"
                        onClick={() => {  
                          const el = incidentDateRef.current;
                          if (!el) return;
                          // Prefer showPicker() when available (Chromium), otherwise focus.
                          if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
                            try {
                              (el as HTMLInputElement & { showPicker?: () => void }).showPicker();
                            } catch (err) {
                              el.focus();
                            }
                          } else {
                            el.focus();
                          }
                        }}
                      >
                        <FormLabel>Fecha del Incidente*</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            {...field}
                            ref={(el) => {
                              if (typeof field.ref === "function") field.ref(el);
                              else if (field.ref) (field.ref as any).current = el;
                              incidentDateRef.current = el;
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="incidentTime"
                    render={({ field }) => (
                      <FormItem
                        className="cursor-pointer"
                        onClick={() => {
                          const el = incidentTimeRef.current;
                          if (!el) return;
                          if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
                            try {
                              (el as HTMLInputElement & { showPicker?: () => void }).showPicker();
                            } catch (err) {
                              el.focus();
                            }
                          } else {
                            el.focus();
                          }
                        }}
                      >
                        <FormLabel>Hora del Incidente*</FormLabel>
                        <FormControl>
                          <Input
                            type="time"
                            {...field}
                            ref={(el) => {
                              if (typeof field.ref === "function") field.ref(el);
                              else if (field.ref) (field.ref as any).current = el;
                              incidentTimeRef.current = el;
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="incidentDetails"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Detalles del incidente*</FormLabel>
                      <FormControl>
                        <Textarea rows={4} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Section>

            <Section title="Seguimiento" icon={<NotebookPen />}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="actionsTaken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Acciones tomadas</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="internalNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notas internas</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            </Section>

            <Section title="Adjuntos" icon={<Paperclip />}>
              <FormField
                control={form.control}
                name="attachment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adjunto</FormLabel>
                    <div className="flex items-start justify-between gap-3">
                      <input
                        ref={fileInputRef}
                        id="dispatch-attachments"
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={(e) => {
                          const input = e.target as HTMLInputElement;
                          const files = Array.from(input.files || []);
                          if (files.length === 0) return;
                          setAttachments((prev) => {
                            const next = [...prev, ...files];
                            try {
                              form.setValue("attachment", next.length ? next[0] : undefined);
                            } catch (err) {
                              /* ignore */
                            }
                            return next;
                          });
                          // reset input so same file can be reselected if needed
                          input.value = "";
                        }}
                      />

                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                          className="min-w-[160px]"
                        >
                          Elegir archivos
                        </Button>

                        <div className="flex flex-col gap-1">
                          {attachments.length === 0 ? (
                            <span className="text-sm text-muted-foreground">No hay archivos adjuntos</span>
                          ) : (
                            attachments.map((f, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">{f.name}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAttachments((prev) => {
                                      const next = prev.filter((_, i) => i !== idx);
                                      try {
                                        form.setValue("attachment", next.length ? next[0] : undefined);
                                      } catch (err) {
                                        /* ignore */
                                      }
                                      return next;
                                    });
                                  }}
                                  className="text-muted-foreground hover:text-[color:var(--bad-text)]"
                                  aria-label={`Eliminar ${f.name}`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Section>

            <FadeIn className="flex items-center justify-end gap-2">
              <Button variant="outline" asChild>
                <Link to="/dispatch-tickets">Cancelar</Link>
              </Button>
              <Button
                type="submit"
                variant="brand"
                disabled={form.formState.isSubmitting}
              >
                Enviar
              </Button>
            </FadeIn>
          </form>
        </Form>
        {debugGuards ? (
          <div className="mt-4 rounded border p-3 bg-card text-xs">
            <div className="font-medium mb-2">DEBUG: assignedVigilantes (truncated)</div>
            <pre style={{ maxHeight: 300, overflow: 'auto' }}>{JSON.stringify((assignedVigilantes || []).slice(0,50), null, 2)}</pre>
          </div>
        ) : null}
      </PageContainer>
    </AppLayout>
  );
}


