"use client";

import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Upload, X, FileText, Image as ImageIcon, File } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DocumentFile = {
  file: File;
  previewUrl: string | null;
};

interface DocumentUploadProps {
  label: string;
  description?: string;
  value: DocumentFile | null;
  onChange: (doc: DocumentFile | null) => void;
  accept?: string; // defaults to pdf/png/jpg/webp
  required?: boolean;
}

const DEFAULT_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const MAX_MB = 15;

function fileIcon(file: File) {
  if (file.type === "application/pdf") return <FileText className="h-5 w-5" style={{ color: 'var(--bad-text)' }} />;
  if (file.type.startsWith("image/")) return <ImageIcon className="h-5 w-5" style={{ color: 'var(--info-text)' }} />;
  return <File className="h-5 w-5" style={{ color: 'var(--ink-faint)' }} />;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentUpload({
  label,
  description,
  value,
  onChange,
  accept = DEFAULT_ACCEPT,
  required = false,
}: DocumentUploadProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`El archivo "${file.name}" excede el tamaño máximo de ${MAX_MB} MB.`);
      return;
    }

    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    onChange({ file, previewUrl });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`El archivo excede el tamaño máximo de ${MAX_MB} MB.`);
      return;
    }
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    onChange({ file, previewUrl });
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
  };

  return (
    <div className="group">
      {/* Etiqueta */}
      <div className="mb-1.5 flex items-baseline gap-1">
        <span className="text-sm font-medium leading-none">
          {label}
          {required && <span className="ml-0.5" style={{ color: 'var(--bad-text)' }}>*</span>}
        </span>
        {description && (
          <span className="text-xs" style={{ color: 'var(--ink-faint)' }}>— {description}</span>
        )}
      </div>

      {value ? (
        /* Archivo seleccionado */
        <div className="glass-sunken flex items-center gap-3 px-3 py-2.5">
          {/* Miniatura o icono */}
          <div className="flex-shrink-0">
            {value.previewUrl ? (
              <img
                src={value.previewUrl}
                alt={value.file.name}
                className="h-10 w-10 rounded-lg border object-cover"
                style={{ borderColor: 'var(--hairline)' }}
              />
            ) : (
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg border"
                style={{ background: 'var(--glass-raised)', borderColor: 'var(--hairline)' }}
              >
                {fileIcon(value.file)}
              </div>
            )}
          </div>
          {/* Datos del archivo */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={value.file.name}>
              {value.file.name}
            </p>
            <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{formatSize(value.file.size)}</p>
          </div>
          {/* Acciones */}
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => inputRef.current?.click()}
            >
              Cambiar
            </Button>
            <button
              type="button"
              onClick={handleRemove}
              className="cg-focus rounded-full p-1 transition-colors hover:[color:var(--bad-text)]"
              style={{ color: 'var(--ink-faint)' }}
              title="Eliminar archivo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        /* Zona de arrastre vacía */
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="cg-focus flex cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors hover:[border-color:var(--brand-line)] hover:[background:var(--brand-wash)]"
          style={{ borderColor: 'var(--hairline)', background: 'var(--glass-sunken)' }}
        >
          <Upload className="h-5 w-5" style={{ color: 'var(--brand-text)' }} />
          <div>
            <p className="text-sm font-medium">
              {t("ui.DocumentUpload.arrastraOHazClicParaAdjuntar", "Arrastra o haz clic para adjuntar")}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-faint)' }}>
              PDF, PNG, JPG, WebP — máx. {MAX_MB} MB
            </p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
