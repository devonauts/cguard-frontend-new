import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  CircleSlash,
  Megaphone,
  UserCheck,
  UserX,
  Plane,
  Archive,
  LayoutGrid,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  PageContainer,
  PageHeader,
  Section,
  EmptyState,
  Toolbar,
  Segmented,
  StatusBadge,
  Pagination,
  SkeletonCards,
  InfoNote,
} from "@/components/kit";
import gapService, {
  type Gap,
  type GapKind,
  type GapPage,
} from "@/lib/api/gapService";
import { stationService } from "@/lib/api/stationService";
import {
  hoyEnLaEmpresa,
  soloHora,
  soloFechaCivil,
  sumaDias,
} from "@/lib/horaDeLaEmpresa";
import { agruparPorDiaYEstacion, admiteDobletes } from "@/lib/cubrirHueco";
import { useEntitlement } from "@/hooks/useEntitlement";
import { usePermissions } from "@/hooks/usePermissions";
import CubrirHuecoModal from "./sinCubrir/CubrirHuecoModal";
import { useOfertaDobletes } from "./sinCubrir/useOfertaDobletes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TURNOS › SIN CUBRIR (URL /open-shifts, unchanged)
 *
 * It listed shift rows without a guard — the rarest way a post ends up empty.
 * Now it lists every real gap, from one backend service (`coverage/gaps`):
 * faltas, leave nobody replaces, shifts without a guard or held by someone
 * archived, and plazas the station requires that the schedule leaves empty.
 * Grouped by day and station, paged on the server (no silent cap), each with
 * «Cubrir» (ranked people, through the existing write paths) and, with the
 * Dobletes module, «Ofrecer».
 * ════════════════════════════════════════════════════════════════════════════
 */

type Pestana = "all" | GapKind;

const TONO: Record<GapKind, string> = {
  no_show: "bad",
  leave: "warn",
  open_shift: "info",
  archived_guard: "neutral",
  empty_slot: "warn",
};

const ICONO: Record<GapKind, ReactNode> = {
  no_show: <UserX className="h-4 w-4" />,
  leave: <Plane className="h-4 w-4" />,
  open_shift: <CircleSlash className="h-4 w-4" />,
  archived_guard: <Archive className="h-4 w-4" />,
  empty_slot: <LayoutGrid className="h-4 w-4" />,
};

export function useEtiquetasDeHueco() {
  const { t } = useTranslation();

  return useMemo(
    () =>
      ({
        no_show: t("ui.SinCubrir.tipo.no_show", "Falta"),
        leave: t("ui.SinCubrir.tipo.leave", "Permiso sin reemplazo"),
        open_shift: t("ui.SinCubrir.tipo.open_shift", "Turno sin vigilante"),
        archived_guard: t(
          "ui.SinCubrir.tipo.archived_guard",
          "Vigilante archivado",
        ),
        empty_slot: t("ui.SinCubrir.tipo.empty_slot", "Plaza vacía"),
      }) as Record<GapKind, string>,
    [t],
  );
}

const MAX_DIAS = 62;

