/**
 * PAY PERIOD AND PAY RULES — Configuración › Asistencia.
 *
 * Mike, 2026-10-30: «cada país debe poder configurar como le den la gana».
 * Every rule here is the company's. The country only proposes a starting point
 * («Aplicar reglas de Ecuador»), and the page always shows the rules in force
 * in plain words, so nobody has to guess what the timecard will pay.
 *
 * The old policy inputs wrote to the wrong place (a two-level setter on a
 * three-level path: `payroll.politica.x` replaced the whole policy with a
 * number), so no company could actually configure its pay rules. Everything
 * here edits `payroll` as a whole object.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Scale, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { Section } from "@/components/kit";
import attendanceService from "@/lib/api/attendanceService";

export type Tramo = { desdeHora: number; recargoPct: number };

export interface Politica {
  moneda?: string;
  horasOrdinariasDia?: number;
  horasOrdinariasSemana?: number;
  semanaIniciaDia?: number;
  diaDelRecargo?: "horas_del_dia" | "dia_de_inicio";
  tramosExtra?: Tramo[];
  nocturno?: { desdeHora?: number; hastaHora?: number; recargoPct?: number };
  domingoRecargoPct?: number;
  descansoRecargoPct?: number;
  feriadoRecargoPct?: number;
  acumulacionDeRecargos?: "suma" | "mayor";
  graciaSalidaMinutos?: number;
  pagarEntradaTemprana?: boolean;
  ausenciasPagadas?: Record<string, boolean>;
  configuradaEl?: string | null;
}

export interface PayrollDeAjustes {
  periodType?: string;
  startDayOfWeek?: number;
  periodAnchor?: string | null;
  politica?: Politica;
  [k: string]: unknown;
}

const CATEGORIAS = [
  "vacaciones", "enfermedad", "permiso_con_sueldo", "permiso_sin_sueldo",
  "capacitacion", "calamidad", "otro",
] as const;

const DIAS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * LOS ESCALONES DE HORAS EXTRA, LOS QUE HAGAN FALTA. Vacía = las extra se
 * pagan a tarifa simple, que es lo único que se puede suponer sin convenio.
 */
export function TramosExtra({
  tramos,
  onChange,
}: {
  tramos: Tramo[];
  onChange: (t: Tramo[]) => void;
}) {
  const { t } = useTranslation();
  const set = (i: number, campo: "desdeHora" | "recargoPct", v: number) =>
    onChange(tramos.map((tr, k) => (k === i ? { ...tr, [campo]: v } : tr)));

  return (
    <div className="sm:col-span-2">
      <span className="text-sm font-medium">
        {t("ui.NominaSettings.escalonesDeHorasExtra", "Escalones de horas extra")}
      </span>
      <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
        {t(
          "ui.NominaSettings.aPartirDeCuantasHorasExtra",
          "A partir de cuántas horas extra acumuladas en el día aplica cada recargo. Sin escalones, las extra se pagan a tarifa simple.",
        )}
      </p>
      <div className="mt-2 space-y-2">
        {tramos.map((tramo, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="cg-eyebrow">{t("ui.NominaSettings.desdeLaHoraExtra", "Desde la hora extra")}</span>
              <input
                className="cg-input cg-focus mt-1 w-32 px-3 py-2 text-sm tabular-nums"
                type="number"
                min={0}
                value={tramo.desdeHora}
                onChange={(e) => set(i, "desdeHora", Number(e.target.value))}
              />
            </label>
            <label className="block">
              <span className="cg-eyebrow">{t("ui.NominaSettings.recargoPct", "Recargo (%)")}</span>
              <input
                className="cg-input cg-focus mt-1 w-32 px-3 py-2 text-sm tabular-nums"
                type="number"
                min={0}
                value={tramo.recargoPct}
                onChange={(e) => set(i, "recargoPct", Number(e.target.value))}
              />
            </label>
            <Button size="sm" variant="outline" onClick={() => onChange(tramos.filter((_, k) => k !== i))}>
              {t("ui.NominaSettings.quitar", "Quitar")}
            </Button>
          </div>
        ))}
      </div>
      <Button
        className="mt-2"
        size="sm"
        variant="outline"
        onClick={() =>
          onChange([
            ...tramos,
            { desdeHora: tramos.length ? tramos[tramos.length - 1].desdeHora + 2 : 0, recargoPct: 25 },
          ])
        }
      >
        {t("ui.NominaSettings.anadirEscalon", "Añadir escalón")}
      </Button>
    </div>
  );
}

