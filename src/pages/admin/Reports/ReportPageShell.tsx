import type { LucideIcon } from "lucide-react";
import type { ExportFormat } from "@/lib/export/reportExport";
import type { ReportTone } from "./reportIcons";

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Filter, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import ExportMenu from "@/components/reports/ExportMenu";
import AppLayout from "@/layouts/app-layout";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  Toolbar,
  StatusBadge,
  SkeletonBlock,
  Pagination,
  SearchInput,
} from "@/components/kit";

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
  title,
  breadcrumb,
  description,
  icon: Icon,
  tone = "brand",
  filters,
  onApplyFilters,
  rangeControl,
  children,
  empty,
  count = 0,
  loading = false,
  search: searchProp,
  onSearchChange,
  onExport,
  onPrint,
  onEmail,
  exporting,
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
  /**
   * Exportar el informe en el formato pedido. UNA función para los tres, en vez
   * de las dos `onExportPdf`/`onExportExcel` que había: aquellas obligaban a
   * cada informe a repetir el armado del archivo, y por eso el «Excel» de todos
   * ellos acabó siendo un CSV renombrado. El armazón dibuja el menú; quién sabe
   * armar cada formato es `lib/export/reportExport`.
   */
  onExport?: (format: ExportFormat) => void | Promise<void>;
  /** Vista de impresión — se conserva aparte del PDF: es la salida fiel en los
   *  idiomas cuyos caracteres no cubren las fuentes estándar del PDF. */
  onPrint?: () => void;
  onEmail?: () => void;
  exporting?: boolean;
  /** Paginación real. Omitirla oculta el pie por completo. */
  pagination?: ReportPagination;
}) {
  const { t } = useTranslation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const search = searchProp !== undefined ? searchProp : localSearch;
  const setSearch = (v: string) =>
    onSearchChange ? onSearchChange(v) : setLocalSearch(v);
  const hasExport = !!(onExport || onPrint || onEmail);
  const hasFilters = !!filters;
  /* El buscador sólo se dibuja si alguien lo consume: en una página sin datos
     escribía en un estado local que no filtraba nada. Misma regla que el resto
     de la barra — un control que no hace nada no se pinta. */
  const showSearch = searchProp !== undefined || onSearchChange !== undefined;
  const showToolbar = showSearch || !!rangeControl || hasFilters || hasExport;
  /* `null` en vez de un booleano suelto: así el propio `pagination` queda
     estrechado dentro del bloque y no hace falta un `!` para leerlo. */
  const footerPager =
    pagination && !loading && pagination.total > 0 ? pagination : null;

  return (
    <AppLayout>

      <PageContainer width="wide">
        {/* ── Cabecera ── */}
        <PageHeader
          badges={
            !loading ? (
              <StatusBadge dot={false} tone={count > 0 ? tone : "neutral"}>
                {t("ui.ReportPageShell.nRegistros", { defaultValue: "{{count}} registros", count })}
              </StatusBadge>
            ) : undefined
          }
          icon={Icon ? <Icon /> : undefined}
          subtitle={description}
          title={title}
        />

        {/* ── Barra de herramientas ── */}
        {showToolbar && (
          <Toolbar>
            {/* ── POR QUÉ EL BUSCADOR OCUPA LA FILA ENTERA EN UN TELÉFONO ──────
              Tenía `flex-1` sin ancho base, así que a 390 px competía en la
              MISMA línea con el conmutador de rango y el botón de exportar, y
              perdía: se encogía hasta quedar en un círculo con la lupa dentro
              —un campo de texto en el que no cabe texto— y de paso cortaba el
              «7 días» del conmutador. Con `w-full` se lleva la primera línea y
              obliga a los otros dos a envolver a la segunda, donde sí caben
              (conmutador ~200 px + botón ~120 px). De `sm` en adelante vuelve a
              ser la caja estrecha de siempre a la izquierda de la barra. */}
            {showSearch && (
              <SearchInput
                className="w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-xs"
                placeholder={t("ui.ReportPageShell.buscar", "Buscar…")}
                value={search}
                onChange={(v) => setSearch(v)}
              />
            )}

            {rangeControl}

            <div className="ml-auto flex items-center gap-2">
              {/* `ml-auto` sigue valiendo en las dos filas: en el teléfono empuja
                los botones al borde derecho de la segunda línea, que es donde
                el pulgar los alcanza. */}
              {hasFilters && (
                <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <SheetTrigger asChild>
                    <Button className="gap-2" variant="outline">
                      <Filter className="h-4 w-4" /> {t("ui.ReportPageShell.filtros", "Filtros")}
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    className="w-full max-w-[400px] overflow-y-auto sm:max-w-[440px]"
                    side="right"
                  >
                    <SheetHeader>
                      <SheetTitle>{t("ui.ReportPageShell.filtros", "Filtros")}</SheetTitle>
                    </SheetHeader>
                    <div className="mt-6 space-y-5">
                      {filters}
                      <Button
                        className="w-full"
                        variant="brand"
                        onClick={() => {
                          onApplyFilters?.();
                          setFiltersOpen(false);
                        }}
                      >
                        {onApplyFilters ? t("ui.ReportPageShell.aplicarFiltros", "Aplicar filtros") : t("ui.ReportPageShell.listo", "Listo")}
                      </Button>
                    </div>
                  </SheetContent>
                </Sheet>
              )}

              {hasExport && (
                <ExportMenu
                  /* Un informe puede ofrecer sólo imprimir o sólo enviar: en ese
                   caso `formats={[]}` deja el menú sin descargas en vez de
                   pintar tres opciones que nadie sabe atender. */
                  formats={onExport ? undefined : []}
                  onEmail={onEmail}
                  onExport={onExport || (() => {})}
                  onPrint={onPrint}
                  busy={exporting}
                  /* Sin filas no hay archivo que bajar: mejor un botón apagado
                   que un Excel de cero registros en la carpeta de descargas. */
                  disabled={loading || count === 0}
                />
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
                action={
                  hasFilters ? (
                    <Button
                      className="gap-2"
                      variant="outline"
                      onClick={() => setFiltersOpen(true)}
                    >
                      <Filter className="h-4 w-4" /> {t("ui.ReportPageShell.configurarFiltros", "Configurar filtros")}
                    </Button>
                  ) : undefined
                }
                className="border-0 py-0"
                description={
                  empty?.message ||
                  (hasFilters
                    ? t("ui.ReportPageShell.ajustaLosFiltros", "Ajusta los filtros o el rango de fechas para ver resultados en este informe.")
                    : t("ui.ReportPageShell.informeSinDatos", "Este informe todavía no tiene datos que mostrar."))
                }
                icon={<Inbox />}
                title={empty?.title || t("ui.ReportPageShell.sinDatosParaMostrar", "Sin datos para mostrar")}
              />
            </div>
          )}

          {/* Pie de paginación — sólo cuando hay páginas de verdad que recorrer.
              Antes esta franja era un decorado: prometía «25 por página» sobre
              una tabla que pintaba las 2000 filas de golpe y con las dos flechas
              clavadas en `disabled`. */}
          {footerPager && (
            <div
              className="border-t px-4 py-3"
              style={{ borderColor: "var(--hairline)" }}
            >
              <Pagination
                numbered
                noun={t("ui.ReportPageShell.registros", "registros")}
                page={footerPager.page}
                pageSize={footerPager.pageSize}
                total={footerPager.total}
                onPageChange={footerPager.onPageChange}
                onPageSizeChange={footerPager.onPageSizeChange}
              />
            </div>
          )}
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
