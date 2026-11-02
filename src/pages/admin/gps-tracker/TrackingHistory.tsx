import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { History, Map as MapIcon, Loader2, MapPin, WifiOff } from "lucide-react";

import TrailMap, { type TrailPoint } from "./TrailMap";
import { hora, kmh } from "./trackGeometry";

import AppLayout from "@/layouts/app-layout";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import ExportMenu from "@/components/reports/ExportMenu";
import { exportMatrix, type ExportFormat } from "@/lib/export/reportExport";
import { rangeBounds } from "@/pages/admin/Reports/reportFormat";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
} from "@/components/kit";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
import {
  conexionAppService,
  type TramoDeRastroSinSenal,
} from "@/lib/api/conexionAppService";
type MapType = "roadmap" | "satellite" | "hybrid" | "terrain";

interface GuardOpt {
  id: string;
  name: string;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ── Lista de puntos ───────────────────────────────────────────────────────
   Un turno son miles de pings. Pintar una fila por ping son miles de nodos en
   el árbol y el panel se arrastra al desplazarlo, así que se dibuja SÓLO la
   ventana visible: dos separadores con la altura del resto sostienen la barra
   de desplazamiento. Fila de alto fijo — es lo que permite saber qué toca sin
   medir nada. */
const ALTO_FILA = 34;
const MARGEN_FILAS = 8;

export default function TrackingHistoryPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();

