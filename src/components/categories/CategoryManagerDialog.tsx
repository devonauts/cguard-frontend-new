import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EllipsisVertical, Pencil, Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { categoryService, type Category } from "@/lib/api/categoryService";
import { useDebouncedValue } from "@/hooks/useDebounce";
import { clientService } from "@/lib/api/clientService";
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from 'react-i18next';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: string; // e.g., "clientAccount"
  onChanged?: () => void; // notify parent to refresh
};

export function CategoryManagerDialog({ open, onOpenChange, module, onChanged }: Props) {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 400);

  // Reemplazado: usar un único modalMode para controlar create/edit
  const [modalMode, setModalMode] = useState<'create' | 'edit' | undefined>(undefined);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [inUseInfo, setInUseInfo] = useState<{ id: string; name: string; count: number } | null>(null);
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();

  const load = async () => {
    setLoading(true);
    try {
      const res = await categoryService.list({
        filter: { module, name: debounced || undefined },
        limit: 1000,
        offset: 0,
      });
      setItems(res.rows);
    } catch (e) {
      console.error(e);
      toast.error(t('categories.categoriesnotloaded', 'Error loading categories'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debounced, module]);

  // Cuando se cierra el diálogo principal, asegurarse de cerrar/limpiar los subpaneles
  useEffect(() => {
    if (!open) {
      setModalMode(undefined);
      setEditing(null);
      setNewName("");
      setNewDesc("");
      setEditName("");
      setEditDesc("");
      setConfirmDeleteId(null);
      setInUseInfo(null);
    }
  }, [open]);

  const startCreate = () => {
    if (!hasPermission('categoryCreate')) {
      toast.error(t('categories.noPermissionCreate', 'You do not have permission to create categories'));
      return;
    }
    setNewName("");
    setNewDesc("");
    // cerrar posible edición y abrir modo create
    setEditing(null);
    setModalMode('create');
  };

  const submitCreate = async () => {
    if (!hasPermission('categoryCreate')) {
      toast.error(t('categories.noPermissionCreate', 'You do not have permission to create categories'));
      return;
    }
    if (!newName.trim()) {
      toast.error(t('categories.nameRequired', 'El nombre es requerido'));
      return;
    }
    try {
      const created = await categoryService.create({ name: newName.trim(), description: newDesc.trim() || undefined, module });
      toast.success(t('categories.categoryCreated', 'Category created'));
      // cerrar panel create
      setModalMode(undefined);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || t('categories.errorCreating', 'Error creating category'));
    }
  };

  const startEdit = (cat: Category) => {
    if (!hasPermission('categoryEdit')) {
      toast.error(t('categories.noPermissionEdit', 'You do not have permission to edit categories'));
      return;
    }
    // cerrar posible create y abrir edit
    setNewName("");
    setNewDesc("");
    setEditing(cat);
    setEditName(cat.name);
    setEditDesc(cat.description || "");
    setModalMode('edit');
  };

  const attemptDelete = async (cat: Category) => {
    if (!hasPermission('categoryDestroy')) {
      toast.error(t('categories.noPermissionDelete', 'You do not have permission to delete categories'));
      return;
    }
    try {
      // Pre-chequeo: ¿está en uso por algún cliente?
      const usedCount = await clientService.checkCategoryUsage(cat.id);
      console.log(`Verificando categoría ${cat.name} (${cat.id}): ${usedCount} usos encontrados`);
      if (usedCount > 0) {
        setInUseInfo({ id: cat.id, name: cat.name, count: usedCount });
        return;
      }
      setConfirmDeleteId(cat.id);
    } catch (e: any) {
      console.error("Error verificando uso de categoría:", e);
      // Si no podemos validar, mostramos confirmación igualmente, pero advertimos
      toast.warning(t('categories.couldNotVerifyUsage', 'Could not verify if the category is in use. Proceed with caution.'));
      setConfirmDeleteId(cat.id);
    }
  };

  const submitEdit = async () => {
    if (!hasPermission('categoryEdit')) {
      toast.error(t('categories.noPermissionEdit', 'You do not have permission to edit categories'));
      return;
    }
    if (!editing) return;
    if (!editName.trim()) {
      toast.error(t('categories.nameRequired', 'El nombre es requerido'));
      return;
    }
    try {
      await categoryService.update(editing.id, { name: editName.trim(), description: editDesc.trim() || undefined, module });
      toast.success(t('categories.categoryEdited', 'Category updated successfully'));
      // cerrar panel edit
      setEditing(null);
      setModalMode(undefined);
      await load();
    } catch (e: any) {
      toast.error(e?.message || t('categories.errorEditing', 'Error updating category'));
    }
  };

  const removeConfirmed = async () => {
    if (!confirmDeleteId) return;
    if (!hasPermission('categoryDestroy')) {
      toast.error(t('categories.noPermissionDelete', 'You do not have permission to delete categories'));
      setConfirmDeleteId(null);
      return;
    }
    try {
      await categoryService.delete([confirmDeleteId]);
      toast.success(t('categories.categoryDeleted', 'Category deleted successfully'));
      setConfirmDeleteId(null);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || t('categories.errorDeleting', 'Error deleting category'));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">{t('categories.title', 'Category Manager')}</DialogTitle>
            <DialogDescription>
              {t('categories.titleDescription', 'Manage categories for the selected module. Categories in use cannot be deleted.')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder={t('categories.searchPlaceholder', 'Search...')} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>

              {hasPermission('categoryCreate') && (
                <Button onClick={startCreate}>
                  <Plus className="mr-2 h-4 w-4" /> {t('categories.addcategory', 'Add Category')}
                </Button>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-1/3">{t('categories.namecategory', 'Category Name')}</TableHead>
                    <TableHead>{t('categories.description', 'Description')}</TableHead>
                    <TableHead className="w-20 text-right">{t('categories.actions', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-8">
                        {loading ? t('categories.loading', 'Loading...') : t('categories.notfoundcategory', 'No categories found')}
                      </TableCell>
                    </TableRow>
                  )}

                  {items.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell>{cat.description || "—"}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <EllipsisVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            {hasPermission('categoryEdit') && (
                              <DropdownMenuItem onClick={() => startEdit(cat)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                {t('categories.edit', 'Edit')}
                              </DropdownMenuItem>
                            )}
                            {hasPermission('categoryDestroy') && (
                              <DropdownMenuItem onClick={() => attemptDelete(cat)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('categories.delete', 'Delete')}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Crear */}
            {modalMode === 'create' && (
              <div className="border rounded-md p-4 space-y-3">
                <div className="font-medium text-center">{t('categories.addcategory', 'Add Category')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('categories.name', 'Name*')}</label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder={t('categories.nameHint', 'Ej: General')}
                      className="placeholder:text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('categories.description', 'Description')}</label>
                    <Input
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      placeholder={t('categories.descriptionHint', 'Brief description (optional)')}
                      className="placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => { setModalMode(undefined); setEditing(null); }}>{t('categories.cancel', 'Cancel')}</Button>
                  <Button
                    onClick={submitCreate}
                    className="disabled:pointer-events-none disabled:opacity-50">
                    {t('categories.save', 'Save')}
                  </Button>
                </div>
              </div>
            )}

            {/* Editar */}
            {modalMode === 'edit' && editing && (
              <div className="border rounded-md p-4 space-y-3">
                <div className="font-medium">{t('categories.editcategory', 'Edit Category')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('categories.name', 'Name*')}</label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={t('categories.nameHint', 'Ej: General')}
                      className="placeholder:text-muted-foreground"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{t('categories.description', 'Description')}</label>
                    <Input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder={t('categories.descriptionHint', 'Brief description (optional)')}
                      className="placeholder:text-muted-foreground"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => { setModalMode(undefined); setEditing(null); }}>{t('actions.cancel')}</Button>
                  <Button
                    onClick={submitEdit}
                    className="disabled:pointer-events-none disabled:opacity-50">
                    {t('categories.save', 'Save')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('categories.confirmDeleteId', 'Delete this category?')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('categories.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={removeConfirmed} className="cg-btn-bad">{t('categories.delete', 'Delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!inUseInfo} onOpenChange={(open) => !open && setInUseInfo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-center">{t('categories.cannotDelete', 'Cannot delete')}</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="text-sm text-muted-foreground">
            {(t('categories.cannotDeleteMessage', 'The category "{{name}}" cannot be deleted because it is in use by {{count}} clients.', { name: inUseInfo?.name, count: inUseInfo?.count }))}
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setInUseInfo(null)} className="bg-card text-foreground hover:bg-muted border">
              {t('categories.Understood', 'Understood')}
            </AlertDialogAction>

          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default CategoryManagerDialog;
