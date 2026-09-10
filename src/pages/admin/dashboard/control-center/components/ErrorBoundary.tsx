import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { IconTile } from "@/components/kit";
import i18n from "@/i18n";

/** Evita que un error de render deje la página en blanco: muestra el motivo y
 *  una salida. El cristal es el mismo del sistema, así que el fallo no parece
 *  una pantalla de otra aplicación. */
export class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[ControlCenter] render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="glass m-6 flex flex-col items-center p-8 text-center">
          <IconTile className="mb-4" size="lg" tone="bad">
            <AlertTriangle />
          </IconTile>
          <p className="font-display text-base font-semibold">
            {i18n.t(
              "controlCenter.errorBoundary.title",
              "No se pudo cargar el centro de mando",
            )}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
            {this.state.error.message}
          </p>
          <button
            className="cg-btn-brand cg-focus mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
            onClick={() => location.reload()}
          >
            <RotateCcw className="size-4" /> Reintentar
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
