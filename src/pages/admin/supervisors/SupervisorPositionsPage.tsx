import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  MapPin,
  Plus,
  Radar,
  Clock,
  Users,
  X,
  Trash2,
  Building2,
  Check,
} from "lucide-react";

import { ListSection } from "./ListSection";

import i18n from "@/i18n";
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  StatCard,
  StatsStrip,
  Modal,
  StatusBadge,
  EmptyState,
} from "@/components/kit";
import RotationStyleSelect from "@/components/schedule/RotationStyleSelect";
import {
  supervisorPositionService,
  type SupervisorPosition,
} from "@/lib/api/supervisorPositionService";
import {
  supervisorService,
  type Supervisor,
} from "@/lib/api/supervisorService";
import { stationService } from "@/lib/api/stationService";
import { conEtiqueta } from "@/lib/i18nLabel";
import { hoyEnLaEmpresa, soloFechaCivil } from "@/lib/horaDeLaEmpresa";
import { ErrorDeCarga } from "@/components/kit/ErrorDeCarga";
import { confirmDialog } from "@/components/ui/confirmDialog";

/** `label` es una propiedad de acceso (`conEtiqueta`): la lista se construye al
 *  importar el módulo, así que el texto tiene que resolverse al pintarlo. */
const SCHEDULE_TYPES = [
  conEtiqueta("supervisorPositions.scheduleType.12hDay", { value: "12h-day" }),
  conEtiqueta("supervisorPositions.scheduleType.12hNight", {
    value: "12h-night",
  }),
  conEtiqueta("supervisorPositions.scheduleType.24h", { value: "24h" }),
  conEtiqueta("supervisorPositions.scheduleType.custom", { value: "custom" }),
];

interface StationOption {
  id: string;
  name: string;
  postSiteId: string;
  postSiteName: string;
}

interface StationGroup {
  key: string;
  name: string;
  stations: StationOption[];
}

// No es un componente: se entra por i18n.t DENTRO de la función, que es donde
// se evalúa al llamarla (precedente AppErrorBoundary).
function rotationSummary(p: SupervisorPosition): string {
  const r = p.rotationStyle;

  if (!r) return i18n.t("rotation.none", "Sin rotación");
  const parts = [
    i18n.t("rotation.days", {
      count: r.dayShifts,
      defaultValue: "{{count}} día",
    }),
  ];

  if (r.nightShifts)
    parts.push(
      i18n.t("rotation.nights", {
        count: r.nightShifts,
        defaultValue: "{{count}} noche",
      }),
    );
  parts.push(
    i18n.t("rotation.rests", {
      count: r.restDays,
      defaultValue: "{{count}} descanso",
    }),
  );

  return `${r.name} · ${parts.join(" · ")}`;
}

/** Coverage in words: a 24 h position shows both halves with their real hours. */
function coberturaDe(p: SupervisorPosition): string {
  if (p.scheduleType === "24h" && p.startTime && p.endTime) {
    // A rotation with no nights (5-2) only ever produces the day half.
    if (p.rotationStyle && !p.rotationStyle.nightShifts)
      return i18n.t("supervisorPositions.soloDia", {
        defaultValue: "Solo de día · {{s}}–{{e}}",
        s: p.startTime,
        e: p.endTime,
      });

    return i18n.t("supervisorPositions.cobertura24h", {
      defaultValue: "Día {{s}}–{{e}} · noche {{e}}–{{s}}",
      s: p.startTime,
      e: p.endTime,
    });
  }

  return (
    SCHEDULE_TYPES.find((x) => x.value === p.scheduleType)?.label ??
    p.scheduleType
  );
}

