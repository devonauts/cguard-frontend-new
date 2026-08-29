import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { useSearchParams } from "react-router-dom";
import AppLayout from "@/layouts/app-layout";
import { toast } from "sonner";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { History, Map as MapIcon, FileSpreadsheet, Loader2, MapPin } from "lucide-react";
import Breadcrumb from "@/components/ui/breadcrumb";
import { rangeBounds } from "@/pages/admin/Reports/reportFormat";
import { PageContainer, PageHeader, Section, EmptyState } from "@/components/kit";
import { securityGuardService } from "@/lib/api/securityGuardService";
import TrailMap, { type TrailPoint } from "./TrailMap";
import { hora, kmh } from "./trackGeometry";

import { localeActual } from '@/lib/localeActual'
type MapType = "roadmap" | "satellite" | "hybrid" | "terrain";

interface GuardOpt { id: string; name: string; }

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
  const [guardId, setGuardId] = useState<string>(() => params.get("guard") || "");
  const [from, setFrom] = useState<string>(() => params.get("from") || ymd(new Date()));
  const [to, setTo] = useState<string>(() => params.get("to") || ymd(new Date()));
  const [mapType, setMapType] = useState<MapType>("roadmap");
  const [points, setPoints] = useState<TrailPoint[]>([]);
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
            .map((g) => ({ id: g.id, name: g.fullName || g.name || g.email || "Vigilante" }))
            .filter((g) => g.id),
        );
      } catch {
        toast.error(t('ui.TrackingHistory.noSePudoCargarLa'));
      }
    })();
  }, []);

  // Clear the drawn trail when the selection changes so the map + CSV never show
  // a previous guard's route under a new guard's name (the fetch is manual).
  useEffect(() => { setPoints([]); setLoaded(false); setFocus(null); }, [guardId, from, to]);

  const loadTrail = useCallback(async () => {
    if (!guardId) { toast.error(t('comun.seleccionaUnVigilante')); return; }
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
      if (!pts.length) toast.info(t('ui.TrackingHistory.sinRecorridoRegistradoEnEse'));
    } catch {
      toast.error(t('ui.TrackingHistory.noSePudoCargarEl'));
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

  const exportCsv = () => {
    if (!points.length) return;
    const csvCell = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = "Fecha/Hora,Latitud,Longitud,Velocidad(m/s),Precisión(m),Batería(%)";
    const body = points
      .map((p) => [new Date(p.at).toLocaleString(localeActual()), p.lat, p.lng, p.speed ?? "", p.accuracy ?? "", p.battery ?? ""].map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recorrido_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const guardName = useMemo(() => guards.find((g) => g.id === guardId)?.name || "", [guards, guardId]);

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

  const primera = Math.max(0, Math.floor(desplazamiento / ALTO_FILA) - MARGEN_FILAS);
  const ultima = Math.min(points.length, Math.ceil((desplazamiento + altoVista) / ALTO_FILA) + MARGEN_FILAS);
  const visibles = points.slice(primera, ultima);

  // Cuando el foco llega DESDE el mapa (pulsando el trazo o una parada), la fila
  // correspondiente tiene que aparecer sola: si no, el resaltado queda fuera de
  // pantalla y parece que no pasó nada.
  useEffect(() => {
    const el = listaRef.current;
    if (focus == null || !el) return;
    const arriba = focus * ALTO_FILA;
    const abajo = arriba + ALTO_FILA;
    if (arriba < el.scrollTop || abajo > el.scrollTop + el.clientHeight) {
      el.scrollTo({ top: Math.max(0, arriba - el.clientHeight / 2), behavior: "smooth" });
    }
  }, [focus]);

  return (
    <AppLayout>
      <PageContainer width="wide" className="p-4 sm:p-6">
        <Breadcrumb
          items={[
            { label: "Panel de control", path: "/dashboard" },
            { label: t('sidebar.rastreador.historial', 'Historial de seguimiento') },
          ]}
        />

        <PageHeader
          icon={<History />}
          title={t('sidebar.rastreador.historial', 'Historial de seguimiento')}
          subtitle={t('ui.TrackingHistory.reproduceElRecorridoGpsReal')}
          actions={
            <Button variant="outline" onClick={exportCsv} disabled={!points.length}>
              <FileSpreadsheet className="size-4" />
              Exportar
            </Button>
          }
        />

        {/* Filters */}
        <Section title="Filtros" icon={<MapPin />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label className="cg-eyebrow mb-2 block">{t('comun.vigilante')}</label>
              <Select value={guardId} onValueChange={setGuardId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('ui.TrackingHistory.seleccionarVigilante')} />
                </SelectTrigger>
                <SelectContent>
                  {guards.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="cg-eyebrow mb-2 block">{t('comun.desde')}</label>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
                className="cg-input w-full px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="cg-eyebrow mb-2 block">{t('comun.hasta')}</label>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
                className="cg-input w-full px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <Button variant="brand" className="w-full gap-2" onClick={loadTrail} disabled={loading || !guardId}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapIcon className="h-4 w-4" />}
                Ver recorrido
              </Button>
            </div>
          </div>
        </Section>

        {/* Map + points */}
        <Section
          title={guardName ? `Recorrido · ${guardName}` : "Vista del mapa"}
          icon={<MapIcon />}
          action={
            <Select value={mapType} onValueChange={(v) => setMapType(v as MapType)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="roadmap">{t('ui.TrackingHistory.hojaDeRuta', 'Hoja de ruta')}</SelectItem>
                <SelectItem value="satellite">{t("ui.TrackingHistory.satelite", "Satélite")}</SelectItem>
                <SelectItem value="hybrid">{t("ui.TrackingHistory.hibrido", "Híbrido")}</SelectItem>
                <SelectItem value="terrain">Terreno</SelectItem>
              </SelectContent>
            </Select>
          }
        >
          <div className="mt-1 flex h-[520px] overflow-hidden rounded-2xl border">
            <div className="flex-[2] bg-muted">
              {loaded ? (
                <TrailMap
                  points={points}
                  mapType={mapType}
                  focusIndex={focus}
                  onFocusIndex={setFocus}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <EmptyState
                    icon={<MapIcon />}
                    title={t('ui.TrackingHistory.seleccionaUnVigilanteYUn')}
                    description={t('ui.TrackingHistory.eligeUnVigilanteYLas')}
                    className="border-none py-0"
                  />
                </div>
              )}
            </div>

            <div className="hidden flex-[1] flex-col border-l bg-card sm:flex">
              <div className="flex border-b bg-muted/30 px-3 py-2.5 text-xs font-semibold text-foreground">
                <span className="w-10">#</span>
                <span className="flex-1">{t('comun.hora')}</span>
                <span className="w-20 text-right">Velocidad</span>
                <span className="w-10 text-right">Bat.</span>
              </div>

              <div
                ref={listaRef}
                className="flex-1 overflow-y-auto"
                onScroll={(e) => setDesplazamiento((e.target as HTMLDivElement).scrollTop)}
              >
                {points.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-4 py-6 text-center text-sm text-muted-foreground">
                    {loaded ? t("ui.TrackingHistory.sinPuntosEnRango", "Sin puntos en este rango") : "—"}
                  </div>
                ) : (
                  <>
                    <div style={{ height: primera * ALTO_FILA }} aria-hidden />
                    {visibles.map((p, j) => {
                      const i = primera + j;
                      const activo = focus === i;
                      const bat = typeof p.battery === "number" ? Math.round(p.battery) : null;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFocus(i)}
                          aria-current={activo || undefined}
                          className="flex w-full items-center border-b border-border/30 px-3 text-left text-xs transition-colors hover:bg-muted/40"
                          style={{
                            height: ALTO_FILA,
                            background: activo ? "var(--brand-wash)" : undefined,
                          }}
                        >
                          <span className="w-10 tabular-nums text-muted-foreground">#{i + 1}</span>
                          <span className="flex-1 tabular-nums text-foreground">{hora(p.at)}</span>
                          <span className="w-20 text-right tabular-nums text-muted-foreground">
                            {kmh(p.speed)}
                          </span>
                          <span
                            className="w-10 text-right tabular-nums"
                            style={{ color: bat != null && bat <= 20 ? "var(--bad-text)" : "var(--ink-faint)" }}
                          >
                            {bat != null ? `${bat}%` : "—"}
                          </span>
                        </button>
                      );
                    })}
                    <div style={{ height: Math.max(0, (points.length - ultima) * ALTO_FILA) }} aria-hidden />
                  </>
                )}
              </div>

              {points.length > 0 && (
                <div className="border-t px-3 py-2 text-xs text-muted-foreground">
                  {points.length.toLocaleString(localeActual())} punto(s) · pulsa uno para verlo en el mapa
                </div>
              )}
            </div>
          </div>
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