  const [guards, setGuards] = useState<GuardOpt[]>([]);
  // El enlace profundo (`?guard=…&from=…&to=…`) es lo que hace que «Ver
  // recorrido» desde el mapa en vivo caiga en el recorrido ya cargado.
  const [guardId, setGuardId] = useState<string>(
    () => params.get("guard") || "",
  );
  const [from, setFrom] = useState<string>(
    () => params.get("from") || ymd(new Date()),
  );
  const [to, setTo] = useState<string>(
    () => params.get("to") || ymd(new Date()),
  );
  const [mapType, setMapType] = useState<MapType>("roadmap");
  const [points, setPoints] = useState<TrailPoint[]>([]);
  // Tramos del recorrido grabados SIN SEÑAL (llegaron en tanda, después).
  const [tramosSinSenal, setTramosSinSenal] = useState<TramoDeRastroSinSenal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);

  // Load the vigilantes list once for the selector.
  useEffect(() => {
    (async () => {
      try {
        const res: any = await securityGuardService.list({ limit: 1000 });
        const rows: any[] = Array.isArray(res) ? res : res?.rows || [];

        setGuards(
          rows
            .map((g) => ({
              id: g.id,
              name:
                g.fullName || g.name || g.email || t("comun.vigilante", "Vigilante"),
            }))
            .filter((g) => g.id),
        );
      } catch {
        toast.error(t("ui.TrackingHistory.noSePudoCargarLa"));
      }
    })();
  }, []);

  // Clear the drawn trail when the selection changes so the map + CSV never show
  // a previous guard's route under a new guard's name (the fetch is manual).
  useEffect(() => {
    setPoints([]);
    setTramosSinSenal([]);
    setLoaded(false);
    setFocus(null);
  }, [guardId, from, to]);

  const loadTrail = useCallback(async () => {
    if (!guardId) {
      toast.error(t("comun.seleccionaUnVigilante"));

      return;
    }
    setLoading(true);
    try {
      // El rango es el día DE LA EMPRESA, no el de Greenwich: con las cotas en
      // UTC el recorrido de la noche (a partir de las 19:00 en Perú/Ecuador)
      // caía en el día siguiente y el mapa salía vacío. Mismo cálculo que los
      // informes — ver `rangeBounds`.
      const { start, end } = rangeBounds(from, to);
      const pts = await securityGuardService.trail(guardId, {
        from: start,
        to: end,
        limit: 5000,
      });

      setPoints(pts);
      setLoaded(true);
      // Sin el endpoint (servidor anterior) queda vacío: el recorrido se ve igual.
      conexionAppService
        .rastro({ securityGuardId: guardId }, new Date(start), new Date(end))
        .then(setTramosSinSenal)
        .catch(() => setTramosSinSenal([]));
      if (!pts.length)
        toast.info(t("ui.TrackingHistory.sinRecorridoRegistradoEnEse"));
    } catch {
      toast.error(t("ui.TrackingHistory.noSePudoCargarEl"));
    } finally {
      setLoading(false);
    }
  }, [from, guardId, to]);

  // Llegar por enlace con vigilante ya elegido carga el recorrido sin pedir un
  // clic más. Una sola vez: después manda el botón.
  const autoRef = useRef(!!params.get("guard"));

  useEffect(() => {
    if (!autoRef.current || !guardId) return;
    autoRef.current = false;
    loadTrail();
  }, [guardId, loadTrail]);

  /**
   * El recorrido, en CSV, Excel o PDF.
   *
   * El PDF de un recorrido no es una rareza: es lo que se adjunta a un parte
   * cuando hay que demostrar por dónde pasó alguien y a qué hora. Antes sólo
   * salía el CSV, o sea el formato que no se puede firmar ni mandar a un
   * cliente sin abrirlo antes en otra cosa.
   */
  const exportar = async (format: ExportFormat) => {
    if (!points.length) return;
    const nombre = guards.find((g) => g.id === guardId)?.name || "";

    try {
      await exportMatrix(
        format,
        [
          t("dispatcher.date_time", "Fecha/Hora"),
          t("revision.latitud", "Latitud"),
          t("revision.longitud", "Longitud"),
          t("ui.TrackingHistory.velocidadMs", "Velocidad (m/s)"),
          t("ui.TrackingHistory.precisionM", "Precisión (m)"),
          t("ui.TrackingHistory.bateriaPct", "Batería (%)"),
        ],
        points.map((p) => [
          new Date(p.at).toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() }),
          p.lat,
          p.lng,
          p.speed ?? "",
          p.accuracy ?? "",
          p.battery ?? "",
        ]),
        {
          title: t("sidebar.rastreador.historial", "Historial de seguimiento"),
          subtitle: `${nombre ? `${nombre} \u00b7 ` : ""}${t("ui.TrackingHistory.rangoFechas", { defaultValue: "{{from}} a {{to}}", from, to })} \u00b7 ${t("ui.TrackingHistory.nPuntos", { defaultValue: "{{count}} punto(s)", count: points.length })}`,
          fileBase: `${t("ui.TrackingHistory.archivoRecorrido", "recorrido")}-${nombre || "gps"}-${to}`,
        },
        // Sólo la fecha es texto; las cinco coordenadas y medidas son números y
        // se leen mucho mejor alineadas a la derecha.
        ["left", "right", "right", "right", "right", "right"],
      );
    } catch (e) {
      console.error("export recorrido", e);
      toast.error(
        t("ui.TrackingHistory.noSePudoGenerarElArchivo", "No se pudo generar el archivo"),
      );
    }
  };

  const guardName = useMemo(
    () => guards.find((g) => g.id === guardId)?.name || "",
    [guards, guardId],
  );

  /* ── Ventana visible de la lista ─────────────────────────────────────── */
  const listaRef = useRef<HTMLDivElement>(null);
  const [desplazamiento, setDesplazamiento] = useState(0);
  const [altoVista, setAltoVista] = useState(320);

  useEffect(() => {
    const el = listaRef.current;

    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setAltoVista(el.clientHeight || 320));

    ro.observe(el);
    setAltoVista(el.clientHeight || 320);

    return () => ro.disconnect();
  }, [loaded]);

  const primera = Math.max(
    0,
    Math.floor(desplazamiento / ALTO_FILA) - MARGEN_FILAS,
  );
  const ultima = Math.min(
    points.length,
    Math.ceil((desplazamiento + altoVista) / ALTO_FILA) + MARGEN_FILAS,
  );
  const visibles = points.slice(primera, ultima);
  /** ¿Este punto cae en un tramo que llegó en tanda (grabado sin señal)? */
  const grabadoSinSenal = (at: string) => {
    const x = new Date(at).getTime();

    return tramosSinSenal.some((tr) => x >= new Date(tr.desde).getTime() && x <= new Date(tr.hasta).getTime());
  };

  // Cuando el foco llega DESDE el mapa (pulsando el trazo o una parada), la fila
  // correspondiente tiene que aparecer sola: si no, el resaltado queda fuera de
  // pantalla y parece que no pasó nada.
  useEffect(() => {
    const el = listaRef.current;

    if (focus == null || !el) return;
    const arriba = focus * ALTO_FILA;
    const abajo = arriba + ALTO_FILA;

    if (arriba < el.scrollTop || abajo > el.scrollTop + el.clientHeight) {
      el.scrollTo({
        top: Math.max(0, arriba - el.clientHeight / 2),
        behavior: "smooth",
      });
    }
  }, [focus]);

  return (
    <AppLayout>
      <PageContainer width="wide">

        <PageHeader
          actions={<ExportMenu disabled={!points.length} onExport={exportar} />}
          icon={<History />}
          subtitle={t("ui.TrackingHistory.reproduceElRecorridoGpsReal")}
          title={t("sidebar.rastreador.historial", "Historial de seguimiento")}
        />

        {/* Filters */}
        <Section icon={<MapPin />} title={t("incidents.filters", "Filtros")}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className="cg-eyebrow mb-2 block">
                {t("comun.vigilante")}
              </label>
              <Select value={guardId} onValueChange={setGuardId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("ui.TrackingHistory.seleccionarVigilante")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {guards.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="cg-eyebrow mb-2 block">
                {t("comun.desde")}
              </label>
              <input
                className="cg-input w-full px-3 py-2 text-sm"
                max={to}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="cg-eyebrow mb-2 block">
                {t("comun.hasta")}
              </label>
              <input
                className="cg-input w-full px-3 py-2 text-sm"
                min={from}
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full gap-2"
                disabled={loading || !guardId}
                variant="brand"
                onClick={loadTrail}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MapIcon className="h-4 w-4" />
                )}
                {t("ui.TrackingHistory.verRecorrido", "Ver recorrido")}
              </Button>
            </div>
          </div>
        </Section>

        {/* Map + points */}
        <Section
          action={
            <Select
              value={mapType}
              onValueChange={(v) => setMapType(v as MapType)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="roadmap">
                  {t("ui.TrackingHistory.hojaDeRuta", "Hoja de ruta")}
                </SelectItem>
                <SelectItem value="satellite">
                  {t("ui.TrackingHistory.satelite", "Satélite")}
                </SelectItem>
                <SelectItem value="hybrid">
                  {t("ui.TrackingHistory.hibrido", "Híbrido")}
                </SelectItem>
                <SelectItem value="terrain">
                  {t("ui.LiveTracking.terreno", "Terreno")}
                </SelectItem>
              </SelectContent>
            </Select>
          }
          icon={<MapIcon />}
          title={
            guardName
              ? t("ui.TrackingHistory.recorridoDe", {
                  defaultValue: "Recorrido · {{name}}",
                  name: guardName,
                })
              : t("ui.TrackingHistory.vistaDelMapa", "Vista del mapa")
          }
        >
          <div className="mt-1 flex h-[520px] overflow-hidden rounded-2xl border">
            <div className="flex-[2] bg-muted">
              {loaded && points.length === 0 ? (
                // Searched and nothing came back: say so here, not only in a
                // toast (the panel kept asking to pick a guard and a range).
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    className="border-none py-0"
                    icon={<MapIcon />}
                    title={t("ui.TrackingHistory.sinRecorridoRegistradoEnEse")}
                  />
                </div>
              ) : loaded ? (
                <TrailMap
                  focusIndex={focus}
                  mapType={mapType}
                  points={points}
                  onFocusIndex={setFocus}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    className="border-none py-0"
                    description={t("ui.TrackingHistory.eligeUnVigilanteYLas")}
                    icon={<MapIcon />}
                    title={t("ui.TrackingHistory.seleccionaUnVigilanteYUn")}
                  />
                </div>
              )}
            </div>

            <div className="hidden flex-[1] flex-col border-l bg-card sm:flex">
              <div className="flex border-b bg-muted/30 px-3 py-2.5 text-xs font-semibold text-foreground">
                <span className="w-10">#</span>
                <span className="flex-1">{t("comun.hora")}</span>
                <span className="w-20 text-right">
                  {t("ui.RouteTrackingMap.velocidad", "Velocidad")}
                </span>
                <span className="w-10 text-right">
                  {t("ui.TrackingHistory.bat", "Bat.")}
                </span>
              </div>

              <div
                ref={listaRef}
                className="flex-1 overflow-y-auto"
                onScroll={(e) =>
                  setDesplazamiento((e.target as HTMLDivElement).scrollTop)
                }
              >
                {points.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-muted-foreground">
                    {loaded
                      ? t(
                          "ui.TrackingHistory.sinPuntosEnRango",
                          "Sin puntos en este rango",
                        )
                      : "—"}
                  </div>
                ) : (
                  <>
                    <div aria-hidden style={{ height: primera * ALTO_FILA }} />
                    {visibles.map((p, j) => {
                      const i = primera + j;
                      const activo = focus === i;
                      const bat =
                        typeof p.battery === "number"
                          ? Math.round(p.battery)
                          : null;

                      return (
                        <button
                          key={i}
                          aria-current={activo || undefined}
                          className="flex w-full items-center border-b border-border/30 px-3 text-left text-xs transition-colors hover:bg-muted/40"
                          style={{
                            height: ALTO_FILA,
                            background: activo
                              ? "var(--brand-wash)"
                              : undefined,
                          }}
                          type="button"
                          onClick={() => setFocus(i)}
                        >
                          <span className="w-10 tabular-nums text-muted-foreground">
                            #{i + 1}
                          </span>
                          <span className="flex-1 tabular-nums text-foreground">
                            {hora(p.at)}
                            {grabadoSinSenal(p.at) && (
                              <WifiOff
                                aria-label={t("conexionApp.puntoSinSenal", "Grabado sin señal; llegó después")}
                                className="ml-1 inline size-3"
                                style={{ color: "var(--warn-text)" }}
                              />
                            )}
                          </span>
                          <span className="w-20 text-right tabular-nums text-muted-foreground">
                            {kmh(p.speed)}
                          </span>
                          <span
                            className="w-10 text-right tabular-nums"
                            style={{
                              color:
                                bat != null && bat <= 20
                                  ? "var(--bad-text)"
                                  : "var(--ink-faint)",
                            }}
                          >
                            {bat != null ? `${bat}%` : "—"}
                          </span>
                        </button>
                      );
                    })}
                    <div
                      aria-hidden
                      style={{
                        height: Math.max(
                          0,
                          (points.length - ultima) * ALTO_FILA,
                        ),
                      }}
                    />
                  </>
                )}
              </div>

              {points.length > 0 && (
                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                  {t("ui.TrackingHistory.nPuntosPulsaUno", {
                    defaultValue:
                      "{{n}} punto(s) · pulsa uno para verlo en el mapa",
                    n: points.length.toLocaleString(localeActual()),
                    count: points.length,
                  })}
                </div>
              )}
            </div>
          </div>
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
