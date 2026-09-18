import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { ApiService } from "@/services/api/apiService";
import { Button } from "@/components/ui/button";
import { FIELD_CLS_LG } from "@/pages/admin/clientes/components/_shared/tab-kit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CADA CUÁNTO TOCA ESTA RONDA
 *
 * Hasta ahora una ronda era un botón disponible durante el turno: no tenía
 * hora, así que no existía «llegó tarde» ni había nada que recordarle al
 * vigilante. Aquí se le pone horario.
 *
 * ── LAS HORAS SON DEL NEGOCIO ──────────────────────────────────────────────
 * «22:00» significa las diez de la noche en la zona horaria de la empresa, no
 * en la del navegador de quien la configura ni en la del servidor. Por eso se
 * escribe y se guarda como texto de reloj y NUNCA se convierte a una fecha
 * aquí: en cuanto esto se pasara por un `Date`, un administrador de visita en
 * otro país le cambiaría la hora a las rondas de toda la operación.
 * ════════════════════════════════════════════════════════════════════════════
 */

export type ModoDeHorario = "once" | "everyN" | "timesPerShift" | "fixedTimes";

export interface HorarioDeRonda {
  scheduleMode?: string | null;
  everyMinutes?: number | null;
  timesPerShift?: number | null;
  fixedTimes?: string[] | string | null;
  graceMinutes?: number | null;
  reminderMinutes?: number | null;
  scheduledDays?: unknown;
}

/** Los días como los escribe y los lee el servidor: números 0-6, domingo=0. */
const DIAS: Array<{ n: number; corta: string }> = [
  { n: 1, corta: "L" },
  { n: 2, corta: "M" },
  { n: 3, corta: "X" },
  { n: 4, corta: "J" },
  { n: 5, corta: "V" },
  { n: 6, corta: "S" },
  { n: 0, corta: "D" },
];

/** Tolerante con lo que haya en la columna: array, JSON en texto, o lista. */
export function leerDias(raw: unknown): number[] {
  let bruto: any = raw;

  if (typeof bruto === "string") {
    const s = bruto.trim();

    if (!s) return [];
    try {
      bruto = JSON.parse(s);
    } catch {
      bruto = s.split(/[,;|]/);
    }
  }
  if (!Array.isArray(bruto)) return [];

  return bruto
    .map((d: any) => Number(d))
    .filter((n: number) => Number.isFinite(n) && n >= 0 && n <= 6);
}

/** Igual de tolerante con las horas fijas. */
export function leerHoras(raw: unknown): string[] {
  let bruto: any = raw;

  if (typeof bruto === "string") {
    const s = bruto.trim();

    if (!s) return [];
    try {
      bruto = JSON.parse(s);
    } catch {
      bruto = s.split(/[,;|]/);
    }
  }
  if (!Array.isArray(bruto)) return [];

  return bruto
    .map((h: any) => String(h).trim())
    .filter((h: string) => /^\d{1,2}:\d{2}$/.test(h))
    .map((h: string) => {
      const [a, b] = h.split(":");

      return `${a.padStart(2, "0")}:${b}`;
    })
    .sort();
}

export function modoDe(r: HorarioDeRonda | null | undefined): ModoDeHorario {
  const m = String(r?.scheduleMode || "").trim();

  return m === "everyN" || m === "timesPerShift" || m === "fixedTimes"
    ? (m as ModoDeHorario)
    : "once";
}

/**
 * El resumen que va en la tarjeta, para no tener que desplegarla para saber
 * cuándo corre la ronda.
 */
