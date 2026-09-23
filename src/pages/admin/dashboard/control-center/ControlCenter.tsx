/**
 * ════════════════════════════════════════════════════════════════════════════
 * CENTRO DE MANDO
 * El tablero de la operación de seguridad: quién está en servicio, qué puestos
 * están cubiertos, qué acaba de pasar y dónde está cada uno.
 *
 * ── CÓMO ESTÁ ARMADO ───────────────────────────────────────────────────────
 * 1. CABECERA DE MANDO — quién está al mando y si el enlace en vivo está sano.
 *    Si esa línea miente, todo lo de abajo miente; por eso va primero.
 * 2. SIGNOS VITALES — cuatro cifras enormes. Son las cuatro preguntas que un
 *    jefe de operaciones hace al llegar, en ese orden: ¿cuánta gente tengo?,
 *    ¿están los puestos cubiertos?, ¿hay algo abierto?, ¿se están haciendo las
 *    rondas?
 * 3. REJILLA ASIMÉTRICA — el mapa manda (8 de 12 columnas) porque es lo único
 *    que se mira en continuo; a su lado, el dial de cobertura y el riel de
 *    recursos. Debajo, tendencia y parte de novedades repartidos 7/5.
 * 4. BANDA DE ESTADO — el pie: enlace, equipos, tamaño de la operación.
 *
 * ── EN UN TELÉFONO ES OTRA COSA ────────────────────────────────────────────
 * Por debajo de `md` manda `MobileCommandCenter`: el mapa a sangre, las cifras
 * flotando encima en un carrusel y el resto en una hoja que se sube con el
 * pulgar. La rejilla de arriba no cabe en 390 px sin convertirse en una lista
 * larguísima con el mapa perdido en medio. Los datos son EXACTAMENTE los mismos
 * —este archivo los calcula una vez y los reparte—; lo que cambia es la
 * composición.
 *
 * ── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
 * Los datos. `useControlCenter` sigue siendo la única fuente (mismos endpoints,
 * mismo sondeo, mismo SSE, mismo socket de posiciones) y `navigation.ts` sigue
 * decidiendo a dónde lleva cada tarjeta. Esto es una cara nueva sobre la misma
 * maquinaria.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  EmptyState,
  GlassPanel,
  SkeletonCards,
  Stagger,
} from "@/components/kit";

import "./control-center.css";
import type { Kpi } from "./types";

import {
  User,
  Shield,
  UserCog,
  AlertTriangle,
  Building2,
  Timer,
  Route,
  ShieldCheck,
  LayoutDashboard,
  Boxes,
  type LucideIcon,
} from "lucide-react";

import { KPI_ROUTES } from "./navigation";
import {
  loadPrefs,
  savePrefs,
  hidratarDesdeLaCuenta,
  type DashboardPrefs,
} from "./prefs";
import { useDemoData } from "./demoData";
import { useControlCenter } from "./useControlCenter";
import { CommandBar } from "./components/CommandBar";
import { MetricHero } from "./components/MetricHero";
import { MapPanel } from "./components/MapPanel";
import { Panel, PanelLink } from "./components/Panel";
import { CoverageGauge } from "./components/CoverageGauge";
import { StatRail, type RailItem } from "./components/StatRail";
import { TrendPanel } from "./components/TrendPanel";
import { ActivityStream } from "./components/ActivityStream";
import { SystemStatus } from "./components/SystemStatus";
import { CustomizePanel } from "./components/CustomizePanel";
import { DashboardErrorBoundary } from "./components/ErrorBoundary";
import { MobileCommandCenter } from "./components/MobileCommandCenter";
import { useEsMovil } from "./useMovil";

import { useAuth } from "@/contexts/AuthContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import AppLayout from "@/layouts/app-layout";
import { useSucursales } from "@/hooks/useSucursales";
import { CarruselDeSucursales } from "./sucursales/CarruselDeSucursales";
import { InvitacionADividir } from "./sucursales/InvitacionADividir";

const KPI_ICON: Record<string, LucideIcon> = {
  onDuty: User,
  stations: Shield,
  supervisors: UserCog,
  openIncidents: AlertTriangle,
  clients: Building2,
  response: Timer,
  patrolsToday: Route,
  coverage: ShieldCheck,
};

/** Signos vitales, en el orden en que se preguntan. */
const VITALES = [
  "onDuty",
  "coverage",
  "openIncidents",
  "patrolsToday",
] as const;
/** Recursos — se consultan, no se vigilan. */
const RECURSOS = ["stations", "supervisors", "response", "clients"] as const;

