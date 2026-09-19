import React from "react";
import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

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

  // Si no se pasan items, generamos a partir de la URL actual
  const paths = location.pathname.split("/").filter(Boolean);
  const generatedItems =
    items ||
    paths.map((segment, index) => ({
      label: segment.charAt(0).toUpperCase() + segment.slice(1),
      path: "/" + paths.slice(0, index + 1).join("/"),
    }));

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
              {!isLast ? (
                <Link
                  className="cg-focus rounded-full px-1 font-medium text-[color:var(--ink-soft)] transition-colors duration-200 hover:text-[color:var(--brand-text)] motion-reduce:transition-none"
                  to={item.path || "#"}
                >
                  {item.label}
                </Link>
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