export function resumenDeHorario(
  r: HorarioDeRonda | null | undefined,
  t: (k: string, d?: any) => string,
): string {
  const modo = modoDe(r);

  if (modo === "everyN") {
    const m = Number(r?.everyMinutes) || 0;

    if (!m) return t("ronda.horario.sinDefinir", "Sin horario");
    if (m % 60 === 0) {
      const h = m / 60;

      return h === 1
        ? t("ronda.horario.cadaHora", "Cada hora")
        : `${t("ronda.horario.cada", "Cada")} ${h} h`;
    }

    return `${t("ronda.horario.cada", "Cada")} ${m} min`;
  }
  if (modo === "timesPerShift") {
    const n = Number(r?.timesPerShift) || 0;

    if (!n) return t("ronda.horario.sinDefinir", "Sin horario");

    return `${n} ${
      n === 1
        ? t("ronda.horario.vezPorTurno", "vez por turno")
        : t("ronda.horario.vecesPorTurno", "veces por turno")
    }`;
  }
  if (modo === "fixedTimes") {
    const horas = leerHoras(r?.fixedTimes);

    if (!horas.length) return t("ronda.horario.sinDefinir", "Sin horario");

    // Tres y un «+N»: la tarjeta es una línea, no una agenda.
    return horas.length <= 3
      ? horas.join(" · ")
      : `${horas.slice(0, 3).join(" · ")} +${horas.length - 3}`;
  }

  return t("ronda.horario.unaVez", "Una vez por turno");
}

/** El resumen de días. Vacío significa TODOS, nunca NINGUNO. */
export function resumenDeDias(
  r: HorarioDeRonda | null | undefined,
  t: (k: string, d?: any) => string,
): string {
  const dias = leerDias(r?.scheduledDays);

  if (!dias.length) return t("ronda.horario.todosLosDias", "Todos los días");
  if (dias.length === 7)
    return t("ronda.horario.todosLosDias", "Todos los días");

  return DIAS.filter((d) => dias.includes(d.n))
    .map((d) => d.corta)
    .join(" ");
}

interface Props {
  tenantId: string;
  tourId: string;
  inicial: HorarioDeRonda;
  onGuardado: (r: any) => void;
}

