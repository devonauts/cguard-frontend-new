import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Client } from '@/types/client';
import useScrollToTopOnMount from '@/hooks/useScrollToTopOnMount';
import { clientService } from '@/lib/api/clientService';
import securityGuardService from '@/lib/api/securityGuardService';
import { Section, EmptyState, StatusBadge, Modal, IconTile } from '@/components/kit';
import { FIELD_CLS, LabeledField, TabTable, THead, Th, Tr, RowAction, RowActions, Pager, TabFooter, TabLoading, KpiTile } from '../_shared/tab-kit';
import { Donut, MeterBar } from '@/components/charts';
import { seriesVar } from '@/lib/chartColors';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Search, FileText, FileSpreadsheet, FileImage, FileArchive, File as FileIcon, Files, HardDrive, FolderOpen, CalendarPlus, Upload, Download, Trash2, X, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { confirmDialog } from "@/components/ui/confirmDialog";

// ── Shape of GET /client-account/:id/documents (clientAccountDocuments.ts) ──
interface DocRow {
  id: string;
  code: string;
  name: string;
  category: string;
  type: string;
  cls: 'documents' | 'images' | 'videos' | 'others';
  sizeInBytes: number;
  sizeLabel: string;
  uploadedBy: string;
  createdAt: string;
  downloadUrl: string | null;
}
interface DocCategory { name: string; count: number; }
interface DocActivity { id: string; name: string; user: string; at: string; action: string; }
interface DocBreakdownEntry { bytes: number; label: string; }
interface DocBreakdown { documents: DocBreakdownEntry; images: DocBreakdownEntry; videos: DocBreakdownEntry; others: DocBreakdownEntry; }
interface DocKpis {
  total: number; uploadedThisMonth: number; categoriesCount: number;
  storageUsedBytes: number; storageUsedLabel: string;
  capBytes: number; capLabel: string; usedPct: number;
}
interface DocumentsData {
  kpis: DocKpis;
  breakdown: DocBreakdown;
  categories: DocCategory[];
  recentActivity: DocActivity[];
  types: string[];
  total: number; page: number; perPage: number;
  documents: DocRow[];
  updatedAt: string;
}

/** El tipo de archivo se distingue por ICONO, no por color propio: la paleta es
 *  acromática + un acento, y ocho colores de archivo la romperían. */
type IconTone = 'brand' | 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
const TYPE_META: Record<string, { icon: LucideIcon; tone: IconTone }> = {
  PDF: { icon: FileText, tone: 'bad' },
  Excel: { icon: FileSpreadsheet, tone: 'ok' },
  Word: { icon: FileText, tone: 'info' },
  PowerPoint: { icon: FileText, tone: 'warn' },
  Imagen: { icon: FileImage, tone: 'brand' },
  Video: { icon: FileImage, tone: 'brand' },
  Comprimido: { icon: FileArchive, tone: 'warn' },
  Texto: { icon: FileText, tone: 'neutral' },
};
const typeMeta = (t: string) => TYPE_META[t] || { icon: FileIcon, tone: 'neutral' as IconTone };

const CATEGORIES = ['Post Orders', 'Manuales', 'Procedimientos', 'Reportes', 'Políticas', 'Contratos', 'Mapas', 'Capacitación', 'Planos', 'Otros'];
/* Cuatro tipos de archivo: categorías sin orden, a los escalones de serie del
   acento y siempre en la misma posición. */
const BREAK_META = [
  { key: 'documents', label: 'Documentos', color: seriesVar(0) },
  { key: 'images', label: 'Imágenes', color: seriesVar(1) },
  { key: 'videos', label: 'Vídeos', color: seriesVar(2) },
  { key: 'others', label: 'Otros', color: seriesVar(3) },
];

