/**
 * TARJETAS DE NÓMINA — revisar, aprobar y exportar para pagar.
 *
 * Las otras pantallas de Nómina trabajan sobre MARCAJES sueltos. Aquí la unidad
 * es la TARJETA de una persona en un periodo, que es lo que se paga:
 *
 *      generar ──▶ borrador ──aprobar──▶ aprobada ──exportar──▶ exportada
 *
 * Dos cosas que la pantalla tiene que dejar claras, porque son las que evitan
 * pagar mal:
 *
 *   · una tarjeta con DÍAS SIN RESOLVER —el turno pasó, nadie fichó y nadie
 *     decidió nada— no se aprueba sola. Aprobarla es afirmar que esos días
 *     valen cero, y nadie lo ha afirmado. Se puede forzar, y entonces queda
 *     escrito quién lo hizo.
 *   · a quien no tiene TARIFA cargada se le ve: sus horas están, su importe
 *     va vacío. Es lo que permite detectarlo antes de emitir el pago y no
 *     después.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Lock,
  RefreshCw,
  RotateCcw,
  Wallet,
} from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import payrollService, {
  type EstadoTarjeta,
  type TarjetaDeNomina,
} from "@/lib/api/payrollService";
import attendanceService from "@/lib/api/attendanceService";
import DiasDeLaTarjeta from "./DiasDeLaTarjeta";
import { fmtDescanso } from "./shared";
import {
  diaDeLaEmpresa,
  instanteEnLaEmpresa,
  soloFechaCivil,
} from "@/lib/horaDeLaEmpresa";
import { usePermissions } from "@/hooks/usePermissions";
import {
  PageContainer,
  PageHeader,
  Section,
  MetricTile,
  Stagger,
  Toolbar,
  StatusBadge,
  EmptyState,
} from "@/components/kit";

/* El día de una tarjeta de tiempo es el de la EMPRESA. Con `toISOString` el
   rango por defecto se corría un día cada tarde: a las 18:00 de México ya era
   mañana en Greenwich, y «hasta hoy» dejaba fuera el turno en curso. */
const isoDay = (d: Date) => diaDeLaEmpresa(d);
const num = (v: unknown) => Number(v ?? 0);

/** Cifra alineada a la derecha, para poder comparar columnas de un vistazo. */
function Num({
  v,
  strong,
  tone,
}: {
  v: React.ReactNode;
  strong?: boolean;
  tone?: "warn" | "bad";
}) {
  return (
    <span
      className={`block text-right tabular-nums ${strong ? "font-semibold" : ""}`}
      style={
        tone ? { color: `var(--${tone}-text)`, fontWeight: 600 } : undefined
      }
    >
      {v}
    </span>
  );
}

const TONO: Record<EstadoTarjeta, "info" | "ok" | "neutral"> = {
  borrador: "info",
  aprobada: "ok",
  exportada: "neutral",
};

// [i18n key, Spanish default] — translated at render time.
const ETIQUETA_ROL: Record<string, [string, string]> = {
  vigilante: ["comun.vigilante", "Vigilante"],
  supervisor: ["comun.supervisor", "Supervisor"],
  oficina: ["ui.NominaShared.administrativo", "Administrativo"],
};

const ETIQUETA_ESTADO: Record<EstadoTarjeta, [string, string]> = {
  borrador: ["ui.NominaTimecards.estado.borrador", "borrador"],
  aprobada: ["ui.NominaTimecards.estado.aprobada", "aprobada"],
  exportada: ["ui.NominaTimecards.estado.exportada", "exportada"],
};

/* Cada cuánto se pregunta por un cálculo en curso, y hasta cuándo. El servidor
   tarda segundos; si en cinco minutos no ha contestado, algo se rompió y la
   pantalla deja de esperar en vez de quedarse «calculando» para siempre. */
const SONDEO_MS = 1500;
const ESPERA_MAXIMA_MS = 5 * 60 * 1000;

/** El último cierre se guarda como instante o, en datos viejos, como fecha a secas. */
const diaDelCierre = (v: string) =>
  soloFechaCivil(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date(v));

