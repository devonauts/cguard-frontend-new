import { useEffect, useMemo, useState } from "react";
import { Maximize, X, Radio } from "lucide-react";

import { useControlCenter } from "./useControlCenter";
import { useDemoData } from "./demoData";
import { loadPrefs } from "./prefs";
import { OperationsMap } from "./components/OperationsMap";

import { StatusBadge } from "@/components/kit";
import { tituloConMarca } from "@/hooks/usePageTitle";
import "./control-center.css";

/**
 * Full-screen "Operaciones en tiempo real" — opened in its own tab from the
 * dashboard. Reuses the same live data hook (and demo mode) as the panel, and
 * renders the operations map filling the whole viewport.
 */
export default function OperationsMapFull() {
  const prefs = useMemo(() => loadPrefs(), []);
  const demo = useMemo(() => {
    try {
      return localStorage.getItem("cc_demo") === "1";
    } catch {
      return false;
    }
  }, []);

  const live = useControlCenter(
    prefs.liveTracking ? prefs.locationIntervalSec : 3600,
  );
  const demoData = useDemoData(demo);
  const data = demo ? demoData : live;

  const [h, setH] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800,
  );

  useEffect(() => {
    // Signed with THIS host's product name, never ours on a partner's host.
    document.title = tituloConMarca("Operaciones en tiempo real");
    const onResize = () => setH(window.innerHeight);

    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, []);

  const goFullscreen = () => {
    try {
      const el = document.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => void;
      };

      if (document.fullscreenElement) document.exitFullscreen?.();
      else (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="cc-root relative"
      style={{
        ["--cc-accent" as any]: prefs.accent,
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      {/* ── Barra flotante ──────────────────────────────────────────────────
          Antes era tinta blanca sobre un azul-negro escrito a mano: se veía
          igual en claro que en oscuro e ignoraba el acento. Ahora es una barra
          de CRISTAL del sistema flotando sobre el mapa, así que hereda el tema
          y el acento sin escribir dos versiones. Va como panel elevado —y no
          como degradado a sangre— porque sobre un mapa satélite claro un velo
          oscuro tapa la imagen sin llegar a dar contraste. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-3 p-3">
        <div className="glass-raised pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <span className="font-display flex items-center gap-2 text-sm font-semibold">
            {/* Verde semántico fijo: «esto está vivo» no cambia con el acento. */}
            <Radio className="size-4" style={{ color: "var(--ok-text)" }} />
            Operaciones en tiempo real
          </span>
          {demo && (
            <StatusBadge dot={false} tone="brand">
              Demo
            </StatusBadge>
          )}
          <span
            className="hidden h-5 w-px sm:block"
            style={{ background: "var(--hairline)" }}
          />
          <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {data.entities.length} elementos · filtros y leyenda sobre el mapa
          </span>
          {/* ── SIN LEYENDA AQUÍ ───────────────────────────────────────────────
              Había una con un punto de color por tipo sacado de «Personalizar».
              Mentía: sobre el mapa, un puesto se pinta por su COBERTURA (verde /
              ámbar / rojo / apagado), no con el color de fábrica de su tipo, así
              que la fila de puntos decía un color y el mapa enseñaba otro. La
              leyenda buena —la semántica— la dibuja el propio mapa abajo a la
              izquierda, y el riel de capas de la izquierda da el filtro. */}
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            aria-label="Pantalla completa"
            className="cg-btn-glass cg-focus grid size-9 place-items-center rounded-full transition active:scale-95"
            title="Pantalla completa"
            onClick={goFullscreen}
          >
            <Maximize className="size-4" />
          </button>
          <button
            aria-label="Cerrar"
            className="cg-btn-glass cg-focus grid size-9 place-items-center rounded-full transition active:scale-95"
            title="Cerrar"
            onClick={() => window.close()}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <OperationsMap
        defaultCenter={data.defaultCenter}
        entities={data.entities}
        height={h}
        prefs={prefs}
      />
    </div>
  );
}
