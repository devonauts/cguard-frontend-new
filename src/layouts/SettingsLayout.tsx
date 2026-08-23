import { Link, useLocation } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import NAVS from "@/data/settings-nav.json";
import { settingsIcon } from "@/config/settingsIcons";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MARCO DE CADA PÁGINA DE CONFIGURACIÓN
 *
 * Antes esto era sólo una barra superior con un botón «volver». La navegación
 * lateral se había quitado porque «parecían dos sidebars», y la consecuencia
 * fue que con 27 destinos no se podía pasar de un ajuste al vecino sin volver
 * a la portada.
 *
 * El producto ya estaba pagando esa factura, y se veía en el código: había
 * DIECINUEVE tarjetas-enlace repartidas en cinco páginas de ajustes. En
 * «Guardias» había 5 ajustes y 6 enlaces. Esas rejillas eran el menú que
 * faltaba, redibujado a mano dentro de cada página.
 *
 * Lo que vuelve NO es el sidebar completo: es una columna estrecha de índice,
 * que se oculta por debajo de `lg` (donde el botón «volver» sigue siendo la
 * forma correcta de moverse) y que no repite los iconos grandes ni las
 * descripciones de la portada. Índice, no catálogo.
 * ════════════════════════════════════════════════════════════════════════════
 */

type SubItem = { id: string; label: string; path: string; icon?: string };
type Section = { id?: string; label?: string; items: SubItem[] };

export default function SettingsLayout({
  navKey: _navKey,
  title,
  children,
}: {
  navKey: "configuracion" | "suscripcion" | string;
  title: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const secciones = (NAVS as Record<string, { sections: Section[] }>).configuracion.sections;

  return (
    <div className="relative flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ── Índice lateral ─────────────────────────────────────────────────── */}
      <nav
        aria-label={t("settings.index", { defaultValue: "Índice de configuración" })}
        className="hidden w-60 shrink-0 overflow-y-auto border-r px-3 py-4 lg:block"
        style={{ borderColor: "var(--hairline)" }}
      >
        <Link
          to="/setting"
          className="cg-focus mb-4 inline-flex items-center gap-1.5 px-2 text-[13px] font-medium transition-colors"
          style={{ color: "var(--ink-soft)" }}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("settings.back", { defaultValue: "Configuración" })}
        </Link>

        {secciones.map((sec) => (
          <div key={sec.id || sec.label} className="mb-4">
            <p className="cg-eyebrow px-2 pb-1.5">{sec.id ? t(`settings.section.${sec.id}`, { defaultValue: sec.label }) : sec.label}</p>
            <ul className="space-y-0.5">
              {sec.items.map((item) => {
                // `startsWith` y no igualdad: varias páginas de ajustes tienen
                // subrutas y el índice debe seguir marcando su sección.
                const activo = pathname === item.path || pathname.startsWith(`${item.path}/`);
                const Icon = settingsIcon(item.icon);
                return (
                  <li key={item.id}>
                    <Link
                      to={item.path}
                      aria-current={activo ? "page" : undefined}
                      className="cg-focus flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors"
                      style={
                        activo
                          ? { background: "var(--brand-wash)", color: "var(--ink)", fontWeight: 600 }
                          : { color: "var(--ink-soft)" }
                      }
                    >
                      <span className="[&_svg]:size-3.5 shrink-0" style={{ color: activo ? "var(--brand-text)" : "var(--ink-faint)" }}>
                        <Icon />
                      </span>
                      <span className="truncate">
                        {t(`settings.configuracion.${item.id}`, { defaultValue: item.label })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Contenido ──────────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* En pantallas anchas el índice ya dice dónde estás, así que la barra
            superior sólo lleva el título. Por debajo de `lg` recupera el botón
            de volver, que ahí sí es la única salida. */}
        <div className="sticky top-0 z-10" style={{ background: "var(--glass-solid)" }}>
          <div
            className="flex h-12 items-center gap-2 border-b px-4"
            style={{ borderColor: "var(--hairline)" }}
          >
            <Link
              to="/setting"
              className="cg-focus -ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors lg:hidden"
              style={{ color: "var(--ink-soft)" }}
              aria-label={t("settings.backToSettings", { defaultValue: "Volver a Configuración" })}
            >
              <ArrowLeft className="h-4 w-4" />
              {t("settings.back", { defaultValue: "Configuración" })}
            </Link>
            <span className="select-none lg:hidden" style={{ color: "var(--hairline)" }} aria-hidden="true">/</span>
            <div className="truncate text-[15px] font-medium">{title}</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
