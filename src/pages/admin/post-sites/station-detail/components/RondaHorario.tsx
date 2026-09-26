import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { ApiService } from "@/services/api/apiService";
import { Button } from "@/components/ui/button";
import { FIELD_CLS_LG } from "@/pages/admin/clientes/components/_shared/tab-kit";
import { apartarDelWidget } from "@/lib/apartarDelWidget";

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
const DIAS: Array<{ n: number; corta: string; k: string }> = [
  { n: 1, corta: "L", k: "ui.RondaHorario.diaCortoLun" },
  { n: 2, corta: "M", k: "ui.RondaHorario.diaCortoMar" },
  { n: 3, corta: "X", k: "ui.RondaHorario.diaCortoMie" },
  { n: 4, corta: "J", k: "ui.RondaHorario.diaCortoJue" },
  { n: 5, corta: "V", k: "ui.RondaHorario.diaCortoVie" },
  { n: 6, corta: "S", k: "ui.RondaHorario.diaCortoSab" },
  { n: 0, corta: "D", k: "ui.RondaHorario.diaCortoDom" },
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
        : t("ui.RondaHorario.cadaNHoras", { defaultValue: "Cada {{h}} h", h });
    }

    return t("ui.RondaHorario.cadaNMin", { defaultValue: "Cada {{m}} min", m });
  }
  if (modo === "timesPerShift") {
    const n = Number(r?.timesPerShift) || 0;

    if (!n) return t("ronda.horario.sinDefinir", "Sin horario");

    return t("ui.RondaHorario.nVecesPorTurno", {
      defaultValue: "{{count}} veces por turno",
      count: n,
    });
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
    .map((d) => t(d.k, d.corta))
    .join(" ");
}

/**
 * El horario mientras se edita: todo cadena, como lo escribe el formulario.
 * Se normaliza en `aCuerpo()` — una sola vez, y en un solo sitio.
 */
export interface ValorDeHorario {
  modo: ModoDeHorario;
  cadaMin: string;
  veces: string;
  horas: string[];
  dias: number[];
  tolerancia: string;
  aviso: string;
}

/** El valor de partida a partir de lo que tenga la ronda (o de una nueva). */
export function valorInicial(r?: HorarioDeRonda | null): ValorDeHorario {
  return {
    modo: modoDe(r),
    cadaMin: String(r?.everyMinutes ?? 180),
    veces: String(r?.timesPerShift ?? 4),
    horas: leerHoras(r?.fixedTimes),
    dias: leerDias(r?.scheduledDays),
    tolerancia: r?.graceMinutes == null ? "" : String(r.graceMinutes),
    aviso: r?.reminderMinutes == null ? "" : String(r.reminderMinutes),
  };
}

/**
 * Lo que se manda al servidor. Vive aquí y no en cada pantalla porque el alta
 * y la edición tienen que escribir EXACTAMENTE lo mismo: dos copias de esta
 * conversión acabarían discrepando, y la floja es la que se cuela.
 */
export function aCuerpo(v: ValorDeHorario): Record<string, any> {
  return {
    scheduleMode: v.modo,
    everyMinutes: v.modo === "everyN" ? parseInt(v.cadaMin, 10) : null,
    timesPerShift: v.modo === "timesPerShift" ? parseInt(v.veces, 10) : null,
    fixedTimes: v.modo === "fixedTimes" ? v.horas : null,
    // Vacío = hereda de Configuración › Rondas. No es lo mismo que cero.
    graceMinutes:
      v.tolerancia.trim() === "" ? null : parseInt(v.tolerancia, 10),
    reminderMinutes: v.aviso.trim() === "" ? null : parseInt(v.aviso, 10),
    scheduledDays: v.dias,
  };
}

/**
 * Devuelve el mensaje de error, o null si vale.
 *
 * Se valida ANTES de mandar porque el servidor convierte un valor imposible en
 * `null`: guardar «cada 2 minutos» respondería 200 y dejaría la ronda sin
 * horario, sin decir nada. El clásico «sí se guardó» que no.
 */
