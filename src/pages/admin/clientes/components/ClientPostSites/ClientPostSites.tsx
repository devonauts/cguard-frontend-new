import { useEffect, useMemo, useState } from 'react';
import type { Client } from '@/types/client';
import { useNavigate } from 'react-router-dom';
import { clientService } from '@/lib/api/clientService';
import { postSiteService } from '@/lib/api/postSiteService';
import GoogleMapEmbed from '@/components/GoogleMap/GoogleMapEmbed';
import { Section, EmptyState, StatusBadge, IconTile, SkeletonCards } from '@/components/kit';
import { FIELD_CLS, TabTable, THead, Th, Tr } from '../_shared/tab-kit';
import { MeterBar } from '@/components/charts';
import type { ChartTone } from '@/lib/chartColors';
import { confirmDialog } from '@/components/ui/confirmDialog';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Building2, Search, MapPin, Users, Clock, BarChart3, MoreVertical, Pencil, Trash2, ExternalLink, LocateFixed } from 'lucide-react';
import type { ReactNode } from 'react';

// A post-site row from getClientPostSites (raw businessInfo columns).
interface PostSiteRow {
  id: string | number;
  latitud?: number | string | null; latitude?: number | string | null;
  longitud?: number | string | null; longitude?: number | string | null;
  placePictureUrl?: Array<{ downloadUrl?: string }> | null;
  city?: string; address?: string; active?: boolean;
}
interface SedeMeta { lat?: number; lng?: number; thumb?: string | null; city?: string; address?: string; active?: boolean; }
// A site node from getOperation().sites.
interface OperationStation { id: string; guards?: Array<{ id: string }>; }
interface OperationSite { id: string; name: string; address?: string; city?: string; active?: boolean; stations?: OperationStation[]; }

type Sede = {
  id: string;
  code: string;
  name: string;
  address: string;
  city: string;
  active: boolean;
  stations: number;
  guards: number;
  required: number;
  coverage: number; // 0-100
  lat?: number;
  lng?: number;
  thumb?: string | null;
};

/** Nivel de riesgo → tono semántico del sistema (fijo, no depende del acento). */
const riskTone = (r: string): 'bad' | 'warn' | 'ok' | 'neutral' => {
  const v = String(r || '').toLowerCase();
  return v.includes('alt') ? 'bad' : v.includes('med') ? 'warn' : v ? 'ok' : 'neutral';
};
/** Color del pin numerado por estado de cobertura. */
const markerFill = (role: string) =>
  role === 'ok' ? 'var(--ok)' : role === 'warn' ? 'var(--warn)' : role === 'crit' ? 'var(--bad)' : 'var(--ink-faint)';
const covTone = (c: number): ChartTone => (c >= 95 ? 'ok' : c >= 70 ? 'warn' : 'bad');
const markerRole = (s: Sede) => (!s.active ? 'muted' : s.coverage >= 95 ? 'ok' : s.coverage >= 70 ? 'warn' : 'crit');

