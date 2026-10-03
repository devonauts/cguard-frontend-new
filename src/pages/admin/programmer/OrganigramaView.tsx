import type {
  GuardAssignment,
  ShiftRecord,
  Station,
  StationPosition,
} from "@/types";

import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Clock,
  Search,
  Settings2,
  Shield,
  UserPlus,
  Users,
} from "lucide-react";

import { localeActual } from "@/lib/localeActual";
import { nombreDeVigilante } from "@/lib/guardName";
import { stationLabel } from "@/lib/stationName";
import { cuentaComoCobertura } from "@/lib/shiftStatus";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";

/**
 * ────────────────────────────────────────────────────────────────────────────
 * ORGANIGRAMA — el horario leído como se piensa la operación
 *
 * Pedido del dueño (2026-10-02): «todas las opciones actuales parecen ser
 * difíciles y confusas para el cliente». Las rejillas obligan a entender filas
 * de plazas, ciclos y columnas de días antes de poder hacer nada.
 *
 * Aquí se baja por la misma escalera que tiene la empresa en la cabeza:
 *
 *   Sede  →  Estación  →  Vigilantes asignados  →  Sus turnos
 *
 * Cada nivel es un acordeón: un clic abre el siguiente. No se inventa ningún
 * editor nuevo — configurar el puesto (asignar, cambiar el ciclo, quitar a
 * alguien) abre el MISMO asistente de la estación que usa la hoja, y tocar un
 * turno abre el MISMO menú de acciones que la agenda. Así no hay una segunda
 * forma de guardar un horario que pueda contradecir a la primera.
 * ────────────────────────────────────────────────────────────────────────────
 */

export type SedeInfo = { nombre: string; cliente?: string };

export type OrganigramaViewProps = {
  stations: Station[];
  positionsByStation: Map<string, StationPosition[]>;
  assignments: GuardAssignment[];
  shifts: ShiftRecord[];
  sedes: Map<string, SedeInfo>;
  guardColorMap: Record<string, string>;
  todayStr: string;
  dateStrOf: (iso: string) => string;
  timeOf: (iso: string) => string;
  /** Abre el asistente de la estación: asignar, cambiar ciclo, quitar. */
  onConfigurarPuesto: (st: Station) => void;
  onPickShift: (
    s: ShiftRecord,
    punto?: { clientX: number; clientY: number },
  ) => void;
};

const SIN_SEDE = "__sin_sede__";
/** Cuántos turnos se enseñan de entrada por vigilante; el resto, a petición. */
const TURNOS_VISIBLES = 10;

/** «07:00:00» → «07:00». */
const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : "");

