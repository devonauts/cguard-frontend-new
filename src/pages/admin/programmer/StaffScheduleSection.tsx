import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Briefcase,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { codePill, CODE_LABEL, columnRules, tonePill } from "./codeTones";
import { COL_W } from "./gridBand";

import { ApiService } from "@/services/api/apiService";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * LA OFICINA EN EL PROGRAMADOR
 *
 * El asistente administrativo, la secretaria, recursos humanos: tenían RELOJ
 * (`staffShifts`) pero no HORARIO, así que no había nada que enseñar aquí. Con
 * `staffWorkPatterns` ya lo hay.
 *
 * Y aquí NO se gira: una asistente trabaja lunes a viernes de 08:00 a 17:00. El
 * código del día sale de mirar si ese día de la semana está en su jornada, no de
 * una fase contra una época.
 *
 * ── LA LECCIÓN DE LA SECCIÓN DE SUPERVISIÓN ────────────────────────────────
 * Aquella se desplegó en SOLO LECTURA y su propio comentario acabó registrando
 * el resultado: «un puesto creado y cuatro supervisores sin asignar. La máquina
 * funcionaba; nadie entraba a usarla». Así que ésta se escribe desde el primer
 * día: el lápiz de cada fila abre su jornada y la guarda sin salir del Horario.
 * Y quien todavía no tiene jornada SALE IGUAL, con la fila vacía — verlo es lo
 * que empuja a ponérsela.
 * ────────────────────────────────────────────────────────────────────────────
 */

type Fila = {
  userId: string;
  fullName: string;
  roles: string[];
  pattern: { weekdays?: number[]; startTime?: string; endTime?: string } | null;
  days: { date: string; code: string }[];
};

const tenantId = () => localStorage.getItem("tenantId") || "";
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** 0 = domingo, igual que `Date#getDay()` y que `supervisorProfile.turnoDays`. */
const DIAS = [
  { n: 1, label: "L" },
  { n: 2, label: "M" },
  { n: 3, label: "X" },
  { n: 4, label: "J" },
  { n: 5, label: "V" },
  { n: 6, label: "S" },
  { n: 0, label: "D" },
];

