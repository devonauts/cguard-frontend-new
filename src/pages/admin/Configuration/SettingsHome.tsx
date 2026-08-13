import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Settings2 } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import NAVS from "@/data/settings-nav.json";
import { settingsIcon } from "@/config/settingsIcons";
import { PageContainer, PageHeader, FadeIn, Stagger, EmptyState, IconTile } from "@/components/kit";

type SubItem = { id: string; label: string; path: string; icon?: string; desc?: string };
type Section = { label?: string; items: SubItem[] };

export default function SettingsHome() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const nav = (NAVS as Record<string, { title?: string; sections: Section[] }>).configuracion;

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nav.sections;
    return nav.sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((it) => {
          const label = t(`settings.configuracion.${it.id}`, { defaultValue: it.label }) as string;
          return label.toLowerCase().includes(q) || (it.desc ?? "").toLowerCase().includes(q);
        }),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [nav.sections, query, t]);

  return (
    <AppLayout>
      <PageContainer width="wide">
        {/* Hero */}
        <PageHeader
          icon={<Settings2 />}
          title={t("settings.home.heroTitle", { defaultValue: "Configuración" })}
          subtitle={t("settings.home.heroSubtitle", {
            defaultValue:
              "Administra tu cuenta, tu empresa y cómo opera la plataforma. Elige una categoría para empezar.",
          })}
          actions={
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--ink-faint)" }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("settings.home.searchPlaceholder", { defaultValue: "Buscar un ajuste..." })}
                className="cg-input w-full py-2.5 pl-10 pr-3 text-sm"
              />
            </div>
          }
        />

        {/* Category groups */}
        <div className="space-y-9">
          {sections.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title={t("settings.noResults", { defaultValue: "Sin resultados" })}
            />
          ) : (
            sections.map((sec, idx) => {
              const slug = String(sec.label ?? "")
                .toLowerCase()
                .replace(/\s+/g, "_")
                .replace(/[^a-z0-9_]/g, "");
              return (
                <FadeIn key={idx} delay={idx * 0.05}>
                  <section>
                    {sec.label ? (
                      <div className="mb-3 flex items-center gap-3">
                        <h2 className="cg-eyebrow">
                          {t(`settings.section.${slug}`, { defaultValue: sec.label })}
                        </h2>
                        <div className="h-px flex-1" style={{ background: "var(--hairline)" }} />
                      </div>
                    ) : null}

                    <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {sec.items.map((item) => {
                        const Icon = settingsIcon(item.icon);
                        return (
                          <Link
                            key={item.id}
                            to={item.path}
                            className="glass-flat glass-hover cg-focus group flex h-full items-start gap-3 p-4"
                          >
                            <IconTile size="sm">
                              <Icon />
                            </IconTile>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="truncate text-sm font-semibold">
                                  {t(`settings.configuracion.${item.id}`, { defaultValue: item.label })}
                                </h3>
                                <ChevronRight
                                  className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                                  style={{ color: "var(--ink-faint)" }}
                                />
                              </div>
                              {item.desc ? (
                                <p
                                  className="mt-0.5 line-clamp-2 text-xs"
                                  style={{ color: "var(--ink-soft)" }}
                                >
                                  {item.desc}
                                </p>
                              ) : null}
                            </div>
                          </Link>
                        );
                      })}
                    </Stagger>
                  </section>
                </FadeIn>
              );
            })
          )}
        </div>
      </PageContainer>
    </AppLayout>
  );
}
