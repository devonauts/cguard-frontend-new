import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ClipboardList, Plus, Star, Pencil, Trash2, ChevronUp, ChevronDown, Copy } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import Breadcrumb from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { PageContainer, PageHeader, Section, StatusBadge, EmptyState, ListRow, SkeletonCards, Modal, FormField, FIELD_CLS, InfoNote } from '@/components/kit';
import { confirmDialog } from '@/components/ui/confirmDialog';
import { usePageTitle } from '@/hooks/usePageTitle';
import routeInspectionTemplateService, { type InspectionTemplate, type TemplateContent, type TemplateItem, type TemplateSection, type ItemType } from '@/lib/api/routeInspectionTemplateService';

/**
 * PLANTILLAS DE INSPECCIÓN de las paradas de supervisión. Lo que el
 * supervisor contesta en cada puesto. Cada cambio de contenido crea una
 * VERSIÓN nueva: las visitas ya hechas guardan su instantánea, así que editar
 * nunca reescribe la historia.
 */
const TIPOS: Array<{ value: ItemType; label: string }> = [
  { value: 'yes_no', label: 'Sí / No' }, { value: 'pass_fail', label: 'Pasa / Falla' }, { value: 'boolean', label: 'Interruptor' },
  { value: 'checkbox', label: 'Casilla' }, { value: 'acknowledgement', label: 'Confirmación' }, { value: 'slider', label: 'Escala deslizante' },
  { value: 'rating', label: 'Estrellas' }, { value: 'number', label: 'Número' }, { value: 'text', label: 'Texto corto' },
  { value: 'textarea', label: 'Texto largo' }, { value: 'single_select', label: 'Opción única' }, { value: 'multi_select', label: 'Varias opciones' },
  { value: 'photo', label: 'Foto' }, { value: 'signature', label: 'Firma' }, { value: 'date', label: 'Fecha' }, { value: 'time', label: 'Hora' },
  { value: 'datetime', label: 'Fecha y hora' }, { value: 'guard_selector', label: 'Selector de vigilante' },
];
const ESCALABLES = new Set(['slider', 'rating', 'number']);
const CON_OPCIONES = new Set(['single_select', 'multi_select']);
const FALLABLES = new Set(['yes_no', 'pass_fail', 'boolean', 'checkbox', 'acknowledgement', 'single_select', 'slider', 'rating', 'number']);
const nuevoId = (p: string) => `${p}_${Math.random().toString(36).slice(2, 7)}`;

