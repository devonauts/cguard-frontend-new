import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";

// Es un componente de CLASE: los hooks no valen aquí, así que el traductor
// entra por la instancia de i18next, siempre dentro de render (nunca en el
// cuerpo del módulo, donde se congelaría en el idioma de arranque).
import i18n from "@/i18n";

/**
 * Red de seguridad de toda la aplicación.
 *
 * POR QUÉ EXISTE. Hasta ahora el único error boundary del CRM estaba dentro del
 * Centro de Control, así que un error de render en cualquier otra pantalla no
 * degradaba esa pantalla: **desmontaba el árbol entero y dejaba la ventana en
 * blanco**. Sin barra lateral, sin mensaje, sin forma de volver — sólo F5, y
 * volvía a caer al reentrar.
 *
 * El caso que lo motivó: la pestaña de Incidentes de una estación renderizaba un
 * objeto de asociación como texto (React #31). Un dato mal leído en una celda de
 * una tabla dejaba inutilizable el producto completo.
 *
 * QUÉ HACE Y QUÉ NO. Contiene el fallo y ofrece dos salidas: reintentar sin
 * recargar (remonta el subárbol, suficiente si el error fue transitorio) o
 * volver atrás. NO arregla la causa — el error sigue existiendo y se registra en
 * consola. Es la diferencia entre "esta sección falló" y "la aplicación murió".
 *
 * Los boundaries de React sólo capturan errores de RENDER. Un rechazo de promesa
 * en un manejador de eventos o en un efecto no pasa por aquí; eso lo cubre el
 * interceptor de errores del cliente HTTP.
 */
interface Props {
  children: ReactNode;
  /** Etiqueta para el log, útil cuando se anida en una sección concreta. */
  scope?: string;
}

interface State {
  error: Error | null;
  /** Fuerza el remonte del subárbol al reintentar. */
  resetKey: number;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // El stack de componentes es lo que dice QUÉ pantalla cayó; sin él, un
    // "Objects are not valid as a React child" no señala a ningún archivo.
    console.error(
      `[AppErrorBoundary${this.props.scope ? ` · ${this.props.scope}` : ""}]`,
      error,
      info?.componentStack,
    );
  }

  private retry = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    const { error } = this.state;

    if (!error) {
      return <div key={this.state.resetKey}>{this.props.children}</div>;
    }

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="size-6 text-red-500" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            {i18n.t(
              "ui.AppErrorBoundary.estaSeccionNoSePudoMostrar",
              "Esta sección no se pudo mostrar",
            )}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {i18n.t(
              "ui.AppErrorBoundary.elRestoDeLaPlataformaSigueFuncionando",
              "El resto de la plataforma sigue funcionando. Puedes reintentar o volver a la pantalla anterior.",
            )}
          </p>
          {/* El mensaje técnico se muestra pero sin protagonismo: le sirve a quien
              reporta el problema y no le dice nada a quien sólo quiere seguir. */}
          <p className="mt-3 break-words rounded-lg bg-muted/40 px-3 py-2 text-left font-mono text-xs text-muted-foreground">
            {error.message ||
              i18n.t(
                "ui.AppErrorBoundary.errorDeRenderizado",
                "Error de renderizado",
              )}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              onClick={this.retry}
            >
              <RotateCcw className="size-4" />{" "}
              {i18n.t("ui.AppErrorBoundary.reintentar", "Reintentar")}
            </button>
            <button
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/50"
              onClick={() => window.history.back()}
            >
              <ArrowLeft className="size-4" />{" "}
              {i18n.t("ui.AppErrorBoundary.volver", "Volver")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
