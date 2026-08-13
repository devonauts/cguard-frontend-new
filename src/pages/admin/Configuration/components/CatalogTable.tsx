/**
 * ════════════════════════════════════════════════════════════════════════════
 * C-GUARD PRO — TABLA DE CATÁLOGO
 *
 * El patrón que Configuración repetía SEIS veces: una lista de un catálogo
 * pequeño (tipos de incidente, tipos de licencia, departamentos, conjuntos de
 * habilidades, campos de perfil, políticas) con buscador, acciones en lote,
 * estado Activo/Inactivo, menú «…» por fila y pie de paginación.
 *
 * Antes cada catálogo traía su propia copia de ~180 líneas. No eran copias
 * idénticas, y eso era el problema: el pie de página tenía CINCO maquetaciones
 * distintas (`justify-end`, `justify-between`, `gap-6`, con y sin botones), el
 * esqueleto de carga aparecía en tres y faltaba en las otras tres, y la
 * selección se guardaba en `Set`, en `Record<string,boolean>` o en ninguno.
 * Seis catálogos que hacen lo mismo tienen que verse igual.
 *
 * ── LO QUE NO SE REIMPLEMENTA ──────────────────────────────────────────────
 * La rejilla, el esqueleto, el estado vacío, la selección y el menú de fila
 * salen de `@/components/table` (DataTable, TableToolbar, TableSearch,
 * RowActionsMenu). Aquí sólo vive lo que un CATÁLOGO añade encima: el pie de
 * paginación y la barra de acciones en lote.
 *
 * ── PROMOVER AL KIT ────────────────────────────────────────────────────────
 * `Pagination` y `CatalogTable` no tienen nada específico de Configuración.
 * Cuando otra área los necesite, su sitio es `@/components/table`.
 * ════════════════════════════════════════════════════════════════════════════
 */
import * as React from 'react';
import { Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { EmptyState, StatusBadge } from '@/components/kit';
import { DataTable, type Column } from '@/components/table/DataTable';
import { TableToolbar, TableSearch } from '@/components/table/TableToolbar';
import type { RowAction } from '@/components/table/RowActionsMenu';

export type { Column as CatalogColumn };

const PAGE_SIZES = [10, 25, 50, 100];

/** Acción que opera sobre las filas marcadas. */
export type BulkAction = {
  label: string;
  icon?: React.ReactNode;
  onRun: (ids: string[]) => void;
  /** Sólo el aspecto; la confirmación la pone la página. */
  destructive?: boolean;
};

/**
 * Pie de paginación. UNA maquetación para todos los catálogos: cuántos por
 * página a la izquierda, el rango en el centro con cifras tabulares (para que
 * no bailen al cambiar de página) y los saltos a la derecha.
 */
export function Pagination({
  page, pageSize, total, onPageChange, onPageSizeChange, disabled,
}: {
  page: number; pageSize: number; total: number;
  onPageChange: (p: number) => void; onPageSizeChange: (n: number) => void;
  disabled?: boolean;
}) {
  const maxPage = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-1 text-sm"
      style={{ color: 'var(--ink-soft)' }}
    >
      <div className="flex items-center gap-2">
        <span>Elementos por página</span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-9 w-[84px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="tabular-nums">{total === 0 ? '0 de 0' : `${from} – ${to} de ${total}`}</div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={disabled || page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={disabled || page >= maxPage} onClick={() => onPageChange(Math.min(maxPage, page + 1))}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}

/**
 * Píldora Activo/Inactivo. Va en `ok`/neutro y NUNCA en el rojo de alarma:
 * desactivar una entrada de catálogo es disponibilidad, no gravedad. Cinco de
 * los seis catálogos la repetían con la misma decisión tomada a mano.
 */
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <StatusBadge tone={active ? 'ok' : 'neutral'}>{active ? 'Activo' : 'Inactivo'}</StatusBadge>
  );
}

export type CatalogTableProps<T extends { id: string }> = {
  rows: T[];
  columns: Column<T>[];
  loading?: boolean;

  /** Buscador. Omitir `onQueryChange` lo esconde. */
  query?: string;
  onQueryChange?: (v: string) => void;
  searchPlaceholder?: string;

  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (n: number) => void;

  rowActions?: (row: T) => RowAction[];

  /** Sin acciones en lote no se dibuja la columna de casillas. */
  bulkActions?: BulkAction[];
  /** Deshabilita selección y acciones en lote (permisos). */
  canEdit?: boolean;

  /** Estado vacío propio del catálogo. */
  empty?: { title: string; description?: string };

  /** Controles extra a la derecha de la barra (p. ej. «Nuevo…»). */
  toolbarExtra?: React.ReactNode;
  /** Aviso entre la barra y la tabla (p. ej. «Próximamente»). */
  notice?: React.ReactNode;
};

export function CatalogTable<T extends { id: string }>({
  rows, columns, loading,
  query, onQueryChange, searchPlaceholder = 'Buscar…',
  page, pageSize, total, onPageChange, onPageSizeChange,
  rowActions, bulkActions, canEdit = true,
  empty, toolbarExtra, notice,
}: CatalogTableProps<T>) {
  const [selected, setSelected] = React.useState<string[]>([]);

  // Al cambiar de página o de búsqueda, una selección de filas que ya no se ven
  // no debe poder borrarse a ciegas. Se recorta a lo visible en cada render.
  const visibles = React.useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const marcados = React.useMemo(() => selected.filter((id) => visibles.has(id)), [selected, visibles]);

  const seleccionable = !!bulkActions?.length && canEdit;

  const vaciar = () => setSelected([]);
  React.useEffect(() => { vaciar(); }, [page, pageSize, query]);

  return (
    <div className="space-y-4">
      <TableToolbar
        leading={
          bulkActions?.map((a) => (
            <Button
              key={a.label}
              variant="outline"
              size="sm"
              disabled={!canEdit || marcados.length === 0}
              onClick={() => { a.onRun(marcados); vaciar(); }}
              style={a.destructive && marcados.length ? { color: 'var(--bad-text)' } : undefined}
            >
              {a.icon ?? (a.destructive ? <Trash2 className="mr-1.5 h-4 w-4" /> : null)}
              {a.label}{marcados.length ? ` (${marcados.length})` : ''}
            </Button>
          ))
        }
        search={
          onQueryChange
            ? <TableSearch value={query ?? ''} onChange={onQueryChange} placeholder={searchPlaceholder} />
            : undefined
        }
      >
        {toolbarExtra}
      </TableToolbar>

      {notice}

      <DataTable<T>
        columns={columns}
        data={rows}
        loading={loading}
        rowActions={canEdit ? rowActions : undefined}
        selectedIds={seleccionable ? marcados : undefined}
        onSelectOne={seleccionable ? (id, on) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id))) : undefined}
        onSelectAll={seleccionable ? (on) => setSelected(on ? rows.map((r) => r.id) : []) : undefined}
        emptyState={
          <EmptyState
            className="border-0"
            icon={<Search />}
            title={empty?.title ?? 'No se encontraron resultados'}
            description={empty?.description}
          />
        }
      />

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        disabled={loading}
      />
    </div>
  );
}

export default CatalogTable;
