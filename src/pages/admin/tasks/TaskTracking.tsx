import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useTranslation } from 'react-i18next';
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckSquare, Plus, ListChecks } from "lucide-react";
import { PageContainer, PageHeader, Section, SkeletonCards, StatusBadge, Segmented, EmptyState, SmartImage } from "@/components/kit";
import taskService, { type TaskRow, type TaskStatus, type TaskImage } from "@/lib/api/taskService";

import { localeActual } from '@/lib/localeActual'
function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(localeActual());
}

/**
 * Estado de la tarea → etiqueta + papel de color del sistema.
 * Constante de módulo: se construye al IMPORTAR, antes de que i18next sepa el
 * idioma. Guarda la CLAVE; la traducción ocurre al pintar, dentro del componente.
 */
const STATUS_META: Record<string, { label: string; labelKey: string; tone: "warn" | "info" | "ok" | "bad" | "neutral" }> = {
  pending_approval: { label: "Por aprobar", labelKey: "ui.TaskTracking.estado.pendingApproval", tone: "warn" },
  approved: { label: "Aprobada", labelKey: "ui.TaskTracking.estado.approved", tone: "info" },
  completed: { label: "Completada", labelKey: "ui.TaskTracking.estado.completed", tone: "ok" },
  rejected: { label: "Rechazada", labelKey: "ui.TaskTracking.estado.rejected", tone: "bad" },
  cancelled: { label: "Cancelada", labelKey: "ui.TaskTracking.estado.cancelled", tone: "neutral" },
};

const PRIORITY_LABEL: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" };
const PRIORITY_TONE: Record<string, "bad" | "warn" | "neutral"> = { alta: "bad", media: "warn", baja: "neutral" };

const FILTERS: Array<{ key: TaskStatus | "all"; label: string; labelKey: string }> = [
  { key: "all", label: "Todas", labelKey: "ui.TaskTracking.filtro.all" },
  { key: "pending_approval", label: "Por aprobar", labelKey: "ui.TaskTracking.filtro.pendingApproval" },
  { key: "approved", label: "Aprobadas", labelKey: "ui.TaskTracking.filtro.approved" },
  { key: "completed", label: "Completadas", labelKey: "ui.TaskTracking.filtro.completed" },
  { key: "rejected", label: "Rechazadas", labelKey: "ui.TaskTracking.filtro.rejected" },
];