export default function SupervisorPositionsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SupervisorPosition[]>([]);
  const [sups, setSups] = useState<Supervisor[]>([]);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [stationsState, setStationsState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    zone: "",
    scheduleType: "24h",
    rotationStyleId: "",
    startTime: "07:00",
    endTime: "19:00",
    guardsNeeded: 2,
    stationIds: [] as string[],
  });
  const [assignSel, setAssignSel] = useState<Record<string, string>>({});
  // QA-97: a double click created the position / the assignment twice. Refs
  // are set synchronously, before the first await; state only re-renders.
  const creatingRef = useRef(false);
  const assigningRef = useRef<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<Record<string, boolean>>({});
  // Day the supervisor starts the position's cycle (its day 0). Replaces the
  // «Desfase» number: a date is what people know.
  const [inicioSel, setInicioSel] = useState<Record<string, string>>({});
  // Rotation chosen to fix a legacy position saved without one.
  const [cicloSel, setCicloSel] = useState<Record<string, string>>({});
  const [stationEdit, setStationEdit] = useState<string | null>(null);

  const stationName = (id: string) =>
    stations.find((s) => s.id === id)?.name || id;

  const [fallo, setFallo] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    setFallo(false);
    supervisorPositionService
      .list()
      .then((r) => setRows(r.rows || []))
      .catch(() => setFallo(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    supervisorService
      .list()
      .then((r) => setSups(r.rows || []))
      .catch(() => {});
  }, []);
  // A position covers STATIONS (the backend checks the ids against
  // db.station). The old picker listed post sites, so every save was a 400.
  useEffect(() => {
    stationService
      .getStationCards()
      .then((cards) => {
        setStations(
          cards.map((c) => ({
            id: String(c.id),
            name: c.nickname || c.stationName || "—",
            postSiteId: c.postSiteId ? String(c.postSiteId) : "",
            postSiteName: c.postSiteName || "",
          })),
        );
        setStationsState("ready");
      })
      .catch(() => {
        setStations([]);
        setStationsState("error");
      });
  }, []);

  const stationGroups = useMemo(() => {
    const groups = new Map<string, StationGroup>();

    for (const s of stations) {
      const g = groups.get(s.postSiteId) ?? {
        key: s.postSiteId,
        name: s.postSiteName,
        stations: [],
      };

      g.stations.push(s);
      groups.set(s.postSiteId, g);
    }

    return [...groups.values()]
      .map((g) => ({
        ...g,
        stations: g.stations.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [stations]);

  const stationListNotice =
    stationsState === "ready" && stations.length > 0
      ? null
      : stationsState === "loading"
        ? t("ui.SupervisorPositionsPage.cargandoPuestos")
        : stationsState === "error"
          ? t(
              "ui.SupervisorPositionsPage.noSePudieronCargarLasEstaciones",
              "No se pudieron cargar las estaciones. Recarga la página.",
            )
          : t(
              "ui.SupervisorPositionsPage.aunNoHayEstaciones",
              "Aún no hay estaciones. Créalas en cada sede para poder asignarlas.",
            );

  const toggleStationOnPuesto = async (
    pos: SupervisorPosition,
    sid: string,
  ) => {
    const next = pos.stationIds.includes(sid)
      ? pos.stationIds.filter((x) => x !== sid)
      : [...pos.stationIds, sid];

    try {
      const updated = await supervisorPositionService.update(pos.id, {
        stationIds: next,
      });

      setRows((prev) => prev.map((p) => (p.id === pos.id ? updated : p)));
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("supervisorPositions.updateError", "No se pudo actualizar"),
      );
    }
  };

  const create = async () => {
    if (creatingRef.current) return;
    if (!form.name.trim()) {
      toast.error(t("comun.elNombreEsObligatorio"));

      return;
    }
    if (!form.rotationStyleId) {
      toast.error(
        t(
          "ui.SupervisorPositionsPage.eligeLaRotacion",
          "Elige cómo rota el puesto: sin rotación no genera turnos.",
        ),
      );

      return;
    }
    creatingRef.current = true;
    setSaving(true);
    try {
      await supervisorPositionService.create({
        name: form.name.trim(),
        zone: form.zone.trim() || undefined,
        scheduleType: form.scheduleType,
        rotationStyleId: form.rotationStyleId || undefined,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        guardsNeeded: Number(form.guardsNeeded) || 1,
        stationIds: form.stationIds,
      });
      toast.success(t("ui.SupervisorPositionsPage.puestoCreado"));
      setOpen(false);
      setForm({
        name: "",
        zone: "",
        scheduleType: "24h",
        rotationStyleId: "",
        startTime: "07:00",
        endTime: "19:00",
        guardsNeeded: 2,
        stationIds: [],
      });
      load();
    } catch (e: any) {
      toast.error(
        e?.message || t("supervisorPositions.createError", "No se pudo crear"),
      );
    } finally {
      creatingRef.current = false;
      setSaving(false);
    }
  };

  const assign = async (posId: string) => {
    const uid = assignSel[posId];

    if (!uid || assigningRef.current.has(posId)) return;
    assigningRef.current.add(posId);
    setAssigning((s) => ({ ...s, [posId]: true }));
    try {
      const updated = await supervisorPositionService.assign(posId, {
        supervisorUserId: uid,
        platoonOffset: 0,
        startDate: inicioSel[posId] || hoyEnLaEmpresa(),
      });

      setRows((prev) => prev.map((p) => (p.id === posId ? updated : p)));
      setAssignSel((s) => ({ ...s, [posId]: "" }));
      setInicioSel((s) => ({ ...s, [posId]: "" }));
      toast.success(t("ui.SupervisorPositionsPage.supervisorAsignado"));
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("supervisorPositions.assignError", "No se pudo asignar"),
      );
    } finally {
      assigningRef.current.delete(posId);
      setAssigning((s) => ({ ...s, [posId]: false }));
    }
  };

  const guardarCiclo = async (posId: string) => {
    const rotationStyleId = cicloSel[posId];

    if (!rotationStyleId) return;
    try {
      const updated = await supervisorPositionService.update(posId, {
        rotationStyleId,
      });

      setRows((prev) => prev.map((p) => (p.id === posId ? updated : p)));
      setCicloSel((s) => ({ ...s, [posId]: "" }));
      toast.success(
        t("ui.SupervisorPositionsPage.rotacionGuardada", "Rotación guardada"),
      );
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("supervisorPositions.updateError", "No se pudo actualizar"),
      );
    }
  };

  const unassign = async (posId: string, asgId: string) => {
    try {
      const updated = await supervisorPositionService.unassign(posId, asgId);

      setRows((prev) => prev.map((p) => (p.id === posId ? updated : p)));
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("supervisorPositions.unassignError", "No se pudo quitar"),
      );
    }
  };

  const removePos = async (posId: string, nombre: string) => {
    if (
      !(await confirmDialog({
        message: t("ui.SupervisorPositionsPage.eliminarElPuesto", {
          defaultValue: "¿Eliminar el puesto «{{nombre}}»?",
          nombre,
        }),
        confirmText: t("actions.delete", "Eliminar"),
        tone: "danger",
      }))
    )
      return;
    try {
      await supervisorPositionService.remove(posId);
      setRows((prev) => prev.filter((p) => p.id !== posId));
    } catch (e: any) {
      toast.error(e?.message || t("comun.noSePudoEliminar", "No se pudo eliminar"));
    }
  };

  const totalAssigned = rows.reduce((n, p) => n + p.assignments.length, 0);

  return (
    <AppLayout>
      <div>
        <PageContainer width="wide">
          <PageHeader
            actions={
              <Button variant="brand" onClick={() => setOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />{" "}
                {t("ui.SupervisorPositionsPage.nuevoPuesto")}
              </Button>
            }
            icon={<MapPin />}
            subtitle={t(
              "ui.SupervisorPositionsPage.configuraLosPuestosTurnoRotacion",
              "Configura los puestos (turno + rotación) y asigna supervisores. La rotación del puesto define el horario — el supervisor la sigue.",
            )}
            title={t("ui.SupervisorPositionsPage.puestosDeSupervisor")}
          />

          <StatsStrip className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <StatCard
              icon={<MapPin />}
              label={t("ui.SupervisorPositionsPage.puestos", "Puestos")}
              value={rows.length} />
            <StatCard
              accent="ok"
              icon={<Users />}
              label={t("ui.SupervisorPositionsPage.supervisoresAsignados", "Supervisores asignados")}
              value={totalAssigned}
            />
          </StatsStrip>

          {loading ? (
            <SkeletonCards count={3} />
          ) : fallo && rows.length === 0 ? (
            <ErrorDeCarga onRetry={load} />
          ) : rows.length === 0 ? (
            <Section icon={<MapPin />} title={t("ui.SupervisorPositionsPage.puestos", "Puestos")}>
              <EmptyState
                action={
                  <Button
                    size="sm"
                    variant="brand"
                    onClick={() => setOpen(true)}
                  >
                    <Plus className="mr-2 h-4 w-4" />{" "}
                    {t("ui.SupervisorPositionsPage.nuevoPuesto")}
                  </Button>
                }
                description={t("ui.SupervisorPositionsPage.creaElPrimeroPEj")}
                icon={<MapPin />}
                title={t(
                  "ui.SupervisorPositions.aunNoHayPuestosDe",
                  "Aún no hay puestos de supervisor",
                )}
              />
            </Section>
          ) : (
            <div className="space-y-4">
              {rows.map((p) => (
                <ListSection
                  key={p.id}
                  action={
                    <button
                      className="cg-focus rounded-lg p-1.5 transition-colors"
                      style={{ color: "var(--ink-faint)" }}
                      title={t("actions.delete")}
                      onClick={() => removePos(p.id, p.name)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--bad-text)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--ink-faint)";
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  }
                  icon={<MapPin />}
                  title={p.name}
                >
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    {p.zone && (
                      <StatusBadge dot={false} tone="neutral">
                        {p.zone}
                      </StatusBadge>
                    )}
                    <StatusBadge dot={false} tone="warn">
                      <Clock className="mr-1 inline h-3 w-3" />
                      {p.startTime || "—"}–{p.endTime || "—"}
                    </StatusBadge>
                    <StatusBadge dot={false} tone={p.rotationStyle ? "ok" : "bad"}>
                      <Radar className="mr-1 inline h-3 w-3" />
                      {p.rotationStyle
                        ? rotationSummary(p)
                        : t(
                            "ui.SupervisorPositionsPage.sinRotacionNoGenera",
                            "Sin rotación: no genera turnos",
                          )}
                    </StatusBadge>
                    <span style={{ color: "var(--ink-soft)" }}>
                      {coberturaDe(p)}
                    </span>
                  </div>

                  <div className="cg-eyebrow mb-2">
                    {t("ui.SupervisorPositionsPage.supervisoresAsignados", "Supervisores asignados")}
                  </div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {p.assignments.length === 0 && (
                      <span
                        className="text-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t("ui.SupervisorPositionsPage.ninguno")}
                      </span>
                    )}
                    {p.assignments.map((a) => (
                      <StatusBadge key={a.id} dot={false} tone="neutral">
                        <Users className="h-3 w-3" />
                        {a.supervisorName || a.supervisorUserId}
                        {a.startDate ? (
                          <span
                            className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                            style={{
                              background: "var(--brand-wash)",
                              color: "var(--brand-text)",
                            }}
                          >
                            {a.platoonOffset
                              ? t("ui.SupervisorPositionsPage.cicloDesdeMasN", {
                                  fecha: soloFechaCivil(a.startDate),
                                  n: a.platoonOffset,
                                  defaultValue: "ciclo desde {{fecha}} +{{n}} d",
                                })
                              : t("ui.SupervisorPositionsPage.cicloDesde", {
                                  fecha: soloFechaCivil(a.startDate),
                                  defaultValue: "ciclo desde {{fecha}}",
                                })}
                          </span>
                        ) : null}
                        <button
                          aria-label={t(
                            "ui.SupervisorPositionsPage.quitarSupervisor",
                          )}
                          className="cg-focus rounded-full transition-colors hover:[color:var(--bad-text)]"
                          style={{ color: "var(--ink-soft)" }}
                          onClick={() => unassign(p.id, a.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </StatusBadge>
                    ))}
                  </div>

                  {!p.rotationStyle ? (
                    <div className="glass-sunken space-y-2 p-3">
                      <p className="text-xs" style={{ color: "var(--bad-text)" }}>
                        {t(
                          "ui.SupervisorPositionsPage.sinRotacionExplicacion",
                          "Este puesto no tiene rotación, así que sus supervisores no tienen turnos. Elige cómo rota y guarda; después podrás asignar supervisores.",
                        )}
                      </p>
                      <RotationStyleSelect
                        persona="supervisor"
                        scheduleType={p.scheduleType}
                        value={cicloSel[p.id] || ""}
                        onChange={(id) =>
                          setCicloSel((s) => ({ ...s, [p.id]: id }))
                        }
                      />
                      <Button
                        disabled={!cicloSel[p.id]}
                        size="sm"
                        variant="brand"
                        onClick={() => guardarCiclo(p.id)}
                      >
                        {t(
                          "ui.SupervisorPositionsPage.guardarRotacion",
                          "Guardar rotación",
                        )}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-end gap-2">
                        <select
                          aria-label={t("ui.SupervisorPositionsPage.asignarSupervisor")}
                          className="cg-input cg-focus h-9 flex-1 px-2 text-sm sm:max-w-xs"
                          value={assignSel[p.id] || ""}
                          onChange={(e) =>
                            setAssignSel((s) => ({ ...s, [p.id]: e.target.value }))
                          }
                        >
                          <option value="">
                            {t("ui.SupervisorPositionsPage.asignarSupervisor")}
                          </option>
                          {sups
                            .filter(
                              (s) =>
                                !p.assignments.some(
                                  (a) => a.supervisorUserId === s.id,
                                ),
                            )
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.fullName}
                              </option>
                            ))}
                        </select>
                        <label className="flex flex-col gap-1">
                          <span className="cg-eyebrow">
                            {t(
                              "ui.SupervisorPositionsPage.empiezaSuCicloEl",
                              "Empieza su ciclo el",
                            )}
                          </span>
                          <input
                            className="cg-input cg-focus h-9 px-2 text-sm"
                            type="date"
                            value={inicioSel[p.id] || hoyEnLaEmpresa()}
                            onChange={(e) =>
                              setInicioSel((s) => ({
                                ...s,
                                [p.id]: e.target.value,
                              }))
                            }
                          />
                        </label>
                        <Button
                          disabled={!assignSel[p.id] || !!assigning[p.id]}
                          size="sm"
                          variant="outline"
                          onClick={() => assign(p.id)}
                        >
                          {t("ui.SupervisorPositionsPage.asignar", "Asignar")}
                        </Button>
                      </div>
                      <p
                        className="mt-1.5 text-[11px]"
                        style={{ color: "var(--ink-faint)" }}
                      >
                        {t("ui.SupervisorPositionsPage.inicioDelCicloAyuda", {
                          n: p.rotationStyle.dayShifts,
                          defaultValue:
                            "Ese día es su primer día de trabajo del ciclo. Para que cubra el turno contrario al de otro supervisor, empieza su ciclo {{n}} días después que él.",
                        })}
                      </p>
                    </>
                  )}

                  <div
                    className="mt-4 border-t pt-3"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="cg-eyebrow tabular-nums">
                        {t("ui.SupervisorPositionsPage.estacionesQueCubre", {
                          count: p.stationIds.length,
                          defaultValue: "Estaciones que cubre ({{count}})",
                        })}
                      </span>
                      <button
                        className="cg-focus rounded-md text-xs font-semibold hover:underline"
                        style={{ color: "var(--brand-text)" }}
                        onClick={() =>
                          setStationEdit(stationEdit === p.id ? null : p.id)
                        }
                      >
                        {stationEdit === p.id
                          ? t("ui.SupervisorPositionsPage.listo", "Listo")
                          : t("actions.edit", "Editar")}
                      </button>
                    </div>
                    {stationEdit === p.id ? (
                      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                        {stationListNotice && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {stationListNotice}
                          </p>
                        )}
                        {stationGroups.map((g) => (
                          <div key={g.key} className="space-y-1">
                            <StationGroupHeading name={g.name} />
                        {g.stations.map((s) => {
                          const on = p.stationIds.includes(s.id);

                          return (
                            <button
                              key={s.id}
                              className="cg-focus flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all"
                              style={
                                on
                                  ? {
                                      borderColor: "var(--brand-line)",
                                      background: "var(--brand-wash)",
                                    }
                                  : {
                                      borderColor: "var(--hairline)",
                                      background: "transparent",
                                    }
                              }
                              type="button"
                              onClick={() => toggleStationOnPuesto(p, s.id)}
                            >
                              <span
                                className="grid h-4 w-4 place-items-center rounded border"
                                style={
                                  on
                                    ? {
                                        background: "var(--brand)",
                                        color: "var(--brand-ink)",
                                        borderColor: "transparent",
                                      }
                                    : { borderColor: "var(--hairline)" }
                                }
                              >
                                {on && <Check className="h-3 w-3" />}
                              </span>
                              <Building2
                                className="h-3.5 w-3.5"
                                style={{ color: "var(--ink-faint)" }}
                              />
                              <span className="truncate">{s.name}</span>
                            </button>
                          );
                        })}
                          </div>
                        ))}
                      </div>
                    ) : p.stationIds.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {p.stationIds.map((sid) => (
                          <StatusBadge key={sid} dot={false} tone="neutral">
                            <Building2 className="h-3 w-3" />
                            {stationName(sid)}
                          </StatusBadge>
                        ))}
                      </div>
                    ) : (
                      <p
                        className="text-sm"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {t(
                          "ui.SupervisorPositionsPage.ningunoUsaEditarParaAsignar",
                        )}
                      </p>
                    )}
                  </div>
                </ListSection>
              ))}
            </div>
          )}
        </PageContainer>
      </div>

      <Modal
        description={t("ui.SupervisorPositionsPage.configuraElTurnoYLa")}
        footer={
          <>
            <Button
              disabled={saving}
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={saving || !form.rotationStyleId}
              variant="brand"
              onClick={create}
            >
              {saving ? t("ui.SupervisorPositionsPage.creando", "Creando…") : t("ui.SupervisorPositionsPage.crearPuesto", "Crear puesto")}
            </Button>
          </>
        }
        icon={<MapPin className="h-5 w-5" />}
        open={open}
        title={t("ui.SupervisorPositionsPage.nuevoPuestoDeSupervisor")}
        onOpenChange={setOpen}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              placeholder={t("ui.SupervisorPositionsPage.nombrePEjAguila2")}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              placeholder={t("ui.SupervisorPositionsPage.zonaSector", "Zona / sector")}
              value={form.zone}
              onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}
            />
          </div>
          <div>
            <label className="cg-eyebrow mb-1 block">
              {t("ui.SupervisorPositionsPage.tipoDeTurno")}
            </label>
            <select
              className="cg-input cg-focus h-9 w-full px-2 text-sm"
              value={form.scheduleType}
              onChange={(e) =>
                setForm((f) => ({ ...f, scheduleType: e.target.value }))
              }
            >
              {SCHEDULE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="cg-eyebrow mb-1 block">
              {t("ui.SupervisorPositions.rotacion", "Rotación")}
            </label>
            <RotationStyleSelect
              persona="supervisor"
              scheduleType={form.scheduleType}
              value={form.rotationStyleId}
              onChange={(id) => setForm((f) => ({ ...f, rotationStyleId: id }))}
            />
            {!form.rotationStyleId && (
              <p className="mt-1 text-xs" style={{ color: "var(--ink-soft)" }}>
                {t(
                  "ui.SupervisorPositionsPage.eligeLaRotacion",
                  "Elige cómo rota el puesto: sin rotación no genera turnos.",
                )}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="cg-eyebrow">
              {t("ui.SupervisorPositionsPage.entradaDia", "Entrada (día)")}
              <Input
                className="mt-1"
                type="time"
                value={form.startTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startTime: e.target.value }))
                }
              />
            </label>
            <label className="cg-eyebrow">
              {t("ui.SupervisorPositionsPage.salidaDia", "Salida (día)")}
              <Input
                className="mt-1"
                type="time"
                value={form.endTime}
                onChange={(e) =>
                  setForm((f) => ({ ...f, endTime: e.target.value }))
                }
              />
            </label>
            <label className="cg-eyebrow">
              {t("ui.SupervisorPositionsPage.supervisoresPorTurno", "Supervisores por turno")}
              <Input
                className="mt-1"
                min={1}
                type="number"
                value={form.guardsNeeded}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    guardsNeeded: Number(e.target.value),
                  }))
                }
              />
            </label>
          </div>
          <div>
            <label className="cg-eyebrow mb-1 block">
              {t("ui.SupervisorPositionsPage.estacionesQueCubre", {
                count: form.stationIds.length,
                defaultValue: "Estaciones que cubre ({{count}})",
              })}
            </label>
            <div className="glass-sunken max-h-48 space-y-1 overflow-y-auto p-1">
              {stationListNotice && (
                <p
                  className="p-2 text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {stationListNotice}
                </p>
              )}
              {stationGroups.map((g) => (
                <div key={g.key} className="space-y-1">
                  <StationGroupHeading name={g.name} />
              {g.stations.map((s) => {
                const on = form.stationIds.includes(s.id);

                return (
                  <button
                    key={s.id}
                    className="cg-focus flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-all"
                    style={
                      on
                        ? {
                            background: "var(--brand-wash)",
                            color: "var(--brand-text)",
                          }
                        : undefined
                    }
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        stationIds: on
                          ? f.stationIds.filter((x) => x !== s.id)
                          : [...f.stationIds, s.id],
                      }))
                    }
                  >
                    <span
                      className="grid h-4 w-4 place-items-center rounded border"
                      style={
                        on
                          ? {
                              background: "var(--brand)",
                              color: "var(--brand-ink)",
                              borderColor: "transparent",
                            }
                          : { borderColor: "var(--hairline)" }
                      }
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <Building2 className="h-3.5 w-3.5" />
                    <span className="truncate">{s.name}</span>
                  </button>
                );
              })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

/** Post-site label above its stations in the pickers. */
function StationGroupHeading({ name }: { name: string }) {
  const { t } = useTranslation();

  return (
    <div
      className="cg-eyebrow flex items-center gap-1.5 px-2 pt-2"
      style={{ color: "var(--ink-faint)" }}
    >
      <MapPin className="h-3 w-3" />
      <span className="truncate">
        {name || t("ui.SupervisorPositionsPage.sinSede", "Sin sede")}
      </span>
    </div>
  );
}
