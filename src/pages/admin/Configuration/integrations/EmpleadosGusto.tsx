import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Check, Clock, Info, Sparkles, Unlink, Users } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import SettingsLayout from "@/layouts/SettingsLayout";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  FIELD_CLS,
  GlassPanel,
  InfoNote,
  PageContainer,
  PageHeader,
  SearchInput,
  Segmented,
  SkeletonCards,
  StatusBadge,
  TabNav,
} from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import {
  gustoService,
  type FilaDePersona,
  type ListadoDeGusto,
  type Senal,
} from "@/lib/api/gustoService";

import HorasGusto from "./HorasGusto";

/**
 * GUSTO · EMPLEADOS — quién es quién (fase 2).
 *
 * Cada persona de la empresa (vigilantes, supervisores y oficina) frente a los
 * empleados activos de su Gusto. El servidor sugiere parejas; las «sólidas»
 * (dos o más datos coinciden) se aceptan de golpe y las «posibles» se deciden
 * a mano, como exige Gusto. Cualquier pareja se puede cambiar o deshacer.
 */

type Filtro = "todas" | "sugeridas" | "sinPareja" | "vinculadas";

export default function EmpleadosGusto() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const puede = hasPermission("payrollIntegrationManage");
  const [datos, setDatos] = useState<ListadoDeGusto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Dos pestañas: quién es quién (fase 2) y las horas (fase 3). En la URL, para
  // poder enlazar «Enviar horas» directamente.
  const [params, setParams] = useSearchParams();
  const pestana: "empleados" | "horas" = params.get("tab") === "horas" ? "horas" : "empleados";
  const irA = (v: "empleados" | "horas") => setParams(v === "horas" ? { tab: "horas" } : {}, { replace: true });

  const ROL: Record<string, string> = {
    vigilante: t("ui.GustoEmpleados.rolVigilante", "Vigilante"),
    supervisor: t("ui.GustoEmpleados.rolSupervisor", "Supervisor"),
    oficina: t("ui.GustoEmpleados.rolOficina", "Oficina"),
  };
  const SENAL: Record<Senal, string> = {
    email: t("ui.GustoEmpleados.senalCorreo", "correo"),
    name: t("ui.GustoEmpleados.senalNombre", "nombre"),
    dob: t("ui.GustoEmpleados.senalFecha", "fecha de nacimiento"),
  };

  const cargar = useCallback(async () => {
    try {
      setError(null);
      setDatos(await gustoService.empleados());
    } catch (e: any) {
      setError(e?.message || t("ui.GustoEmpleados.noCargo", "No pudimos leer tus empleados de Gusto."));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombreDeGusto = useMemo(
    () => new Map((datos?.empleados || []).map((e) => [e.uuid, e])),
    [datos],
  );

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return (datos?.personas || []).filter((p) => {
      if (filtro === "sugeridas" && !p.sugerencia) return false;
      if (filtro === "sinPareja" && (p.vinculo || p.sugerencia)) return false;
      if (filtro === "vinculadas" && !p.vinculo) return false;
      if (q && !`${p.nombre} ${p.email || ""}`.toLowerCase().includes(q)) return false;

      return true;
    });
  }, [datos, filtro, busca]);

  const vincular = async (p: FilaDePersona, uuid: string | null, desdeSugerencia = false) => {
    setOcupado(p.userId);
    try {
      await gustoService.vincular(
        p.userId,
        uuid,
        desdeSugerencia && p.sugerencia ? { matchedBy: "suggested", senales: p.sugerencia.senales } : {},
      );
      await cargar();
    } catch (e: any) {
      toast.error(e?.message || t("ui.GustoEmpleados.noGuardo", "No se pudo guardar la pareja."));
    } finally {
      setOcupado(null);
    }
  };

  const aceptarTodas = async () => {
    setOcupado("todas");
    try {
      const r = await gustoService.aceptarSugerencias();

      toast.success(t("ui.GustoEmpleados.aceptadas", { n: r.aceptadas, defaultValue: "{{n}} parejas vinculadas." }));
      await cargar();
    } catch (e: any) {
      toast.error(e?.message || t("ui.GustoEmpleados.noGuardo", "No se pudo guardar la pareja."));
    } finally {
      setOcupado(null);
    }
  };

  const r = datos?.resumen;

  return (
    <AppLayout>
      <SettingsLayout navKey="configuracion" title={t("ui.GustoEmpleados.tituloPagina", "Nómina en Gusto")}>
        <PageContainer>
          <Link
            className="mb-3 inline-flex items-center gap-1.5 text-sm"
            style={{ color: "var(--ink-soft)" }}
            to="/setting/integraciones"
          >
            <ArrowLeft className="size-4" />
            {t("settings.configuracion.integraciones", "Conexiones y API")}
          </Link>
          <PageHeader
            icon={<Users />}
            subtitle={
              pestana === "horas"
                ? t(
                    "ui.GustoEmpleados.subtituloHoras",
                    "Envía a Gusto las horas aprobadas en Nómina, ya separadas en ordinarias y extra.",
                  )
                : t(
                    "ui.GustoEmpleados.subtitulo",
                    "Empareja a tu personal con sus empleados de Gusto. Sólo las horas de quien esté vinculado llegarán a tu nómina.",
                  )
            }
            title={t("ui.GustoEmpleados.tituloPagina", "Nómina en Gusto")}
          />

          <TabNav
            className="mb-4"
            items={[
              { value: "empleados", label: t("ui.GustoEmpleados.pestanaEmpleados", "Empleados"), icon: <Users /> },
              { value: "horas", label: t("ui.GustoEmpleados.pestanaHoras", "Horas"), icon: <Clock /> },
            ]}
            value={pestana}
            onChange={irA}
          />

          {pestana === "horas" ? (
            <HorasGusto alIrAEmpleados={() => irA("empleados")} />
          ) : cargando ? (
            <SkeletonCards count={4} />
          ) : error ? (
            <InfoNote icon={<Info />} tone="bad">
              {error}
            </InfoNote>
          ) : datos && r ? (
            <>
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                {[
                  [t("ui.GustoEmpleados.cifraVinculadas", "Vinculadas"), `${r.vinculadas} / ${r.personas}`],
                  [t("ui.GustoEmpleados.cifraSugeridas", "Sugeridas"), String(r.solidas + r.posibles)],
                  [t("ui.GustoEmpleados.cifraSinPareja", "Sin pareja"), String(r.sinPareja)],
                  [t("ui.GustoEmpleados.cifraGustoLibres", "En Gusto sin vincular"), String(r.gustoSinPareja)],
                ].map(([etiqueta, valor]) => (
                  <GlassPanel key={etiqueta} className="p-4">
                    <div className="text-xs" style={{ color: "var(--ink-faint)" }}>
                      {etiqueta}
                    </div>
                    <div className="mt-1 text-xl font-semibold">{valor}</div>
                  </GlassPanel>
                ))}
              </div>

              {r.huerfanas > 0 && (
                <InfoNote className="mb-4" icon={<Info />} tone="warn">
                  {t("ui.GustoEmpleados.huerfanas", {
                    n: r.huerfanas,
                    defaultValue:
                      "{{n}} personas están vinculadas a un empleado que ya no está activo en Gusto. Revisa su pareja.",
                  })}
                </InfoNote>
              )}

              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <Segmented
                  options={[
                    { value: "todas", label: t("ui.GustoEmpleados.filtroTodas", "Todas") },
                    { value: "sugeridas", label: t("ui.GustoEmpleados.filtroSugeridas", "Sugeridas") },
                    { value: "sinPareja", label: t("ui.GustoEmpleados.filtroSinPareja", "Sin pareja") },
                    { value: "vinculadas", label: t("ui.GustoEmpleados.filtroVinculadas", "Vinculadas") },
                  ]}
                  value={filtro}
                  onChange={setFiltro}
                />
                <div className="flex items-center gap-2">
                  <SearchInput
                    placeholder={t("ui.GustoEmpleados.buscar", "Buscar persona…")}
                    value={busca}
                    onChange={setBusca}
                  />
                  {puede && r.solidas > 0 && (
                    <Button disabled={!!ocupado} onClick={aceptarTodas}>
                      <Sparkles />
                      {t("ui.GustoEmpleados.aceptarTodas", { n: r.solidas, defaultValue: "Aceptar {{n}} sugerencias" })}
                    </Button>
                  )}
                </div>
              </div>

              {visibles.length === 0 ? (
                <EmptyState
                  icon={<Users />}
                  title={t("ui.GustoEmpleados.vacio", "Nadie en esta vista")}
                />
              ) : (
                <GlassPanel className="divide-y" style={{ borderColor: "var(--hairline)" } as any}>
                  {visibles.map((p) => {
                    const libres = (datos.empleados || []).filter(
                      (e) => !e.vinculadoA || e.vinculadoA === p.userId,
                    );
                    const actual = p.vinculo?.gustoUuid || "";

                    return (
                      <div
                        key={p.userId}
                        className="grid items-center gap-3 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_auto]"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium">{p.nombre}</span>
                            <StatusBadge dot={false} tone="neutral">
                              {ROL[p.rol]}
                            </StatusBadge>
                          </div>
                          {p.email && (
                            <div className="truncate text-xs" style={{ color: "var(--ink-faint)" }}>
                              {p.email}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          {p.vinculo ? (
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                              <StatusBadge tone={p.vinculo.huerfano ? "warn" : "ok"}>
                                {p.vinculo.huerfano
                                  ? t("ui.GustoEmpleados.estadoHuerfano", "Ya no está activo en Gusto")
                                  : t("ui.GustoEmpleados.estadoVinculado", "Vinculado")}
                              </StatusBadge>
                              <span className="truncate">
                                {nombreDeGusto.get(p.vinculo.gustoUuid)?.nombre || p.vinculo.gustoNombre}
                              </span>
                            </div>
                          ) : p.sugerencia ? (
                            <div className="text-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge tone={p.sugerencia.fuerza === "solida" ? "info" : "warn"}>
                                  {p.sugerencia.fuerza === "solida"
                                    ? t("ui.GustoEmpleados.estadoSolida", "Sugerida")
                                    : t("ui.GustoEmpleados.estadoPosible", "Posible")}
                                </StatusBadge>
                                <span className="truncate">{p.sugerencia.nombre}</span>
                              </div>
                              <div className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
                                {t("ui.GustoEmpleados.coinciden", "Coinciden:")}{" "}
                                {p.sugerencia.senales.map((s) => SENAL[s]).join(" · ")}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm" style={{ color: "var(--ink-faint)" }}>
                              {t("ui.GustoEmpleados.estadoSinPareja", "Sin pareja en Gusto")}
                            </span>
                          )}
                        </div>

                        {puede && (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {!p.vinculo && p.sugerencia && (
                              <Button
                                disabled={!!ocupado}
                                size="sm"
                                onClick={() => vincular(p, p.sugerencia!.gustoUuid, true)}
                              >
                                <Check />
                                {t("ui.GustoEmpleados.aceptar", "Aceptar")}
                              </Button>
                            )}
                            <select
                              aria-label={t("ui.GustoEmpleados.elegir", "Empleado de Gusto")}
                              className={`${FIELD_CLS} max-w-56`}
                              disabled={!!ocupado}
                              value={actual}
                              onChange={(e) => vincular(p, e.target.value || null)}
                            >
                              <option value="">
                                {p.vinculo
                                  ? t("ui.GustoEmpleados.quitar", "— Quitar pareja —")
                                  : t("ui.GustoEmpleados.elegirUno", "Elegir empleado…")}
                              </option>
                              {libres.map((e) => (
                                <option key={e.uuid} value={e.uuid}>
                                  {e.nombre}
                                  {e.email ? ` · ${e.email}` : ""}
                                </option>
                              ))}
                            </select>
                            {p.vinculo && (
                              <Button
                                aria-label={t("ui.GustoEmpleados.desvincular", "Desvincular")}
                                disabled={!!ocupado}
                                size="icon-sm"
                                variant="danger-ghost"
                                onClick={() => vincular(p, null)}
                              >
                                <Unlink />
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </GlassPanel>
              )}

              {r.gustoSinPareja > 0 && (
                <InfoNote className="mt-4" icon={<Info />} tone="info">
                  {t("ui.GustoEmpleados.notaGustoLibres", {
                    n: r.gustoSinPareja,
                    defaultValue:
                      "Hay {{n}} empleados en Gusto sin pareja aquí. Si alguno trabaja contigo, vincúlalo desde su persona; si falta alguien en Gusto, dalo de alta allí (Gusto pide su SSN y su cuenta bancaria).",
                  })}
                </InfoNote>
              )}
            </>
          ) : null}
        </PageContainer>
      </SettingsLayout>
    </AppLayout>
  );
}
