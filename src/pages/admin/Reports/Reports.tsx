import React, { useMemo, useState } from "react";
import { useTranslation } from 'react-i18next';
import { useNavigate } from "react-router-dom";
import { Settings, ArrowRight, Search, BarChart3, X, SearchX } from "lucide-react";
import AppLayout from "@/layouts/app-layout";
import { REPORT_SECTIONS } from "@/config/reports-config";
import { SECTION_THEME, iconForReport, toneForReport } from "./reportIcons";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  EmptyState,
  StatusBadge,
  IconTile,
  FadeIn,
  Stagger,
} from "@/components/kit";

// Reports actually wired to live data (DataReport-backed). Everything else in
// reports-config is still a shell, so those cards render disabled ("Próximamente")
// instead of navigating to an empty page. Add an href here as each report ships.
const READY_REPORT_HREFS = new Set<string>([
  "/reports/check-in-out",
  "/reports/site-tour",
  "/reports/tasks",
  "/reports/passdown",
  "/reports/panic-button-log",
  "/reports/geo-fence-log",
  "/reports/incidents/general",
]);

interface ReportsProps {
  onNavigate?: (href: string) => void;
}

const Reports: React.FC<ReportsProps> = ({ onNavigate }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const go = (href?: string) => {
    if (!href) return;
    onNavigate ? onNavigate(href) : navigate(href);
  };

  const totalReports = useMemo(
    () => REPORT_SECTIONS.reduce((n, s) => n + s.reports.length, 0),
    [],
  );

  // Live filter across every report.
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REPORT_SECTIONS;
    return REPORT_SECTIONS
      .map((s) => ({
        ...s,
        reports: s.reports.filter(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            (r.description || "").toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.reports.length > 0);
  }, [query]);

  // Search field reused inside the page hero.
  const searchField = (
    <div className="relative w-full sm:w-80">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: "var(--ink-faint)" }}
      />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar un informe…"
        className="cg-input w-full py-2.5 pl-10 pr-9 text-sm"
      />
      {query && (
        <button
          onClick={() => setQuery("")}
          aria-label={t("ui.Reports.limpiarBusqueda", "Limpiar búsqueda")}
          className="cg-focus absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors"
          style={{ color: "var(--ink-faint)" }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );

  return (
    <AppLayout>
      <PageContainer width="wide" className="p-4 lg:p-8">
        {/* ── Hero ── */}
        <PageHeader
          icon={<BarChart3 />}
          title="Centro de Reportes"
          subtitle={`${totalReports} informes operativos, de incidentes, tiempo y nómina — todo en un solo lugar.`}
          actions={searchField}
        />

        {/* ── Sections ── */}
        {sections.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={t('kit.select.empty')}
            description={`Ningún informe coincide con “${query}”.`}
            action={
              <Button variant="outline" onClick={() => setQuery("")}>
                Limpiar búsqueda
              </Button>
            }
          />
        ) : (
          sections.map((section) => {
            const theme = SECTION_THEME[section.id] || SECTION_THEME.general;
            const SectionIcon = theme.icon;
            return (
              <FadeIn key={section.id} className="space-y-3">
                {/* Section header */}
                <div className="flex items-center justify-between gap-4 px-1">
                  <div className="flex items-center gap-2.5">
                    <IconTile tone={theme.tone} size="sm">
                      <SectionIcon />
                    </IconTile>
                    <div>
                      <h2 className="text-sm font-bold">{section.title}</h2>
                      <p className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
                        {section.reports.length} informe{section.reports.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {section.settingsHref && (
                      <Button
                        variant="outline"
                        size="icon"
                        title={t("ui.Reports.configuracion", "Configuración")}
                        aria-label={t("ui.Reports.configuracionDeLaSeccion", "Configuración de la sección")}
                        onClick={() => go(section.settingsHref)}
                      >
                        <Settings size={15} />
                      </Button>
                    )}
                    {section.viewAllHref && (
                      <Button variant="link" size="sm" onClick={() => go(section.viewAllHref)} className="gap-1">
                        Ver todo <ArrowRight size={14} />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Cards */}
                <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {section.reports.map((report) => {
                    const Icon = iconForReport(report.id, section.id);
                    // Only the reports actually wired to data are clickable; the
                    // rest are shown disabled with a "Próximamente" badge instead
                    // of navigating to an empty shell.
                    const ready = READY_REPORT_HREFS.has(report.href);
                    return (
                      <button
                        key={report.id}
                        onClick={ready ? () => go(report.href) : undefined}
                        disabled={!ready}
                        aria-disabled={!ready}
                        // `glass-flat` y no `glass`: son fichas que se repiten en
                        // una rejilla y el desenfoque por ficha hunde el scroll.
                        className={`cg-focus group glass-flat relative flex h-full w-full items-start gap-3.5 overflow-hidden p-4 text-left ${
                          ready ? "glass-hover" : "cursor-not-allowed opacity-55"
                        }`}
                      >
                        <IconTile tone={toneForReport(report.id, section.id)}>
                          <Icon />
                        </IconTile>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold leading-snug">{report.title}</h3>
                            {!ready ? (
                              <StatusBadge tone="neutral" dot={false} className="shrink-0 px-1.5 py-0.5 text-[10px]">{t("ui.Reports.proximamente", "Próximamente")}</StatusBadge>
                            ) : (report.openCount !== undefined || report.closedCount !== undefined) && (
                              <div className="flex shrink-0 gap-1">
                                {report.openCount !== undefined && (
                                  <StatusBadge tone="ok" dot={false} className="px-1.5 py-0.5 text-[10px]">{report.openCount}</StatusBadge>
                                )}
                                {report.closedCount !== undefined && (
                                  <StatusBadge tone="neutral" dot={false} className="px-1.5 py-0.5 text-[10px]">{report.closedCount}</StatusBadge>
                                )}
                              </div>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed" style={{ color: "var(--ink-soft)" }}>
                            {report.description}
                          </p>
                        </div>
                        {ready && (
                          <ArrowRight
                            size={16}
                            className="absolute bottom-3 right-3 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                            style={{ color: "var(--brand-text)" }}
                          />
                        )}
                      </button>
                    );
                  })}
                </Stagger>
              </FadeIn>
            );
          })
        )}
      </PageContainer>
    </AppLayout>
  );
};

export default Reports;
