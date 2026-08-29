import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Check, ChevronLeft, ChevronRight, Edit2, Loader2, Plus, ScanLine, Trash2, Upload, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/confirmDialog';
import { visitorLogService } from '@/lib/api/visitorLogService';
import { runOrQueue } from "@/lib/offline/offlineQueue";
import { isNetworkFailure } from "@/lib/offline/networkStatus";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Section, EmptyState, SkeletonCards, FadeIn, SmartImage } from '@/components/kit';
import type { Station } from '@/types';

type Props = { station: Station; stationId: string; postSiteId: string };

// A visitor-log row from visitorLogService.list (backend /visitor-log).
interface VisitorPhoto { downloadUrl?: string; publicUrl?: string }
interface VisitorGuardRef { firstName?: string; lastName?: string; name?: string }
interface VisitorRow {
  id: string;
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  reason?: string;
  numPeople?: number;
  placeType?: string;
  visitDate?: string | null;
  exitTime?: string | null;
  idPhoto?: VisitorPhoto[];
  guard?: VisitorGuardRef | null;
  guardName?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────

const LIMIT = 25;
const PLACE_TYPES = ['Casa', 'Departamento', 'Oficina', 'Parking', 'Otro'];

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(v: any) {
  if (!v) return '-';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(v)); }
  catch { return String(v); }
}

function toLocalInputValue(iso?: string | null) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ''; }
}

function nowLocalInputValue() {
  return toLocalInputValue(new Date().toISOString());
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-záéíóúñü]/g, c => c.toUpperCase());
}

// ─── OCR: Tesseract + Ecuadorian ID parser ────────────────────────────────

async function ocrAndParseId(src: Blob): Promise<{ firstName?: string; lastName?: string; idNumber?: string }> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('spa');
  try {
    const { data: { text } } = await worker.recognize(src as any);
    const upper = text.toUpperCase();
    const result: { firstName?: string; lastName?: string; idNumber?: string } = {};
    const cedMatch = upper.match(/\b([0-9]{10})\b/);
    if (cedMatch) result.idNumber = cedMatch[1];
    const apellidosMatch = upper.match(/APELLIDOS?\s*[:\n]+\s*([A-ZÁÉÍÓÚÑÜ ]{3,})/);
    if (apellidosMatch) result.lastName = titleCase(apellidosMatch[1].trim());
    const nombresMatch = upper.match(/NOMBRES?\s*[:\n]+\s*([A-ZÁÉÍÓÚÑÜ ]{3,})/);
    if (nombresMatch) result.firstName = titleCase(nombresMatch[1].trim());
    return result;
  } finally {
    await worker.terminate();
  }
}

// ─── Camera Modal ─────────────────────────────────────────────────────────

type CameraMode = 'id-scan' | 'photo';

