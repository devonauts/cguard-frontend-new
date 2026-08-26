import React, { useEffect, useState, useMemo, useRef } from 'react';
import { clientDisplayName } from '@/lib/clientName';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiService } from '@/services/api/apiService';
import { supervisorService, type Supervisor } from '@/lib/api/supervisorService';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  EllipsisVertical,
  Eye,
  Edit,
  Printer,
  FileDown,
  FileSpreadsheet,
  Mail,
  Search,
  Filter,
  ExternalLink,
  X,
  Trash2,
} from "lucide-react";
import IncidentTypesService from '@/services/incident-types.service';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';
import { EmptyState, StatusBadge, SkeletonCards } from '@/components/kit';
import { FIELD_CLS_LG } from '@/pages/admin/clientes/components/_shared/tab-kit';
import type { PostSite } from '@/types';

interface SiteProp extends PostSite {
  tenantId?: string;
  clientAccountId?: string;
}

export default function Incidents({ site }: { site?: SiteProp }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [dispatches, setDispatches] = useState<any[]>([]);
  const [loadingDispatches, setLoadingDispatches] = useState(false);
  const [assignedGuards, setAssignedGuards] = useState<any[]>([]);
  // Dispatch-to-supervisor dialog state.
  const [dispatchFor, setDispatchFor] = useState<any | null>(null);
  const [sups, setSups] = useState<Supervisor[]>([]);
  const [selSup, setSelSup] = useState<string>('');
  const [dispatching, setDispatching] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newContent, setNewContent] = useState('');
  const [stations, setStations] = useState<any[]>([]);
  const [postSites, setPostSites] = useState<any[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | undefined>(undefined);
  const [filterPostSiteId, setFilterPostSiteId] = useState<string | undefined>(undefined);
  const [clients, setClients] = useState<any[]>([]);
  const [filterClientId, setFilterClientId] = useState<string | undefined>(undefined);
  const [filterStationId, setFilterStationId] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterCreatedFrom, setFilterCreatedFrom] = useState<string | undefined>(undefined);

  const [filterCreatedTo, setFilterCreatedTo] = useState<string | undefined>(undefined);
  const [filterInformer, setFilterInformer] = useState<string | undefined>(undefined);
  const [filterIncidentTypeId, setFilterIncidentTypeId] = useState<string | undefined>(undefined);
  const [incidentTypes, setIncidentTypes] = useState<any[]>([]);
  const [clientAdmins, setClientAdmins] = useState<any[]>([]);
  const [filterIncidentFrom, setFilterIncidentFrom] = useState<string | undefined>(undefined);
  const [filterIncidentTo, setFilterIncidentTo] = useState<string | undefined>(undefined);
  const [filterShowArchived, setFilterShowArchived] = useState(false);
  const [filteredIncidents, setFilteredIncidents] = useState<any[] | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [openFilter, setOpenFilter] = useState(false);
  const [actionSelectValue, setActionSelectValue] = useState('');
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Row action handlers
  const handleViewDetails = (it: any) => {
    navigate(`/dispatch-tickets/${it.id}`, { state: { resource: 'incident' } });
  };

  const handleOpenInNewTab = (it: any) => {
    window.open(`${window.location.origin}/dispatch-tickets/${it.id}?resource=incident`, '_blank');
  };

  const handleGenerateShareableLink = async (it: any) => {
    const url = `${window.location.origin}/dispatch-tickets/${it.id}?resource=incident`;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast.success('Link copiado al portapapeles');
    } catch (err) {
      console.error('Copy failed', err);
      toast.error(t('comun.noSePudoCopiarEl'));
    }
  };

  const handleEditIncident = (it: any) => {
    navigate(`/dispatch-tickets/${it.id}/edit`);
  };

  const handleCloseTicket = async (it: any) => {
    try {
      const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
      if (!tenantId) throw new Error('Tenant missing');
      await ApiService.put(`/tenant/${tenantId}/incident/${it.id}`, { data: { status: 'cerrado', workStatus: 'closed' } });
      setIncidents((prev) => prev.map((p) => (p.id === it.id ? { ...p, status: 'cerrado', workStatus: 'closed' } : p)));
      toast.success(t('ui.Incidents.ticketCerrado'));
    } catch (err) {
      console.error('Close ticket failed', err);
      toast.error(t('ui.Incidents.noSePudoCerrarEl'));
    }
  };

  const handleDeleteIncident = async (it: any) => {
    try {
      const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
      if (!tenantId) throw new Error('Tenant missing');
      // Backend expects bulk-delete via query param `ids[]`; use that for single-id delete
      await ApiService.delete(`/tenant/${tenantId}/incident?ids[]=${encodeURIComponent(it.id)}`);
      setIncidents((prev) => prev.filter((p) => p.id !== it.id));
      toast.success('Incidente eliminado');
    } catch (err) {
      console.error('Delete incident failed', err);
      toast.error('No se pudo eliminar el incidente');
    }
  };

  useEffect(() => {
    setTotalCount(incidents ? incidents.length : 0);
    // when incidents change, reset client-side filtered list
    setFilteredIncidents(null);
    let mounted = true;
    (async () => {
      try {
        const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
        const postSiteId = site?.id || '';
        if (!postSiteId || !tenantId) return;
        setLoading(true);
        // Use the nested filter[] the backend actually reads — a bare ?postSiteId=
        // was ignored, so every site showed the tenant's incidents from ALL sites.
        const res = await ApiService.get(`/tenant/${tenantId}/incident?filter[postSiteId]=${encodeURIComponent(postSiteId)}&limit=50`);
        const rows = Array.isArray(res) ? res : (res && res.rows) ? res.rows : [];
        if (mounted) setIncidents(rows);
      } catch (err) {
        console.error('Failed to load incidents', err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [site]);

  useEffect(() => {
    setTotalCount(incidents ? incidents.length : 0);
    if (page > 1 && incidents && ((page - 1) * limit) >= incidents.length) {
      setPage(1);
    }
  }, [incidents, limit]);

  // Page count + footer must reflect the EFFECTIVE list (filtered or full), not
  // always the unfiltered incidents — otherwise filtering overstates the pages.
  useEffect(() => {
    setTotalCount((filteredIncidents ?? incidents)?.length ?? 0);
  }, [filteredIncidents, incidents]);

  // Load related dispatches (requests) for this post site — backend uses siteId
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
        const postSiteId = site?.id || '';
        if (!postSiteId) return;
        setLoadingDispatches(true);

        // load assigned guards for this post site
        let guardsRows: any[] = [];
        try {
          const guardsResp = await ApiService.get(`/tenant/${tenantId}/post-site/${postSiteId}/guards`);
          guardsRows = Array.isArray(guardsResp) ? guardsResp : (guardsResp && guardsResp.rows) ? guardsResp.rows : [];
          if (mounted) setAssignedGuards(guardsRows);
        } catch (err) {
          console.warn('Failed to load assigned guards', err);
        }

        // Fetch dispatches for the site
        const siteResp = await ApiService.get(`/tenant/${tenantId}/request?filter[siteId]=${encodeURIComponent(postSiteId)}&limit=50`);
        const siteRows = Array.isArray(siteResp) ? siteResp : (siteResp && siteResp.rows) ? siteResp.rows : [];

        // Fetch dispatches for each assigned guard (if any)
        let guardRows: any[] = [];
        try {
          const sourceGuards = guardsRows.length ? guardsRows : (Array.isArray(assignedGuards) ? assignedGuards : []);
          const guardIds = sourceGuards.map((g: any) => g.securityGuardId || g.guardId || g.userId || g.id).filter(Boolean);
          // If we already fetched guards above, use that; otherwise retrieve guards now
          const idsToQuery = guardIds.length ? guardIds : [];
          const guardPromises = idsToQuery.map((gid: string) => ApiService.get(`/tenant/${tenantId}/request?filter[guardName]=${encodeURIComponent(gid)}&limit=50`));
          const guardResponses = await Promise.allSettled(guardPromises);
          for (const r of guardResponses) {
            if (r.status === 'fulfilled') {
              const data = r.value;
              const rows = Array.isArray(data) ? data : (data && data.rows) ? data.rows : [];
              guardRows = guardRows.concat(rows);
            }
          }
        } catch (err) {
          console.warn('Failed to load guard-related dispatches', err);
        }

        // merge unique by id and mark source
        const mergedMap = new Map<string, any>();
        for (const r of siteRows) mergedMap.set(String(r.id), { ...r, _source: 'site' });
        for (const r of guardRows) {
          const id = String(r.id);
          if (!mergedMap.has(id)) mergedMap.set(id, { ...r, _source: 'guard' });
        }
        const merged = Array.from(mergedMap.values()).sort((a: any, b: any) => {
          const tb = +(new Date(b.createdAt || b.created_at || 0)) || 0;
          const ta = +(new Date(a.createdAt || a.created_at || 0)) || 0;
          return tb - ta;
        });
        if (mounted) setDispatches(merged);
      } catch (err) {
        console.error('Failed to load dispatches', err);
      } finally {
        if (mounted) setLoadingDispatches(false);
      }
    })();
    return () => { mounted = false; };
  }, [site]);

  const visibleRows = useMemo(() => {
    const base = filteredIncidents !== null ? filteredIncidents : incidents;
    const start = (page - 1) * limit;
    return (base || []).slice(start, start + limit);
  }, [incidents, filteredIncidents, page, limit]);

  const visualStations = useMemo(() => {
    if (stations && stations.length) return stations;
    const map = new Map<string, { id: any; name: string }>();
    const collectFrom = (arr: any[] = []) => {
      for (const it of arr) {
        const sid = it?.stationId || (it?.station && (it.station.id || it.station)) || null;
        if (!sid) continue;
        const name = (it?.station && (it.station.stationName || it.station.name || it.station.label || it.station.title)) || it.stationName || String(sid);
        map.set(String(sid), { id: sid, name });
      }
    };
    collectFrom(incidents || []);
    collectFrom(dispatches || []);
    return Array.from(map.values());
  }, [stations, incidents, dispatches]);

  const stationOptions = useMemo(() => {
    const list = visualStations || [];
    if (!filterClientId) return list;
    // Filter stations to those that actually have an incident for the selected
    // client. (The old `s.clientId` guard was dead — visualStations' fallback
    // rows only carry {id, name}, never clientId.)
    const filtered = list.filter((s) => {
      return (incidents || []).some((it: any) => (String(it.stationId || it.station?.id) === String(s.id)) && (String(it.clientId || it.client?.id || it.clientAccountId) === String(filterClientId)));
    });
    return (filtered && filtered.length) ? filtered : list;
  }, [visualStations, filterClientId, incidents]);

  async function handleCreateDispatch(event: React.MouseEvent<HTMLButtonElement>): Promise<void> {
    const postSiteId = site?.id || '';
    if (!postSiteId) { toast.error('Post site missing'); return; }
    if (!newSubject && !newContent) { toast.error('Provide a subject or description'); return; }
    try {
      setCreating(true);
      const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
      if (!tenantId) {
        toast.error('Tenant missing');
        return;
      }
      const payload: any = { data: { siteId: postSiteId, stationId: selectedStationId || undefined, subject: newSubject || undefined, content: newContent || undefined, status: 'abierto' } };
      const resp = await ApiService.post(`/tenant/${tenantId}/request`, payload);
      const created = resp && resp.data ? resp.data : resp;
      setDispatches((d) => [created, ...d]);
      setCreateOpen(false);
      setNewSubject('');
      setNewContent('');
      setSelectedStationId(undefined);
      toast.success('Dispatch created');
    } catch (err) {
      console.error('Create dispatch failed', err);
      toast.error('Failed to create dispatch');
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!createOpen) return;
      try {
        const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
        // Prefer a selected post site from the filters when opening the create dialog
        const postSiteId = filterStationId || site?.id || '';
        if (!tenantId || !postSiteId) {
          if (mounted) setStations([]);
          return;
        }

        let stationRows: any[] = [];
        try {
          // The station list endpoint filters by post-site via filter[postSite]
          // (the old `/post-site/:id/stations` route never existed → always 404'd
          // and the dropdown came up empty on fresh sites).
          const res: any = await ApiService.get(
            `/tenant/${tenantId}/stations?filter[postSite]=${encodeURIComponent(postSiteId)}&limit=200&offset=0`,
          );
          stationRows = Array.isArray(res) ? res : (res && res.rows) ? res.rows : [];
        } catch (err) {
          console.warn('Stations load failed (create dialog)', err);
        }

        let stationMapped = (stationRows || []).map((s: any) => {
          const id = s?.id || s?.stationId || s || null;
          const name = s?.stationName || s?.name || s?.title || s?.label || (typeof s === 'string' ? s : (s && s.id) ? s.id : String(id));
          return { id, name };
        });

        if ((!stationMapped || stationMapped.length === 0) && incidents && incidents.length > 0) {
          const map = new Map<string, { id: any; name: string }>();
          for (const it of incidents) {
            const sid = it.stationId || (it.station && (it.station.id || it.station)) || null;
            if (!sid) continue;
            const name = (it.station && (it.station.name || it.station.label || it.station.title)) || String(sid);
            map.set(String(sid), { id: sid, name });
          }
          stationMapped = Array.from(map.values());
        }

        if (mounted) {
          setStations(stationMapped);
          // if user opened dialog after selecting a post site in the filters, preselect it
          if (filterStationId) setSelectedStationId(filterStationId);
        }
      } catch (err) {
        console.warn('Failed to load stations for post site', err);
        if (mounted) setStations([]);
      }
    })();
    return () => { mounted = false; };
  }, [createOpen, site, filterStationId]);

  // Load clients and stations when opening filter panel
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!openFilter) return;
      try {
        const tenantId = site?.tenantId || localStorage.getItem('tenantId') || '';
        const postSiteId = filterPostSiteId || site?.id || '';
        if (!tenantId) return;

        // load incident types for filter

        // load incident types for filter
        try {
          const itResp: any = await IncidentTypesService.list('', 1, 1000);
          const itRows = itResp && Array.isArray(itResp.rows) ? itResp.rows : (Array.isArray(itResp) ? itResp : []);
          if (mounted) setIncidentTypes(itRows || []);
        } catch (err) {
          console.warn('Failed to load incident types for filters', err);
          if (mounted) setIncidentTypes([]);
        }

        // load client admins (from the current site client) for informer select
        try {
          const clientIdLocal = site?.clientId || (site?.client && site.client.id) || null;
          if (clientIdLocal) {
            const clientResp: any = await ApiService.get(`/tenant/${tenantId}/client-account/${clientIdLocal}`);
            const clientObj = clientResp && (clientResp.data || clientResp) ? (clientResp.data || clientResp) : clientResp;
            const admins = (clientObj && Array.isArray(clientObj.portalUsers) ? clientObj.portalUsers : (clientObj && Array.isArray(clientObj.users) ? clientObj.users : []));
            if (mounted) setClientAdmins(admins || []);
          } else {
            if (mounted) setClientAdmins([]);
          }
        } catch (err) {
          console.warn('Failed to load client admins for filters', err);
          if (mounted) setClientAdmins([]);
        }

        // load stations for post site
        try {
          let stationRows: any[] = [];
          try {
            // filter[postSite] is the supported station-list filter (the old
            // `/post-site/:id/stations` route never existed → always 404'd).
            const res: any = await ApiService.get(
              `/tenant/${tenantId}/stations?filter[postSite]=${encodeURIComponent(postSiteId)}&limit=200&offset=0`,
            );
            stationRows = Array.isArray(res) ? res : (res && res.rows) ? res.rows : [];
          } catch (err) {
            console.warn('Stations load failed', err);
          }

          let stationMapped = (stationRows || []).map((s: any) => {
            const id = s?.id || s?.stationId || s || null;
            const name = s?.stationName || s?.name || s?.title || s?.label || (typeof s === 'string' ? s : (s && s.id) ? s.id : String(id));
            return { id, name };
          });

          // if API returned no stations, try to derive from loaded incidents as a visual fallback
          if ((!stationMapped || stationMapped.length === 0) && incidents && incidents.length > 0) {
            const map = new Map<string, { id: any; name: string }>();
            for (const it of incidents) {
              const sid = it.stationId || (it.station && (it.station.id || it.station)) || null;
              if (!sid) continue;
              const name = (it.station && (it.station.name || it.station.label || it.station.title)) || String(sid);
              map.set(String(sid), { id: sid, name });
            }
            stationMapped = Array.from(map.values());
          }

          if (mounted) setStations(stationMapped);
        } catch (err) {
          console.error('Error loading stations for filters', err);
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => { mounted = false; };
  }, [openFilter, site, filterPostSiteId]);

  function applyFilters() {
    const base = incidents || [];
    const filtered = base.filter((it) => {
      // client
      if (filterClientId && String(it.clientId || it.client?.id || it.clientAccountId) !== String(filterClientId)) return false;
      // station
      if (filterStationId && String(it.stationId || it.station?.id) !== String(filterStationId)) return false;
      // status
      if (filterStatus && String((it.status || '').toLowerCase()) !== String(filterStatus).toLowerCase()) return false;
      // created range
      if (filterCreatedFrom) {
        const from = new Date(filterCreatedFrom);
        const created = new Date(it.createdAt || it.created_at || it.createdAt || 0);
        if (created < from) return false;
      }
      if (filterCreatedTo) {
        const to = new Date(filterCreatedTo);
        const created = new Date(it.createdAt || it.created_at || it.createdAt || 0);
        if (created > to) return false;
      }
      // incident date range
      if (filterIncidentFrom) {
        const from = new Date(filterIncidentFrom);
        const inc = new Date(it.incidentAt || it.date || it.createdAt || it.created_at || 0);
        if (inc < from) return false;
      }
      if (filterIncidentTo) {
        const to = new Date(filterIncidentTo);
        const inc = new Date(it.incidentAt || it.date || it.createdAt || it.created_at || 0);
        if (inc > to) return false;
      }
      // informer filter (supports guard ids, client:<id> and admin:<id>)
      if (filterInformer) {
        const informerSel = String(filterInformer || '');
        const callerName = (it.callerName || it.informer || it.informador || it.informadorName || '') || '';

        if (informerSel.startsWith('client:')) {
          const cid = informerSel.split(':')[1] || '';
          const incidentClientId = String(it.clientId || it.client?.id || it.postSiteClientId || it.postSite?.clientId || '');
          if (String(cid) !== incidentClientId) return false;
        } else if (informerSel.startsWith('admin:')) {
          const aid = informerSel.split(':')[1] || '';
          const admin = (clientAdmins || []).find((a) => String(a.id || a.userId || a.email) === aid);
          const adminName = admin ? String(admin.fullName || admin.name || admin.email || '') : '';
          const nameMatchAdmin = adminName ? String(callerName).toLowerCase().includes(adminName.toLowerCase()) : false;
          if (!nameMatchAdmin) return false;
        } else {
          // treat as guard id or name substring
          const guardMatch = String(it.guardId || it.guard?.id || it.guardNameId || it.informerId || '') === informerSel;
          const selectedGuard = (assignedGuards || []).find((g) => String(g.id || g.guardId || g.userId || g.securityGuardId) === informerSel);
          const nameMatch = selectedGuard ? ((callerName && String(callerName).trim() === String(selectedGuard.fullName || selectedGuard.name || selectedGuard.guardName || selectedGuard.user?.fullName)) ) : (callerName && String(callerName).toLowerCase().includes(String(filterInformer).toLowerCase()));
          if (!guardMatch && !nameMatch) return false;
        }
      }

      // incident type filter
      if (filterIncidentTypeId) {
        const typeId = String(filterIncidentTypeId);
        const itTypeId = (it.incidentTypeId || (it.incidentType && (it.incidentType.id || it.incidentType)) || it.incidentType) || '';
        if (String(itTypeId) !== typeId) return false;
      }
      // archived flag (if item has `archived` property)
      if (!filterShowArchived) {
        if (it.archived === true) return false;
      }
      return true;
    });
    setFilteredIncidents(filtered);
    setOpenFilter(false);
    setPage(1);
  }

  function clearFilters() {
    setFilterClientId(undefined);
    setFilterStationId(undefined);
    setFilterStatus(undefined);
    setFilterCreatedFrom(undefined);
    setFilterCreatedTo(undefined);
    setFilterIncidentFrom(undefined);
    setFilterIncidentTo(undefined);
    setFilterShowArchived(false);
    setFilterInformer(undefined);
    setFilterIncidentTypeId(undefined);
    setFilteredIncidents(null);
    setOpenFilter(false);
    setPage(1);
  }

  function handleCreateDispatchFromIncident(it: any): void {
    try {
      const dup: any = {
        // clientId: support multiple possible shapes from backend
        clientId:
          it.clientId ||
          it.client?.id ||
          it.clientAccountId ||
          it.clientAccount?.id ||
          it.client?.clientId ||
          '',
        // site/postSite: prefer current `site` prop, then multiple possible incident fields
        siteId:
          site?.id ||
          it.postSiteId ||
          it.siteId ||
          (it.postSite && (it.postSite.id || it.postSite.postSiteId)) ||
          (it.site && (it.site.id || it.site.siteId)) ||
          '',
        // stationId: support various shapes
        stationId:
          it.stationId ||
          it.station?.id ||
          it.stationId ||
          (it.station && it.station.stationId) ||
          null,
        guardId: it.guardId || it.guard?.id || null,
        incidentAt: it.createdAt || it.created_at || it.date || null,
        incidentTypeId: it.incidentTypeId || (it.incidentType && (it.incidentType.id || it.incidentType)) || '',
        content: it.description || it.notes || it.content || '',
        location: it.location || '',
        priority: it.priority || 'media',
        callerType: it.callerType || '',
        callerName: it.callerName || '',
        internalNotes: it.internalNotes || '',
      };
      navigate('/dispatch-tickets/new', { state: { duplicate: dup } });
    } catch (err) {
      console.error('Error creating dispatch from incident', err);
      toast.error('No se pudo iniciar creación de Incidente');
    }
  }

  // simple client-side search term for the dispatch table
  

  useScrollToTopOnMount(containerRef);

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="glass p-4">
        {/* Filtros + acciones suman bastante más de 375 px: sin `flex-wrap`
            la barra empujaba la página entera hacia la derecha en un teléfono. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Select value={actionSelectValue} onValueChange={(v) => {
              setActionSelectValue(v);
              if (v === 'eliminar') {
                if (!selectedIds || selectedIds.length === 0) {
                  toast.error('Seleccione al menos un elemento');
                  setActionSelectValue('');
                  return;
                }
                toast('Acción eliminar no implementada aquí');
                setActionSelectValue('');
              }
            }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('incidents.actionsPlaceholder') || 'Actions'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eliminar">{t('actions.delete')}</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                placeholder={t('incidents.searchPlaceholder') || 'Search incidents...'}
                // local client-side filter
                onChange={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
                className="w-full max-w-md pl-9"
              />
            </div>

            <Sheet open={openFilter} onOpenChange={setOpenFilter}>
              <SheetTrigger asChild>
                <Button variant="outline" className="border-primary/30 brand-text">
                  <Filter className="mr-2 h-4 w-4" />
                  {t('incidents.filters') || 'Filters'}
                </Button>
              </SheetTrigger>

              <SheetContent className="sm:w-[520px] md:w-[640px] p-6 h-screen max-h-[100vh] overflow-auto">
                <SheetHeader>
                  <SheetTitle>{t('incidents.filters', { defaultValue: 'Filtros' })}</SheetTitle>
                </SheetHeader>

                <div className="mt-3 grid grid-cols-1 gap-4 w-full">
                  <div className="grid grid-cols-1 gap-4">
                    {/* Cliente and Post-site filters removed per request */}

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('incidents.filterFields.stations', { defaultValue: 'Estaciones' })}</label>
                      <Select value={filterStationId ?? '__none'} onValueChange={(v) => setFilterStationId(v === '__none' ? undefined : v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('incidents.selectStation', { defaultValue: 'Seleccionar estación' })} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">{t('incidents.allStations', { defaultValue: 'Todas las estaciones' })}</SelectItem>
                          {stationOptions && stationOptions.length > 0 ? stationOptions.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name || s.id}</SelectItem>)) : (
                            <SelectItem value="__no_stations" disabled>{t('incidents.noStations', { defaultValue: 'No hay estaciones' })}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('incidents.filterFields.status', { defaultValue: 'Estado' })}</label>
                      <Select value={filterStatus ?? '__none'} onValueChange={(v) => setFilterStatus(v === '__none' ? undefined : v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('incidents.selectStatus') || 'Select status'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">{t('incidents.allStatuses') || 'All'}</SelectItem>
                          <SelectItem value="abierto">{t('incidents.status.open') || 'Open'}</SelectItem>
                          <SelectItem value="cerrado">{t('incidents.status.closed') || 'Closed'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">Informador</label>
                        <Select value={filterInformer ?? '__none'} onValueChange={(v) => setFilterInformer(v === '__none' ? undefined : v)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('ui.Incidents.todosLosInformadores')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">{t('ui.Incidents.todosLosInformadores')}</SelectItem>
                            {/* Assigned guards for the post site */}
                            {(assignedGuards || []).length ? (assignedGuards || []).map((g: any) => (
                              <SelectItem key={`guard-${g.id || g.guardId || g.userId || g.securityGuardId}`} value={String(g.id || g.guardId || g.userId || g.securityGuardId)}>{g.fullName || g.name || g.guardName || (g.user && (g.user.fullName || g.user.firstName)) || g.id}</SelectItem>
                            )) : (
                              <SelectItem value="__no_informers" disabled>No hay informadores</SelectItem>
                            )}
                            {/* Client as informer option */}
                            {site && (site.client || site.clientId) ? (
                              <>
                                <SelectItem value={`client:${site.client?.id || site.clientId}`}>{clientDisplayName(site.client as any, String(site.clientId))}</SelectItem>
                              </>
                            ) : null}
                            {/* Client admins */}
                            {clientAdmins && clientAdmins.length ? (
                              clientAdmins.map((u: any) => (
                                <SelectItem key={`admin-${u.id || u.userId || u.email}`} value={`admin:${u.id || u.userId || u.email}`}>{u.fullName || u.name || u.email || u.id}</SelectItem>
                              ))
                            ) : null}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-foreground mb-2">{t('ui.Incidents.tipoDeIncidente')}</label>
                        <Select value={filterIncidentTypeId ?? '__none'} onValueChange={(v) => setFilterIncidentTypeId(v === '__none' ? undefined : v)}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder={t('comun.todosLosTipos')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">{t('comun.todosLosTipos')}</SelectItem>
                            {(incidentTypes || []).length ? (incidentTypes || []).map((it: any) => (
                              <SelectItem key={it.id} value={String(it.id)}>{it.name || it.id}</SelectItem>
                            )) : (
                              <SelectItem value="__no_types" disabled>No hay tipos</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('incidents.filterFields.createdFrom') || 'Created from'}</label>
                      <input type="date" className="mt-1 block w-full border rounded px-2 py-2" value={filterCreatedFrom || ''} onChange={(e) => setFilterCreatedFrom(e.target.value || undefined)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('incidents.filterFields.createdTo') || 'Created to'}</label>
                      <input type="date" className="mt-1 block w-full border rounded px-2 py-2" value={filterCreatedTo || ''} onChange={(e) => setFilterCreatedTo(e.target.value || undefined)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('incidents.filterFields.incidentFrom') || 'Incident from'}</label>
                      <input type="date" className="mt-1 block w-full border rounded px-2 py-2" value={filterIncidentFrom || ''} onChange={(e) => setFilterIncidentFrom(e.target.value || undefined)} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">{t('incidents.filterFields.incidentTo') || 'Incident to'}</label>
                      <input type="date" className="mt-1 block w-full border rounded px-2 py-2" value={filterIncidentTo || ''} onChange={(e) => setFilterIncidentTo(e.target.value || undefined)} />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input id="archived" type="checkbox" className="h-4 w-4" checked={filterShowArchived} onChange={(e) => setFilterShowArchived(Boolean(e.target.checked))} />
                    <label htmlFor="archived" className="text-sm text-foreground">{t('incidents.filterFields.showArchived') || 'Show archived'}</label>
                  </div>
                </div>

                <div className="mt-6 flex gap-2 justify-end">
                  <Button variant="secondary" className="px-3 py-1 text-sm" onClick={clearFilters}>{t('incidents.clearFilters') || 'Clear filters'}</Button>
                  <Button variant="brand" className="px-3 py-1 text-sm" onClick={applyFilters}>{t('incidents.applyFilters') || 'Apply filters'}</Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
            <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={t("ui.Incidents.masAcciones", "Más acciones")}>
                  <EllipsisVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => toast(t('incidents.export') + ' not implemented')}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> {t('incidents.export')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast(t('incidents.filters') + ' not implemented')}>
                  <Printer className="mr-2 h-4 w-4" /> {t('incidents.filters')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast(t('incidents.email') + ' not implemented')}>
                  <Mail className="mr-2 h-4 w-4" /> {t('incidents.email')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="brand" onClick={() => navigate('/dispatch-tickets/new', { state: { duplicate: { clientId: site?.clientAccountId || site?.clientId || site?.client?.id || undefined, siteId: site?.id, siteName: site?.name } } })}>{t('incidents.newIncident')}</Button>
          </div>
        </div>

        {loading ? (
          <SkeletonCards count={4} className="mt-4" />
        ) : (
          <>
          {/* `overflow-x-auto`, no `overflow-hidden`: siete columnas con fecha no
              caben en un teléfono y lo que sobraba se recortaba sin poder verlo. */}
          <div className="mt-4 overflow-x-auto rounded-lg border">
              <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b">
                    <th className="cg-eyebrow px-2 py-2">
                      <Checkbox
                        checked={visibleRows.length > 0 && visibleRows.every((r) => selectedIds.includes(r.id))}
                        onCheckedChange={(v) => {
                          const checked = Boolean(v);
                          if (checked) {
                            setSelectedIds((prev) => {
                              const ids = new Set(prev);
                              visibleRows.forEach((r) => ids.add(r.id));
                              return Array.from(ids);
                            });
                          } else {
                            setSelectedIds((prev) => prev.filter((id) => !visibleRows.some((r) => r.id === id)));
                          }
                        }}
                      />
                    </th>
                    <th className="cg-eyebrow px-2 py-2">{t('incidents.columns.ticket') || 'Ticket'}</th>
                    <th className="cg-eyebrow px-2 py-2">{t('incidents.columns.date') || 'Date'}</th>
                    <th className="cg-eyebrow px-2 py-2">{t('incidents.columns.caller') || 'Caller'}</th>
                    <th className="cg-eyebrow px-2 py-2">{t('incidents.columns.incidentType') || 'Incident type'}</th>
                    <th className="cg-eyebrow px-2 py-2">{t('incidents.columns.status') || 'Status'}</th>
                    <th className="cg-eyebrow px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                        {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12">
                      <EmptyState
                        icon={<Filter />}
                        title={t('incidents.emptyTitle', 'Sin incidentes para esta sede.')}
                        description={t('incidents.emptyMessage', 'Ajusta los filtros o crea un incidente nuevo.')}
                      />
                    </td>
                  </tr>
                ) : (
                  visibleRows
                    .filter((it) => {
                      if (!searchTerm) return true;
                      const s = String(searchTerm).toLowerCase();
                      const title = String(it.title || it.type || it.description || it.content || '').toLowerCase();
                      const caller = String(it.callerName || it.informer || it.informador || it.informadorName || it.guardName?.fullName || it.guardName?.name || '').toLowerCase();
                      const incidentType = String((it.incidentType && (it.incidentType.name || it.incidentType.id)) || it.incidentTypeId || it.incidentType || '').toLowerCase();
                      const assignedMatch = (assignedGuards || []).some((g: any) => {
                        const name = String(g.fullName || g.name || g.guardName || (g.user && (g.user.fullName || g.user.name)) || g.id || '').toLowerCase();
                        return name.includes(s);
                      });
                      return title.includes(s) || caller.includes(s) || incidentType.includes(s) || assignedMatch;
                    })
                    .map((it) => (
                      <tr key={it.id} className="border-b">
                        <td className="px-2 py-2.5">
                          <Checkbox
                            checked={selectedIds.includes(it.id)}
                            onCheckedChange={(v) => {
                              const checked = Boolean(v);
                              setSelectedIds((prev) => {
                                if (checked) {
                                  if (prev.includes(it.id)) return prev;
                                  return [...prev, it.id];
                                }
                                return prev.filter((id) => id !== it.id);
                              });
                            }}
                          />
                        </td>
                        <td className="px-2 py-2.5" title={it.id}>{it.id ? String(it.id).substring(0, 8) : '-'}</td>
                        <td className="px-2 py-2.5 text-sm text-foreground">{it.incidentAt || it.date || it.createdAt || it.created_at ? new Date(it.incidentAt || it.date || it.createdAt || it.created_at).toLocaleString() : '-'}</td>
                        
                        <td className="px-2 py-2.5 text-sm text-foreground">{it.callerName || it.callerType || it.guardName?.fullName || it.guardName?.name || '-'}</td>
                        <td className="px-2 py-2.5 text-sm text-foreground">{(it.incidentType && (it.incidentType.name || it.incidentType.id)) ? (it.incidentType.name || it.incidentType.id) : (it.incidentTypeId || '-')}</td>
                        <td className="px-2 py-2.5">
                          {
                            (() => {
                              // Prefer the granular workStatus (a supervisor may
                              // have set In-progress/Resolved); fall back to the
                              // binary status.
                              const ws = ((it as any).workStatus || '').toString();
                              if (ws === 'inProgress') return <StatusBadge tone="amber">En progreso</StatusBadge>;
                              if (ws === 'resolved') return <StatusBadge tone="green">Resuelto</StatusBadge>;
                              if (ws === 'closed') return <StatusBadge tone="green">{t('comun.cerrado')}</StatusBadge>;
                              if (ws === 'open') return <StatusBadge tone="red">{t('comun.abierto')}</StatusBadge>;

                              const s = (it.status || '').toString().toLowerCase();
                              if (s === 'cerrado' || s === 'closed') {
                                return <StatusBadge tone="green">{t('comun.cerrado')}</StatusBadge>;
                              }

                              if (s === 'abierto' || s === 'open') {
                                return <StatusBadge tone="red">{t('comun.abierto')}</StatusBadge>;
                              }

                              return <StatusBadge tone="slate">{it.status || '-'}</StatusBadge>;
                            })()
                          }
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label={t("ui.Incidents.masAcciones", "Más acciones")}>
                                <EllipsisVertical className="h-5 w-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuItem onClick={() => navigate(`/dispatch-tickets/${it.id}`, { state: { resource: 'incident' } })}>
                                <div className="flex items-center w-full">
                                  <Eye className="mr-2 h-4 w-4" />
                                  {t('incidents.actions.view') || 'View'}
                                </div>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => window.open(`${window.location.origin}/dispatch-tickets/${it.id}?resource=incident`, '_blank')}>
                                <div className="flex items-center">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  {t('incidents.actions.open') || 'Open'}
                                </div>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleCreateDispatchFromIncident(it)}>
                                <div className="flex items-center">
                                  <Edit className="mr-2 h-4 w-4" />
                                  {t('incidents.actions.createDispatch') || 'Create Dispatch'}
                                </div>
                              </DropdownMenuItem>
                            
                              <DropdownMenuItem onClick={() => handleViewDetails(it)}>
                                <div className="flex items-center w-full">
                                  <Eye className="mr-2 h-4 w-4" />
                                  {t('dispatcher.view_details')}
                                </div>
                              </DropdownMenuItem>

                              <DropdownMenuItem onClick={() => handleOpenInNewTab(it)}>
                                <div className="flex items-center">
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  {t('dispatcher.open_new_tab')}
                                </div>
                              </DropdownMenuItem>

                              <DropdownMenuItem onClick={() => handleGenerateShareableLink(it)}>
                                <div className="flex items-center">
                                  <FileDown className="mr-2 h-4 w-4" />
                                  {t('dispatcher.generate_share_link')}
                                </div>
                              </DropdownMenuItem>

                              <DropdownMenuItem onClick={() => handleEditIncident(it)}>
                                <div className="flex items-center">
                                  <Edit className="mr-2 h-4 w-4" />
                                  {t('dispatcher.edit')}
                                </div>
                              </DropdownMenuItem>

                              <DropdownMenuItem onClick={async () => { setDispatchFor(it); setSelSup(''); try { const r = await supervisorService.list(); setSups(r.rows || []); } catch { setSups([]); } }}>
                                <div className="flex items-center">
                                  {t('incidents.dispatchToSupervisor', { defaultValue: 'Despachar a supervisor' })}
                                </div>
                              </DropdownMenuItem>

                              {!["cerrado", "closed"].includes(((it.status || it.estado || it.state || '').toString().toLowerCase())) && (
                                <DropdownMenuItem onClick={() => handleCloseTicket(it)}>
                                  <div className="flex items-center">
                                    <X className="mr-2 h-4 w-4 inline-block" />
                                    {t('dispatcher.close_ticket')}
                                  </div>
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem onClick={() => handleDeleteIncident(it)}>
                                <div className="flex items-center" style={{ color: 'var(--bad-text)' }}>
                                  <Trash2 className="mr-2 h-4 w-4 inline-block" />
                                  {t('dispatcher.action_delete_label')}
                                </div>
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

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Select onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-[96px] h-9">
                    <SelectValue placeholder={String(limit)} />
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
                <Button variant="outline" size="sm" disabled={page === 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>{t('incidents.prev') || 'Prev'}</Button>
                <Button variant="outline" size="sm" disabled={page * limit >= totalCount || loading} onClick={() => setPage((p) => p + 1)}>{t('incidents.next') || 'Next'}</Button>
              </div>
            </div>
          </>
        )}
      </div>



      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('incidents.createDispatch') || 'Create Dispatch'}</DialogTitle>
          </DialogHeader>
                <div className="space-y-3 mt-2 max-w-sm mx-auto">
            <div>
              <label className="block text-sm font-medium text-foreground">{t('incidents.labels.station') || 'Station'}</label>
              <Select value={selectedStationId || ''} onValueChange={(v) => setSelectedStationId(v || undefined)}>
                <SelectTrigger>
                  <SelectValue placeholder={stationOptions && stationOptions.length > 0 ? (t('incidents.selectStation') || 'Select station') : (t('incidents.noStations') || 'No stations')} />
                </SelectTrigger>
                <SelectContent>
                  {stationOptions && stationOptions.length > 0 ? stationOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name || s.id}</SelectItem>
                    )) : <SelectItem key="__no_stations" value="__no_stations" disabled>{t('incidents.noStations') || 'No stations'}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {/* exact-station field removed (was causing undefined state errors) */}
            <div>
              <label className="block text-sm font-medium text-foreground">{t('incidents.labels.subject') || 'Subject'}</label>
              <Input value={newSubject} onChange={(e) => setNewSubject((e.target as HTMLInputElement).value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">{t('incidents.labels.description') || 'Description'}</label>
              <Textarea value={newContent} onChange={(e) => setNewContent((e.target as HTMLTextAreaElement).value)} />
            </div>
          </div>
          <DialogFooter>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>{t('incidents.cancel') || 'Cancel'}</Button>
              <Button onClick={handleCreateDispatch} disabled={creating}>{creating ? (t('incidents.creating') || 'Creating...') : (t('incidents.create') || 'Create')}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch an incident to a supervisor */}
      <Dialog open={!!dispatchFor} onOpenChange={(o) => { if (!o) setDispatchFor(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('incidents.dispatchToSupervisor', { defaultValue: 'Despachar a supervisor' })}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t('incidents.dispatchHint', { defaultValue: 'El supervisor recibirá una notificación para aceptar y marcar en camino / en sitio.' })}
            </p>
            <select
              value={selSup}
              onChange={(e) => setSelSup(e.target.value)}
              className={FIELD_CLS_LG}
            >
              <option value="">{t('incidents.selectSupervisor', { defaultValue: '— Selecciona un supervisor —' })}</option>
              {sups.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}{s.isOnDuty ? ' • en turno' : ''}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDispatchFor(null)}>{t('incidents.cancel') || 'Cancelar'}</Button>
            <Button
              disabled={!selSup || dispatching}
              onClick={async () => {
                if (!selSup || !dispatchFor) return;
                const tid = site?.tenantId || localStorage.getItem('tenantId') || '';
                if (!tid) { toast.error('Tenant missing'); return; }
                setDispatching(true);
                try {
                  await ApiService.post(`/tenant/${tid}/incident/${dispatchFor.id}/assign-supervisor`, { supervisorUserId: selSup });
                  toast.success(t('incidents.dispatched', { defaultValue: 'Incidente despachado al supervisor' }));
                  setIncidents((prev) => prev.map((p) => (p.id === dispatchFor.id ? { ...p, dispatchStatus: 'dispatched', assignedToUserId: selSup } : p)));
                  setDispatchFor(null);
                } catch (e: any) {
                  toast.error(e?.message || 'No se pudo despachar');
                } finally {
                  setDispatching(false);
                }
              }}
            >
              {dispatching ? (t('incidents.dispatching', { defaultValue: 'Despachando…' }) as string) : (t('incidents.dispatch', { defaultValue: 'Despachar' }) as string)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