export default function RondaHorario({
  tenantId,
  tourId,
  inicial,
  onGuardado,
}: Props) {
  const { t } = useTranslation();
  const [modo, setModo] = useState<ModoDeHorario>(modoDe(inicial));
  const [cadaMin, setCadaMin] = useState<string>(
    String(inicial?.everyMinutes ?? 180),
  );
  const [veces, setVeces] = useState<string>(
    String(inicial?.timesPerShift ?? 4),
  );
  const [horas, setHoras] = useState<string[]>(leerHoras(inicial?.fixedTimes));
  const [horaNueva, setHoraNueva] = useState<string>("");
  const [dias, setDias] = useState<number[]>(leerDias(inicial?.scheduledDays));
  const [tolerancia, setTolerancia] = useState<string>(
    inicial?.graceMinutes == null ? "" : String(inicial.graceMinutes),
  );
  const [aviso, setAviso] = useState<string>(
    inicial?.reminderMinutes == null ? "" : String(inicial.reminderMinutes),
  );
  const [guardando, setGuardando] = useState(false);

  const opciones: Array<{ v: ModoDeHorario; label: string; ayuda: string }> =
    useMemo(
      () => [
        {
          v: "once",
          label: t("ronda.horario.modo.once", "Una vez por turno"),
          ayuda: t(
            "ronda.horario.modo.onceAyuda",
            "Disponible todo el turno, sin hora fija. Es como funcionan las rondas hoy.",
          ),
        },
        {
          v: "everyN",
          label: t("ronda.horario.modo.everyN", "Cada cierto tiempo"),
          ayuda: t(
            "ronda.horario.modo.everyNAyuda",
            "La primera al entrar, y a partir de ahí con ese intervalo hasta que acabe el turno.",
          ),
        },
        {
          v: "timesPerShift",
          label: t("ronda.horario.modo.timesPerShift", "Un número de veces"),
          ayuda: t(
            "ronda.horario.modo.timesAyuda",
            "Repartidas por igual a lo largo del turno.",
          ),
        },
        {
          v: "fixedTimes",
          label: t("ronda.horario.modo.fixedTimes", "A horas concretas"),
          ayuda: t(
            "ronda.horario.modo.fixedAyuda",
            "Sólo se generan las horas que caigan dentro del turno del vigilante.",
          ),
        },
      ],
      [t],
    );

  const añadirHora = () => {
    const h = horaNueva.trim();

    if (!/^\d{1,2}:\d{2}$/.test(h)) return;
    const [hh, mm] = h.split(":").map((x) => parseInt(x, 10));

    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      toast.error(t("ronda.horario.horaInvalida", "Esa hora no existe"));

      return;
    }
    const norm = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

    if (horas.includes(norm)) {
      setHoraNueva("");

      return;
    }
    setHoras([...horas, norm].sort());
    setHoraNueva("");
  };

  const guardar = async () => {
    // Se valida ANTES de mandar: el servidor convierte un valor imposible en
    // `null`, así que guardar «cada 2 minutos» respondería 200 y dejaría la
    // ronda sin horario, sin decir nada. El clásico «sí se guardó» que no.
    if (modo === "everyN") {
      const n = parseInt(cadaMin, 10);

      if (!Number.isFinite(n) || n < 5 || n > 1440) {
        toast.error(
          t(
            "ronda.horario.intervaloInvalido",
            "El intervalo va de 5 minutos a 24 horas",
          ),
        );

        return;
      }
    }
    if (modo === "timesPerShift") {
      const n = parseInt(veces, 10);

      if (!Number.isFinite(n) || n < 1 || n > 96) {
        toast.error(
          t("ronda.horario.vecesInvalido", "El número de vueltas va de 1 a 96"),
        );

        return;
      }
    }
    if (modo === "fixedTimes" && !horas.length) {
      toast.error(
        t(
          "ronda.horario.sinHoras",
          "Añade al menos una hora, o cambia el modo",
        ),
      );

      return;
    }

    setGuardando(true);
    try {
      const cuerpo: any = {
        scheduleMode: modo,
        everyMinutes: modo === "everyN" ? parseInt(cadaMin, 10) : null,
        timesPerShift: modo === "timesPerShift" ? parseInt(veces, 10) : null,
        fixedTimes: modo === "fixedTimes" ? horas : null,
        // Vacío = hereda de Configuración › Rondas. No es lo mismo que cero.
        graceMinutes:
          tolerancia.trim() === "" ? null : parseInt(tolerancia, 10),
        reminderMinutes: aviso.trim() === "" ? null : parseInt(aviso, 10),
        scheduledDays: dias,
      };
      const res: any = await ApiService.patch(
        `/tenant/${tenantId}/site-tour/${encodeURIComponent(tourId)}`,
        cuerpo,
      );

      toast.success(t("ronda.horario.guardado", "Horario guardado"));
      onGuardado(res?.data ?? res ?? cuerpo);
    } catch (e: any) {
      toast.error(
        e?.message || t("ronda.horario.errorGuardar", "No se pudo guardar"),
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {opciones.map((o) => (
          <div key={o.v} className="rounded-lg px-2 py-1.5 hover:bg-muted/40">
            {/* El nombre del modo va DIRECTO dentro del `label` y la ayuda
                fuera: anidada en un segundo `span`, el texto accesible queda
                demasiado hondo para asociarse con el control. */}
            <label
              className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-foreground"
              htmlFor={`modo-${tourId}-${o.v}`}
            >
              <input
                checked={modo === o.v}
                id={`modo-${tourId}-${o.v}`}
                name={`modo-${tourId}`}
                type="radio"
                onChange={() => setModo(o.v)}
              />
              {o.label}
            </label>
            <p className="ml-[1.55rem] text-xs text-muted-foreground">
              {o.ayuda}
            </p>
          </div>
        ))}
      </div>

      {modo === "everyN" && (
        <div>
          <label className="cg-eyebrow mb-1 block">
            {t("ronda.horario.intervalo", "Intervalo (minutos)")}
          </label>
          <input
            className={FIELD_CLS_LG}
            inputMode="numeric"
            max={1440}
            min={5}
            type="number"
            value={cadaMin}
            onChange={(e) => setCadaMin(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("ronda.horario.intervaloAyuda", "180 = cada 3 horas.")}
          </p>
        </div>
      )}

      {modo === "timesPerShift" && (
        <div>
          <label className="cg-eyebrow mb-1 block">
            {t("ronda.horario.veces", "Vueltas por turno")}
          </label>
          <input
            className={FIELD_CLS_LG}
            inputMode="numeric"
            max={96}
            min={1}
            type="number"
            value={veces}
            onChange={(e) => setVeces(e.target.value)}
          />
        </div>
      )}

      {modo === "fixedTimes" && (
        <div>
          <label className="cg-eyebrow mb-1 block">
            {t("ronda.horario.horas", "Horas")}
          </label>
          <div className="mb-2 flex flex-wrap gap-2">
            {horas.map((h) => (
              <span
                key={h}
                className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm"
              >
                {h}
                <button
                  className="cg-focus rounded text-muted-foreground"
                  title={t("common.delete", "Eliminar")}
                  type="button"
                  onClick={() => setHoras(horas.filter((x) => x !== h))}
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            {!horas.length && (
              <span className="text-xs text-muted-foreground">
                {t("ronda.horario.sinHorasAun", "Todavía no hay horas")}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              className={FIELD_CLS_LG}
              placeholder="22:00"
              type="time"
              value={horaNueva}
              onChange={(e) => setHoraNueva(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  añadirHora();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={añadirHora}>
              <Plus size={15} />
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "ronda.horario.horasAyuda",
              "En la hora de tu empresa. Las que caigan fuera del turno no se piden.",
            )}
          </p>
        </div>
      )}

      <div>
        <label className="cg-eyebrow mb-1 block">
          {t("ronda.horario.dias", "Días")}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {DIAS.map((d) => {
            const puesto = dias.includes(d.n);

            return (
              <button
                key={d.n}
                // `brand-fill` y no «fondo de marca + letra blanca»: la tinta
                // sobre el relleno es `--brand-ink`, que se recalcula con el
                // acento. Con un acento claro, el blanco fijo es ilegible.
                className={`cg-focus h-9 w-9 rounded-full border text-sm font-medium ${
                  puesto
                    ? "brand-fill"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
                type="button"
                onClick={() =>
                  setDias(
                    puesto ? dias.filter((x) => x !== d.n) : [...dias, d.n],
                  )
                }
              >
                {d.corta}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "ronda.horario.diasAyuda",
            "Sin ninguno marcado, la ronda corre todos los días.",
          )}
        </p>
      </div>

      {modo !== "once" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="cg-eyebrow mb-1 block">
              {t("ronda.horario.tolerancia", "Tolerancia (min)")}
            </label>
            <input
              className={FIELD_CLS_LG}
              inputMode="numeric"
              max={240}
              min={0}
              placeholder={t("ronda.horario.heredado", "Heredado")}
              type="number"
              value={tolerancia}
              onChange={(e) => setTolerancia(e.target.value)}
            />
          </div>
          <div>
            <label className="cg-eyebrow mb-1 block">
              {t("ronda.horario.aviso", "Avisar antes (min)")}
            </label>
            <input
              className={FIELD_CLS_LG}
              inputMode="numeric"
              max={240}
              min={0}
              placeholder={t("ronda.horario.heredado", "Heredado")}
              type="number"
              value={aviso}
              onChange={(e) => setAviso(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            {t(
              "ronda.horario.heredadoAyuda",
              "En blanco toma el valor de Configuración › Rondas.",
            )}
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <Button disabled={guardando} onClick={guardar}>
          {guardando && <Loader2 className="mr-2 animate-spin" size={15} />}
          {t("common.save", "Guardar")}
        </Button>
      </div>
    </div>
  );
}
