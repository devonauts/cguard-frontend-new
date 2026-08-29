import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, RotateCcw, X, Search, Package, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';
import inventoryItemService, {
  InventoryItem, ItemCondition,
  ITEM_TYPE_LABELS, ITEM_CONDITION_LABELS,
} from '@/lib/api/inventoryItemService';
import inventoryAssignmentService, { InventoryAssignment } from '@/lib/api/inventoryAssignmentService';
import { securityGuardService } from '@/lib/api/securityGuardService';
import { EmptyState, Modal, SkeletonCards } from '@/components/kit';
import { FIELD_CLS_LG } from '@/pages/admin/clientes/components/_shared/tab-kit';
import type { PostSite } from '@/types';

type ConditionKey = 'bueno' | 'regular' | 'danado';
const CONDITIONS: ConditionKey[] = ['bueno', 'regular', 'danado'];
const CONDITION_MAP: Record<ConditionKey, ItemCondition> = {
  bueno: 'bueno',
  regular: 'regular',
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore -- spanish special char handled at runtime
  danado: 'da\u00f1ado',
};
const CONDITION_DISPLAY: Record<string, string> = {
  bueno: 'Bueno',
  regular: 'Regular',
  danado: 'Da\u00f1ado',
};
// El estado del artículo sale de los semánticos fijos del sistema.
const CONDITION_TONE: Record<string, 'ok' | 'warn' | 'bad'> = {
  bueno: 'ok',
  regular: 'warn',
  danado: 'bad',
};
function conditionStyle(key: string): React.CSSProperties {
  const t = CONDITION_TONE[key] ?? 'ok';
  return {
    background: `color-mix(in oklab, var(--${t}) 15%, transparent)`,
    color: `var(--${t}-text)`,
  };
}

function normCond(v: string | undefined): ConditionKey {
  if (!v) return 'bueno';
  const c = v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (c === 'regular') return 'regular';
  if (c.startsWith('da')) return 'danado';
  return 'bueno';
}

function getGuardName(guard: any): string {
  if (!guard) return '';
  const first = guard.firstName || guard.first_name || guard.nombre || '';
  const last = guard.lastName || guard.last_name || guard.apellido || '';
  if (first || last) return (first + ' ' + last).trim();
  return guard.fullName || guard.name || guard.email || '';
}

// ---------------------------------------------------------------------------
// Assign Item Modal
// ---------------------------------------------------------------------------
interface AssignModalProps { postSiteId: string; onClose: () => void; onDone: () => void; }