export default function TaskTracking() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskStatus | "all">("all");

  // New-task dialog
  const [open, setOpen] = useState(false);
  const [stations, setStations] = useState<Array<{ id: string; label: string }>>([]);
  const [form, setForm] = useState({ taskToDo: "", stationId: "", deadline: "", priority: "media" });
  const [saving, setSaving] = useState(false);

  // Task detail dialog
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [acting, setActing] = useState(false);

  const doApproval = async (kind: "approve" | "reject") => {
    if (!selected) return;
    setActing(true);
    try {
      if (kind === "approve") await taskService.approve(selected.id);
      else await taskService.reject(selected.id);
      toast.success(kind === "approve" ? "Tarea aprobada" : "Tarea rechazada");
      setSelected(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally {
      setActing(false);
    }
  };

  const load = useCallback(() => {
    setLoading(true);
    taskService
      .byStatus({ status: filter, limit: 200 })
      .then((r) => setRows(r.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter]);
  useEffect(load, [load]);

  const openDialog = async () => {
    setForm({ taskToDo: "", stationId: "", deadline: "", priority: "media" });
    setOpen(true);
    try {
      const r = await taskService.stations();
      const opts = (r.rows || r || []).map((s: { id: string; label?: string; stationName?: string }) => ({ id: s.id, label: s.label || s.stationName || s.id }));
      setStations(opts);
    } catch { /* silent */ }
  };

  const submit = async () => {
    if (!form.taskToDo.trim() || !form.stationId || !form.deadline) {
      toast.error(t('ui.TaskTracking.completaTareaPuestoYFecha'));
      return;
    }
    setSaving(true);
    try {
      await taskService.create({
        taskToDo: form.taskToDo.trim(),
        taskBelongsToStation: form.stationId,
        dateToDoTheTask: new Date(form.deadline).toISOString(),
        priority: form.priority as "alta" | "media" | "baja",
      });
      toast.success(t('ui.TaskTracking.tareaCreadaYEnviadaA'));
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<TaskRow>[] = [
    { key: "taskToDo", header: "Tarea", render: (_v, r) => <span className="font-semibold">{r.taskToDo}</span> },
    { key: "station", header: "Puesto", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.taskBelongsToStation?.stationName || "—"}</span> },
    {
      key: "status", header: "Estado", render: (_v, r) => {
        const m = STATUS_META[r.status] || STATUS_META.pending_approval;
        return <StatusBadge tone={m.tone}>{t(m.labelKey, m.label)}</StatusBadge>;
      },
    },
    {
      key: "priority", header: "Prioridad", render: (_v, r) => {
        const k = r.priority || "media";
        return <StatusBadge tone={PRIORITY_TONE[k] ?? "neutral"} dot={false}>{PRIORITY_LABEL[k] ?? k}</StatusBadge>;
      },
    },
    { key: "source", header: "Origen", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.source === "client" ? "Cliente" : r.source === "passdown" ? "Pase de turno" : "Operación"}</span> },
    { key: "dateToDoTheTask", header: "Fecha límite", render: (_v, r) => <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{fmtDate(r.dateToDoTheTask)}</span> },
    { key: "dateCompletedTask", header: "Completada", render: (_v, r) => <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{fmtDate(r.dateCompletedTask)}</span> },
  ];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <PageContainer width="wide">
          <PageHeader
            icon={<CheckSquare />}
            title="Tareas"
            subtitle={t('ui.TaskTracking.seguimientoDeTareasDeLos')}
            actions={
              <Button variant="brand" onClick={openDialog}>
                <Plus className="mr-2 h-4 w-4" />{" "}{t('ui.TaskTracking.nuevaTarea')}{" "}</Button>
            }
          />

          <Section title="Tareas" icon={<ListChecks />} action={
            /* Cinco pestañas no caben en un teléfono: el conmutador se desplaza
               dentro de su propio carril en vez de empujar la página. */
            <div className="-my-1 min-w-0 overflow-x-auto py-1">
              <Segmented<TaskStatus | "all">
                value={filter}
                onChange={setFilter}
                options={FILTERS.map((f) => ({ value: f.key, label: t(f.labelKey, f.label) }))}
              />
            </div>
          }>
            {loading ? (
              <SkeletonCards count={4} />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                onRowClick={(r) => setSelected(r)}
                emptyState={
                  <EmptyState
                    icon={<ListChecks />}
                    title={t('ui.TaskTracking.noHayTareas')}
                    description={t('ui.TaskTracking.lasTareasDeLosPuestos')}
                  />
                }
              />
            )}
          </Section>
        </PageContainer>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('ui.TaskTracking.nuevaTarea')}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea placeholder={t('ui.TaskTracking.describeLaTarea')} value={form.taskToDo} onChange={(e) => setForm((f) => ({ ...f, taskToDo: e.target.value }))} />
            <Select value={form.stationId} onValueChange={(v) => setForm((f) => ({ ...f, stationId: v }))}>
              <SelectTrigger><SelectValue placeholder={t('comun.puesto')} /></SelectTrigger>
              <SelectContent>
                {stations.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input type="datetime-local" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue placeholder="Prioridad" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">{t('comun.alta')}</SelectItem>
                  <SelectItem value="media">{t('comun.media')}</SelectItem>
                  <SelectItem value="baja">{t('comun.baja')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>{t('actions.cancel')}</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Creando…" : "Crear y asignar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task detail */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('ui.TaskTracking.detalleDeLaTarea')}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <p className="cg-eyebrow">Tarea</p>
                <p className="glass-sunken mt-1 whitespace-pre-wrap p-3 text-sm font-medium">{selected.taskToDo}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailField label={t('comun.estado')}>
                  {(() => { const m = STATUS_META[selected.status] || STATUS_META.pending_approval; return <StatusBadge tone={m.tone}>{t(m.labelKey, m.label)}</StatusBadge>; })()}
                </DetailField>
                <DetailField label="Prioridad">
                  {(() => { const k = selected.priority || "media"; return <StatusBadge tone={PRIORITY_TONE[k] ?? "neutral"} dot={false}>{PRIORITY_LABEL[k] ?? k}</StatusBadge>; })()}
                </DetailField>
                <DetailField label={t('comun.puesto')}>{selected.taskBelongsToStation?.stationName || "—"}</DetailField>
                <DetailField label="Origen">{selected.source === "client" ? "Cliente" : selected.source === "passdown" ? "Pase de turno" : selected.source === "staff" ? "Operación" : "—"}</DetailField>
                <DetailField label={t("ui.TaskTracking.fechaLimite", "Fecha límite")}>{fmtDate(selected.dateToDoTheTask)}</DetailField>
                <DetailField label="Creada">{fmtDate(selected.createdAt)}</DetailField>
                <DetailField label={t("ui.TaskTracking.realizada", "¿Realizada?")}>{selected.wasItDone ? "Sí" : "No"}</DetailField>
                <DetailField label="Completada">{fmtDate(selected.dateCompletedTask)}</DetailField>
              </div>
              {selected.approvalNotes && (
                <DetailField label={t("ui.TaskTracking.notasDeAprobacion", "Notas de aprobación")}>
                  <span className="whitespace-pre-wrap">{selected.approvalNotes}</span>
                </DetailField>
              )}
              <TaskImages label={t('ui.TaskTracking.imagenDeReferencia', 'Imagen de referencia')} images={selected.imageOptional} />
              <TaskImages label={t("ui.TaskTracking.fotoDeFinalizacion", "Foto de finalización")} images={selected.taskCompletedImage} />
            </div>
          )}
          <DialogFooter>
            {selected?.status === "pending_approval" && (
              <>
                <Button variant="destructive" disabled={acting} onClick={() => doApproval("reject")}>Rechazar</Button>
                <Button variant="brand" disabled={acting} onClick={() => doApproval("approve")}>{acting ? "…" : "Aprobar"}</Button>
              </>
            )}
            <Button variant="outline" onClick={() => setSelected(null)} disabled={acting}>{t('actions.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="cg-eyebrow">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function TaskImages({ label, images }: { label: string; images?: TaskImage[] | null }) {
  const items = (images || []).map((f) => f.downloadUrl || f.publicUrl).filter(Boolean) as string[];
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="cg-eyebrow">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((src, i) => (
          <a key={i} href={src} target="_blank" rel="noreferrer" className="glass-flat block h-24 w-24 overflow-hidden">
            <SmartImage
              src={src}
              alt={label}
              fit="cover"
              className="h-full w-full transition-opacity hover:opacity-80"
            />
          </a>
        ))}
      </div>
    </div>
  );
}
