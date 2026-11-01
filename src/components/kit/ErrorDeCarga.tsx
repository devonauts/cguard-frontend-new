import { AlertTriangle, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { EmptyState } from "./index";

/**
 * A list that did not load says so — with a way to try again. Before, a
 * failed request left the list empty and the page read «No hay…» or «Todo al
 * día», which is the one thing it must never say when it does not know.
 */
export function ErrorDeCarga({
  onRetry,
  detalle,
  variant = "boxed",
  className,
}: {
  onRetry?: () => void;
  /** The server's message, when there is one worth showing. */
  detalle?: string | null;
  variant?: "boxed" | "inline";
  className?: string;
}) {
  const { t } = useTranslation();

  return (
    <div role="alert" className={className}>
      <EmptyState
        variant={variant}
        icon={<AlertTriangle size={20} style={{ color: "var(--warn-text)" }} />}
        title={t("ui.ErrorDeCarga.titulo", "No se pudo cargar")}
        description={
          detalle ||
          t(
            "ui.ErrorDeCarga.descripcion",
            "Lo que ves puede estar incompleto. Revisa la conexión e inténtalo de nuevo.",
          )
        }
        action={
          onRetry ? (
            <button type="button" className="cg-btn-ghost cg-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold" onClick={onRetry}>
              <RotateCw size={14} /> {t("ui.ErrorDeCarga.reintentar", "Reintentar")}
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

/**
 * «Mostrando 200 de 1.240» — for the few places that keep a hard cap on
 * purpose. Renders nothing when everything is shown.
 */
export function AvisoDeTope({ mostrados, total, pista }: { mostrados: number; total: number; pista?: string }) {
  const { t, i18n } = useTranslation();

  if (!(total > mostrados)) return null;
  const n = (x: number) => x.toLocaleString(i18n.language || "es");

  return (
    <p className="text-xs" style={{ color: "var(--warn-text)" }} role="status">
      {t("ui.ErrorDeCarga.mostrandoDe", "Mostrando {{mostrados}} de {{total}}", { mostrados: n(mostrados), total: n(total) })}
      {pista ? ` — ${pista}` : ""}
    </p>
  );
}
