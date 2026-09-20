import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Filter,
  MapPinned,
  MapPin,
  Route as RouteIcon,
  CheckCircle2,
  Clock,
  Radio,
} from "lucide-react";

import RouteTrackingMap, {
  type LiveUnit,
  type RouteStopMarker,
} from "./RouteTrackingMap";
import { haceCuanto } from "./trackGeometry";

import { crearSocket, cerrarSocket, entrarEnSalaDelMapa } from "@/lib/socket";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  StatusBadge,
} from "@/components/kit";
import { getAuthToken } from "@/lib/api";
import routeService from "@/lib/api/routeService";
import { securityGuardService } from "@/lib/api/securityGuardService";
import { supervisorService } from "@/lib/api/supervisorService";

const DOW_NUM: Record<string, number> = {
  sun: 0,
  sunday: 0,
  dom: 0,
  domingo: 0,
  mon: 1,
  monday: 1,
  lun: 1,
  lunes: 1,
  tue: 2,
  tuesday: 2,
  mar: 2,
  martes: 2,
  wed: 3,
  wednesday: 3,
  mie: 3,
  mié: 3,
  miercoles: 3,
  miércoles: 3,
  thu: 4,
  thursday: 4,
  jue: 4,
  jueves: 4,
  fri: 5,
  friday: 5,
  vie: 5,
  viernes: 5,
  sat: 6,
  saturday: 6,
  sab: 6,
  sáb: 6,
  sabado: 6,
  sábado: 6,
};

/** Whether a route is scheduled to run on the given weekday (no schedule = daily). */
function scheduledOn(route: any, weekday: number): boolean {
  let days = route.days;

  if (typeof days === "string") {
    try {
      days = JSON.parse(days);
    } catch {
      days = null;
    }
  }
  if (!Array.isArray(days) || days.length === 0) return true;

  return days.some((d: any) => {
    if (typeof d === "number") return d === weekday;
    const n = DOW_NUM[String(d).toLowerCase().trim()];

    return n === weekday;
  });
}

const parseCoord = (v: any): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));

  return Number.isFinite(n) ? n : null;
};

/* ── Canal en vivo ─────────────────────────────────────────────────────────
   Dos fuentes, y no se pisan:

   · El SONDEO de `active-locations` es la lista de QUIÉN está en servicio — es
     quien da de alta y de baja las unidades (un fichaje de salida no llega por
     ningún evento). Cada 15 s, con guardia monótona: un sondeo lento no puede
     sobrescribir a uno más nuevo (los marcadores retrocedían).
   · El SOCKET `location:update` es MOVIMIENTO, y sólo lo emiten hoy los
     supervisores (la telemetría del vigilante escribe en la base pero no emite).
     Mueve la unidad al instante sin esperar al siguiente sondeo.

   Los identificadores son los MISMOS que usa el centro de control (`g-…`,
   `sup-…`), que son los que trae el evento: así el socket MUEVE la chincheta en
   lugar de duplicarla. */
const MS_SONDEO = 15000;

const tenantId = () => localStorage.getItem("tenantId") || "";

