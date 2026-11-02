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
import { usePuede } from "@/hooks/usePuede";
import { EstadoVacio } from "@/components/EstadoVacio";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  LockOpen,
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
import { promptDialog } from "@/components/ui/promptDialog";
import payrollService, {
  type EstadoTarjeta,
  type TarjetaDeNomina,
} from "@/lib/api/payrollService";
import attendanceService from "@/lib/api/attendanceService";
import DiasDeLaTarjeta from "./DiasDeLaTarjeta";
import { fmtDescanso } from "./shared";
import {
  diaDeLaEmpresa,
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
import { ErrorDeCarga } from "@/components/kit/ErrorDeCarga";

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
  const puedeVerAjustes = hasPermission("attendanceSettingsRead");
  /* Each button mirrors its endpoint (lib/reglasDeAcciones). Without Roles de
     pago or Gusto these are HOURS: no rate, no amount (the server already
     leaves them out). */
  const generarT = usePuede("tarjetas.generar");
  const aprobarT = usePuede("tarjetas.aprobar");
  const reabrirT = usePuede("tarjetas.reabrir");
  const exportarT = usePuede("tarjetas.exportar");
  const detalleT = usePuede("tarjetas.exportarDetalle");
  const cerrarP = usePuede("tarjetas.cerrarPeriodo");
  const reabrirP = usePuede("tarjetas.reabrirPeriodo");
  const tarifasT = usePuede("tarjetas.tarifas");
  /* With Roles de pago or Gusto, exporting the approved cards IS sending them
     to pay (one approval flow, phase 3): their punches become «paid». */
  const conDinero = tarifasT.motivo !== "modulo";
  /* A link can name the range (the run screen's «Ir a Horas del periodo»
     sends the run's from/to): the page opens on it instead of today's period. */
  const [params] = useSearchParams();
  const diaValido = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const rangoDelEnlace = (() => {
    const a = diaValido(params.get("from"));
    const b = diaValido(params.get("to"));
    return a && b && a <= b ? { desde: a, hasta: b } : null;
  })();
  const [desde, setDesde] = useState(rangoDelEnlace?.desde ?? isoDay(new Date(Date.now() - 14 * 864e5)));
  const [hasta, setHasta] = useState(rangoDelEnlace?.hasta ?? isoDay(new Date()));
  const [rows, setRows] = useState<TarjetaDeNomina[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  /* La tarjeta abierta día por día —con su descanso de cada día—. */
  const [abierta, setAbierta] = useState<TarjetaDeNomina | null>(null);
  const [cargando, setCargando] = useState(false);
  /** The period did not load: the table must not read «Sin tarjetas». */
  const [fallo, setFallo] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  /* El cálculo del periodo corre en el servidor en segundo plano: aquí se
     guarda su id mientras se espera, y cuándo se pidió (para el tope). */
  const [calculo, setCalculo] = useState<string | null>(null);
  const pedidoEl = useRef(0);
  /* The list waits for the range: without a link range it is the company's
     period, which the server says. Loading the default range first and the
     period after asked twice on every visit, and a late first answer could
     paint the wrong period (QA 2026-11-01). */
  const [rangoListo, setRangoListo] = useState(!!rangoDelEnlace);
  // Rates saved from this screen, by person: the cards show theirs only after
  // the period is generated again.
  const tarifasGuardadas = useRef(new Map<string, number | null>());
  const ultimaCarga = useRef(0);

  const cargar = useCallback(() => {
    const esta = ++ultimaCarga.current;

    setCargando(true);
    setFallo(false);
    payrollService
      .listar({ desde, hasta })
      .then((d) => {
        if (esta !== ultimaCarga.current) return;
        setRows(d.rows || []);
        setSel([]);
      })
      .catch((e) => {
        if (esta !== ultimaCarga.current) return;
        setRows([]);
        setSel([]);
        setFallo(true);
        toast.error(
          e?.message ||
            t("ui.NominaTimecards.noSePudieronCargarLasTarjetas", "No se pudieron cargar las tarjetas"),
        );
      })
      .finally(() => {
        if (esta === ultimaCarga.current) setCargando(false);
      });
  }, [desde, hasta]);

  /* ── THE PERIOD IS THE COMPANY'S, WHOLE AND FIXED ──────────────────────
     The server says which period contains a day (1–15/16–end, the month, or
     14 days from a fixed anchor) and its neighbours. The page moves between
     whole periods with the arrows: a free date range is how the same day
     ended up in two cards and was paid twice. */
  const [periodo, setPeriodo] = useState<{
    label: string;
    previous?: { desde: string; hasta: string };
    next?: { desde: string; hasta: string };
    closedThrough?: string | null;
  } | null>(null);
  const irAlPeriodo = useCallback((dia?: string, mantenerRango = false) => {
    attendanceService
      .currentPeriod(dia)
      .then((p) => {
        if (p?.from && p?.to) {
          if (!mantenerRango) {
            setDesde(p.from.slice(0, 10));
            setHasta(p.to.slice(0, 10));
          }
          setPeriodo({ label: p.label, previous: p.previous, next: p.next, closedThrough: p.closedThrough ?? null });
        }
      })
      .catch(() => undefined)
      // Whatever the answer, the list may load now (on failure, the default range).
      .finally(() => setRangoListo(true));
  }, []);

  useEffect(() => {
    // With a range from the link, keep it and only read the period's label and arrows.
    if (rangoDelEnlace) irAlPeriodo(rangoDelEnlace.desde, true);
    else irAlPeriodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irAlPeriodo]);

  useEffect(() => {
    if (!rangoListo) return;
    cargar();
  }, [cargar, rangoListo]);

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
          "Los fichajes, turnos y marcas del horario hasta el final del {{hasta}} quedarán cerrados: nadie podrá cambiarlos, y las tarjetas de este periodo ya no se podrán volver a calcular. Cerrar sólo avanza; para volver atrás hace falta «Reabrir periodo». Hazlo cuando ya hayas revisado y aprobado el periodo.",
      }),
      confirmText: t("ui.NominaTimecards.cerrarPeriodo", "Cerrar periodo"),
      tone: "danger",
    });

    if (!ok) return;
    setTrabajando(true);
    try {
      // The close is a DAY of the company (inclusive); the server turns it into
      // instants with the company's timezone.
      const out = (await attendanceService.closePeriod(hasta)) as {
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
      irAlPeriodo(desde);
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

  /* REOPEN THE PERIOD from its first day. Never a side effect: management
     only (the server checks), with a reason that goes to the audit log.
     Approved and exported cards stay as they are. */
  const reabrirPeriodo = async () => {
    const motivo = await promptDialog({
      title: t("ui.NominaTimecards.reabrirPeriodoTitulo", {
        desde: soloFechaCivil(desde),
        defaultValue: "¿Reabrir la nómina desde el {{desde}}?",
      }),
      message: t(
        "ui.NominaTimecards.reabrirPeriodoMensaje",
        "Los fichajes, turnos y marcas desde ese día se podrán volver a cambiar. Las tarjetas ya aprobadas o exportadas no se tocan. Escribe el motivo: queda en la bitácora.",
      ),
      placeholder: t("ui.NominaTimecards.motivo", "Motivo"),
      confirmText: t("ui.NominaTimecards.reabrirPeriodo", "Reabrir periodo"),
    });

    if (motivo == null) return;
    if (!motivo.trim()) {
      toast.error(t("ui.NominaTimecards.faltaElMotivo", "Escribe el motivo para reabrir el periodo."));

      return;
    }
    setTrabajando(true);
    try {
      const out = (await attendanceService.reopenPeriod(desde, motivo.trim())) as { closedThrough?: string };

      toast.success(
        out?.closedThrough
          ? t("ui.NominaTimecards.periodoReabierto", {
              hasta: soloFechaCivil(out.closedThrough),
              defaultValue: "Periodo reabierto. Ahora está cerrado hasta el {{hasta}}.",
            })
          : t("ui.NominaTimecards.periodoReabiertoSinCierre", "Periodo reabierto."),
      );
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      irAlPeriodo(desde);
      cargar();
    } catch (e) {
      toast.error(
        (e as Error)?.message ||
          t("ui.NominaTimecards.noSePudoReabrirElPeriodo", "No se pudo reabrir el periodo"),
      );
    } finally {
      setTrabajando(false);
    }
  };

  const periodoCerrado = !!(periodo?.closedThrough && periodo.closedThrough >= desde);

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
      const r = await payrollService.exportar(sel, { desde, hasta });

      if (r.rechazadas > 0) {
        toast.warning(
          t("ui.NominaTimecards.exportadaConRechazos", {
            count: r.rechazadas,
            defaultValue: "Nómina exportada sin {{count}} tarjeta(s), que no salen a pagar:",
          }),
          { description: r.motivos.join(" · "), duration: 15000 },
        );
      } else {
        toast.success(t("ui.NominaTimecards.nominaExportada", "Nómina exportada"));
      }
      cargar();
    } catch (e) {
      // The interceptor already showed the server's reason (nothing payable).
      if (!(e as { toastShown?: boolean })?.toastShown) {
        toast.error(
          (e as Error)?.message || t("ui.NominaTimecards.noSePudoExportar", "No se pudo exportar"),
        );
      }
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

  /** The rate the person has now (saved here, or from the server), else the card's. */
  const tarifaDeLaPersona = (r: TarjetaDeNomina): number | null =>
    tarifasGuardadas.current.has(r.userId)
      ? (tarifasGuardadas.current.get(r.userId) ?? null)
      : r.tarifaActualCentavos !== undefined
        ? r.tarifaActualCentavos
        : (r.tarifaCentavos ?? null);

  const guardarTarifa = async (r: TarjetaDeNomina, valor: string, campo?: HTMLInputElement) => {
    // The card keeps the rate it was generated with until the period is
    // generated again: compare with what was saved here, or clearing a rate
    // just saved sent nothing (QA 2026-11-01).
    const previa = tarifasGuardadas.current.has(r.userId)
      ? (tarifasGuardadas.current.get(r.userId) ?? null)
      : tarifaDeLaPersona(r);
    const centavos =
      valor.trim() === "" ? null : Math.round(Number(valor.replace(",", ".")) * 100);
    const restaurar = () => {
      if (campo) campo.value = previa != null ? String(previa / 100) : "";
    };

    if (Number.isNaN(centavos as number)) return restaurar();
    if (centavos !== null && centavos <= 0) {
      // The server stores a zero or negative rate as «sin tarifa»: say it here
      // instead of «Tarifa guardada».
      toast.error(
        t(
          "ui.NominaTimecards.tarifaInvalida",
          "La tarifa tiene que ser mayor que cero. Para quitarla, deja el campo vacío.",
        ),
      );

      return restaurar();
    }
    if (centavos === previa) return;

    try {
      await payrollService.ponerTarifas([
        { userId: r.userId, hourlyRateCents: centavos },
      ]);
      tarifasGuardadas.current.set(r.userId, centavos);
      toast.success(
        centavos === null
          ? t("ui.NominaTimecards.tarifaQuitada", {
              nombre: r.nombre || "—",
              defaultValue:
                "Tarifa de {{nombre}} quitada. Vuelve a generar el periodo para aplicarlo.",
            })
          : r.nombre
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
      render: (_v, r) => {
        // The field shows the person's rate; a rate saved but not applied yet
        // (the card still has the old one) says so under it.
        const actual = tarifaDeLaPersona(r);
        const pendiente = actual !== (r.tarifaCentavos ?? null);

        return (
        <span className="inline-flex flex-col items-end gap-0.5">
        <input
          key={`${r.id}-${actual ?? ""}`}
          className="cg-input cg-focus w-24 px-2 py-1 text-right text-sm tabular-nums"
          type="number"
          min={0}
          step="0.01"
          placeholder="—"
          defaultValue={actual != null ? actual / 100 : ""}
          // La fila abre los días: escribir la tarifa no debe abrirlos.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          disabled={r.estado !== "borrador" || !tarifasT.puede}
          title={
            !tarifasT.puede
              ? tarifasT.porQueNo
              : r.estado !== "borrador"
              ? t(
                  "ui.NominaTimecards.laTarjetaYaEstaAprobada",
                  "La tarjeta ya está aprobada: su importe no se recalcula.",
                )
              : t(
                  "ui.NominaTimecards.tarifaPorHoraSeAplica",
                  "Tarifa por hora. Se aplica al volver a generar el periodo.",
                )
          }
          onBlur={(e) => guardarTarifa(r, e.target.value, e.currentTarget)}
        />
        {pendiente && r.estado === "borrador" && (
          <span className="text-[11px]" style={{ color: "var(--warn-text)" }}>
            {t("ui.NominaTimecards.tarifaSinAplicar", "Sin aplicar: genera el periodo otra vez")}
          </span>
        )}
        </span>
        );
      },
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
          title={t("sidebar.asistencia.horas-periodo", "Horas del periodo")}
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
          {/* Whole periods only: the arrows move one period, the date jumps to
              the period that contains it. */}
          <div className="flex items-center gap-1.5 text-sm">
            <Button
              size="sm"
              variant="outline"
              aria-label={t("ui.NominaTimecards.periodoAnterior", "Periodo anterior")}
              title={t("ui.NominaTimecards.periodoAnterior", "Periodo anterior")}
              disabled={!periodo?.previous || calculando}
              onClick={() => periodo?.previous && irAlPeriodo(periodo.previous.desde)}
            >
              <ChevronLeft size={15} />
            </Button>
            <span className="flex items-center gap-1.5 px-1 tabular-nums">
              <CalendarDays size={15} style={{ color: "var(--ink-faint)" }} />
              {t("ui.NominaTimecards.rangoDelPeriodo", {
                desde: soloFechaCivil(desde),
                hasta: soloFechaCivil(hasta),
                defaultValue: "{{desde}} – {{hasta}}",
              })}
              {periodo?.label ? (
                <span style={{ color: "var(--ink-faint)" }}>· {periodo.label}</span>
              ) : null}
            </span>
            <Button
              size="sm"
              variant="outline"
              aria-label={t("ui.NominaTimecards.periodoSiguiente", "Periodo siguiente")}
              title={t("ui.NominaTimecards.periodoSiguiente", "Periodo siguiente")}
              disabled={!periodo?.next || calculando}
              onClick={() => periodo?.next && irAlPeriodo(periodo.next.desde)}
            >
              <ChevronRight size={15} />
            </Button>
            <input
              type="date"
              aria-label={t("ui.NominaTimecards.irAUnaFecha", "Ir al periodo de una fecha")}
              title={t("ui.NominaTimecards.irAUnaFecha", "Ir al periodo de una fecha")}
              value={desde}
              onChange={(e) => e.target.value && irAlPeriodo(e.target.value)}
              className="cg-input w-[9.5rem]"
            />
            {periodoCerrado && (
              <StatusBadge dot={false} tone="neutral">
                <Lock size={12} /> {t("ui.NominaTimecards.periodoCerradoInsignia", "Cerrado")}
              </StatusBadge>
            )}
          </div>

          {generarT.puede && (
          <Button
            onClick={generar}
            disabled={trabajando || calculando || periodoCerrado}
            title={
              periodoCerrado
                ? t("ui.NominaTimecards.generarCerrado", "Este periodo está cerrado. Reábrelo para volver a calcularlo.")
                : undefined
            }
          >
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
          )}
          {aprobarT.puede && (
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
          )}
          {/* Reopening and exporting release pay: the backend takes them only
              with attendanceSettingsEdit (payrollGate), same as closing. */}
          {reabrirT.puede && (
            <Button
              variant="outline"
              onClick={reabrir}
              disabled={trabajando || !hayAprobadas}
            >
              <RotateCcw size={15} /> {t("ui.NominaTimecards.reabrir", "Reabrir")}
            </Button>
          )}
          {exportarT.puede && (
            <Button variant="outline" onClick={exportar} disabled={trabajando || !sel.length}>
              <Download size={15} />{" "}
              {conDinero
                ? t("ui.NominaTimecards.enviarAPago", "Enviar a pago")
                : t("ui.NominaRecords.exportar", "Exportar")}
            </Button>
          )}
          {detalleT.puede && (
          <Button
            variant="outline"
            onClick={exportarDetalle}
            disabled={trabajando || !sel.length}
          >
            <FileSpreadsheet size={15} /> {t("ui.NominaTimecards.detalleDiaADia", "Detalle día a día")}
          </Button>
          )}
          {cerrarP.puede && !periodoCerrado && (
            <Button
              variant="outline"
              onClick={cerrarPeriodo}
              disabled={trabajando || calculando}
            >
              <Lock size={15} /> {t("ui.NominaTimecards.cerrarPeriodo", "Cerrar periodo")}
            </Button>
          )}
          {reabrirP.puede && periodoCerrado && (
            <Button
              variant="outline"
              onClick={reabrirPeriodo}
              disabled={trabajando || calculando}
            >
              <LockOpen size={15} /> {t("ui.NominaTimecards.reabrirPeriodo", "Reabrir periodo")}
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
          {conDinero && (
          <MetricTile
            label={t("ui.NominaTimecards.sinTarifaCargada", "Sin tarifa cargada")}
            value={resumen.sinTarifa}
            hint={
              resumen.sinTarifa
                ? t("ui.NominaTimecards.suImporteSaleEnBlanco", "Su importe sale en blanco")
                : undefined
            }
          />
          )}
          {conDinero && (
          <MetricTile
            label={t("ui.NominaTimecards.importeCalculado", "Importe calculado")}
            value={resumen.importe ? dinero(resumen.importe, resumen.moneda) : "—"}
            icon={<Wallet />}
          />
          )}
        </Stagger>

        <Section>
          <DataTable
            columns={
              conDinero
                ? columns
                : columns.filter((c) => c.key !== "tarifaCentavos" && c.key !== "importeCentavos")
            }
            data={rows}
            loading={cargando}
            selectedIds={sel}
            onRowClick={(r) => setAbierta(r)}
            onSelectOne={(id, checked) =>
              setSel((s) => (checked ? [...s, id] : s.filter((x) => x !== id)))
            }
            onSelectAll={(checked) => setSel(checked ? rows.map((r) => r.id) : [])}
            emptyState={
              fallo ? (
                <ErrorDeCarga onRetry={cargar} variant="inline" />
              ) : (
              <EstadoVacio
                title={t("ui.NominaTimecards.sinTarjetasEnEstePeriodo", "Sin tarjetas en este periodo")}
                description={t(
                  "ui.NominaTimecards.pulsaGenerarPeriodo",
                  "Pulsa «Generar periodo» para calcularlo.",
                )}
                icon={<Wallet />}
                paso={{
                  label: t("ui.NominaTimecards.generarPeriodo", "Generar periodo"),
                  onClick: () => void generar(),
                  puede: generarT.puede,
                  porQueNo: generarT.porQueNo,
                }}
              />
              )
            }
          />
        </Section>
        <DiasDeLaTarjeta tarjeta={abierta} onClose={() => setAbierta(null)} />
      </PageContainer>
    </AppLayout>
  );
}