export default function InspectionTemplatesPage() {
  const { t } = useTranslation();
  usePageTitle('Plantillas de inspección');
  const [rows, setRows] = useState<InspectionTemplate[] | null>(null);
  const [editing, setEditing] = useState<InspectionTemplate | 'new' | null>(null);
  const [factory, setFactory] = useState<TemplateContent | null>(null);

  const load = async () => {
    try {
      const [lista, cat] = await Promise.all([routeInspectionTemplateService.list(), routeInspectionTemplateService.catalog().catch(() => null)]);
      setRows(lista); if (cat) setFactory(cat.factoryDefault);
    } catch (e: any) { toast.error(e?.message || 'Error'); setRows([]); }
  };
  useEffect(() => { load(); }, []);

  const marcarDefecto = async (tpl: InspectionTemplate) => {
    try { await routeInspectionTemplateService.update(tpl.id, { isDefault: true }); toast.success(t('ui.InspectionTemplates.defectoOk', 'Ahora es la plantilla por defecto')); load(); }
    catch (e: any) { toast.error(e?.response?.data?.message || e?.message || 'Error'); }
  };
  const borrar = async (tpl: InspectionTemplate) => {
    if (!(await confirmDialog({ title: t('ui.InspectionTemplates.borrarTitulo', 'Desactivar «{{name}}»', { name: tpl.name }), message: t('ui.InspectionTemplates.borrarMsg', 'Las paradas que la usan pasarán a la plantilla por defecto. Las visitas ya hechas conservan su copia.'), confirmText: 'Desactivar' }))) return;
    try { await routeInspectionTemplateService.destroy(tpl.id); toast.success(t('ui.InspectionTemplates.borradaOk', 'Plantilla desactivada')); load(); }
    catch (e: any) { toast.error(e?.response?.data?.message || e?.message || 'Error'); }
  };
  const duplicar = (tpl: InspectionTemplate) => setEditing({ ...tpl, id: '', name: `${tpl.name} (copia)`, isDefault: false, version: 1 });

  return (
    <AppLayout>
      <Breadcrumb items={[{ label: 'Patrulla vehicular', path: '/vehicle-patrol' }, { label: 'Plantillas de inspección' }]} />
      <PageContainer>
        <PageHeader icon={<ClipboardList />} title={t('ui.InspectionTemplates.titulo', 'Plantillas de inspección')} subtitle={t('ui.InspectionTemplates.sub', 'Lo que el supervisor revisa y contesta en cada parada de su ruta.')}
          actions={<Button variant="brand" onClick={() => setEditing('new')}><Plus className="size-4" />{t('ui.InspectionTemplates.nueva', 'Nueva plantilla')}</Button>} />
        <InfoNote tone="info" className="mb-4">{t('ui.InspectionTemplates.nota', 'Cada plantilla se asigna por ruta o por parada al editar la ruta. Si no se asigna ninguna, se usa la marcada por defecto. Editar una plantilla crea una versión nueva; las visitas anteriores no cambian.')}</InfoNote>
        <Section title={t('ui.InspectionTemplates.lista', 'Plantillas')} icon={<ClipboardList />}>
          {rows === null ? <SkeletonCards count={3} /> : rows.length === 0 ? <EmptyState icon={<ClipboardList />} title={t('ui.InspectionTemplates.vacio', 'Sin plantillas')} /> : (
            <div className="space-y-2">
              {rows.map((tpl) => {
                const items = (tpl.content?.sections || []).reduce((n, s) => n + (s.items?.length || 0), 0);
                return (
                  <ListRow key={tpl.id} title={tpl.name} subtitle={`${tpl.content?.sections?.length || 0} secciones · ${items} ítems · v${tpl.version}${tpl.description ? ` · ${tpl.description}` : ''}`}
                    badges={tpl.isDefault ? <StatusBadge tone="brand" className="whitespace-nowrap">{t('ui.InspectionTemplates.porDefecto', 'Por defecto')}</StatusBadge> : null}
                    actions={(
                      <div className="flex gap-1">
                        {!tpl.isDefault && <Button size="sm" variant="ghost" onClick={() => marcarDefecto(tpl)}><Star className="size-3.5" /></Button>}
                        <Button size="sm" variant="ghost" onClick={() => duplicar(tpl)} aria-label="Duplicar"><Copy className="size-3.5" /></Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(tpl)}><Pencil className="size-3.5" />{t('comun.editar', 'Editar')}</Button>
                        {!tpl.isDefault && <Button size="sm" variant="ghost" onClick={() => borrar(tpl)} aria-label="Desactivar"><Trash2 className="size-3.5" /></Button>}
                      </div>
                    )} />
                );
              })}
            </div>
          )}
        </Section>
      </PageContainer>
      {editing && <EditorModal tpl={editing === 'new' ? null : editing} factory={factory} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </AppLayout>
  );
}

