import type { PostSite } from "@/types";

import { useCallback, useEffect, useState } from "react";
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

export default function SupervisorPositionsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SupervisorPosition[]>([]);
  const [sups, setSups] = useState<Supervisor[]>([]);
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
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
  const [offsetSel, setOffsetSel] = useState<Record<string, string>>({});
  const [stationEdit, setStationEdit] = useState<string | null>(null);

  const stationName = (id: string) =>
    stations.find((s) => s.id === id)?.name || id;

  const load = useCallback(() => {
    setLoading(true);
    supervisorPositionService
      .list()
      .then((r) => setRows(r.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    supervisorService
      .list()
      .then((r) => setSups(r.rows || []))
      .catch(() => {});
  }, []);
  useEffect(() => {
    stationService
      .list({}, { limit: 300, offset: 0 })
      .then((r) =>
        setStations(
          (r.rows || []).map((s: PostSite) => ({
            id: String(s.id),
            name: s.name || s.companyName || "—",
          })),
        ),
      )
      .catch(() => setStations([]));
  }, []);

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
    if (!form.name.trim()) {
      toast.error(t("comun.elNombreEsObligatorio"));

      return;
    }
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
      setSaving(false);
    }
  };

  const assign = async (posId: string) => {
    const uid = assignSel[posId];

    if (!uid) return;
    try {
      const updated = await supervisorPositionService.assign(posId, {
        supervisorUserId: uid,
        platoonOffset: Number(offsetSel[posId] || 0),
      });

      setRows((prev) => prev.map((p) => (p.id === posId ? updated : p)));
      setAssignSel((s) => ({ ...s, [posId]: "" }));
      setOffsetSel((s) => ({ ...s, [posId]: "" }));
      toast.success(t("ui.SupervisorPositionsPage.supervisorAsignado"));
    } catch (e: any) {
      toast.error(
        e?.message ||
          t("supervisorPositions.assignError", "No se pudo asignar"),
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

  const removePos = async (posId: string) => {
    if (!confirm(t("ui.SupervisorPositionsPage.eliminarEstePuesto", "¿Eliminar este puesto?"))) return;
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
                      onClick={() => removePos(p.id)}
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
                    <StatusBadge dot={false} tone="ok">
                      <Radar className="mr-1 inline h-3 w-3" />
                      {rotationSummary(p)}
                    </StatusBadge>
                    <span style={{ color: "var(--ink-soft)" }}>
                      {SCHEDULE_TYPES.find((x) => x.value === p.scheduleType)
                        ?.label ?? p.scheduleType}
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
                        {a.platoonOffset ? (
                          <span
                            className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                            style={{
                              background: "var(--brand-wash)",
                              color: "var(--brand-text)",
                            }}
                          >
                            {t("ui.SupervisorPositionsPage.desfaseN", {
                              n: a.platoonOffset,
                              defaultValue: "desfase {{n}}",
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

                  <div className="flex flex-wrap items-center gap-2">
                    <select
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
                    <div className="flex items-center gap-1">
                      <label className="cg-eyebrow">
                        {t("ui.SupervisorPositionsPage.desfase", "Desfase")}
                      </label>
                      <input
                        className="cg-input cg-focus h-9 w-16 px-2 text-sm"
                        min={0}
                        placeholder="0"
                        type="number"
                        value={offsetSel[p.id] ?? ""}
                        onChange={(e) =>
                          setOffsetSel((s) => ({
                            ...s,
                            [p.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      disabled={!assignSel[p.id]}
                      size="sm"
                      variant="outline"
                      onClick={() => assign(p.id)}
                    >
                      {t("ui.SupervisorPositionsPage.asignar", "Asignar")}
                    </Button>
                  </div>
                  {p.rotationStyle && (
                    <p
                      className="mt-1.5 text-[11px]"
                      style={{ color: "var(--ink-faint)" }}
                    >
                      {t(
                        "ui.SupervisorPositionsPage.elDesfaseEscalonaLaRotacion",
                        "El desfase escalona la rotación. Para el turno opuesto (noche mientras otro está en día), usa",
                      )}{" "}
                      <span className="font-semibold text-foreground">
                        {p.rotationStyle.dayShifts}
                      </span>
                      .
                    </p>
                  )}

                  <div
                    className="mt-4 border-t pt-3"
                    style={{ borderColor: "var(--hairline)" }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="cg-eyebrow tabular-nums">
                        {t("ui.SupervisorPositionsPage.puestosBajoProteccion", {
                          count: p.stationIds.length,
                          defaultValue: "Puestos bajo protección ({{count}})",
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
                        {stations.length === 0 && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--ink-soft)" }}
                          >
                            {t("ui.SupervisorPositionsPage.cargandoPuestos")}
                          </p>
                        )}
                        {stations.map((s) => {
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
            <Button disabled={saving} variant="brand" onClick={create}>
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
              scheduleType={form.scheduleType}
              value={form.rotationStyleId}
              onChange={(id) => setForm((f) => ({ ...f, rotationStyleId: id }))}
            />
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
              {t("ui.SupervisorPositionsPage.puestosBajoProteccion", {
                count: form.stationIds.length,
                defaultValue: "Puestos bajo protección ({{count}})",
              })}
            </label>
            <div className="glass-sunken max-h-48 space-y-1 overflow-y-auto p-1">
              {stations.length === 0 && (
                <p
                  className="p-2 text-xs"
                  style={{ color: "var(--ink-faint)" }}
                >
                  {t("ui.SupervisorPositionsPage.cargandoPuestos")}
                </p>
              )}
              {stations.map((s) => {
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
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
