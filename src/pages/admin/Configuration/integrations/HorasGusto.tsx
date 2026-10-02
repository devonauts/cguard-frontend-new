import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  Send,
  TriangleAlert,
} from "lucide-react";

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
import { useGusto } from "@/hooks/useGusto";
import { hoyEnLaEmpresa, sumaDias } from "@/lib/horaDeLaEmpresa";
import {
  gustoService,
  type AjustesDeHoras,
  type CategoriaLibre,
  type OpcionesDeAjustes,
  type ComoPaga,
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


export default function HorasGusto({
  alIrAEmpleados,
}: {
  alIrAEmpleados: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { hasPermission } = usePermissions();
  const puede = hasPermission("payrollIntegrationManage");
  const { data: conexion } = useGusto();

  const [ajustes, setAjustes] = useState<AjustesDeHoras | null>(null);
  const [opciones, setOpciones] = useState<OpcionesDeAjustes | null>(null);
  const [periodos, setPeriodos] = useState<PeriodoDePago[] | null>(null);
  const [errorPeriodos, setErrorPeriodos] = useState<string | null>(null);
  const [elegido, setElegido] = useState<string>("");
  const [inicio, setInicio] = useState(() => sumaDias(hoyEnLaEmpresa(), -13));
  const [fin, setFin] = useState(() => hoyEnLaEmpresa());
  const [vista, setVista] = useState<VistaPreviaDeHoras | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [errorVista, setErrorVista] = useState<string | null>(null);
  const [envios, setEnvios] = useState<EnvioDeHoras[]>([]);
  const [progreso, setProgreso] = useState<{
    envioId: string;
    hechos: number;
    total: number;
  } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const fecha = useCallback(
    (v: string) =>
      new Intl.DateTimeFormat(i18n.language, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${v}T00:00:00Z`)),
    [i18n.language],
  );
  const momento = (v: string | null) =>
    v
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(v))
      : "—";

  const REGLAS: Array<{ value: ReglaDeExtras; label: string }> = [
    {
      value: "federal",
      label: t(
        "ui.GustoHoras.reglaFederal",
        "Federal: más de 40 h a la semana (Texas y la mayoría de estados)",
      ),
    },
    {
      value: "california",
      label: t(
        "ui.GustoHoras.reglaCalifornia",
        "California: también por día (más de 8 h) y 7.º día",
      ),
    },
    {
      value: "none",
      label: t(
        "ui.GustoHoras.reglaNinguna",
        "Sin horas extra (todo ordinario)",
      ),
    },
  ];
  const DIAS = useMemo(
    () =>
      Array.from({ length: 7 }, (_, d) =>
        new Intl.DateTimeFormat(i18n.language, {
          weekday: "long",
          timeZone: "UTC",
        }).format(
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
        setOpciones(await gustoService.opcionesDeAjustes().catch(() => null));
      } catch {
        /* sin ajustes se usa la regla federal del servidor */
      }
    })();
    void (async () => {
      try {
        const p = await gustoService.periodosDePago();

        setPeriodos(p);
        // El periodo abierto más reciente que ya terminó o está en curso.
        // «Hoy» de la EMPRESA, no el UTC: a las 21:00 en Texas el UTC ya es mañana.
        const hoy = hoyEnLaEmpresa();
        const abierto =
          p.find((x) => !x.procesada && x.inicio <= hoy) ||
          p.find((x) => !x.procesada);

        if (abierto) elegirPeriodo(abierto);
      } catch (e: any) {
        setPeriodos([]);
        setErrorPeriodos(e?.message || null);
      }
    })();
    void cargarEnvios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claveDe = (p: PeriodoDePago) =>
    `${p.payScheduleUuid}|${p.inicio}|${p.fin}`;
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

  /* Sólo vale la ÚLTIMA vista previa pedida. Antes, la del rango por defecto
     podía llegar DESPUÉS de la del periodo de Gusto recién elegido y pisarla:
     la pantalla enseñaba cifras de otro rango (visto: «23 turnos» en un
     periodo con 6). Y no se pide nada hasta saber los periodos de Gusto, que
     son los que deciden el rango inicial. */
  const ultimoPedido = useRef(0);
  const cargarVista = useCallback(async () => {
    if (periodos === null || !inicio || !fin || inicio > fin) return;
    const mio = ++ultimoPedido.current;
    setCargandoVista(true);
    setErrorVista(null);
    try {
      const v = await gustoService.vistaPrevia(inicio, fin);

      if (mio === ultimoPedido.current) setVista(v);
    } catch (e: any) {
      if (mio !== ultimoPedido.current) return;
      setVista(null);
      setErrorVista(
        e?.message ||
          t("ui.GustoHoras.noCargo", "No pudimos calcular las horas."),
      );
    } finally {
      if (mio === ultimoPedido.current) setCargandoVista(false);
    }
  }, [inicio, fin, t, periodos]);

  // Lo que se ve es del periodo elegido (si no, no se deja enviar).
  const vistaAlDia = !!vista && vista.periodo.inicio === inicio && vista.periodo.fin === fin;

  useEffect(() => {
    void cargarVista();
  }, [cargarVista, ajustes?.regla, ajustes?.semanaEmpieza]);

  // Progreso del envío por websocket.
  useEffect(() => {
    const oir = (e: Event) => {
      const d: any = (e as CustomEvent).detail || {};

      if (d.estado === "running") {
        setProgreso({
          envioId: d.envioId,
          hechos: d.hechos || 0,
          total: d.total || 0,
        });
      } else if (d.estado === "done" || d.estado === "failed") {
        setProgreso(null);
        setEnviando(false);
        void cargarEnvios();
        // Lo pendiente cambia al enviar: sin esto el paso 3 seguía diciendo
        // «1 cambio por enviar» con todo ya en Gusto (visto en el navegador).
        void cargarVista();
        if (d.estado === "done")
          toast.success(t("ui.GustoHoras.enviado", "Horas enviadas a Gusto."));
        else
          toast.error(
            t(
              "ui.GustoHoras.envioFallo",
              "El envío a Gusto falló. Mira el detalle abajo.",
            ),
          );
      }
    };

    window.addEventListener("cg:gusto-envio", oir);

    return () => window.removeEventListener("cg:gusto-envio", oir);
  }, [cargarEnvios, cargarVista, t]);

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
        void cargarVista();
      }
    }, 5000);

    return () => window.clearInterval(id);
  }, [enCurso, cargarVista]);

  const guardarAjuste = async (
    cambios: Partial<Pick<AjustesDeHoras, "regla" | "semanaEmpieza" | "reglasPorPuesto" | "politicasDeTiempoLibre">>,
  ) => {
    try {
      setAjustes(await gustoService.guardarAjustesDeHoras(cambios));
    } catch (e: any) {
      toast.error(
        e?.message || t("ui.GustoHoras.noGuardo", "No se pudo guardar."),
      );
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
      const r = await gustoService.enviarHoras(
        inicio,
        fin,
        periodo?.payScheduleUuid || null,
      );

      setProgreso({
        envioId: r.envioId,
        hechos: 0,
        total: vista.resumen.turnos,
      });
      void cargarEnvios();
    } catch (e: any) {
      setEnviando(false);
      toast.error(
        e?.message ||
          t(
            "ui.GustoHoras.envioFallo",
            "El envío a Gusto falló. Mira el detalle abajo.",
          ),
      );
    }
  };

  const r = vista?.resumen;

  /* Los tres pasos, en el orden en que se hacen: conectar y vincular (una vez,
     en Ajustes), aprobar en Registros (cada periodo) y enviar (aquí). Cada uno
     dice en qué está y lleva a donde se hace. */
  // Notas de corrección: las nuevas traen `tipo`; las guardadas antes, sólo el texto.
  const esNota = (x: { tipo?: string; mensaje: string }) => x.tipo === "sobrante" || /^Gusto conservaba /.test(x.mensaje);
  const pendientes = r ? r.porEnviar.nuevos + r.porEnviar.cambiados + r.porEnviar.retirar : 0;
  const pasos: Array<{
    n: number;
    titulo: string;
    detalle: string;
    listo: boolean;
    to?: string;
    onClick?: () => void;
  }> = [
    {
      n: 1,
      titulo: t("ui.GustoHoras.paso1", "Conexión"),
      detalle: conexion?.compania?.nombre
        ? t("ui.GustoHoras.paso1Hecho", {
            compania: conexion.compania.nombre,
            defaultValue: "Conectado a {{compania}} · empleados vinculados",
          })
        : t(
            "ui.GustoHoras.paso1Falta",
            "Conecta Gusto y vincula a tu personal",
          ),
      listo: !!conexion?.conectado && !(r && r.sinVincular > 0),
      onClick: alIrAEmpleados,
    },
    {
      n: 2,
      titulo: t("ui.GustoHoras.paso2", "Aprobar en Registros"),
      detalle:
        r && r.porRevisar > 0
          ? t("ui.GustoHoras.paso2Falta", {
              n: r.porRevisar,
              defaultValue: "{{n}} turnos por aprobar",
            })
          : t("ui.GustoHoras.paso2Hecho", "Todo aprobado en este periodo"),
      listo: !!r && r.porRevisar === 0,
      to: "/nomina/records",
    },
    {
      n: 3,
      titulo: t("ui.GustoHoras.paso3", "Enviar a Gusto"),
      // «Hecho» = no queda NADA por mandar respecto a lo enviado (no basta con
      // que haya un envío del periodo: después se pudo rechazar o corregir algo).
      detalle: !r
        ? "—"
        : pendientes > 0
          ? t("ui.GustoHoras.paso3Pendiente", { count: pendientes, defaultValue: "{{count}} cambios por enviar" })
          : r.turnos > 0
            ? t("ui.GustoHoras.paso3AlDia", "Todo enviado a Gusto")
            : t("ui.GustoHoras.paso3Detalle", { n: 0, defaultValue: "{{n}} turnos listos para enviar" }),
      listo: !!r && r.turnos > 0 && pendientes === 0,
    },
  ];

  // Cómo acabó la sincronización con la nómina (lo dice Gusto; ver `envios`).
  const SYNC: Record<string, ["ok" | "warn" | "bad" | "info" | "neutral", string]> = {
    pending: ["info", t("ui.GustoHoras.syncPedida", "Sincronización pedida")],
    in_progress: ["info", t("ui.GustoHoras.syncPedida", "Sincronización pedida")],
    success: ["ok", t("ui.GustoHoras.syncOk", "En la nómina de Gusto")],
    partial_success: ["warn", t("ui.GustoHoras.syncParcial", "En la nómina, con avisos")],
    failure: ["bad", t("ui.GustoHoras.syncFallo", "Nómina sin sincronizar")],
    nothing_to_sync: ["neutral", t("ui.GustoHoras.syncNada", "Nada nuevo para la nómina")],
  };

  const PAGO: Record<ComoPaga, string> = {
    hora: "",
    contratista: t("ui.GustoHoras.pagoContratista", "Contratista 1099 por hora: todas sus horas van como ordinarias (sin horas extra)"),
    contratista_fijo: t("ui.GustoHoras.pagoContratistaFijo", "Contratista 1099 de pago fijo: Gusto no usa horas, no se envían"),
    asalariado: t(
      "ui.GustoHoras.pagoAsalariado",
      "Sueldo fijo no exento: Gusto paga las horas enviadas al valor hora del sueldo",
    ),
    exento: t(
      "ui.GustoHoras.pagoExento",
      "Exento en Gusto: sus horas no se envían (Gusto las ignora)",
    ),
  };

  return (
    <div className="space-y-4">
      {/* ── 1 · 2 · 3 ── */}
      <ol className="grid gap-2 sm:grid-cols-3">
        {pasos.map((p) => {
          const cuerpo = (
            <>
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold"
                style={{
                  background: p.listo
                    ? "var(--ok)"
                    : "var(--surface-2, var(--hairline))",
                  color: p.listo ? "var(--on-ok, #fff)" : "var(--ink-soft)",
                }}
              >
                {p.listo ? <CheckCircle2 className="size-4" /> : p.n}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-medium">{p.titulo}</span>
                <span
                  className="block truncate text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {p.detalle}
                </span>
              </span>
              {(p.to || p.onClick) && (
                <ChevronRight
                  className="size-4 shrink-0"
                  style={{ color: "var(--ink-faint)" }}
                />
              )}
            </>
          );
          const cls = "flex w-full items-center gap-3 p-3";

          return (
            <li key={p.n}>
              <GlassPanel className="h-full">
                {p.to ? (
                  <Link className={cls} to={p.to}>
                    {cuerpo}
                  </Link>
                ) : p.onClick ? (
                  <button className={cls} type="button" onClick={p.onClick}>
                    {cuerpo}
                  </button>
                ) : (
                  <div className={cls}>{cuerpo}</div>
                )}
              </GlassPanel>
            </li>
          );
        })}
      </ol>

      {/* ── Ajustes: cómo se parten las horas extra ── */}
      <GlassPanel className="p-4">
        <div className="mb-3 font-medium">
          {t("ui.GustoHoras.reglaTitulo", "Horas extra")}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-soft)" }}>
              {t("ui.GustoHoras.regla", "Regla")}
            </span>
            <select
              className={FIELD_CLS}
              disabled={!puede || !ajustes}
              value={ajustes?.regla || "federal"}
              onChange={(e) =>
                guardarAjuste({ regla: e.target.value as ReglaDeExtras })
              }
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
              onChange={(e) =>
                guardarAjuste({ semanaEmpieza: Number(e.target.value) })
              }
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

      {/* ── Por puesto y tiempo libre ── */}
      {ajustes && opciones && (
        <GlassPanel className="p-4">
          <div className="mb-1 font-medium">{t("ui.GustoHoras.porPuestoTitulo", "Regla por puesto")}</div>
          <p className="mb-3 text-xs" style={{ color: "var(--ink-faint)" }}>
            {t(
              "ui.GustoHoras.porPuestoNota",
              "Si tienes puestos en otro estado (p. ej. California), elige su regla. Las 40 h semanales suman todos los puestos; el límite diario de California sólo cuenta lo trabajado allí.",
            )}
          </p>
          {opciones.puestos.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--ink-faint)" }}>{t("ui.GustoHoras.sinPuestos", "No hay puestos.")}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {opciones.puestos.map((pu) => (
                <label key={pu.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{pu.nombre}</span>
                    {pu.ciudad && <span className="block truncate text-xs" style={{ color: "var(--ink-faint)" }}>{pu.ciudad}</span>}
                  </span>
                  <select
                    className={`${FIELD_CLS} max-w-56`}
                    disabled={!puede}
                    value={ajustes.reglasPorPuesto?.[pu.id] || ""}
                    onChange={(e) =>
                      guardarAjuste({
                        reglasPorPuesto: { ...(ajustes.reglasPorPuesto || {}), [pu.id]: (e.target.value || null) as any },
                      })
                    }
                  >
                    <option value="">{t("ui.GustoHoras.reglaDeLaEmpresa", "La de la empresa")}</option>
                    <option value="federal">{t("ui.GustoHoras.reglaFederalCorta", "Federal (40 h/semana)")}</option>
                    <option value="california">{t("ui.GustoHoras.reglaCaliforniaCorta", "California (diaria y 7.º día)")}</option>
                    <option value="none">{t("ui.GustoHoras.reglaNingunaCorta", "Sin horas extra")}</option>
                  </select>
                </label>
              ))}
            </div>
          )}

          <div className="mb-1 mt-5 font-medium">{t("ui.GustoHoras.libreTitulo", "Tiempo libre pagado")}</div>
          <p className="mb-3 text-xs" style={{ color: "var(--ink-faint)" }}>
            {t(
              "ui.GustoHoras.libreNota",
              "Vacaciones (V), enfermedad y permisos pagados de Nómina se envían a la política de Gusto que elijas, con las horas del turno programado ese día. Sin política, no se envían.",
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["vacaciones", "enfermedad", "permiso"] as CategoriaLibre[]).map((cat) => (
              <label key={cat} className="text-sm">
                <span className="mb-1 block" style={{ color: "var(--ink-soft)" }}>
                  {cat === "vacaciones"
                    ? t("ui.GustoHoras.libreVacaciones", "Vacaciones")
                    : cat === "enfermedad"
                      ? t("ui.GustoHoras.libreEnfermedad", "Enfermedad")
                      : t("ui.GustoHoras.librePermiso", "Permiso pagado")}
                </span>
                <select
                  className={FIELD_CLS}
                  disabled={!puede}
                  value={ajustes.politicasDeTiempoLibre?.[cat] || ""}
                  onChange={(e) =>
                    guardarAjuste({
                      politicasDeTiempoLibre: { ...(ajustes.politicasDeTiempoLibre || {}), [cat]: e.target.value || null } as any,
                    })
                  }
                >
                  <option value="">{t("ui.GustoHoras.libreNoEnviar", "No enviar")}</option>
                  {opciones.politicas.map((po) => (
                    <option key={po.uuid} value={po.uuid}>{po.nombre}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </GlassPanel>
      )}

      {/* ── El periodo ── */}
      <GlassPanel className="p-4">
        <div className="mb-3 font-medium">
          {t("ui.GustoHoras.periodoTitulo", "Periodo")}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <label className="text-sm">
            <span className="mb-1 block" style={{ color: "var(--ink-soft)" }}>
              {t("ui.GustoHoras.periodoGusto", "Periodo de pago en Gusto")}
            </span>
            <select
              className={FIELD_CLS}
              disabled={periodos === null}
              value={elegido}
              onChange={(e) =>
                elegirPeriodo(
                  periodos?.find((p) => claveDe(p) === e.target.value) || null,
                )
              }
            >
              <option value="">
                {t(
                  "ui.GustoHoras.fechasAMano",
                  "Fechas a mano (sin sincronizar la nómina)",
                )}
              </option>
              {(periodos || []).map((p) => (
                <option key={claveDe(p)} value={claveDe(p)}>
                  {fecha(p.inicio)} – {fecha(p.fin)}
                  {p.calendario ? ` · ${p.calendario}` : ""}
                  {p.procesada
                    ? ` · ${t("ui.GustoHoras.yaPagado", "ya pagado")}`
                    : ""}
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
            {t(
              "ui.GustoHoras.sinPeriodos",
              "No pudimos leer los periodos de pago de Gusto:",
            )}{" "}
            {errorPeriodos}
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
              [
                t("ui.GustoHoras.cifraTurnos", "Turnos aprobados"),
                `${r.turnos}`,
              ],
              [
                t("ui.GustoHoras.cifraOrdinarias", "Ordinarias"),
                `${r.regular} h`,
              ],
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
                defaultValue:
                  "{{n}} turnos de este periodo aún no están aprobados y no se enviarán.",
              })}{" "}
              <Link className="underline" to="/nomina/records">
                {t("ui.GustoHoras.irAAprobar", "Revisarlos en Nómina")}
              </Link>
            </InfoNote>
          )}
          {r.exentos > 0 && (
            <InfoNote icon={<TriangleAlert />} tone="warn">
              {t("ui.GustoHoras.avisoExentos", {
                n: r.exentos,
                defaultValue:
                  "{{n}} personas son exentas en Gusto: Gusto no usa sus horas (paga su sueldo o 80 h por defecto), así que no se envían. Si deben cobrar por horas, márcalas como no exentas en Gusto (la persona › Job & pay).",
              })}
            </InfoNote>
          )}
          {(r.libre?.diasSinPolitica || 0) > 0 && (
            <InfoNote icon={<Info />} tone="info">
              {t("ui.GustoHoras.avisoLibreSinPolitica", {
                n: r.libre!.diasSinPolitica,
                defaultValue: "{{n}} días de tiempo libre no se enviarán porque su clase no tiene política de Gusto elegida (arriba, «Tiempo libre pagado»).",
              })}
            </InfoNote>
          )}
          {(r.contratistasFijos || 0) > 0 && (
            <InfoNote icon={<Info />} tone="warn">
              {t("ui.GustoHoras.avisoContratistasFijos", {
                n: r.contratistasFijos,
                defaultValue: "{{n}} contratistas 1099 cobran pago fijo en Gusto: sus horas no se envían.",
              })}
            </InfoNote>
          )}
          {r.fueraDeNomina > 0 && (
            <InfoNote icon={<TriangleAlert />} tone="bad">
              {t("ui.GustoHoras.avisoFueraDeNomina", {
                n: r.fueraDeNomina,
                defaultValue:
                  "{{n}} personas no entrarán en la nómina de Gusto aunque les lleguen las horas: tienen el alta sin terminar en Gusto o trabajaron antes de su fecha de contratación. Complétalo en Gusto (la persona › Onboarding / Job) y vuelve a enviar.",
              })}
            </InfoNote>
          )}
          {r.asalariados > 0 && (
            <InfoNote icon={<Info />} tone="warn">
              {t("ui.GustoHoras.avisoAsalariados", {
                n: r.asalariados,
                defaultValue:
                  "{{n}} personas tienen sueldo fijo no exento en Gusto: Gusto les paga SÓLO las horas que envíes, al valor hora de su sueldo. Aprueba y envía todas las del periodo o cobrarán de menos.",
              })}
            </InfoNote>
          )}
          {r.sinVincular > 0 && (
            <InfoNote icon={<TriangleAlert />} tone="warn">
              {t("ui.GustoHoras.sinVincular", {
                n: r.sinVincular,
                defaultValue:
                  "{{n}} personas con horas no están vinculadas a Gusto; sus horas no se enviarán.",
              })}{" "}
              <button
                className="underline"
                type="button"
                onClick={alIrAEmpleados}
              >
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
                  <tr
                    className="text-left text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    <th className="p-3 font-medium">
                      {t("ui.GustoHoras.colPersona", "Persona")}
                    </th>
                    <th className="p-3 text-right font-medium">
                      {t("ui.GustoHoras.colTurnos", "Turnos")}
                    </th>
                    <th className="p-3 text-right font-medium">
                      {t("ui.GustoHoras.cifraOrdinarias", "Ordinarias")}
                    </th>
                    <th className="p-3 text-right font-medium">
                      {t("ui.GustoHoras.cifraExtra", "Extra")}
                    </th>
                    <th className="p-3 text-right font-medium">
                      {t("ui.GustoHoras.cifraDoble", "Doble")}
                    </th>
                    <th className="p-3 text-right font-medium">
                      {t("ui.GustoHoras.cifraLibre", "Libre")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vista.personas.map((p) => (
                    <tr
                      key={p.userId}
                      className="border-t"
                      style={{ borderColor: "var(--hairline)" }}
                    >
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.nombre}</span>
                          {!p.vinculado && (
                            <StatusBadge tone="warn">
                              {t("ui.GustoHoras.noVinculado", "Sin vincular")}
                            </StatusBadge>
                          )}
                          {p.fueraDeNomina && (
                            <StatusBadge tone="bad">
                              {p.fueraDeNomina === "sin_alta"
                                ? t("ui.GustoHoras.insigniaSinAlta", "Alta sin terminar en Gusto")
                                : t("ui.GustoHoras.insigniaAntesDeContratar", "Antes de su contratación en Gusto")}
                            </StatusBadge>
                          )}
                          {(p.comoPaga === "contratista" || p.comoPaga === "contratista_fijo") && (
                            <span title={PAGO[p.comoPaga]}>
                              <StatusBadge tone={p.comoPaga === "contratista_fijo" ? "bad" : "info"}>
                                {p.comoPaga === "contratista_fijo"
                                  ? t("ui.GustoHoras.insigniaContratistaFijo", "1099 · pago fijo · no se envía")
                                  : t("ui.GustoHoras.insigniaContratista", "Contratista 1099")}
                              </StatusBadge>
                            </span>
                          )}
                          {p.comoPaga && ["asalariado", "exento"].includes(p.comoPaga) && (
                            <span title={PAGO[p.comoPaga]}>
                              <StatusBadge
                                tone={p.comoPaga === "exento" ? "bad" : "warn"}
                              >
                                {p.comoPaga === "exento"
                                  ? t(
                                      "ui.GustoHoras.insigniaExento",
                                      "Asalariado exento",
                                    )
                                  : t(
                                      "ui.GustoHoras.insigniaAsalariado",
                                      "Asalariado",
                                    )}
                              </StatusBadge>
                            </span>
                          )}
                          {p.porRevisar > 0 && (
                            <StatusBadge dot={false} tone="neutral">
                              {t("ui.GustoHoras.pendientes", {
                                n: p.porRevisar,
                                defaultValue: "{{n}} por aprobar",
                              })}
                            </StatusBadge>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {p.turnos}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {p.regular}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {p.extra || "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {p.doble || "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums" title={p.libre ? `V ${p.libre.vacaciones} · E ${p.libre.enfermedad} · P ${p.libre.permiso}` : ""}>
                        {p.libre && p.libre.vacaciones + p.libre.enfermedad + p.libre.permiso > 0
                          ? Math.round((p.libre.vacaciones + p.libre.enfermedad + p.libre.permiso) * 100) / 100
                          : "—"}
                      </td>
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
              <Button disabled={enCurso || r.turnos === 0 || !vistaAlDia || cargandoVista} onClick={enviar}>
                <Send />
                {enCurso
                  ? t("ui.GustoHoras.enCurso", "Enviando…")
                  : t("ui.GustoHoras.enviar", "Enviar a Gusto")}
              </Button>
            </div>
          )}
        </>
      ) : null}

      {/* ── Envíos anteriores ── */}
      {envios.length > 0 && (
        <GlassPanel className="p-4">
          <div className="mb-3 font-medium">
            {t("ui.GustoHoras.historial", "Envíos anteriores")}
          </div>
          <ul className="space-y-3">
            {envios.map((e) => (
              <li key={e.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {e.estado === "done" && (e.cuenta?.fallidos || 0) === 0 ? (
                    <CheckCircle2
                      className="size-4"
                      style={{ color: "var(--ok)" }}
                    />
                  ) : e.estado === "running" ? (
                    <Clock
                      className="size-4"
                      style={{ color: "var(--ink-faint)" }}
                    />
                  ) : (
                    <TriangleAlert
                      className="size-4"
                      style={{ color: "var(--warn)" }}
                    />
                  )}
                  <span className="font-medium">
                    {fecha(e.inicio)} – {fecha(e.fin)}
                  </span>
                  <span style={{ color: "var(--ink-faint)" }}>
                    {momento(e.empezadoEn)}
                  </span>
                  {e.sincronizacion && (
                    <StatusBadge tone={SYNC[e.sincronizacion]?.[0] || "info"}>
                      {SYNC[e.sincronizacion]?.[1] || SYNC.pending[1]}
                    </StatusBadge>
                  )}
                </div>
                {e.cuenta && (
                  <div
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t("ui.GustoHoras.cuenta", {
                      creados: e.cuenta.creados,
                      actualizados: e.cuenta.actualizados,
                      borrados: e.cuenta.borrados,
                      iguales: e.cuenta.iguales,
                      fallidos: e.cuenta.fallidos,
                      defaultValue:
                        "{{creados}} nuevos · {{actualizados}} actualizados · {{borrados}} retirados · {{iguales}} sin cambios · {{fallidos}} con error",
                    })}
                  {(e.cuenta.libreEnviados || 0) + (e.cuenta.libreRetirados || 0) > 0 &&
                      ` · ${t("ui.GustoHoras.cuentaLibre", {
                        enviados: e.cuenta.libreEnviados || 0,
                        retirados: e.cuenta.libreRetirados || 0,
                        defaultValue: "tiempo libre: {{enviados}} días enviados, {{retirados}} retirados",
                      })}${e.cuenta.libreVia === "nomina" ? ` (${t("ui.GustoHoras.libreViaNomina", "directo en la nómina")})` : ""}`}
                  {(e.cuenta.sobrantes || 0) > 0 &&
                      ` · ${t("ui.GustoHoras.cuentaSobrantes", { n: e.cuenta.sobrantes, defaultValue: "{{n}} horas sobrantes corregidas en Gusto" })}`}
                  {(e.cuenta.exentos || 0) > 0 &&
                      ` · ${t("ui.GustoHoras.cuentaExentos", { n: e.cuenta.exentos, defaultValue: "{{n}} de exentos sin enviar" })}`}
                  </div>
                )}
                {/* Notas (correcciones hechas en Gusto) aparte de los errores, y en su idioma. */}
                {e.errores?.some((x) => esNota(x)) && (
                  <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: "var(--ink-soft)" }}>
                    {e.errores
                      .filter((x) => esNota(x))
                      .slice(0, 5)
                      .map((x, i) => (
                        <li key={i}>
                          {x.tipo !== "sobrante" ? x.mensaje : t("ui.GustoHoras.notaSobrante", {
                            horas: x.horas,
                            clase: x.clase,
                            persona: x.persona,
                            defaultValue: "Gusto conservaba {{horas}} h de «{{clase}}» de un envío anterior para {{persona}}: puestas a 0.",
                          })}
                        </li>
                      ))}
                  </ul>
                )}
                {e.errores?.some((x) => !esNota(x)) && (
                  <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: "var(--bad)" }}>
                    {e.errores
                      .filter((x) => !esNota(x))
                      .slice(0, 5)
                      .map((x, i) => (
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
