import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Settings, Plus, Trash2, ChevronDown, ChevronRight, ChevronUp, MapPin, QrCode, Crosshair, Route } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/confirmDialog';
import { ApiService } from '@/services/api/apiService';
import RondaSettingsForm from '@/pages/admin/Configuration/rondas-settings/RondaSettingsForm';
import CheckpointLocationPicker from '@/components/maps/CheckpointLocationPicker';
import { Section, EmptyState, SkeletonCards, StatusBadge, Modal } from '@/components/kit';
import { FIELD_CLS_LG } from '@/pages/admin/clientes/components/_shared/tab-kit';
import { Button } from '@/components/ui/button';
import type { Station } from '@/types';

interface StationDetail extends Station {
  latitude?: number | string | null;
  longitude?: number | string | null;
  geofenceRadius?: number | string | null;
}

type Props = { station: StationDetail; stationId: string; postSiteId: string };

interface Checkpoint {
  id: string;
  name: string;
  tagIdentifier: string;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
}

// A site-tour (ronda) row from `/site-tour`.
interface SiteTourRow { id: string | number; name?: string; tourName?: string; description?: string; active?: boolean }
// A raw checkpoint/tag row from `/site-tour/:id/tags`.
interface TagRow {
  id: string | number;
  name?: string;
  tagIdentifier?: string;
  latitude?: number | string | null;
  latitud?: number | string | null;
  longitude?: number | string | null;
  longitud?: number | string | null;
  geofenceRadius?: number | string | null;
}

