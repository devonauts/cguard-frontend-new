import { useState, useEffect, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { ApiService, ApiError } from "@/services/api/apiService";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/table/DataTable";
import { RowActionsMenu, type RowAction } from "@/components/table/RowActionsMenu";
import { BulkActionsSelect, type BulkAction } from "@/components/table/BulkActionsSelect";
import { TableToolbar, TableSearch } from "@/components/table/TableToolbar";
import { Plus, Eye, Trash, Filter, EllipsisVertical, FileDown, FileSpreadsheet, Megaphone, FileText, CheckCheck, Clock } from "lucide-react";
import { PageContainer, PageHeader, Section, EmptyState, Segmented, StatCard, StatusBadge, Field } from "@/components/kit";
import { userService } from "@/lib/api/userService";
import { useAuth } from "@/contexts/AuthContext";

type MemoItem = {
  id: string;
  subject: string;
  content?: string;
  dateTime?: string;
  wasAccepted?: boolean;
  guardName?: { name?: string } | string;
  guardNameId?: string | null;
  createdBy?: { name?: string } | string;
  createdById?: string | null;
};

export default function MemosPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [query, setQuery] = useState("");

  const normalizePerson = (person: any) => {
    if (!person) return '-';
    if (typeof person === 'string') return person;
    return person.name || person.fullName || person.guardName || '-';
  };
  const [filters, setFilters] = useState<{ status?: "all" | "accepted" | "pending"; guardId?: string; createdById?: string; }>({ status: "all" });
  const [openFilter, setOpenFilter] = useState(false);
  const [createdByUsers, setCreatedByUsers] = useState<{ id: string; name: string }[]>([]);
  const [bulkKey, setBulkKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewMemo, setViewMemo] = useState<MemoItem | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [memoToDelete, setMemoToDelete] = useState<MemoItem | null>(null);
  const [guards, setGuards] = useState<{ id: string; name: string }[]>([]);
  const [guardId, setGuardId] = useState<string>("");
  const [wasAccepted, setWasAccepted] = useState(false);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        if (!tenantId) throw new Error("Tenant no configurado");
        const res = await ApiService.get(`/tenant/${tenantId}/memos`);
        const rows = Array.isArray(res) ? res : res.rows || [];
        const mapped = rows.map((memo: any) => ({
          id: memo.id ?? memo._id ?? String(memo.id),
          subject: memo.subject || memo.title || "Sin asunto",
          content: memo.content || memo.description || "",
          dateTime: memo.dateTime || memo.createdAt || memo.updatedAt || "",
          wasAccepted: memo.wasAccepted || false,
          guardName: normalizePerson(memo.guardName),
          guardNameId: memo.guardName?.id || memo.guardNameId || memo.guardName || null,
          createdBy: normalizePerson(memo.createdBy),
          createdById: memo.createdBy?.id || memo.createdById || null,
        }));
        if (mounted) setMemos(mapped);
      } catch (err) {
        console.error('Error cargando memos:', err);
        toast.error(t('ui.MemosPage.noSePudieronCargarLos'));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();

    const loadGuards = async () => {
      try {
        const tenantId = localStorage.getItem("tenantId") || "";
        if (!tenantId) return;
        const res = await ApiService.get(`/tenant/${tenantId}/security-guard?limit=200&offset=0`);
        const rows = Array.isArray(res) ? res : res.rows || res.data?.rows || [];
        const mappedGuards = rows
          .map((guard: any) => ({
            id: guard.id || guard.securityGuardId || guard.guardId,
            name: guard.fullName || guard.name || guard.guardName || `${guard.firstName || ''} ${guard.lastName || ''}`.trim(),
          }))
          .filter((guard: any) => guard.id);
        if (mounted) setGuards(mappedGuards);
      } catch (err) {
        console.error('Error cargando vigilantes:', err);
      }
    };

    const loadCreatedByUsers = async () => {
      try {
        const users = await userService.listUsersByRoles([
          'admin',
          'securitySupervisor',
          'supervisor',
        ]);
        const mappedUsers = users
          .map((user: any) => ({
            id: user.id || user._id || user.userId,
            name: user.fullName || user.name || user.email || user.username || user.id,
          }))
          .filter((user: any) => user.id);
        if (mounted) setCreatedByUsers(mappedUsers);
      } catch (err) {
        console.error('Error cargando usuarios:', err);
      }
    };

    loadGuards();
    loadCreatedByUsers();

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const queryValue = query.trim().toLowerCase();

    return memos.filter((memo) => {
      const memoText = [
        memo.subject,
        memo.content,
        normalizePerson(memo.guardName),
        normalizePerson(memo.createdBy),
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = !queryValue || memoText.includes(queryValue);
      const matchesGuard = !filters.guardId || String(memo.guardNameId || '') === String(filters.guardId);
      const matchesCreatedBy = !filters.createdById || String(memo.createdById || '') === String(filters.createdById);
      const matchesStatus =
        filters.status === "all"
          ? true
          : filters.status === "accepted"
          ? memo.wasAccepted
          : !memo.wasAccepted;

      return matchesQuery && matchesGuard && matchesCreatedBy && matchesStatus;
    });
  }, [memos, query, filters]);

  const sortedMemos = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    return [...filtered].sort((a, b) => {
      const aValue = String((a as any)[sortKey] ?? "").toLowerCase();
      const bValue = String((b as any)[sortKey] ?? "").toLowerCase();
      if (aValue === bValue) return 0;
      return sortDir === "asc" ? (aValue < bValue ? -1 : 1) : aValue > bValue ? -1 : 1;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(sortedMemos.map((memo) => memo.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((item) => item !== id)
    );
  };

  const handleCreate = async () => {
    if (!subject.trim()) {
      toast.error(t('comun.elAsuntoEsObligatorio'));
      return;
    }

    if (!guardId) {
      toast.error(t('ui.MemosPage.seleccionaLaVigilanteParaEl'));
      return;
    }

    setSaving(true);
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error("Tenant no configurado");
      const payload = {
        subject: subject.trim(),
        content: content.trim(),
        dateTime: new Date().toISOString(),
        guardName: guardId,
        wasAccepted,
      };
      const res = await ApiService.post(`/tenant/${tenantId}/memos`, { data: payload });
      // The create endpoint returns guardName/createdBy as FK UUID strings, not
      // {name} objects, so resolve human-readable names locally instead of running
      // the UUID through normalizePerson (which would render the raw UUID).
      const resolvedGuardName =
        (res.guardName && typeof res.guardName === 'object')
          ? normalizePerson(res.guardName)
          : (guards.find((g) => String(g.id) === String(guardId))?.name || '-');
      const currentUserName =
        (res.createdBy && typeof res.createdBy === 'object')
          ? normalizePerson(res.createdBy)
          : ((user as any)?.fullName || (user as any)?.name || (user as any)?.email || '-');
      const newMemo: MemoItem = {
        id: res.id ?? String(Date.now()),
        subject: res.subject || payload.subject,
        content: res.content || payload.content,
        dateTime: res.dateTime || payload.dateTime,
        wasAccepted: res.wasAccepted ?? payload.wasAccepted,
        guardName: resolvedGuardName,
        guardNameId: res.guardName?.id || res.guardNameId || guardId || null,
        createdBy: currentUserName,
        createdById: (res.createdBy && typeof res.createdBy === 'object' ? res.createdBy.id : res.createdById) || (user as any)?.id || null,
      };
      setMemos((current) => [newMemo, ...current]);
      setCreateOpen(false);
      setSubject("");
      setContent("");
      setGuardId("");
      setWasAccepted(false);
      toast.success('Memo creado correctamente');
    } catch (err) {
      let message = 'Error creando memo';
      if (err instanceof ApiError) {
        message = err.message || message;
      } else if (err && (err as any).message) {
        message = (err as any).message;
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (memo: MemoItem) => {
    setMemoToDelete(memo);
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!memoToDelete) return;

    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error("Tenant no configurado");
      await ApiService.delete(`/tenant/${tenantId}/memos/${memoToDelete.id}`);
      setMemos((current) => current.filter((item) => item.id !== memoToDelete.id));
      setSelectedIds((prev) => prev.filter((id) => id !== memoToDelete.id));
      toast.success('Memo eliminado correctamente');
    } catch (err) {
      let message = 'Error eliminando memo';
      if (err instanceof ApiError) {
        message = err.message || message;
      } else if (err && (err as any).message) {
        message = (err as any).message;
      }
      toast.error(message);
    } finally {
      setConfirmDeleteOpen(false);
      setMemoToDelete(null);
    }
  };

  const handleView = (memo: MemoItem) => {
    setViewMemo(memo);
    setViewOpen(true);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!selectedIds.length) {
      toast.error(t('ui.MemosPage.seleccionaAlMenosUnMemo'));
      return;
    }

    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error("Tenant no configurado");
      const idsParam = selectedIds.map(encodeURIComponent).join(',');
      const blob = await ApiService.getBlob(`/tenant/${tenantId}/memos/export?format=${format}&ids=${idsParam}`);
      const filename = `memos_${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      downloadBlob(blob, filename);
      toast.success(`Exportado a ${format === 'pdf' ? 'PDF' : 'Excel'} correctamente`);
    } catch (err) {
      let message = `Error exportando a ${format === 'pdf' ? 'PDF' : 'Excel'}`;
      if (err instanceof ApiError) {
        message = err.message || message;
      } else if (err && (err as any).message) {
        message = (err as any).message;
      }
      toast.error(message);
    }
  };

  const handleExportPDF = async () => handleExport('pdf');
  const handleExportExcel = async () => handleExport('excel');

  const handleBulkAction = async (value: string) => {
    if (value !== 'deleteSelected') return;
    if (!selectedIds.length) {
      toast.error(t('ui.MemosPage.seleccionaAlMenosUnMemo'));
      return;
    }

    if (!(await confirmDialog({ title: 'Eliminar memos', message: `¿Eliminar ${selectedIds.length} memo(s)?`, confirmText: 'Eliminar', tone: 'danger' }))) return;
    try {
      const tenantId = localStorage.getItem("tenantId") || "";
      if (!tenantId) throw new Error("Tenant no configurado");
      await Promise.all(selectedIds.map((id) => ApiService.delete(`/tenant/${tenantId}/memos/${id}`)));
      setMemos((current) => current.filter((memo) => !selectedIds.includes(memo.id)));
      setSelectedIds([]);
      setBulkKey((prev) => prev + 1);
      toast.success('Memos eliminados correctamente');
    } catch (err) {
      let message = 'Error eliminando memos';
      if (err instanceof ApiError) {
        message = err.message || message;
      } else if (err && (err as any).message) {
        message = (err as any).message;
      }
      toast.error(message);
    }
  };

  const bulkActions: BulkAction[] = [
    { value: 'deleteSelected', label: 'Eliminar seleccionados' },
  ];

  const columns: Column<MemoItem>[] = [
    { key: 'subject', header: 'Asunto', sortable: true },
    { key: 'guardName', header: 'Vigilante', sortable: true },
    { key: 'createdBy', header: 'Creado por', sortable: true },
    {
      key: 'dateTime',
      header: 'Fecha',
      sortable: true,
      render: (value) => value ? new Date(value).toLocaleString() : '-',
    },
    {
      key: 'wasAccepted',
      header: 'Estado',
      sortable: true,
      // El acuse de lectura es un semántico, nunca el acento: aceptado = ok,
      // pendiente de acuse = warn.
      render: (value) =>
        value
          ? <StatusBadge tone="ok">Aceptado</StatusBadge>
          : <StatusBadge tone="warn">{t('comun.pendiente')}</StatusBadge>,
    },
  ];

  const aceptados = useMemo(() => memos.filter((memo) => memo.wasAccepted).length, [memos]);
  const pendientes = memos.length - aceptados;

  const rowActions = (memo: MemoItem): RowAction[] => [
    {
      label: 'Ver',
      icon: <Eye className="h-4 w-4" />,
      onClick: () => handleView(memo),
    },
    {
      label: 'Eliminar',
      icon: <Trash className="h-4 w-4" />,
      destructive: true,
      onClick: () => handleDelete(memo),
    },
  ];

  return (
    <AppLayout>
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <PageContainer width="wide">
        <PageHeader
          icon={<Megaphone />}
          title="Memos"
          subtitle={t('ui.MemosPage.listaDeMemosDelEquipo')}
          badges={
            selectedIds.length > 0 ? (
              <StatusBadge tone="brand">{selectedIds.length} seleccionados</StatusBadge>
            ) : undefined
          }
          actions={
            <Button variant="brand" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />{" "}{t('ui.MemosPage.nuevoMemo')}{" "}</Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Memos" value={memos.length} icon={<Megaphone />} accent="brand" />
          <StatCard
            label={t('ui.MemosPage.conAcuseDeLectura')}
            value={aceptados}
            icon={<CheckCheck />}
            accent="ok"
            hint={t('ui.MemosPage.elVigilanteConfirmoHaberloLeido')}
          />
          <StatCard
            label="Pendientes de acuse"
            value={pendientes}
            icon={<Clock />}
            accent="warn"
            hint={t('ui.MemosPage.todaviaSinConfirmar')}
          />
        </div>

        <TableToolbar
          leading={<BulkActionsSelect key={bulkKey} actions={bulkActions} onChange={handleBulkAction} />}
          search={<TableSearch value={query} onChange={setQuery} placeholder={t('ui.MemosPage.buscarMemo')} />}
        >
              <Segmented
                value={filters.status || 'all'}
                onChange={(value) => setFilters({ ...filters, status: value })}
                options={[
                  { value: 'all', label: 'Todos' },
                  { value: 'accepted', label: 'Aceptados' },
                  { value: 'pending', label: 'Pendientes' },
                ]}
              />

              <Sheet open={openFilter} onOpenChange={setOpenFilter}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <Filter className="mr-2 h-4 w-4" /> Filtros
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:w-[400px] md:w-[460px] h-full sm:h-auto">
                  <SheetHeader>
                    <SheetTitle>Filtros de memo</SheetTitle>
                  </SheetHeader>

                  <div className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label>{t('comun.vigilante')}</Label>
                      <Select
                        value={filters.guardId ?? undefined}
                        onValueChange={(value) => setFilters({ ...filters, guardId: value === 'all' ? undefined : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('ui.MemosPage.todos')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('ui.MemosPage.todos')}</SelectItem>
                          {guards.map((guard) => (
                            <SelectItem key={guard.id} value={guard.id}>
                              {guard.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('ui.MemosPage.creadoPor')}</Label>
                      <Select
                        value={filters.createdById ?? undefined}
                        onValueChange={(value) => setFilters({ ...filters, createdById: value === 'all' ? undefined : value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('ui.MemosPage.todos')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('ui.MemosPage.todos')}</SelectItem>
                          {createdByUsers.map((user) => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      variant="brand"
                      className="w-full"
                      onClick={() => setOpenFilter(false)}
                    >
                      Aplicar filtros
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setFilters({ status: 'all' });
                        setOpenFilter(false);
                      }}
                    >
                      Limpiar filtros
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <EllipsisVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handleExportPDF}>
                    <FileDown className="mr-2 h-4 w-4" /> Exportar PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportExcel}>
                    <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
        </TableToolbar>

        <Section title="Memos" icon={<FileText />}>
          <DataTable<MemoItem>
            columns={columns}
            data={sortedMemos}
            loading={loading}
            selectedIds={selectedIds}
            onSelectAll={handleSelectAll}
            onSelectOne={handleSelectOne}
            rowActions={rowActions}
            sortKey={sortKey ?? undefined}
            sortDir={sortDir ?? undefined}
            onSortChange={(key, dir) => {
              setSortKey(dir ? key : null);
              setSortDir(dir);
            }}
            emptyState={
              <EmptyState
                icon={<FileText />}
                title={t('ui.MemosPage.noSeEncontraronMemos')}
                description={t('ui.MemosPage.ajustaLaBusquedaOCrea')}
              />
            }
          />
        </Section>
        </PageContainer>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('ui.MemosPage.nuevoMemo')}</DialogTitle>
              <DialogDescription>
                Crea un memo rápido para el equipo de seguridad.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label className="mb-2 block">{t('comun.vigilante')}</Label>
                <Select value={guardId} onValueChange={(value) => setGuardId(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('ui.MemosPage.seleccionaUnaVigilante')} />
                  </SelectTrigger>
                  <SelectContent>
                    {guards.map((guard) => (
                      <SelectItem key={guard.id} value={guard.id}>
                        {guard.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">{t('comun.estado')}</Label>
                <Select value={wasAccepted ? 'accepted' : 'pending'} onValueChange={(value) => setWasAccepted(value === 'accepted')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('ui.MemosPage.seleccionaElEstado')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t('comun.pendiente')}</SelectItem>
                    <SelectItem value="accepted">Aceptado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-2 block">Asunto</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("ui.Memos.descripcionCortaDelMemo", "Descripción corta del memo")} />
              </div>
              <div>
                <Label className="mb-2 block">Contenido</Label>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder={t('ui.MemosPage.detallesDelMemo')} />
              </div>
            </div>
            <DialogFooter className="flex items-center justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline">{t('actions.cancel')}</Button>
              </DialogClose>
              <Button variant="brand" onClick={handleCreate} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Memo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("ui.Memos.confirmarEliminacion", "Confirmar eliminación")}</DialogTitle>
              <DialogDescription>
                ¿Estás seguro de que deseas eliminar el memo "{memoToDelete?.subject}"?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex items-center justify-end gap-2">
              <DialogClose asChild>
                <Button variant="outline" onClick={() => setMemoToDelete(null)}>{" "}{t('actions.cancel')}{" "}</Button>
              </DialogClose>
              <Button variant="destructive" onClick={confirmDelete}>
                Eliminar memo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={viewOpen} onOpenChange={setViewOpen}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('ui.MemosPage.detalleDelMemo')}</DialogTitle>
              <DialogDescription>{t("ui.Memos.revisaLaInformacionDelMemo", "Revisa la información del memo seleccionado.")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={viewMemo?.wasAccepted ? 'ok' : 'warn'}>
                  {viewMemo?.wasAccepted ? 'Acuse de lectura recibido' : 'Pendiente de acuse'}
                </StatusBadge>
              </div>
              <div className="glass-sunken grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                <Field
                  label={t('comun.vigilante')}
                  value={typeof viewMemo?.guardName === 'string' ? viewMemo?.guardName : viewMemo?.guardName?.name || '-'}
                />
                <Field
                  label={t('ui.MemosPage.creadoPor')}
                  value={typeof viewMemo?.createdBy === 'string' ? viewMemo?.createdBy : viewMemo?.createdBy?.name || '-'}
                />
                <Field
                  label={t('comun.fecha')}
                  value={viewMemo?.dateTime ? new Date(viewMemo.dateTime).toLocaleString() : '-'}
                  className="sm:col-span-2"
                />
              </div>
              <div>
                <div className="cg-eyebrow mb-1">Asunto</div>
                <p className="text-sm font-semibold">{viewMemo?.subject || '-'}</p>
              </div>
              <div>
                <div className="cg-eyebrow mb-1">Contenido</div>
                <p className="whitespace-pre-line text-sm" style={{ color: 'var(--ink-soft)' }}>{viewMemo?.content || '-'}</p>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button>{t('actions.close')}</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