function CameraModal({ open, mode, onClose, onCapture }: {
  open: boolean; mode: CameraMode;
  onClose: () => void; onCapture: (blob: Blob, url: string) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [captured, setCaptured] = useState<{ blob: Blob; url: string } | null>(null);
  const capturedUrlRef = useRef<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const setCapturedPhoto = useCallback((next: { blob: Blob; url: string } | null) => {
    if (capturedUrlRef.current) { URL.revokeObjectURL(capturedUrlRef.current); }
    capturedUrlRef.current = next ? next.url : null;
    setCaptured(next);
  }, []);

  const startCamera = useCallback(async () => {
    setErr(null); setCapturedPhoto(null); setReady(false);
    try {
      const facingMode = mode === 'id-scan' ? { ideal: 'environment' } : { ideal: 'user' };
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode, width: { ideal: 1920 } }, audio: false });
      streamRef.current = s;
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.onloadedmetadata = () => { videoRef.current?.play(); setReady(true); };
      }
    } catch (e: any) {
      setErr(e?.name === 'NotAllowedError' ? t('ui.StationVisitors.permisoDeCamaraDenegado', 'Permiso de cámara denegado.') : e?.name === 'NotFoundError' ? 'No se encontró cámara.' : 'No se pudo acceder a la cámara.');
    }
  }, [mode, setCapturedPhoto]);

  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; setStream(null); setReady(false); }, []);

  useEffect(() => {
    if (open) { startCamera(); }
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      // revoke any captured photo URL not handed off to the parent
      if (capturedUrlRef.current) { URL.revokeObjectURL(capturedUrlRef.current); capturedUrlRef.current = null; }
    };
  }, [open]);

  const capture = () => {
    const v = videoRef.current, c = canvasRef.current;
    if (!v || !c) return;
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d')?.drawImage(v, 0, 0);
    c.toBlob(blob => { if (!blob) return; setCapturedPhoto({ blob, url: URL.createObjectURL(blob) }); stopCamera(); }, 'image/jpeg', 0.92);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { stopCamera(); onClose(); } }}>
      {/* `sm:max-w-lg`, no `max-w-lg`: el diálogo base ya trae
          `max-w-[calc(100%-2rem)]` para dejar margen en el teléfono, y una clase
          `max-w-*` sin prefijo se la come (tailwind-merge). */}
      <DialogContent className="z-[60] max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'id-scan' ? t('ui.StationVisitors.escanearCedulaId', 'Escanear cédula / ID') : t('ui.StationVisitors.fotoDelVisitante', 'Foto del visitante')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {err ? (
            <div className="rounded border p-3 text-sm" style={{ color: 'var(--bad-text)', background: 'color-mix(in oklab, var(--bad) 10%, transparent)', borderColor: 'color-mix(in oklab, var(--bad) 28%, transparent)' }}>{err}</div>
          ) : captured ? (
            <div className="space-y-3">
              <img src={captured.url} alt="Captura" className="w-full rounded border" style={{ borderColor: 'var(--hairline)' }} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setCapturedPhoto(null); startCamera(); }} className="flex-1 gap-1"><X size={14} /> Retomar</Button>
                <Button variant="brand" onClick={() => { capturedUrlRef.current = null; onCapture(captured.blob, captured.url); onClose(); }} className="flex-1 gap-1"><Check size={14} /> Usar foto</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {mode === 'id-scan' && <p className="text-center text-xs" style={{ color: 'var(--ink-soft)' }}>{t("ui.StationVisitors.apuntaAlFrenteDeLa", "Apunta al frente de la cédula. Asegúrate de que sea legible y bien iluminada.")}</p>}
              <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded" style={{ background: 'oklch(0 0 0)' }}>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                {!ready && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin" style={{ color: 'oklch(1 0 0)' }} /></div>}
                {mode === 'id-scan' && ready && <div className="pointer-events-none absolute inset-4 rounded border-2 border-dashed opacity-70" style={{ borderColor: 'var(--brand)' }} />}
              </div>
              <Button variant="brand" onClick={capture} disabled={!ready} className="w-full gap-2"><Camera size={15} /> Capturar</Button>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Visitor Form Modal ───────────────────────────────────────────────────

function emptyForm() {
  return { firstName: '', lastName: '', idNumber: '', reason: '', numPeople: 1, placeTypeKind: '', placeTypeValue: '', visitDate: nowLocalInputValue(), exitTime: '' };
}