const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const genIdentifier = () =>
  `QR-${Math.random().toString(36).slice(2, 6).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;

export default function StationSiteTours({ station, stationId, postSiteId }: Props) {
  const { t } = useTranslation();
  const tenantId = (station?.tenantId || localStorage.getItem('tenantId') || '') as string;
  const stationLat = num(station?.latitud ?? station?.latitude);
  const stationLng = num(station?.longitud ?? station?.longitude);

  const [tours, setTours] = useState<SiteTourRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Create-ronda modal
  const [showNewTour, setShowNewTour] = useState(false);
  const [tourName, setTourName] = useState('');
  const [tourDesc, setTourDesc] = useState('');
  const [savingTour, setSavingTour] = useState(false);

  // Per-tour checkpoint state
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cps, setCps] = useState<Record<string, Checkpoint[]>>({});
  const [cpLoading, setCpLoading] = useState<string | null>(null);
  // inline "add checkpoint" form (per tour)
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [cpName, setCpName] = useState('');
  const [cpLat, setCpLat] = useState<number | null>(null);
  const [cpLng, setCpLng] = useState<number | null>(null);
  const stationRadius = num(station?.geofenceRadius) ?? 75;
  const [cpRadius, setCpRadius] = useState<number>(stationRadius);
  const [savingCp, setSavingCp] = useState(false);

  const loadTours = useCallback(async () => {
    if (!stationId) return;
    setLoading(true); setError(null);
    try {
      const res: any = await ApiService.get(`/tenant/${tenantId}/site-tour?stationId=${encodeURIComponent(stationId)}&limit=999&_=${Date.now()}`);
      setTours(Array.isArray(res) ? res : (res?.rows ?? []));
    } catch (e: any) {
      setError(e?.message || t('station.siteTours.loadError', 'Error al cargar rondas'));
    } finally { setLoading(false); }
  }, [stationId, tenantId, t]);

  useEffect(() => { loadTours(); }, [loadTours]);

  const loadCheckpoints = useCallback(async (tourId: string) => {
    setCpLoading(tourId);
    try {
      const res: any = await ApiService.get(`/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tags?_=${Date.now()}`);
      const rows = Array.isArray(res) ? res : (res?.rows ?? []);
      setCps((m) => ({ ...m, [tourId]: rows.map((r: TagRow) => ({
        id: String(r.id), name: r.name || r.tagIdentifier || '—', tagIdentifier: r.tagIdentifier || String(r.id),
        latitude: num(r.latitude ?? r.latitud), longitude: num(r.longitude ?? r.longitud), radius: num(r.geofenceRadius),
      })) }));
    } catch {
      setCps((m) => ({ ...m, [tourId]: [] }));
    } finally { setCpLoading(null); }
  }, [tenantId]);

  const toggleExpand = (tourId: string) => {
    if (expanded === tourId) { setExpanded(null); return; }
    setExpanded(tourId);
    setAddingFor(null);
    if (!cps[tourId]) loadCheckpoints(tourId);
  };

  const createTour = async () => {
    if (!tourName.trim()) { toast.error(t('station.siteTours.nameRequired', 'Escribe un nombre')); return; }
    setSavingTour(true);
    try {
      await ApiService.post(`/tenant/${tenantId}/site-tour`, {
        name: tourName.trim(), description: tourDesc.trim() || undefined,
        stationId, postSiteId: postSiteId || undefined, active: true,
      });
      toast.success(t('station.siteTours.created', 'Ronda creada'));
      setShowNewTour(false); setTourName(''); setTourDesc('');
      loadTours();
    } catch (e: any) {
      toast.error(e?.message || t('station.siteTours.createFailed', 'No se pudo crear la ronda'));
    } finally { setSavingTour(false); }
  };

  const deleteTour = async (tourId: string) => {
    if (!(await confirmDialog({ title: 'Eliminar ronda', message: t('station.siteTours.confirmDelete', '¿Eliminar esta ronda y sus puntos de control?'), confirmText: 'Eliminar', tone: 'danger' }))) return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}`);
      toast.success(t('station.siteTours.deleted', 'Ronda eliminada'));
      setTours((ts) => ts.filter((x) => String(x.id) !== tourId));
    } catch (e: any) {
      toast.error(e?.message || t('station.siteTours.deleteFailed', 'No se pudo eliminar'));
    }
  };

  const openAddCheckpoint = (tourId: string) => {
    setAddingFor(tourId);
    setCpName('');
    setCpLat(stationLat);
    setCpLng(stationLng);
    setCpRadius(stationRadius);
  };

  const createCheckpoint = async (tourId: string) => {
    if (!cpName.trim()) { toast.error(t('station.siteTours.cpNameRequired', 'Escribe un nombre para el punto')); return; }
    if (cpLat == null || cpLng == null) { toast.error(t('station.siteTours.cpLocRequired', 'Marca la ubicación del punto en el mapa')); return; }
    setSavingCp(true);
    try {
      await ApiService.post(`/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tag`, {
        name: cpName.trim(), tagType: 'qr', tagIdentifier: genIdentifier(),
        latitude: cpLat, longitude: cpLng, geofenceRadius: cpRadius, stationId, showGeoFence: true,
      });
      toast.success(t('station.siteTours.cpCreated', 'Punto de control creado'));
      setAddingFor(null); setCpName('');
      loadCheckpoints(tourId);
    } catch (e: any) {
      toast.error(e?.message || t('station.siteTours.cpCreateFailed', 'No se pudo crear el punto'));
    } finally { setSavingCp(false); }
  };

  // El ORDEN del recorrido por fin se edita. La posición en la lista es el
  // orderIndex: subir/bajar intercambia y manda la lista entera de ids — el
  // servidor asigna 0..n-1 y devuelve el orden vigente. Con
  // «exigir orden de puntos» activo en /setting/rondas, esto ES la ruta.
  const moveCheckpoint = async (tourId: string, tagId: string, dir: -1 | 1) => {
    const list = cps[tourId] || [];
    const i = list.findIndex((c: Checkpoint) => c.id === tagId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const nuevo = [...list];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    setCps((prev: Record<string, Checkpoint[]>) => ({ ...prev, [tourId]: nuevo }));
    try {
      await ApiService.put(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tags/reorder`,
        { ids: nuevo.map((c: Checkpoint) => c.id) },
      );
    } catch (e: any) {
      toast.error(e?.message || t('station.siteTours.reorderFailed', 'No se pudo guardar el orden'));
      loadCheckpoints(tourId);
    }
  };

  const deleteCheckpoint = async (tourId: string, tagId: string) => {
    if (!(await confirmDialog({ title: t('station.siteTours.deleteCpTitle', 'Eliminar punto de control'), message: t('station.siteTours.confirmDeleteCp', '¿Eliminar este punto de control?'), confirmText: 'Eliminar', tone: 'danger' }))) return;
    try {
      await ApiService.delete(`/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}/tag/${encodeURIComponent(tagId)}`);
      setCps((m) => ({ ...m, [tourId]: (m[tourId] || []).filter((c) => c.id !== tagId) }));
    } catch (e: any) {
      toast.error(e?.message || t('station.siteTours.deleteFailed', 'No se pudo eliminar'));
    }
  };


  return (
    <>
      <Section
        icon={<Route />}
        title={
          <span>
            {t('station.siteTours.title', 'Rondas de Seguridad')}
            {tours.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">({tours.length})</span>}
          </span>
        }
        action={
          /* Los dos botones rozan los 300 px: se envuelven en pantallas estrechas. */
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="brand" size="sm" onClick={() => setShowNewTour(true)} className="gap-1.5 rounded-full">
              <Plus size={16} /> {t('station.siteTours.new', 'Nueva ronda')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(true)} className="gap-1.5 rounded-full">
              <Settings size={15} /> {t('station.siteTours.settings', 'Configuraciones')}
            </Button>
          </div>
        }
        contentClassName="-mx-5 -mb-5"
      >
        <p className="px-6 -mt-2 mb-3 text-xs text-muted-foreground">
          {t('station.siteTours.hint', 'Crea rondas y sus puntos de control. Luego genera los QR en la pestaña "Generar QR de Rondas".')}
        </p>

        {loading ? (
          <div className="px-5 pb-5"><SkeletonCards count={3} /></div>
        ) : error ? (
          <div className="px-6 pb-6 text-sm" style={{ color: 'var(--bad-text)' }}>{error}</div>
        ) : tours.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={<QrCode />}
              title={t('station.siteTours.empty', 'Aún no hay rondas. Crea la primera con "Nueva ronda".')}
            />
          </div>
        ) : (
          <ul className="divide-y border-t">
            {tours.map((r: SiteTourRow) => {
              const id = String(r.id);
              const name = r.name || r.tourName || r.description || '—';
              const active = r.active !== false;
              const list = cps[id] || [];
              const isOpen = expanded === id;
              return (
                <li key={id}>
                  <div className="flex items-center gap-3 px-6 py-3 hover:bg-muted/40">
                    <button onClick={() => toggleExpand(id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left">
                      {isOpen ? <ChevronDown size={18} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={18} className="shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 truncate font-medium text-foreground">{name}</span>
                      <StatusBadge tone={active ? 'green' : 'slate'}>
                        {active ? t('station.siteTours.active', 'Activa') : t('station.siteTours.inactive', 'Inactiva')}
                      </StatusBadge>
                      {cps[id] && (
                        <span className="text-xs text-muted-foreground">
                          {list.length} {list.length === 1 ? t('station.siteTours.point', 'punto') : t('station.siteTours.points', 'puntos')}
                        </span>
                      )}
                    </button>
                    <button onClick={() => deleteTour(id)} className="cg-focus rounded p-1.5" style={{ color: 'var(--bad-text)' }} title={t('common.delete', 'Eliminar')}>
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t bg-muted/10 px-6 py-4">
                      {cpLoading === id ? (
                        <div className="flex justify-center py-4"><Loader2 className="animate-spin brand-text" size={18} /></div>
                      ) : (
                        <>
                          {list.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('station.siteTours.noPoints', 'Sin puntos de control todavía.')}</p>
                          ) : (
                            <ul className="space-y-2">
                              {list.map((c, ci) => (
                                <li key={c.id} className="glass-sunken flex items-center justify-between px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                                      <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">{ci + 1}.</span>
                                      <span className="min-w-0 truncate font-medium text-foreground">{c.name}</span>
                                      <span className="font-mono text-xs text-muted-foreground">{c.tagIdentifier}</span>
                                    </div>
                                    <div className="mt-0.5 text-xs">
                                      {c.latitude != null && c.longitude != null ? (
                                        <span className="inline-flex items-center gap-1" style={{ color: 'var(--ok-text)' }}>
                                          <MapPin size={12} />{c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                                          <span className="ml-1 text-muted-foreground">· ±{c.radius ?? stationRadius} m</span>
                                        </span>
                                      ) : (
                                        <span style={{ color: 'var(--warn-text)' }}>{t('station.siteTours.cpNoLoc', 'Sin ubicación — la verificación no funcionará')}</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-0.5">
                                    <button onClick={() => moveCheckpoint(id, c.id, -1)} disabled={ci === 0}
                                      className="cg-focus rounded p-1.5 text-muted-foreground disabled:opacity-30" title={t('station.siteTours.moveUp', 'Subir')}>
                                      <ChevronUp size={15} />
                                    </button>
                                    <button onClick={() => moveCheckpoint(id, c.id, 1)} disabled={ci === list.length - 1}
                                      className="cg-focus rounded p-1.5 text-muted-foreground disabled:opacity-30" title={t('station.siteTours.moveDown', 'Bajar')}>
                                      <ChevronDown size={15} />
                                    </button>
                                    <button onClick={() => deleteCheckpoint(id, c.id)} className="cg-focus rounded p-1.5" style={{ color: 'var(--bad-text)' }}>
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}

                          {addingFor === id ? (
                            <div className="glass-sunken mt-3 space-y-3 p-3">
                              <div>
                                <label className="cg-eyebrow mb-1 block">{t('station.siteTours.cpName', 'Nombre del punto')}</label>
                                <input className={FIELD_CLS_LG} value={cpName} onChange={(e) => setCpName(e.target.value)} placeholder={t('station.siteTours.cpPlaceholder', 'Ej. Entrada principal') as string} autoFocus />
                              </div>
                              <CheckpointLocationPicker
                                lat={cpLat}
                                lng={cpLng}
                                radius={cpRadius}
                                onChange={(la, ln, r) => { setCpLat(la); setCpLng(ln); setCpRadius(r); }}
                                // Con el puesto como referencia, el mapa dice «a
                                // 34 m del puesto»: la comprobación que importa
                                // aquí, porque una dirección postal no distingue
                                // el vestíbulo de la azotea y una distancia sí.
                                reference={
                                  stationLat != null && stationLng != null
                                    ? { lat: stationLat, lng: stationLng, label: 'el puesto' }
                                    : null
                                }
                              />
                              {stationLat != null && stationLng != null && (
                                <button onClick={() => { setCpLat(stationLat); setCpLng(stationLng); }} className="inline-flex items-center gap-1.5 text-xs brand-text hover:underline">
                                  <Crosshair size={13} /> {t('station.siteTours.useStationLoc', 'Usar ubicación del puesto')}
                                </button>
                              )}
                              <div className="flex justify-end gap-2 pt-1">
                                <Button variant="outline" size="sm" onClick={() => setAddingFor(null)}>{t('common.cancel', 'Cancelar')}</Button>
                                <Button variant="brand" size="sm" onClick={() => createCheckpoint(id)} disabled={savingCp || !cpName.trim()} className="gap-1.5">
                                  {savingCp && <Loader2 className="animate-spin" size={14} />} {t('common.save', 'Guardar')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => openAddCheckpoint(id)} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-primary/50 px-3 py-1.5 text-sm font-medium brand-text hover:bg-primary/5">
                              <Plus size={15} /> {t('station.siteTours.addPoint', 'Agregar punto de control')}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Create ronda modal */}
      <Modal
        open={showNewTour}
        onOpenChange={(o) => { if (!o) setShowNewTour(false); }}
        size="sm"
        icon={<Plus className="h-5 w-5" />}
        title={t('station.siteTours.newTitle', 'Nueva ronda')}
        footer={
          <>
            <Button variant="outline" onClick={() => setShowNewTour(false)}>{t('common.cancel', 'Cancelar')}</Button>
            <Button variant="brand" onClick={createTour} disabled={savingTour || !tourName.trim()} className="gap-1.5">
              {savingTour && <Loader2 className="animate-spin" size={14} />} {t('station.siteTours.create', 'Crear ronda')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t('station.siteTours.name', 'Nombre')} *</label>
            <input className={FIELD_CLS_LG} value={tourName} onChange={(e) => setTourName(e.target.value)} placeholder={t('station.siteTours.namePlaceholder', 'Ej. Ronda nocturna') as string} autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">{t('station.siteTours.desc', 'Descripción')}</label>
            <textarea className={`${FIELD_CLS_LG} resize-none`} rows={3} value={tourDesc} onChange={(e) => setTourDesc(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Settings modal */}
      <Modal
        open={showSettings}
        onOpenChange={(o) => { if (!o) setShowSettings(false); }}
        size="lg"
        icon={<Settings className="h-5 w-5" />}
        title={t('station.siteTours.settingsTitle', 'Configuraciones de Rondas')}
      >
        <RondaSettingsForm postSiteId={postSiteId} onSaved={() => setShowSettings(false)} />
      </Modal>
    </>
  );
}