function EditorModal({ tpl, factory, onClose, onSaved }: { tpl: InspectionTemplate | null; factory: TemplateContent | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const esNueva = !tpl?.id;
  const [name, setName] = useState(tpl?.name || '');
  const [description, setDescription] = useState(tpl?.description || '');
  const [isDefault, setIsDefault] = useState(tpl?.isDefault || false);
  const [content, setContent] = useState<TemplateContent>(() => tpl?.content ? JSON.parse(JSON.stringify(tpl.content)) : (factory ? JSON.parse(JSON.stringify(factory)) : { settings: {}, sections: [{ id: nuevoId('sec'), title: 'Sección 1', items: [] }] }));
  const [saving, setSaving] = useState(false);
  const setSettings = (p: Partial<NonNullable<TemplateContent['settings']>>) => setContent((c) => ({ ...c, settings: { ...(c.settings || {}), ...p } }));
  const setSection = (i: number, fn: (s: TemplateSection) => TemplateSection) => setContent((c) => ({ ...c, sections: c.sections.map((s, j) => (j === i ? fn(s) : s)) }));
  const setItem = (si: number, ii: number, fn: (it: TemplateItem) => TemplateItem) => setSection(si, (s) => ({ ...s, items: s.items.map((it, j) => (j === ii ? fn(it) : it)) }));
  const mover = <T,>(arr: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= arr.length) return arr; const c = arr.slice(); [c[i], c[j]] = [c[j], c[i]]; return c; };
  const todosItems = content.sections.flatMap((s) => s.items);

  const save = async () => {
    if (!name.trim()) { toast.error(t('ui.InspectionTemplates.nombreReq', 'La plantilla necesita un nombre')); return; }
    if (!todosItems.length) { toast.error(t('ui.InspectionTemplates.itemsReq', 'Añade al menos un ítem')); return; }
    setSaving(true);
    try {
      if (esNueva) await routeInspectionTemplateService.create({ name: name.trim(), description: description.trim() || undefined, content, isDefault });
      else await routeInspectionTemplateService.update(tpl!.id, { name: name.trim(), description: description.trim(), content, isDefault });
      toast.success(esNueva ? t('ui.InspectionTemplates.creada', 'Plantilla creada') : t('ui.InspectionTemplates.guardada', 'Plantilla guardada (versión nueva si cambió el contenido)'));
      onSaved();
    } catch (e: any) { toast.error(e?.response?.data?.message || e?.message || 'Error'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onOpenChange={(v) => { if (!v) onClose(); }} title={esNueva ? t('ui.InspectionTemplates.nueva', 'Nueva plantilla') : `${tpl!.name} · v${tpl!.version}`} icon={<ClipboardList />} size="xl"
      footer={<><Button variant="outline" onClick={onClose}>{t('comun.cancelar', 'Cancelar')}</Button><Button variant="brand" onClick={save} disabled={saving}>{t('comun.guardar', 'Guardar')}</Button></>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('ui.InspectionTemplates.nombre', 'Nombre')} required><input className={FIELD_CLS} value={name} onChange={(e) => setName(e.target.value)} maxLength={150} /></FormField>
          <FormField label={t('ui.InspectionTemplates.descripcion', 'Descripción')}><input className={FIELD_CLS} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={255} /></FormField>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />{t('ui.InspectionTemplates.usarPorDefecto', 'Usar por defecto')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!content.settings?.requireGuardVerification} onChange={(e) => setSettings({ requireGuardVerification: e.target.checked })} />{t('ui.InspectionTemplates.exigirPersonal', 'Exigir verificar al personal')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!content.settings?.requireNotes} onChange={(e) => setSettings({ requireNotes: e.target.checked })} />{t('ui.InspectionTemplates.exigirNotas', 'Exigir notas')}</label>
          <label className="flex items-center gap-2">{t('ui.InspectionTemplates.fotosMin', 'Fotos mínimas')}<input type="number" min={0} max={20} className={`${FIELD_CLS} w-20`} value={content.settings?.minPhotos ?? 0} onChange={(e) => setSettings({ minPhotos: Number(e.target.value) || 0 })} /></label>
        </div>

        {content.sections.map((sec, si) => (
          <div key={sec.id} className="rounded-2xl border p-3" style={{ borderColor: 'var(--hairline)' }}>
            <div className="flex items-center gap-2">
              <input className={`${FIELD_CLS} font-semibold`} value={sec.title} onChange={(e) => setSection(si, (s) => ({ ...s, title: e.target.value }))} maxLength={120} placeholder="Título de la sección" />
              <Button size="icon" variant="ghost" disabled={si === 0} onClick={() => setContent((c) => ({ ...c, sections: mover(c.sections, si, -1) }))}><ChevronUp className="size-4" /></Button>
              <Button size="icon" variant="ghost" disabled={si === content.sections.length - 1} onClick={() => setContent((c) => ({ ...c, sections: mover(c.sections, si, 1) }))}><ChevronDown className="size-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => setContent((c) => ({ ...c, sections: c.sections.filter((_, j) => j !== si) }))} aria-label="Quitar sección"><Trash2 className="size-4" /></Button>
            </div>
            <div className="mt-2 space-y-2">
              {sec.items.map((it, ii) => (
                <ItemEditor key={it.id} it={it} otros={todosItems.filter((x) => x.id !== it.id)}
                  onChange={(fn) => setItem(si, ii, fn)}
                  onMove={(d) => setSection(si, (s) => ({ ...s, items: mover(s.items, ii, d) }))}
                  onRemove={() => setSection(si, (s) => ({ ...s, items: s.items.filter((_, j) => j !== ii) }))}
                  first={ii === 0} last={ii === sec.items.length - 1} />
              ))}
              <Button size="sm" variant="outline" onClick={() => setSection(si, (s) => ({ ...s, items: [...s.items, { id: nuevoId('it'), type: 'yes_no', label: '', required: true, clientVisible: true, weight: 1 }] }))}><Plus className="size-3.5" />{t('ui.InspectionTemplates.agregarItem', 'Añadir ítem')}</Button>
            </div>
          </div>
        ))}
        <Button variant="outline" onClick={() => setContent((c) => ({ ...c, sections: [...c.sections, { id: nuevoId('sec'), title: `Sección ${c.sections.length + 1}`, items: [] }] }))}><Plus className="size-4" />{t('ui.InspectionTemplates.agregarSeccion', 'Añadir sección')}</Button>
      </div>
    </Modal>
  );
}

function ItemEditor({ it, otros, onChange, onMove, onRemove, first, last }: { it: TemplateItem; otros: TemplateItem[]; onChange: (fn: (it: TemplateItem) => TemplateItem) => void; onMove: (d: -1 | 1) => void; onRemove: () => void; first: boolean; last: boolean }) {
  const { t } = useTranslation();
  const [mas, setMas] = useState(false);
  const set = (p: Partial<TemplateItem>) => onChange((x) => ({ ...x, ...p }));
  return (
    <div className="rounded-xl p-2" style={{ background: 'var(--glass-sunken)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${FIELD_CLS} min-w-[200px] flex-1`} value={it.label} placeholder={t('ui.InspectionTemplates.pregunta', 'Pregunta')} onChange={(e) => set({ label: e.target.value })} maxLength={200} />
        <select className={`${FIELD_CLS} w-44`} value={it.type} onChange={(e) => set({ type: e.target.value as ItemType, scale: ESCALABLES.has(e.target.value) ? (it.scale || { min: e.target.value === 'rating' ? 1 : 0, max: e.target.value === 'rating' ? 5 : 10 }) : undefined, options: CON_OPCIONES.has(e.target.value) ? (it.options || [{ value: 'a', label: 'Opción A', score: 1 }, { value: 'b', label: 'Opción B', score: 0 }]) : undefined })}>
          {TIPOS.map((tp) => <option key={tp.value} value={tp.value}>{tp.label}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.required !== false} onChange={(e) => set({ required: e.target.checked })} />{t('ui.InspectionTemplates.obligatorio', 'Obligatorio')}</label>
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={it.clientVisible !== false} onChange={(e) => set({ clientVisible: e.target.checked })} />{t('ui.InspectionTemplates.cliente', 'Cliente')}</label>
        <Button size="sm" variant="ghost" onClick={() => setMas((m) => !m)}>{mas ? t('ui.InspectionTemplates.menos', 'Menos') : t('ui.InspectionTemplates.mas', 'Más…')}</Button>
        <Button size="icon" variant="ghost" disabled={first} onClick={() => onMove(-1)}><ChevronUp className="size-4" /></Button>
        <Button size="icon" variant="ghost" disabled={last} onClick={() => onMove(1)}><ChevronDown className="size-4" /></Button>
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Quitar"><Trash2 className="size-4" /></Button>
      </div>
      {mas && (
        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
          <label className="flex items-center gap-2">{t('ui.InspectionTemplates.ayuda', 'Ayuda')}<input className={FIELD_CLS} value={it.help || ''} onChange={(e) => set({ help: e.target.value })} maxLength={400} /></label>
          <label className="flex items-center gap-2">{t('ui.InspectionTemplates.peso', 'Peso en la nota')}<input type="number" min={0} max={10} step={0.5} className={`${FIELD_CLS} w-20`} value={it.weight ?? 1} onChange={(e) => set({ weight: Number(e.target.value) })} /></label>
          {ESCALABLES.has(it.type) && (
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <span>{t('ui.InspectionTemplates.escala', 'Escala')}</span>
              <input type="number" className={`${FIELD_CLS} w-20`} value={it.scale?.min ?? 0} onChange={(e) => set({ scale: { ...(it.scale || { min: 0, max: 10 }), min: Number(e.target.value) } })} aria-label="Mínimo" />
              <span>–</span>
              <input type="number" className={`${FIELD_CLS} w-20`} value={it.scale?.max ?? 10} onChange={(e) => set({ scale: { ...(it.scale || { min: 0, max: 10 }), max: Number(e.target.value) } })} aria-label="Máximo" />
              <input className={`${FIELD_CLS} w-28`} placeholder="Etiqueta mín." value={it.scale?.minLabel || ''} onChange={(e) => set({ scale: { ...(it.scale || { min: 0, max: 10 }), minLabel: e.target.value } })} />
              <input className={`${FIELD_CLS} w-28`} placeholder="Etiqueta máx." value={it.scale?.maxLabel || ''} onChange={(e) => set({ scale: { ...(it.scale || { min: 0, max: 10 }), maxLabel: e.target.value } })} />
              <span>{t('ui.InspectionTemplates.fallaSi', 'Falla si es menor que')}</span>
              <input type="number" className={`${FIELD_CLS} w-20`} value={it.failWhen?.lt ?? ''} onChange={(e) => set({ failWhen: e.target.value === '' ? undefined : { lt: Number(e.target.value) } })} />
            </div>
          )}
          {CON_OPCIONES.has(it.type) && (
            <div className="sm:col-span-2">
              <p className="mb-1">{t('ui.InspectionTemplates.opciones', 'Opciones (valor · etiqueta · puntaje 0–1)')}</p>
              {(it.options || []).map((o, i) => (
                <div key={i} className="mb-1 flex gap-2">
                  <input className={`${FIELD_CLS} w-24`} value={o.value} onChange={(e) => set({ options: it.options!.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                  <input className={`${FIELD_CLS} flex-1`} value={o.label} onChange={(e) => set({ options: it.options!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <input type="number" min={0} max={1} step={0.1} className={`${FIELD_CLS} w-20`} value={o.score ?? ''} onChange={(e) => set({ options: it.options!.map((x, j) => (j === i ? { ...x, score: e.target.value === '' ? undefined : Number(e.target.value) } : x)) })} />
                  <Button size="icon" variant="ghost" onClick={() => set({ options: it.options!.filter((_, j) => j !== i) })}><Trash2 className="size-3.5" /></Button>
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => set({ options: [...(it.options || []), { value: `o${(it.options?.length || 0) + 1}`, label: '', score: 1 }] })}><Plus className="size-3.5" />Opción</Button>
            </div>
          )}
          {it.type === 'photo' && <label className="flex items-center gap-2">{t('ui.InspectionTemplates.fotosMinItem', 'Fotos mínimas')}<input type="number" min={0} max={10} className={`${FIELD_CLS} w-20`} value={it.photo?.min ?? 1} onChange={(e) => set({ photo: { ...(it.photo || {}), min: Number(e.target.value) } })} /></label>}
          {FALLABLES.has(it.type) && (
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <span>{t('ui.InspectionTemplates.alFallar', 'Al fallar:')}</span>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!it.onFail?.requireNote} onChange={(e) => set({ onFail: { ...(it.onFail || {}), requireNote: e.target.checked } })} />{t('ui.InspectionTemplates.exigeNota', 'exige nota')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!it.onFail?.requirePhoto} onChange={(e) => set({ onFail: { ...(it.onFail || {}), requirePhoto: e.target.checked } })} />{t('ui.InspectionTemplates.exigeFoto', 'exige foto')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!it.onFail?.offerIncident} onChange={(e) => set({ onFail: { ...(it.onFail || {}), offerIncident: e.target.checked } })} />{t('ui.InspectionTemplates.ofreceIncidente', 'ofrece crear incidente')}</label>
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!it.onFail?.offerTask} onChange={(e) => set({ onFail: { ...(it.onFail || {}), offerTask: e.target.checked } })} />{t('ui.InspectionTemplates.ofreceTarea', 'ofrece crear tarea')}</label>
              <label className="flex items-center gap-1">{t('ui.InspectionTemplates.gravedad', 'gravedad')}
                <select className={`${FIELD_CLS} w-28`} value={it.onFail?.severity || 'medium'} onChange={(e) => set({ onFail: { ...(it.onFail || {}), severity: e.target.value } })}>
                  <option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="critical">Crítica</option>
                </select>
              </label>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <span>{t('ui.InspectionTemplates.mostrarSolo', 'Mostrar sólo si')}</span>
            <select className={`${FIELD_CLS} w-56`} value={it.showIf?.itemId || ''} onChange={(e) => set({ showIf: e.target.value ? { itemId: e.target.value, isFail: true } : undefined })}>
              <option value="">{t('ui.InspectionTemplates.siempre', 'Siempre')}</option>
              {otros.map((o) => <option key={o.id} value={o.id}>{o.label || o.id}</option>)}
            </select>
            {it.showIf && (
              <select className={`${FIELD_CLS} w-40`} value={it.showIf.isFail !== undefined ? (it.showIf.isFail ? 'fail' : 'pass') : 'equals'} onChange={(e) => set({ showIf: e.target.value === 'fail' ? { itemId: it.showIf!.itemId, isFail: true } : e.target.value === 'pass' ? { itemId: it.showIf!.itemId, isFail: false } : { itemId: it.showIf!.itemId, equals: '' } })}>
                <option value="fail">{t('ui.InspectionTemplates.falla', 'falla')}</option><option value="pass">{t('ui.InspectionTemplates.pasa', 'pasa')}</option><option value="equals">{t('ui.InspectionTemplates.vale', 'vale…')}</option>
              </select>
            )}
            {it.showIf && it.showIf.isFail === undefined && <input className={`${FIELD_CLS} w-32`} value={it.showIf.equals ?? ''} onChange={(e) => set({ showIf: { itemId: it.showIf!.itemId, equals: e.target.value } })} placeholder="valor" />}
          </div>
        </div>
      )}
    </div>
  );
}
