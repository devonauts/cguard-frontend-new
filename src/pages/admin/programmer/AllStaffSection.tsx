import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";

import { codePill, CODE_LABEL, columnRules, tonePill, type Tone } from "./codeTones";

import { ApiService } from "@/services/api/apiService";
import { SearchInput, Segmented } from "@/components/kit";
import OfficeHoursEditor from "@/components/schedule/OfficeHoursEditor";
import { jornadaDesdeDias } from "@/lib/jornadaSemanal";
import {
  accionDePersona,
  contarPersonas,
  cubreLaVentana,
  dondeEstaEl,
  filtrarPersonas,
  normalizarPersonas,
  rotuloDeDonde,
  tramosDe,
  unirPersonas,
  ventanaParaLaHoja,
  type DiaDePersona,
  type FiltroDeTipo,
  type PersonaDelHorario,
  type TipoDePersona,
} from "@/lib/personalDelHorario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «TODO EL PERSONAL» — EVERYONE, WHERE THEY ARE AND WITH WHAT HOURS.
 *
 * Mike: «es de asistencia donde vemos el listado de cada trabajador y debes
 * incluir absolutamente a todos». The sheet below lists POSTS, so whoever was
 * not sitting on a seat — a guard with no assignment, the secretary, a
 * supervisor with no supervision post — did not appear anywhere. This band
 * lists PEOPLE: one row each, guards, supervisors and office alike, with the
 * place and the hours of every visible day, and «Sin horario» in amber so the
 * gap is impossible to miss. It also replaces the old «Oficina» band: the
 * office rows open the weekly editor from here.
 *
 * Same grid as the sheet (`gridCols`, `colA`/`colB`) so the columns line up in
 * the month view, the week view and the day view.
 * ════════════════════════════════════════════════════════════════════════════
 */

const tenantId = () => localStorage.getItem("tenantId") || "";
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Rows painted before «Mostrar todos»: 300 guards × 40 days is 12.000 cells. */
const LIMITE_FILAS = 60;
const CLAVE_ABIERTA = "cg.schedule.allStaff.open";

const TONO_TIPO: Record<TipoDePersona, Tone> = {
  guard: "info",
  supervisor: "brand",
  office: "neutral",
};

function leerAbierta(): boolean {
  try {
    return localStorage.getItem(CLAVE_ABIERTA) !== "0";
  } catch {
    return true;
  }
}

