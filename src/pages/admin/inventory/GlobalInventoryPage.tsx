import { useState, useEffect, useRef, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/layouts/app-layout';
import Breadcrumb from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, X, Package, ChevronDown, ChevronUp, ImagePlus,
  CheckCircle2, AlertTriangle, Wrench, CalendarClock, Hash,
} from 'lucide-react';
import {
  PageContainer, PageHeader, Section, Stagger, StatCard, StatusBadge, EmptyState,
  Modal, Toolbar, Segmented, GlassPanel, IconTile, Field, SkeletonCards, SmartImage,
} from '@/components/kit';
import { TableSearch } from '@/components/table/TableToolbar';
import { RowActionsMenu } from '@/components/table/RowActionsMenu';
import inventoryItemService, {
  InventoryItem, InventoryItemInput, InventoryItemPhoto, ItemType, ItemCondition, ItemStatus,
  ITEM_TYPE_LABELS, ITEM_STATUS_LABELS, ITEM_CONDITION_LABELS,
} from '@/lib/api/inventoryItemService';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';

// Shape of the errors thrown by the API layer (axios-style response envelope).
type ApiError = { response?: { data?: { message?: string } }; message?: string };

const ITEM_TYPES = Object.keys(ITEM_TYPE_LABELS) as ItemType[];
const STATUSES = Object.keys(ITEM_STATUS_LABELS) as ItemStatus[];
const CONDITIONS = Object.keys(ITEM_CONDITION_LABELS) as ItemCondition[];

/** La condición del equipo es SEVERIDAD, no acento: dañado siempre en rojo. */
const CONDITION_TONE: Record<ItemCondition, 'ok' | 'warn' | 'bad'> = {
  bueno: 'ok',
  regular: 'warn',
  'dañado': 'bad',
};

/** Existencias: disponible = normal, en mantenimiento = aviso, retirado = fuera de servicio. */
const STATUS_TONE: Record<ItemStatus, 'ok' | 'info' | 'warn' | 'neutral'> = {
  disponible: 'ok',
  asignado: 'info',
  en_mantenimiento: 'warn',
  retirado: 'neutral',
};

const UN_DIA = 24 * 60 * 60 * 1000;

/** Vencimiento de chalecos y armas: vencido = grave, próximo = aviso, resto = vigente. */
function estadoVigencia(fecha?: string): { tone: 'ok' | 'warn' | 'bad'; label: string } | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  const dias = Math.ceil((d.getTime() - Date.now()) / UN_DIA);
  if (dias < 0) return { tone: 'bad', label: 'Vencido' };
  if (dias <= 30) return { tone: 'warn', label: dias === 0 ? 'Vence hoy' : `Vence en ${dias} día${dias === 1 ? '' : 's'}` };
  return { tone: 'ok', label: 'Vigente' };
}

const EMPTY_FORM: InventoryItemInput = {
  name: '',
  type: 'radio',
  brand: '',
  modelName: '',
  serialNumber: '',
  condition: 'bueno',
  status: 'disponible',
  notes: '',
  expirationDate: '',
  photos: [],
};

