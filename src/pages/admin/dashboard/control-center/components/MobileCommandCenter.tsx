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
 * socket de posiciones), los mismos ajustes y las
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
import type { ControlCenterData, Kpi } from "../types";
import type { DashboardPrefs } from "../prefs";

import {
  Boxes,
  LayoutDashboard,
  Maximize2,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { KPI_ROUTES } from "../navigation";
import { clockOf } from "../tone";
import {
  PastillasDeSucursal,
  useFocoDeSucursal,
  type SucursalesParaMovil,
} from "../sucursales/SucursalesMovil";

import { OperationsMap } from "./OperationsMap";
import { Panel, PanelLink, TonePill } from "./Panel";
import { CoverageGauge } from "./CoverageGauge";
import { StatRail, type RailItem } from "./StatRail";
import { ActivityStream } from "./ActivityStream";
import { TrendPanel } from "./TrendPanel";
import { SystemStatus } from "./SystemStatus";
import { StatCarousel } from "./StatCarousel";
import { BottomSheet } from "./BottomSheet";

import {
  AlCambiar,
  EmptyState,
  GlassPanel,
  SkeletonCards,
} from "@/components/kit";

/** Devuelve la CLAVE del saludo; el texto se traduce donde se pinta. */
function saludoKey(): { key: string; fallback: string } {
  const h = new Date().getHours();

  if (h < 12)
    return { key: "dashboard.greeting.morning", fallback: "Buenos días" };
  if (h < 19)
    return { key: "dashboard.greeting.afternoon", fallback: "Buenas tardes" };

  return { key: "dashboard.greeting.evening", fallback: "Buenas noches" };
}

export function MobileCommandCenter({
  data,
  prefs,
  onCustomize,
  onFullMap,
  cifras,
  railItems,
  cobertura,
  resumen,
  userName,
  cargando,
  sucursales,
}: {
  data: ControlCenterData & { refresh: () => void };
  prefs: DashboardPrefs;
  onCustomize: () => void;
  onFullMap: () => void;
  /** Las cifras del carrusel, ya ordenadas (vitales primero). */
  cifras: Kpi[];
  railItems: RailItem[];
  cobertura: number | null;
  resumen: string;
  userName: string;
  cargando: boolean;
  /** Módulo Sucursales con la operación dividida: el mapa se centra en una. */
  sucursales?: SucursalesParaMovil;
}) {
  const { t } = useTranslation();
  const foco = useFocoDeSucursal(
    sucursales,
    data.entities,
    t("sucursales.sinSucursal"),
    t("sucursales.espacio.global"),
  );
  const enFoco = foco.actual;
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
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;

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
  useEffect(() => {
    umbralRef.current = Math.max(220, Math.round(alto * 0.46));
  }, [alto]);

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

  const enlace = data.health.sseConnected
    ? { tone: "ok" as const, label: t("dashboard.live", "En vivo") }
    : {
        tone: "warn" as const,
        label: t("ui.MobileCommandCenter.sondeo", "Sondeo"),
      };

  if (data.error === "no-tenant") {
    return (
      <div className="cc-root p-4">
        <GlassPanel className="p-4">
          <EmptyState
            description={t("comun.eligeUnNegocioParaVer")}
            icon={<LayoutDashboard />}
            title={t("comun.seleccionaUnNegocio")}
          />
        </GlassPanel>
      </div>
    );
  }

  return (
    <div
      ref={contRef}
      className="cc-root cc-movil"
      style={alto ? { height: alto } : undefined}
    >
      {/* ── 1. EL MAPA, A SANGRE ─────────────────────────────────────────────
          Sin el panel de cristal de escritorio y sin su HUD: en una pantalla de
          390 px el resumen flotante del mapa chocaría con el carrusel y con la
          hoja, y esas mismas cifras ya están en las tarjetas. */}
      <div className="cc-movil-mapa">
        {/* UN mapa que viaja: todo pintado, y la cámara va a la parada elegida. */}
        <OperationsMap
          defaultCenter={data.defaultCenter}
          encuadre={
            enFoco?.puntos?.length
              ? { clave: enFoco.clave, puntos: enFoco.puntos }
              : null
          }
          entities={data.entities}
          height={alto || 520}
          hud={false}
          prefs={prefs}
        />
      </div>

      {/* ── 2. BARRA FLOTANTE ────────────────────────────────────────────────
          Flota sobre el mapa en vez de ocupar banda propia. `pointer-events`
          en línea porque `.cg-sobre-mapa > *` (glass.css, sin capa) le pondría
          `auto` a la fila entera y se comería el arrastre del mapa. */}
      <div className="cg-sobre-mapa cc-barra-mapa">
        <div
          className="flex items-center gap-2"
          style={{ pointerEvents: "none" }}
        >
          {/* 44 px de alto para que la fila cuadre con los dos botones: una
              píldora más baja al lado de dos círculos táctiles se lee como un
              descuadre, no como jerarquía. */}
          <div className="cg-tarjeta-mapa pointer-events-auto flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3 py-2">
            <TonePill pulse className="shrink-0" tone={enlace.tone}>
              {enlace.label}
            </TonePill>
            <span
              className="truncate text-[11px] tabular-nums"
              style={{ color: "var(--ink-faint)" }}
            >
              {data.health.lastSync ? clockOf(data.health.lastSync) : ""}
            </span>
          </div>

          <button
            aria-label={t("dashboard.refresh", "Actualizar")}
            className="cg-tarjeta-mapa cg-focus pointer-events-auto grid size-11 shrink-0 place-items-center"
            title={t("dashboard.refresh", "Actualizar")}
            type="button"
            onClick={data.refresh}
          >
            <RefreshCw className="size-4" />
          </button>

          <button
            aria-label={t("ui.MobileCommandCenter.personalizarElPanel")}
            className="cg-tarjeta-mapa cg-focus pointer-events-auto grid size-11 shrink-0 place-items-center"
            style={{ color: "var(--brand-text)" }}
            title={t("dashboard.customize", "Personalizar")}
            type="button"
            onClick={onCustomize}
          >
            <SlidersHorizontal className="size-4" />
          </button>
        </div>

        {/* Módulo Sucursales: el mapa se centra en la sucursal elegida. */}
        <div className="mt-2">
          <PastillasDeSucursal
            actual={foco.actual}
            pastillas={foco.pastillas}
            onElegir={foco.elegir}
          />
        </div>
      </div>

      {/* ── 3. CARRUSEL DE CIFRAS ────────────────────────────────────────────
          Flota cerca del canto inferior, por encima de la hoja, y viaja con
          ella (ver `--cc-hoja` arriba). */}
      <div
        ref={carruselRef}
        className="cg-sobre-mapa cc-carrusel-capa"
        data-oculto="0"
      >
        <StatCarousel
          items={cifras.map((k) => ({ kpi: k, to: k.to ?? KPI_ROUTES[k.key] }))}
        />
      </div>

      {/* ── 4. LA HOJA ───────────────────────────────────────────────────────
          El resto del panel, en el mismo orden que en escritorio. */}
      <BottomSheet
        alto={alto}
        resumen={
          <>
            <div className="cg-eyebrow truncate">
              {t(saludoKey().key, saludoKey().fallback)}, {userName}
            </div>
            <AlCambiar clave={resumen}>
              <p className="truncate text-sm font-semibold">{resumen}</p>
            </AlCambiar>
          </>
        }
        onMover={alMoverHoja}
      >
        {cargando ? (
          <SkeletonCards className="grid-cols-1" count={4} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                className="cg-btn-glass cg-focus inline-flex flex-1 items-center justify-center gap-2 rounded-full px-3 py-2.5 text-xs font-semibold"
                type="button"
                onClick={onFullMap}
              >
                <Maximize2 className="size-3.5" />
                {t("dashboard.fullMap", "Mapa completo")}
              </button>
            </div>

            <Panel
              action={
                <PanelLink to="/live-tracking">
                  {t("dashboard.viewLive", "Ver en vivo")}
                </PanelLink>
              }
              bodyClassName="pt-1"
              icon={<ShieldCheck />}
              subtitle={t("comun.ahoraMismoSobreElTerreno")}
              title={t("dashboard.coverage.title", "Cobertura de puestos")}
            >
              <CoverageGauge
                coverage={cobertura}
                stations={data.counts.stations ?? 0}
                onDuty={data.counts.onDuty ?? 0}
              />
            </Panel>

            <StatRail
              icon={<Boxes />}
              items={railItems}
              subtitle={t(
                "dashboard.resources.sub",
                "Puestos, mando y cartera",
              )}
              title={t(
                "ui.MobileCommandCenter.recursosDeLaOperacion",
                "Recursos de la operación",
              )}
            />

            <ActivityStream
              items={data.activity}
              live={data.health.sseConnected}
            />

            <TrendPanel
              acquisition={data.acquisitionTrend}
              incidents={data.incidentsTrend}
              response={data.responseTrend}
            />

            <SystemStatus
              clients={data.counts.clients ?? 0}
              onlineDevices={data.health.onlineDevices}
              sseConnected={data.health.sseConnected}
              stations={data.counts.stations ?? 0}
              team={data.counts.team ?? 0}
            />
          </>
        )}
      </BottomSheet>
    </div>
  );
}
