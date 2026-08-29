/**
 * ════════════════════════════════════════════════════════════════════════════
 * CENTRO DE MANDO — TELÉFONO
 * En un móvil la pregunta de un jefe de operaciones es «¿dónde está mi gente
 * AHORA?». Eso es el mapa. Así que el mapa ES la pantalla, las cifras flotan
 * encima y el resto del panel se sube con el pulgar desde abajo.
 *
 *   ┌──────────────────────┐
 *   │ [enlace en vivo] ↻ ⚙ │  barra flotante, sin banda propia
 *   │                      │
 *   │        MAPA          │  a sangre
 *   │  ┌───┐┌───┐┌───┐     │  carrusel de cifras, flotando
 *   │ ▔▔▔▔ tirador ▔▔▔▔    │
 *   │  hoja: resto del panel│
 *   └──────────────────────┘
 *
 * ── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
 * De dónde salen los datos. Esta pieza no pide nada: recibe lo que
 * `useControlCenter` ya trae (mismos endpoints, mismo sondeo, mismo SSE, mismo
 * socket de posiciones), los mismos ajustes, el mismo modo demostración y las
 * mismas rutas de `navigation.ts`. Cambia la composición, no la maquinaria.
 *
 * ── EL HILO ENTRE LA HOJA Y EL CARRUSEL ────────────────────────────────────
 * El carrusel viaja pegado al canto de la hoja, también mientras el dedo la
 * arrastra. Eso son sesenta actualizaciones por segundo, y pasarlas por el
 * estado de React volvería a renderizar el dial, el riel, las novedades y los
 * gráficos en cada una. Van por una variable CSS (`--cc-hoja`) que se escribe
 * directamente en el contenedor: el navegador recoloca una capa y React ni se
 * entera.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import {
  Boxes, LayoutDashboard, Maximize2, RefreshCw, ShieldCheck, SlidersHorizontal, Sparkles,
} from "lucide-react";
import { AlCambiar, EmptyState, GlassPanel, SkeletonCards } from "@/components/kit";
import type { ControlCenterData, Kpi } from "../types";
import type { DashboardPrefs } from "../prefs";
import { KPI_ROUTES } from "../navigation";
import { clockOf } from "../tone";
import { OperationsMap } from "./OperationsMap";
import { Panel, PanelLink, TonePill } from "./Panel";
import { CoverageGauge } from "./CoverageGauge";
import { StatRail, type RailItem } from "./StatRail";
import { ActivityStream } from "./ActivityStream";
import { TrendPanel } from "./TrendPanel";
import { SystemStatus } from "./SystemStatus";
import { StatCarousel } from "./StatCarousel";
import { BottomSheet } from "./BottomSheet";

/** Devuelve la CLAVE del saludo; el texto se traduce donde se pinta. */
function saludoKey(): { key: string; fallback: string } {
  const h = new Date().getHours();
  if (h < 12) return { key: "dashboard.greeting.morning", fallback: "Buenos días" };
  if (h < 19) return { key: "dashboard.greeting.afternoon", fallback: "Buenas tardes" };
  return { key: "dashboard.greeting.evening", fallback: "Buenas noches" };
}