export default function NominaTimecards() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const puedeCerrar = hasPermission("attendanceSettingsEdit");
  const puedeVerAjustes = hasPermission("attendanceSettingsRead");
  const [desde, setDesde] = useState(isoDay(new Date(Date.now() - 14 * 864e5)));
  const [hasta, setHasta] = useState(isoDay(new Date()));
  const [rows, setRows] = useState<TarjetaDeNomina[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  /* La tarjeta abierta día por día —con su descanso de cada día—. */
  const [abierta, setAbierta] = useState<TarjetaDeNomina | null>(null);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  /* El cálculo del periodo corre en el servidor en segundo plano: aquí se
     guarda su id mientras se espera, y cuándo se pidió (para el tope). */
  const [calculo, setCalculo] = useState<string | null>(null);
  const pedidoEl = useRef(0);

  const cargar = useCallback(() => {
    setCargando(true);
    payrollService
      .listar({ desde, hasta })
      .then((d) => {
        setRows(d.rows || []);
        setSel([]);
      })
      .catch((e) => toast.error(
          e?.message ||
            t("ui.NominaTimecards.noSePudieronCargarLasTarjetas", "No se pudieron cargar las tarjetas"),
        ))
      .finally(() => setCargando(false));
  }, [desde, hasta]);

  /* El periodo lo decide la EMPRESA (semanal / quincenal / mensual), no una
     ventana fija de 14 días: dos empresas con periodos distintos verían lo
     mismo. Si el servidor no contesta, se queda con los 14 días — una lista con
     el rango equivocado es mejor que ninguna lista. */
  useEffect(() => {
    attendanceService
      .currentPeriod?.()
      .then((p: { from?: string; to?: string }) => {
        if (p?.from && p?.to) {
          setDesde(p.from.slice(0, 10));
          setHasta(p.to.slice(0, 10));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const seleccionadas = useMemo(
    () => rows.filter((r) => sel.includes(r.id)),
    [rows, sel],
  );

  const resumen = useMemo(() => {
    const suma = (f: (r: TarjetaDeNomina) => number) =>
      rows.reduce((n, r) => n + f(r), 0);

    return {
      personas: rows.length,
      horas: suma((r) => num(r.horas)),
      trabadas: rows.filter((r) => r.sinResolver > 0).length,
      sinTarifa: rows.filter((r) => r.tarifaCentavos == null).length,
      aprobadas: rows.filter((r) => r.estado !== "borrador").length,
      importe: suma((r) => (r.tarifaCentavos != null ? num(r.importeCentavos) : 0)),
      moneda: rows[0]?.moneda || "",
    };
  }, [rows]);

  const conAviso = async (
    accion: () => Promise<{ rechazadas?: Array<{ motivo: string }> }>,
    exito: string,
  ) => {
    setTrabajando(true);
    try {
      const out = await accion();
      const rech = out.rechazadas || [];

      toast.success(exito);
      // Los rechazos NO se esconden: son el motivo por el que alguien tendrá
      // que volver a esta pantalla, y en un toast que desaparece no se leen.
      if (rech.length) {
        toast.warning(
          rech.length > 1
            ? t("ui.NominaTimecards.sinProcesarYOtras", {
                count: rech.length,
                motivo: rech[0].motivo,
                defaultValue: "{{count}} sin procesar — {{motivo}} (y otras)",
              })
            : t("ui.NominaTimecards.sinProcesar", {
                count: rech.length,
                motivo: rech[0].motivo,
                defaultValue: "{{count}} sin procesar — {{motivo}}",
              }),
          { duration: 8000 },
        );
      }
      cargar();
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("ui.NominaTimecards.noSePudoCompletarLaAccion", "No se pudo completar la acción"),
      );
    } finally {
      setTrabajando(false);
    }
  };

  /* El último cierre de periodo. Lo guarda «Cerrar periodo» en los ajustes de
     asistencia; sin permiso para leerlos simplemente no se enseña. */
  const ajustes = useQuery({
    queryKey: ["attendance", "settings"],
    queryFn: () => attendanceService.getSettings(),
    enabled: puedeVerAjustes,
    staleTime: 60_000,
  });
  const ultimoCierre: string | null =
    (ajustes.data as { payroll?: { lastPeriodClose?: string | null } } | undefined)
      ?.payroll?.lastPeriodClose || null;

  const estadoCalculo = useQuery({
    queryKey: ["payroll", "generacion", calculo],
    queryFn: () => payrollService.estadoGeneracion(calculo as string),
    enabled: !!calculo,
    refetchInterval: (q) => {
      const e = q.state.data?.estado;

      if (e === "listo" || e === "fallo") return false;
      if (Date.now() - pedidoEl.current > ESPERA_MAXIMA_MS) return false;

      return SONDEO_MS;
    },
  });

  /* Cuando el cálculo termina —bien o mal— se dice y se suelta. */
  useEffect(() => {
    const d = estadoCalculo.data;

    if (!calculo) return;
    if (d?.estado === "listo") {
      toast.success(
        d.sinCambios
          ? t(
              "ui.NominaTimecards.periodoSinCambios",
              "No había cambios desde el último cálculo: las tarjetas ya estaban al día.",
            )
          : t("ui.NominaTimecards.periodoGenerado", "Periodo generado"),
        // Un solo aviso: el resultado va debajo del título, no en otro aparte.
        {
          description: t("ui.NominaTimecards.resultadoGenerar", {
            creadas: d.creadas ?? 0,
            actualizadas: d.actualizadas ?? 0,
            intactas: d.intactas ?? 0,
            defaultValue:
              "{{creadas}} creadas · {{actualizadas}} actualizadas · {{intactas}} intactas",
          }),
        },
      );
      setCalculo(null);
      cargar();
    } else if (d?.estado === "fallo" || estadoCalculo.isError) {
      toast.error(
        d?.error ||
          t(
            "ui.NominaTimecards.noSePudoCalcular",
            "No se pudieron calcular las tarjetas. Vuelve a intentarlo en unos minutos.",
          ),
      );
      setCalculo(null);
    } else if (Date.now() - pedidoEl.current > ESPERA_MAXIMA_MS) {
      toast.error(
        t(
          "ui.NominaTimecards.calculoTardaDemasiado",
          "El cálculo está tardando más de lo normal. Vuelve a esta pantalla en unos minutos.",
        ),
      );
      setCalculo(null);
    }
  }, [estadoCalculo.data, estadoCalculo.isError, estadoCalculo.dataUpdatedAt]);

  const calculando = !!calculo;

  const generar = async () => {
    setTrabajando(true);
    try {
      // Un periodo cerrado o mal escrito se rechaza aquí mismo; lo demás se
      // calcula en segundo plano y la pantalla pregunta hasta que esté.
      const out = await payrollService.generar({ desde, hasta });

      pedidoEl.current = Date.now();
      setCalculo(out.id);
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("ui.NominaTimecards.noSePudoCompletarLaAccion", "No se pudo completar la acción"),
      );
    } finally {
      setTrabajando(false);
    }
  };

  /* CERRAR EL PERIODO. Los fichajes hasta el final del último día que se ve
     quedan de sólo lectura, y las tarjetas de ese periodo ya no se pueden volver
     a generar. El corte es el final de ESE día en la hora de la empresa, no en
     la de quien pulsa. */
  const cerrarPeriodo = async () => {
    const ok = await confirmDialog({
      title: t("ui.NominaTimecards.cerrarElPeriodoTitulo", {
        hasta: soloFechaCivil(hasta),
        defaultValue: "¿Cerrar el periodo hasta el {{hasta}}?",
      }),
      message: t("ui.NominaTimecards.cerrarElPeriodoMensaje", {
        hasta: soloFechaCivil(hasta),
        defaultValue:
          "Los fichajes hasta el final del {{hasta}} quedarán en sólo lectura: nadie podrá corregirlos. Y las tarjetas de este periodo ya no se podrán volver a calcular. Hazlo cuando ya hayas revisado y aprobado el periodo.",
      }),
      confirmText: t("ui.NominaTimecards.cerrarPeriodo", "Cerrar periodo"),
      tone: "danger",
    });

    if (!ok) return;
    setTrabajando(true);
    try {
      const corte = instanteEnLaEmpresa(hasta, 23, 59, 59, 999).toISOString();
      const out = (await attendanceService.closePeriod(corte)) as {
        lockedCount?: number;
      };

      toast.success(
        t("ui.NominaTimecards.periodoCerrado", {
          count: Number(out?.lockedCount ?? 0),
          hasta: soloFechaCivil(hasta),
          defaultValue:
            "Periodo cerrado hasta el {{hasta}}. {{count}} fichaje(s) quedaron en sólo lectura.",
        }),
      );
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      cargar();
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("ui.NominaTimecards.noSePudoCerrarElPeriodo", "No se pudo cerrar el periodo"),
      );
    } finally {
      setTrabajando(false);
    }
  };

  const aprobar = async () => {
    if (!sel.length) return;
    const conPendientes = seleccionadas.filter((r) => r.sinResolver > 0);

    if (conPendientes.length) {
      const ok = await confirmDialog({
        title: t("ui.NominaTimecards.hayDiasSinResolver", "Hay días sin resolver"),
        message: t("ui.NominaTimecards.confirmarForzarAprobacion", {
          count: conPendientes.length,
          defaultValue:
            "{{count}} tarjeta(s) tienen días con turno, sin marcaje y sin decisión. Aprobarlas es afirmar que esos días valen cero. Puedes cerrarlos primero, o forzar la aprobación: quedará escrito que se forzó y quién lo hizo.",
        }),
        confirmText: t("ui.NominaTimecards.forzarLaAprobacion", "Forzar la aprobación"),
        tone: "danger",
      });

      if (!ok) return;

      return conAviso(
        () => payrollService.aprobar(sel, { forzar: true }),
        t(
          "ui.NominaTimecards.tarjetasAprobadasConExcepcion",
          "Tarjetas aprobadas (con excepción registrada)",
        ),
      );
    }

    return conAviso(
      () => payrollService.aprobar(sel),
      t("ui.NominaTimecards.tarjetasAprobadas", "Tarjetas aprobadas"),
    );
  };

  const reabrir = () =>
    conAviso(
      () => payrollService.reabrir(sel),
      t("ui.NominaTimecards.tarjetasReabiertas", "Tarjetas reabiertas"),
    );

  const exportar = async () => {
    if (!sel.length) return;
    const borradores = seleccionadas.filter((r) => r.estado === "borrador");

    if (borradores.length) {
      toast.error(
        t("ui.NominaTimecards.seleccionadasSinAprobar", {
          count: borradores.length,
          defaultValue:
            "{{count}} de las seleccionadas están sin aprobar. No se manda a pagar lo que nadie revisó.",
        }),
      );

      return;
    }
    setTrabajando(true);
    try {
      await payrollService.exportar(sel, { desde, hasta });
      toast.success(t("ui.NominaTimecards.nominaExportada", "Nómina exportada"));
      cargar();
    } catch (e) {
      toast.error(
        (e as Error)?.message || t("ui.NominaTimecards.noSePudoExportar", "No se pudo exportar"),
      );
    } finally {
      setTrabajando(false);
    }
  };

  const exportarDetalle = async () => {
    if (!sel.length) return;
    setTrabajando(true);
    try {
      await payrollService.exportarDetalle(sel, { desde, hasta });
      toast.success(
        t("ui.NominaTimecards.detalleDiaADiaDescargado", "Detalle día a día descargado"),
      );
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("ui.NominaTimecards.noSePudoDescargarElDetalle", "No se pudo descargar el detalle"),
      );
    } finally {
      setTrabajando(false);
    }
  };

  const guardarTarifa = async (r: TarjetaDeNomina, valor: string) => {
    const previa = r.tarifaCentavos ?? null;
    const centavos =
      valor.trim() === "" ? null : Math.round(Number(valor) * 100);

    if (Number.isNaN(centavos as number)) return;
    if (centavos === previa) return;

    try {
      await payrollService.ponerTarifas([
        { userId: r.userId, hourlyRateCents: centavos },
      ]);
      toast.success(
        r.nombre
          ? t("ui.NominaTimecards.tarifaGuardada", {
              nombre: r.nombre,
              defaultValue:
                "Tarifa de {{nombre}} guardada. Vuelve a generar el periodo para aplicarla.",
            })
          : t(
              "ui.NominaTimecards.tarifaGuardadaSinNombre",
              "Tarifa de la persona guardada. Vuelve a generar el periodo para aplicarla.",
            ),
      );
      cargar();
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("ui.NominaTimecards.noSePudoGuardarLaTarifa", "No se pudo guardar la tarifa"),
      );
    }
  };

  const dinero = (c: unknown, moneda: string) =>
    `${(num(c) / 100).toFixed(2)} ${moneda}`;

  const columns: Column<TarjetaDeNomina>[] = [
    {
      key: "nombre",
      header: t("ui.NominaTimecards.persona", "Persona"),
      render: (_v, r) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="truncate">{r.nombre || "—"}</span>
          {r.rol !== "vigilante" && (
            <StatusBadge dot={false} tone={r.rol === "supervisor" ? "warn" : "info"}>
              {ETIQUETA_ROL[r.rol]
                ? t(ETIQUETA_ROL[r.rol][0], ETIQUETA_ROL[r.rol][1])
                : r.rol}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      key: "documento",
      header: t("ui.NominaTimecards.documento", "Documento"),
      render: (_v, r) => (
        <span className="tabular-nums" style={{ color: "var(--ink-faint)" }}>
          {r.documento || "—"}
        </span>
      ),
    },
    {
      key: "diasTrabajados",
      header: t("ui.NominaTimecards.diasTrab", "Días trab."),
      render: (_v, r) => <Num strong v={r.diasTrabajados} />,
    },
    /* Se pagan las NETAS: en el puesto menos descanso (dueño, 2026-10-14). El
       descanso del periodo va al lado; el de cada día, al abrir la tarjeta. */
    /* La clave es `detalle`, que la fila SÍ tiene: en la ficha del teléfono
       DataTable juzga una celda pintada como nodo por su dato crudo, y con
       `descanso` —que no existe en la fila— la columna no salía nunca. */
    {
      key: "detalle",
      header: t("ui.NominaRecords.descanso", "Descanso"),
      render: (_v, r) => {
        const m = r.detalle?.totales?.descansoMinutos;

        return <Num v={m == null ? "—" : fmtDescanso(Number(m))} />;
      },
    },
    {
      key: "horas",
      header: t("ui.NominaRecords.horasNetas", "Horas netas"),
      render: (_v, r) => <Num strong v={num(r.horas).toFixed(2)} />,
    },
    {
      key: "horasOrdinarias",
      header: t("ui.NominaTimecards.ordinarias", "Ordinarias"),
      render: (_v, r) => <Num v={num(r.horasOrdinarias).toFixed(2)} />,
    },
    {
      key: "horasExtra",
      header: t("ui.NominaTimecards.extra", "Extra"),
      render: (_v, r) => <Num v={num(r.horasExtra).toFixed(2)} />,
    },
    {
      key: "horasNocturnas",
      header: t("ui.NominaTimecards.nocturnas", "Nocturnas"),
      render: (_v, r) => <Num v={num(r.horasNocturnas).toFixed(2)} />,
    },
    {
      key: "faltas",
      header: t("ui.NominaTimecards.faltas", "Faltas"),
      render: (_v, r) => (
        <Num v={r.faltas} tone={r.faltas > 0 ? "warn" : undefined} />
      ),
    },
    {
      key: "sinResolver",
      header: t("ui.NominaTimecards.sinResolver", "Sin resolver"),
      render: (_v, r) => (
        <Num v={r.sinResolver} tone={r.sinResolver > 0 ? "bad" : undefined} />
      ),
    },
    {
      key: "tarifaCentavos",
      header: t("ui.NominaTimecards.tarifaH", "Tarifa/h"),
      /* Se edita AQUÍ, que es donde alguien se da cuenta de que falta. Mandarle
         a otra pantalla a arreglarlo es la forma más segura de que no se
         arregle — y de que el periodo se exporte con importes en blanco. */
      render: (_v, r) => (
        <input
          className="cg-input cg-focus w-24 px-2 py-1 text-right text-sm tabular-nums"
          type="number"
          min={0}
          step="0.01"
          placeholder="—"
          defaultValue={r.tarifaCentavos != null ? r.tarifaCentavos / 100 : ""}
          // La fila abre los días: escribir la tarifa no debe abrirlos.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          disabled={r.estado !== "borrador"}
          title={
            r.estado !== "borrador"
              ? t(
                  "ui.NominaTimecards.laTarjetaYaEstaAprobada",
                  "La tarjeta ya está aprobada: su importe no se recalcula.",
                )
              : t(
                  "ui.NominaTimecards.tarifaPorHoraSeAplica",
                  "Tarifa por hora. Se aplica al volver a generar el periodo.",
                )
          }
          onBlur={(e) => guardarTarifa(r, e.target.value)}
        />
      ),
    },
    {
      key: "importeCentavos",
      header: t("ui.NominaTimecards.importe", "Importe"),
      render: (_v, r) =>
        // Sin tarifa NO se pinta un cero: un cero se lee como «se le paga
        // cero», que es distinto de «aquí no se calcula el dinero».
        r.tarifaCentavos == null ? (
          <span
            className="block text-right text-xs"
            style={{ color: "var(--ink-faint)" }}
            title={t(
              "ui.NominaTimecards.estaPersonaNoTieneTarifa",
              "Esta persona no tiene tarifa cargada: sus horas están, el importe lo calcula quien pague.",
            )}
          >
            {t("ui.NominaTimecards.sinTarifa", "sin tarifa")}
          </span>
        ) : (
          <Num strong v={dinero(r.importeCentavos, r.moneda)} />
        ),
    },
    {
      key: "estado",
      header: t("comun.estado", "Estado"),
      render: (_v, r) => (
        <StatusBadge tone={TONO[r.estado]}>
          {ETIQUETA_ESTADO[r.estado]
            ? t(ETIQUETA_ESTADO[r.estado][0], ETIQUETA_ESTADO[r.estado][1])
            : r.estado}
        </StatusBadge>
      ),
    },
  ];

  const hayBorradores = seleccionadas.some((r) => r.estado === "borrador");
  const hayAprobadas = seleccionadas.some((r) => r.estado === "aprobada");

  return (
    <AppLayout>
      <PageContainer>
        <PageHeader
          title={t("ui.NominaTimecards.tarjetasDeNomina", "Tarjetas de nómina")}
          subtitle={t(
            "ui.NominaTimecards.revisaElPeriodo",
            "Revisa el periodo, apruébalo y expórtalo para pagar.",
          )}
          badges={
            ultimoCierre ? (
              <StatusBadge dot={false} tone="neutral">
                <Lock size={12} />{" "}
                {t("ui.NominaTimecards.ultimoCierre", {
                  fecha: diaDelCierre(ultimoCierre),
                  defaultValue: "Último cierre: {{fecha}}",
                })}
              </StatusBadge>
            ) : undefined
          }
        />

        <Toolbar>
          <label className="flex items-center gap-2 text-sm">
            <CalendarDays size={15} style={{ color: "var(--ink-faint)" }} />
            <input
              type="date"
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className="cg-input"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span style={{ color: "var(--ink-faint)" }}>
              {t("ui.NominaTimecards.a", "a")}
            </span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className="cg-input"
            />
          </label>

          <Button onClick={generar} disabled={trabajando || calculando}>
            {calculando ? (
              <>
                <Loader2 size={15} className="animate-spin" />{" "}
                {t("ui.NominaTimecards.calculando", "Calculando…")}
              </>
            ) : (
              <>
                <RefreshCw size={15} /> {t("ui.NominaTimecards.generarPeriodo", "Generar periodo")}
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={aprobar}
            disabled={trabajando || !hayBorradores}
          >
            <CheckCircle2 size={15} />{" "}
            {t("ui.NominaTimecards.aprobarN", {
              count: sel.length,
              defaultValue: "Aprobar ({{count}})",
            })}
          </Button>
          {/* Reopening and exporting release pay: the backend takes them only
              with attendanceSettingsEdit (payrollGate), same as closing. */}
          {puedeCerrar && (
            <Button
              variant="outline"
              onClick={reabrir}
              disabled={trabajando || !hayAprobadas}
            >
              <RotateCcw size={15} /> {t("ui.NominaTimecards.reabrir", "Reabrir")}
            </Button>
          )}
          {puedeCerrar && (
            <Button variant="outline" onClick={exportar} disabled={trabajando || !sel.length}>
              <Download size={15} /> {t("ui.NominaRecords.exportar", "Exportar")}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={exportarDetalle}
            disabled={trabajando || !sel.length}
          >
            <FileSpreadsheet size={15} /> {t("ui.NominaTimecards.detalleDiaADia", "Detalle día a día")}
          </Button>
          {puedeCerrar && (
            <Button
              variant="outline"
              onClick={cerrarPeriodo}
              disabled={trabajando || calculando}
            >
              <Lock size={15} /> {t("ui.NominaTimecards.cerrarPeriodo", "Cerrar periodo")}
            </Button>
          )}
        </Toolbar>

        <Stagger>
          <MetricTile
            label={t("ui.NominaTimecards.personas", "Personas")}
            value={resumen.personas} icon={<CalendarDays />} />
          <MetricTile
            label={t("ui.NominaTimecards.horasDelPeriodo", "Horas del periodo")}
            value={resumen.horas.toFixed(2)} />
          <MetricTile
            label={t("ui.NominaTimecards.aprobadas", "Aprobadas")}
            value={`${resumen.aprobadas} / ${resumen.personas}`} />
          <MetricTile
            label={t("ui.NominaTimecards.conDiasSinResolver", "Con días sin resolver")}
            value={resumen.trabadas}
            hint={
              resumen.trabadas
                ? t("ui.NominaTimecards.noSePuedenAprobarSinCerrarlos", "No se pueden aprobar sin cerrarlos")
                : undefined
            }
          />
          <MetricTile
            label={t("ui.NominaTimecards.sinTarifaCargada", "Sin tarifa cargada")}
            value={resumen.sinTarifa}
            hint={
              resumen.sinTarifa
                ? t("ui.NominaTimecards.suImporteSaleEnBlanco", "Su importe sale en blanco")
                : undefined
            }
          />
          <MetricTile
            label={t("ui.NominaTimecards.importeCalculado", "Importe calculado")}
            value={resumen.importe ? dinero(resumen.importe, resumen.moneda) : "—"}
            icon={<Wallet />}
          />
        </Stagger>

        <Section>
          <DataTable
            columns={columns}
            data={rows}
            loading={cargando}
            selectedIds={sel}
            onRowClick={(r) => setAbierta(r)}
            onSelectOne={(id, checked) =>
              setSel((s) => (checked ? [...s, id] : s.filter((x) => x !== id)))
            }
            onSelectAll={(checked) => setSel(checked ? rows.map((r) => r.id) : [])}
            emptyState={
              <EmptyState
                title={t("ui.NominaTimecards.sinTarjetasEnEstePeriodo", "Sin tarjetas en este periodo")}
                description={t(
                  "ui.NominaTimecards.pulsaGenerarPeriodo",
                  "Pulsa «Generar periodo» para calcularlo.",
                )}
                icon={<Wallet />}
              />
            }
          />
        </Section>
        <DiasDeLaTarjeta tarjeta={abierta} onClose={() => setAbierta(null)} />
      </PageContainer>
    </AppLayout>
  );
}