const normal = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function Fila({
  abierto,
  nivel,
  onClick,
  children,
  acciones,
}: {
  abierto: boolean;
  nivel: 0 | 1 | 2;
  onClick: () => void;
  children: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2 pr-3 transition-colors hover:bg-[var(--glass-sunken)]"
      style={{
        paddingLeft: 12 + nivel * 22,
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <button
        aria-expanded={abierto}
        className="cg-focus flex min-w-0 flex-1 items-center gap-2.5 py-2.5 text-left"
        type="button"
        onClick={onClick}
      >
        <span className="shrink-0" style={{ color: "var(--ink-faint)" }}>
          {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
        {children}
      </button>
      {acciones}
    </div>
  );
}

function Pastilla({
  tono,
  children,
}: {
  tono: "ok" | "warn" | "neutral";
  children: React.ReactNode;
}) {
  const color =
    tono === "ok"
      ? "var(--ok, #16a34a)"
      : tono === "warn"
        ? "var(--warn, #d97706)"
        : "var(--ink-soft)";

  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
      style={{
        color,
        background: `color-mix(in oklab, ${color} 12%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

function OrganigramaViewInner({
  stations,
  positionsByStation,
  assignments,
  shifts,
  sedes,
  guardColorMap,
  todayStr,
  dateStrOf,
  timeOf,
  onConfigurarPuesto,
  onPickShift,
}: OrganigramaViewProps) {
  const { t } = useTranslation();
  const locale = localeActual();
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const [busqueda, setBusqueda] = useState("");
  const [todosLosTurnos, setTodosLosTurnos] = useState<Set<string>>(
    () => new Set(),
  );

  const alternar = (k: string) =>
    setAbiertos((prev) => {
      const n = new Set(prev);

      if (n.has(k)) n.delete(k);
      else n.add(k);

      return n;
    });

  /* Turnos desde HOY, agrupados por estación + vigilante. Lo pasado ya no se
     configura: lo que se viene a hacer aquí es ver y cambiar lo que viene. */
  const turnosPor = useMemo(() => {
    const m = new Map<string, ShiftRecord[]>();

    for (const s of shifts) {
      if (!s.startTime || !s.guardId) continue;
      if (dateStrOf(s.startTime) < todayStr) continue;
      const k = `${s.stationId}|${s.guardId}`;
      const l = m.get(k);

      if (l) l.push(s);
      else m.set(k, [s]);
    }
    for (const l of m.values())
      l.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

    return m;
  }, [shifts, dateStrOf, todayStr]);

  const activas = useMemo(
    () => assignments.filter((a) => a.status === "active"),
    [assignments],
  );

  /* El árbol entero, ya filtrado por la búsqueda. */
  const arbol = useMemo(() => {
    const q = normal(busqueda.trim());
    const porSede = new Map<string, Station[]>();

    for (const st of stations) {
      const k = st.postSiteId ? String(st.postSiteId) : SIN_SEDE;
      const l = porSede.get(k);

      if (l) l.push(st);
      else porSede.set(k, [st]);
    }

    const sedesOut = [...porSede.entries()].map(([sedeId, ests]) => {
      const info = sedes.get(sedeId);
      const nombreSede =
        sedeId === SIN_SEDE
          ? t("ui.Organigrama.sinSede")
          : info?.nombre || t("ui.Organigrama.sedeSinNombre");
      const sedeCoincide =
        !q || normal(`${nombreSede} ${info?.cliente || ""}`).includes(q);

      const estaciones = ests
        .map((st) => {
          const plazas = positionsByStation.get(String(st.id)) || [];
          const gente = activas.filter(
            (a) => String(a.stationId) === String(st.id),
          );
          // El titular primero, los aprendices detrás de quien acompañan.
          gente.sort(
            (a, b) =>
              Number(a.role === "shadow") - Number(b.role === "shadow") ||
              nombreDeVigilante(a.guard, "").localeCompare(
                nombreDeVigilante(b.guard, ""),
              ),
          );
          const vacias = plazas.filter(
            (p) =>
              !gente.some(
                (a) =>
                  String(a.positionId) === String(p.id) && a.role !== "shadow",
              ),
          );
          const estCoincide =
            sedeCoincide || normal(stationLabel(st)).includes(q);
          const genteVisible =
            !q || estCoincide
              ? gente
              : gente.filter((a) =>
                  normal(nombreDeVigilante(a.guard, "")).includes(q),
                );

          return { st, plazas, gente, genteVisible, vacias, estCoincide };
        })
        .filter((e) => !q || e.estCoincide || e.genteVisible.length > 0);

      return { sedeId, nombreSede, info, estaciones };
    });

    return sedesOut
      .filter((s) => s.estaciones.length > 0)
      .sort((a, b) =>
        a.sedeId === SIN_SEDE
          ? 1
          : b.sedeId === SIN_SEDE
            ? -1
            : a.nombreSede.localeCompare(b.nombreSede),
      );
  }, [stations, sedes, positionsByStation, activas, busqueda, t]);

  /* Con una búsqueda escrita, todo lo que coincide se abre solo: buscar a un
     vigilante y tener que abrir tres acordeones para verlo no es buscar. */
  const buscando = busqueda.trim().length > 0;
  const estaAbierto = (k: string) => buscando || abiertos.has(k);

  const expandirTodo = () => {
    const n = new Set<string>();

    for (const s of arbol) {
      n.add(`S:${s.sedeId}`);
      for (const e of s.estaciones) n.add(`E:${e.st.id}`);
    }
    setAbiertos(n);
  };

  const totalEstaciones = arbol.reduce((n, s) => n + s.estaciones.length, 0);
  const totalVacias = arbol.reduce(
    (n, s) => n + s.estaciones.reduce((m, e) => m + e.vacias.length, 0),
    0,
  );

  const fechaCorta = (iso: string) =>
    new Date(iso)
      .toLocaleDateString(locale, {
        timeZone: zonaDeLaEmpresa(),
        weekday: "short",
        day: "numeric",
        month: "short",
      })
      .replace(/^./, (c) => c.toUpperCase());

  const cicloDe = (a: GuardAssignment) => {
    const r = a.rotationStyle as any;

    if (!r) return "";
    if (r.name) return String(r.name);
    const partes = [r.dayShifts, r.nightShifts, r.restDays].filter(
      (x) => x != null,
    );

    return partes.length ? partes.join("-") : "";
  };

  const botonPuesto = (st: Station, conGente: boolean) => (
    <button
      className="cg-focus flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--glass-solid)]"
      style={{ color: "var(--brand-text)" }}
      title={t("ui.Organigrama.configurarAyuda")}
      type="button"
      onClick={() => onConfigurarPuesto(st)}
    >
      {conGente ? <Settings2 size={14} /> : <UserPlus size={14} />}
      <span className="hidden sm:inline">
        {conGente
          ? t("ui.Organigrama.configurar")
          : t("ui.Organigrama.asignar")}
      </span>
    </button>
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl"
      style={{ border: "1px solid var(--hairline)" }}
    >
      {/* ── Barra: buscar · abrir / cerrar todo · resumen ─────────────────── */}
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2.5"
        style={{
          background: "var(--glass-sunken)",
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <label
          className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5"
          style={{
            background: "var(--glass-solid)",
            border: "1px solid var(--hairline)",
          }}
        >
          <Search size={14} style={{ color: "var(--ink-faint)" }} />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder={t("ui.Organigrama.buscar")}
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </label>
        <button
          className="cg-focus rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--glass-solid)]"
          type="button"
          onClick={expandirTodo}
        >
          {t("ui.Organigrama.abrirTodo")}
        </button>
        <button
          className="cg-focus rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--glass-solid)]"
          type="button"
          onClick={() => setAbiertos(new Set())}
        >
          {t("ui.Organigrama.cerrarTodo")}
        </button>
        <span
          className="ml-auto text-[11px] tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          {t("ui.Organigrama.resumen", {
            sedes: arbol.length,
            estaciones: totalEstaciones,
          })}
          {totalVacias > 0 && (
            <>
              {" · "}
              <b style={{ color: "var(--warn, #d97706)" }}>
                {t("ui.Organigrama.plazasSinCubrir", { count: totalVacias })}
              </b>
            </>
          )}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {arbol.length === 0 && (
          <p
            className="p-8 text-center text-sm"
            style={{ color: "var(--ink-soft)" }}
          >
            {buscando
              ? t("ui.Organigrama.sinResultados")
              : t("ui.Organigrama.vacio")}
          </p>
        )}

        {arbol.map(({ sedeId, nombreSede, info, estaciones }) => {
          const kS = `S:${sedeId}`;
          const abiertaS = estaAbierto(kS);
          const genteSede = estaciones.reduce((n, e) => n + e.gente.length, 0);
          const vaciasSede = estaciones.reduce(
            (n, e) => n + e.vacias.length,
            0,
          );

          return (
            <div key={kS}>
              {/* ── Nivel 1: SEDE ───────────────────────────────────────── */}
              <Fila abierto={abiertaS} nivel={0} onClick={() => alternar(kS)}>
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background:
                      "color-mix(in oklab, var(--brand) 14%, transparent)",
                    color: "var(--brand-text)",
                  }}
                >
                  <Building2 size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {nombreSede}
                  </span>
                  {info?.cliente && (
                    <span
                      className="block truncate text-[11px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {info.cliente}
                    </span>
                  )}
                </span>
                <Pastilla tono="neutral">
                  {t("ui.Organigrama.nEstaciones", {
                    count: estaciones.length,
                  })}
                </Pastilla>
                <Pastilla tono="neutral">
                  <Users className="-mt-px mr-1 inline" size={11} />
                  {genteSede}
                </Pastilla>
                {vaciasSede > 0 && (
                  <Pastilla tono="warn">
                    {t("ui.Organigrama.plazasSinCubrir", {
                      count: vaciasSede,
                    })}
                  </Pastilla>
                )}
              </Fila>

              {abiertaS &&
                estaciones.map(
                  ({ st, plazas, gente, genteVisible, vacias }) => {
                    const kE = `E:${st.id}`;
                    const abiertaE = estaAbierto(kE);
                    /* El horario del puesto, sacado de sus plazas: lo único que
                     el generador lee (ver la memoria «una sola verdad»). Las
                     dos plazas de un 24 h comparten ventana, así que se
                     agrupan por franja y se cuenta cuántas hay. */
                    const franjas = new Map<string, number>();

                    for (const p of plazas) {
                      if (p.type === "sacafranco") continue;
                      const f = `${hhmm(p.startTime)}–${hhmm(p.endTime)}`;

                      franjas.set(f, (franjas.get(f) || 0) + 1);
                    }

                    return (
                      <div key={kE}>
                        {/* ── Nivel 2: ESTACIÓN ─────────────────────────── */}
                        <Fila
                          abierto={abiertaE}
                          acciones={botonPuesto(st, gente.length > 0)}
                          nivel={1}
                          onClick={() => alternar(kE)}
                        >
                          <span
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                            style={{
                              background: vacias.length
                                ? "color-mix(in oklab, var(--warn, #d97706) 14%, transparent)"
                                : "color-mix(in oklab, var(--ok, #16a34a) 14%, transparent)",
                              color: vacias.length
                                ? "var(--warn, #d97706)"
                                : "var(--ok, #16a34a)",
                            }}
                          >
                            <Shield size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">
                              {stationLabel(st)}
                            </span>
                            <span
                              className="block truncate text-[11px]"
                              style={{ color: "var(--ink-faint)" }}
                            >
                              {franjas.size
                                ? [...franjas.entries()]
                                    .map(([f, n]) => (n > 1 ? `${f} ×${n}` : f))
                                    .join(" · ")
                                : t("ui.Organigrama.sinHorario")}
                            </span>
                          </span>
                          <Pastilla tono="neutral">
                            <Users className="-mt-px mr-1 inline" size={11} />
                            {gente.length}
                          </Pastilla>
                          {vacias.length > 0 ? (
                            <Pastilla tono="warn">
                              {t("ui.Organigrama.plazasSinCubrir", {
                                count: vacias.length,
                              })}
                            </Pastilla>
                          ) : plazas.length > 0 ? (
                            <Pastilla tono="ok">
                              {t("ui.Organigrama.completo")}
                            </Pastilla>
                          ) : null}
                        </Fila>

                        {abiertaE && (
                          <>
                            {genteVisible.map((a) => {
                              const kV = `V:${a.id}`;
                              const abiertoV = abiertos.has(kV);
                              const turnos =
                                turnosPor.get(`${st.id}|${a.guardId}`) || [];
                              const plaza = plazas.find(
                                (p) => String(p.id) === String(a.positionId),
                              );
                              const ciclo = cicloDe(a);
                              const color =
                                guardColorMap[a.guardId] || "var(--ink-faint)";
                              const verTodos = todosLosTurnos.has(kV);
                              const visibles = verTodos
                                ? turnos
                                : turnos.slice(0, TURNOS_VISIBLES);

                              return (
                                <div key={kV}>
                                  {/* ── Nivel 3: VIGILANTE ───────────────── */}
                                  <Fila
                                    abierto={abiertoV}
                                    nivel={2}
                                    onClick={() => alternar(kV)}
                                  >
                                    <span
                                      className="h-7 w-1 shrink-0 rounded-full"
                                      style={{ background: color }}
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium">
                                        {nombreDeVigilante(
                                          a.guard,
                                          t("ui.Organigrama.vigilante"),
                                        )}
                                        {a.role === "shadow" && (
                                          <span
                                            className="ml-1.5 text-[10px] font-semibold"
                                            style={{
                                              color: "var(--ink-faint)",
                                            }}
                                          >
                                            · {t("ui.Organigrama.aprendiz")}
                                          </span>
                                        )}
                                        {(a.isRelief || !a.positionId) && (
                                          <span
                                            className="ml-1.5 text-[10px] font-semibold"
                                            style={{
                                              color: "var(--ink-faint)",
                                            }}
                                          >
                                            · {t("ui.Organigrama.relevo")}
                                          </span>
                                        )}
                                      </span>
                                      <span
                                        className="block truncate text-[11px]"
                                        style={{ color: "var(--ink-faint)" }}
                                      >
                                        {[
                                          plaza
                                            ? `${plaza.name} ${hhmm(plaza.startTime)}–${hhmm(plaza.endTime)}`
                                            : null,
                                          ciclo
                                            ? t("ui.Organigrama.ciclo", {
                                                ciclo,
                                              })
                                            : null,
                                        ]
                                          .filter(Boolean)
                                          .join(" · ")}
                                      </span>
                                    </span>
                                    <Pastilla tono="neutral">
                                      <Clock
                                        className="-mt-px mr-1 inline"
                                        size={11}
                                      />
                                      {turnos.length}
                                    </Pastilla>
                                  </Fila>

                                  {/* ── Nivel 4: SUS TURNOS ──────────────── */}
                                  {abiertoV && (
                                    <div
                                      style={{
                                        background: "var(--glass-sunken)",
                                        borderBottom:
                                          "1px solid var(--hairline)",
                                      }}
                                    >
                                      {turnos.length === 0 ? (
                                        <p
                                          className="py-3 text-xs"
                                          style={{
                                            paddingLeft: 12 + 3 * 22,
                                            color: "var(--ink-soft)",
                                          }}
                                        >
                                          {t("ui.Organigrama.sinTurnos")}
                                        </p>
                                      ) : (
                                        visibles.map((s) => {
                                          const anulado =
                                            !cuentaComoCobertura(s);
                                          const hoy =
                                            dateStrOf(s.startTime) === todayStr;

                                          return (
                                            <button
                                              key={s.id}
                                              className="cg-focus flex w-full items-center gap-3 py-2 pr-3 text-left text-xs transition-colors hover:bg-[var(--glass-solid)]"
                                              style={{
                                                paddingLeft: 12 + 3 * 22,
                                                ...(anulado
                                                  ? {
                                                      opacity: 0.5,
                                                      textDecoration:
                                                        "line-through",
                                                    }
                                                  : null),
                                              }}
                                              title={t(
                                                "ui.Organigrama.turnoAyuda",
                                              )}
                                              type="button"
                                              onClick={(e) =>
                                                onPickShift(s, {
                                                  clientX: e.clientX,
                                                  clientY: e.clientY,
                                                })
                                              }
                                            >
                                              <span
                                                className="w-28 shrink-0 font-semibold"
                                                style={{
                                                  color: hoy
                                                    ? "var(--brand-text)"
                                                    : undefined,
                                                }}
                                              >
                                                {hoy
                                                  ? t("ui.Organigrama.hoy")
                                                  : fechaCorta(s.startTime)}
                                              </span>
                                              <span
                                                className="font-bold tabular-nums"
                                                style={{
                                                  color: "var(--ink-soft)",
                                                }}
                                              >
                                                {timeOf(s.startTime)}–
                                                {timeOf(s.endTime)}
                                              </span>
                                            </button>
                                          );
                                        })
                                      )}
                                      {turnos.length > TURNOS_VISIBLES && (
                                        <button
                                          className="cg-focus py-2 text-xs font-semibold"
                                          style={{
                                            paddingLeft: 12 + 3 * 22,
                                            color: "var(--brand-text)",
                                          }}
                                          type="button"
                                          onClick={() =>
                                            setTodosLosTurnos((prev) => {
                                              const n = new Set(prev);

                                              if (n.has(kV)) n.delete(kV);
                                              else n.add(kV);

                                              return n;
                                            })
                                          }
                                        >
                                          {verTodos
                                            ? t("ui.Organigrama.verMenos")
                                            : t("ui.Organigrama.verTodos", {
                                                count: turnos.length,
                                              })}
                                        </button>
                                      )}
                                      <div
                                        className="py-2"
                                        style={{ paddingLeft: 12 + 3 * 22 }}
                                      >
                                        <button
                                          className="cg-focus inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--glass-solid)]"
                                          style={{ color: "var(--brand-text)" }}
                                          type="button"
                                          onClick={() => onConfigurarPuesto(st)}
                                        >
                                          <Settings2 size={13} />
                                          {t("ui.Organigrama.cambiarHorario")}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {/* Las plazas vacías, a la vista y con su botón: es
                              lo primero que hay que resolver en un puesto. */}
                            {!buscando &&
                              vacias.map((p) => (
                                <div
                                  key={`P:${p.id}`}
                                  className="flex items-center gap-2.5 py-2 pr-3"
                                  style={{
                                    paddingLeft: 12 + 2 * 22 + 24,
                                    borderBottom: "1px solid var(--hairline)",
                                  }}
                                >
                                  <span
                                    className="h-7 w-1 shrink-0 rounded-full"
                                    style={{
                                      background: "var(--warn, #d97706)",
                                      opacity: 0.5,
                                    }}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span
                                      className="block truncate text-sm italic"
                                      style={{ color: "var(--ink-soft)" }}
                                    >
                                      {t("ui.Organigrama.plazaVacia")}
                                    </span>
                                    <span
                                      className="block truncate text-[11px]"
                                      style={{ color: "var(--ink-faint)" }}
                                    >
                                      {p.name} {hhmm(p.startTime)}–
                                      {hhmm(p.endTime)}
                                    </span>
                                  </span>
                                  <button
                                    className="cg-focus flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--glass-solid)]"
                                    style={{ color: "var(--brand-text)" }}
                                    type="button"
                                    onClick={() => onConfigurarPuesto(st)}
                                  >
                                    <UserPlus size={14} />
                                    {t("ui.Organigrama.asignar")}
                                  </button>
                                </div>
                              ))}

                            {plazas.length === 0 && gente.length === 0 && (
                              <div
                                className="flex items-center gap-2.5 py-2.5 pr-3 text-xs"
                                style={{
                                  paddingLeft: 12 + 2 * 22 + 24,
                                  borderBottom: "1px solid var(--hairline)",
                                  color: "var(--ink-soft)",
                                }}
                              >
                                <span className="flex-1">
                                  {t("ui.Organigrama.sinPlazas")}
                                </span>
                                {botonPuesto(st, false)}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  },
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default React.memo(OrganigramaViewInner);
