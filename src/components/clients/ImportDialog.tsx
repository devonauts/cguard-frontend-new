import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clientService } from "@/lib/api/clientService";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ImportDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportDialogProps) {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  function downloadTemplate() {
    // Prepend UTF-8 BOM so Excel opens accented characters correctly
    const bom = "\uFEFF";
    const csvContent = `${bom}name,lastName,email,phoneNumber,address,addressLine2,zipCode,city,country,faxNumber,website,categoryName\nCliente Ejemplo 1,García,cliente1@ejemplo.com,+593987654321,Calle Principal 123,Edificio A - Piso 3,170123,Quito,Ecuador,+593987654322,https://ejemplo1.com,\nCliente Ejemplo 2,Rodríguez,cliente2@ejemplo.com,+12025551234,Av. Secundaria 456,Oficina 205,10001,New York,USA,,,`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "plantilla-clientes.csv";
    link.click();
    window.URL.revokeObjectURL(url);
    toast.success("Plantilla descargada");
  }

  async function handleImport() {
    if (!file) {
      toast.error("Selecciona un archivo");

      return;
    }

    setLoading(true);
    const toastId = toast.loading("Procesando archivo...");

    try {
      const result = await clientService.importExcel(file);

      toast.dismiss(toastId);

      if (result.imported > 0) {
        toast.success(
          `${result.imported} clientes guardados en la base de datos exitosamente`,
        );
      }

      if (result.errors && result.errors.length > 0) {
        toast.error(
          `${result.errors.length} filas no se pudieron importar. Revisa los detalles.`,
        );
      }

      onSuccess();
      onOpenChange(false);
      setFile(null);
    } catch (error: any) {
      toast.dismiss(toastId);
      let errorMessage: string = "Error al importar";
      const candidate =
        error?.details ??
        error?.response?.data?.message ??
        error?.message ??
        error;

      try {
        errorMessage =
          typeof candidate === "string" ? candidate : JSON.stringify(candidate);
      } catch (e) {
        try {
          errorMessage = String(candidate);
        } catch {
          errorMessage = "Error al importar";
        }
      }

      // Ensure primitive string so .includes is safe
      try {
        errorMessage =
          typeof errorMessage === "string"
            ? errorMessage
            : String(errorMessage);
      } catch (e) {
        errorMessage = "Error al importar";
      }

      if (errorMessage.includes("cannot be null")) {
        toast.error(
          "Algunos campos obligatorios están vacíos. Verifica: name, lastName, email, phoneNumber, address, zipCode, city, country.",
        );
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Clientes desde Excel</DialogTitle>
          <DialogDescription>
            {t(
              "clients.importDialog.description",
              "Sube un archivo .xlsx/.xls/.csv para importar clientes.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">
              {t(
                "guards.list.importDialog.howTo",
                "Antes de cargar, asegúrese de:",
              )}
            </p>
            <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
              <li>
                {t(
                  "guards.list.importDialog.fileFormat",
                  "El archivo debe ser formato .xlsx, .xls o .csv",
                )}
              </li>
              <li>
                <strong>Columnas obligatorias:</strong> name, lastName, email,
                phoneNumber, address, zipCode, city, country
              </li>
              <li>
                <strong>Columnas opcionales:</strong> addressLine2, faxNumber,
                website, categoryId
              </li>
            </ul>
            <Button
              className="px-0 text-primary"
              variant="link"
              onClick={downloadTemplate}
            >
              {t(
                "guards.list.importDialog.downloadTemplate",
                "Descargar plantilla de ejemplo",
              )}
            </Button>
          </div>

          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Input
              accept=".xlsx,.xls,.csv"
              className="hidden"
              id="file-upload"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <label className="cursor-pointer block" htmlFor="file-upload">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground font-medium">
                {file
                  ? file.name
                  : t(
                      "guards.list.importDialog.browsePlaceholder",
                      "Explorar tu archivo Excel aquí....",
                    )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "guards.list.importDialog.clickToSelect",
                  "Click para seleccionar",
                )}
              </p>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={!file || loading} onClick={handleImport}>
              {loading ? "Importando..." : "Importar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
