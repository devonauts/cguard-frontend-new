import React from "react";
import { useTranslation } from "react-i18next";
import { MoreVertical, Search, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePermissions } from '@/hooks/usePermissions';
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, EmptyState, Toolbar, GlassPanel } from "@/components/kit";

export type UserRoleRow = {
  id: string;
  name: string;
  description?: string;
  // isDefault === built-in/system role: not deletable, not editable via the
  // create/edit dialog (permissions are edited via the expand panel instead).
  isDefault?: boolean;
  slug?: string;
  isSystem?: boolean;
  // fullyLocked === superadmin/customer: permissions are NOT tenant-editable.
  fullyLocked?: boolean;
};

type Props = {
  rows: UserRoleRow[];
  checked: Record<string, boolean>;
  onCheckAll: (v: boolean) => void;
  onCheckRow: (id: string, v: boolean) => void;
  query: string;
  onQueryChange: (v: string) => void;
  onToggleExpand?: (r: UserRoleRow) => void;
  onEdit: (r: UserRoleRow) => void;
  onDelete: (r: UserRoleRow) => void;
  onBulkDelete: () => void;
  expandedRoleId?: string | null;
  expandedContent?: React.ReactNode;
  onSaveExpanded?: (id: string, perms: string[]) => void;
  pageSize: string;
  onPageSize: (v: string) => void;
  pageLabel: string;
};

export default function UserRolesTable({
  rows,
  checked,
  onCheckAll,
  onCheckRow,
  query,
  onQueryChange,
  onToggleExpand,
  onEdit,
  onDelete,
  onBulkDelete,
  expandedRoleId,
  expandedContent,
  pageSize,
  onPageSize,
  pageLabel,
}: Props) {
  const selectableRows = rows.filter((r) => !r.isDefault);
  const allChecked = selectableRows.length > 0 && selectableRows.every((r) => checked[r.id]);
  const anyDeletableSelected = rows.some((r) => !r.isDefault && checked[r.id]);

  const { hasPermission } = usePermissions();
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Toolbar>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="min-w-[130px] justify-between">
              {t('settings.userRoles.actionBtn', { defaultValue: 'Acción' })} <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onBulkDelete} disabled={!anyDeletableSelected}>
              {t('settings.userRoles.deleteAction', { defaultValue: 'Eliminar' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
          <Input
            className="pl-9"
            placeholder={t('settings.userRoles.searchPlaceholder', { defaultValue: 'Buscar rol de usuario' })}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </div>
      </Toolbar>

      <GlassPanel className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[44px]">
                <Checkbox checked={allChecked} onCheckedChange={(v) => onCheckAll(Boolean(v))} />
              </TableHead>
              <TableHead>{t('settings.userRoles.colRole', { defaultValue: 'Rol' })}</TableHead>
              <TableHead>{t('settings.userRoles.colDescription', { defaultValue: 'Descripción' })}</TableHead>
              <TableHead className="w-[56px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4}>
                  <EmptyState
                    icon={<Search />}
                    title={t('settings.userRoles.emptyTitle', { defaultValue: 'No se encontraron resultados' })}
                    description={t('settings.userRoles.emptyDescription', { defaultValue: 'Sin datos para mostrar' })}
                    className="border-0 py-12"
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <React.Fragment key={r.id}>
                  <TableRow>
                    <TableCell>
                      <Checkbox
                        checked={!!checked[r.id]}
                        disabled={!!r.isDefault}
                        onCheckedChange={(v) => onCheckRow(r.id, Boolean(v))}
                      />
                    </TableCell>
                    <TableCell
                      className="cg-focus cursor-pointer font-medium"
                      role="button"
                      tabIndex={0}
                      aria-expanded={expandedRoleId === r.id}
                      onClick={() => onToggleExpand && onToggleExpand(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") onToggleExpand && onToggleExpand(r);
                      }}
                    >
                      <span className="inline-flex items-center gap-2">
                        {expandedRoleId === r.id ? (
                          <ChevronDown className="h-4 w-4" style={{ color: 'var(--brand-text)' }} />
                        ) : (
                          <ChevronRight className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} />
                        )}
                        <span>{r.name}</span>
                        {r.isDefault && <StatusBadge tone="brand">{t('settings.userRoles.defaultBadge', { defaultValue: 'Predeterminado' })}</StatusBadge>}
                      </span>
                    </TableCell>
                    <TableCell style={{ color: 'var(--ink-soft)' }}>{r.description}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem disabled={!hasPermission('settingsEdit') || !!r.isDefault} onClick={() => { if (!hasPermission('settingsEdit') || !!r.isDefault) return; onEdit(r); }}>{t('settings.userRoles.editAction', { defaultValue: 'Editar' })}</DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            disabled={!hasPermission('settingsEdit') || !!r.isDefault}
                            onClick={() => { if (!hasPermission('settingsEdit') || !!r.isDefault) return; onDelete(r); }}
                          >
                            {t('settings.userRoles.deleteAction', { defaultValue: 'Eliminar' })}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  {expandedRoleId === r.id && (
                    <TableRow key={`${r.id}-expanded`}>
                      <TableCell colSpan={4} className="p-3">
                        <div className="glass-sunken p-4">{expandedContent}</div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </GlassPanel>

      <div className="flex items-center justify-end gap-4 text-sm" style={{ color: 'var(--ink-soft)' }}>
        <div>{t('settings.userRoles.perPageLabel', { defaultValue: 'Elementos por página' })}</div>
        <Select value={pageSize} onValueChange={onPageSize}>
          <SelectTrigger className="w-[90px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <div className="tabular-nums">{pageLabel}</div>
      </div>
    </div>
  );
}