export function validaHorario(
  v: ValorDeHorario,
  t: (k: string, d?: any) => string,
): string | null {
  if (v.modo === "everyN") {
    const n = parseInt(v.cadaMin, 10);

    if (!Number.isFinite(n) || n < 5 || n > 1440) {
      return t(
        "ronda.horario.intervaloInvalido",
        "El intervalo va de 5 minutos a 24 horas",
      );
    }
  }
  if (v.modo === "timesPerShift") {
    const n = parseInt(v.veces, 10);

    if (!Number.isFinite(n) || n < 1 || n > 96) {
      return t(
        "ronda.horario.vecesInvalido",
        "El número de vueltas va de 1 a 96",
      );
    }
  }
  if (v.modo === "fixedTimes" && !v.horas.length) {
    return t(
      "ronda.horario.sinHoras",
      "Añade al menos una hora, o cambia el modo",
    );
  }

  // Tolerancia y aviso valen para CUALQUIER modo, y en blanco significa «hereda
  // de Configuración › Rondas», que no es lo mismo que cero. Sin esta
  // comprobación el servidor convertía un valor fuera de rango en `null` y
  // respondía 200: la pantalla decía «guardado» y el número escrito
  // desaparecía sin una palabra.
  const rango = (crudo: string, min: number, max: number) => {
    if (crudo.trim() === "") return true;
    const n = parseInt(crudo, 10);

    return Number.isFinite(n) && n >= min && n <= max;
  };

  if (!rango(v.tolerancia, 0, 240)) {
    return t(
      "ronda.horario.toleranciaInvalida",
      "La tolerancia va de 0 a 240 minutos. Déjala vacía para usar la de Configuración › Rondas.",
    );
  }
  if (!rango(v.aviso, 0, 240)) {
    return t(
      "ronda.horario.avisoInvalido",
      "El aviso previo va de 0 a 240 minutos. Déjalo vacío para no avisar antes.",
    );
  }

  return null;
}

/**
 * LOS CAMPOS, controlados y sin botón de guardar.
 *
 * Los usa el asistente de alta (donde el horario viaja con el resto del
 * formulario) y el editor de la tarjeta (que le pone su propio botón). Así la
 * recurrencia se define en un solo sitio.
 */
export function CamposDeHorario({
  valor,
  onChange,
  idPrefijo,
}: {
  valor: ValorDeHorario;
  onChange: (v: ValorDeHorario) => void;
  idPrefijo: string;
}) {
  const { t } = useTranslation();
  const [horaNueva, setHoraNueva] = useState<string>("");
  const { modo, cadaMin, veces, horas, dias, tolerancia, aviso } = valor;
  const set = (parcial: Partial<ValorDeHorario>) =>
    onChange({ ...valor, ...parcial });
  const setModo = (m: ModoDeHorario) => set({ modo: m });
  const setCadaMin = (x: string) => set({ cadaMin: x });
  const setVeces = (x: string) => set({ veces: x });
  const setHoras = (x: string[]) => set({ horas: x });
  const setDias = (x: number[]) => set({ dias: x });
  const setTolerancia = (x: string) => set({ tolerancia: x });
  const setAviso = (x: string) => set({ aviso: x });
  const tourId = idPrefijo;

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
                {t(d.k, d.corta)}
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
    </div>
  );
}

/**
 * EL EDITOR DE LA TARJETA: los campos de arriba + su botón, y guarda solo.
 *
 * El asistente de alta usa `CamposDeHorario` directamente porque allí el
 * horario viaja con el resto del formulario y se manda en la creación.
 */
export default function RondaHorario({
  tenantId,
  tourId,
  inicial,
  onGuardado,
}: {
  tenantId: string;
  tourId: string;
  inicial: HorarioDeRonda;
  onGuardado: (r: any) => void;
}) {
  const { t } = useTranslation();
  const [valor, setValor] = useState<ValorDeHorario>(() =>
    valorInicial(inicial),
  );
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    const error = validaHorario(valor, t);

    if (error) {
      toast.error(error);

      return;
    }
    setGuardando(true);
    try {
      const cuerpo = aCuerpo(valor);
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
      <CamposDeHorario idPrefijo={tourId} valor={valor} onChange={setValor} />
      {/* El `ref` aparta este bloque de la burbuja de VigIA, que está fija en la
        esquina inferior derecha y tapaba este mismo «Guardar». */}
      <div ref={apartarDelWidget} className="flex justify-end">
        <Button disabled={guardando} onClick={guardar}>
          {guardando && <Loader2 className="mr-2 animate-spin" size={15} />}
          {t("common.save", "Guardar")}
        </Button>
      </div>
    </div>
  );
}
