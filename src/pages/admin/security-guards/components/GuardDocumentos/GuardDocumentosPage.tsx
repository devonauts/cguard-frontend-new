import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { UploadCloud, FileText, Trash2, Download, FileImage, X } from 'lucide-react';
import AppLayout from '@/layouts/app-layout';
import GuardsLayout from '@/layouts/GuardsLayout';
import { Section, EmptyState, SkeletonCards, Modal, IconTile, SmartImage } from "@/components/kit";
import securityGuardService from '@/lib/api/securityGuardService';
import type { FileDescriptor } from '../../guardDetailTypes';

import { localeActual } from '@/lib/localeActual'
const ACCEPT = 'image/*,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

type DocRow = {
  id: string;
  name?: string;
  sizeInBytes?: number | null;
  downloadUrl?: string | null;
  createdAt?: string | null;
};

function fmtSize(bytes?: number | null): string {
  if (bytes == null || isNaN(Number(bytes))) return '';
  const b = Number(bytes);
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(localeActual(), { day: '2-digit', month: 'short', year: 'numeric' });
}

function isImage(name?: string): boolean {
  if (!name) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i.test(name);
}

export default function GuardDocumentosPage() {
  const { id } = useParams();
  const { t } = useTranslation();

  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [toDelete, setToDelete] = useState<DocRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const resp = await securityGuardService.getDocuments(id);
      setDocs(Array.isArray(resp?.rows) ? resp.rows : []);
    } catch (err) {
      console.error('Error loading documents', err);
      setError(true);
      toast.error(t('guards.documents.loadError', { defaultValue: 'No se pudieron cargar los documentos' }));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const handleFiles = async (fileList: FileList | File[]) => {
    if (!id) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    // Validate type + size up front.
    const valid: File[] = [];
    for (const f of files) {
      const mime = f.type || '';
      const okType = mime.startsWith('image/') || mime === 'application/pdf' || isImage(f.name) || /\.pdf$/i.test(f.name);
      if (!okType) {
        toast.error(t('guards.documents.invalidType', { defaultValue: 'Solo se permiten imágenes y PDF' }));
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(t('guards.documents.tooLarge', { defaultValue: 'El archivo supera el tamaño máximo (10MB)' }));
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;

    setUploading(true);
    try {
      const descriptors: FileDescriptor[] = [];
      for (const f of valid) {
        try {
          const uploaded = await securityGuardService.uploadFileToStorage(f, 'securityGuardDocument');
          descriptors.push(uploaded);
        } catch (err) {
          console.error('Upload failed for', f.name, err);
          toast.error(t('guards.documents.uploadFailed', { defaultValue: 'Falló la subida de {{name}}', name: f.name }));
        }
      }
      if (descriptors.length > 0) {
        await securityGuardService.addDocuments(id, descriptors as unknown as Record<string, unknown>[]);
        toast.success(t('guards.documents.uploaded', { defaultValue: 'Documentos subidos correctamente' }));
        await loadDocs();
      }
    } catch (err) {
      console.error('Error saving documents', err);
      toast.error(t('guards.documents.saveError', { defaultValue: 'No se pudieron guardar los documentos' }));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmDelete = async () => {
    if (!id || !toDelete) return;
    setDeleting(true);
    try {
      await securityGuardService.deleteDocument(id, toDelete.id);
      toast.success(t('guards.documents.deleted', { defaultValue: 'Documento eliminado' }));
      setToDelete(null);
      await loadDocs();
    } catch (err) {
      console.error('Error deleting document', err);
      toast.error(t('guards.documents.deleteError', { defaultValue: 'No se pudo eliminar el documento' }));
    } finally {
      setDeleting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  };

  return (
    <AppLayout>
      <GuardsLayout navKey="keep-safe" title="guards.nav.documentos">
        <div className="mx-auto max-w-5xl space-y-6">
          <Section
            title={t('guards.documents.sectionTitle', { defaultValue: 'Documentos' })}
            icon={<FileText />}
          >
            {/* Dropzone / upload */}
            <div
              onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
                dragOver ? '[border-color:var(--brand-line)] [background:var(--brand-wash)]' : 'hover:[border-color:var(--brand-line)]'
              } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
            >
              <IconTile size="lg"><UploadCloud /></IconTile>
              <div className="text-sm font-medium text-foreground">
                {uploading
                  ? t('guards.documents.uploading', { defaultValue: 'Subiendo…' })
                  : t('guards.documents.dropzone', { defaultValue: 'Arrastra archivos o haz clic para seleccionar' })}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('guards.documents.dropzoneHint', { defaultValue: 'Fotos e imágenes o PDF · máx. 10MB' })}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => { if (e.target.files) handleFiles(e.target.files); }}
              />
            </div>

            {/* List / states */}
            <div className="mt-5">
              {loading ? (
                <SkeletonCards count={4} />
              ) : error ? (
                <EmptyState
                  icon={<X />}
                  title={t('guards.documents.errorTitle', { defaultValue: 'Error al cargar' })}
                  description={t('guards.documents.errorDesc', { defaultValue: 'No pudimos cargar los documentos. Intenta de nuevo.' })}
                  action={
                    <button
                      onClick={loadDocs}
                      className="cg-btn-brand cg-focus inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition"
                    >
                      {t('guards.documents.retry', { defaultValue: 'Reintentar' })}
                    </button>
                  }
                />
              ) : docs.length === 0 ? (
                <EmptyState
                  icon={<FileText />}
                  title={t('guards.documents.empty.title', { defaultValue: 'Sin documentos todavía' })}
                  description={t('guards.documents.empty.description', { defaultValue: 'Sube fotos o documentos (PDF) de este vigilante.' })}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {docs.map((doc) => {
                    const img = isImage(doc.name) && !!doc.downloadUrl;
                    return (
                      <div
                        key={doc.id}
                        className="group flex items-center gap-3 glass-flat p-3 transition hover:border-foreground/20 hover:shadow"
                      >
                        {/* Thumbnail / icon */}
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                          <SmartImage
                            src={img ? doc.downloadUrl : null}
                            alt={doc.name || ''}
                            rounded="rounded-lg"
                            className="h-full w-full"
                            fallback={isImage(doc.name)
                              ? <FileImage className="h-6 w-6 text-muted-foreground" />
                              : <FileText className="h-6 w-6 text-muted-foreground" />}
                          />
                        </div>

                        {/* Meta */}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground" title={doc.name}>
                            {doc.name || t('guards.documents.untitled', { defaultValue: 'Documento' })}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            {doc.sizeInBytes != null && <span>{fmtSize(doc.sizeInBytes)}</span>}
                            {doc.sizeInBytes != null && doc.createdAt && <span>·</span>}
                            {doc.createdAt && <span>{fmtDate(doc.createdAt)}</span>}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {doc.downloadUrl && (
                            <a
                              href={doc.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={t('actions.download', { defaultValue: 'Descargar' }) as string}
                              className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          )}
                          <button
                            onClick={() => setToDelete(doc)}
                            title={t('actions.delete', { defaultValue: 'Eliminar' }) as string}
                            className="cg-focus rounded-lg p-2 transition hover:[color:var(--bad-text)]"
                            style={{ color: 'var(--ink-faint)' }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>
        </div>

        {/* Delete confirmation */}
        <Modal
          open={!!toDelete}
          onOpenChange={(o) => { if (!o) setToDelete(null); }}
          title={t('guards.documents.deleteTitle', { defaultValue: 'Eliminar documento' })}
          icon={<Trash2 />}
          footer={
            <>
              <button
                onClick={() => setToDelete(null)}
                disabled={deleting}
                className="cg-btn-glass cg-focus h-9 rounded-full px-4 text-sm font-semibold transition"
              >
                {t('actions.cancel', { defaultValue: 'Cancelar' })}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="cg-btn-bad cg-focus h-9 rounded-full px-4 text-sm font-semibold transition disabled:opacity-60"
              >
                {deleting
                  ? t('actions.deleting', { defaultValue: 'Eliminando…' })
                  : t('actions.delete', { defaultValue: 'Eliminar' })}
              </button>
            </>
          }
        >
          <p className="text-sm text-muted-foreground">
            {t('guards.documents.deleteConfirm', {
              defaultValue: '¿Seguro que deseas eliminar "{{name}}"? Esta acción no se puede deshacer.',
              name: toDelete?.name || t('guards.documents.untitled', { defaultValue: 'Documento' }),
            })}
          </p>
        </Modal>
      </GuardsLayout>
    </AppLayout>
  );
}