function AssignModal({ postSiteId, onClose, onDone }: AssignModalProps) {
  const { t } = useTranslation();
  const [itemSearch, setItemSearch] = useState('');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [guardSearch, setGuardSearch] = useState('');
  const [guards, setGuards] = useState<any[]>([]);
  const [loadingGuards, setLoadingGuards] = useState(false);
  const [selectedGuard, setSelectedGuard] = useState<any | null>(null);
  const [condKey, setCondKey] = useState<ConditionKey>('bueno');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const searchItems = useCallback(async (q: string) => {
    try {
      setLoadingItems(true);
      const res = await inventoryItemService.list({ filter: { status: 'disponible', ...(q ? { name: q } : {}) }, limit: 20 });
      setItems(res.rows || []);
    } catch { setItems([]); } finally { setLoadingItems(false); }
  }, []);

  useEffect(() => { const t = setTimeout(() => searchItems(itemSearch), 300); return () => clearTimeout(t); }, [itemSearch, searchItems]);

  const searchGuards = useCallback(async (q: string) => {
    try {
      setLoadingGuards(true);
      const res = await securityGuardService.autocomplete(q, 20);
      setGuards(Array.isArray(res) ? res : (res as any)?.rows || []);
    } catch { setGuards([]); } finally { setLoadingGuards(false); }
  }, []);

  useEffect(() => { const t = setTimeout(() => searchGuards(guardSearch), 300); return () => clearTimeout(t); }, [guardSearch, searchGuards]);

  const handleAssign = async () => {
    if (!selectedItem) { toast.error(t('ui.Inventory.seleccionaUnArticulo')); return; }
    try {
      setSaving(true);
      await inventoryAssignmentService.create({
        inventoryItemId: selectedItem.id,
        postSiteId,
        assignedToUserId: selectedGuard?.id || undefined,
        conditionAtCheckout: CONDITION_MAP[condKey],
        notes: notes || undefined,
      });
      toast.success(selectedItem.name + ' asignado correctamente');
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Error al asignar');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t("ui.Inventory.asignarArticuloAlPuesto", "Asignar artículo al puesto")}
      icon={<Package className="h-5 w-5" />}
      size="md"
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('actions.cancel')}</Button>
          <Button variant="brand" onClick={handleAssign} disabled={saving || !selectedItem}>{saving ? 'Asignando...' : 'Asignar'}</Button>
        </>
      )}
    >
      <div className="space-y-5">
          {/* Item */}
          <div className="space-y-2">
            <Label>{t("ui.Inventory.articuloDelInventario", "Artículo del inventario")}{" "}<span style={{ color: 'var(--bad-text)' }}>*</span></Label>
            {selectedItem ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2" style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)' }}>
                <div>
                  <div className="font-medium text-foreground text-sm">{selectedItem.name}</div>
                  <div className="text-xs text-muted-foreground">{ITEM_TYPE_LABELS[selectedItem.type]}{selectedItem.serialNumber && ' · #' + selectedItem.serialNumber}</div>
                </div>
                <button className="text-muted-foreground hover:text-foreground/70 p-1" onClick={() => setSelectedItem(null)}><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder={t("ui.Inventory.buscarArticuloDisponible", "Buscar artículo disponible...")} value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} autoFocus />
                </div>
                <div className="border border-border rounded-lg max-h-40 overflow-y-auto">
                  {loadingItems ? <div className="text-center text-xs text-muted-foreground py-4">Buscando...</div>
                  : items.length === 0 ? (
                    <div className="text-center text-xs text-muted-foreground py-4 flex flex-col items-center gap-1"><Package className="w-6 h-6 text-muted-foreground/60" />{t("ui.Inventory.sinArticulosDisponibles", "Sin artículos disponibles")}</div>
                  ) : items.map((item) => (
                    <button key={item.id} className="w-full text-left px-3 py-2 hover:bg-muted/30 border-b border-border last:border-0 transition-colors" onClick={() => setSelectedItem(item)}>
                      <div className="text-sm font-medium text-foreground">{item.name}</div>
                      <div className="text-xs text-muted-foreground">{ITEM_TYPE_LABELS[item.type]}{item.serialNumber && ' · #' + item.serialNumber}{item.brand && ' · ' + item.brand}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Guard */}
          <div className="space-y-2">
            <Label>{t('ui.Inventory.responsableVigilante')}</Label>
            {selectedGuard ? (
              <div className="flex items-center justify-between bg-muted/30 border border-border rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{getGuardName(selectedGuard)}</span>
                </div>
                <button className="text-muted-foreground hover:text-foreground/70 p-1" onClick={() => setSelectedGuard(null)}><X className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder={t('comun.buscarVigilante')} value={guardSearch} onChange={(e) => setGuardSearch(e.target.value)} />
                </div>
                {(loadingGuards || guards.length > 0) && (
                  <div className="border border-border rounded-lg max-h-32 overflow-y-auto">
                    {loadingGuards ? <div className="text-center text-xs text-muted-foreground py-3">Buscando...</div>
                    : guards.map((g) => (
                      <button key={g.id} className="w-full text-left px-3 py-2 hover:bg-muted/30 border-b border-border last:border-0 text-sm text-foreground" onClick={() => { setSelectedGuard(g); setGuardSearch(''); setGuards([]); }}>
                        {getGuardName(g)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Condition */}
          <div className="space-y-1">
            <Label>{t("ui.Inventory.condicionAlEntregar", "Condición al entregar")}</Label>
            <Select value={condKey} onValueChange={(v) => setCondKey(v as ConditionKey)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{CONDITION_DISPLAY[c]}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>{t('comun.notasOpcional')}</Label>
            <textarea className={`${FIELD_CLS_LG} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones..." />
          </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Return Item Modal
// ---------------------------------------------------------------------------
interface ReturnModalProps { assignment: InventoryAssignment; onClose: () => void; onDone: () => void; }

function ReturnModal({ assignment, onClose, onDone }: ReturnModalProps) {
  const { t } = useTranslation();
  const [condKey, setCondKey] = useState<ConditionKey>('bueno');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const handleReturn = async () => {
    try {
      setSaving(true);
      await inventoryAssignmentService.returnItem(assignment.id, {
        conditionAtReturn: CONDITION_MAP[condKey],
        returnNotes: notes || undefined,
      });
      toast.success(t('ui.Inventory.articuloDevueltoCorrectamente'));
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Error al devolver');
    } finally { setSaving(false); }
  };

  const itemName = (assignment as any).inventoryItem?.name || 'artículo';

  return (
    <Modal
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t("ui.Inventory.devolverArticulo", "Devolver artículo")}
      icon={<RotateCcw className="h-5 w-5" />}
      size="sm"
      footer={(
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>{t('actions.cancel')}</Button>
          <Button variant="brand" onClick={handleReturn} disabled={saving}>{saving ? 'Procesando...' : 'Confirmar devolución'}</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-foreground/70">Devolviendo: <span className="font-medium text-foreground">{itemName}</span></p>
        <div className="space-y-1">
          <Label>{t("ui.Inventory.condicionAlDevolver", "Condición al devolver")}</Label>
          <Select value={condKey} onValueChange={(v) => setCondKey(v as ConditionKey)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CONDITIONS.map((c) => <SelectItem key={c} value={c}>{CONDITION_DISPLAY[c]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('comun.notasOpcional')}</Label>
          <textarea className={`${FIELD_CLS_LG} resize-none`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones..." />
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Inventory({ site }: { site?: PostSite }) {
  const { t } = useTranslation();
  const params = useParams();
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollToTopOnMount(containerRef);

  const [assignments, setAssignments] = useState<InventoryAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [returnTarget, setReturnTarget] = useState<InventoryAssignment | null>(null);

  const postSiteId = site?.id || params.id || '';

  const load = useCallback(async () => {
    if (!postSiteId) { setAssignments([]); return; }
    try {
      setLoading(true);
      const tenantId = (site as any)?.tenantId || localStorage.getItem('tenantId') || '';
      // 1. PostSite-direct assignments
      const res = await inventoryAssignmentService.list({ filter: { postSiteId }, limit: 200 });
      const direct: InventoryAssignment[] = res.rows || [];
      // 2. Fetch all stations for this postSite
      let stationAssignments: any[] = [];
      try {
        const stRes: any = await import('@/services/api/apiService').then(m =>
          m.ApiService.get(`/tenant/${tenantId}/station?postSiteId=${encodeURIComponent(postSiteId)}&limit=999`)
        );
        const stations: { id?: string; stationId?: string; stationName?: string; name?: string }[] = Array.isArray(stRes) ? stRes : (stRes?.rows ?? []);
        await Promise.all(stations.map(async (st) => {
          const sid = st.id || st.stationId;
          if (!sid) return;
          try {
            const r = await inventoryAssignmentService.list({ filter: { stationId: sid }, limit: 200, offset: 0 } as any);
            (r.rows || []).forEach((a: any) => stationAssignments.push({ ...a, _stationName: st.stationName || st.name || sid }));
          } catch {}
        }));
      } catch {}
      // 3. Merge + dedup by id, filter active
      const byId: Record<string, any> = {};
      [...direct, ...stationAssignments].forEach(a => { if (a.id && !byId[a.id]) byId[a.id] = a; });
      setAssignments(Object.values(byId).filter((a: any) => !a.returnedAt) as InventoryAssignment[]);
    } catch (e) { console.error(e); setAssignments([]); } finally { setLoading(false); }
  }, [postSiteId, site]);

  useEffect(() => { load(); }, [load]);

  const filtered = !query ? assignments : assignments.filter((a) => {
    const q = query.toLowerCase();
    const item = (a as any).inventoryItem;
    return (item?.name || '').toLowerCase().includes(q)
      || (item?.type || '').toLowerCase().includes(q)
      || (item?.serialNumber || '').toLowerCase().includes(q)
      || getGuardName((a as any).assignedTo).toLowerCase().includes(q);
  });

  const countMsg = loading ? 'Cargando…'
    : assignments.length + ' artículo' + (assignments.length !== 1 ? 's' : '') + ' asignado' + (assignments.length !== 1 ? 's' : '');

  return (
    <div ref={containerRef} className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Inventario asignado</h2>
          <p className="text-sm text-muted-foreground">{countMsg}</p>
        </div>
        <Button variant="brand" onClick={() => setShowAssignModal(true)} disabled={!postSiteId} size="sm">
          <Plus className="w-4 h-4 mr-1" /> {t("ui.Inventory.asignarArticulo", "Asignar artículo")}
        </Button>
      </div>

      {assignments.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('ui.Inventory.buscarPorNombreTipoVigilante')} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <div className="glass overflow-hidden">
        {loading ? (
          <div className="p-4"><SkeletonCards count={3} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Package />}
            title={query ? 'Sin resultados' : 'Sin artículos asignados a este puesto'}
            action={!query ? (
              <Button size="sm" variant="outline" onClick={() => setShowAssignModal(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> {t("ui.Inventory.asignarPrimerArticulo", "Asignar primer artículo")}
              </Button>
            ) : undefined}
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="cg-eyebrow px-2 py-2">{t("ui.Inventory.articulo", "Artículo")}</th>
                  <th className="cg-eyebrow px-2 py-2 hidden sm:table-cell">{t('comun.tipo')}</th>
                  <th className="cg-eyebrow px-2 py-2 hidden md:table-cell">{t("ui.Inventory.condicion", "Condición")}</th>
                  <th className="cg-eyebrow px-2 py-2">Responsable</th>
                  <th className="cg-eyebrow px-2 py-2 hidden lg:table-cell">Asignado</th>
                  <th className="cg-eyebrow px-2 py-2 text-right">{t("ui.Inventory.accion", "Acción")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((a) => {
                  const item = (a as any).inventoryItem;
                  const ck = normCond(a.conditionAtCheckout);
                  return (
                    <tr key={a.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-2 py-2.5">
                        <div className="font-medium text-foreground">{item?.name || '—'}</div>
                        {item?.serialNumber && <div className="text-xs text-muted-foreground font-mono">#{item.serialNumber}</div>}
                      </td>
                      <td className="px-2 py-2.5 text-foreground/70 hidden sm:table-cell">{item ? ((ITEM_TYPE_LABELS as any)[item.type] || item.type) : '—'}</td>
                      <td className="px-2 py-2.5 hidden md:table-cell">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={conditionStyle(ck)}>
                          {CONDITION_DISPLAY[ck] || ck}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        {(a as any).assignedTo ? (
                          <span className="flex items-center gap-1.5 text-foreground">
                            <User className="w-3.5 h-3.5 text-muted-foreground" />{getGuardName((a as any).assignedTo)}
                          </span>
                        ) : <span className="text-muted-foreground text-xs">{t('comun.sinAsignar')}</span>}
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground text-xs hidden lg:table-cell">
                        {a.assignedAt ? new Date(a.assignedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <button
                          className="cg-btn-glass cg-focus inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs transition-colors"
                          onClick={() => setReturnTarget(a)}
                        ><RotateCcw className="w-3.5 h-3.5" />Devolver</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAssignModal && (
        <AssignModal postSiteId={postSiteId} onClose={() => setShowAssignModal(false)} onDone={() => { setShowAssignModal(false); load(); }} />
      )}
      {returnTarget && (
        <ReturnModal assignment={returnTarget} onClose={() => setReturnTarget(null)} onDone={() => { setReturnTarget(null); load(); }} />
      )}
    </div>
  );
}
