import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { clientService } from "@/lib/api/clientService";
import { categoryService, type Category } from "@/lib/api/categoryService";
import { Client } from "@/types/client";
import { usePermissions } from "@/hooks/usePermissions";

interface ClientDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
}

export function ClientDetailsDialog({
  open,
  onOpenChange,
  clientId,
}: ClientDetailsDialogProps) {
  const { t } = useTranslation();
  const [client, setClient] = useState<Client | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clientId) return;

    const loadClient = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await clientService.getClient(clientId);

        setClient(data);

        // Cargar las Sectores si existen categoryIds
        const categoryIds = (data as any).categoryIds || [];

        if (categoryIds.length > 0) {
          try {
            const cats = await Promise.all(
              categoryIds.map((id: string) => categoryService.findById(id)),
            );

            setCategories(cats);
          } catch (err) {
            console.error("Error loading categories:", err);
          }
        } else {
          setCategories([]);
        }
      } catch (e: any) {
        setError(
          e?.message ||
            t(
              "ui.ClientDetailsDialog.errorCargarDetalles",
              "Error al cargar los detalles del cliente",
            ),
        );
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadClient();
  }, [open, clientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center">
            {t(
              "ui.ClientDetailsDialog.detallesDelCliente",
              "Detalles del Cliente",
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              "ui.ClientDetailsDialog.informacionDetalladaDelCliente",
              "Información detallada del cliente seleccionado.",
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="py-4 text-center text-red-500 text-sm">
            <p>{error}</p>
          </div>
        ) : client ? (
          <div className="space-y-4">
            {/* Información básica en dos columnas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("comun.nombre")}
                </p>
                <p className="text-sm">{client.name}</p>
              </div>
              {client.lastName && (
                <div>
                  <p className="text-xs text-foreground/70 font-semibold">
                    Apellidos
                  </p>
                  <p className="text-sm">{client.lastName}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("comun.correo")}
                </p>
                <p className="text-sm truncate">{client.email || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("ui.ClientDetailsDialog.telefono", "Teléfono")}
                </p>
                <p className="text-sm">{client.phoneNumber || "-"}</p>
              </div>
              {client.faxNumber && (
                <div>
                  <p className="text-xs text-foreground/70 font-semibold">
                    {t("ui.ClientDetailsDialog.telefonoFijo", "Teléfono fijo")}
                  </p>
                  <p className="text-sm">{client.faxNumber}</p>
                </div>
              )}
              {categories.length > 0 && (
                <div className="md:col-span-2">
                  <p className="text-xs text-foreground/70 font-semibold">
                    Sectores
                  </p>
                  <p className="text-sm">
                    {categories.map((c) => c.name).join(", ")}
                  </p>
                </div>
              )}
            </div>

            {/* Dirección completa */}
            <div className="border-t pt-3">
              <h4 className="text-sm font-semibold mb-2 text-foreground">
                {t("ui.ClientDetailsDialog.direccion", "Dirección")}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-foreground/70 font-semibold">
                    {t("ui.ClientDetailsDialog.direccion2", "Dirección")}
                  </p>
                  <p className="text-sm">{client.address || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/70 font-semibold">
                    {t(
                      "ui.ClientDetailsDialog.direccionComplementaria",
                      "Dirección Complementaria",
                    )}
                  </p>
                  <p className="text-sm">{client.addressLine2 || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/70 font-semibold">
                    {t("ui.ClientDetailsDialog.codigoPostal", "Código Postal")}
                  </p>
                  <p className="text-sm">{client.postalCode || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/70 font-semibold">
                    {t("comun.ciudad")}
                  </p>
                  <p className="text-sm">{client.city || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground/70 font-semibold">
                    {t("ui.ClientDetailsDialog.pais", "País")}
                  </p>
                  <p className="text-sm">{client.country || "-"}</p>
                </div>
              </div>
            </div>

            {/* Sitio web */}
            {client.website &&
              (() => {
                // Only allow http(s) links; otherwise render plain text to
                // avoid javascript:/data: schemes from tenant-editable data.
                const safeHref = /^https?:\/\//i.test(client.website)
                  ? client.website
                  : /^[\w.-]+\.[a-z]{2,}/i.test(client.website)
                    ? `https://${client.website}`
                    : null;

                return (
                  <div className="border-t pt-3">
                    <p className="text-xs text-foreground/70 font-semibold">
                      Sitio Web
                    </p>
                    <p className="text-sm">
                      {safeHref ? (
                        <a
                          className="text-primary hover:underline truncate block"
                          href={safeHref}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {client.website}
                        </a>
                      ) : (
                        <span className="truncate block">{client.website}</span>
                      )}
                    </p>
                  </div>
                );
              })()}

            {/* Acciones */}
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cerrar
              </Button>
              {(() => {
                const { hasPermission } = usePermissions();

                return hasPermission("clientAccountEdit") ? (
                  <Button
                    asChild
                    className="bg-primary hover:bg-primary/90"
                    size="sm"
                  >
                    <Link to={`/clients/edit/${client.id}`}>Editar</Link>
                  </Button>
                ) : null;
              })()}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
