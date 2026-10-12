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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileSpreadsheet,
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
import { diaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
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

export default function NominaTimecards() {
  const { t } = useTranslation();
  const [desde, setDesde] = useState(isoDay(new Date(Date.now() - 14 * 864e5)));
  const [hasta, setHasta] = useState(isoDay(new Date()));
  const [rows, setRows] = useState<TarjetaDeNomina[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

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

  const generar = () =>
    conAviso(async () => {
      const out = await payrollService.generar({ desde, hasta });

      toast.info(
        t("ui.NominaTimecards.resultadoGenerar", {
          creadas: out.creadas,
          actualizadas: out.actualizadas,
          intactas: out.intactas,
          defaultValue:
            "{{creadas}} creadas · {{actualizadas}} actualizadas · {{intactas}} intactas",
        }),
      );

      return {};
    }, t("ui.NominaTimecards.periodoGenerado", "Periodo generado"));

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
    {
      key: "horas",
      header: t("ui.NominaRecords.horas", "Horas"),
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

          <Button onClick={generar} disabled={trabajando}>
            <RefreshCw size={15} /> {t("ui.NominaTimecards.generarPeriodo", "Generar periodo")}
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
          <Button
            variant="outline"
            onClick={reabrir}
            disabled={trabajando || !hayAprobadas}
          >
            <RotateCcw size={15} /> {t("ui.NominaTimecards.reabrir", "Reabrir")}
          </Button>
          <Button variant="outline" onClick={exportar} disabled={trabajando || !sel.length}>
            <Download size={15} /> {t("ui.NominaRecords.exportar", "Exportar")}
          </Button>
          <Button
            variant="outline"
            onClick={exportarDetalle}
            disabled={trabajando || !sel.length}
          >
            <FileSpreadsheet size={15} /> {t("ui.NominaTimecards.detalleDiaADia", "Detalle día a día")}
          </Button>
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
      </PageContainer>
    </AppLayout>
  );
}