const fmtDT = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-EC', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace instantes';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} días`;
};


export default function ClientDocuments({ client }: { client: Client }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  useScrollToTopOnMount(containerRef);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [data, setData] = useState<DocumentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [uploadOpen, setUploadOpen] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [upCategory, setUpCategory] = useState('Otros');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try { const d = await clientService.getClientDocuments(client.id, { q: q.trim() || undefined, category: category || undefined, type: type || undefined, page, perPage }); setData(d); }
    catch { /* silent */ } finally { setLoading(false); }
  };
  useEffect(() => { const t = setTimeout(() => load(), 250); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q, category, type, page, client.id]);

  const kpis: Partial<DocKpis> = data?.kpis || {};
  const breakdown: Partial<Record<string, DocBreakdownEntry>> = (data?.breakdown || {}) as Partial<Record<string, DocBreakdownEntry>>;
  const categories: DocCategory[] = data?.categories || [];
  const activity: DocActivity[] = data?.recentActivity || [];
  const types: string[] = data?.types || [];
  const docs: DocRow[] = data?.documents || [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const fmtUpdated = data?.updatedAt ? new Date(data.updatedAt).toLocaleString('es-EC', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

  const donutSegments = useMemo(() => BREAK_META.map((b) => ({ value: breakdown[b.key]?.bytes || 0, color: b.color, label: b.label })).filter((s) => s.value > 0), [breakdown]);
  const resetPage = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };

  const onPick = (files: FileList | null) => { if (files) setPending((prev) => [...prev, ...Array.from(files)]); };

  const doUpload = async () => {
    if (!pending.length) { setUploadOpen(false); return; }
    setUploading(true);
    let ok = 0;
    for (const f of pending) {
      if (f.size > 100 * 1024 * 1024) { toast.error(`Archivo mayor a 100MB: ${f.name}`); continue; }
      try {
        setProgress((p) => ({ ...p, [f.name]: 0 }));
        const uploaded: { privateUrl?: string | null; publicUrl?: string | null } = await securityGuardService.uploadFileToStorageWithProgress(f, 'legalDocuments', (pct) => setProgress((p) => ({ ...p, [f.name]: pct })));
        await clientService.createClientDocument(client.id, {
          name: f.name, mimeType: f.type || 'application/octet-stream', sizeInBytes: f.size,
          storageId: 'legalDocuments', privateUrl: uploaded?.privateUrl || null, publicUrl: uploaded?.publicUrl || null, category: upCategory,
        });
        ok++;
      } catch { toast.error(`No se pudo subir ${f.name}`); }
    }
    setUploading(false); setPending([]); setProgress({}); setUploadOpen(false);
    if (ok) { toast.success(`${ok} documento(s) subido(s)`); setPage(1); await load(); }
  };

  const doDelete = async (d: DocRow) => {
    if (!await confirmDialog({ message: `¿Eliminar "${d.name}"?`, tone: 'danger' })) return;
    try { await clientService.deleteClientDocument(d.id); toast.success('Documento eliminado'); await load(true); }
    catch { toast.error(t('comun.noSePudoEliminar')); }
  };

  if (loading && !data) return <TabLoading />;

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-lg font-semibold">Biblioteca de documentos</div>
        <Button size="sm" variant="brand" onClick={() => setUploadOpen(true)}><Upload className="mr-1.5 h-4 w-4" /> Subir documento</Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile icon={<Files />} value={kpis.total ?? 0} label={t('ui.ClientDocuments.totalDeDocumentos')} accent="primary" />
        <KpiTile icon={<CalendarPlus />} value={kpis.uploadedThisMonth ?? 0} label={t('ui.ClientDocuments.subidosEsteMes')} accent="green" />
        <KpiTile icon={<FolderOpen />} value={kpis.categoriesCount ?? 0} label={t("ui.ClientDocuments.categorias", "Categorías")} accent="blue" />
        <KpiTile icon={<HardDrive />} value={kpis.storageUsedLabel ?? '0 B'} label={`de ${kpis.capLabel ?? '100 GB'}`} accent="orange" bar={kpis.usedPct ?? 0} barTone={(kpis.usedPct ?? 0) >= 90 ? 'bad' : (kpis.usedPct ?? 0) >= 75 ? 'warn' : 'ok'} sub={<span className="text-xs" style={{ color: 'var(--ink-soft)' }}>{kpis.usedPct ?? 0}%</span>} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.7fr_1fr]">
        {/* LEFT — filters + table */}
        <Section title="Documentos" icon={<Files />}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
              <input className={`${FIELD_CLS} pl-8`} placeholder={t('ui.ClientDocuments.buscarPorNombreTipoO')} value={q} onChange={(e) => resetPage(setQ)(e.target.value)} />
            </div>
            <select className={FIELD_CLS} value={category} onChange={(e) => resetPage(setCategory)(e.target.value)}><option value="">{t("ui.ClientDocuments.categoriaTodas", "Categoría: Todas")}</option>{categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</select>
            <select className={FIELD_CLS} value={type} onChange={(e) => resetPage(setType)(e.target.value)}><option value="">{t('comun.tipoTodos')}</option>{types.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>

          {docs.length === 0 ? (
            <EmptyState icon={<Files />} title={t('comun.sinDocumentos')} description={t('ui.ClientDocuments.subeElPrimerDocumentoDe')} action={<Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="mr-1.5 h-4 w-4" /> Subir documento</Button>} />
          ) : (
            <TabTable>
                <THead>
                  <Th>{t('ui.ClientDocuments.nombreDelDocumento')}</Th>
                  <Th>{t("ui.ClientDocuments.categoria", "Categoría")}</Th>
                  <Th>{t('comun.tipo')}</Th>
                  <Th>{t("ui.ClientDocuments.tamano", "Tamaño")}</Th>
                  <Th>{t('ui.ClientDocuments.actualizadoPor')}</Th>
                  <Th>{t('comun.fecha')}</Th>
                  <Th align="right">Acciones</Th>
                </THead>
                <tbody>
                  {docs.map((d) => {
                    const tm = typeMeta(d.type); const Icon = tm.icon;
                    return (
                      <Tr key={d.id}>
                        <td className="px-2 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <IconTile tone={tm.tone} size="sm"><Icon /></IconTile>
                            <div className="min-w-0"><div className="max-w-[220px] truncate font-medium">{d.name}</div><div className="text-xs" style={{ color: 'var(--ink-faint)' }}>{d.code}</div></div>
                          </div>
                        </td>
                        <td className="px-2 py-2.5"><StatusBadge tone="neutral" dot={false}>{d.category}</StatusBadge></td>
                        <td className="px-2 py-2.5">{d.type}</td>
                        <td className="px-2 py-2.5 tabular-nums">{d.sizeLabel}</td>
                        <td className="px-2 py-2.5 truncate max-w-[130px]">{d.uploadedBy}</td>
                        <td className="px-2 py-2.5 tabular-nums text-xs">{fmtDT(d.createdAt)}</td>
                        <td className="px-2 py-2.5">
                          <RowActions>
                            <RowAction title="Descargar" href={d.downloadUrl || undefined} disabled={!d.downloadUrl}><Download className="h-3.5 w-3.5" /></RowAction>
                            <RowAction title={t('actions.delete')} tone="bad" onClick={() => doDelete(d)}><Trash2 className="h-3.5 w-3.5" /></RowAction>
                          </RowActions>
                        </td>
                      </Tr>
                    );
                  })}
                </tbody>
            </TabTable>
          )}

          <Pager page={page} pageCount={pageCount} total={total} perPage={perPage} noun="documentos" onPage={setPage} />
        </Section>

        {/* RIGHT — storage + categories + activity */}
        <div className="space-y-4">
          <Section title="Almacenamiento" icon={<HardDrive />}>
            <div className="flex items-center gap-4">
              {/* Sin datos el anillo se dibuja igual, sólo el canal: un hueco en
                  blanco haría saltar la maquetación al llegar el primer archivo. */}
              <Donut segments={donutSegments} size={140} centerTop={kpis.storageUsedLabel ?? '0 B'} centerBottom="Usado" ariaLabel="Almacenamiento por tipo de archivo" />
              <div className="flex-1 space-y-2">
                {BREAK_META.map((b) => (
                  <div key={b.key} className="flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.label}</span>
                    <span className="text-xs tabular-nums" style={{ color: 'var(--ink-soft)' }}>{breakdown[b.key]?.label ?? '0 B'}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-xs" style={{ color: 'var(--ink-soft)' }}><span>{kpis.storageUsedLabel ?? '0 B'} de {kpis.capLabel ?? '100 GB'}</span><span>{kpis.usedPct ?? 0}%</span></div>
              <MeterBar height={6} pct={kpis.usedPct ?? 0} minVisiblePct={1} ariaLabel="Almacenamiento usado"
                tone={(kpis.usedPct ?? 0) >= 90 ? 'bad' : (kpis.usedPct ?? 0) >= 75 ? 'warn' : 'ok'} />
            </div>
          </Section>

          <Section title={t("ui.ClientDocuments.categorias", "Categorías")} icon={<FolderOpen />}>
            {categories.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t("ui.ClientDocuments.aunNoHayCategorias", "Aún no hay categorías.")}</p> : (
              <div className="divide-y" style={{ borderColor: 'var(--hairline)' }}>
                {categories.map((c) => (
                  <button key={c.name} onClick={() => resetPage(setCategory)(c.name)} className="cg-focus flex w-full items-center justify-between py-2 text-left text-sm transition-opacity hover:opacity-70">
                    <span>{c.name}</span><span className="tabular-nums" style={{ color: 'var(--ink-soft)' }}>{c.count}</span>
                  </button>
                ))}
              </div>
            )}
          </Section>

          <Section title="Actividad reciente" icon={<Clock />}>
            {activity.length === 0 ? <p className="text-sm" style={{ color: 'var(--ink-soft)' }}>{t('ui.ClientDocuments.sinActividadReciente')}</p> : (
              <div className="space-y-3">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0"><div className="truncate font-medium">{a.user}</div><div className="max-w-[180px] truncate text-xs" style={{ color: 'var(--ink-soft)' }}>{a.action} {a.name}</div></div>
                    <span className="shrink-0 text-xs" style={{ color: 'var(--ink-faint)' }}>{ago(a.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      <TabFooter
        icon={<HardDrive />}
        note="Los documentos se almacenan de forma segura y cumplen con los estándares de protección de datos."
        updatedAt={fmtUpdated}
        onRefresh={() => load()}
      />

      {/* Upload modal */}
      <Modal open={uploadOpen} onOpenChange={(o) => { if (!uploading) setUploadOpen(o); }} title="Subir documento" icon={<Upload className="h-5 w-5" />}
        footer={<><Button variant="outline" onClick={() => setUploadOpen(false)} disabled={uploading}>{t('actions.cancel')}</Button><Button onClick={doUpload} disabled={uploading || !pending.length}>{uploading ? 'Subiendo…' : `Subir ${pending.length || ''}`}</Button></>}>
        <div className="space-y-3">
          <LabeledField label={t("ui.ClientDocuments.categoria", "Categoría")}>
            <select className={FIELD_CLS} value={upCategory} onChange={(e) => setUpCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          </LabeledField>
          <div onClick={() => fileInputRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files); }}
            className="cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors"
            style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}>
            <Upload className="mx-auto mb-2 h-6 w-6" style={{ color: 'var(--ink-faint)' }} />
            <p className="text-sm">{t("ui.ClientDocuments.arrastraArchivosAquiOHaz", "Arrastra archivos aquí o haz clic para seleccionar")}</p>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{t("ui.ClientDocuments.pdfWordExcelImagenesZip", "PDF, Word, Excel, imágenes, ZIP… (máx. 100 MB)")}</p>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => onPick(e.target.files)} />
          </div>
          {pending.length > 0 && (
            <div className="space-y-1.5">
              {pending.map((f, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--hairline)' }}>
                  <span className="truncate">{f.name}</span>
                  <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-soft)' }}>{progress[f.name] != null ? `${progress[f.name]}%` : `${Math.round(f.size / 1024)} KB`}<button onClick={() => setPending((p) => p.filter((_, j) => j !== i))} disabled={uploading}><X className="h-3.5 w-3.5" /></button></span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