export default function GlobalInventoryPage() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollToTopOnMount(containerRef);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(0);
  const [vista, setVista] = useState<'tarjetas' | 'lista'>('tarjetas');
  const PAGE_SIZE = 25;

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<InventoryItemInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Photo upload state
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Expanded row for details
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const filter: Record<string, string> = {};
      if (query) filter['name'] = query;
      if (filterType) filter['type'] = filterType;
      if (filterStatus) filter['status'] = filterStatus;
      const res = await inventoryItemService.list({
        filter,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setItems(res.rows || []);
      setTotal(res.count || 0);
    } catch (e) {
      toast.error((e as ApiError)?.message || 'Error cargando inventario');
    } finally {
      setLoading(false);
    }
  };

  // Debounce text search into a settled value that drives loading.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  // Reset to first page when the settled search text changes (filter Selects
  // reset the page imperatively in their onValueChange to avoid a double fetch).
  useEffect(() => { setPage(0); }, [debouncedQuery]);

  // Single source of truth for list requests: exactly one per settled change.
  useEffect(() => { load(); }, [page, debouncedQuery, filterType, filterStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      type: item.type,
      brand: item.brand || '',
      modelName: item.modelName || '',
      serialNumber: item.serialNumber || '',
      condition: item.condition,
      status: item.status,
      notes: item.notes || '',
      expirationDate: item.expirationDate || '',
      photos: item.photos || [],
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingItem(null); };

  const setField = <K extends keyof InventoryItemInput>(k: K, v: InventoryItemInput[K]) =>
    setForm((f) => ({ ...f, [k]: v } as InventoryItemInput));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(t('comun.elNombreEsObligatorio')); return; }
    try {
      setSaving(true);
      const payload: InventoryItemInput = {
        ...form,
        brand: form.brand || undefined,
        modelName: form.modelName || undefined,
        serialNumber: form.serialNumber || undefined,
        notes: form.notes || undefined,
        expirationDate: form.expirationDate || undefined,
        photos: form.photos || [],
      };
      if (editingItem) {
        await inventoryItemService.update(editingItem.id, payload);
        toast.success('Artículo actualizado');
      } else {
        await inventoryItemService.create(payload);
        toast.success('Artículo creado');
      }
      closeModal();
      load();
    } catch (e) {
      toast.error((e as ApiError)?.response?.data?.message || (e as ApiError)?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // Validate: images only, max 20MB each
    for (const file of files) {
      if (!file.type.startsWith('image/')) { toast.error(`"${file.name}" no es una imagen válida`); return; }
      if (file.size > 20 * 1024 * 1024) { toast.error(`"${file.name}" excede el límite de 20 MB`); return; }
    }
    setUploadingPhoto(true);
    try {
      const uploaded: InventoryItemPhoto[] = await Promise.all(
        files.map((f) => inventoryItemService.uploadPhoto(f)),
      );
      setForm((prev) => ({ ...prev, photos: [...(prev.photos || []), ...uploaded] }));
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Error subiendo imagen');
    } finally {
      setUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const removePhoto = (idx: number) =>
    setForm((prev) => ({ ...prev, photos: (prev.photos || []).filter((_, i) => i !== idx) }));

  const getPhotoUrl = (photo: InventoryItemPhoto) =>
    photo.downloadUrl || photo.publicUrl || photo.privateUrl || null;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await inventoryItemService.delete([deleteTarget.id]);
      toast.success('Artículo eliminado');
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error((e as ApiError)?.response?.data?.message || (e as ApiError)?.message || 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hayFiltros = !!(query || filterType || filterStatus);
  const sinResultados = !loading && items.length === 0;

  const disponibles = items.filter((i) => i.status === 'disponible').length;
  const enMantenimiento = items.filter((i) => i.status === 'en_mantenimiento').length;
  const dañados = items.filter((i) => i.condition === 'dañado').length;

  /**
   * `RowActionsMenu` del kit en vez de dos botones sueltos. Aparte de ser el
   * mismo menú «…» que el resto del CRM, resuelve solo el rojo de la acción
   * destructiva (`--bad-text`) — aquí estaba escrito a mano en cada uso.
   */
  const acciones = (item: InventoryItem) => (
    <div onClick={(e) => e.stopPropagation()}>
      <RowActionsMenu
        actions={[
          { label: 'Editar', icon: <Pencil />, onClick: () => openEdit(item) },
          { label: 'Eliminar', icon: <Trash2 />, destructive: true, onClick: () => setDeleteTarget(item) },
        ]}
      />
    </div>
  );

  return (
    <AppLayout>
      <div ref={containerRef}>
      <PageContainer width="wide" className="px-4 py-6">
        <Breadcrumb
          items={[
            { label: 'Panel de control', path: '/dashboard' },
            { label: 'Inventario Global' },
          ]}
        />

        <PageHeader
          icon={<Package />}
          title="Inventario Global"
          subtitle="Catálogo de equipos y recursos de la empresa"
          badges={(
            <>
              <StatusBadge tone="brand">{total} artículo{total !== 1 ? 's' : ''}</StatusBadge>
              {dañados > 0 && <StatusBadge tone="bad">{dañados} en mal estado</StatusBadge>}
            </>
          )}
          actions={(
            <Button variant="brand" onClick={openCreate} className="shrink-0">
              <Plus className="mr-1 h-4 w-4" /> Nuevo artículo
            </Button>
          )}
        />

        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={t("ui.GlobalInventory.articulos", "Artículos")} value={total} icon={<Package />} accent="primary" />
          <StatCard label="Disponibles" value={disponibles} icon={<CheckCircle2 />} accent="ok" hint={t("ui.GlobalInventory.enEstaPagina", "En esta página")} />
          <StatCard label="En mantenimiento" value={enMantenimiento} icon={<Wrench />} accent="warn" hint={t("ui.GlobalInventory.enEstaPagina2", "En esta página")} />
          <StatCard label="En mal estado" value={dañados} icon={<AlertTriangle />} accent="bad" hint={t("ui.GlobalInventory.enEstaPagina3", "En esta página")} />
        </Stagger>

        {/* Filtros */}
        <Toolbar>
          {/* `TableSearch` del kit: mismo campo, misma lupa y además el botón
              de borrar la búsqueda, que la copia a mano no tenía. */}
          <div className="min-w-48 flex-1">
            <TableSearch value={query} onChange={setQuery} placeholder="Buscar por nombre…" />
          </div>
          <Select value={filterType || '__all__'} onValueChange={(v) => { setPage(0); setFilterType(v === '__all__' ? '' : v); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t('comun.tipo')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('comun.todosLosTipos')}</SelectItem>
              {ITEM_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{ITEM_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus || '__all__'} onValueChange={(v) => { setPage(0); setFilterStatus(v === '__all__' ? '' : v); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={t('comun.estado')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('comun.todosLosEstados')}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{ITEM_STATUS_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hayFiltros && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setQuery(''); setFilterType(''); setFilterStatus(''); }}
            >
              <X className="mr-1 h-4 w-4" /> Limpiar
            </Button>
          )}
          <div className="ml-auto">
            <Segmented
              value={vista}
              onChange={setVista}
              options={[
                { value: 'tarjetas', label: 'Tarjetas' },
                { value: 'lista', label: 'Lista' },
              ]}
            />
          </div>
        </Toolbar>

        {/* Catálogo */}
        <Section
          title={t("ui.GlobalInventory.catalogoDeInventario", "Catálogo de inventario")}
          icon={<Package />}
          action={(
            <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
              {loading ? 'Actualizando…' : `${total} artículo${total !== 1 ? 's' : ''}`}
            </span>
          )}
          contentClassName={vista === 'lista' ? '-mx-5 -mb-5 overflow-hidden' : undefined}
        >
          {loading && items.length === 0 ? (
            <div className={vista === 'lista' ? 'p-5' : undefined}>
              <SkeletonCards count={6} className="lg:grid-cols-3" />
            </div>
          ) : sinResultados ? (
            <div className={vista === 'lista' ? 'p-5' : undefined}>
              <EmptyState
                icon={<Package />}
                title={hayFiltros ? 'Sin resultados' : 'Sin artículos en el catálogo'}
                description={hayFiltros
                  ? 'Ningún artículo coincide con la búsqueda. Prueba a quitar algún filtro.'
                  : 'Agrega tu primer equipo o recurso para empezar a inventariar.'}
                action={hayFiltros ? (
                  <Button size="sm" variant="outline" onClick={() => { setQuery(''); setFilterType(''); setFilterStatus(''); }}>
                    <X className="mr-1 h-3.5 w-3.5" /> Limpiar filtros
                  </Button>
                ) : (
                  <Button size="sm" variant="brand" onClick={openCreate}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Agregar primer artículo
                  </Button>
                )}
              />
            </div>
          ) : vista === 'tarjetas' ? (
            <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const portada = (item.photos || []).map(getPhotoUrl).find(Boolean) || null;
                const vigencia = estadoVigencia(item.expirationDate);
                return (
                  <GlassPanel key={item.id} flat className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-start gap-3">
                      {portada ? (
                        <button
                          type="button"
                          onClick={() => setLightboxSrc(portada)}
                          className="cg-focus h-14 w-14 shrink-0 overflow-hidden rounded-xl border"
                          style={{ borderColor: 'var(--hairline)' }}
                          aria-label={`Ver foto de ${item.name}`}
                        >
                          <SmartImage src={portada} alt="" className="h-full w-full" />
                        </button>
                      ) : (
                        <IconTile size="lg" tone="neutral"><Package /></IconTile>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">{item.name}</div>
                        <div className="cg-eyebrow mt-1 truncate">{ITEM_TYPE_LABELS[item.type] || item.type}</div>
                      </div>
                      {acciones(item)}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={STATUS_TONE[item.status]}>{ITEM_STATUS_LABELS[item.status]}</StatusBadge>
                      <StatusBadge tone={CONDITION_TONE[item.condition]}>{ITEM_CONDITION_LABELS[item.condition]}</StatusBadge>
                      {vigencia && <StatusBadge tone={vigencia.tone}>{vigencia.label}</StatusBadge>}
                    </div>

                    <div className="glass-sunken grid grid-cols-2 gap-3 p-3">
                      <Field label="Marca" value={item.brand || '—'} />
                      <Field label="Modelo" value={item.modelName || '—'} />
                      <Field
                        label="N.º de serie"
                        value={item.serialNumber
                          ? <span className="font-mono text-xs">{item.serialNumber}</span>
                          : '—'}
                      />
                      <Field
                        label="Vencimiento"
                        value={item.expirationDate ? new Date(item.expirationDate).toLocaleDateString() : '—'}
                      />
                    </div>

                    {item.notes && (
                      <p className="line-clamp-2 text-xs" style={{ color: 'var(--ink-soft)' }}>{item.notes}</p>
                    )}
                  </GlassPanel>
                );
              })}
            </Stagger>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b" style={{ background: 'var(--glass-sunken)' }}>
                  <tr>
                    <th className="w-10 px-4 py-3 text-left font-semibold" style={{ color: 'var(--ink-soft)' }}></th>
                    <th className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--ink-soft)' }}>{t('comun.nombre')}</th>
                    <th className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--ink-soft)' }}>{t('comun.tipo')}</th>
                    <th className="hidden px-4 py-3 text-left font-semibold sm:table-cell" style={{ color: 'var(--ink-soft)' }}>N.º de serie</th>
                    <th className="hidden px-4 py-3 text-left font-semibold md:table-cell" style={{ color: 'var(--ink-soft)' }}>{t("ui.GlobalInventory.condicion", "Condición")}</th>
                    <th className="px-4 py-3 text-left font-semibold" style={{ color: 'var(--ink-soft)' }}>{t('comun.estado')}</th>
                    <th className="px-4 py-3 text-right font-semibold" style={{ color: 'var(--ink-soft)' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((item) => {
                    const abierto = expandedId === item.id;
                    const vigencia = estadoVigencia(item.expirationDate);
                    return (
                      <Fragment key={item.id}>
                        <tr
                          className="cursor-pointer transition-colors hover:bg-[var(--glass-sunken)]"
                          style={abierto ? { background: 'var(--brand-wash)' } : undefined}
                          onClick={() => setExpandedId(abierto ? null : item.id)}
                        >
                          <td className="w-10 px-2 py-3">
                            <span
                              className="inline-flex p-1"
                              style={{ color: abierto ? 'var(--brand-text)' : 'var(--ink-faint)' }}
                              aria-hidden
                            >
                              {abierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-foreground">{item.name}</span>
                          </td>
                          <td className="px-4 py-3" style={{ color: 'var(--ink-soft)' }}>
                            {ITEM_TYPE_LABELS[item.type] || item.type}
                          </td>
                          <td className="hidden px-4 py-3 font-mono text-xs sm:table-cell" style={{ color: 'var(--ink-soft)' }}>
                            {item.serialNumber || '—'}
                          </td>
                          <td className="hidden px-4 py-3 md:table-cell">
                            <StatusBadge tone={CONDITION_TONE[item.condition]}>
                              {ITEM_CONDITION_LABELS[item.condition]}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge tone={STATUS_TONE[item.status]}>
                              {ITEM_STATUS_LABELS[item.status]}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end">{acciones(item)}</div>
                          </td>
                        </tr>

                        {/* Detalle desplegado */}
                        {abierto && (
                          <tr style={{ background: 'var(--brand-wash)' }}>
                            <td colSpan={7} className="px-6 py-4">
                              <div className="glass-sunken grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4">
                                <Field label="Marca" value={item.brand || '—'} />
                                <Field label="Modelo" value={item.modelName || '—'} />
                                <Field
                                  label="N.º de serie"
                                  value={item.serialNumber
                                    ? <span className="font-mono text-xs">{item.serialNumber}</span>
                                    : '—'}
                                />
                                <Field
                                  label="Vencimiento"
                                  value={item.expirationDate ? (
                                    <span className="inline-flex items-center gap-2">
                                      {new Date(item.expirationDate).toLocaleDateString()}
                                      {vigencia && <StatusBadge tone={vigencia.tone} dot={false}>{vigencia.label}</StatusBadge>}
                                    </span>
                                  ) : '—'}
                                />
                                <Field
                                  label="Creado"
                                  value={item.createdAt ? new Date(item.createdAt).toLocaleDateString() : '—'}
                                />
                                {item.notes && (
                                  <div className="col-span-2 min-w-0">
                                    <div className="cg-eyebrow mb-0.5">{t('comun.notas')}</div>
                                    <div className="text-sm" style={{ color: 'var(--ink-soft)' }}>{item.notes}</div>
                                  </div>
                                )}
                                {item.photos && item.photos.length > 0 && (
                                  <div className="col-span-full mt-1">
                                    <div className="cg-eyebrow mb-2">Fotos</div>
                                    <div className="flex flex-wrap gap-2">
                                      {item.photos.map((photo, idx) => {
                                        const src = photo.downloadUrl || photo.publicUrl || null;
                                        return src ? (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setLightboxSrc(src); }}
                                            className="cg-focus h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border transition-colors"
                                            style={{ borderColor: 'var(--hairline)' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hairline)'; }}
                                          >
                                            <SmartImage src={src} alt="" className="h-full w-full" />
                                          </button>
                                        ) : null;
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div
              className={`mt-4 flex items-center justify-between ${vista === 'lista' ? 'border-t px-4 py-3' : 'pt-1'}`}
              // El filo y el fondo salen de los tokens: un `border-t` a secas
              // cae en el gris por defecto de Tailwind, que no es `--hairline`
              // y no cambia con el tema.
              style={vista === 'lista' ? { borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' } : undefined}
            >
              <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>
                Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </Section>
      </PageContainer>
      </div>

      {/* Alta / edición */}
      <Modal
        open={showModal}
        onOpenChange={(o) => { if (!o) closeModal(); }}
        title={editingItem ? 'Editar artículo' : 'Nuevo artículo'}
        icon={<Package className="h-5 w-5" />}
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={closeModal} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingItem ? 'Guardar cambios' : 'Crear artículo'}
            </Button>
          </>
        )}
      >
            <div className="space-y-4">
              {/* Nombre */}
              <div className="space-y-1">
                <Label htmlFor="inv-name">{" "}{t('comun.nombre')}{" "}<span style={{ color: 'var(--bad-text)' }}>*</span>
                </Label>
                <Input
                  id="inv-name"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder="Ej: Radio Motorola #3"
                />
              </div>

              {/* Tipo */}
              <div className="space-y-1">
                <Label>{" "}{t('comun.tipo')}{" "}<span style={{ color: 'var(--bad-text)' }}>*</span>
                </Label>
                <Select value={form.type} onValueChange={(v) => setField('type', v as ItemType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{ITEM_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Marca + modelo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="inv-brand">Marca</Label>
                  <Input
                    id="inv-brand"
                    value={form.brand}
                    onChange={(e) => setField('brand', e.target.value)}
                    placeholder="Motorola"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-model">Modelo</Label>
                  <Input
                    id="inv-model"
                    value={form.modelName}
                    onChange={(e) => setField('modelName', e.target.value)}
                    placeholder="EP350"
                  />
                </div>
              </div>

              {/* Serie */}
              <div className="space-y-1">
                <Label htmlFor="inv-serial">{t("ui.GlobalInventory.numeroDeSerie", "Número de serie")}</Label>
                <div className="relative">
                  <Hash className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
                  <Input
                    id="inv-serial"
                    className="pl-9 font-mono"
                    value={form.serialNumber}
                    onChange={(e) => setField('serialNumber', e.target.value)}
                    placeholder="SN-12345"
                  />
                </div>
              </div>

              {/* Condición + estado */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("ui.GlobalInventory.condicion2", "Condición")}</Label>
                  <Select value={form.condition} onValueChange={(v) => setField('condition', v as ItemCondition)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>{ITEM_CONDITION_LABELS[c]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t('comun.estado')}</Label>
                  <Select value={form.status} onValueChange={(v) => setField('status', v as ItemStatus)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{ITEM_STATUS_LABELS[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Vencimiento (sólo chaleco / arma) */}
              {(form.type === 'chaleco_antibalas' || form.type === 'arma') && (
                <div className="space-y-1">
                  <Label htmlFor="inv-exp">{t('comun.fechaDeVencimiento')}</Label>
                  <div className="relative">
                    <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
                    <Input
                      id="inv-exp"
                      type="date"
                      className="pl-9"
                      value={form.expirationDate}
                      onChange={(e) => setField('expirationDate', e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Notas */}
              <div className="space-y-1">
                <Label htmlFor="inv-notes">{t('comun.notasOpcional')}</Label>
                <Textarea
                  id="inv-notes"
                  className="resize-none"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setField('notes', e.target.value)}
                  placeholder="Observaciones adicionales..."
                />
              </div>

              {/* Fotos */}
              <div className="space-y-2">
                <Label>{t("ui.GlobalInventory.fotosDelArticulo", "Fotos del artículo")}</Label>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="cg-focus flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-3 text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)', color: 'var(--ink-soft)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand-text)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--hairline)'; e.currentTarget.style.color = 'var(--ink-soft)'; }}
                >
                  {uploadingPhoto
                    ? (
                      <span
                        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                        style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
                      />
                    )
                    : <ImagePlus className="h-4 w-4" />}
                  {uploadingPhoto ? 'Subiendo...' : 'Agregar fotos'}
                </button>
                {(form.photos || []).length > 0 && (
                  <div className="mt-1 grid grid-cols-4 gap-2">
                    {(form.photos || []).map((photo, idx) => {
                      const src = getPhotoUrl(photo);
                      return (
                        <div
                          key={idx}
                          className="group relative aspect-square overflow-hidden rounded-lg border"
                          style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
                        >
                          <SmartImage
                            src={src}
                            alt=""
                            className="h-full w-full"
                            fallback={(
                              <span className="grid h-full w-full place-items-center" style={{ color: 'var(--ink-faint)' }}>
                                <Package className="h-6 w-6" />
                              </span>
                            )}
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(idx)}
                            aria-label="Quitar foto"
                            // `.cg-btn-bad` en vez de un `oklch(1 0 0)` a mano:
                            // el blanco sobre el rojo de peligro es una decisión
                            // que ya toma el sistema, en glass.css, y que sigue
                            // valiendo si el rojo semántico cambia.
                            /* En un móvil no hay `hover`: si la única forma de
                               ver la aspa es pasar el ratón, la foto no se
                               puede quitar desde el teléfono. Visible siempre
                               en táctil, y del tamaño mínimo para el dedo. */
                            className="cg-btn-bad cg-focus absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full transition-opacity md:h-5 md:w-5 md:opacity-0 md:group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
      </Modal>

      {/* Visor de foto.
          `.glass-scrim` en vez de un negro y un desenfoque escritos a mano: es
          el velo del sistema, ya tiene su versión oscura y, sobre todo, se
          apaga solo con `prefers-reduced-motion` — un `backdrop-filter` a pelo
          no. Sigue siendo UN velo a pantalla completa, no uno por fila, así que
          la regla del desenfoque dentro de un `map()` no aplica aquí. */}
      {lightboxSrc && (
        <div
          className="glass-scrim fixed inset-0 z-[60] flex items-center justify-center"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="glass-flat cg-focus absolute right-4 top-4 rounded-full p-2 transition-colors"
            style={{ color: 'var(--ink)' }}
            onClick={() => setLightboxSrc(null)}
            aria-label={t('actions.close')}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={lightboxSrc}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
            style={{ boxShadow: 'var(--lift-4)' }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Confirmación de borrado */}
      <Modal
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        title={t("ui.GlobalInventory.eliminarArticulo", "Eliminar artículo")}
        icon={<Trash2 className="h-5 w-5" />}
        size="sm"
        footer={(
          <>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </>
        )}
      >
        <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>
          ¿Estás seguro de que quieres eliminar{' '}
          <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
          Esta acción no se puede deshacer.
        </p>
      </Modal>
    </AppLayout>
  );
}
