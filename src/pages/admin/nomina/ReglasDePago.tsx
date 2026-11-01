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
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Scale, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/ui/confirmDialog";
import { Section } from "@/components/kit";
import attendanceService from "@/lib/api/attendanceService";
import { hoyEnLaEmpresa } from "@/lib/horaDeLaEmpresa";
import {
  cambioDelCampo, eleccionDe, estadoDeLosCambios, type CampoFechado, type EleccionDeLeyes,
} from "@/lib/cambiosDeLey";
import CambiosDeLey, { fechaDeLey, valorDelCampo } from "./CambiosDeLey";
import {
  activosDe, combinacionesDe, horaCon, turnoDeEjemplo,
  type Combinaciones, type RecargosActivos, type Regla,
} from "@/lib/recargos";

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
  /** Weekly rest day of people without a rotation (supervisors, office); null = none. */
  diaDescansoSemanal?: number | null;
  /** Overtime hours inside this window take this rate when it beats their tier; null = off. */
  extraNocturna?: { desdeHora?: number; hastaHora?: number; recargoPct?: number } | null;
  feriadoRecargoPct?: number;
  acumulacionDeRecargos?: "suma" | "mayor";
  graciaSalidaMinutos?: number;
  pagarEntradaTemprana?: boolean;
  ausenciasPagadas?: Record<string, boolean>;
  /** Which surcharges are paid at all (the % is kept when one is off). */
  recargosActivos?: Partial<RecargosActivos>;
  /** How each pair of surcharges combines on the same hour. */
  combinaciones?: Partial<Combinaciones>;
  configuradaEl?: string | null;
  /** Premium on the seventh day of a workweek worked whole (California, Kentucky); null = none. */
  septimoDia?: {
    primerasHoras?: number;
    recargoPct?: number;
    recargoPctDespues?: number;
    soloSiSemanaPasaDe?: number | null;
  } | null;
}

/** US states with their own overtime rules (backend PRESETS_REGIONALES). */
const NOMBRE_DE_ESTADO: Record<string, string> = {
  CA: "California",
  AK: "Alaska",
  NV: "Nevada",
  CO: "Colorado",
  KY: "Kentucky",
};

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

/** One surcharge: its on/off switch, and its fields while it is on. */
function FilaDeRecargo({
  titulo,
  ayuda,
  activo,
  onActivo,
  children,
}: {
  titulo: string;
  ayuda?: string;
  activo: boolean;
  onActivo: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="glass-flat space-y-3 px-3 py-2.5">
      <label className="flex cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          className="cg-focus size-4"
          style={{ accentColor: "var(--brand)" }}
          checked={activo}
          onChange={(e) => onActivo(e.target.checked)}
        />
        <span className="text-sm font-medium">{titulo}</span>
      </label>
      {ayuda && (
        <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
          {ayuda}
        </p>
      )}
      {activo && children && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{children}</div>}
    </div>
  );
}

/** How one pair combines. Day pairs can follow the general rule. */
function SelectorDePar({
  label,
  value,
  onChange,
  conGeneral,
  general,
}: {
  label: string;
  value: Regla | null | undefined;
  onChange: (v: Regla | null) => void;
  conGeneral: boolean;
  general?: string;
}) {
  const { t } = useTranslation();

  return (
    <label className="block">
      <span className="cg-eyebrow">{label}</span>
      <select
        className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
        value={value ?? (conGeneral ? "" : "suma")}
        onChange={(e) => onChange(e.target.value === "" ? null : (e.target.value as Regla))}
      >
        {conGeneral && (
          <option value="">
            {t("ui.ReglasDePago.comb.comoLaGeneral", { regla: general, defaultValue: "Como la regla general ({{regla}})" })}
          </option>
        )}
        <option value="suma">{t("ui.NominaSettings.seSuman", "Se suman")}</option>
        <option value="mayor">{t("ui.NominaSettings.ganaElMayor", "Gana el mayor")}</option>
      </select>
    </label>
  );
}

