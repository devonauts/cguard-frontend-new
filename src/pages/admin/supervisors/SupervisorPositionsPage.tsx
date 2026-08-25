import { useCallback, useEffect, useState } from "react";
import { useTranslation } from 'react-i18next';
import AppLayout from "@/layouts/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MapPin, Plus, Radar, Clock, Users, X, Trash2, Building2, Check } from "lucide-react";
import { PageContainer, PageHeader, Section, SkeletonCards, StatCard, Modal, StatusBadge, EmptyState } from "@/components/kit";
import { ListSection } from "./ListSection";
import RotationStyleSelect from "@/components/schedule/RotationStyleSelect";
import { supervisorPositionService, type SupervisorPosition } from "@/lib/api/supervisorPositionService";
import { supervisorService, type Supervisor } from "@/lib/api/supervisorService";
import { stationService } from "@/lib/api/stationService";
import type { PostSite } from "@/types";

const SCHEDULE_TYPES = [
  { value: "12h-day", label: "Diurno (12h)" },
  { value: "12h-night", label: "Nocturno (12h)" },
  { value: "24h", label: "24h (día/noche)" },
  { value: "custom", label: "Personalizado" },
];

function rotationSummary(p: SupervisorPosition): string {
  const r = p.rotationStyle;
  if (!r) return "Sin rotación";
  const parts = [`${r.dayShifts} día`];
  if (r.nightShifts) parts.push(`${r.nightShifts} noche`);
  parts.push(`${r.restDays} descanso`);
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
  const [form, setForm] = useState({ name: "", zone: "", scheduleType: "24h", rotationStyleId: "", startTime: "07:00", endTime: "19:00", guardsNeeded: 2, stationIds: [] as string[] });
  const [assignSel, setAssignSel] = useState<Record<string, string>>({});
  const [offsetSel, setOffsetSel] = useState<Record<string, string>>({});
  const [stationEdit, setStationEdit] = useState<string | null>(null);

  const stationName = (id: string) => stations.find((s) => s.id === id)?.name || id;

  const load = useCallback(() => {
    setLoading(true);
    supervisorPositionService.list().then((r) => setRows(r.rows || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);
  useEffect(() => { supervisorService.list().then((r) => setSups(r.rows || [])).catch(() => {}); }, []);
  useEffect(() => {
    stationService.list({}, { limit: 300, offset: 0 })
      .then((r) => setStations((r.rows || []).map((s: PostSite) => ({ id: String(s.id), name: s.name || s.companyName || "—" }))))
      .catch(() => setStations([]));
  }, []);

  const toggleStationOnPuesto = async (pos: SupervisorPosition, sid: string) => {
    const next = pos.stationIds.includes(sid) ? pos.stationIds.filter((x) => x !== sid) : [...pos.stationIds, sid];
    try {
      const updated = await supervisorPositionService.update(pos.id, { stationIds: next });
      setRows((prev) => prev.map((p) => (p.id === pos.id ? updated : p)));
    } catch (e: any) { toast.error(e?.message || "No se pudo actualizar"); }
  };

  const create = async () => {
    if (!form.name.trim()) { toast.error("El nombre es obligatorio"); return; }
    setSaving(true);
    try {
      await supervisorPositionService.create({
        name: form.name.trim(), zone: form.zone.trim() || undefined, scheduleType: form.scheduleType,
        rotationStyleId: form.rotationStyleId || undefined, startTime: form.startTime || undefined,
        endTime: form.endTime || undefined, guardsNeeded: Number(form.guardsNeeded) || 1,
        stationIds: form.stationIds,
      });
      toast.success("Puesto creado");
      setOpen(false);
      setForm({ name: "", zone: "", scheduleType: "24h", rotationStyleId: "", startTime: "07:00", endTime: "19:00", guardsNeeded: 2, stationIds: [] });
      load();
    } catch (e: any) { toast.error(e?.message || "No se pudo crear"); } finally { setSaving(false); }
  };

  const assign = async (posId: string) => {
    const uid = assignSel[posId];
    if (!uid) return;
    try {
      const updated = await supervisorPositionService.assign(posId, { supervisorUserId: uid, platoonOffset: Number(offsetSel[posId] || 0) });
      setRows((prev) => prev.map((p) => (p.id === posId ? updated : p)));
      setAssignSel((s) => ({ ...s, [posId]: "" }));
      setOffsetSel((s) => ({ ...s, [posId]: "" }));
      toast.success("Supervisor asignado");
    } catch (e: any) { toast.error(e?.message || "No se pudo asignar"); }
  };

  const unassign = async (posId: string, asgId: string) => {
    try {
      const updated = await supervisorPositionService.unassign(posId, asgId);
      setRows((prev) => prev.map((p) => (p.id === posId ? updated : p)));
    } catch (e: any) { toast.error(e?.message || "No se pudo quitar"); }
  };

  const removePos = async (posId: string) => {
    if (!confirm("¿Eliminar este puesto?")) return;
    try { await supervisorPositionService.remove(posId); setRows((prev) => prev.filter((p) => p.id !== posId)); }
    catch (e: any) { toast.error(e?.message || "No se pudo eliminar"); }
  };

  const totalAssigned = rows.reduce((n, p) => n + p.assignments.length, 0);

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <PageContainer width="wide">
          <PageHeader
            icon={<MapPin />}
            title="Puestos de supervisor"
            subtitle="Configura los puestos (turno + rotación) y asigna supervisores. La rotación del puesto define el horario — el supervisor la sigue."
            actions={<Button variant="brand" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Nuevo puesto</Button>}
          />

          <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-md">
            <StatCard label="Puestos" value={rows.length} icon={<MapPin />} />
            <StatCard label="Supervisores asignados" value={totalAssigned} icon={<Users />} accent="ok" />
          </div>

          {loading ? (
            <SkeletonCards count={3} />
          ) : rows.length === 0 ? (
            <Section title="Puestos" icon={<MapPin />}>
              <EmptyState
                icon={<MapPin />}
                title={t("ui.SupervisorPositions.aunNoHayPuestosDe", "Aún no hay puestos de supervisor")}
                description="Crea el primero (p. ej. «Aguila2»): defines su turno y su rotación, y los supervisores asignados la siguen."
                action={<Button variant="brand" size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Nuevo puesto</Button>}
              />
            </Section>
          ) : (
            <div className="space-y-4">
              {rows.map((p) => (
                <ListSection key={p.id} title={p.name} icon={<MapPin />}
                  action={(
                    <button
                      onClick={() => removePos(p.id)}
                      className="cg-focus rounded-lg p-1.5 transition-colors"
                      style={{ color: "var(--ink-faint)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--bad-text)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-faint)"; }}
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}>
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    {p.zone && <StatusBadge tone="neutral" dot={false}>{p.zone}</StatusBadge>}
                    <StatusBadge tone="warn" dot={false}><Clock className="mr-1 inline h-3 w-3" />{p.startTime || "—"}–{p.endTime || "—"}</StatusBadge>
                    <StatusBadge tone="ok" dot={false}><Radar className="mr-1 inline h-3 w-3" />{rotationSummary(p)}</StatusBadge>
                    <span style={{ color: "var(--ink-soft)" }}>{p.scheduleType}</span>
                  </div>

                  <div className="cg-eyebrow mb-2">Supervisores asignados</div>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {p.assignments.length === 0 && <span className="text-sm" style={{ color: "var(--ink-soft)" }}>Ninguno</span>}
                    {p.assignments.map((a) => (
                      <StatusBadge key={a.id} tone="neutral" dot={false}>
                        <Users className="h-3 w-3" />{a.supervisorName || a.supervisorUserId}
                        {a.platoonOffset ? (
                          <span
                            className="rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
                            style={{ background: "var(--brand-wash)", color: "var(--brand-text)" }}
                          >
                            desfase {a.platoonOffset}
                          </span>
                        ) : null}
                        <button
                          onClick={() => unassign(p.id, a.id)}
                          className="cg-focus rounded-full transition-colors hover:[color:var(--bad-text)]"
                          style={{ color: "var(--ink-soft)" }}
                          aria-label="Quitar supervisor"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </StatusBadge>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select value={assignSel[p.id] || ""} onChange={(e) => setAssignSel((s) => ({ ...s, [p.id]: e.target.value }))}
                      className="cg-input cg-focus h-9 flex-1 px-2 text-sm sm:max-w-xs">
                      <option value="">Asignar supervisor…</option>
                      {sups.filter((s) => !p.assignments.some((a) => a.supervisorUserId === s.id)).map((s) => (
                        <option key={s.id} value={s.id}>{s.fullName}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <label className="cg-eyebrow">Desfase</label>
                      <input type="number" min={0} value={offsetSel[p.id] ?? ""} placeholder="0"
                        onChange={(e) => setOffsetSel((s) => ({ ...s, [p.id]: e.target.value }))}
                        className="cg-input cg-focus h-9 w-16 px-2 text-sm" />
                    </div>
                    <Button variant="outline" size="sm" disabled={!assignSel[p.id]} onClick={() => assign(p.id)}>Asignar</Button>
                  </div>
                  {p.rotationStyle && (
                    <p className="mt-1.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>
                      El desfase escalona la rotación. Para el turno opuesto (noche mientras otro está en día), usa <span className="font-semibold text-foreground">{p.rotationStyle.dayShifts}</span>.
                    </p>
                  )}

                  <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="cg-eyebrow tabular-nums">Puestos bajo protección ({p.stationIds.length})</span>
                      <button
                        onClick={() => setStationEdit(stationEdit === p.id ? null : p.id)}
                        className="cg-focus rounded-md text-xs font-semibold hover:underline"
                        style={{ color: "var(--brand-text)" }}
                      >
                        {stationEdit === p.id ? "Listo" : "Editar"}
                      </button>
                    </div>
                    {stationEdit === p.id ? (
                      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                        {stations.length === 0 && <p className="text-xs" style={{ color: "var(--ink-soft)" }}>Cargando puestos…</p>}
                        {stations.map((s) => {
                          const on = p.stationIds.includes(s.id);
                          return (
                            <button key={s.id} type="button" onClick={() => toggleStationOnPuesto(p, s.id)}
                              className="cg-focus flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-all"
                              style={on
                                ? { borderColor: "var(--brand-line)", background: "var(--brand-wash)" }
                                : { borderColor: "var(--hairline)", background: "transparent" }}>
                              <span
                                className="grid h-4 w-4 place-items-center rounded border"
                                style={on
                                  ? { background: "var(--brand)", color: "var(--brand-ink)", borderColor: "transparent" }
                                  : { borderColor: "var(--hairline)" }}
                              >
                                {on && <Check className="h-3 w-3" />}
                              </span>
                              <Building2 className="h-3.5 w-3.5" style={{ color: "var(--ink-faint)" }} /><span className="truncate">{s.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : p.stationIds.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {p.stationIds.map((sid) => (
                          <StatusBadge key={sid} tone="neutral" dot={false}>
                            <Building2 className="h-3 w-3" />{stationName(sid)}
                          </StatusBadge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>Ninguno. Usa «Editar» para asignar puestos.</p>
                    )}
                  </div>
                </ListSection>
              ))}
            </div>
          )}
        </PageContainer>
      </div>

      <Modal open={open} onOpenChange={setOpen} title="Nuevo puesto de supervisor" icon={<MapPin className="h-5 w-5" />}
        description="Configura el turno y la rotación (día/noche). Los supervisores asignados siguen esta rotación."
        footer={<><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button><Button variant="brand" onClick={create} disabled={saving}>{saving ? "Creando…" : "Crear puesto"}</Button></>}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input placeholder="Nombre (p. ej. Aguila2) *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Zona / sector" value={form.zone} onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))} />
          </div>
          <div>
            <label className="cg-eyebrow mb-1 block">Tipo de turno</label>
            <select value={form.scheduleType} onChange={(e) => setForm((f) => ({ ...f, scheduleType: e.target.value }))}
              className="cg-input cg-focus h-9 w-full px-2 text-sm">
              {SCHEDULE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="cg-eyebrow mb-1 block">{t("ui.SupervisorPositions.rotacion", "Rotación")}</label>
            <RotationStyleSelect scheduleType={form.scheduleType} value={form.rotationStyleId} onChange={(id) => setForm((f) => ({ ...f, rotationStyleId: id }))} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="cg-eyebrow">Entrada (día)
              <Input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="mt-1" /></label>
            <label className="cg-eyebrow">Salida (día)
              <Input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="mt-1" /></label>
            <label className="cg-eyebrow">Supervisores por turno
              <Input type="number" min={1} value={form.guardsNeeded} onChange={(e) => setForm((f) => ({ ...f, guardsNeeded: Number(e.target.value) }))} className="mt-1" /></label>
          </div>
          <div>
            <label className="cg-eyebrow mb-1 block">Puestos bajo protección ({form.stationIds.length})</label>
            <div className="glass-sunken max-h-48 space-y-1 overflow-y-auto p-1">
              {stations.length === 0 && <p className="p-2 text-xs" style={{ color: "var(--ink-faint)" }}>Cargando puestos…</p>}
              {stations.map((s) => {
                const on = form.stationIds.includes(s.id);
                return (
                  <button key={s.id} type="button"
                    onClick={() => setForm((f) => ({ ...f, stationIds: on ? f.stationIds.filter((x) => x !== s.id) : [...f.stationIds, s.id] }))}
                    className="cg-focus flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-all"
                    style={on ? { background: "var(--brand-wash)", color: "var(--brand-text)" } : undefined}>
                    <span
                      className="grid h-4 w-4 place-items-center rounded border"
                      style={on
                        ? { background: "var(--brand)", color: "var(--brand-ink)", borderColor: "transparent" }
                        : { borderColor: "var(--hairline)" }}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <Building2 className="h-3.5 w-3.5" /><span className="truncate">{s.name}</span>
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