export default function ClientPostSites({ client }: { client: Client }) {
  const navigate = useNavigate();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [tz, setTz] = useState<string>('');
  const [query, setQuery] = useState('');
  const [estado, setEstado] = useState('todos');
  const [ciudad, setCiudad] = useState('todas');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!client?.id) return;
      setLoading(true);
      const [op, ps, ov] = await Promise.all([
        clientService.getOperation(client.id).catch(() => ({ sites: [], looseStations: [] })),
        clientService.getClientPostSites(client.id, { limit: 999, offset: 0 }).catch(() => null),
        clientService.getClientOverview(client.id).catch(() => null),
      ]);
      if (!mounted) return;
      if (ov?.tenantTimezone) setTz(ov.tenantTimezone);
      const psRows: PostSiteRow[] = Array.isArray(ps) ? ps : (ps?.rows ?? []);
      const meta = new Map<string, SedeMeta>();
      for (const r of psRows) {
        meta.set(String(r.id), {
          lat: r.latitud != null ? Number(r.latitud) : (r.latitude != null ? Number(r.latitude) : undefined),
          lng: r.longitud != null ? Number(r.longitud) : (r.longitude != null ? Number(r.longitude) : undefined),
          thumb: Array.isArray(r.placePictureUrl) ? r.placePictureUrl[0]?.downloadUrl : null,
          city: r.city, address: r.address, active: r.active,
        });
      }
      const list: Sede[] = (op?.sites || []).map((s: OperationSite) => {
        const guards = new Set<string>();
        (s.stations || []).forEach((st) => (st.guards || []).forEach((g) => guards.add(String(g.id))));
        const stations = (s.stations || []).length;
        const required = stations; // 1 fijo por estación
        const m: SedeMeta = meta.get(String(s.id)) || {};
        const cov = required > 0 ? Math.min(100, Math.round((guards.size / required) * 100)) : 0;
        return {
          id: s.id, code: '', name: s.name,
          address: s.address || m.address || '', city: s.city || m.city || '',
          active: s.active !== undefined ? !!s.active : !!m.active,
          stations, guards: guards.size, required, coverage: cov,
          lat: m.lat, lng: m.lng, thumb: m.thumb,
        };
      });
      setSedes(list);
      setSelectedId(list[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [client?.id]);

  const cities = useMemo(() => Array.from(new Set(sedes.map((s) => s.city).filter(Boolean))), [sedes]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sedes.filter((s) => {
      if (q && !(`${s.name} ${s.address} ${s.code}`.toLowerCase().includes(q))) return false;
      if (estado === 'activa' && !s.active) return false;
      if (estado === 'inactiva' && s.active) return false;
      if (ciudad !== 'todas' && s.city !== ciudad) return false;
      return true;
    });
  }, [sedes, query, estado, ciudad]);

  const selected = sedes.find((s) => s.id === selectedId) || null;

  const deleteSede = async (s: Sede) => {
    const ok = await confirmDialog({
      title: 'Eliminar sede',
      message: `¿Eliminar la sede "${s.name}"? Sus estaciones, horarios y asignaciones dejarán de estar disponibles.`,
      confirmText: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await postSiteService.delete([s.id]);
      setSedes((prev) => prev.filter((x) => x.id !== s.id));
      if (selectedId === s.id) setSelectedId(null);
      toast.success('Sede eliminada');
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo eliminar la sede');
    }
  };
  const risk = client?.riskLevel || '';
  const mapMarkers = filtered.filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => ({ id: s.id, lat: s.lat!, lng: s.lng!, label: s.name, role: markerRole(s) }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Left: table */}
      <div className="lg:col-span-2">
        <Section title="Sedes" icon={<Building2 />}>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar sede por nombre o dirección" className={`${FIELD_CLS} pl-8`} />
            </div>
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className={FIELD_CLS}>
              <option value="todos">Estado: Todos</option>
              <option value="activa">Activa</option>
              <option value="inactiva">Inactiva</option>
            </select>
            <select value={ciudad} onChange={(e) => setCiudad(e.target.value)} className={FIELD_CLS}>
              <option value="todas">Ciudad: Todas</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {loading ? (
            <SkeletonCards count={2} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Building2 />} title="Sin sedes" description="Este cliente aún no tiene sedes registradas." />
          ) : (
            <TabTable minWidth={640}>
                  <THead>
                    <Th>Sede</Th>
                    <Th>Dirección</Th>
                    <Th>Ciudad</Th>
                    {risk && <Th>Riesgo</Th>}
                    <Th>Guardias</Th>
                    <Th>Estaciones</Th>
                    <Th>Estado</Th>
                    <Th title="Vigilantes asignados vs estaciones (no es cobertura en vivo)">Asignación</Th>
                    <Th aria-label="Acciones" />
                  </THead>
                <tbody>
                  {filtered.map((s, i) => (
                    <Tr
                      key={s.id}
                      selected={selectedId === s.id}
                      onClick={() => navigate(`/post-sites/${s.id}`)}
                      title="Abrir el detalle de la sede"
                    >
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {/* Numbered pin: selects for the map/side panel (does NOT navigate) */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedId(s.id); }}
                            title="Ver en el mapa"
                            className="cg-focus flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-transform hover:scale-110"
                            style={{ background: markerFill(markerRole(s)), color: 'oklch(1 0 0)' }}>{i + 1}</button>
                          {s.thumb ? (
                            <img src={s.thumb} alt="" className="h-8 w-8 shrink-0 rounded-lg border object-cover" style={{ borderColor: 'var(--hairline)' }} />
                          ) : (
                            <IconTile tone="neutral" size="sm"><Building2 /></IconTile>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{s.name}</p>
                            <p className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>{s.city || ""}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2.5" style={{ color: 'var(--ink-soft)' }}><span className="line-clamp-2">{s.address || '—'}</span></td>
                      <td className="px-2 py-2.5" style={{ color: 'var(--ink-soft)' }}>{s.city || '—'}</td>
                      {risk && <td className="px-2 py-2.5"><StatusBadge tone={riskTone(risk)} dot={false} className="capitalize">{risk}</StatusBadge></td>}
                      <td className="px-2 py-2.5 tabular-nums" style={{ color: 'var(--ink-soft)' }}>{s.guards} / {s.required}</td>
                      <td className="px-2 py-2.5 tabular-nums" style={{ color: 'var(--ink-soft)' }}>{s.stations}</td>
                      <td className="px-2 py-2.5">
                        <StatusBadge tone={s.active ? 'ok' : 'neutral'} dot={false}>{s.active ? 'Activa' : 'Inactiva'}</StatusBadge>
                      </td>
                      <td className="px-2 py-2.5">
                        {s.stations > 0 ? (
                          <div className="min-w-[90px]">
                            <div className="flex items-center justify-between text-[11px] font-medium"><span>{s.coverage}%</span></div>
                            <MeterBar className="mt-0.5" height={6} pct={s.coverage} tone={covTone(s.coverage)} ariaLabel={`Cobertura ${s.coverage}%`} />
                          </div>
                        ) : <span style={{ color: 'var(--ink-faint)' }}>—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              onClick={(e) => e.stopPropagation()}
                              className="cg-focus rounded-lg p-1.5 transition-opacity hover:opacity-70"
                              style={{ color: 'var(--ink-faint)' }}
                              title="Acciones"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => navigate(`/post-sites/${s.id}`)}>
                              <ExternalLink className="mr-2 h-3.5 w-3.5" /> Abrir sede
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate(`/post-sites/${s.id}/overview`)}>
                              <BarChart3 className="mr-2 h-3.5 w-3.5" /> Dashboard de la sede
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setSelectedId(s.id)}>
                              <LocateFixed className="mr-2 h-3.5 w-3.5" /> Ver en el mapa
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => navigate(`/post-sites/${s.id}/edit`)}>
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              style={{ color: 'var(--bad-text)' }}
                              onClick={() => void deleteSede(s)}
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </Tr>
                  ))}
                </tbody>
            </TabTable>
          )}

          {!loading && filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}>
              <span>Mostrando {filtered.length} de {sedes.length} sedes</span>
            </div>
          )}
        </Section>
      </div>

      {/* Right: map + selected details */}
      <div className="space-y-4">
        <Section title="Mapa de sedes" icon={<MapPin />}>
          {mapMarkers.length > 0 ? (
            <div className="h-[260px] overflow-hidden rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
              <GoogleMapEmbed
                lat={selected?.lat ?? mapMarkers[0].lat}
                lng={selected?.lng ?? mapMarkers[0].lng}
                markers={mapMarkers}
                zoom={11}
                mapType="roadmap"
                draggable
              />
            </div>
          ) : (
            <div
              className="flex h-[260px] flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-sm"
              style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}
            >
              <MapPin className="h-5 w-5 opacity-50" /> Las sedes no tienen ubicación registrada
            </div>
          )}
        </Section>

        <Section title="Detalles de la sede seleccionada" icon={<Building2 />}>
          {!selected ? (
            <EmptyState icon={<Building2 />} title="Selecciona una sede" description="Toca una fila para ver su detalle." />
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                {selected.thumb ? (
                  <img src={selected.thumb} alt="" className="h-16 w-16 shrink-0 rounded-xl border object-cover" style={{ borderColor: 'var(--hairline)' }} />
                ) : (
                  <IconTile tone="neutral" size="lg"><Building2 /></IconTile>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-semibold text-foreground">{selected.name}</p>
                    <StatusBadge tone={selected.active ? 'ok' : 'bad'}>{selected.active ? 'Activa' : 'Inactiva'}</StatusBadge>
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: 'var(--ink-soft)' }}>
                    <span>{selected.city || ''}</span>
                    {risk && <>· Nivel de riesgo: <StatusBadge tone={riskTone(risk)} dot={false} className="capitalize">{risk}</StatusBadge></>}
                  </p>
                  {selected.address && <p className="mt-1 text-xs" style={{ color: 'var(--ink-soft)' }}>{selected.address}{selected.city ? `, ${selected.city}` : ''}</p>}
                  {Number.isFinite(selected.lat) && <p className="text-xs tabular-nums" style={{ color: 'var(--ink-faint)' }}>{selected.lat!.toFixed(4)}, {selected.lng!.toFixed(4)}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <Stat icon={<Building2 className="h-4 w-4" />} label="Estaciones" value={selected.stations} />
                <Stat icon={<Users className="h-4 w-4" />} label="Vigilantes asignados" value={`${selected.guards} / ${selected.required}`} />
                <Stat icon={<BarChart3 className="h-4 w-4" />} label="Cobertura" value={`${selected.coverage}%`} />
                <Stat icon={<Clock className="h-4 w-4" />} label="Zona horaria" value={tz || '—'} />
              </div>

              <button
                onClick={() => navigate(`/post-sites/${selected.id}/overview`)}
                className="cg-focus flex w-full items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition-colors"
                style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)', color: 'var(--brand-text)' }}
              >
                <BarChart3 className="h-4 w-4" /> Ver el panel de la sede
              </button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="glass-sunken px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--ink-soft)' }}>{icon}{label}</div>
      <p className="mt-0.5 font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