function nombreDe(
  user?: { firstName?: string; lastName?: string; email?: string } | null,
): string {
  const nombre = user?.firstName?.trim();

  if (nombre) return nombre;
  const apellido = user?.lastName?.trim();

  if (apellido) return apellido;
  const correo = user?.email || "";

  return correo.split("@")[0] || "operador";
}

export default function ControlCenter() {
  const { t } = useTranslation();

  usePageTitle(t("dashboard.pageTitle"));
  const { user } = useAuth();
  const esMovil = useEsMovil();
  // Se pinta con la caché del navegador y, en cuanto responde la cuenta, manda
  // lo guardado ahí: así el tablero se ve igual desde cualquier computadora.
  const [prefs, setPrefs] = useState<DashboardPrefs>(() => loadPrefs());

  useEffect(() => {
    let vivo = true;

    void hidratarDesdeLaCuenta().then((deLaCuenta) => {
      if (vivo && deLaCuenta) setPrefs(deLaCuenta);
    });

    return () => {
      vivo = false;
    };
  }, []);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [demo, setDemo] = useState<boolean>(() => {
    try {
      return localStorage.getItem("cc_demo") === "1";
    } catch {
      return false;
    }
  });
  const toggleDemo = (v: boolean) => {
    setDemo(v);
    try {
      localStorage.setItem("cc_demo", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const live = useControlCenter(
    prefs.liveTracking ? prefs.locationIntervalSec : 3600,
  );
  const demoData = useDemoData(demo);
  // En modo demo se muestra la muestra poblada para que un negocio nuevo pueda
  // ver el panel en operación. El refresco sigue siendo el real.
  const data = demo ? { ...demoData, refresh: live.refresh } : live;

  // Módulo SUCURSALES: con la operación dividida, el mapa general deja paso al
  // carrusel de sucursales. Sin el módulo no se pide nada y todo sigue igual.
  const suc = useSucursales();
  const divididas = suc.activo ? suc.lista.data?.sucursales.length ?? 0 : 0;
  const invitarADividir = suc.activo && suc.lista.isSuccess && divididas === 0;

  const openFullMap = () =>
    window.open(
      `${window.location.origin}/dashboard/operations-map`,
      "_blank",
      "noopener,noreferrer",
    );

  // Reparto de los KPIs por papel. Lo que el hook devuelva y no esté en ninguna
  // de las dos listas se añade al riel: así una métrica nueva del backend
  // aparece sola en vez de desaparecer sin que nadie se entere.
  const { vitales, recursos, cobertura } = useMemo(() => {
    const porClave = new Map(data.kpis.map((k) => [k.key, k]));
    const usadas = new Set<string>([...VITALES, ...RECURSOS]);
    const v = VITALES.map((k) => porClave.get(k)).filter(Boolean) as Kpi[];
    const r = [
      ...(RECURSOS.map((k) => porClave.get(k)).filter(Boolean) as Kpi[]),
      ...data.kpis.filter((k) => !usadas.has(k.key)),
    ];
    const cob = porClave.get("coverage");

    return {
      vitales: v,
      recursos: r,
      cobertura: typeof cob?.value === "number" ? cob.value : null,
    };
  }, [data.kpis]);

  const c = data.counts;
  const resumen = [
    t("dashboard.sub.onDuty", { count: c.onDuty ?? 0 }),
    t("dashboard.sub.stations", { count: c.stations ?? 0 }),
    t("dashboard.sub.incidents", { count: c.openIncidents ?? 0 }),
  ].join(" · ");

  const railItems: RailItem[] = recursos.map((k) => ({
    kpi: k,
    icon: KPI_ICON[k.key],
    to: k.to ?? KPI_ROUTES[k.key],
  }));
  const cargando = data.loading && data.kpis.length === 0;

  // Teléfono: el mapa es la pantalla. Se decide con una consulta de medios en
  // JavaScript y no con clases `md:` porque pintar las dos composiciones a la
  // vez montaría dos mapas de Google para enseñar uno.
  if (esMovil) {
    return (
      <AppLayout>
        <DashboardErrorBoundary>
          <MobileCommandCenter
            cargando={cargando}
            cifras={[...vitales, ...recursos]}
            cobertura={cobertura}
            data={data}
            demo={demo}
            prefs={prefs}
            railItems={railItems}
            resumen={resumen}
            sucursales={
              divididas > 0 && suc.lista.data
                ? { lista: suc.lista.data, resumen: suc.resumen.data }
                : undefined
            }
            userName={nombreDe(user)}
            onCustomize={() => setCustomizeOpen(true)}
            onDemo={toggleDemo}
            onFullMap={openFullMap}
          />
          <CustomizePanel
            open={customizeOpen}
            value={prefs}
            onClose={() => setCustomizeOpen(false)}
            onSave={(p) => {
              setPrefs(p);
              savePrefs(p);
              setCustomizeOpen(false);
            }}
          />
        </DashboardErrorBoundary>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <DashboardErrorBoundary>
        <div className="cc-root cmd-shell mx-auto w-full max-w-[1680px] space-y-5 p-4 pb-16 sm:p-6">
          <CommandBar
            demo={demo}
            lastSync={data.health.lastSync}
            resumen={resumen}
            sseConnected={data.health.sseConnected}
            userName={nombreDe(user)}
            onCustomize={() => setCustomizeOpen(true)}
            onDemo={toggleDemo}
            onFullMap={openFullMap}
            onRefresh={data.refresh}
          />

          {data.error === "no-tenant" ? (
            <GlassPanel className="p-4">
              <EmptyState
                description={t("comun.eligeUnNegocioParaVer")}
                icon={<LayoutDashboard />}
                title={t("comun.seleccionaUnNegocio")}
              />
            </GlassPanel>
          ) : cargando ? (
            <SkeletonCards className="lg:grid-cols-4" count={4} />
          ) : (
            <>
              {/* ── 1. SIGNOS VITALES ─────────────────────────────────────── */}
              <Stagger
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                gap={0.05}
              >
                {vitales.map((k) => (
                  <MetricHero
                    key={k.key}
                    icon={KPI_ICON[k.key]}
                    kpi={k}
                    to={k.to ?? KPI_ROUTES[k.key]}
                  />
                ))}
              </Stagger>

              {invitarADividir && <InvitacionADividir />}

              {/* ── 2. MAPA (o SUCURSALES) + DIAL + RIEL ───────────────────── */}
              <div className="grid gap-5 xl:grid-cols-12">
                {divididas > 0 && suc.lista.data ? (
                  <CarruselDeSucursales
                    className="xl:col-span-8"
                    defaultCenter={data.defaultCenter}
                    entities={data.entities}
                    lista={suc.lista.data}
                    live={data.health.sseConnected}
                    prefs={prefs}
                    resumen={suc.resumen.data}
                  />
                ) : (
                  <MapPanel
                    className="xl:col-span-8"
                    defaultCenter={data.defaultCenter}
                    entities={data.entities}
                    live={data.health.sseConnected}
                    prefs={prefs}
                    onFull={openFullMap}
                  />
                )}

                <div className="flex flex-col gap-5 xl:col-span-4">
                  <Panel
                    action={
                      <PanelLink to="/live-tracking">
                        {t("dashboard.viewLive")}
                      </PanelLink>
                    }
                    bodyClassName="pt-1"
                    icon={<ShieldCheck />}
                    subtitle={t("comun.ahoraMismoSobreElTerreno")}
                    title={t("dashboard.coverage.title")}
                  >
                    <CoverageGauge
                      coverage={cobertura}
                      stations={c.stations ?? 0}
                      onDuty={c.onDuty ?? 0}
                    />
                  </Panel>

                  <StatRail
                    icon={<Boxes />}
                    items={railItems}
                    subtitle={t("dashboard.resources.sub")}
                    title={t(
                      "ui.ControlCenter.recursosDeLaOperacion",
                      "Recursos de la operación",
                    )}
                  />
                </div>
              </div>

              {/* ── 3. TENDENCIA + NOVEDADES ──────────────────────────────── */}
              <div className="grid gap-5 xl:grid-cols-12">
                <TrendPanel
                  acquisition={data.acquisitionTrend}
                  className="xl:col-span-7"
                  incidents={data.incidentsTrend}
                  response={data.responseTrend}
                />
                <ActivityStream
                  className="xl:col-span-5"
                  items={data.activity}
                  live={data.health.sseConnected}
                />
              </div>

              {/* ── 4. BANDA DE ESTADO ────────────────────────────────────── */}
              <SystemStatus
                clients={c.clients ?? 0}
                onlineDevices={data.health.onlineDevices}
                sseConnected={data.health.sseConnected}
                stations={c.stations ?? 0}
                team={c.team ?? 0}
              />
            </>
          )}
        </div>

        <CustomizePanel
          open={customizeOpen}
          value={prefs}
          onClose={() => setCustomizeOpen(false)}
          onSave={(p) => {
            setPrefs(p);
            savePrefs(p);
            setCustomizeOpen(false);
          }}
        />
      </DashboardErrorBoundary>
    </AppLayout>
  );
}
