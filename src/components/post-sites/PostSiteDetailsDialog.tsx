import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { clientDisplayName } from "@/lib/clientName";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { postSiteService } from "@/lib/api/postSiteService";
import { categoryService, type Category } from "@/lib/api/categoryService";
import { PostSite } from "@/lib/api/postSiteService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string | null;
}

export default function PostSiteDetailsDialog({
  open,
  onOpenChange,
  siteId,
}: Props) {
  const { t } = useTranslation();
  const [site, setSite] = useState<PostSite | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientCollapsed, setClientCollapsed] = useState(false);
  const [addressCollapsed, setAddressCollapsed] = useState(false);

  useEffect(() => {
    if (!open || !siteId) return;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await postSiteService.get(siteId);

        setSite(data as any);

        const ids = (data as any).categoryIds || [];

        if (ids.length > 0) {
          try {
            const cats = await Promise.all(
              ids.map((id: string) => categoryService.findById(id)),
            );

            setCategories(cats);
          } catch (err) {
            console.error("Error loading categories:", err);
            setCategories([]);
          }
        } else {
          setCategories([]);
        }
      } catch (e: any) {
        console.error(e);
        setError(
          e?.message ||
            t(
              "ui.PostSiteDetailsDialog.errorAlCargarDetallesDelSitio",
              "Error al cargar detalles del sitio",
            ),
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, siteId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-4xl overflow-y-auto p-4">
        <div className="bg-muted/30 p-2 border-b">
          <DialogHeader>
            <DialogTitle className="text-center">
              {t("ui.PostSiteDetailsDialog.detallesDelSitio")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "ui.PostSiteDetailsDialog.informacionDetalladaDelPuestoDeSeguridadSeleccionada",
                "Información detallada del Puesto de seguridad seleccionada.",
              )}
            </DialogDescription>
          </DialogHeader>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="py-4 text-center text-red-500 text-sm">
            <p>{error}</p>
          </div>
        ) : site ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("comun.nombre")}
                </p>
                <p className="text-sm">
                  {(site as any).companyName || site.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("comun.horario")}
                </p>
                <p className="text-sm">
                  {(site as any).startingTimeInDay &&
                  (site as any).finishTimeInDay
                    ? `${(site as any).startingTimeInDay} – ${(site as any).finishTimeInDay}`
                    : ((site as any).scheduleLabel ?? "-")}
                </p>
              </div>
              <div>
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("ui.PostSiteDetailsDialog.descripcion", "Descripción")}
                </p>
                <p className="text-sm">{(site as any).description || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("comun.correo")}
                </p>
                <p className="text-sm truncate">
                  {(site as any).contactEmail ?? site.email ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("ui.PostSiteDetailsDialog.telefono", "Teléfono")}
                </p>
                <p className="text-sm">
                  {(site as any).contactPhone ?? site.phone ?? "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("ui.PostSiteDetailsDialog.telefonoFijo", "Teléfono fijo")}
                </p>
                <p className="text-sm">{(site as any).fax ?? "-"}</p>
              </div>
              {/* Client account summary if present */}
              {(site as any).clientAccount && (
                <div className="sm:col-span-3 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold mb-2 text-foreground">
                      {t("ui.PostSiteDetailsDialog.clienteAsociado")}
                    </h4>
                    <button
                      className="text-xs text-muted-foreground"
                      type="button"
                      onClick={() => setClientCollapsed(!clientCollapsed)}
                    >
                      {clientCollapsed
                        ? t("ui.PostSiteDetailsDialog.mostrar", "Mostrar")
                        : t("ui.PostSiteDetailsDialog.ocultar", "Ocultar")}
                    </button>
                  </div>
                  {clientCollapsed ? (
                    <div className="text-sm text-muted-foreground">
                      {clientDisplayName((site as any).clientAccount, "-")} ·{" "}
                      {(site as any).clientAccount.email || "-"}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs text-foreground/70 font-semibold">
                          {t("comun.nombre")}
                        </p>
                        <p className="text-sm">
                          {(site as any).clientAccount.name || "-"}{" "}
                          {(site as any).clientAccount.lastName || ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-foreground/70 font-semibold">
                          {t("comun.correo")}
                        </p>
                        <p className="text-sm">
                          {(site as any).clientAccount.email || "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-foreground/70 font-semibold">
                          {t("ui.PostSiteDetailsDialog.telefono2", "Teléfono")}
                        </p>
                        <p className="text-sm">
                          {(site as any).clientAccount.phoneNumber || "-"}
                        </p>
                      </div>
                      <div className="sm:col-span-3">
                        <p className="text-xs text-foreground/70 font-semibold">
                          {t("ui.PostSiteDetailsDialog.direccion", "Dirección")}
                        </p>
                        <p className="text-sm">
                          {(site as any).clientAccount.address || "-"}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="sm:col-span-2">
                <p className="text-xs text-foreground/70 font-semibold">
                  {t("clients.filters.categories", "Sectores")}
                </p>
                <p className="text-sm">
                  {categories.length > 0
                    ? categories.map((c) => c.name).join(", ")
                    : (site as any).categoryIds &&
                        (site as any).categoryIds.length > 0
                      ? (site as any).categoryIds.join(", ")
                      : "-"}
                </p>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold mb-2 text-foreground">
                  {t("ui.PostSiteDetailsDialog.direccion2", "Dirección")}
                </h4>
                <button
                  className="text-xs text-muted-foreground"
                  type="button"
                  onClick={() => setAddressCollapsed(!addressCollapsed)}
                >
                  {addressCollapsed
                    ? t("ui.PostSiteDetailsDialog.mostrar", "Mostrar")
                    : t("ui.PostSiteDetailsDialog.ocultar", "Ocultar")}
                </button>
              </div>
              {addressCollapsed ? (
                <div className="text-sm text-muted-foreground">
                  {(site as any).address || "-"}
                  {(site as any).city ? ` · ${(site as any).city}` : ""}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <p className="text-xs text-foreground/70 font-semibold">
                      {t("ui.PostSiteDetailsDialog.direccion3", "Dirección")}
                    </p>
                    <p className="text-sm">{(site as any).address || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/70 font-semibold">
                      {t(
                        "ui.PostSiteDetailsDialog.direccionComplementaria",
                        "Dirección Complementaria",
                      )}
                    </p>
                    <p className="text-sm">
                      {(site as any).secondAddress || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/70 font-semibold">
                      {t(
                        "ui.PostSiteDetailsDialog.codigoPostal",
                        "Código Postal",
                      )}
                    </p>
                    <p className="text-sm">{(site as any).postalCode || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/70 font-semibold">
                      {t("comun.ciudad")}
                    </p>
                    <p className="text-sm">{(site as any).city || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/70 font-semibold">
                      {t("ui.PostSiteDetailsDialog.pais", "País")}
                    </p>
                    <p className="text-sm">{(site as any).country || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/70 font-semibold">
                      {t("clients.stations.lat", "Latitud")}
                    </p>
                    <p className="text-sm">{(site as any).latitud ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/70 font-semibold">
                      {t("clients.stations.lng", "Longitud")}
                    </p>
                    <p className="text-sm">{(site as any).longitud ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-foreground/70 font-semibold">
                      {t("clients.overview.cards.guardsAssigned", "Vigilantes asignados")}
                    </p>
                    <p className="text-sm">
                      {(site as any).guardsCount ??
                        ((site as any).assignedGuards
                          ? (site as any).assignedGuards.length
                          : "-")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("actions.close", "Cerrar")}
              </Button>
              <Button
                asChild
                className="bg-primary hover:bg-primary/90"
                size="sm"
              >
                <Link to={`/post-sites/${site.id}/edit`}>
                  {t("actions.edit")}
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
