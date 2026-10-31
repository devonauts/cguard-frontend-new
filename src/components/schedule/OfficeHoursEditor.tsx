import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Briefcase, Copy, Loader2, Trash2, Utensils } from "lucide-react";
import { toast } from "sonner";

import { Modal } from "@/components/kit";
import { ApiService } from "@/services/api/apiService";
import {
  copiarLunesATodos,
  cuerpoDeJornada,
  finDeAlmuerzo,
  minutosNetos,
  OPCIONES_DE_ALMUERZO,
  textoDeHoras,
  cuerpoSinJornada,
  presetConSabadoMedio,
  presetLunesAViernes,
  validarJornada,
  type Jornada,
} from "@/lib/jornadaSemanal";
import { nombreDeDia } from "@/lib/secuenciaDeRotacion";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * THE WEEKLY OFFICE EDITOR — one row per weekday, each with its own hours.
 *
 * Replaces the single start/end of the old «Oficina» band: an administrative
 * schedule is «lunes a viernes 08:00–17:00 y el sábado hasta mediodía», and that
 * needs the hours per day. Presets cover the two usual cases; «Copiar el
 * lunes» saves retyping. Used from «Todo el personal» in every Schedule view.
 * ════════════════════════════════════════════════════════════════════════════
 */
export default function OfficeHoursEditor({
  tenantId,
  persona,
  inicial,
  tieneHorario,
  onClose,
  onSaved,
}: {
  tenantId: string;
  persona: { userId: string; name: string };
  /** What to start from; Monday to Friday 08:00–17:00 when null. */
  inicial: Jornada | null;
  /** Shows «Quitar horario» only when there is something to remove. */
  tieneHorario: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [jornada, setJornada] = useState<Jornada>(
    () => inicial || presetLunesAViernes(),
  );
  const [desde, setDesde] = useState("");
  const [guardando, setGuardando] = useState<"" | "guardar" | "quitar">("");
  const v = useMemo(() => validarJornada(jornada, desde), [jornada, desde]);

  const cambiar = (i: number, delta: Partial<Jornada[number]>) =>
    setJornada((j) => j.map((d, k) => (k === i ? { ...d, ...delta } : d)));

  const enviar = async (cuerpo: object, que: "guardar" | "quitar") => {
    setGuardando(que);
    try {
      await ApiService.put(
        `/tenant/${tenantId}/staff-schedule/${persona.userId}/pattern`,
        { data: cuerpo },
      );
      toast.success(
        que === "quitar"
          ? t("ui.OfficeHours.quitado", "Horario quitado")
          : t("ui.StaffSchedule.guardada", "Jornada guardada"),
      );
      onSaved();
    } catch (e: any) {
      toast.error(
        e?.data?.message ||
          e?.message ||
          t("ui.StaffSchedule.errorGuardar", "No se pudo guardar la jornada"),
      );
    } finally {
      setGuardando("");
    }
  };

  const errorDe = (e: string | null) =>
    e === "horaInvalida"
      ? t("ui.OfficeHours.horaInvalida", "Escribe la hora como 08:00")
      : e === "mismaHora"
        ? t("ui.OfficeHours.mismaHora", "La salida no puede ser a la misma hora que la entrada")
        : e === "almuerzoFuera"
          ? t("ui.OfficeHours.almuerzoFuera", "El almuerzo tiene que quedar dentro de la jornada")
          : null;

  const preset =
    "cg-focus rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors hover:border-[var(--brand-line)]";

  return (
    <Modal
      open
      description={persona.name}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {tieneHorario && (
            <button
              className="cg-focus mr-auto inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-40"
              disabled={!!guardando}
              style={{ color: "var(--bad-text)" }}
              type="button"
              onClick={() => enviar(cuerpoSinJornada(), "quitar")}
            >
              {guardando === "quitar" ? (
                <Loader2 className="animate-spin" size={13} />
              ) : (
                <Trash2 size={13} />
              )}
              {t("ui.OfficeHours.quitarHorario", "Quitar horario")}
            </button>
          )}
          <button
            className="cg-btn-ghost cg-focus ml-auto rounded-full px-4 py-2 text-sm font-semibold"
            type="button"
            onClick={onClose}
          >
            {t("ui.StaffSchedule.cancelar", "Cancelar")}
          </button>
          <button
            className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-40"
            disabled={!!guardando || !v.ok}
            type="button"
            onClick={() => enviar(cuerpoDeJornada(jornada, desde), "guardar")}
          >
            {guardando === "guardar" ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              t("ui.StaffSchedule.guardar", "Guardar jornada")
            )}
          </button>
        </div>
      }
      icon={<Briefcase size={16} />}
      size="md"
      title={t("ui.StaffSchedule.tituloModal", "Jornada de oficina")}
      onOpenChange={(o) => !o && onClose()}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <button
            className={preset}
            style={{ borderColor: "var(--hairline)" }}
            type="button"
            onClick={() => setJornada(presetLunesAViernes())}
          >
            {t("ui.OfficeHours.presetLunesAViernes", "Lunes a viernes 08:00–17:00")}
          </button>
          <button
            className={preset}
            style={{ borderColor: "var(--hairline)" }}
            type="button"
            onClick={() => setJornada(presetConSabadoMedio())}
          >
            {t(
              "ui.OfficeHours.presetSabadoMedio",
              "Lunes a viernes + sábado medio día (08:00–12:00)",
            )}
          </button>
          <button
            className={`${preset} inline-flex items-center gap-1`}
            disabled={!jornada[0]?.activo}
            style={{ borderColor: "var(--hairline)" }}
            title={
              jornada[0]?.activo
                ? undefined
                : t("ui.OfficeHours.lunesLibre", "El lunes está libre: no hay horas que copiar")
            }
            type="button"
            onClick={() => setJornada((j) => copiarLunesATodos(j))}
          >
            <Copy size={11} />
            {t("ui.OfficeHours.copiarLunes", "Copiar el lunes a todos")}
          </button>
        </div>

        <div
          className="divide-y overflow-hidden rounded-xl border"
          style={{ borderColor: "var(--hairline)" }}
        >
          {jornada.map((d, i) => {
            const error = errorDe(v.porDia[d.dia]);

            return (
              <div
                key={d.dia}
                className="px-3 py-2"
                style={{ borderColor: "var(--hairline)" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex w-32 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
                    <input
                      checked={d.activo}
                      className="cg-focus"
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
                        style={error ? { borderColor: "var(--bad)" } : undefined}
                        type="time"
                        value={d.start}
                        onChange={(e) => cambiar(i, { start: e.target.value })}
                      />
                      <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                        –
                      </span>
                      <input
                        aria-invalid={!!error}
                        aria-label={t("ui.StaffSchedule.sale", "Sale")}
                        className="cg-input cg-focus h-8 w-[6.5rem] px-2 text-center font-mono text-sm tabular-nums"
                        style={error ? { borderColor: "var(--bad)" } : undefined}
                        type="time"
                        value={d.end}
                        onChange={(e) => cambiar(i, { end: e.target.value })}
                      />
                    </span>
                  ) : (
                    <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
                      {t("ui.AllStaff.libre", "Libre")}
                    </span>
                  )}
                  {d.activo && (
                    <span
                      className="ml-auto text-[11px] font-semibold tabular-nums"
                      style={{ color: "var(--ink-soft)" }}
                      title={t("ui.OfficeHours.horasNetas", "Horas de trabajo, sin el almuerzo")}
                    >
                      {minutosNetos(d) ? textoDeHoras(minutosNetos(d)) : ""}
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
                              background: "color-mix(in oklab, var(--brand) 10%, transparent)",
                              color: "var(--brand-text)",
                            }
                          : { borderColor: "var(--hairline)", color: "var(--ink-soft)" }
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
                          aria-label={t("ui.OfficeHours.almuerzoDesde", "Hora del almuerzo")}
                          className="cg-input cg-focus h-7 w-[6.5rem] px-2 text-center font-mono text-xs tabular-nums"
                          style={error === "almuerzoFuera" ? { borderColor: "var(--bad)" } : undefined}
                          type="time"
                          value={d.breakStart}
                          onChange={(e) => cambiar(i, { breakStart: e.target.value })}
                        />
                        <select
                          aria-label={t("ui.OfficeHours.duracionAlmuerzo", "Duración del almuerzo")}
                          className="cg-input cg-focus h-7 px-2 text-xs"
                          value={d.breakMinutes}
                          onChange={(e) => cambiar(i, { breakMinutes: Number(e.target.value) })}
                        >
                          {[...new Set([...OPCIONES_DE_ALMUERZO, d.breakMinutes])]
                            .sort((a, b) => a - b)
                            .map((m) => (
                              <option key={m} value={m}>
                                {m >= 60 && m % 60 === 0
                                  ? t("ui.OfficeHours.nHoras", { defaultValue: "{{count}} h", count: m / 60 })
                                  : t("ui.OfficeHours.nMinutos", { defaultValue: "{{count}} min", count: m })}
                              </option>
                            ))}
                        </select>
                        {error !== "almuerzoFuera" && d.breakStart && (
                          <span className="text-[11px] tabular-nums" style={{ color: "var(--ink-faint)" }}>
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
                  <p className="mt-1 pl-6 text-[11px]" style={{ color: "var(--bad-text)" }}>
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
              "ui.OfficeHours.ningunDia",
              "Marca al menos un día. Para dejarle sin horario usa «Quitar horario».",
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <label
            className="text-[10px] font-semibold uppercase tracking-wider"
            htmlFor="office-hours-desde"
            style={{ color: "var(--ink-soft)" }}
          >
            {t("ui.OfficeHours.desde", "Desde")}
          </label>
          <input
            aria-invalid={v.fechaInvalida}
            className="cg-input cg-focus h-8 px-2 text-sm"
            id="office-hours-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <span className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
            {t("ui.OfficeHours.desdeAyuda", "Opcional. Vacío = desde hoy.")}
          </span>
        </div>
        <p className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
          {t(
            "ui.StaffSchedule.notaNovedades",
            "Las vacaciones y permisos se registran como novedad, igual que a un vigilante, y mandan sobre la jornada.",
          )}{" "}
          {t(
            "ui.OfficeHours.notaAlmuerzo",
            "El almuerzo no se paga: en el reloj, la persona marca «Salir a almorzar» y «Volver».",
          )}
        </p>
      </div>
    </Modal>
  );
}