function AllStaffSection({
  monthDays,
  colA,
  colB,
  gridCols,
  colWidth,
  tintFor,
  todayStr,
  refreshKey = 0,
  onAsignarAPuesto,
}: {
  /** The SAME days the sheet paints, so the columns line up. */
  monthDays: Date[];
  /** Virtualized window of the sheet: only columns [colA, colB) are painted. */
  colA: number;
  colB: number;
  /** Sticky column, left pad, one column per visible day, right pad. */
  gridCols: string;
  colWidth?: number;
  tintFor?: (day: Date, index: number) => string | undefined;
  todayStr: string;
  /** Bumped by the parent after a change elsewhere (an assignment) to reload. */
  refreshKey?: number;
  onAsignarAPuesto: (p: { userId: string; name: string }) => void;
}) {
  const { t } = useTranslation();
  const [abierta, setAbierta] = useState(leerAbierta);
  const [personas, setPersonas] = useState<PersonaDelHorario[] | null>(null);
  const [cargado, setCargado] = useState<{ desde: string; hasta: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const [tipo, setTipo] = useState<FiltroDeTipo>("all");
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState(false);
  const [editar, setEditar] = useState<PersonaDelHorario | null>(null);
  const pedido = useRef(0);

  const visibleDays = monthDays.slice(colA, colB);
  const visDesde = visibleDays.length ? ymd(visibleDays[0]) : "";
  const visHasta = visibleDays.length ? ymd(visibleDays[visibleDays.length - 1]) : "";
  const ultimo = monthDays.length ? ymd(monthDays[monthDays.length - 1]) : "";

  const pedir = useCallback(async (w: { desde: string; hasta: string }) => {
    const yo = ++pedido.current;

    setCargando(true);
    try {
      // The endpoint takes ≤ 62 days; the painted sheet can be wider.
      const respuestas = await Promise.all(
        tramosDe(w.desde, w.hasta).map((tr) =>
          ApiService.get(
            `/tenant/${tenantId()}/scheduler/people?startDate=${tr.desde}&endDate=${tr.hasta}`,
          ),
        ),
      );

      if (yo !== pedido.current) return;
      setPersonas(unirPersonas(respuestas.map(normalizarPersonas)));
      setCargado(w);
      setError(false);
    } catch {
      if (yo !== pedido.current) return;
      setError(true);
      setCargado(w);
    } finally {
      if (yo === pedido.current) setCargando(false);
    }
  }, []);

  // Follow the visible window; wait for the scroll to settle before asking.
  useEffect(() => {
    if (!visDesde || cubreLaVentana(cargado, visDesde, visHasta)) return;
    const id = window.setTimeout(
      () => void pedir(ventanaParaLaHoja(visDesde, visHasta, ultimo)),
      cargado ? 250 : 0,
    );

    return () => window.clearTimeout(id);
  }, [visDesde, visHasta, ultimo, cargado, pedir]);

  const recargar = useCallback(() => {
    if (cargado) void pedir(cargado);
  }, [cargado, pedir]);

  // A change elsewhere in the Schedule (new assignment…) moves people around.
  const primeraVez = useRef(true);

  useEffect(() => {
    if (primeraVez.current) {
      primeraVez.current = false;

      return;
    }
    recargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const alternar = () =>
    setAbierta((v) => {
      try {
        localStorage.setItem(CLAVE_ABIERTA, v ? "0" : "1");
      } catch {
        /* a preference, nothing more */
      }

      return !v;
    });

  /** `YYYY-MM-DD` → day, per person. One index, not a scan per cell. */
  const porPersona = useMemo(() => {
    const m = new Map<string, Map<string, DiaDePersona>>();

    for (const p of personas || []) m.set(p.userId, new Map(p.days.map((d) => [d.date, d])));

    return m;
  }, [personas]);

  const cuentas = useMemo(() => contarPersonas(personas || []), [personas]);
  const filtradas = useMemo(
    () => filtrarPersonas(personas || [], tipo, q),
    [personas, tipo, q],
  );
  const filas = todos ? filtradas : filtradas.slice(0, LIMITE_FILAS);
  /** Where people are «today» — or on the first visible day when today is out of view. */
  const fechaDonde =
    todayStr >= visDesde && todayStr <= visHasta ? todayStr : visDesde;

  const resumen = [
    t("ui.AllStaff.nVigilantes", { defaultValue: "{{count}} vigilantes", count: cuentas.guard }),
    t("ui.AllStaff.nSupervisores", { defaultValue: "{{count}} supervisores", count: cuentas.supervisor }),
    t("ui.AllStaff.nOficina", { defaultValue: "{{count}} oficina", count: cuentas.office }),
  ].join(" · ");

  const etiquetaTipo = (k: TipoDePersona) =>
    k === "guard"
      ? t("ui.AllStaff.tipoVigilante", "Vigilante")
      : k === "supervisor"
        ? t("ui.AllStaff.tipoSupervisor", "Supervisor")
        : t("ui.AllStaff.tipoOficina", "Oficina");

  const textoDonde = (p: PersonaDelHorario): string => {
    const r = rotuloDeDonde(dondeEstaEl(p, fechaDonde));

    if (r) return r;
    if (p.kind === "office") return t("ui.AllStaff.enOficina", "Oficina");
    if (p.kind === "supervisor") return t("ui.AllStaff.supervision", "Supervisión");

    return p.assigned
      ? t("ui.AllStaff.sinTurnoVisible", "Sin turno en estos días")
      : t("ui.AllStaff.sinPuesto", "Sin puesto");
  };

  const tituloDe = (p: PersonaDelHorario, d: DiaDePersona | undefined, ds: string) => {
    if (!d) return `${p.name} · ${ds}`;
    const donde = rotuloDeDonde(d.where);
    const que =
      d.status === "work"
        ? d.start && d.end
          ? d.lunch
            ? `${d.start}–${d.end} · ${t("ui.AllStaff.almuerzo", {
                defaultValue: "almuerzo {{start}}–{{end}}",
                start: d.lunch.start,
                end: d.lunch.end,
              })}`
            : `${d.start}–${d.end}`
          : t("ui.AllStaff.trabaja", "Trabaja")
        : d.status === "off"
          ? t("ui.AllStaff.libre", "Libre")
          : d.status === "absence"
            ? (d.absence && CODE_LABEL[d.absence]) || t("ui.AllStaff.ausente", "Ausente")
            : t("ui.AllStaff.sinHorario", "Sin horario");

    return [p.name, ds, que, donde].filter(Boolean).join(" · ");
  };

  const celda = (d: DiaDePersona | undefined) => {
    if (!d)
      return (
        <span className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
          ·
        </span>
      );
    if (d.status === "work")
      return (
        <div
          className="flex flex-1 flex-col items-center justify-center rounded py-0.5 leading-none"
          style={tonePill("brand", 14)}
        >
          {d.start && d.end ? (
            <>
              <span className="text-[9px] font-semibold tabular-nums">{d.start}</span>
              <span className="text-[9px] tabular-nums opacity-80">{d.end}</span>
            </>
          ) : (
            <span className="text-[10px] font-bold">{t("ui.RotationStyleSelect.letraDia", "D")}</span>
          )}
        </div>
      );
    if (d.status === "absence" && d.absence)
      return (
        <div className="flex flex-1 items-center justify-center rounded" style={codePill(d.absence)}>
          <span className="text-[10px] font-bold">{d.absence}</span>
        </div>
      );
    if (d.status === "off")
      return (
        <span className="text-[9px]" style={{ color: "var(--ink-soft)" }}>
          {t("ui.AllStaff.libre", "Libre")}
        </span>
      );

    // «Sin horario»: the gap this band exists to show.
    return (
      <div className="flex flex-1 items-center justify-center rounded" style={tonePill("warn", 16)}>
        <span className="text-[10px] font-bold">—</span>
      </div>
    );
  };

  const filaSuelta = (contenido: ReactNode) => (
    <div
      className="grid"
      style={{ gridTemplateColumns: gridCols, borderTop: "1px solid var(--hairline)" }}
    >
      <div style={{ gridColumn: "1 / -1" }}>
        <div className="sticky left-0 px-4 py-2" style={{ maxWidth: "min(720px, calc(100vw - 32px))" }}>
          {contenido}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ borderBottom: "2px solid var(--hairline)" }}>
      {/* Section header */}
      <div
        className="grid"
        style={{ gridTemplateColumns: gridCols, background: "var(--glass-sunken)" }}
      >
        <div
          className="sticky left-0 z-20 flex items-center gap-2 px-4 py-2"
          style={{ background: "var(--glass-sunken)" }}
        >
          <button
            aria-expanded={abierta}
            aria-label={
              abierta
                ? t("ui.AllStaff.contraer", "Contraer todo el personal")
                : t("ui.AllStaff.expandir", "Expandir todo el personal")
            }
            className="cg-btn-ghost cg-focus rounded p-0.5"
            type="button"
            onClick={alternar}
          >
            {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <Users size={14} style={{ color: "var(--brand-text)", flexShrink: 0 }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold uppercase tracking-wide">
              {t("ui.AllStaff.titulo", "Todo el personal")}
            </div>
            <div className="truncate text-[10px]" style={{ color: "var(--ink-soft)" }} title={resumen}>
              {personas ? resumen : t("ui.StaffSchedule.cargando", "Cargando…")}
            </div>
          </div>
          {cargando && <Loader2 className="animate-spin" size={12} style={{ color: "var(--ink-faint)" }} />}
          {!!personas && cuentas.sinHorario > 0 && (
            <button
              className="cg-focus inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={tonePill("warn", 16)}
              title={t("ui.AllStaff.verSinHorario", "Ver quién no tiene horario")}
              type="button"
              onClick={() => {
                setTipo("sinHorario");
                if (!abierta) alternar();
              }}
            >
              <AlertTriangle size={10} />
              {t("ui.AllStaff.nSinHorario", {
                defaultValue: "{{count}} sin horario",
                count: cuentas.sinHorario,
              })}
            </button>
          )}
        </div>
        <div style={{ gridColumn: "2 / -1", ...columnRules(colWidth) }} />
      </div>

      {abierta && (
        <>
          {/* Filters: kind + search. Sticky so they stay put while the year scrolls. */}
          {filaSuelta(
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                options={[
                  { value: "all", label: `${t("ui.AllStaff.todos", "Todos")} · ${cuentas.total}` },
                  { value: "guard", label: `${t("ui.AllStaff.vigilantes", "Vigilantes")} · ${cuentas.guard}` },
                  { value: "supervisor", label: `${t("ui.AllStaff.supervisores", "Supervisores")} · ${cuentas.supervisor}` },
                  { value: "office", label: `${t("ui.AllStaff.oficina", "Oficina")} · ${cuentas.office}` },
                  { value: "sinHorario", label: `${t("ui.AllStaff.sinHorario", "Sin horario")} · ${cuentas.sinHorario}` },
                ]}
                value={tipo}
                onChange={(v) => setTipo(v as FiltroDeTipo)}
              />
              <SearchInput
                className="w-full sm:w-56"
                placeholder={t("ui.AllStaff.buscar", "Buscar persona o puesto…")}
                value={q}
                onChange={setQ}
              />
            </div>,
          )}

          {error &&
            filaSuelta(
              <div className="flex items-center gap-2 text-xs" style={{ color: "var(--bad-text)" }}>
                <AlertTriangle size={13} />
                {t("ui.AllStaff.errorCargar", "No se pudo cargar el personal.")}
                <button
                  className="cg-focus inline-flex items-center gap-1 font-semibold hover:underline"
                  style={{ color: "var(--brand-text)" }}
                  type="button"
                  onClick={recargar}
                >
                  <RefreshCw size={11} />
                  {t("ui.AllStaff.reintentar", "Reintentar")}
                </button>
              </div>,
            )}

          {!!personas && !filtradas.length &&
            filaSuelta(
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {personas.length
                  ? t("ui.AllStaff.nadieConEseFiltro", "Nadie coincide con el filtro.")
                  : t("ui.AllStaff.nadie", "Todavía no hay personal activo.")}
              </p>,
            )}

          {filas.map((p) => {
            const accion = accionDePersona(p);
            const dias = porPersona.get(p.userId);
            const abrirEditor = () => setEditar(p);

            return (
              <div
                key={p.userId}
                className="grid"
                style={{ gridTemplateColumns: gridCols, borderTop: "1px solid var(--hairline)" }}
              >
                <div
                  className="sticky left-0 z-20 flex items-center gap-2 px-4 py-1.5"
                  style={{ background: "var(--glass-solid)", borderRight: "1px solid var(--hairline)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="shrink-0 rounded px-1 py-px text-[8px] font-bold uppercase tracking-wide"
                        style={tonePill(TONO_TIPO[p.kind], 16)}
                      >
                        {etiquetaTipo(p.kind)}
                      </span>
                      <span className="truncate text-xs font-semibold" title={p.name}>
                        {p.name}
                      </span>
                    </div>
                    {accion ? (
                      <button
                        className="cg-focus mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[10px] font-semibold hover:underline"
                        style={{ color: "var(--warn-text)" }}
                        type="button"
                        onClick={() =>
                          accion === "asignarHorario"
                            ? abrirEditor()
                            : onAsignarAPuesto({ userId: p.userId, name: p.name })
                        }
                      >
                        <Plus size={10} />
                        {accion === "asignarHorario"
                          ? t("ui.AllStaff.asignarHorario", "Asignar horario")
                          : t("ui.AllStaff.asignarAPuesto", "Asignar a un puesto")}
                      </button>
                    ) : (
                      <div
                        className="flex min-w-0 items-center gap-1 text-[10px]"
                        style={{ color: p.hasSchedule ? "var(--ink-soft)" : "var(--warn-text)" }}
                      >
                        <MapPin size={9} className="shrink-0" />
                        <span className="truncate" title={textoDonde(p)}>
                          {p.hasSchedule
                            ? textoDonde(p)
                            : `${textoDonde(p)} · ${t("ui.AllStaff.sinHorario", "Sin horario")}`}
                        </span>
                      </div>
                    )}
                  </div>
                  {p.kind === "office" && p.hasSchedule && (
                    <button
                      aria-label={t("ui.StaffSchedule.definirJornada", "Definir su jornada")}
                      className="cg-btn-ghost cg-focus shrink-0 rounded p-1"
                      title={t("ui.StaffSchedule.definirJornada", "Definir su jornada")}
                      type="button"
                      onClick={abrirEditor}
                    >
                      <Pencil size={12} />
                    </button>
                  )}
                </div>

                <div />
                {visibleDays.map((day, k) => {
                  const i = colA + k;
                  const ds = ymd(day);
                  const d = dias?.get(ds);

                  return (
                    <div
                      key={i}
                      className="flex min-h-[34px] items-center justify-center px-0.5 py-0.5"
                      style={{ borderRight: "1px solid var(--hairline)", background: tintFor?.(day, i) }}
                      title={tituloDe(p, d, ds)}
                    >
                      {celda(d)}
                    </div>
                  );
                })}
                <div />
              </div>
            );
          })}

          {!todos && filtradas.length > LIMITE_FILAS &&
            filaSuelta(
              <button
                className="cg-focus text-xs font-semibold hover:underline"
                style={{ color: "var(--brand-text)" }}
                type="button"
                onClick={() => setTodos(true)}
              >
                {t("ui.AllStaff.mostrarTodos", {
                  defaultValue: "Mostrar a todos ({{count}})",
                  count: filtradas.length,
                })}
              </button>,
            )}
        </>
      )}

      {editar && (
        <OfficeHoursEditor
          inicial={jornadaDesdeDias(editar.days)}
          persona={{ userId: editar.userId, name: editar.name }}
          tenantId={tenantId()}
          tieneHorario={editar.hasSchedule}
          onClose={() => setEditar(null)}
          onSaved={() => {
            setEditar(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

export default memo(AllStaffSection);
