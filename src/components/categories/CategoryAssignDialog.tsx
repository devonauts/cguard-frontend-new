import { useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { categoryService, type Category } from "@/lib/api/categoryService";
import { postSiteService } from "@/lib/api/postSiteService";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetIds: string[]; // one or many
  onDone?: () => void;
};

export default function CategoryAssignDialog({ open, onOpenChange, targetIds, onDone }: Props) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const res = await categoryService.list({ filter: { module: "postSite" }, limit: 1000, offset: 0 });
        setCategories(res.rows || []);
      } catch (e) {
        console.error(e);
        toast.error(t('ui.CategoryAssignDialog.noSePudieronCargarLas'));
      }
    })();
  }, [open]);

  const submit = async () => {
    if (!selected) {
      toast.warning(t('ui.CategoryAssignDialog.seleccionaUnaCategoria'));
      return;
    }
    if (!targetIds || targetIds.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(targetIds.map((id) => postSiteService.update(id, { categoryId: selected } as any)));
      toast.success(targetIds.length > 1 ? "Sectores actualizadas" : "Categoría actualizada");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      console.error(e);
      toast.error(t('ui.CategoryAssignDialog.errorAlAsignarCategoria'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{targetIds.length > 1 ? t('ui.CategoryAssignDialog.moverSitiosACategoria', 'Mover Sitios a Categoría') : t('ui.CategoryAssignDialog.sectorizarSitio', 'Sectorizar Sitio')}</DialogTitle>
          <DialogDescription>{t("ui.CategoryAssignDialog.seleccionaLaCategoriaDestinoPara", "Selecciona la categoría destino para los sitios seleccionados.")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium mb-1 block">{t("ui.CategoryAssignDialog.categoria", "Categoría")}</label>
            <Select onValueChange={(v) => setSelected(v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("ui.CategoryAssignDialog.seleccionaUnaCategoria", "Selecciona una categoría")} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('actions.cancel')}</Button>
            <Button onClick={submit} disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
