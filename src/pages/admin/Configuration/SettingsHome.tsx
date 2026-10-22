import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, ChevronRight, Settings2 } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import NAVS from "@/data/settings-nav.json";
import { seccionesDeConfiguracion } from "@/lib/navDeConfiguracion";
import { useAuth } from "@/contexts/AuthContext";
import { settingsIcon } from "@/config/settingsIcons";
import { useAgente } from "@/lib/agenteDeMarca";
import {
  PageContainer,
  PageHeader,
  FadeIn,
  Stagger,
  EmptyState,
  IconTile,
  SearchInput,
} from "@/components/kit";

type SubItem = {
  id: string;
  label: string;
  path: string;
  icon?: string;
  desc?: string;
  keywords?: string;
};
type Section = { label?: string; hint?: string; items: SubItem[] };

/** Minúsculas y sin tildes, para que «nómina» encuentre «nomina» y al revés. */
const sinAcentos = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export default function SettingsHome() {
  const { t } = useTranslation();
  // Cómo se llama el asistente aquí: en el CRM de un socio, el suyo.
  const agente = useAgente();
  const [query, setQuery] = useState("");
  const { user } = useAuth();
  const nav = {
    ...(NAVS as Record<string, { title?: string; sections: Section[] }>).configuracion,
    // Sin las entradas de módulos que la empresa no tiene (p. ej. Roles de pago).
    sections: seccionesDeConfiguracion(user) as Section[],
  };

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) return nav.sections;

    return nav.sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((it) => {
          const label = t(`settings.configuracion.${it.id}`, {
            defaultValue: it.label,
            agente: agente.nombre,
          }) as string;
          // La descripción también traducida: en inglés, buscar «retention» no
          // encontraba nada porque el heno seguía siendo el español del JSON.
          const desc = t(`settings.configuracion.${it.id}.desc`, {
            defaultValue: it.desc ?? "",
          }) as string;
          // Se busca también en `keywords`, y SIN acentos en ninguno de los dos
          // lados. Antes sólo se miraba etiqueta y descripción tal cual: buscar
          // «turno» daba CERO resultados aunque cuatro páginas tienen reglas de
          // turno, y «geocerca» encontraba una habiendo tres. Un buscador que no
          // encuentra lo que existe enseña a no usarlo.
          const heno = sinAcentos(
            `${label} ${desc} ${it.desc ?? ""} ${it.keywords ?? ""}`,
          );

          return heno.includes(sinAcentos(q));
        }),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [nav.sections, query, t]);

  return (
    <AppLayout>
      <PageContainer width="wide">
        {/* Hero */}
        <PageHeader
          actions={
            <SearchInput
              className="w-full sm:w-72"
              placeholder={t("settings.home.searchPlaceholder", {
                  defaultValue: "Buscar un ajuste...",
                })}
              value={query}
              onChange={(v) => setQuery(v)}
            />
          }
          icon={<Settings2 />}
          subtitle={t("settings.home.heroSubtitle", {
            defaultValue:
              "Administra tu cuenta, tu empresa y cómo opera la plataforma. Elige una categoría para empezar.",
          })}
          title={t("settings.home.heroTitle", {
            defaultValue: "Configuración",
          })}
        />

        {/* Category groups */}
        <div className="space-y-9">
          {sections.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title={t("settings.noResults", {
                defaultValue: "Sin resultados",
              })}
            />
          ) : (
            sections.map((sec, idx) => {
              // La clave de traducción se generaba con `replace(/[^a-z0-9_]/g,"")`
              // DESPUÉS de pasar a minúsculas, así que borraba los acentos:
              // «NÓMINA Y ASISTENCIA» salía como `nmina_y_asistencia` y ninguna
              // traducción escrita con la clave lógica enganchaba jamás.
              const slug = sinAcentos(String(sec.label ?? ""))
                .replace(/\s+/g, "_")
                .replace(/[^a-z0-9_]/g, "");

              return (
                <FadeIn key={idx} delay={idx * 0.05}>
                  <section>
                    {sec.label ? (
                      <div className="mb-3 flex items-center gap-3">
                        <h2 className="cg-eyebrow">
                          {t(`settings.section.${slug}`, {
                            defaultValue: sec.label,
                          })}
                        </h2>
                        <div
                          className="h-px flex-1"
                          style={{ background: "var(--hairline)" }}
                        />
                      </div>
                    ) : null}

                    <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {sec.items.map((item) => {
                        const Icon = settingsIcon(item.icon);

                        return (
                          <Link
                            key={item.id}
                            className="glass-flat glass-hover cg-focus group flex h-full items-start gap-3 p-4"
                            to={item.path}
                          >
                            <IconTile size="sm">
                              <Icon />
                            </IconTile>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <h3 className="truncate text-sm font-semibold">
                                  {/* `agente` en TODAS las etiquetas del menú,
                                      aunque sólo una lo use: el catálogo decide
                                      cuáles llevan ranura, y pasar el valor sólo
                                      donde hoy hace falta obliga a acordarse el
                                      día que se añada otra — y lo que se ve
                                      cuando falta es «{{agente}}» literal. */}
                                  {t(`settings.configuracion.${item.id}`, {
                                    defaultValue: item.label,
                                    agente: agente.nombre,
                                  })}
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
                                  {/* La descripción NO pasaba por `t()`: se pintaba
                                      el literal del JSON. Con el selector
                                      ofreciendo inglés, media tarjeta quedaba
                                      traducida y la otra media en español. */}
                                  {t(`settings.configuracion.${item.id}.desc`, {
                                    defaultValue: item.desc,
                                  })}
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
