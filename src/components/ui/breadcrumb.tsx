import React from "react";
import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { migaDeRuta } from "@/lib/migaDeRuta";

interface BreadcrumbItem {
  label: string;
  path?: string;
}

interface BreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className }) => {
  const location = useLocation();
  const { t } = useTranslation();

  /* Sin `items`, la miga sale del MENÚ — ver `migaDeRuta`. Antes se fabricaba
     capitalizando los trozos de la URL, que es como el inquilino acababa
     leyendo «Back-office» o «Post-sites»: nombres de carpeta, no de pantallas.
     Ver la regla de la casa sobre la jerga en el texto que ve el inquilino. */
  const derivados = React.useMemo(
    () =>
      migaDeRuta(location.pathname).map((m) => ({
        label:
          m.claves.reduce(
            (hallado, clave) =>
              hallado || (t(clave, { defaultValue: "" }) as string),
            "",
          ) || m.respaldo,
        path: m.path,
      })),
    [location.pathname, t],
  );
  const generatedItems = items || derivados;

  // Una sola miga es la página donde ya estamos: no dice nada que el
  // encabezado no diga, y ocupa una franja entera del teléfono.
  if (generatedItems.length < 2) return null;

  return (
    /* Fondo transparente: la miga va SOBRE el lienzo de la app y deja ver los
       halos del acento. Con `bg-background` se recortaba una banda opaca en
       medio del cristal. */
    <nav
      /* El relleno de 24 px hacía que una miga de una línea midiera 93 px de
         alto: en un teléfono es la décima parte de la pantalla para repetir
         dónde estamos, justo encima del encabezado que lo dice otra vez. */
      className={`border-b border-[color:var(--hairline)] bg-transparent px-4 py-3 sm:px-6 sm:py-6 ${className || ""}`}
    >
      <ol className="flex flex-wrap items-center text-sm">
        {generatedItems.map((item, index) => {
          const isLast = index === generatedItems.length - 1;

          return (
            <li key={index} className="flex items-center">
              {/* Enlace SÓLO si hay a dónde ir. «Programador» o «Nómina» son
                  desplegables del menú, no pantallas: con `to="#"` React Router
                  lo resolvía contra la ruta actual y el enlace recargaba la
                  misma página. Un enlace que no lleva a ninguna parte es peor
                  que un texto. */}
              {!isLast && item.path ? (
                <Link
                  className="cg-focus rounded-full px-1 font-medium text-[color:var(--ink-soft)] transition-colors duration-200 hover:text-[color:var(--brand-text)] motion-reduce:transition-none"
                  to={item.path}
                >
                  {item.label}
                </Link>
              ) : !isLast ? (
                <span className="px-1 font-medium text-[color:var(--ink-soft)]">
                  {item.label}
                </span>
              ) : (
                <span className="px-1 font-semibold text-[color:var(--ink)]">
                  {item.label}
                </span>
              )}

              {!isLast && (
                <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--ink-faint)]" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
