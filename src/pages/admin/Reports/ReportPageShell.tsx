import { useState, type ReactNode } from "react";
import {
  Search, Filter, MoreVertical, FileText, FileSpreadsheet, Printer, Mail, Inbox,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AppLayout from "@/layouts/app-layout";
import Breadcrumb from "@/components/ui/breadcrumb";
import {
  PageContainer, PageHeader, Section, EmptyState, Toolbar, StatusBadge, SkeletonBlock,
  Pagination,
} from "@/components/kit";
import type { ReportTone } from "./reportIcons";

/** Estado de paginación que el informe cede al armazón: el armazón dibuja el
 *  pie, pero quien tiene las filas —y por tanto quien puede cortarlas— es el
 *  informe. Sin esta prop no hay pie: una barra de paginación sobre una tabla
 *  que nadie pagina es exactamente el control decorativo que había aquí. */
export interface ReportPagination {
  page: number;
  pageSize: number;
  /** Total de filas del conjunto YA filtrado (no el de la página visible). */
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (n: number) => void;
}

/** Filas fantasma mientras se carga: la forma de la tabla ya está ahí, así que
 *  nada salta cuando llegan los datos. */
function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <SkeletonBlock className="h-3 w-1/5" />
          <SkeletonBlock className="h-3 w-2/5" />
          <SkeletonBlock className="h-3 w-1/5" />
          <SkeletonBlock className="h-3 w-1/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Armazón compartido de TODOS los informes: cabecera del kit, barra de
 * herramientas (búsqueda + cajón de filtros + exportaciones), marco de cristal
 * para la tabla y pie de paginación.
 *
 * `tone` NO es decoración: pinta la píldora de recuento de la cabecera y marca
 * los informes que hablan de un peligro (pánico, caídas, incidentes) en
 * `--bad`, independientemente del acento que la empresa haya elegido.
 */
export default function ReportPageShell({
  title, breadcrumb, description, icon: Icon, tone = "brand",
  filters, onApplyFilters, rangeControl, children, empty, count = 0, loading = false,
  search: searchProp, onSearchChange,
  onExportPdf, onExportExcel, onPrint, onEmail, exporting,
  pagination,
}: {
  title: string;
  breadcrumb?: string;
  description?: string;
  icon?: LucideIcon;
  /** Tono de la píldora de recuento — `bad` para los informes de peligro. */
  tone?: ReportTone;
  /** Campos del cajón de filtros. Sin ellos NO se dibuja el botón «Filtros»:
   *  un cajón vacío que no filtra nada es peor que no tener cajón. */
  filters?: ReactNode;
  /** Se ejecuta al pulsar «Aplicar filtros» (recargar con los valores puestos).
   *  Sin ella el botón sólo cierra la hoja, y entonces se llama «Listo». */
  onApplyFilters?: () => void;
  /** Conmutador de rango (presets) que se muestra en la barra de herramientas. */
  rangeControl?: ReactNode;
  children?: ReactNode;
  empty?: { title?: string; message?: string };
  count?: number;
  loading?: boolean;
  /** Controlled search (optional — falls back to local state). */
  search?: string;
  onSearchChange?: (v: string) => void;
  /** Export actions — wired into the dropdown. Omitted actions are hidden. */
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  onPrint?: () => void;
  onEmail?: () => void;
  exporting?: boolean;
  /** Paginación real. Omitirla oculta el pie por completo. */
  pagination?: ReportPagination;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const search = searchProp !== undefined ? searchProp : localSearch;
  const setSearch = (v: string) => (onSearchChange ? onSearchChange(v) : setLocalSearch(v));
  const hasExport = !!(onExportPdf || onExportExcel || onPrint || onEmail);
  const hasFilters = !!filters;
  /* El buscador sólo se dibuja si alguien lo consume: en una página sin datos
     escribía en un estado local que no filtraba nada. Misma regla que el resto
     de la barra — un control que no hace nada no se pinta. */
  const showSearch = searchProp !== undefined || onSearchChange !== undefined;
  const showToolbar = showSearch || !!rangeControl || hasFilters || hasExport;
  /* `null` en vez de un booleano suelto: así el propio `pagination` queda
     estrechado dentro del bloque y no hace falta un `!` para leerlo. */
  const footerPager = pagination && !loading && pagination.total > 0 ? pagination : null;

  return (
    <AppLayout>
      <Breadcrumb
        items={[
          { label: "Panel de control", path: "/dashboard" },
          { label: "Reportes", path: "/reports" },
          { label: breadcrumb || title },
        ]}
      />

      <PageContainer width="wide">
        {/* ── Cabecera ── */}
        <PageHeader
          title={title}
          subtitle={description}
          icon={Icon ? <Icon /> : undefined}
          badges={
            !loading ? (
              <StatusBadge tone={count > 0 ? tone : "neutral"} dot={false}>
                {count === 1 ? "1 registro" : `${count} registros`}
              </StatusBadge>
            ) : undefined
          }
        />

        {/* ── Barra de herramientas ── */}
        {showToolbar && (
        <Toolbar>
          {showSearch && (
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--ink-faint)" }}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar…"
                className="cg-input w-full py-2 pl-9 pr-3 text-sm"
              />
            </div>
          )}

          {rangeControl}

          <div className="ml-auto flex items-center gap-2">
            {hasFilters && (
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="h-4 w-4" /> Filtros
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[400px] overflow-y-auto sm:w-[440px]">
                  <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
                  <div className="mt-6 space-y-5">
                    {filters}
                    <Button
                      variant="brand"
                      className="w-full"
                      onClick={() => {
                        onApplyFilters?.();
                        setFiltersOpen(false);
                      }}
                    >
                      {onApplyFilters ? "Aplicar filtros" : "Listo"}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            )}

            {hasExport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Exportar" disabled={exporting}>
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {onExportPdf && (
                    <DropdownMenuItem className="gap-2" onSelect={onExportPdf}><FileText className="h-4 w-4" /> Exportar como PDF</DropdownMenuItem>
                  )}
                  {onExportExcel && (
                    <DropdownMenuItem className="gap-2" onSelect={onExportExcel}><FileSpreadsheet className="h-4 w-4" /> Exportar como Excel</DropdownMenuItem>
                  )}
                  {onPrint && (
                    <DropdownMenuItem className="gap-2" onSelect={onPrint}><Printer className="h-4 w-4" /> Imprimir</DropdownMenuItem>
                  )}
                  {onEmail && (
                    <DropdownMenuItem className="gap-2" onSelect={onEmail}><Mail className="h-4 w-4" /> Enviar por correo</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </Toolbar>
        )}

        {/* ── Marco de contenido ── */}
        <Section className="overflow-hidden p-0" contentClassName="">
          {loading ? (
            <TableSkeleton />
          ) : children ? (
            children
          ) : (
            <div className="px-6 py-16">
              <EmptyState
                className="border-0 py-0"
                icon={<Inbox />}
                title={empty?.title || "Sin datos para mostrar"}
                description={
                  empty?.message ||
                  (hasFilters
                    ? "Ajusta los filtros o el rango de fechas para ver resultados en este informe."
                    : "Este informe todavía no tiene datos que mostrar.")
                }
                action={
                  hasFilters ? (
                    <Button onClick={() => setFiltersOpen(true)} variant="outline" className="gap-2">
                      <Filter className="h-4 w-4" /> Configurar filtros
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}

          {/* Pie de paginación — sólo cuando hay páginas de verdad que recorrer.
              Antes esta franja era un decorado: prometía «25 por página» sobre
              una tabla que pintaba las 2000 filas de golpe y con las dos flechas
              clavadas en `disabled`. */}
          {footerPager && (
            <div className="border-t px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
              <Pagination
                page={footerPager.page}
                pageSize={footerPager.pageSize}
                total={footerPager.total}
                onPageChange={footerPager.onPageChange}
                onPageSizeChange={footerPager.onPageSizeChange}
                numbered
                noun="registros"
              />
            </div>
          )}
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
