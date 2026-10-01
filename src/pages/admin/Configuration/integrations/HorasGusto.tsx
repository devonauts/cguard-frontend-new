import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Clock, Info, Send, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import {
  EmptyState,
  FIELD_CLS,
  GlassPanel,
  InfoNote,
  Meter,
  SkeletonCards,
  StatusBadge,
} from "@/components/kit";
import { usePermissions } from "@/hooks/usePermissions";
import {
  gustoService,
  type AjustesDeHoras,
  type EnvioDeHoras,
  type PeriodoDePago,
  type ReglaDeExtras,
  type VistaPreviaDeHoras,
} from "@/lib/api/gustoService";

/**
 * GUSTO · HORAS — lo aprobado en Nómina, a la nómina de Gusto (fase 3).
 *
 * Se elige un periodo de pago de Gusto (o unas fechas a mano), se ve lo que se
 * enviaría —ordinarias, extra y doble por persona, ya partidas con la regla de
 * la empresa— y se envía. El envío va en segundo plano y avisa del progreso por
 * websocket. Lo que no está aprobado no sale: se cuenta para que se vea.
 */

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default function HorasGusto({ alIrAEmpleados }: { alIrAEmpleados: () => void }) {
  const { t, i18n } = useTranslation();
  const { hasPermission } = usePermissions();
  const puede = hasPermission("payrollIntegrationManage");

  const [ajustes, setAjustes] = useState<AjustesDeHoras | null>(null);
  const [periodos, setPeriodos] = useState<PeriodoDePago[] | null>(null);
  const [errorPeriodos, setErrorPeriodos] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string>("");
  const [inicio, setInicio] = useState(() => ymd(new Date(Date.now() - 13 * 86_400_000)));
  const [fin, setFin] = useState(() => ymd(new Date()));
  const [vista, setVista] = useState<VistaPreviaDeHoras | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [errorVista, setErrorVista] = useState<string | null>(null);
  const [envios, setEnvios] = useState<EnvioDeHoras[]>([]);
  const [progreso, setProgreso] = useState<{ envioId: string; hechos: number; total: number } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const fecha = useCallback(
    (v: string) =>
      new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(`${v}T00:00:00Z`),
      ),
    [i18n.language],
  );
  const momento = (v: string | null) =>
    v ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(v)) : "—";

  const REGLAS: Array<{ value: ReglaDeExtras; label: string }> = [
    { value: "federal", label: t("ui.GustoHoras.reglaFederal", "Federal: más de 40 h a la semana (Texas y la mayoría de estados)") },
    { value: "california", label: t("ui.GustoHoras.reglaCalifornia", "California: también por día (más de 8 h) y 7.º día") },
    { value: "none", label: t("ui.GustoHoras.reglaNinguna", "Sin horas extra (todo ordinario)") },
  ];
  const DIAS = useMemo(
    () =>
      Array.from({ length: 7 }, (_, d) =>
        new Intl.DateTimeFormat(i18n.language, { weekday: "long", timeZone: "UTC" }).format(
          new Date(Date.UTC(2026, 9, 4 + d)), // 4 oct 2026 es domingo
        ),
      ),
    [i18n.language],
  );

  const cargarEnvios = useCallback(async () => {
    try {
      setEnvios(await gustoService.envios());
    } catch {
      /* el historial no es imprescindible */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setAjustes(await gustoService.ajustesDeHoras());
      } catch {
        /* sin ajustes se usa la regla federal del servidor */
      }
    })();
    void (async () => {
      try {
        const p = await gustoService.periodosDePago();

        setPeriodos(p);
        // El periodo abierto más reciente que ya terminó o está en curso.
        const hoy = ymd(new Date());
        const abierto = p.find((x) => !x.procesada && x.inicio <= hoy) || p.find((x) => !x.procesada);

        if (abierto) elegirPeriodo(abierto);
      } catch (e: any) {
        setPeriodos([]);
        setErrorPeriodos(e?.message || null);
      }
    })();
    void cargarEnvios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claveDe = (p: PeriodoDePago) => `${p.payScheduleUuid}|${p.inicio}|${p.fin}`;
  const periodo = periodos?.find((p) => claveDe(p) === elegido) || null;

  function elegirPeriodo(p: PeriodoDePago | null) {
    if (!p) {
      setElegido("");

      return;
    }
    setElegido(claveDe(p));
    setInicio(p.inicio);
    setFin(p.fin);
  }

  const cargarVista = useCallback(async () => {
    if (!inicio || !fin || inicio > fin) return;
    setCargandoVista(true);
    setErrorVista(null);
    try {
      setVista(await gustoService.vistaPrevia(inicio, fin));
    } catch (e: any) {
      setVista(null);
      setErrorVista(e?.message || t("ui.GustoHoras.noCargo", "No pudimos calcular las horas."));
    } finally {
      setCargandoVista(false);
    }
  }, [inicio, fin, t]);

  useEffect(() => {
    void cargarVista();
  }, [cargarVista, ajustes?.regla, ajustes?.semanaEmpieza]);

  // Progreso del envío por websocket.
  useEffect(() => {
    const oir = (e: Event) => {
      const d: any = (e as CustomEvent).detail || {};

      if (d.estado === "running") {
        setProgreso({ envioId: d.envioId, hechos: d.hechos || 0, total: d.total || 0 });
      } else if (d.estado === "done" || d.estado === "failed") {
        setProgreso(null);
        setEnviando(false);
        void cargarEnvios();
        if (d.estado === "done") toast.success(t("ui.GustoHoras.enviado", "Horas enviadas a Gusto."));
        else toast.error(t("ui.GustoHoras.envioFallo", "El envío a Gusto falló. Mira el detalle abajo."));
      }
    };

    window.addEventListener("cg:gusto-envio", oir);

    return () => window.removeEventListener("cg:gusto-envio", oir);
  }, [cargarEnvios, t]);

  // Por si el websocket no llega: se mira el historial mientras haya un envío en curso.
  const enCurso = enviando || envios.some((e) => e.estado === "running");

  useEffect(() => {
    if (!enCurso) return;
    const id = window.setInterval(async () => {
      const lista = await gustoService.envios().catch(() => null);

      if (!lista) return;
      setEnvios(lista);
      if (!lista.some((e) => e.estado === "running")) {
        setEnviando(false);
        setProgreso(null);
      }
    }, 5000);

    return () => window.clearInterval(id);
  }, [enCurso]);

  const guardarAjuste = async (cambios: Partial<Pick<AjustesDeHoras, "regla" | "semanaEmpieza">>) => {
    try {
      setAjustes(await gustoService.guardarAjustesDeHoras(cambios));
    } catch (e: any) {
      toast.error(e?.message || t("ui.GustoHoras.noGuardo", "No se pudo guardar."));
    }
  };

  const enviar = async () => {
    if (!vista) return;
    const ok = await confirmDialog({
      title: t("ui.GustoHoras.confirmarTitulo", "¿Enviar las horas a Gusto?"),
      message: t("ui.GustoHoras.confirmarTexto", {
        turnos: vista.resumen.turnos,
        personas: vista.resumen.personas,
        desde: fecha(inicio),
        hasta: fecha(fin),
        defaultValue:
          "Enviaremos {{turnos}} turnos aprobados de {{personas}} personas ({{desde}} – {{hasta}}). Si ya los enviaste, sólo se actualiza lo que cambió. La nómina la corres tú en Gusto.",
      }),
      confirmText: t("ui.GustoHoras.enviar", "Enviar a Gusto"),
    });

    if (!ok) return;
    setEnviando(true);
    try {
      const r = await gustoService.enviarHoras(inicio, fin, periodo?.payScheduleUuid || null);

      setProgreso({ envioId: r.envioId, hechos: 0, total: vista.resumen.turnos });
      void cargarEnvios();
    } catch (e: any) {
      setEnviando(false);
      toast.error(e?.message || t("ui.GustoHoras.envioFallo", "El envío a Gusto falló. Mira el detalle abajo."));
    }
  };

  const r = vista?.resumen;

  return (
    <div className="space-y-4">
      {/* ── Ajustes: cómo se parten las horas extra ── */}
      <GlassPanel className="p-4">
        <div className="mb-3 font-medium">{t("ui.GustoHoras.reglaTitulo", "Horas extra")}</div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-soft)" }}>
              {t("ui.GustoHoras.regla", "Regla")}
            </span>
            <select
              className={FIELD_CLS}
              disabled={!puede || !ajustes}
              value={ajustes?.regla || "federal"}
              onChange={(e) => guardarAjuste({ regla: e.target.value as ReglaDeExtras })}
            >
              {REGLAS.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-soft)" }}>
              {t("ui.GustoHoras.semanaEmpieza", "La semana laboral empieza el")}
            </span>
            <select
              className={FIELD_CLS}
              disabled={!puede || !ajustes}
              value={ajustes?.semanaEmpieza ?? 0}
              onChange={(e) => guardarAjuste({ semanaEmpieza: Number(e.target.value) })}
            >
              {DIAS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
          {t(
            "ui.GustoHoras.reglaNota",
            "Gusto no calcula las horas extra: se las enviamos ya separadas. Un turno cuenta para el día en que empieza. Revisa la regla con tu asesor si trabajas en varios estados.",
          )}
        </p>
      </GlassPanel>

      {/* ── El periodo ── */}
      <GlassPanel className="p-4">
        <div className="mb-3 font-medium">{t("ui.GustoHoras.periodoTitulo", "Periodo")}</div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-soft)" }}>
              {t("ui.GustoHoras.periodoGusto", "Periodo de pago en Gusto")}
            </span>
            <select
              className={FIELD_CLS}
              disabled={periodos === null}
              value={elegido}
              onChange={(e) => elegirPeriodo(periodos?.find((p) => claveDe(p) === e.target.value) || null)}
            >
              <option value="">{t("ui.GustoHoras.fechasAMano", "Fechas a mano (sin sincronizar la nómina)")}</option>
              {(periodos || []).map((p) => (
                <option key={claveDe(p)} value={claveDe(p)}>
                  {fecha(p.inicio)} – {fecha(p.fin)}
                  {p.calendario ? ` · ${p.calendario}` : ""}
                  {p.procesada ? ` · ${t("ui.GustoHoras.yaPagado", "ya pagado")}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-soft)" }}>
              {t("ui.GustoHoras.desde", "Desde")}
            </span>
            <input
              className={FIELD_CLS}
              disabled={!!periodo}
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-soft)" }}>
              {t("ui.GustoHoras.hasta", "Hasta")}
            </span>
            <input
              className={FIELD_CLS}
              disabled={!!periodo}
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
            />
          </label>
        </div>
        {errorPeriodos && (
          <InfoNote className="mt-3" icon={<Info />} tone="warn">
            {t("ui.GustoHoras.sinPeriodos", "No pudimos leer los periodos de pago de Gusto:")} {errorPeriodos}
          </InfoNote>
        )}
        {periodo?.procesada && (
          <InfoNote className="mt-3" icon={<TriangleAlert />} tone="warn">
            {t(
              "ui.GustoHoras.periodoPagado",
              "La nómina de este periodo ya se procesó en Gusto. Lo que envíes ahora tendrás que pagarlo con una nómina extra (off-cycle) en Gusto.",
            )}
          </InfoNote>
        )}
        {!periodo && (
          <p className="mt-2 text-xs" style={{ color: "var(--ink-faint)" }}>
            {t(
              "ui.GustoHoras.notaAMano",
              "Con fechas a mano las horas llegan a Gusto, pero tendrás que sincronizarlas con la nómina desde Gusto.",
            )}
          </p>
        )}
      </GlassPanel>

      {/* ── Lo que se enviaría ── */}
      {cargandoVista && !vista ? (
        <SkeletonCards count={3} />
      ) : errorVista ? (
        <InfoNote icon={<Info />} tone="bad">
          {errorVista}
        </InfoNote>
      ) : vista && r ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              [t("ui.GustoHoras.cifraTurnos", "Turnos aprobados"), `${r.turnos}`],
              [t("ui.GustoHoras.cifraOrdinarias", "Ordinarias"), `${r.regular} h`],
              [t("ui.GustoHoras.cifraExtra", "Extra"), `${r.extra} h`],
              [t("ui.GustoHoras.cifraDoble", "Doble"), `${r.doble} h`],
            ].map(([etiqueta, valor]) => (
              <GlassPanel key={etiqueta} className="p-4">
                <div className="text-xs" style={{ color: "var(--ink-faint)" }}>
                  {etiqueta}
                </div>
                <div className="mt-1 text-xl font-semibold">{valor}</div>
              </GlassPanel>
            ))}
          </div>

          {r.porRevisar > 0 && (
            <InfoNote icon={<Clock />} tone="warn">
              {t("ui.GustoHoras.porRevisar", {
                n: r.porRevisar,
                defaultValue: "{{n}} turnos de este periodo aún no están aprobados y no se enviarán.",
              })}{" "}
              <Link className="underline" to="/nomina/records">
                {t("ui.GustoHoras.irAAprobar", "Revisarlos en Nómina")}
              </Link>
            </InfoNote>
          )}
          {r.sinVincular > 0 && (
            <InfoNote icon={<TriangleAlert />} tone="warn">
              {t("ui.GustoHoras.sinVincular", {
                n: r.sinVincular,
                defaultValue: "{{n}} personas con horas no están vinculadas a Gusto; sus horas no se enviarán.",
              })}{" "}
              <button className="underline" type="button" onClick={alIrAEmpleados}>
                {t("ui.GustoHoras.irAVincular", "Vincularlas")}
              </button>
            </InfoNote>
          )}

          {vista.personas.length === 0 ? (
            <EmptyState
              description={t(
                "ui.GustoHoras.vacioTexto",
                "No hay turnos cerrados en estas fechas. Las horas salen de Nómina › Registros.",
              )}
              icon={<Clock />}
              title={t("ui.GustoHoras.vacio", "Sin horas en este periodo")}
            />
          ) : (
            <GlassPanel className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs" style={{ color: "var(--ink-faint)" }}>
                    <th className="p-3 font-medium">{t("ui.GustoHoras.colPersona", "Persona")}</th>
                    <th className="p-3 text-right font-medium">{t("ui.GustoHoras.colTurnos", "Turnos")}</th>
                    <th className="p-3 text-right font-medium">{t("ui.GustoHoras.cifraOrdinarias", "Ordinarias")}</th>
                    <th className="p-3 text-right font-medium">{t("ui.GustoHoras.cifraExtra", "Extra")}</th>
                    <th className="p-3 text-right font-medium">{t("ui.GustoHoras.cifraDoble", "Doble")}</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.personas.map((p) => (
                    <tr key={p.userId} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.nombre}</span>
                          {!p.vinculado && (
                            <StatusBadge tone="warn">{t("ui.GustoHoras.noVinculado", "Sin vincular")}</StatusBadge>
                          )}
                          {p.porRevisar > 0 && (
                            <StatusBadge dot={false} tone="neutral">
                              {t("ui.GustoHoras.pendientes", { n: p.porRevisar, defaultValue: "{{n}} por aprobar" })}
                            </StatusBadge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums">{p.turnos}</td>
                      <td className="p-3 text-right tabular-nums">{p.regular}</td>
                      <td className="p-3 text-right tabular-nums">{p.extra || "—"}</td>
                      <td className="p-3 text-right tabular-nums">{p.doble || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </GlassPanel>
          )}

          {puede && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {progreso && (
                <div className="min-w-56 flex-1">
                  <Meter
                    label={t("ui.GustoHoras.enviando", {
                      hechos: progreso.hechos,
                      total: progreso.total,
                      defaultValue: "Enviando {{hechos}} de {{total}}…",
                    })}
                    max={Math.max(1, progreso.total)}
                    value={progreso.hechos}
                  />
                </div>
              )}
              <Button disabled={enCurso || r.turnos === 0} onClick={enviar}>
                <Send />
                {enCurso ? t("ui.GustoHoras.enCurso", "Enviando…") : t("ui.GustoHoras.enviar", "Enviar a Gusto")}
              </Button>
            </div>
          )}
        </>
      ) : null}

      {/* ── Envíos anteriores ── */}
      {envios.length > 0 && (
        <GlassPanel className="p-4">
          <div className="mb-3 font-medium">{t("ui.GustoHoras.historial", "Envíos anteriores")}</div>
          <ul className="space-y-3">
            {envios.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {e.estado === "done" && (e.cuenta?.fallidos || 0) === 0 ? (
                    <CheckCircle2 className="size-4" style={{ color: "var(--ok)" }} />
                  ) : e.estado === "running" ? (
                    <Clock className="size-4" style={{ color: "var(--ink-faint)" }} />
                  ) : (
                    <TriangleAlert className="size-4" style={{ color: "var(--warn)" }} />
                  )}
                  <span className="font-medium">
                    {fecha(e.inicio)} – {fecha(e.fin)}
                  </span>
                  <span style={{ color: "var(--ink-faint)" }}>{momento(e.empezadoEn)}</span>
                  {e.sincronizacion && (
                    <StatusBadge
                      tone={
                        e.sincronizacion === "failure" ? "bad" : e.sincronizacion === "nothing_to_sync" ? "neutral" : "info"
                      }
                    >
                      {e.sincronizacion === "failure"
                        ? t("ui.GustoHoras.syncFallo", "Nómina sin sincronizar")
                        : e.sincronizacion === "nothing_to_sync"
                          ? t("ui.GustoHoras.syncNada", "Nada nuevo para la nómina")
                          : t("ui.GustoHoras.syncPedida", "Sincronización pedida")}
                    </StatusBadge>
                  )}
                </div>
                {e.cuenta && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--ink-soft)" }}>
                    {t("ui.GustoHoras.cuenta", {
                      creados: e.cuenta.creados,
                      actualizados: e.cuenta.actualizados,
                      borrados: e.cuenta.borrados,
                      iguales: e.cuenta.iguales,
                      fallidos: e.cuenta.fallidos,
                      defaultValue:
                        "{{creados}} nuevos · {{actualizados}} actualizados · {{borrados}} retirados · {{iguales}} sin cambios · {{fallidos}} con error",
                    })}
                  </div>
                )}
                {e.errores?.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: "var(--bad)" }}>
                    {e.errores.slice(0, 5).map((x, i) => (
                      <li key={i}>{x.mensaje}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}
    </div>
  );
}
