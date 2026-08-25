import React, { useRef } from 'react';
import { FileText, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section, EmptyState, IconTile } from '@/components/kit';

export interface CompanyDocument {
  id: string;
  name: string;
  url: string;
  type: string;
}

interface Props {
  documents: CompanyDocument[];
  onUpload: (file: File) => void;
  onDelete: (id: string) => void;
  canEdit?: boolean;
}

// Only allow http(s) document URLs; neutralize javascript:/data:/other schemes.
const safeDocHref = (url?: string) => (url && /^https?:\/\//i.test(url) ? url : '#');

export default function CompanyDocumentsSection({ documents, onUpload, onDelete, canEdit }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <Section
      title="Documentos legales de la empresa"
      icon={<FileText />}
      contentClassName="space-y-2"
      action={
        canEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-2 h-4 w-4" />
            Subir documento
          </Button>
        ) : undefined
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={!canEdit}
      />

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Sin documentos"
          description="Aquí aparecerán el permiso de operación, el nombramiento y cualquier otro documento legal que subas."
        />
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="glass-flat flex items-center gap-3 p-3">
              <IconTile tone="neutral" size="sm">
                <FileText />
              </IconTile>
              <div className="min-w-0 flex-1">
                <a
                  href={safeDocHref(doc.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium underline-offset-2 hover:underline"
                  style={{ color: 'var(--brand-text)' }}
                >
                  {doc.name}
                </a>
                {doc.type && (
                  <div className="truncate text-xs" style={{ color: 'var(--ink-faint)' }}>
                    {doc.type}
                  </div>
                )}
              </div>
              {canEdit && (
                <button aria-label="Eliminar"
                  type="button"
                  onClick={() => onDelete(doc.id)}
                  className="cg-focus inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold"
                  style={{ color: 'var(--bad-text)' }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