export default function LiveTrackingPage() {
  const { t } = useTranslation();
  // Puente al recargador del efecto de datos, para que el socket lo dispare.
  const traerRef = useRef<() => void>(() => {});
  const [openFilter, setOpenFilter] = useState(false);
  const [mapType, setMapType] = useState<
    "roadmap" | "satellite" | "hybrid" | "terrain"
  >("roadmap");
  const [showGeofence, setShowGeofence] = useState(true);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [routes, setRoutes] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [routeFilter, setRouteFilter] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);

  const [verVigilantes, setVerVigilantes] = useState(true);
  const [verSupervisores, setVerSupervisores] = useState(true);
  const [unidades, setUnidades] = useState<LiveUnit[]>([]);

  const weekday = useMemo(() => new Date(`${date}T12:00:00`).getDay(), [date]);
  const esHoy = useMemo(
    () => date === new Date().toISOString().slice(0, 10),
    [date],
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      try {
        const [r, runRes] = await Promise.all([
          routeService.list({ limit: 300 }),
          routeService.runs(date).catch(() => []),
        ]);

        if (!mounted) return;
        setRoutes(r?.rows ?? []);
        setRuns(runRes || []);
      } catch (e: any) {
        if (mounted)
          toast.error(
            e?.message ||
              t("routes.live.loadError", "No se pudieron cargar las rutas"),
          );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [date]);

  /* ── Quién está en servicio ───────────────────────────────────────────── */
  const secuenciaRef = useRef(0);

  useEffect(() => {
    // El personal en servicio es de AHORA: mirando el mapa de otro día, la capa
    // en vivo se apaga en vez de mentir con posiciones actuales.
    if (!esHoy) {
      setUnidades([]);

      return;
    }
    let vivo = true;

    const traer = async () => {
      const mio = ++secuenciaRef.current;
      const [guardias, supervisores] = await Promise.all([
        securityGuardService.activeLocations().catch(() => null),
        supervisorService.list().catch(() => null),
      ]);

      if (!vivo || mio !== secuenciaRef.current) return;

      const salida: LiveUnit[] = [];

      const filasG: any[] =
        (guardias as any)?.rows ?? (Array.isArray(guardias) ? guardias : []);

      filasG.forEach((g: any) => {
        const lat = parseCoord(g.latitude ?? g.punchInLatitude);
        const lng = parseCoord(g.longitude ?? g.punchInLongitude);

        if (lat == null || lng == null) return;
        salida.push({
          id: `g-${g.guardId || g.id}`,
          kind: "guard",
          nombre: g.fullName || "Vigilante",
          sub: g.postSiteName || undefined,
          lat,
          lng,
          // `punchInTime` viaja como «última señal»: el servidor ya lo hace
          // seguir a la fuente de la coordenada (ping en vivo o fichaje).
          at: g.punchInTime || null,
          bateria:
            typeof g.punchInBattery === "number" ? g.punchInBattery : null,
          desde: g.punchInTime || null,
          guardId: g.guardId || g.id || null,
        });
      });

      const filasS: any[] =
        (supervisores as any)?.rows ??
        (Array.isArray(supervisores) ? supervisores : []);

      filasS.forEach((s: any) => {
        if (!(s?.isOnDuty ?? s?.onDuty)) return;
        const lat = parseCoord(s.latitude);
        const lng = parseCoord(s.longitude);

        if (lat == null || lng == null) return;
        salida.push({
          id: `sup-${s.id}`,
          kind: "supervisor",
          nombre: s.fullName || "Supervisor",
          sub: s.zone || s.assignedVehicle || undefined,
          lat,
          lng,
          at: s.onDutySince || null,
          telefono: s.phoneNumber || null,
          desde: s.onDutySince || null,
        });
      });

      setUnidades((previas) => {
        // El socket puede haber movido a alguien DESPUÉS de que saliera este
        // sondeo. Se conserva la posición más fresca de las dos.
        const porId = new Map(previas.map((u) => [u.id, u]));

        return salida.map((u) => {
          const previa = porId.get(u.id);

          if (!previa) return u;
          const tPrev = previa.at ? new Date(previa.at).getTime() : 0;
          const tNueva = u.at ? new Date(u.at).getTime() : 0;

          return tPrev > tNueva
            ? {
                ...u,
                lat: previa.lat,
                lng: previa.lng,
                at: previa.at,
                velocidad: previa.velocidad,
              }
            : u;
        });
      });
    };

    traer();
    /* El sondeo pedía QUIÉN está en servicio, no dónde: el movimiento ya llegaba
       por `location:update`. Eso ya tiene evento —`shift:punch`— así que el
       reloj se queda como red de seguridad y se para con la pestaña oculta. El
       evento y `connect` se enganchan en el efecto de abajo, que es donde vive
       el socket de esta pantalla. */
    let iv: number | null = null;
    const visible = () => document.visibilityState !== "hidden";
    const arrancar = () => {
      if (!iv && visible()) iv = window.setInterval(traer, MS_SONDEO);
    };
    const parar = () => {
      if (iv) {
        window.clearInterval(iv);
        iv = null;
      }
    };
    const alVerse = () => {
      if (visible()) {
        traer();
        arrancar();
      } else parar();
    };

    arrancar();
    document.addEventListener("visibilitychange", alVerse);
    traerRef.current = traer;

    return () => {
      vivo = false;
      parar();
      document.removeEventListener("visibilitychange", alVerse);
    };
  }, [esHoy]);

  /* ── Movimiento instantáneo por el canal en vivo ──────────────────────── */
  useEffect(() => {
    const tid = tenantId();

    if (!tid || !esHoy) return;
    const socket = crearSocket(getAuthToken() || "", tid);

    const alMover = (e: any) => {
      const lat = parseCoord(e?.lat ?? e?.latitude);
      const lng = parseCoord(e?.lng ?? e?.longitude);
      const id = e?.id ? String(e.id) : "";

      if (lat == null || lng == null || !id) return;
      setUnidades((previas) => {
        const i = previas.findIndex((u) => u.id === id);

        // Sólo se MUEVE lo que el sondeo ya dio de alta: así la capa en vivo no
        // se llena de gente que ya fichó salida y sigue mandando pings.
        if (i < 0) return previas;
        const copia = previas.slice();

        copia[i] = {
          ...copia[i],
          lat,
          lng,
          at: e?.at || new Date().toISOString(),
          velocidad:
            typeof e?.speed === "number" ? e.speed : copia[i].velocidad,
        };

        return copia;
      });
    };

    /* La sala del mapa se PIDE. `location:update` ya no llega por rol: sin esta
       línea el chorro de posiciones no entra — y ése es el objetivo, que sólo lo
       reciba quien está pintando un mapa.

       El recuento de quién la quiere, y el re-enganche tras reconectar, viven en
       `lib/socket`: el socket es compartido, así que salirse por cuenta propia
       dejaría muda a cualquier otra pantalla que también pinte posiciones. */
    const salirDeLaSalaDelMapa = entrarEnSalaDelMapa(socket);
    /* Agrupado: sesenta fichajes a las siete de la mañana no son sesenta
       recargas de la lista de vigilantes. */
    let agrup: ReturnType<typeof setTimeout> | null = null;
    const alFichar = () => {
      if (agrup) clearTimeout(agrup);
      agrup = setTimeout(() => traerRef.current(), 700);
    };

    socket.on("shift:punch", alFichar);
    socket.on("connect", alFichar);
    socket.on("location:update", alMover);

    return () => {
      salirDeLaSalaDelMapa();
      if (agrup) clearTimeout(agrup);
      socket.off("shift:punch", alFichar);
      socket.off("connect", alFichar);
      socket.off("location:update", alMover);
      cerrarSocket(socket);
    };
  }, [esHoy]);

  const unidadesVisibles = useMemo(
    () =>
      unidades.filter((u) =>
        u.kind === "guard" ? verVigilantes : verSupervisores,
      ),
    [unidades, verVigilantes, verSupervisores],
  );

  const isDone = (routeId: string) =>
    runs.some((x) => x.routeId === routeId && x.status === "completed");

  // Routes visible on the map/table: scheduled-today (or all), then the picked route.
  const visibleRoutes = useMemo(() => {
    let list = showAll ? routes : routes.filter((r) => scheduledOn(r, weekday));

    if (routeFilter !== "all")
      list = list.filter((r) => String(r.id) === routeFilter);

    return list;
  }, [routes, showAll, weekday, routeFilter]);

  // Flatten each route's points that carry valid coordinates into map markers.
  const stops = useMemo<RouteStopMarker[]>(() => {
    const out: RouteStopMarker[] = [];

    visibleRoutes.forEach((route) => {
      const done = isDone(route.id);

      (route.points || []).forEach((p: any, idx: number) => {
        const lat = parseCoord(p.lat);
        const lng = parseCoord(p.lng);

        if (lat == null || lng == null) return;
        out.push({
          id: `${route.id}:${p.id ?? p.siteId ?? idx}`,
          routeId: String(route.id),
          routeName: route.name || "Ruta",
          siteName: p.siteName || p.address || p.siteId || `Parada ${idx + 1}`,
          address: p.address || "",
          lat,
          lng,
          order: p.order ?? idx + 1,
          done,
        });
      });
    });

    return out;
  }, [visibleRoutes, runs]);

  const totalPoints = visibleRoutes.reduce(
    (n, r) => n + (r.points?.length || 0),
    0,
  );

  const ultimaSenal = useMemo(() => {
    let mejor = 0;

    unidades.forEach((u) => {
      const t = u.at ? new Date(u.at).getTime() : 0;

      if (t > mejor) mejor = t;
    });

    return mejor ? new Date(mejor).toISOString() : null;
  }, [unidades]);

  return (
    <AppLayout>
      <PageContainer width="wide">
        {/* Dentro del contenedor, como en «Historial de seguimiento»: fuera se
            alineaba con el borde de la ventana y no con la página. */}

        <PageHeader
          actions={
            <>
            <input
              aria-label={t("comun.fecha")}
              className="cg-input cg-focus h-9 px-3 text-sm"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Sheet open={openFilter} onOpenChange={setOpenFilter}>
              <SheetTrigger asChild>
                <Button variant="outline">
                  <Filter className="size-4" />
                  Filtros
                </Button>
              </SheetTrigger>

              <SheetContent
                className="w-full max-w-[400px] overflow-y-auto sm:max-w-[460px]"
                side="right"
              >
                <SheetHeader>
                  <SheetTitle>Filtros</SheetTitle>
                </SheetHeader>

                <div className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <Label>Ruta</Label>
                    <Select
                      value={routeFilter}
                      onValueChange={setRouteFilter}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={t("ui.LiveTracking.todasLasRutas")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          {t("ui.LiveTracking.todasLasRutas")}
                        </SelectItem>
                        {routes.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name || r.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={showAll}
                      onCheckedChange={(v) => setShowAll(Boolean(v))}
                    />
                    <span className="text-sm text-foreground">
                      {t(
                        "ui.LiveTracking.mostrarTodasLasRutasNo",
                        "Mostrar todas las rutas (no solo las del día)",
                      )}
                    </span>
                  </label>

                  <div className="space-y-2 border-t pt-4">
                    <Label>{t("ui.LiveTracking.personalEnElMapa")}</Label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={verVigilantes}
                        onCheckedChange={(v) => setVerVigilantes(Boolean(v))}
                      />
                      <span className="text-sm text-foreground">
                        Vigilantes
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={verSupervisores}
                        onCheckedChange={(v) =>
                          setVerSupervisores(Boolean(v))
                        }
                      />
                      <span className="text-sm text-foreground">
                        Supervisores
                      </span>
                    </label>
                  </div>

                  <Button
                    className="w-full"
                    variant="brand"
                    onClick={() => setOpenFilter(false)}
                  >
                    Aplicar
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            </>
          }
          icon={<MapPinned />}
          subtitle={t("ui.LiveTracking.vigilantesYSupervisoresEnServicio")}
          title="Seguimiento en vivo"
        />

        {/* Controles del mapa */}
        <Section icon={<MapPin />} title="Mapa">
          <div className="flex flex-wrap items-end gap-4">
            {/* Tipo de mapa */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {t("ui.LiveTracking.tipoDeMapa")}
              </p>
              <Select
                value={mapType}
                onValueChange={(v) => setMapType(v as typeof mapType)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue
                    placeholder={t(
                      "ui.LiveTracking.hojaDeRuta",
                      "Hoja de Ruta",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="roadmap">
                    {t("ui.LiveTracking.hojaDeRuta", "Hoja de Ruta")}
                  </SelectItem>
                  <SelectItem value="satellite">
                    {t("ui.LiveTracking.satelite", "Satélite")}
                  </SelectItem>
                  <SelectItem value="hybrid">
                    {t("ui.LiveTracking.hibrido", "Híbrido")}
                  </SelectItem>
                  <SelectItem value="terrain">Terreno</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Mostrar Geovalla */}
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <Checkbox
                checked={showGeofence}
                onCheckedChange={(v) => setShowGeofence(Boolean(v))}
              />
              <span className="text-sm text-foreground">Mostrar Geovalla</span>
            </label>

            <div className="ml-auto flex flex-wrap items-center gap-4 pb-2 text-xs text-muted-foreground">
              {esHoy && (
                <span className="flex items-center gap-1.5">
                  <Radio
                    className="h-3.5 w-3.5"
                    style={{ color: "var(--ok-text)" }}
                  />
                  {unidadesVisibles.length} en servicio
                  {ultimaSenal ? ` · señal ${haceCuanto(ultimaSenal)}` : ""}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <RouteIcon
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--brand-text)" }}
                />
                {visibleRoutes.length} rutas · {totalPoints} paradas
              </span>
            </div>
          </div>

          {/* Contenedor del mapa + tabla */}
          <div className="mt-4 border rounded-2xl overflow-hidden">
            {/* Mapa */}
            <RouteTrackingMap
              height={420}
              mapType={mapType}
              showGeofence={showGeofence}
              stops={stops}
              units={unidadesVisibles}
            />

            {/* Tabla debajo del mapa. Seis columnas no caben en un teléfono y el
                marco de arriba recorta: sin este contenedor, la mitad derecha
                quedaba fuera de alcance en vez de poder desplazarse. */}
            <div className="overflow-x-auto">
              <table className="cg-tabla-fichas min-w-full text-sm text-left border-collapse">
                <thead className="bg-muted/30">
                  <tr className="border-b">
                    <th className="px-4 py-3 font-semibold">Ruta</th>
                    <th className="px-4 py-3 font-semibold">
                      {t("comun.puestoDeSeguridad")}
                    </th>
                    <th className="px-4 py-3 font-semibold">
                      {t("ui.LiveTracking.direccion", "Dirección")}
                    </th>
                    <th className="px-4 py-3 font-semibold">Parada</th>
                    <th className="px-4 py-3 font-semibold">Pasadas</th>
                    <th className="px-4 py-3 font-semibold">
                      {t("comun.estado")}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {stops.length > 0 ? (
                    stops.map((s) => {
                      const route = visibleRoutes.find(
                        (r) => String(r.id) === s.routeId,
                      );
                      const point = (route?.points || []).find(
                        (p: any, idx: number) =>
                          `${route.id}:${p.id ?? p.siteId ?? idx}` === s.id,
                      );

                      return (
                        <tr key={s.id} className="border-b hover:bg-muted/30">
                          <td className="px-4 py-3" data-rotulo="Ruta">{s.routeName}</td>
                          <td className="px-4 py-3" data-rotulo={t("comun.puestoDeSeguridad")}>{s.siteName}</td>
                          <td className="px-4 py-3 text-muted-foreground" data-rotulo={t("ui.LiveTracking.direccion", "Dirección")}>
                            {s.address || "—"}
                          </td>
                          <td className="px-4 py-3" data-rotulo="Parada">#{s.order}</td>
                          <td className="px-4 py-3" data-rotulo="Pasadas">
                            {point?.scheduledHits != null
                              ? point.scheduledHits
                              : "—"}
                          </td>
                          <td className="px-4 py-3" data-rotulo={t("comun.estado")}>
                            {s.done ? (
                              <StatusBadge tone="green">
                                <CheckCircle2 className="mr-1 h-3 w-3" />{" "}
                                Completada
                              </StatusBadge>
                            ) : (
                              <StatusBadge tone="orange">
                                <Clock className="mr-1 h-3 w-3" /> Pendiente
                              </StatusBadge>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="py-12" colSpan={6}>
                        <EmptyState
                          className="border-0"
                          description={
                            loading
                              ? "Obteniendo las rutas de patrulla del día."
                              : "No hay rutas con paradas geolocalizadas para esta fecha. Agrega ubicaciones a los puestos de la ruta para verlas aquí."
                          }
                          icon={<MapPin />}
                          title={
                            loading
                              ? "Cargando rutas…"
                              : "No se encontraron paradas"
                          }
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      </PageContainer>
    </AppLayout>
  );
}