function NumeroField({
  label,
  value,
  onChange,
  min = 0,
  max,
  hint,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="cg-eyebrow">{label}</span>
      <input
        className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm tabular-nums"
        type="number"
        min={min}
        max={max}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--ink-faint)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export default function ReglasDePago({
  payroll,
  onChange,
}: {
  payroll: PayrollDeAjustes;
  onChange: (p: PayrollDeAjustes) => void;
}) {
  const { t } = useTranslation();
  const presets = useQuery({
    queryKey: ["attendance", "pay-rule-presets"],
    queryFn: () => attendanceService.payRulePresets(),
    staleTime: 10 * 60_000,
  });

  const pol: Politica = payroll.politica || {};
  const setPol = (patch: Partial<Politica>) =>
    onChange({ ...payroll, politica: { ...pol, ...patch } });
  const setNoct = (patch: Partial<NonNullable<Politica["nocturno"]>>) =>
    setPol({ nocturno: { ...(pol.nocturno || {}), ...patch } });

  const nombreDia = (d: number) =>
    [
      t("ui.NominaSettings.domingo"),
      t("ui.NominaSettings.lunes"),
      t("ui.NominaSettings.martes"),
      t("ui.NominaSettings.miercoles", "Miércoles"),
      t("ui.NominaSettings.jueves"),
      t("ui.NominaSettings.viernes"),
      t("ui.NominaSettings.sabado", "Sábado"),
    ][d] || "";

  const nombreCategoria = (c: string) =>
    ({
      vacaciones: t("ui.ReglasDePago.cat.vacaciones", "Vacaciones"),
      enfermedad: t("ui.ReglasDePago.cat.enfermedad", "Enfermedad"),
      permiso_con_sueldo: t("ui.ReglasDePago.cat.permisoConSueldo", "Permiso con sueldo"),
      permiso_sin_sueldo: t("ui.ReglasDePago.cat.permisoSinSueldo", "Permiso sin sueldo"),
      capacitacion: t("ui.ReglasDePago.cat.capacitacion", "Capacitación"),
      calamidad: t("ui.ReglasDePago.cat.calamidad", "Calamidad doméstica"),
      otro: t("ui.ReglasDePago.cat.otro", "Otro motivo"),
    })[c] || c;

  const nombrePais = (code: string | null | undefined) => {
    if (!code) return t("ui.ReglasDePago.sinPais", "Sin país");
    try {
      const dn = new Intl.DisplayNames([navigator.language || "es"], { type: "region" });

      return dn.of(code) || code;
    } catch {
      return code;
    }
  };

  const pais = presets.data?.pais || null;
  const preset = pais ? presets.data?.presets?.[pais] : undefined;

  const aplicarPreset = async (code: string) => {
    const p = presets.data?.presets?.[code];

    if (!p) return;
    const ok = await confirmDialog({
      title: t("ui.ReglasDePago.aplicarTitulo", {
        pais: nombrePais(code),
        defaultValue: "¿Aplicar las reglas de {{pais}}?",
      }),
      message: t(
        "ui.ReglasDePago.aplicarMensaje",
        "Se reemplazan la jornada, las horas extra, los recargos y qué ausencias se pagan. Después puedes cambiar cualquier valor. Las tarjetas ya aprobadas o exportadas no se recalculan; los borradores cambian al volver a generar el periodo.",
      ),
      confirmText: t("ui.ReglasDePago.aplicar", "Aplicar"),
    });

    if (!ok) return;
    onChange({
      ...payroll,
      politica: { ...(p.politica as Politica), configuradaEl: pol.configuradaEl ?? null },
    });
  };

  const tramos = pol.tramosExtra || [];
  const resumen = useMemo(() => {
    const filas: string[] = [];
    const dia = Number(pol.horasOrdinariasDia || 0);
    const sem = Number(pol.horasOrdinariasSemana || 0);

    filas.push(
      t("ui.ReglasDePago.resumen.jornada", {
        dia: dia > 0 ? t("ui.ReglasDePago.resumen.horasAlDia", { h: dia, defaultValue: "{{h}} h al día" }) : t("ui.ReglasDePago.resumen.sinLimiteDiario", "sin límite diario"),
        semana: sem > 0
          ? t("ui.ReglasDePago.resumen.horasALaSemana", { h: sem, dia: nombreDia(Number(pol.semanaIniciaDia ?? 1)), defaultValue: "{{h}} h a la semana (desde el {{dia}})" })
          : t("ui.ReglasDePago.resumen.sinLimiteSemanal", "sin límite semanal"),
        defaultValue: "Jornada ordinaria: {{dia}} · {{semana}}",
      }),
    );
    filas.push(
      tramos.length
        ? t("ui.ReglasDePago.resumen.extraConRecargo", {
            tramos: tramos.map((x) => `+${x.recargoPct} %${x.desdeHora > 0 ? ` (${t("ui.ReglasDePago.resumen.desdeLaHora", { n: x.desdeHora + 1, defaultValue: "desde la {{n}}.ª" })})` : ""}`).join(", "),
            defaultValue: "Horas extra: {{tramos}}",
          })
        : t("ui.ReglasDePago.resumen.extraSimple", "Horas extra: a tarifa simple"),
    );
    const n = pol.nocturno || {};

    filas.push(
      t("ui.ReglasDePago.resumen.noche", {
        desde: String(n.desdeHora ?? 22).padStart(2, "0"),
        hasta: String(n.hastaHora ?? 6).padStart(2, "0"),
        pct: n.recargoPct ?? 0,
        defaultValue: "Noche ({{desde}}:00–{{hasta}}:00): +{{pct}} %",
      }),
    );
    filas.push(
      t("ui.ReglasDePago.resumen.recargos", {
        domingo: pol.domingoRecargoPct ?? 0,
        descanso: pol.descansoRecargoPct ?? 0,
        feriado: pol.feriadoRecargoPct ?? 0,
        modo: pol.acumulacionDeRecargos === "mayor"
          ? t("ui.NominaSettings.ganaElMayor", "Gana el mayor")
          : t("ui.NominaSettings.seSuman", "Se suman"),
        defaultValue: "Domingo +{{domingo}} % · Descanso trabajado +{{descanso}} % · Feriado +{{feriado}} % · {{modo}}",
      }),
    );
    filas.push(
      pol.diaDelRecargo === "dia_de_inicio"
        ? t("ui.ReglasDePago.resumen.porDiaDeInicio", "Domingo y feriado: todo el turno toma el día en que empieza")
        : t("ui.ReglasDePago.resumen.porHorasDelDia", "Domingo y feriado: sólo las horas que caen ese día"),
    );
    filas.push(
      t("ui.ReglasDePago.resumen.gracia", {
        min: pol.graciaSalidaMinutos ?? 0,
        temprana: pol.pagarEntradaTemprana === false
          ? t("ui.ReglasDePago.resumen.tempranaNo", "no se paga")
          : t("ui.ReglasDePago.resumen.tempranaSi", "se paga"),
        defaultValue: "Gracia al salir: {{min}} min · Entrada antes de hora: {{temprana}}",
      }),
    );
    const pagadas = CATEGORIAS.filter((c) => (pol.ausenciasPagadas || {})[c]).map(nombreCategoria);

    filas.push(
      t("ui.ReglasDePago.resumen.ausencias", {
        lista: pagadas.length ? pagadas.join(", ") : t("ui.ReglasDePago.resumen.ninguna", "ninguna"),
        defaultValue: "Ausencias pagadas: {{lista}}",
      }),
    );

    return filas;
  }, [payroll, t]);

  const tipo = String(payroll.periodType || "biweekly");

  return (
    <>
      <Section icon={<CalendarRange />} title={t("ui.ReglasDePago.periodoDePago", "Periodo de pago")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="cg-eyebrow">{t("ui.ReglasDePago.cadaCuantoSePaga", "Cada cuánto se paga")}</span>
            <select
              className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
              value={tipo}
              onChange={(e) => onChange({ ...payroll, periodType: e.target.value })}
            >
              <option value="weekly">{t("ui.NominaSettings.semanal", "Semanal")}</option>
              <option value="biweekly">{t("ui.ReglasDePago.catorcenal", "Catorcenal (cada 14 días)")}</option>
              <option value="semimonthly">{t("ui.ReglasDePago.quincenal", "Quincenal (1–15 y 16–fin de mes)")}</option>
              <option value="monthly">{t("ui.NominaSettings.mensual", "Mensual")}</option>
            </select>
          </label>
          {(tipo === "weekly" || tipo === "biweekly") && (
            <label className="block">
              <span className="cg-eyebrow">{t("ui.NominaSettings.laSemanaEmpiezaEl")}</span>
              <select
                className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                value={String(payroll.startDayOfWeek ?? 1)}
                onChange={(e) => onChange({ ...payroll, startDayOfWeek: Number(e.target.value) })}
              >
                {DIAS.map((d) => (
                  <option key={d} value={String(d)}>{nombreDia(d)}</option>
                ))}
              </select>
            </label>
          )}
          {tipo === "biweekly" && (
            <label className="block">
              <span className="cg-eyebrow">{t("ui.ReglasDePago.primerDiaDeUnPeriodo", "Primer día de un periodo")}</span>
              <input
                type="date"
                className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                value={payroll.periodAnchor || ""}
                onChange={(e) => onChange({ ...payroll, periodAnchor: e.target.value || null })}
              />
              <span className="mt-1 block text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.ReglasDePago.anclaAyuda",
                  "Todos los periodos de 14 días se cuentan desde aquí. Vacío = el primer día de la semana elegida desde el 1 de enero de 2024.",
                )}
              </span>
            </label>
          )}
          <p className="text-xs sm:col-span-2" style={{ color: "var(--ink-faint)" }}>
            {t(
              "ui.ReglasDePago.periodoAyuda",
              "Los periodos tienen límites fijos: un mismo día se paga en un solo periodo, lo calcule quien lo calcule y el día que sea.",
            )}
          </p>
        </div>
      </Section>

      <Section icon={<Scale />} title={t("ui.ReglasDePago.reglasDePago", "Reglas de pago")}>
        <div className="space-y-4">
          {/* The country's starting point, with what is not confirmed. */}
          <div className="glass-flat space-y-2 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                {t("ui.ReglasDePago.paisDeLaEmpresa", {
                  pais: nombrePais(pais),
                  defaultValue: "País de la empresa: {{pais}}",
                })}
              </span>
              {preset && pais && (
                <Button size="sm" variant="outline" onClick={() => aplicarPreset(pais)}>
                  {t("ui.ReglasDePago.aplicarReglasDe", {
                    pais: nombrePais(pais),
                    defaultValue: "Aplicar reglas de {{pais}}",
                  })}
                </Button>
              )}
            </div>
            {preset ? (
              <>
                <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t("ui.ReglasDePago.fuentes", { fuentes: preset.fuentes.join(" · "), defaultValue: "Fuentes: {{fuentes}}" })}
                </p>
                {preset.confirmar.length > 0 && (
                  <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    <span className="font-medium">{t("ui.ReglasDePago.porConfirmar", "Para confirmar con tu asesor:")}</span>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {preset.confirmar.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                {t(
                  "ui.ReglasDePago.sinPreset",
                  "No tenemos reglas guardadas para este país: declara aquí las de tu convenio.",
                )}
              </p>
            )}
            {!pol.configuradaEl && (
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.ReglasDePago.sinConfigurar",
                  "Nadie ha configurado todavía estas reglas: la jornada sigue la del país y no se aplica ningún recargo. Revísalas y guarda.",
                )}
              </p>
            )}
          </div>

          {/* What the timecard pays today, in plain words. */}
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <ListChecks size={15} /> {t("ui.ReglasDePago.reglasVigentes", "Reglas que se aplican")}
            </div>
            <ul className="space-y-1 text-sm">
              {resumen.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="cg-eyebrow">{t("ui.NominaSettings.monedaIso4217", "Moneda (ISO 4217)")}</span>
              <input
                className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm uppercase"
                maxLength={8}
                value={pol.moneda ?? "USD"}
                onChange={(e) => setPol({ moneda: e.target.value.toUpperCase() })}
              />
            </label>
            <NumeroField
              label={t("ui.NominaSettings.jornadaOrdinariaDiariaH", "Jornada ordinaria diaria (h)")}
              value={pol.horasOrdinariasDia}
              max={24}
              hint={t("ui.ReglasDePago.diariaAyuda", "Lo que pase de aquí en un día es hora extra. 0 = sin límite diario (EE. UU.).")}
              onChange={(v) => setPol({ horasOrdinariasDia: v })}
            />
            <NumeroField
              label={t("ui.ReglasDePago.jornadaSemanal", "Jornada ordinaria semanal (h)")}
              value={pol.horasOrdinariasSemana}
              max={168}
              hint={t("ui.ReglasDePago.semanalAyuda", "Lo que pase de aquí en la semana es hora extra (EE. UU.: 40). 0 = sin regla semanal.")}
              onChange={(v) => setPol({ horasOrdinariasSemana: v })}
            />
            <label className="block">
              <span className="cg-eyebrow">{t("ui.ReglasDePago.semanaLaboralEmpieza", "La semana laboral empieza el")}</span>
              <select
                className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                value={String(pol.semanaIniciaDia ?? 1)}
                onChange={(e) => setPol({ semanaIniciaDia: Number(e.target.value) })}
              >
                {DIAS.map((d) => (
                  <option key={d} value={String(d)}>{nombreDia(d)}</option>
                ))}
              </select>
            </label>

            <NumeroField
              label={t("ui.NominaSettings.nocturnoDesdeHora", "Nocturno: desde (hora)")}
              value={pol.nocturno?.desdeHora}
              max={23}
              onChange={(v) => setNoct({ desdeHora: v })}
            />
            <NumeroField
              label={t("ui.NominaSettings.nocturnoHastaHora", "Nocturno: hasta (hora)")}
              value={pol.nocturno?.hastaHora}
              max={23}
              onChange={(v) => setNoct({ hastaHora: v })}
            />
            <NumeroField
              label={t("ui.NominaSettings.recargoNocturnoPct", "Recargo nocturno (%)")}
              value={pol.nocturno?.recargoPct}
              onChange={(v) => setNoct({ recargoPct: v })}
            />
            <NumeroField
              label={t("ui.NominaSettings.recargoDominicalPct", "Recargo dominical (%)")}
              value={pol.domingoRecargoPct}
              onChange={(v) => setPol({ domingoRecargoPct: v })}
            />
            <NumeroField
              label={t("ui.NominaSettings.recargoEnDiaDeDescansoPct", "Recargo en día de descanso (%)")}
              value={pol.descansoRecargoPct}
              onChange={(v) => setPol({ descansoRecargoPct: v })}
            />
            <NumeroField
              label={t("ui.NominaSettings.recargoEnFeriadoPct", "Recargo en feriado (%)")}
              value={pol.feriadoRecargoPct}
              hint={t("ui.ReglasDePago.feriadoAyuda", "Es el único recargo de feriado: Festivos y el costo del horario usan este mismo.")}
              onChange={(v) => setPol({ feriadoRecargoPct: v })}
            />

            <label className="block">
              <span className="cg-eyebrow">{t("ui.ReglasDePago.domingoYFeriadoCuentan", "Domingo y feriado cuentan")}</span>
              <select
                className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                value={pol.diaDelRecargo ?? "horas_del_dia"}
                onChange={(e) => setPol({ diaDelRecargo: e.target.value as Politica["diaDelRecargo"] })}
              >
                <option value="horas_del_dia">{t("ui.ReglasDePago.horasDelDia", "Sólo las horas que caen ese día")}</option>
                <option value="dia_de_inicio">{t("ui.ReglasDePago.diaDeInicio", "Todo el turno, por el día en que empieza")}</option>
              </select>
            </label>
            <label className="block">
              <span className="cg-eyebrow">
                {t("ui.NominaSettings.cuandoVariosRecargosCaen", "Cuando varios recargos caen sobre la misma hora")}
              </span>
              <select
                className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                value={pol.acumulacionDeRecargos ?? "suma"}
                onChange={(e) => setPol({ acumulacionDeRecargos: e.target.value as "suma" | "mayor" })}
              >
                <option value="suma">{t("ui.NominaSettings.seSuman", "Se suman")}</option>
                <option value="mayor">{t("ui.NominaSettings.ganaElMayor", "Gana el mayor")}</option>
              </select>
            </label>

            <TramosExtra tramos={tramos} onChange={(t2) => setPol({ tramosExtra: t2 })} />

            <NumeroField
              label={t("ui.ReglasDePago.graciaSalida", "Gracia al salir (minutos)")}
              value={pol.graciaSalidaMinutos}
              max={120}
              hint={t("ui.ReglasDePago.graciaAyuda", "Quedarse hasta estos minutos después del fin del turno (esperando el relevo) no se paga; más que eso se paga entero. 0 = se paga cada minuto.")}
              onChange={(v) => setPol({ graciaSalidaMinutos: v })}
            />
            <label className="glass-flat glass-hover flex cursor-pointer items-center gap-2.5 self-end px-3 py-2.5">
              <input
                type="checkbox"
                className="cg-focus size-4"
                style={{ accentColor: "var(--brand)" }}
                checked={pol.pagarEntradaTemprana !== false}
                onChange={(e) => setPol({ pagarEntradaTemprana: e.target.checked })}
              />
              <span className="text-sm">{t("ui.ReglasDePago.pagarEntradaTemprana", "Pagar el tiempo antes de la hora de entrada")}</span>
            </label>
          </div>

          <div>
            <span className="text-sm font-medium">{t("ui.ReglasDePago.ausenciasQueSePagan", "Ausencias que se pagan")}</span>
            <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
              {t(
                "ui.ReglasDePago.ausenciasAyuda",
                "Una ausencia que no se paga sigue justificada (no es una falta), pero se descuenta. Un permiso «personal» se paga o no según lo que diga el propio permiso.",
              )}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CATEGORIAS.map((c) => (
                <label key={c} className="glass-flat glass-hover flex cursor-pointer items-center gap-2.5 px-3 py-2">
                  <input
                    type="checkbox"
                    className="cg-focus size-4"
                    style={{ accentColor: "var(--brand)" }}
                    checked={!!(pol.ausenciasPagadas || {})[c]}
                    onChange={(e) => setPol({ ausenciasPagadas: { ...(pol.ausenciasPagadas || {}), [c]: e.target.checked } })}
                  />
                  <span className="text-sm">{nombreCategoria(c)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