export function MobileCommandCenter({
  data, prefs, demo, onDemo, onCustomize, onFullMap,
  cifras, railItems, cobertura, resumen, userName, cargando,
}: {
  data: ControlCenterData & { refresh: () => void };
  prefs: DashboardPrefs;
  demo: boolean;
  onDemo: (v: boolean) => void;
  onCustomize: () => void;
  onFullMap: () => void;
  /** Las cifras del carrusel, ya ordenadas (vitales primero). */
  cifras: Kpi[];
  railItems: RailItem[];
  cobertura: number | null;
  resumen: string;
  userName: string;
  cargando: boolean;
}) {
  const { t } = useTranslation();
  const contRef = useRef<HTMLDivElement | null>(null);
  const carruselRef = useRef<HTMLDivElement | null>(null);
  const umbralRef = useRef(320);
  const [alto, setAlto] = useState(0);

  // ── EL ALTO SE MIDE, NO SE CALCULA ────────────────────────────────────────
  // «Lo que queda desde donde empieza esta vista hasta el final de lo que se
  // ve»: `window.innerHeight - top`. Ninguna fórmula con `vh` sabe eso, porque
  // por encima puede haber barra superior, aviso de prueba o banda de puesta en
  // marcha — y porque en iOS `100vh` cuenta también la franja del navegador que
  // está TAPANDO el contenido, que es de dónde viene el clásico «la última
  // tarjeta queda debajo de la barra del teléfono».
  useLayoutEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const medir = () => {
      const arriba = el.getBoundingClientRect().top;
      const visible = window.visualViewport?.height ?? window.innerHeight;
      const h = Math.max(240, Math.round(visible - arriba));
      // Sólo si cambia de verdad: escribir el mismo alto dispararía otra vez al
      // observador y con él un bucle.
      setAlto((a) => (Math.abs(a - h) > 2 ? h : a));
    };
    medir();
    const raf = requestAnimationFrame(medir);
    // Los avisos de arriba (prueba, puesta en marcha) llegan de una consulta al
    // servidor y desplazan el inicio de esta vista cuando aparecen.
    const tardio = window.setTimeout(medir, 900);
    window.addEventListener("resize", medir);
    window.addEventListener("orientationchange", medir);
    window.visualViewport?.addEventListener("resize", medir);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(tardio);
      window.removeEventListener("resize", medir);
      window.removeEventListener("orientationchange", medir);
      window.visualViewport?.removeEventListener("resize", medir);
      ro?.disconnect();
    };
  }, []);

  // Pasada la mitad de la pantalla, la hoja ya es el contenido: el carrusel se
  // aparta en vez de quedarse flotando sobre ella.
  useEffect(() => { umbralRef.current = Math.max(220, Math.round(alto * 0.46)); }, [alto]);

  /** El puente hoja → carrusel. Estable a propósito: sólo escribe en el DOM. */
  const alMoverHoja = useCallback((px: number, arrastrando: boolean) => {
    const cont = contRef.current;
    if (cont) {
      cont.style.setProperty("--cc-hoja", `${px}px`);
      cont.classList.toggle("cc-arrastrando", arrastrando);
    }
    const car = carruselRef.current;
    if (car) car.dataset.oculto = px > umbralRef.current ? "1" : "0";
  }, []);

  const enlace = demo
    ? { tone: "brand" as const, label: t("ui.MobileCommandCenter.demostracion", "Demostración") }
    : data.health.sseConnected
    ? { tone: "ok" as const, label: "En vivo" }
    : { tone: "warn" as const, label: "Sondeo" };

  if (data.error === "no-tenant") {
    return (
      <div className="cc-root p-4">
        <GlassPanel className="p-4">
          <EmptyState
            icon={<LayoutDashboard />}
            title={t('comun.seleccionaUnNegocio')}
            description={t('comun.eligeUnNegocioParaVer')}
          />
        </GlassPanel>
      </div>
    );
  }

  return (
    <div ref={contRef} className="cc-root cc-movil" style={alto ? { height: alto } : undefined}>
      {/* ── 1. EL MAPA, A SANGRE ─────────────────────────────────────────────
          Sin el panel de cristal de escritorio y sin su HUD: en una pantalla de
          390 px el resumen flotante del mapa chocaría con el carrusel y con la
          hoja, y esas mismas cifras ya están en las tarjetas. */}
      <div className="cc-movil-mapa">
        <OperationsMap
          entities={data.entities}
          prefs={prefs}
          height={alto || 520}
          defaultCenter={data.defaultCenter}
          hud={false}
        />
      </div>

      {/* ── 2. BARRA FLOTANTE ────────────────────────────────────────────────
          Flota sobre el mapa en vez de ocupar banda propia. `pointer-events`
          en línea porque `.cg-sobre-mapa > *` (glass.css, sin capa) le pondría
          `auto` a la fila entera y se comería el arrastre del mapa. */}
      <div className="cg-sobre-mapa cc-barra-mapa">
        <div className="flex items-center gap-2" style={{ pointerEvents: "none" }}>
          {/* 44 px de alto para que la fila cuadre con los dos botones: una
              píldora más baja al lado de dos círculos táctiles se lee como un
              descuadre, no como jerarquía. */}
          <div className="cg-tarjeta-mapa pointer-events-auto flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 py-2">
            <TonePill tone={enlace.tone} pulse className="shrink-0">{enlace.label}</TonePill>
            <span className="truncate text-[11px] tabular-nums" style={{ color: "var(--ink-faint)" }}>
              {!demo && data.health.lastSync ? clockOf(data.health.lastSync) : "datos de muestra"}
            </span>
          </div>

          <button
            type="button"
            onClick={data.refresh}
            title="Actualizar"
            aria-label="Actualizar"
            className="cg-tarjeta-mapa cg-focus pointer-events-auto grid size-11 shrink-0 place-items-center"
          >
            <RefreshCw className="size-4" />
          </button>

          <button
            type="button"
            onClick={onCustomize}
            title="Personalizar"
            aria-label={t('ui.MobileCommandCenter.personalizarElPanel')}
            className="cg-tarjeta-mapa cg-focus pointer-events-auto grid size-11 shrink-0 place-items-center"
            style={{ color: "var(--brand-text)" }}
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </div>
      </div>

      {/* ── 3. CARRUSEL DE CIFRAS ────────────────────────────────────────────
          Flota cerca del canto inferior, por encima de la hoja, y viaja con
          ella (ver `--cc-hoja` arriba). */}
      <div ref={carruselRef} className="cg-sobre-mapa cc-carrusel-capa" data-oculto="0">
        <StatCarousel items={cifras.map((k) => ({ kpi: k, to: k.to ?? KPI_ROUTES[k.key] }))} />
      </div>

      {/* ── 4. LA HOJA ───────────────────────────────────────────────────────
          El resto del panel, en el mismo orden que en escritorio. */}
      <BottomSheet
        alto={alto}
        onMover={alMoverHoja}
        resumen={
          <>
            <div className="cg-eyebrow truncate">{t(saludoKey().key, saludoKey().fallback)}, {userName}</div>
            <AlCambiar clave={resumen}>
              <p className="truncate text-sm font-semibold">{resumen}</p>
            </AlCambiar>
          </>
        }
      >
        {cargando ? (
          <SkeletonCards count={4} className="grid-cols-1" />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onFullMap}
                className="cg-btn-glass cg-focus inline-flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-xs font-semibold"
              >
                <Maximize2 className="size-3.5" />
                Mapa completo
              </button>

              {/* Demostración: deja que un negocio recién creado vea el panel
                  poblado. Mismo estado y mismo `localStorage` que en escritorio. */}
              <button
                type="button"
                role="switch"
                aria-checked={demo}
                aria-label={t("ui.MobileCommandCenter.datosDeDemostracion", "Datos de demostración")}
                onClick={() => onDemo(!demo)}
                className="cg-btn-glass cg-focus inline-flex items-center gap-2 rounded-full px-3 py-2.5 text-xs font-semibold"
                style={demo ? { color: "var(--brand-text)", borderColor: "var(--brand-line)" } : undefined}
              >
                <Sparkles className="size-3.5" />
                Demo
                <span
                  className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors"
                  style={{ background: demo ? "var(--brand)" : "var(--glass-sunken)", boxShadow: "inset 0 0 0 1px var(--hairline)" }}
                >
                  <span
                    className="absolute size-3 rounded-full transition-transform"
                    style={{ background: demo ? "var(--brand-ink)" : "var(--ink-faint)", transform: demo ? "translateX(14px)" : "translateX(2px)" }}
                  />
                </span>
              </button>
            </div>

            <Panel
              icon={<ShieldCheck />}
              title={t('dashboard.coverage.title', 'Cobertura de puestos')}
              subtitle={t('comun.ahoraMismoSobreElTerreno')}
              action={<PanelLink to="/live-tracking">Ver en vivo</PanelLink>}
              bodyClassName="pt-1"
            >
              <CoverageGauge
                coverage={cobertura}
                onDuty={data.counts.onDuty ?? 0}
                stations={data.counts.stations ?? 0}
              />
            </Panel>

            <StatRail
              icon={<Boxes />}
              title={t("ui.MobileCommandCenter.recursosDeLaOperacion", "Recursos de la operación")}
              subtitle="Puestos, mando y cartera"
              items={railItems}
            />

            <ActivityStream items={data.activity} live={data.health.sseConnected} />

            <TrendPanel
              incidents={data.incidentsTrend}
              response={data.responseTrend}
              acquisition={data.acquisitionTrend}
            />

            <SystemStatus
              sseConnected={data.health.sseConnected}
              onlineDevices={data.health.onlineDevices}
              stations={data.counts.stations ?? 0}
              clients={data.counts.clients ?? 0}
              team={data.counts.team ?? 0}
            />
          </>
        )}
      </BottomSheet>
    </div>
  );
}
