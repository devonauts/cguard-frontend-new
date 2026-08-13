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
      className={`border-b border-[color:var(--hairline)] bg-transparent px-6 py-6 ${className || ""}`}
    >
      <ol className="flex flex-wrap items-center text-sm">
        {generatedItems.map((item, index) => {
          const isLast = index === generatedItems.length - 1;
          return (
            <li key={index} className="flex items-center">
              {!isLast ? (
                <Link
                  to={item.path || "#"}
                  className="cg-focus rounded-full px-1 font-medium text-[color:var(--ink-soft)] transition-colors duration-200 hover:text-[color:var(--brand-text)] motion-reduce:transition-none"
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