export default function OpenShifts() {
  const { t } = useTranslation();
  const etiqueta = useEtiquetasDeHueco();
  const { hasPermission } = usePermissions();
  const conDobletes = useEntitlement("dobletes");
  const puedeCubrir =
    hasPermission("coverageCreate") || hasPermission("shiftEdit");
  const hoy = hoyEnLaEmpresa();

  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(() => sumaDias(hoy, 13));
  const [stationId, setStationId] = useState("");
  const [pestana, setPestana] = useState<Pestana>("all");
  const [terminados, setTerminados] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [datos, setDatos] = useState<GapPage | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estaciones, setEstaciones] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [cubrir, setCubrir] = useState<Gap | null>(null);
  const oferta = useOfertaDobletes();

  const rangoMal = hasta < desde;
  const rangoLargo =
    !rangoMal &&
    (new Date(`${hasta}T12:00:00Z`).getTime() -
      new Date(`${desde}T12:00:00Z`).getTime()) /
      86_400_000 +
      1 >
      MAX_DIAS;

  const cargar = useCallback(async () => {
    if (rangoMal || rangoLargo) return;
    setCargando(true);
    setError(null);
    try {
      const r = await gapService.list({
        from: desde,
        to: hasta,
        stationId: stationId || undefined,
        kinds: pestana === "all" ? undefined : [pestana],
        includeEnded: terminados,
        page,
        pageSize,
      });

      setDatos(r);
    } catch (e: any) {
      setError(
        e?.data?.message ||
          e?.message ||
          t("ui.SinCubrir.noCargo", "No se pudo cargar"),
      );
    } finally {
      setCargando(false);
    }
  }, [
    desde,
    hasta,
    stationId,
    pestana,
    terminados,
    page,
    pageSize,
    rangoMal,
    rangoLargo,
    t,
  ]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    stationService
      .list({}, { limit: 1000, offset: 0 })
      .then((r: any) =>
        setEstaciones(
          (r?.rows || [])
            .map((s: any) => ({
              id: String(s.id),
              name: String(s.name || s.stationName || ""),
            }))
            .sort((a: any, b: any) => a.name.localeCompare(b.name)),
        ),
      )
      .catch(() => setEstaciones([]));
  }, []);

  const byKind = datos?.byKind;
  const totalTodos = byKind
    ? Object.values(byKind).reduce((a, b) => a + b, 0)
    : 0;
  const grupos = useMemo(
    () => agruparPorDiaYEstacion(datos?.rows || []),
    [datos],
  );

  const opciones: Array<{ value: Pestana; label: ReactNode }> = [
    {
      value: "all",
      label: `${t("ui.SinCubrir.todos", "Todos")} · ${totalTodos}`,
    },
    ...(
      [
        "no_show",
        "leave",
        "empty_slot",
        "open_shift",
        "archived_guard",
      ] as GapKind[]
    )
      .filter(
        (k) => k !== "archived_guard" || (byKind?.archived_guard || 0) > 0,
      )
      .map((k) => ({
        value: k as Pestana,
        label: `${etiqueta[k]} · ${byKind?.[k] ?? 0}`,
      })),
  ];

  const nombreEstacion = (g: Gap) =>
    g.stationNickname && g.stationName && g.stationNickname !== g.stationName
      ? `${g.stationNickname} · ${g.stationName}`
      : g.stationNickname ||
        g.stationName ||
        t("ui.SinCubrir.estacion", "Estación");

  const quien = (g: Gap) => {
    if (g.kind === "empty_slot")
      return g.need && g.need > 1
        ? t("ui.SinCubrir.faltanDeN", {
            defaultValue: "Faltan {{faltan}} de {{need}}",
            faltan: g.missing,
            need: g.need,
          })
        : t("ui.SinCubrir.nadieAsignado", "Nadie en el horario");
    if (g.kind === "open_shift")
      return t("ui.SinCubrir.sinVigilante", "Sin vigilante");

    return g.guardName || "—";
  };

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          icon={<CalendarClock />}
          subtitle={t(
            "ui.SinCubrir.subtitulo",
            "Faltas, permisos sin reemplazo, plazas vacías y turnos sin vigilante, según el requisito de cada estación.",
          )}
          title={t("sidebar.turnos.sin-cubrir", "Sin cubrir")}
        />

        <Toolbar className="flex-wrap gap-3">
          <div className="grid gap-1">
            <Label htmlFor="sc-desde">{t("comun.desdeLaFecha", "Desde")}</Label>
            <Input
              className="w-40"
              id="sc-desde"
              type="date"
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="sc-hasta">{t("comun.hastaLaFecha", "Hasta")}</Label>
            <Input
              className="w-40"
              id="sc-hasta"
              type="date"
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="grid min-w-[200px] gap-1">
            <Label>{t("comun.puesto", "Estación")}</Label>
            <Select
              value={stationId || "__todas"}
              onValueChange={(v) => {
                setStationId(v === "__todas" ? "" : v);
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__todas">
                  {t("ui.SinCubrir.todasLasEstaciones", "Todas las estaciones")}
                </SelectItem>
                {estaciones.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox
              checked={terminados}
              onCheckedChange={(v) => {
                setTerminados(!!v);
                setPage(1);
              }}
            />
            {t("ui.SinCubrir.incluirTerminados", "Incluir los que ya pasaron")}
          </label>
        </Toolbar>

        {(rangoMal || rangoLargo) && (
          <InfoNote tone="warn">
            {rangoMal
              ? t(
                  "ui.SinCubrir.rangoAlReves",
                  "La fecha «hasta» es anterior a «desde».",
                )
              : t("ui.SinCubrir.rangoLargo", {
                  defaultValue: "Elige como máximo {{n}} días.",
                  n: MAX_DIAS,
                })}
          </InfoNote>
        )}

        <Segmented
          options={opciones}
          value={pestana}
          onChange={(v) => {
            setPestana(v);
            setPage(1);
          }}
        />

        {error ? (
          <InfoNote
            tone="bad"
            title={t("ui.SinCubrir.noCargo", "No se pudo cargar")}
          >
            {error}
          </InfoNote>
        ) : cargando && !datos ? (
          <SkeletonCards count={3} />
        ) : !grupos.length ? (
          <EmptyState
            description={
              totalTodos > 0
                ? t(
                    "ui.SinCubrir.nadaDeEsteTipo",
                    "No hay huecos de este tipo en estas fechas.",
                  )
                : t(
                    "ui.SinCubrir.todoCubierto",
                    "Todas las estaciones tienen a la gente que piden en estas fechas.",
                  )
            }
            icon={<UserCheck />}
            title={t("ui.SinCubrir.sinHuecos", "Nada sin cubrir")}
          />
        ) : (
          <div className="space-y-4" style={{ opacity: cargando ? 0.6 : 1 }}>
            {grupos.map((dia) => (
              <Section
                key={dia.date}
                icon={<CalendarClock />}
                title={soloFechaCivil(dia.date, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              >
                <div className="space-y-3">
                  {dia.estaciones.map((est) => {
                    const g0 = est.filas[0];

                    return (
                      <div
                        key={est.stationId}
                        className="glass-sunken rounded-xl p-3"
                      >
                        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              className="font-semibold hover:underline"
                              to={
                                g0.postSiteId
                                  ? `/post-sites/${g0.postSiteId}/stations/${g0.stationId}`
                                  : `/stations`
                              }
                            >
                              {nombreEstacion(g0)}
                            </Link>
                            {g0.postSiteName && (
                              <span
                                className="ml-2 text-xs"
                                style={{ color: "var(--ink-soft)" }}
                              >
                                {g0.postSiteName}
                              </span>
                            )}
                          </div>
                        </div>
                        <ul
                          className="divide-y"
                          style={{ borderColor: "var(--hairline)" }}
                        >
                          {est.filas.map((g) => (
                            <li
                              key={g.key}
                              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2"
                            >
                              <span className="w-28 shrink-0 font-mono text-sm tabular-nums">
                                {soloHora(g.startTime)}–{soloHora(g.endTime)}
                              </span>
                              <StatusBadge tone={TONO[g.kind]}>
                                <span className="inline-flex items-center gap-1">
                                  {ICONO[g.kind]} {etiqueta[g.kind]}
                                </span>
                              </StatusBadge>
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {quien(g)}
                              </span>
                              {g.ended ? (
                                <span
                                  className="text-xs"
                                  style={{ color: "var(--ink-faint)" }}
                                >
                                  {t("ui.SinCubrir.yaPaso", "Ya pasó")}
                                </span>
                              ) : (
                                <div className="flex shrink-0 gap-2">
                                  {conDobletes &&
                                    admiteDobletes(g) &&
                                    puedeCubrir && (
                                      <Button
                                        disabled={oferta.enviando === g.key}
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          const ok = await oferta.ofrecer(g);

                                          if (ok) void cargar();
                                        }}
                                      >
                                        <Megaphone className="mr-1 h-4 w-4" />
                                        {t("ui.SinCubrir.ofrecer", "Ofrecer")}
                                      </Button>
                                    )}
                                  {puedeCubrir && (
                                    <Button
                                      size="sm"
                                      variant="brand"
                                      onClick={() => setCubrir(g)}
                                    >
                                      <UserCheck className="mr-1 h-4 w-4" />
                                      {t("ui.SinCubrir.cubrir", "Cubrir")}
                                    </Button>
                                  )}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </Section>
            ))}
          </div>
        )}

        {datos && datos.total > 0 && (
          <Pagination
            noun={t("ui.SinCubrir.huecos", "huecos")}
            page={page}
            pageSize={pageSize}
            pageSizes={[25, 50, 100, 200]}
            total={datos.total}
            onPageChange={setPage}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          />
        )}
      </PageContainer>

      {cubrir && (
        <CubrirHuecoModal
          gap={cubrir}
          titulo={`${nombreEstacion(cubrir)} · ${etiqueta[cubrir.kind]}`}
          onClose={() => setCubrir(null)}
          onDone={() => {
            setCubrir(null);
            void cargar();
          }}
        />
      )}
    </AppLayout>
  );
}
