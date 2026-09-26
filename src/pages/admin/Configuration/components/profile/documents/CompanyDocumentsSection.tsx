import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Upload, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Section, EmptyState, IconTile } from "@/components/kit";

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
const safeDocHref = (url?: string) =>
  url && /^https?:\/\//i.test(url) ? url : "#";

export default function CompanyDocumentsSection({
  documents,
  onUpload,
  onDelete,
  canEdit,
}: Props) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (file) onUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <Section
      action={
        canEdit ? (
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {t("ui.CompanyDocumentsSection.subirDocumento", "Subir documento")}
          </Button>
        ) : undefined
      }
      contentClassName="space-y-2"
      icon={<FileText />}
      title={t(
        "ui.CompanyDocumentsSection.documentosLegalesDeLaEmpresa",
        "Documentos legales de la empresa",
      )}
    >
      <input
        ref={fileInputRef}
        accept="application/pdf,image/*"
        className="hidden"
        disabled={!canEdit}
        type="file"
        onChange={handleFileChange}
      />

      {documents.length === 0 ? (
        <EmptyState
          description={t(
            "ui.CompanyDocumentsSection.aquiApareceranElPermisoDeOperacion",
            "Aquí aparecerán el permiso de operación, el nombramiento y cualquier otro documento legal que subas.",
          )}
          icon={<FileText />}
          title={t("comun.sinDocumentos", "Sin documentos")}
        />
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="glass-flat flex items-center gap-3 p-3">
              <IconTile size="sm" tone="neutral">
                <FileText />
              </IconTile>
              <div className="min-w-0 flex-1">
                <a
                  className="block truncate text-sm font-medium underline-offset-2 hover:underline"
                  href={safeDocHref(doc.url)}
                  rel="noopener noreferrer"
                  style={{ color: "var(--brand-text)" }}
                  target="_blank"
                >
                  {doc.name}
                </a>
                {doc.type && (
                  <div
                    className="truncate text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {doc.type}
                  </div>
                )}
              </div>
              {canEdit && (
                <button
                  aria-label={t("actions.delete", "Eliminar")}
                  className="cg-focus inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold"
                  style={{ color: "var(--bad-text)" }}
                  type="button"
                  onClick={() => onDelete(doc.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("actions.delete", "Eliminar")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
