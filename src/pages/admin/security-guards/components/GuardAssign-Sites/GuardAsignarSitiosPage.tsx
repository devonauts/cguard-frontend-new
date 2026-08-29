import React from 'react';
import { useParams } from 'react-router-dom';
import AppLayout from '@/layouts/app-layout';
import GuardsLayout from '@/layouts/GuardsLayout';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, X, Trash2, MapPin, Building2, Briefcase, Clock } from 'lucide-react';
import securityGuardService from '@/lib/api/securityGuardService';
import api from '@/lib/api';
import { stationService } from '@/lib/api/stationService';
import { toast } from 'sonner';
import PostSiteMiniInfo from '@/components/post-sites/PostSiteMiniInfo';
import { Section, EmptyState, StatusBadge, Modal, IconTile, SkeletonBlock } from '@/components/kit';
import { clientDisplayName } from '@/lib/clientName';
import { Button } from '@/components/ui/button';


import { localeActual } from '@/lib/localeActual'
// ── Safe label extraction ────────────────────────────────────────────────────
// The backend may return raw association OBJECTS (full Sequelize models) for
// client / postSite / station. Rendering an object directly as a JSX child
// throws React error #31 ("Objects are not valid as a React child"). This helper
// always returns a printable string, whether given a string, number, or object.
const labelOf = (val: any): string | null => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val.trim() || null;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') {
    const candidate =
      // commercialName first: for a client-shaped object every later candidate
      // resolves to the legal representative, not the company.
      val.commercialName ??
      val.stationName ?? val.companyName ?? val.postSiteName ?? val.fullName ??
      val.name ?? val.label ?? val.clientName ?? val.clientFullName ??
      val.title ?? val.id ?? null;
    if (candidate === null || candidate === undefined) return null;
    return typeof candidate === 'string' ? (candidate.trim() || null) : String(candidate);
  }
  return String(val);
};

