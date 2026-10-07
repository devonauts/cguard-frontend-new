import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  ArrowRight,
  Search,
  BarChart3,
  X,
  SearchX,
} from "lucide-react";

import { SECTION_THEME, iconForReport, toneForReport } from "./reportIcons";

import AppLayout from "@/layouts/app-layout";
import { REPORT_SECTIONS } from "@/config/reports-config";
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
  "/reports/coverage-absences",
  "/reports/site-tour",
  "/reports/tasks",
  "/reports/passdown",
  "/reports/panic-button-log",
  "/reports/geo-fence-log",
  "/reports/incidents/general",
  "/reports/supervision-history",
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

  // reports-config es una constante de módulo: guarda la CLAVE, no el texto.
  // Aquí es donde se pinta, así que aquí se traduce.
  const tx = React.useCallback(
    (key: string | undefined, fallback: string) =>
      key ? t(key, fallback) : fallback,
    [t],
  );

  // Live filter across every report.
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return REPORT_SECTIONS;

    return REPORT_SECTIONS.map((s) => ({
      ...s,
      reports: s.reports.filter(
        (r) =>
          tx(r.titleKey, r.title).toLowerCase().includes(q) ||
          tx(r.descriptionKey, r.description || "")
            .toLowerCase()
            .includes(q),
      ),
    })).filter((s) => s.reports.length > 0);
  }, [query, tx]);

  // Search field reused inside the page hero.
  const searchField = (
    <div className="relative w-full sm:w-80">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2"
        style={{ color: "var(--ink-faint)" }}
      />
      <input
        className="cg-input w-full py-2.5 pl-10 pr-9 text-sm"
        placeholder={t("ui.Reports.buscarUnInforme")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button
          aria-label={t("ui.Reports.limpiarBusqueda", "Limpiar búsqueda")}
          className="cg-focus absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 transition-colors"
          style={{ color: "var(--ink-faint)" }}
          onClick={() => setQuery("")}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );

  return (
    <AppLayout>
      <PageContainer width="wide">
        {/* ── Hero ── */}
        <PageHeader
          actions={searchField}
          icon={<BarChart3 />}
          subtitle={t("ui.Reports.subtitulo", { defaultValue: "{{count}} informes operativos, de incidentes, tiempo y nómina — todo en un solo lugar.", count: totalReports })}
          title={t("ui.Reports.centroDeReportes", "Centro de Reportes")}
        />

        {/* ── Sections ── */}
        {sections.length === 0 ? (
          <EmptyState
            action={
              <Button variant="outline" onClick={() => setQuery("")}>
                {t("ui.Reports.limpiarBusqueda", "Limpiar búsqueda")}
              </Button>
            }
            description={t("ui.Reports.ningunInformeCoincide", { defaultValue: "Ningún informe coincide con “{{query}}”.", query })}
            icon={<SearchX />}
            title={t("kit.select.empty")}
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
                    <IconTile size="sm" tone={theme.tone}>
                      <SectionIcon />
                    </IconTile>
                    <div>
                      <h2 className="text-sm font-bold">
                        {tx(section.titleKey, section.title)}
                      </h2>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {t("ui.Reports.nInformes", {
                          defaultValue: "{{count}} informes",
                          count: section.reports.length,
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {section.settingsHref && (
                      <Button
                        aria-label={t(
                          "ui.Reports.configuracionDeLaSeccion",
                          "Configuración de la sección",
                        )}
                        size="icon"
                        title={t("ui.Reports.configuracion", "Configuración")}
                        variant="outline"
                        onClick={() => go(section.settingsHref)}
                      >
                        <Settings size={15} />
                      </Button>
                    )}
                    {section.viewAllHref && (
                      <Button
                        className="gap-1"
                        size="sm"
                        variant="link"
                        onClick={() => go(section.viewAllHref)}
                      >
                        {t("ui.Reports.verTodo", "Ver todo")} <ArrowRight size={14} />
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
                        className={`cg-focus group glass-flat relative flex h-full w-full items-start gap-3.5 overflow-hidden p-4 text-left ${
                          ready ? "glass-hover" : "cursor-not-allowed opacity-55"
                        }`}
                        disabled={!ready}
                        aria-disabled={!ready}
                        // `glass-flat` y no `glass`: son fichas que se repiten en
                        // una rejilla y el desenfoque por ficha hunde el scroll.
                        onClick={ready ? () => go(report.href) : undefined}
                      >
                        <IconTile tone={toneForReport(report.id, section.id)}>
                          <Icon />
                        </IconTile>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-semibold leading-snug">
                              {tx(report.titleKey, report.title)}
                            </h3>
                            {!ready ? (
                              <StatusBadge
                                className="shrink-0 px-1.5 py-0.5 text-[10px]"
                                dot={false}
                                tone="neutral"
                              >
                                {t("ui.Reports.proximamente", "Próximamente")}
                              </StatusBadge>
                            ) : (
                              (report.openCount !== undefined ||
                                report.closedCount !== undefined) && (
                                <div className="flex shrink-0 gap-1">
                                  {report.openCount !== undefined && (
                                    <StatusBadge
                                      className="px-1.5 py-0.5 text-[10px]"
                                      dot={false}
                                      tone="ok"
                                    >
                                      {report.openCount}
                                    </StatusBadge>
                                  )}
                                  {report.closedCount !== undefined && (
                                    <StatusBadge
                                      className="px-1.5 py-0.5 text-[10px]"
                                      dot={false}
                                      tone="neutral"
                                    >
                                      {report.closedCount}
                                    </StatusBadge>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                          <p
                            className="mt-1 line-clamp-2 text-xs leading-relaxed"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {tx(report.descriptionKey, report.description)}
                          </p>
                        </div>
                        {ready && (
                          <ArrowRight
                            className="absolute bottom-3 right-3 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100"
                            size={16}
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