export default function ReglasDePago({
  payroll,
  onChange,
  leyes: leyesGuardadas,
  onLeyesChange,
}: {
  payroll: PayrollDeAjustes;
  onChange: (p: PayrollDeAjustes) => void;
  /** The company's choice about the law's dated changes (`nominaSettings.leyes`). */
  leyes?: Partial<EleccionDeLeyes> | null;
  onLeyesChange?: (l: EleccionDeLeyes) => void;
}) {
  const { t } = useTranslation();
  const presets = useQuery({
    queryKey: ["attendance", "pay-rule-presets"],
    queryFn: () => attendanceService.payRulePresets(),
    staleTime: 10 * 60_000,
  });
  const ley = useQuery({
    queryKey: ["attendance", "pay-rule-legal-changes"],
    queryFn: () => attendanceService.payRuleLegalChanges(),
    staleTime: 10 * 60_000,
  });
  const [estadoElegido, setEstadoElegido] = useState("");

  const pol: Politica = payroll.politica || {};
  const setPol = (patch: Partial<Politica>) =>
    onChange({ ...payroll, politica: { ...pol, ...patch } });
  const setNoct = (patch: Partial<NonNullable<Politica["nocturno"]>>) =>
    setPol({ nocturno: { ...(pol.nocturno || {}), ...patch } });
  const setExtraNoct = (patch: Partial<NonNullable<Politica["extraNocturna"]>>) =>
    setPol({ extraNocturna: { ...(pol.extraNocturna || {}), ...patch } });
  const activos = activosDe(pol);
  const setActivo = (clave: keyof RecargosActivos, v: boolean) =>
    setPol({ recargosActivos: { ...activos, [clave]: v } });
  const comb = combinacionesDe(pol);
  const setComb = (clave: keyof Combinaciones, v: Regla | null) =>
    setPol({ combinaciones: { ...comb, [clave]: v } });
  const nombreRegla = (r: Regla | null | undefined) =>
    r === "mayor" ? t("ui.NominaSettings.ganaElMayor", "Gana el mayor") : t("ui.NominaSettings.seSuman", "Se suman");
  const general = nombreRegla(pol.acumulacionDeRecargos);
  const extraNocturnaActiva = !!pol.extraNocturna && activos.extraNocturna;

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
  const regiones = pais ? presets.data?.regiones?.[pais] : undefined;
  const presetDelEstado = estadoElegido && regiones ? regiones[estadoElegido] : undefined;
  const preset = presetDelEstado || (pais ? presets.data?.presets?.[pais] : undefined);
  const nombreDelPreset = presetDelEstado ? NOMBRE_DE_ESTADO[estadoElegido] || estadoElegido : nombrePais(pais);

  /* The law's dated changes, with their status for the values ON SCREEN. */
  const leyes = eleccionDe(leyesGuardadas);
  const cambios = estadoDeLosCambios(pol, ley.data?.changes || [], leyes, ley.data?.today || hoyEnLaEmpresa());
  const avisoDeLey = (campo: CampoFechado): string | undefined => {
    const c = cambioDelCampo(cambios, campo);
    if (!c) return undefined;
    const datos = { fecha: fechaDeLey(c.effectiveFrom), valor: valorDelCampo(c.field, c.to) };
    return c.vigente
      ? t("ui.CambiosDeLey.enVigorDesde", { ...datos, defaultValue: "La ley fija {{valor}} desde el {{fecha}}: se paga así aunque aquí diga otra cifra." })
      : t("ui.CambiosDeLey.cambiaEl", { ...datos, defaultValue: "Cambia el {{fecha}} a {{valor}} (ley)." });
  };

  const aplicarPreset = async () => {
    const p = preset;

    if (!p) return;
    const ok = await confirmDialog({
      title: t("ui.ReglasDePago.aplicarTitulo", {
        pais: nombreDelPreset,
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
      tramos.length && activos.extra
        ? t("ui.ReglasDePago.resumen.extraConRecargo", {
            tramos: tramos.map((x) => `+${x.recargoPct} %${x.desdeHora > 0 ? ` (${t("ui.ReglasDePago.resumen.desdeLaHora", { n: x.desdeHora + 1, defaultValue: "desde la {{n}}.ª" })})` : ""}`).join(", "),
            defaultValue: "Horas extra: {{tramos}}",
          })
        : t("ui.ReglasDePago.resumen.extraSimple", "Horas extra: a tarifa simple"),
    );
    if (pol.septimoDia) {
      const sd = pol.septimoDia;
      filas.push(
        t("ui.ReglasDePago.resumen.septimoDia", {
          h: sd.primerasHoras ?? 8,
          a: sd.recargoPct ?? 50,
          b: sd.recargoPctDespues ?? sd.recargoPct ?? 50,
          defaultValue: "Séptimo día seguido de la semana: las primeras {{h}} h a +{{a}} %, el resto a +{{b}} %",
        }) +
          (sd.soloSiSemanaPasaDe
            ? t("ui.ReglasDePago.resumen.septimoSoloSi", { h: sd.soloSiSemanaPasaDe, defaultValue: " (si la semana pasa de {{h}} h)" })
            : ""),
      );
    }
    const n = pol.nocturno || {};

    filas.push(
      t("ui.ReglasDePago.resumen.noche", {
        desde: String(n.desdeHora ?? 22).padStart(2, "0"),
        hasta: String(n.hastaHora ?? 6).padStart(2, "0"),
        pct: activos.nocturno ? (n.recargoPct ?? 0) : 0,
        defaultValue: "Noche ({{desde}}:00–{{hasta}}:00): +{{pct}} %",
      }),
    );
    const xn = extraNocturnaActiva ? pol.extraNocturna : null;

    filas.push(
      xn
        ? t("ui.ReglasDePago.resumen.extraNocturna", {
            desde: String(xn.desdeHora ?? 0).padStart(2, "0"),
            hasta: String(xn.hastaHora ?? 6).padStart(2, "0"),
            pct: xn.recargoPct ?? 0,
            defaultValue: "Hora extra nocturna ({{desde}}:00–{{hasta}}:00): +{{pct}} % (o su escalón, si es mayor)",
          })
        : t("ui.ReglasDePago.resumen.extraNocturnaComoExtra", "Hora extra nocturna: como cualquier hora extra"),
    );
    const pctONo = (on: boolean, pct: number | undefined) =>
      on ? `+${pct ?? 0} %` : t("ui.ReglasDePago.resumen.noSePaga", "no se paga");

    filas.push(
      t("ui.ReglasDePago.resumen.recargosV2", {
        domingo: pctONo(activos.domingo, pol.domingoRecargoPct),
        descanso: pctONo(activos.descanso, pol.descansoRecargoPct),
        feriado: pctONo(activos.feriado, pol.feriadoRecargoPct),
        defaultValue: "Domingo {{domingo}} · Descanso trabajado {{descanso}} · Feriado {{feriado}}",
      }),
    );
    filas.push(
      t("ui.ReglasDePago.resumen.combinaciones", {
        fd: nombreRegla(comb.feriadoDescanso ?? pol.acumulacionDeRecargos),
        fo: nombreRegla(comb.feriadoDomingo ?? pol.acumulacionDeRecargos),
        od: nombreRegla(comb.domingoDescanso ?? pol.acumulacionDeRecargos),
        noche: comb.nocheDomingo === comb.nocheFeriado && comb.nocheFeriado === comb.nocheDescanso
          ? nombreRegla(comb.nocheFeriado)
          : t("ui.ReglasDePago.resumen.segunElDia", "según el día"),
        extra: nombreRegla(comb.extraDia),
        defaultValue: "Si caen juntos — feriado y descanso: {{fd}} · feriado y domingo: {{fo}} · domingo y descanso: {{od}} · noche con esos días: {{noche}} · hora extra con esos días: {{extra}}",
      }),
    );
    filas.push(
      pol.diaDescansoSemanal === null || pol.diaDescansoSemanal === undefined
        ? t("ui.ReglasDePago.resumen.descansoSinSemanal", "Día de descanso: el libre de la rotación de cada vigilante (supervisores y oficina: ninguno)")
        : t("ui.ReglasDePago.resumen.descanso", {
            dia: nombreDia(Number(pol.diaDescansoSemanal)),
            defaultValue: "Día de descanso: el libre de la rotación de cada vigilante · supervisores y oficina: {{dia}}",
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
  }, [payroll, t]); // eslint-disable-line react-hooks/exhaustive-deps

  const ejemplo = turnoDeEjemplo(pol);
  const ejemplos: Array<[string, number]> = [
    [t("ui.ReglasDePago.ej.feriadoDescanso", "Una hora de día en un feriado que además es su día de descanso"), horaCon(pol, ["feriado", "descanso"])],
    [t("ui.ReglasDePago.ej.domingoFeriado", "Una hora de día en un domingo que es feriado"), horaCon(pol, ["domingo", "feriado"])],
    [t("ui.ReglasDePago.ej.domingoDescanso", "Una hora de día en un domingo que es su día de descanso"), horaCon(pol, ["domingo", "descanso"])],
    [t("ui.ReglasDePago.ej.nocheDomingo", "Una hora de noche en domingo"), horaCon(pol, ["nocturno", "domingo"])],
    [t("ui.ReglasDePago.ej.nocheFeriadoDescanso", "Una hora de noche en un feriado que es su día de descanso"), horaCon(pol, ["nocturno", "feriado", "descanso"])],
    [t("ui.ReglasDePago.ej.extraFeriado", "Una hora extra (primer escalón) en feriado"), horaCon(pol, ["extra", "feriado"])],
  ];

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
              <div className="flex flex-wrap items-center gap-2">
                {regiones && Object.keys(regiones).length > 0 && (
                  <label className="flex items-center gap-1.5 text-sm">
                    <span className="sr-only">{t("ui.ReglasDePago.estado", "Estado")}</span>
                    <select
                      className="cg-input cg-focus px-2 py-1.5 text-sm"
                      value={estadoElegido}
                      onChange={(e) => setEstadoElegido(e.target.value)}
                      aria-label={t("ui.ReglasDePago.estado", "Estado")}
                    >
                      <option value="">{t("ui.ReglasDePago.estadoFederal", "Otro estado (sólo la ley federal)")}</option>
                      {Object.keys(regiones).map((r) => (
                        <option key={r} value={r}>{NOMBRE_DE_ESTADO[r] || r}</option>
                      ))}
                    </select>
                  </label>
                )}
                {preset && pais && (
                  <Button size="sm" variant="outline" onClick={() => aplicarPreset()}>
                    {t("ui.ReglasDePago.aplicarReglasDe", {
                      pais: nombreDelPreset,
                      defaultValue: "Aplicar reglas de {{pais}}",
                    })}
                  </Button>
                )}
              </div>
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
            <CambiosDeLey
              cambios={cambios}
              avisos={ley.data?.notices || []}
              leyes={leyes}
              onChange={(l) => onLeyesChange?.(l)}
            />
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
          </div>

          {/* Each rule the company may use or not. */}
          <div className="space-y-2">
            <span className="text-sm font-medium">{t("ui.ReglasDePago.queUsa", "Qué usa tu empresa")}</span>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.usarSemanal", "Contar horas extra por semana")}
              ayuda={t("ui.ReglasDePago.semanalAyuda", "Lo que pase de aquí en la semana es hora extra (EE. UU.: 40). 0 = sin regla semanal.")}
              activo={Number(pol.horasOrdinariasSemana || 0) > 0}
              onActivo={(v) => setPol({ horasOrdinariasSemana: v ? 40 : 0 })}
            >
              <NumeroField
                label={t("ui.ReglasDePago.jornadaSemanal", "Jornada ordinaria semanal (h)")}
                value={pol.horasOrdinariasSemana}
                min={1}
                max={168}
                hint={avisoDeLey("horasOrdinariasSemana")}
                onChange={(v) => setPol({ horasOrdinariasSemana: v })}
              />
            </FilaDeRecargo>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.usarSeptimoDia", "Pagar aparte el séptimo día seguido")}
              ayuda={t(
                "ui.ReglasDePago.septimoDiaAyuda",
                "Cuando alguien trabaja los siete días de una semana laboral (California, Kentucky). Cada hora de ese día cobra lo más alto entre su recargo y este: nunca se paga dos veces.",
              )}
              activo={!!pol.septimoDia}
              onActivo={(v) =>
                setPol({ septimoDia: v ? { primerasHoras: 8, recargoPct: 50, recargoPctDespues: 100, soloSiSemanaPasaDe: null } : null })
              }
            >
              <NumeroField
                label={t("ui.ReglasDePago.septimoPrimeras", "Primeras horas (h)")}
                value={pol.septimoDia?.primerasHoras}
                max={24}
                onChange={(v) => setPol({ septimoDia: { ...(pol.septimoDia || {}), primerasHoras: v } })}
              />
              <NumeroField
                label={t("ui.ReglasDePago.septimoRecargo", "Recargo de esas horas (%)")}
                value={pol.septimoDia?.recargoPct}
                onChange={(v) => setPol({ septimoDia: { ...(pol.septimoDia || {}), recargoPct: v } })}
              />
              <NumeroField
                label={t("ui.ReglasDePago.septimoDespues", "Recargo después (%)")}
                value={pol.septimoDia?.recargoPctDespues}
                onChange={(v) => setPol({ septimoDia: { ...(pol.septimoDia || {}), recargoPctDespues: v } })}
              />
              <NumeroField
                label={t("ui.ReglasDePago.septimoSoloSi", "Sólo si la semana pasa de (h)")}
                value={pol.septimoDia?.soloSiSemanaPasaDe ?? 0}
                max={168}
                hint={t("ui.ReglasDePago.septimoSoloSiAyuda", "0 = siempre. Kentucky: 40.")}
                onChange={(v) => setPol({ septimoDia: { ...(pol.septimoDia || {}), soloSiSemanaPasaDe: v > 0 ? v : null } })}
              />
            </FilaDeRecargo>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.usarGracia", "No pagar la espera corta al salir (gracia)")}
              ayuda={t("ui.ReglasDePago.graciaAyuda", "Quedarse hasta estos minutos después del fin del turno (esperando el relevo) no se paga; más que eso se paga entero. 0 = se paga cada minuto.")}
              activo={Number(pol.graciaSalidaMinutos || 0) > 0}
              onActivo={(v) => setPol({ graciaSalidaMinutos: v ? 5 : 0 })}
            >
              <NumeroField
                label={t("ui.ReglasDePago.graciaSalida", "Gracia al salir (minutos)")}
                value={pol.graciaSalidaMinutos}
                min={1}
                max={120}
                onChange={(v) => setPol({ graciaSalidaMinutos: v })}
              />
            </FilaDeRecargo>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.pagarEntradaTemprana", "Pagar el tiempo antes de la hora de entrada")}
              ayuda={t("ui.ReglasDePago.tempranaAyuda", "Sin marcar, el pago empieza a la hora prevista aunque la persona marque antes.")}
              activo={pol.pagarEntradaTemprana !== false}
              onActivo={(v) => setPol({ pagarEntradaTemprana: v })}
            />
          </div>

          {/* Each surcharge: on/off and its %. */}
          <div className="space-y-2">
            <span className="text-sm font-medium">{t("ui.ReglasDePago.recargos", "Recargos")}</span>
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {t("ui.ReglasDePago.recargosAyuda", "Apaga un recargo para dejar de pagarlo sin perder el porcentaje escrito.")}
            </p>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.rec.noche", "Recargo nocturno")}
              activo={activos.nocturno}
              onActivo={(v) => setActivo("nocturno", v)}
            >
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
            </FilaDeRecargo>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.rec.domingo", "Recargo dominical")}
              activo={activos.domingo}
              onActivo={(v) => setActivo("domingo", v)}
            >
              <NumeroField
                label={t("ui.NominaSettings.recargoDominicalPct", "Recargo dominical (%)")}
                value={pol.domingoRecargoPct}
                hint={avisoDeLey("domingoRecargoPct")}
                onChange={(v) => setPol({ domingoRecargoPct: v })}
              />
            </FilaDeRecargo>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.rec.descanso", "Recargo por trabajar en el día de descanso")}
              ayuda={t(
                "ui.ReglasDePago.descansoAyuda",
                "Se paga sobre las horas trabajadas en el día libre de cada persona: el libre de su rotación, o un día marcado «L» en el Horario.",
              )}
              activo={activos.descanso}
              onActivo={(v) => setActivo("descanso", v)}
            >
              <NumeroField
                label={t("ui.NominaSettings.recargoEnDiaDeDescansoPct", "Recargo en día de descanso (%)")}
                value={pol.descansoRecargoPct}
                hint={avisoDeLey("descansoRecargoPct")}
                onChange={(v) => setPol({ descansoRecargoPct: v })}
              />
              <label className="block sm:col-span-2">
                <span className="cg-eyebrow">{t("ui.ReglasDePago.descansoSemanal", "Día de descanso semanal (supervisores y oficina)")}</span>
                <select
                  className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  value={pol.diaDescansoSemanal === null || pol.diaDescansoSemanal === undefined ? "" : String(pol.diaDescansoSemanal)}
                  onChange={(e) => setPol({ diaDescansoSemanal: e.target.value === "" ? null : Number(e.target.value) })}
                >
                  <option value="">{t("ui.ReglasDePago.ninguno", "Ninguno")}</option>
                  {DIAS.map((d) => (
                    <option key={d} value={String(d)}>{nombreDia(d)}</option>
                  ))}
                </select>
                <span className="mt-1 block text-xs" style={{ color: "var(--ink-faint)" }}>
                  {t("ui.ReglasDePago.descansoSemanalAyuda", "Quien no tiene rotación cobra el recargo de descanso si trabaja este día.")}
                </span>
              </label>
            </FilaDeRecargo>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.rec.feriado", "Recargo en feriado")}
              ayuda={t("ui.ReglasDePago.feriadoAyuda", "Es el único recargo de feriado: Festivos y el costo del horario usan este mismo.")}
              activo={activos.feriado}
              onActivo={(v) => setActivo("feriado", v)}
            >
              <NumeroField
                label={t("ui.NominaSettings.recargoEnFeriadoPct", "Recargo en feriado (%)")}
                value={pol.feriadoRecargoPct}
                hint={avisoDeLey("feriadoRecargoPct")}
                onChange={(v) => setPol({ feriadoRecargoPct: v })}
              />
            </FilaDeRecargo>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.rec.extra", "Recargo de horas extra")}
              ayuda={t("ui.ReglasDePago.rec.extraAyuda", "Apagado, las horas extra se pagan a tarifa simple.")}
              activo={activos.extra}
              onActivo={(v) => setActivo("extra", v)}
            >
              <div className="sm:col-span-3">
                <TramosExtra tramos={tramos} onChange={(t2) => setPol({ tramosExtra: t2 })} />
              </div>
            </FilaDeRecargo>
            <FilaDeRecargo
              titulo={t("ui.ReglasDePago.extraNocturna", "Hora extra nocturna con su propio recargo")}
              ayuda={t(
                "ui.ReglasDePago.extraNocturnaAyuda",
                "Las horas extra que caen en esta franja se pagan con este recargo si es mayor que su escalón (Colombia: 19–6 al 75 %; Ecuador: 0–6 al 100 %).",
              )}
              activo={extraNocturnaActiva}
              onActivo={(v) =>
                setPol({
                  recargosActivos: { ...activos, extraNocturna: v },
                  extraNocturna: v && !pol.extraNocturna
                    ? { desdeHora: pol.nocturno?.desdeHora ?? 22, hastaHora: pol.nocturno?.hastaHora ?? 6, recargoPct: 0 }
                    : pol.extraNocturna ?? null,
                })
              }
            >
              <NumeroField
                label={t("ui.ReglasDePago.extraNocturnaDesde", "Extra nocturna: desde (hora)")}
                value={pol.extraNocturna?.desdeHora}
                max={23}
                onChange={(v) => setExtraNoct({ desdeHora: v })}
              />
              <NumeroField
                label={t("ui.ReglasDePago.extraNocturnaHasta", "Extra nocturna: hasta (hora)")}
                value={pol.extraNocturna?.hastaHora}
                max={23}
                onChange={(v) => setExtraNoct({ hastaHora: v })}
              />
              <NumeroField
                label={t("ui.ReglasDePago.extraNocturnaPct", "Recargo de la extra nocturna (%)")}
                value={pol.extraNocturna?.recargoPct}
                onChange={(v) => setExtraNoct({ recargoPct: v })}
              />
            </FilaDeRecargo>
          </div>

          {/* When several fall on the same hour: the company's rule, pair by pair. */}
          <div className="space-y-3">
            <span className="text-sm font-medium">
              {t("ui.ReglasDePago.comb.titulo", "Cuando varios recargos caen en la misma hora")}
            </span>
            <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
              {t(
                "ui.ReglasDePago.comb.ayuda",
                "«Se suman»: se pagan los dos (feriado 100 % + descanso 100 % = 200 %). «Gana el mayor»: sólo el más alto (= 100 %). Elige para cada caso.",
              )}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="cg-eyebrow">
                  {t("ui.ReglasDePago.comb.general", "Regla general entre domingo, descanso y feriado")}
                </span>
                <select
                  className="cg-input cg-focus mt-1.5 w-full px-3 py-2 text-sm"
                  value={pol.acumulacionDeRecargos ?? "suma"}
                  onChange={(e) => setPol({ acumulacionDeRecargos: e.target.value as Regla })}
                >
                  <option value="suma">{t("ui.NominaSettings.seSuman", "Se suman")}</option>
                  <option value="mayor">{t("ui.NominaSettings.ganaElMayor", "Gana el mayor")}</option>
                </select>
              </label>
              <SelectorDePar
                conGeneral
                general={general}
                label={t("ui.ReglasDePago.comb.feriadoDescanso", "Feriado que cae en su día de descanso")}
                value={comb.feriadoDescanso}
                onChange={(v) => setComb("feriadoDescanso", v)}
              />
              <SelectorDePar
                conGeneral
                general={general}
                label={t("ui.ReglasDePago.comb.feriadoDomingo", "Feriado que cae en domingo")}
                value={comb.feriadoDomingo}
                onChange={(v) => setComb("feriadoDomingo", v)}
              />
              <SelectorDePar
                conGeneral
                general={general}
                label={t("ui.ReglasDePago.comb.domingoDescanso", "Domingo que es su día de descanso")}
                value={comb.domingoDescanso}
                onChange={(v) => setComb("domingoDescanso", v)}
              />
              <SelectorDePar
                conGeneral={false}
                label={t("ui.ReglasDePago.comb.nocheDomingo", "Noche y domingo")}
                value={comb.nocheDomingo}
                onChange={(v) => setComb("nocheDomingo", v || "suma")}
              />
              <SelectorDePar
                conGeneral={false}
                label={t("ui.ReglasDePago.comb.nocheFeriado", "Noche y feriado")}
                value={comb.nocheFeriado}
                onChange={(v) => setComb("nocheFeriado", v || "suma")}
              />
              <SelectorDePar
                conGeneral={false}
                label={t("ui.ReglasDePago.comb.nocheDescanso", "Noche y día de descanso")}
                value={comb.nocheDescanso}
                onChange={(v) => setComb("nocheDescanso", v || "suma")}
              />
              <SelectorDePar
                conGeneral={false}
                label={t("ui.ReglasDePago.comb.extraDia", "Hora extra en domingo, feriado o descanso")}
                value={comb.extraDia}
                onChange={(v) => setComb("extraDia", v || "suma")}
              />
            </div>

            {/* Live examples with the rules as they are on screen. */}
            <div className="glass-flat space-y-1.5 p-3 text-sm">
              <span className="font-medium">{t("ui.ReglasDePago.ej.titulo", "Así se paga con estas reglas")}</span>
              <ul className="space-y-0.5">
                {ejemplos.map(([txt, pct]) => (
                  <li key={txt}>
                    {t("ui.ReglasDePago.ej.fila", { que: txt, pct, defaultValue: "{{que}}: +{{pct}} %" })}
                  </li>
                ))}
              </ul>
              <p className="pt-1" style={{ color: "var(--ink-soft)" }}>
                {t("ui.ReglasDePago.ej.turno", {
                  ord: ejemplo.ordinarias,
                  extra: ejemplo.extra,
                  tarifa: ejemplo.tarifa.toFixed(2),
                  po: ejemplo.pctOrdinaria,
                  pe: ejemplo.pctExtra,
                  total: ejemplo.total.toFixed(2),
                  defaultValue: "Turno de 12 h de día en un feriado que además es su día de descanso, a {{tarifa}} la hora: {{ord}} h a +{{po}} % y {{extra}} h extra a +{{pe}} % = {{total}}",
                })}
              </p>
            </div>
          </div>

          <div>
            <span className="text-sm font-medium">{t("ui.ReglasDePago.ausenciasQueSePagan", "Ausencias que se pagan")}</span>
            <p className="mt-0.5 text-xs" style={{ color: "var(--ink-faint)" }}>
              {t(
                "ui.ReglasDePago.ausenciasAyudaV2",
                "Marcada: se paga. Sin marcar: sigue justificada (no es una falta), pero se descuenta. Un permiso «personal» se paga o no según lo que diga el propio permiso.",
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