// ── Shift-window formatting ──────────────────────────────────────────────────
const fmtDateTime = (v: any): string | null => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString(localeActual(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const shiftWindow = (start: any, end: any): string | null => {
  const a = fmtDateTime(start);
  const b = fmtDateTime(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || null;
};

// Date-only formatting for the grouped station card's shift date range.
const fmtDateOnly = (v: any): string | null => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(localeActual(), { day: '2-digit', month: 'short', year: 'numeric' });
};
const dateRange = (start: any, end: any): string | null => {
  const a = fmtDateOnly(start);
  const b = fmtDateOnly(end);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a || b || null;
};

type Assignment = {
  id: string; // REAL shift id — used for unassign (DELETE /shift?ids=<id>)
  client: string | null;
  postSite: string | null;
  station: string | null;
  startTime: any;
  endTime: any;
  businessInfoId?: string | null;
};

// A station-level assignment: all shifts for one (station · post · client) rolled
// up so we render ONE card per station instead of one row per generated shift.
type StationGroup = {
  key: string;
  client: string | null;
  postSite: string | null;
  station: string | null;
  earliest: any; // earliest shift startTime
  latest: any;   // latest shift endTime
  shiftIds: string[]; // every real shift id in the group (used for unassign)
};

export default function GuardAsignarSitiosPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [mappings, setMappings] = useState<Assignment[]>([]);
  const [query, setQuery] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // ── Load the guard's real assignments (single source of truth) ──────────────
  const loadAssignments = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { rows } = await securityGuardService.getAssignments(String(id));
      const base: Assignment[] = (rows || []).map((r: any) => ({
        id: String(r.id ?? ''),
        client: labelOf(r.clientName),
        postSite: labelOf(r.postSiteName),
        station: labelOf(r.stationName),
        startTime: r.startTime ?? null,
        endTime: r.endTime ?? null,
        businessInfoId: r.businessInfoId ?? null,
      }));

      // Enrichment: resolve any missing station/post/client names from the
      // post-site (station) resource when the joined query left them blank.
      const enriched: Assignment[] = await Promise.all(
        base.map(async (item) => {
          if ((item.client && item.postSite && item.station) || !item.businessInfoId) return item;
          try {
            const post: any = await stationService.get(item.businessInfoId);
            return {
              ...item,
              station: item.station ?? labelOf(post.station) ?? labelOf(post.stationName) ?? labelOf(post.name),
              postSite: item.postSite ?? labelOf(post.companyName) ?? labelOf(post.postSiteName) ?? labelOf(post.name),
              client:
                item.client ??
                labelOf(post.client) ??
                labelOf(post.clientAccount) ??
                labelOf(post.clientAccountName),
            };
          } catch {
            return item;
          }
        }),
      );

      setMappings(enriched);
    } catch (err) {
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // Reload when assignments change elsewhere in the app.
  useEffect(() => {
    const handler = () => loadAssignments();
    window.addEventListener('assignments:changed', handler as EventListener);
    return () => window.removeEventListener('assignments:changed', handler as EventListener);
  }, [loadAssignments]);

  // ── Assign modal state ──────────────────────────────────────────────────────
  const actionRef = useRef<HTMLDivElement | null>(null);
  // Delete context: the exact shift ids to remove + a human label + count.
  const [deleteCtx, setDeleteCtx] = useState<{ ids: string[]; label: string; count: number } | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [postSites, setPostSites] = useState<Array<{ id: string; name: string }>>([]);
  const [stationsForPostSite, setStationsForPostSite] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedStationAssign, setSelectedStationAssign] = useState<string>('');
  const [selectedStart, setSelectedStart] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [selectedEnd, setSelectedEnd] = useState<string>(() =>
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedPostSite, setSelectedPostSite] = useState('');
  const [assigning, setAssigning] = useState(false);

  // ── Roll shift rows up into ONE group per station ───────────────────────────
  const groups: StationGroup[] = (() => {
    const map = new Map<string, StationGroup>();
    for (const m of mappings) {
      const key = `${m.businessInfoId ?? ''}|${m.station ?? ''}|${m.postSite ?? ''}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          client: m.client,
          postSite: m.postSite,
          station: m.station,
          earliest: m.startTime,
          latest: m.endTime,
          shiftIds: [],
        };
        map.set(key, g);
      }
      if (m.id) g.shiftIds.push(m.id);
      // Backfill labels from any row in the group that has them.
      g.client = g.client ?? m.client;
      g.postSite = g.postSite ?? m.postSite;
      g.station = g.station ?? m.station;
      // Track the earliest start / latest end across the group's shifts.
      if (m.startTime && (!g.earliest || new Date(m.startTime) < new Date(g.earliest))) g.earliest = m.startTime;
      if (m.endTime && (!g.latest || new Date(m.endTime) > new Date(g.latest))) g.latest = m.endTime;
    }
    return Array.from(map.values());
  })();

  // ── Search-filtered grouped list ────────────────────────────────────────────
  const q = query.trim().toLowerCase();
  const filtered = q
    ? groups.filter((g) =>
        [g.postSite, g.client, g.station, dateRange(g.earliest, g.latest)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      )
    : groups;

  const allSelected = filtered.length > 0 && filtered.every((g) => selectedKeys.includes(g.key));
  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedKeys(filtered.map((g) => g.key));
    else setSelectedKeys([]);
  };

  // ── Assign (keeps the working assign-guard adapter flow) ────────────────────
  const assignSite = () => {
    if (!selectedClient || !selectedPostSite) {
      toast.error(t('guards.assignSites.errors.selectClientSite', { defaultValue: 'Selecciona un cliente y un puesto' }));
      return;
    }
    if (!selectedStart || !selectedEnd) {
      toast.error(t('guards.assignSites.errors.selectTimes', { defaultValue: 'Selecciona hora de inicio y fin' }));
      return;
    }
    const s = new Date(selectedStart);
    const e = new Date(selectedEnd);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s.getTime() >= e.getTime()) {
      toast.error(t('guards.assignSites.errors.timeOrder', { defaultValue: 'La hora de inicio debe ser anterior a la hora de fin' }));
      return;
    }

    (async () => {
      setAssigning(true);
      try {
        const tenantId = localStorage.getItem('tenantId');
        if (!tenantId) {
          toast.error(t('guards.assignSites.errors.noTenant', { defaultValue: 'No se pudo determinar la organización' }));
          return;
        }
        // Resolve the guard's user id (assign-guard adapter also resolves it,
        // but we send the best identifier we can).
        let guardUserId: string | null = null;
        try {
          const sg: any = await securityGuardService.get(String(id));
          const sgRec = sg && (sg.guard || sg) ? (sg.guard || sg) : sg;
          guardUserId = sgRec?.id || sgRec?.guardId || null;
        } catch {
          /* fall back to route id */
        }
        const securityGuardIdentifier = guardUserId || id;

        const pad = (n: number) => String(n).padStart(2, '0');
        const startDate = `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
        const startTime = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
        const endTime = `${pad(e.getHours())}:${pad(e.getMinutes())}`;

        const assignPayload = {
          securityGuardId: securityGuardIdentifier,
          ...(selectedStationAssign ? { stationId: selectedStationAssign } : {}),
          startDate,
          startTime,
          endTime,
        } as any;
        const routeStationOrSite = selectedStationAssign || selectedPostSite;

        await api.post(
          `/tenant/${tenantId}/stations/${routeStationOrSite}/assign-guard`,
          assignPayload,
          { toast: { success: t('guards.assignSites.assigned', { defaultValue: 'Vigilante asignado' }) } } as any,
        );

        setSelectedClient('');
        setSelectedPostSite('');
        setSelectedStationAssign('');
        setAssignModalOpen(false);
        try {
          window.dispatchEvent(new CustomEvent('assignments:changed', { detail: { action: 'assign' } }));
        } catch {
          /* noop */
        }
        await loadAssignments();
      } catch (err) {
        toast.error(t('guards.assignSites.errors.assignFailed', { defaultValue: 'No se pudo asignar el puesto' }));
      } finally {
        setAssigning(false);
      }
    })();
  };

  // ── Unassign — removes EVERY shift in the station group ─────────────────────
  const confirmDelete = async () => {
    const tenantId = localStorage.getItem('tenantId');
    // Only allow delete when REAL shift ids exist.
    const idsToDelete = (deleteCtx?.ids ?? []).filter((v) => v && v.trim());
    if (!tenantId || idsToDelete.length === 0) {
      toast.error(t('guards.assignSites.errors.noneToDelete', { defaultValue: 'No hay asignaciones válidas para eliminar' }));
      setDeleteCtx(null);
      return;
    }
    try {
      const queryStr = idsToDelete.map((v) => `ids=${encodeURIComponent(v)}`).join('&');
      await api.delete(`/tenant/${tenantId}/shift?${queryStr}`);
      toast.success(t('guards.assignSites.actions.deleted', { defaultValue: 'Asignación eliminada' }));
      setSelectedKeys([]);
      setDeleteCtx(null);
      try {
        window.dispatchEvent(new CustomEvent('assignments:changed', { detail: { action: 'delete', ids: idsToDelete } }));
      } catch {
        /* noop */
      }
      await loadAssignments();
    } catch (err) {
      toast.error(t('guards.assignSites.actions.deleteFailed', { defaultValue: 'No se pudo eliminar la asignación' }));
      setDeleteCtx(null);
    }
  };

  // Build a delete context for a set of station groups (used by both the
  // per-station trash button and the bulk "Quitar" action).
  const requestDelete = (grps: StationGroup[]) => {
    const valid = grps.filter((g) => g.shiftIds.length > 0);
    if (valid.length === 0) {
      toast.error(t('guards.assignSites.errors.noneToDelete', { defaultValue: 'No hay asignaciones válidas para eliminar' }));
      return;
    }
    const ids = valid.flatMap((g) => g.shiftIds);
    const label =
      valid.length === 1
        ? (valid[0].station || valid[0].postSite || t('guards.assignSites.thisPost', { defaultValue: 'este puesto' }))
        : t('guards.assignSites.nStations', { defaultValue: '{{count}} estaciones', count: valid.length });
    setDeleteCtx({ ids, label: String(label), count: ids.length });
  };

  // Load clients when opening assign modal
  useEffect(() => {
    if (!assignModalOpen) return;
    let mounted = true;
    (async () => {
      try {
        const tenantId = localStorage.getItem('tenantId');
        if (!tenantId) return;
        const resp = await api.get(`/tenant/${tenantId}/client-account?limit=200&offset=0`);
        const data = (resp as any)?.data ?? resp;
        const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
        if (!mounted) return;
        // "Cliente" means the COMPANY. This used to build `${name} ${lastName}`,
        // which is the legal representative — unrecognisable to whoever is
        // reassigning a vigilante. clientDisplayName prefers commercialName.
        const items = rows.map((r: any) => ({
          id: String(r.id ?? ''),
          name: clientDisplayName(r, String(r.id ?? '')),
        }));
        setClients(items);
      } catch (err) {
        /* ignore — clients simply won't populate */
      }
    })();
    return () => { mounted = false; };
  }, [assignModalOpen]);

  // When a client is selected, load their post sites
  useEffect(() => {
    if (!selectedClient) { setPostSites([]); return; }
    let mounted = true;
    (async () => {
      try {
        const tenantId = localStorage.getItem('tenantId');
        if (!tenantId) return;
        const list = await stationService.list({ clientId: selectedClient } as any, { limit: 200, offset: 0 });
        const items = (list.rows || []).map((r: any) => ({
          id: String(r.id ?? ''),
          name: labelOf(r.companyName || r.postSiteName || r.name || r.stationName || r.label) ?? labelOf(r) ?? String(r.id ?? ''),
        }));
        if (!mounted) return;
        setPostSites(items);
      } catch (err) {
        setPostSites([]);
      }
    })();
    return () => { mounted = false; };
  }, [selectedClient]);

  // When a postSite is selected in the assign modal, load its stations
  useEffect(() => {
    if (!selectedPostSite) { setStationsForPostSite([]); setSelectedStationAssign(''); return; }
    let mounted = true;
    (async () => {
      try {
        const tenantId = localStorage.getItem('tenantId');
        if (!tenantId) return;
        const list = await stationService.list({ postSiteId: selectedPostSite } as any, { limit: 200, offset: 0 });
        const rawRows = (list.rows || []);
        const mapped = rawRows.map((r: any) => ({
          id: String(r.id ?? ''),
          name: labelOf(r.stationName || r.name || r.companyName || r.postSiteName || r.label) ?? labelOf(r) ?? String(r.id ?? ''),
        }));
        const deduped: Array<{ id: string; name: string }> = [];
        const seenIds = new Set<string>();
        const seenNames = new Set<string>();
        for (const it of mapped) {
          if (!it || !it.id) continue;
          if (it.id === selectedPostSite) continue; // don't show the postSite as a station
          if (seenIds.has(it.id)) continue;
          if (seenNames.has(String(it.name).toLowerCase())) continue;
          seenIds.add(it.id);
          seenNames.add(String(it.name).toLowerCase());
          deduped.push(it);
        }
        if (!mounted) return;
        setStationsForPostSite(deduped);
        if (deduped.length) setSelectedStationAssign(deduped[0].id);
      } catch (err) {
        if (mounted) { setStationsForPostSite([]); setSelectedStationAssign(''); }
      }
    })();
    return () => { mounted = false; };
  }, [selectedPostSite]);

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.asignarSitios">
        <div className="mx-auto max-w-5xl space-y-6">
          <Section
            title={t('guards.assignSites.table.postSites', { defaultValue: 'Puesto y estaciones' })}
            icon={<Building2 className="w-4 h-4" />}
            action={
              <div className="flex items-center gap-2">
                <div className="relative hidden sm:block">
                  <Search size={15} className="absolute left-2.5 top-2.5" style={{ color: 'var(--ink-faint)' }} />
                  <input
                    type="text"
                    placeholder={t('guards.assignSites.searchPlaceholder', { defaultValue: 'Buscar puesto o estación' })}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="cg-input h-9 w-52 pl-8 pr-3 text-sm"
                  />
                </div>
                <div className="relative" ref={actionRef}>
                  <button
                    onClick={() => {
                      if (!selectedKeys || selectedKeys.length === 0) {
                        toast.error(t('guards.assignSites.actions.selectPair', { defaultValue: 'Selecciona al menos una estación para eliminar' }));
                        return;
                      }
                      requestDelete(groups.filter((g) => selectedKeys.includes(g.key)));
                    }}
                    disabled={selectedKeys.length === 0}
                    className="cg-btn-glass cg-focus inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: 'var(--bad-text)' }}
                  >
                    <Trash2 size={15} />
                    {t('guards.assignSites.actions.delete', { defaultValue: 'Quitar' })}
                    {selectedKeys.length > 0 && (
                      <span
                        className="ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums"
                        style={{ background: 'color-mix(in oklab, var(--bad) 16%, transparent)' }}
                      >
                        {selectedKeys.length}
                      </span>
                    )}
                  </button>
                </div>
                <Button variant="brand" size="sm" onClick={() => setAssignModalOpen(true)}>
                  <Plus size={16} />
                  {t('guards.assignSites.assignButton', { defaultValue: 'Asignar puesto' })}
                </Button>
              </div>
            }
          >
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <SkeletonBlock key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : mappings.length === 0 ? (
              <EmptyState
                icon={<MapPin />}
                title={t('guards.assignSites.empty', { defaultValue: 'Sin puestos asignados todavía' })}
                description={t('guards.assignSites.emptyHint', { defaultValue: 'Asigna un puesto para empezar.' })}
                action={
                  <Button variant="brand" onClick={() => setAssignModalOpen(true)}>
                    <Plus size={16} />
                    {t('guards.assignSites.assignButton', { defaultValue: 'Asignar puesto' })}
                  </Button>
                }
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title={t('guards.assignSites.noResults', { defaultValue: 'Sin resultados' })}
                description={t('guards.assignSites.noResultsHint', { defaultValue: 'Ninguna asignación coincide con la búsqueda.' })}
              />
            ) : (
              <div className="space-y-2.5">
                <label className="cg-eyebrow flex cursor-pointer select-none items-center gap-2 px-1">
                  <input
                    type="checkbox"
                    aria-label="select all"
                    checked={allSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded" style={{ accentColor: 'var(--brand)' }}
                  />
                  {t('guards.assignSites.selectAll', { defaultValue: 'Seleccionar todo' })}
                </label>
                {filtered.map((g) => {
                  const checked = selectedKeys.includes(g.key);
                  const postSiteLabel = labelOf(g.postSite);
                  const clientLabel = labelOf(g.client);
                  const stationLabel = labelOf(g.station);
                  const rangeLabel = dateRange(g.earliest, g.latest);
                  const count = g.shiftIds.length;
                  return (
                    <div
                      key={g.key}
                      className={`glass-flat group flex items-center gap-3 p-3.5 transition ${checked ? 'glass-brand' : 'glass-hover'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedKeys((prev) => [...prev, g.key]);
                          else setSelectedKeys((prev) => prev.filter((x) => x !== g.key));
                        }}
                        className="h-4 w-4 shrink-0 rounded" style={{ accentColor: 'var(--brand)' }}
                      />
                      <IconTile tone="brand" size="sm"><Building2 /></IconTile>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{postSiteLabel || stationLabel || '—'}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                          <span className="inline-flex items-center gap-1 truncate">
                            <Briefcase className="w-3 h-3 shrink-0" />
                            {clientLabel || '—'}
                          </span>
                          {stationLabel && stationLabel !== '-' && (
                            <StatusBadge tone="neutral" dot={false}>
                              <MapPin className="w-3 h-3 shrink-0" />
                              {stationLabel}
                            </StatusBadge>
                          )}
                          {rangeLabel && (
                            <StatusBadge tone="brand" dot={false}>
                              <Clock className="w-3 h-3 shrink-0" />
                              {rangeLabel}
                            </StatusBadge>
                          )}
                          <StatusBadge tone="neutral" dot={false}>
                            {t('guards.assignSites.shiftCount', { defaultValue: '{{count}} turnos', count })}
                          </StatusBadge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => requestDelete([g])}
                        title={t('guards.assignSites.actions.removeFromPost', { defaultValue: 'Quitar del puesto' })}
                        className="shrink-0 hover:[color:var(--bad-text)]"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        {/* Assign Modal/Drawer */}
        {assignModalOpen && (
          <div className="glass-scrim fixed inset-0 z-50" onClick={() => setAssignModalOpen(false)}>
            <div className="glass-raised fixed bottom-0 right-0 top-0 flex w-full max-w-md flex-col rounded-l-3xl rounded-r-none" style={{ position: 'fixed' }} onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-b p-5" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-solid)' }}>
                <div className="flex items-center gap-2.5">
                  <IconTile tone="brand" size="sm"><MapPin /></IconTile>
                  <h3 className="text-base font-semibold tracking-tight">{t('guards.assignSites.modal.title', { defaultValue: 'Asignar puesto' })}</h3>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setAssignModalOpen(false)} aria-label={t('actions.close')}><X size={18} /></Button>
              </div>

              <div className="p-5 overflow-y-auto flex-1">
                <div className="space-y-5">
                  <div>
                    <label className="cg-eyebrow mb-1.5 block">{t('guards.assignSites.form.client', { defaultValue: 'Cliente' })}<span className="ml-0.5" style={{ color: 'var(--bad-text)' }}>*</span></label>
                    <select value={selectedClient} onChange={(e) => setSelectedClient(e.target.value)} className="cg-input flex h-9 w-full px-2 text-sm">
                      <option value="">{t('guards.assignSites.form.selectClient', { defaultValue: 'Selecciona cliente' })}</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="cg-eyebrow mb-1.5 block">{t('guards.assignSites.form.postSite', { defaultValue: 'Puesto' })}<span className="ml-0.5" style={{ color: 'var(--bad-text)' }}>*</span></label>
                    <select value={selectedPostSite} onChange={(e) => setSelectedPostSite(e.target.value)} className="cg-input mb-2 flex h-9 w-full px-2 text-sm disabled:opacity-60" disabled={!selectedClient}>
                      <option value="">{t('guards.assignSites.form.selectPostSite', { defaultValue: 'Selecciona puesto' })}</option>
                      {postSites.length === 0 && selectedClient && (
                        <option disabled value="">{t('guards.assignSites.noPostSites', { defaultValue: 'No hay puestos disponibles' })}</option>
                      )}
                      {postSites.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {selectedPostSite && (
                      <div className="glass-sunken mt-2 p-3">
                        <React.Suspense fallback={<div className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t('guards.assignSites.loadingPostSite', { defaultValue: 'Cargando información del puesto…' })}</div>}>
                          <PostSiteMiniInfo postSiteId={selectedPostSite} />
                        </React.Suspense>
                      </div>
                    )}
                  </div>

                  {selectedPostSite && (
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">{t('guards.assignSites.form.station', { defaultValue: 'Estación' })}</label>
                      <select value={selectedStationAssign} onChange={(e) => setSelectedStationAssign(e.target.value)} className="cg-input flex h-9 w-full px-2 text-sm">
                        <option value="">{t('guards.assignSites.form.selectStation', { defaultValue: 'Selecciona estación' })}</option>
                        {stationsForPostSite.length === 0 && selectedPostSite && (
                          <option disabled value="">{t('guards.assignSites.noStations', { defaultValue: 'No hay estaciones disponibles' })}</option>
                        )}
                        {stationsForPostSite.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">{t('guards.assignSites.form.start', { defaultValue: 'Inicio' })}<span className="ml-0.5" style={{ color: 'var(--bad-text)' }}>*</span></label>
                      <input type="datetime-local" value={selectedStart} onChange={(e) => setSelectedStart(e.target.value)} className="cg-input flex h-9 w-full px-2 text-sm" />
                    </div>
                    <div>
                      <label className="cg-eyebrow mb-1.5 block">{t('guards.assignSites.form.end', { defaultValue: 'Fin' })}<span className="ml-0.5" style={{ color: 'var(--bad-text)' }}>*</span></label>
                      <input type="datetime-local" value={selectedEnd} onChange={(e) => setSelectedEnd(e.target.value)} className="cg-input flex h-9 w-full px-2 text-sm" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t p-4" style={{ borderColor: 'var(--hairline)', background: 'var(--glass-solid)' }}>
                <Button variant="outline" onClick={() => setAssignModalOpen(false)}>{t('guards.assignSites.modal.cancel', { defaultValue: 'Cancelar' })}</Button>
                <Button variant="brand" onClick={assignSite} disabled={assigning}>
                  <Plus size={16} />
                  {t('guards.assignSites.modal.assign', { defaultValue: 'Asignar' })}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation modal */}
        {deleteCtx && (
          <Modal
            open={!!deleteCtx}
            onOpenChange={(o) => { if (!o) setDeleteCtx(null); }}
            title={t('guards.assignSites.actions.confirmDeleteTitle', { defaultValue: 'Confirmar eliminación' })}
            icon={<Trash2 className="h-5 w-5" />}
            size="sm"
            footer={
              <>
                <Button variant="outline" onClick={() => setDeleteCtx(null)}>{t('guards.assignSites.modal.cancel', { defaultValue: 'Cancelar' })}</Button>
                <Button variant="destructive" onClick={confirmDelete}><Trash2 size={15} />{t('guards.assignSites.actions.deleteConfirm', { defaultValue: 'Quitar' })}</Button>
              </>
            }
          >
            <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {t('guards.assignSites.actions.confirmDeleteStation', {
                defaultValue: '¿Quitar a este vigilante de {{station}}? Se eliminarán {{count}} turnos.',
                station: deleteCtx.label,
                count: deleteCtx.count,
              })}
            </p>
          </Modal>
        )}
      </GuardsLayout>
    </AppLayout>
  );
}

// Helper: update a shift record (tries RESTful /shift/:id then falls back to /shift payload)
export async function updateShift(id: string, payload: any) {
  try {
    const tenantId = localStorage.getItem('tenantId');
    if (!tenantId) throw new Error('missing tenantId');
    try {
      return await api.put(`/tenant/${tenantId}/shift/${encodeURIComponent(String(id))}`, { data: payload } as any);
    } catch (e) {
      return await api.put(`/tenant/${tenantId}/shift`, { data: { id, ...payload } } as any);
    }
  } catch (err) {
    throw err;
  }
}