export default function StaffScheduleSection({
  monthDays,
  colA,
  colB,
  gridCols,
  tintFor,
}: {
  monthDays: Date[];
  colA: number;
  colB: number;
  gridCols: string;
  tintFor?: (day: Date, index: number) => string | undefined;
}) {
  const { t } = useTranslation();
  const visibleDays = monthDays.slice(colA, colB);
  const [abierta, setAbierta] = useState(true);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [editar, setEditar] = useState<{
    userId: string;
    nombre: string;
    weekdays: number[];
    startTime: string;
    endTime: string;
  } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const desde = monthDays.length ? ymd(monthDays[0]) : "";
  const hasta = monthDays.length ? ymd(monthDays[monthDays.length - 1]) : "";

  const cargar = useCallback(async () => {
    if (!desde || !hasta) return;
    setCargando(true);
    try {
      const r: any = await ApiService.get(
        `/tenant/${tenantId()}/staff-schedule/grid?from=${desde}&to=${hasta}`,
      );

      setFilas((r?.data ?? r)?.rows || []);
    } catch {
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** `YYYY-MM-DD` → código, por persona. Un índice, no un barrido por celda. */
  const porPersona = useMemo(() => {
    const m = new Map<string, Map<string, string>>();

    for (const f of filas || []) {
      const dd = new Map<string, string>();

      for (const d of f.days || []) if (d.code) dd.set(d.date, d.code);
      m.set(f.userId, dd);
    }

    return m;
  }, [filas]);

  const guardar = async () => {
    if (!editar) return;
    setGuardando(true);
    try {
      await ApiService.put(
        `/tenant/${tenantId()}/staff-schedule/${editar.userId}/pattern`,
        {
          data: {
            weekdays: editar.weekdays,
            startTime: editar.startTime,
            endTime: editar.endTime,
          },
        },
      );
      toast.success(t("ui.StaffSchedule.guardada"));
      setEditar(null);
      cargar();
    } catch (e: any) {
      toast.error(
        e?.data?.message || e?.message || t("ui.StaffSchedule.errorGuardar"),
      );
    } finally {
      setGuardando(false);
    }
  };

  const resumen = (f: Fila): string => {
    const wd = f.pattern?.weekdays;

    if (!Array.isArray(wd) || !wd.length)
      return t("ui.StaffSchedule.sinJornada");
    const etiquetas = DIAS.filter((d) => wd.includes(d.n))
      .map((d) => d.label)
      .join("");

    return `${etiquetas} · ${(f.pattern?.startTime || "").slice(0, 5)}–${(f.pattern?.endTime || "").slice(0, 5)}`;
  };

  if (!cargando && (!filas || !filas.length)) return null;

  return (
    <div style={{ borderBottom: "1px solid var(--hairline)" }}>
      {/* Cabecera de la sección */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: gridCols,
          background: "var(--glass-sunken)",
        }}
      >
        <div
          className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
          style={{
            background: "var(--glass-solid)",
            borderRight: "1px solid var(--hairline)",
          }}
        >
          <button
            className="cg-btn-ghost cg-focus rounded p-0.5"
            onClick={() => setAbierta((v) => !v)}
          >
            {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <div
            className="flex h-6 w-6 items-center justify-center rounded"
            style={tonePill("neutral", 14)}
          >
            <Briefcase size={12} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {t("ui.StaffSchedule.oficina")}
            </div>
            <div className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
              {cargando
                ? t("ui.StaffSchedule.cargando")
                : t("ui.StaffSchedule.personas", { n: filas?.length || 0 })}
            </div>
          </div>
        </div>
        <div style={{ gridColumn: "2 / -1", ...columnRules(COL_W) }} />
      </div>

      {abierta &&
        (filas || []).map((f) => (
          <div
            key={f.userId}
            className="grid"
            style={{
              gridTemplateColumns: gridCols,
              borderTop: "1px solid var(--hairline)",
            }}
          >
            <div
              className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
              style={{
                background: "var(--glass-solid)",
                borderRight: "1px solid var(--hairline)",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">
                  {f.fullName}
                </div>
                <div
                  className="truncate text-[10px]"
                  style={{
                    color: f.pattern ? "var(--ink-soft)" : "var(--warn-text)",
                  }}
                >
                  {resumen(f)}
                </div>
              </div>
              <button
                className="cg-btn-ghost cg-focus shrink-0 rounded p-1"
                title={t("ui.StaffSchedule.definirJornada")}
                onClick={() =>
                  setEditar({
                    userId: f.userId,
                    nombre: f.fullName,
                    weekdays: f.pattern?.weekdays || [1, 2, 3, 4, 5],
                    startTime: (f.pattern?.startTime || "08:00").slice(0, 5),
                    endTime: (f.pattern?.endTime || "17:00").slice(0, 5),
                  })
                }
              >
                <Pencil size={13} />
              </button>
            </div>

            <div />
            {visibleDays.map((day, k) => {
              const i = colA + k;
              const ds = ymd(day);
              const code = porPersona.get(f.userId)?.get(ds) || "";

              return (
                <div
                  key={i}
                  className="flex min-h-[34px] items-center justify-center px-0.5 py-0.5"
                  style={{
                    borderRight: "1px solid var(--hairline)",
                    background: tintFor?.(day, i),
                  }}
                >
                  {code ? (
                    <div
                      className="flex flex-1 items-center justify-center rounded"
                      style={codePill(code)}
                      title={CODE_LABEL[code] ?? code}
                    >
                      <span className="text-[10px] font-bold">{code}</span>
                    </div>
                  ) : (
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      ·
                    </span>
                  )}
                </div>
              );
            })}
            <div />
          </div>
        ))}

      {/* Editor de jornada */}
      {editar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "oklch(0 0 0 / 0.55)" }}
          onClick={() => setEditar(null)}
        >
          <div
            className="glass-raised mx-4 w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--hairline)" }}
            >
              <div>
                <h4 className="text-sm font-semibold">
                  {t("ui.StaffSchedule.tituloModal")}
                </h4>
                <p
                  className="mt-0.5 text-[11px]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {editar.nombre}
                </p>
              </div>
              <button
                className="cg-btn-ghost cg-focus rounded-lg p-1.5"
                onClick={() => setEditar(null)}
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label
                  className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {t("ui.StaffSchedule.diasQueTrabaja")}
                </label>
                <div className="flex gap-1">
                  {DIAS.map((d) => {
                    const activo = editar.weekdays.includes(d.n);

                    return (
                      <button
                        key={d.n}
                        className={`cg-focus h-8 w-8 rounded-full text-xs font-bold transition-all ${activo ? "glass-brand" : "glass-flat"}`}
                        onClick={() =>
                          setEditar((m) =>
                            m
                              ? {
                                  ...m,
                                  weekdays: activo
                                    ? m.weekdays.filter((x) => x !== d.n)
                                    : [...m.weekdays, d.n],
                                }
                              : m,
                          )
                        }
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t("ui.StaffSchedule.entra")}
                  </label>
                  <input
                    className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary"
                    style={{
                      borderColor: "var(--hairline)",
                      background: "var(--glass-sunken)",
                    }}
                    type="time"
                    value={editar.startTime}
                    onChange={(e) =>
                      setEditar((m) =>
                        m ? { ...m, startTime: e.target.value } : m,
                      )
                    }
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {t("ui.StaffSchedule.sale")}
                  </label>
                  <input
                    className="w-full rounded-lg border px-2 py-2 text-sm tabular-nums outline-none focus:border-primary"
                    style={{
                      borderColor: "var(--hairline)",
                      background: "var(--glass-sunken)",
                    }}
                    type="time"
                    value={editar.endTime}
                    onChange={(e) =>
                      setEditar((m) =>
                        m ? { ...m, endTime: e.target.value } : m,
                      )
                    }
                  />
                </div>
              </div>
              <p className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
                {t("ui.StaffSchedule.notaNovedades")}
              </p>
            </div>
            <div
              className="flex items-center justify-end gap-2 px-5 py-3"
              style={{
                borderTop: "1px solid var(--hairline)",
                background: "var(--glass-sunken)",
              }}
            >
              <button
                className="cg-btn-ghost cg-focus rounded-full px-4 py-2 text-sm font-semibold"
                onClick={() => setEditar(null)}
              >
                {t("ui.StaffSchedule.cancelar")}
              </button>
              <button
                className="cg-btn-brand cg-focus rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-40"
                disabled={guardando}
                onClick={guardar}
              >
                {guardando ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  t("ui.StaffSchedule.guardar")
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