function VisitorFormModal({ open, initialData, stationId, onClose, onSaved }: {
  open: boolean; initialData?: VisitorRow | null; stationId: string; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const isEdit = !!initialData?.id;
  const [form, setForm] = useState(emptyForm);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrlState] = useState<string | null>(null);
  const photoUrlRef = useRef<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke the previous object URL whenever the captured/uploaded photo URL changes.
  const setPhotoUrl = useCallback((next: string | null) => {
    if (photoUrlRef.current && photoUrlRef.current !== next) { URL.revokeObjectURL(photoUrlRef.current); }
    photoUrlRef.current = next;
    setPhotoUrlState(next);
  }, []);

  // Revoke any outstanding object URL on unmount.
  useEffect(() => () => { if (photoUrlRef.current) { URL.revokeObjectURL(photoUrlRef.current); photoUrlRef.current = null; } }, []);

  useEffect(() => {
    if (!open) return;
    if (initialData) {
      const parts = (initialData.placeType || '').split(' - ');
      setForm({ firstName: initialData.firstName || '', lastName: initialData.lastName || '', idNumber: initialData.idNumber || '', reason: initialData.reason || '', numPeople: initialData.numPeople || 1, placeTypeKind: parts[0] || '', placeTypeValue: parts.slice(1).join(' - ') || '', visitDate: toLocalInputValue(initialData.visitDate) || nowLocalInputValue(), exitTime: toLocalInputValue(initialData.exitTime) || '' });
      setExistingPhotoUrl(initialData?.idPhoto?.[0]?.downloadUrl || initialData?.idPhoto?.[0]?.publicUrl || null);
    } else {
      setForm(emptyForm());
      setExistingPhotoUrl(null);
    }
    setPhotoBlob(null); setPhotoUrl(null);
  }, [open, initialData?.id]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const handleIdCapture = async (blob: Blob) => {
    setScanning(true);
    try {
      const r = await ocrAndParseId(blob);
      if (r.firstName) set('firstName', r.firstName);
      if (r.lastName) set('lastName', r.lastName);
      if (r.idNumber) set('idNumber', r.idNumber);
      (!r.firstName && !r.lastName && !r.idNumber)
        ? toast.warning(t('ui.StationVisitors.noSePudoExtraerInformacion'))
        : toast.success(t('ui.StationVisitors.datosExtraidosDeLaCedula'));
    } catch { toast.error(t('ui.StationVisitors.errorAlProcesarLaImagen')); }
    finally { setScanning(false); }
  };

  const handleSave = async () => {
    if (!form.firstName.trim() || !form.lastName.trim()) { toast.error(t('ui.StationVisitors.nombreYApellidoSonObligatorios')); return; }
    setSaving(true);
    try {
      let idPhotoMeta: any[] | undefined;
      let photoDroppedOffline = false;
      if (photoBlob) {
        const f = photoBlob instanceof File ? photoBlob : new File([photoBlob], `visitor-${Date.now()}.jpg`, { type: 'image/jpeg' });
        try {
          const meta = await visitorLogService.uploadPhoto(f);
          idPhotoMeta = [meta];
        } catch (e) {
          // Sin red la subida de la foto revienta ANTES de llegar a la cola y se
          // perdía la visita entera (auditoría 2026-08-18). El registro vale más
          // que la foto: se sigue sin ella y se avisa. Un error del servidor
          // (con red) sí corta el guardado, como antes.
          if (!isNetworkFailure(e)) throw e;
          photoDroppedOffline = true;
        }
      }
      const placeType = form.placeTypeKind && form.placeTypeValue ? `${form.placeTypeKind} - ${form.placeTypeValue}` : form.placeTypeKind || form.placeTypeValue || undefined;
      const payload: any = { firstName: form.firstName.trim(), lastName: form.lastName.trim(), idNumber: form.idNumber.trim() || undefined, reason: form.reason.trim() || undefined, numPeople: Number(form.numPeople) || 1, placeType, visitDate: form.visitDate ? new Date(form.visitDate).toISOString() : new Date().toISOString(), exitTime: form.exitTime ? new Date(form.exitTime).toISOString() : null, stationId };
      if (idPhotoMeta) payload.idPhoto = idPhotoMeta;
      if (isEdit) { await visitorLogService.update(initialData.id, payload); toast.success('Registro actualizado.'); }
      else {
        // Sin red: a la cola offline; se registra solo al reconectar.
        const { queued } = await runOrQueue("visitorLog.create", payload, () => visitorLogService.create(payload), "Visita");
        if (queued) toast.warning(photoDroppedOffline
          ? 'Sin conexión: la visita quedó en cola y se registrará sola al reconectar. La foto del documento no se pudo adjuntar — agrégala después desde el registro.'
          : 'Sin conexión: la visita quedó en cola y se registrará sola al reconectar.', { duration: 9000 });
        else toast.success('Visitante registrado.');
      }
      onSaved(); onClose();
    } catch (e: any) { toast.error(e?.message || 'Error al guardar.'); }
    finally { setSaving(false); }
  };

  const displayPhoto = photoUrl || existingPhotoUrl;

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v && !saving && !cameraMode) onClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{isEdit ? 'Editar visitante' : 'Nuevo visitante'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {/* ID Scan */}
            <div className="space-y-1.5 rounded-lg border p-3" style={{ background: 'var(--brand-wash)', borderColor: 'var(--brand-line)' }}>
              <p className="cg-eyebrow flex items-center gap-1"><ScanLine size={13} />{" "}{t("ui.StationVisitors.escanearCedulaId", "Escanear cédula / ID")}</p>
              <p className="text-xs" style={{ color: 'var(--ink-soft)' }}>{t("ui.StationVisitors.fotografiaLaCedulaParaRellenar", "Fotografía la cédula para rellenar los campos automáticamente.")}</p>
              <Button variant="outline" size="sm" onClick={() => setCameraMode('id-scan')} disabled={scanning} className="gap-1.5">
                {scanning ? <><Loader2 size={13} className="animate-spin" /> Procesando…</> : <><Camera size={13} /> Escanear</>}
              </Button>
            </div>
            {/* Names */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Apellido <span style={{ color: 'var(--bad-text)' }}>*</span></Label><Input value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder={t("ui.StationVisitors.perezGarcia", "Pérez García")} /></div>
              <div className="space-y-1"><Label>{t('comun.nombre')}{" "}<span style={{ color: 'var(--bad-text)' }}>*</span></Label><Input value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Juan Carlos" /></div>
            </div>
            {/* ID + NumPeople */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>{t("ui.StationVisitors.cedulaPasaporte", "Cédula / Pasaporte")}</Label><Input value={form.idNumber} onChange={e => set('idNumber', e.target.value)} placeholder="0912345678" /></div>
              <div className="space-y-1"><Label>N° Personas</Label><Input type="number" min={1} value={form.numPeople} onChange={e => set('numPeople', e.target.value)} /></div>
            </div>
            {/* Place */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t('ui.StationVisitors.tipoDeLugar')}</Label>
                <Select value={form.placeTypeKind} onValueChange={v => set('placeTypeKind', v)}>
                  <SelectTrigger><SelectValue placeholder={t('comun.tipo')} /></SelectTrigger>
                  <SelectContent>{PLACE_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>{t("ui.StationVisitors.numeroDetalle", "Número / Detalle")}</Label><Input value={form.placeTypeValue} onChange={e => set('placeTypeValue', e.target.value)} placeholder="24-B" /></div>
            </div>
            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Entrada</Label><Input type="datetime-local" value={form.visitDate} onChange={e => set('visitDate', e.target.value)} /></div>
              <div className="space-y-1"><Label>Salida</Label><Input type="datetime-local" value={form.exitTime} onChange={e => set('exitTime', e.target.value)} /></div>
            </div>
            {/* Reason */}
            <div className="space-y-1"><Label>{t('comun.motivo')}</Label><Input value={form.reason} onChange={e => set('reason', e.target.value)} placeholder={t('ui.StationVisitors.visitaAFamiliarEntregaEtc')} /></div>
            {/* Photo */}
            <div className="space-y-2">
              <Label>{t('ui.StationVisitors.fotoDelVisitante')}</Label>
              {displayPhoto && (
                <div className="relative w-24 h-24">
                  <img src={displayPhoto} alt={t('ui.StationVisitors.fotoDelVisitante')} className="h-24 w-24 rounded-lg border object-cover" style={{ borderColor: 'var(--hairline)' }} />
                  <button type="button" aria-label="Quitar foto" onClick={() => { setPhotoBlob(null); setPhotoUrl(null); setExistingPhotoUrl(null); }} className="cg-btn-bad cg-focus absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full"><X size={12} /></button>
                </div>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setCameraMode('photo')} className="gap-1"><Camera size={13} /> Tomar foto</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1"><Upload size={13} /> Subir archivo</Button>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setPhotoBlob(f); setPhotoUrl(URL.createObjectURL(f)); } }} />
            </div>
            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">{t('actions.cancel')}</Button>
              <Button variant="brand" onClick={handleSave} disabled={saving || scanning} className="flex-1 gap-1">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
                {isEdit ? 'Actualizar' : 'Registrar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {cameraMode === 'id-scan' && <CameraModal open mode="id-scan" onClose={() => setCameraMode(null)} onCapture={(blob) => { setCameraMode(null); handleIdCapture(blob); }} />}
      {cameraMode === 'photo' && <CameraModal open mode="photo" onClose={() => setCameraMode(null)} onCapture={(blob, url) => { setCameraMode(null); setPhotoBlob(blob); setPhotoUrl(url); }} />}
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function StationVisitors({ stationId }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<VisitorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState<VisitorRow | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true); setError(null);
    try {
      const res = await visitorLogService.list({ stationId, withPhotos: true } as any, { limit: LIMIT, offset: page * LIMIT });
      const list = Array.isArray(res) ? res : (res?.rows ?? []);
      setRows(list); setTotal(typeof res?.count === 'number' ? res.count : list.length);
    } catch (e: any) { setError(e?.message || 'Error al cargar visitantes'); }
    finally { setLoading(false); }
  }, [stationId, page]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: 'Eliminar registro', message: '¿Eliminar este registro?', confirmText: 'Eliminar', tone: 'danger' }))) return;
    setDeleting(id);
    try { await visitorLogService.delete([id]); toast.success('Eliminado.'); load(); }
    catch (e: any) { toast.error(e?.message || 'Error al eliminar.'); }
    finally { setDeleting(null); }
  };

  return (
    <Section
      icon={<UserCheck />}
      title={
        <span>
          Registro de visitantes {total > 0 && <span className="ml-1 text-sm font-normal" style={{ color: 'var(--ink-soft)' }}>({total})</span>}
        </span>
      }
      action={
        <Button variant="brand" size="sm" onClick={() => { setEditRow(null); setFormOpen(true); }} className="gap-1">
          <Plus size={14} /> Nuevo visitante
        </Button>
      }
      contentClassName="-mx-5 -mb-5"
    >
      {loading ? (
        <div className="px-5 pb-5"><SkeletonCards count={4} /></div>
      ) : error ? (
        <div className="px-6 pb-6 text-sm" style={{ color: 'var(--bad-text)' }}>{error}</div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            icon={<UserCheck />}
            title={t('ui.StationVisitors.noHayVisitantesRegistradosPara')}
          />
        </div>
      ) : (
        <FadeIn>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead style={{ background: 'var(--glass-sunken)', borderBottom: '1px solid var(--hairline)' }}>
                <tr>
                  <th className="cg-eyebrow px-2 py-2 w-10"></th>
                  <th className="cg-eyebrow px-2 py-2">{t('comun.nombre')}</th>
                  <th className="cg-eyebrow px-2 py-2">{t("ui.StationVisitors.cedula", "Cédula")}</th>
                  <th className="cg-eyebrow px-2 py-2">Lugar</th>
                  <th className="cg-eyebrow px-2 py-2">Entrada</th>
                  <th className="cg-eyebrow px-2 py-2">Salida</th>
                  <th className="cg-eyebrow px-2 py-2">{t('comun.vigilante')}</th>
                  <th className="cg-eyebrow px-2 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: VisitorRow, i: number) => {
                  const photo = r.idPhoto?.[0]?.downloadUrl || r.idPhoto?.[0]?.publicUrl;
                  const fn = r.firstName || ''; const ln = r.lastName || '';
                  const name = `${fn} ${ln}`.trim() || '-';
                  const guard = r.guard ? `${r.guard.firstName || ''} ${r.guard.lastName || ''}`.trim() || r.guard.name || '-' : r.guardName || '-';
                  return (
                    <tr key={r.id || i} style={{ borderBottom: '1px solid var(--hairline)' }}>
                      <td className="px-2 py-2.5">
                        <SmartImage
                          src={photo}
                          alt={name}
                          rounded="rounded-full"
                          className="h-8 w-8 border"
                          style={{ borderColor: 'var(--hairline)' }}
                          fallback={
                            <span className="grid h-full w-full place-items-center text-xs font-bold" style={{ background: 'var(--brand-wash)', color: 'var(--brand-text)' }}>{(fn[0] || ln[0] || '?').toUpperCase()}</span>
                          }
                        />
                      </td>
                      <td className="px-2 py-2.5 font-medium">{name}</td>
                      <td className="px-2 py-2.5">{r.idNumber || '-'}</td>
                      <td className="px-2 py-2.5" style={{ color: 'var(--ink-soft)' }}>{r.placeType || '-'}</td>
                      <td className="px-2 py-2.5 font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>{fmt(r.visitDate)}</td>
                      <td className="px-2 py-2.5 font-mono text-xs" style={{ color: 'var(--ink-soft)' }}>{fmt(r.exitTime)}</td>
                      <td className="px-2 py-2.5">{guard}</td>
                      <td className="px-2 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setEditRow(r); setFormOpen(true); }} className="cg-btn-ghost cg-focus rounded p-1.5" title={t('actions.edit')} aria-label={t('ui.StationVisitors.editarVisitante')}><Edit2 size={14} /></button>
                          <button onClick={() => handleDelete(r.id)} disabled={deleting === r.id} className="cg-focus rounded p-1.5 disabled:opacity-40" style={{ color: 'var(--bad-text)' }} title={t('actions.delete')} aria-label={t('ui.StationVisitors.eliminarVisitante')}>
                            {deleting === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {total > LIMIT && (
            <div className="flex items-center justify-between border-t px-6 py-3 text-sm" style={{ borderColor: 'var(--hairline)', color: 'var(--ink-soft)' }}>
              <span>Mostrando {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} de {total}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label={t("ui.StationVisitors.paginaAnterior", "Página anterior")} className="cg-btn-glass cg-focus rounded p-1.5 disabled:opacity-40"><ChevronLeft size={15} /></button>
                <button disabled={(page + 1) * LIMIT >= total} onClick={() => setPage(p => p + 1)} aria-label={t("ui.StationVisitors.paginaSiguiente", "Página siguiente")} className="cg-btn-glass cg-focus rounded p-1.5 disabled:opacity-40"><ChevronRight size={15} /></button>
              </div>
            </div>
          )}
        </FadeIn>
      )}

      <VisitorFormModal open={formOpen} initialData={editRow} stationId={stationId} onClose={() => { setFormOpen(false); setEditRow(null); }} onSaved={load} />
    </Section>
  );
}
