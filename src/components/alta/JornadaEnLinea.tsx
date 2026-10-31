import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Utensils } from "lucide-react";

import {
  copiarLunesATodos,
  finDeAlmuerzo,
  minutosNetos,
  OPCIONES_DE_ALMUERZO,
  presetConSabadoMedio,
  presetLunesAViernes,
  textoDeHoras,
  validarJornada,
  type Jornada,
} from "@/lib/jornadaSemanal";
import { nombreDeDia } from "@/lib/secuenciaDeRotacion";

/**
 * The office week, INLINE, for «Agregar persona».
 *
 * Same rows and rules as the Schedule's office editor (one row per weekday,
 * hours per day, optional lunch, «Copiar el lunes a todos»), but without the
 * modal and without saving: the person does not exist yet when this is
 * filled, so the wizard saves it right after creating them.
 */
export default function JornadaEnLinea({
  value,
  onChange,
}: {
  value: Jornada;
  onChange: (j: Jornada) => void;
}) {
  const { t } = useTranslation();
  const v = useMemo(() => validarJornada(value), [value]);
  const cambiar = (i: number, delta: Partial<Jornada[number]>) =>
    onChange(value.map((d, k) => (k === i ? { ...d, ...delta } : d)));

  const errorDe = (e: string | null) =>
    e === "horaInvalida"
      ? t("ui.OfficeHours.horaInvalida", "Escribe la hora como 08:00")
      : e === "mismaHora"
        ? t(
            "ui.OfficeHours.mismaHora",
            "La salida no puede ser a la misma hora que la entrada",
          )
        : e === "almuerzoFuera"
          ? t(
              "ui.OfficeHours.almuerzoFuera",
              "El almuerzo tiene que quedar dentro de la jornada",
            )
          : null;

  const preset =
    "cg-focus rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors hover:border-[var(--brand-line)]";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        <button
          className={preset}
          style={{ borderColor: "var(--hairline)" }}
          type="button"
          onClick={() => onChange(presetLunesAViernes())}
        >
          {t(
            "ui.OfficeHours.presetLunesAViernes",
            "Lunes a viernes 08:00–17:00",
          )}
        </button>
        <button
          className={preset}
          style={{ borderColor: "var(--hairline)" }}
          type="button"
          onClick={() => onChange(presetConSabadoMedio())}
        >
          {t(
            "ui.OfficeHours.presetSabadoMedio",
            "Lunes a viernes + sábado medio día (08:00–12:00)",
          )}
        </button>
        <button
          className={`${preset} inline-flex items-center gap-1`}
          disabled={!value[0]?.activo}
          style={{ borderColor: "var(--hairline)" }}
          type="button"
          onClick={() => onChange(copiarLunesATodos(value))}
        >
          <Copy size={11} />
          {t("ui.OfficeHours.copiarLunes", "Copiar el lunes a todos")}
        </button>
      </div>

      <div
        className="divide-y overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--hairline)" }}
      >
        {value.map((d, i) => {
          const error = errorDe(v.porDia[d.dia]);
          const id = `alta-jornada-${d.dia}`;

          return (
            <div
              key={d.dia}
              className="px-3 py-2"
              style={{ borderColor: "var(--hairline)" }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="flex w-32 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium"
                  htmlFor={`${id}-on`}
                >
                  <input
                    checked={d.activo}
                    className="cg-focus"
                    id={`${id}-on`}
                    type="checkbox"
                    onChange={(e) => cambiar(i, { activo: e.target.checked })}
                  />
                  <span className="capitalize">{nombreDeDia(i, t)}</span>
                </label>
                {d.activo ? (
                  <span className="flex items-center gap-1.5">
                    <input
                      aria-invalid={!!error}
                      aria-label={t("ui.StaffSchedule.entra", "Entra")}
                      className="cg-input cg-focus h-8 w-[6.5rem] px-2 text-center font-mono text-sm tabular-nums"
                      id={`${id}-start`}
                      style={error ? { borderColor: "var(--bad)" } : undefined}
                      type="time"
                      value={d.start}
                      onChange={(e) => cambiar(i, { start: e.target.value })}
                    />
                    <span
                      className="text-xs"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      –
                    </span>
                    <input
                      aria-invalid={!!error}
                      aria-label={t("ui.StaffSchedule.sale", "Sale")}
                      className="cg-input cg-focus h-8 w-[6.5rem] px-2 text-center font-mono text-sm tabular-nums"
                      id={`${id}-end`}
                      style={error ? { borderColor: "var(--bad)" } : undefined}
                      type="time"
                      value={d.end}
                      onChange={(e) => cambiar(i, { end: e.target.value })}
                    />
                  </span>
                ) : (
                  <span
                    className="text-xs"
                    style={{ color: "var(--ink-faint)" }}
                  >
                    {t("ui.AllStaff.libre", "Libre")}
                  </span>
                )}
                {d.activo && minutosNetos(d) > 0 && (
                  <span
                    className="ml-auto text-[11px] font-semibold tabular-nums"
                    style={{ color: "var(--ink-soft)" }}
                    title={t(
                      "ui.OfficeHours.horasNetas",
                      "Horas de trabajo, sin el almuerzo",
                    )}
                  >
                    {textoDeHoras(minutosNetos(d))}
                  </span>
                )}
              </div>
              {d.activo && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-6">
                  <button
                    aria-pressed={d.almuerzo}
                    className="cg-focus inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                    style={
                      d.almuerzo
                        ? {
                            borderColor: "var(--brand)",
                            background:
                              "color-mix(in oklab, var(--brand) 10%, transparent)",
                            color: "var(--brand-text)",
                          }
                        : {
                            borderColor: "var(--hairline)",
                            color: "var(--ink-soft)",
                          }
                    }
                    type="button"
                    onClick={() => cambiar(i, { almuerzo: !d.almuerzo })}
                  >
                    <Utensils size={11} />
                    {d.almuerzo
                      ? t("ui.OfficeHours.almuerzo", "Almuerzo")
                      : t("ui.OfficeHours.agregarAlmuerzo", "Agregar almuerzo")}
                  </button>
                  {d.almuerzo && (
                    <span className="flex items-center gap-1.5">
                      <input
                        aria-label={t(
                          "ui.OfficeHours.almuerzoDesde",
                          "Hora del almuerzo",
                        )}
                        className="cg-input cg-focus h-7 w-[6.5rem] px-2 text-center font-mono text-xs tabular-nums"
                        id={`${id}-lunch`}
                        style={
                          v.porDia[d.dia] === "almuerzoFuera"
                            ? { borderColor: "var(--bad)" }
                            : undefined
                        }
                        type="time"
                        value={d.breakStart}
                        onChange={(e) =>
                          cambiar(i, { breakStart: e.target.value })
                        }
                      />
                      <select
                        aria-label={t(
                          "ui.OfficeHours.duracionAlmuerzo",
                          "Duración del almuerzo",
                        )}
                        className="cg-input cg-focus h-7 px-2 text-xs"
                        id={`${id}-lunch-min`}
                        value={d.breakMinutes}
                        onChange={(e) =>
                          cambiar(i, { breakMinutes: Number(e.target.value) })
                        }
                      >
                        {[...new Set([...OPCIONES_DE_ALMUERZO, d.breakMinutes])]
                          .sort((a, b) => a - b)
                          .map((m) => (
                            <option key={m} value={m}>
                              {m >= 60 && m % 60 === 0
                                ? t("ui.OfficeHours.nHoras", {
                                    defaultValue: "{{count}} h",
                                    count: m / 60,
                                  })
                                : t("ui.OfficeHours.nMinutos", {
                                    defaultValue: "{{count}} min",
                                    count: m,
                                  })}
                            </option>
                          ))}
                      </select>
                      {v.porDia[d.dia] !== "almuerzoFuera" && d.breakStart && (
                        <span
                          className="text-[11px] tabular-nums"
                          style={{ color: "var(--ink-faint)" }}
                        >
                          {t("ui.OfficeHours.hasta", {
                            defaultValue: "hasta {{hora}}",
                            hora: finDeAlmuerzo(d.breakStart, d.breakMinutes),
                          })}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              )}
              {error && (
                <p
                  className="mt-1 pl-6 text-[11px]"
                  style={{ color: "var(--bad-text)" }}
                >
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {v.ningunDia && (
        <p className="text-[11px]" style={{ color: "var(--warn-text)" }}>
          {t(
            "agregarPersona.paso3.ningunDia",
            "Marca al menos un día, o toca «Lo hago después».",
          )}
        </p>
      )}
    </div>
  );
}
