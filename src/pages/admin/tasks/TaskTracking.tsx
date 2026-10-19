import { useEffect, useState, useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckSquare, Plus, ListChecks } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  PageContainer,
  PageHeader,
  Section,
  SkeletonCards,
  StatusBadge,
  Segmented,
  EmptyState,
  SmartImage,
} from "@/components/kit";
import taskService, {
  type TaskRow,
  type TaskStatus,
  type TaskImage,
} from "@/lib/api/taskService";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa, desdeInputFechaHora } from "@/lib/horaDeLaEmpresa";
import { MarcaSinSenal } from "@/components/conexion/MarcaSinSenal";
import {
  AsyncCombobox,
  type AsyncOption,
} from "@/components/app/async-combobox";
import { useMarcasSinSenal } from "@/hooks/useMarcasSinSenal";
function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);

  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() });
}

/**
 * Estado de la tarea → etiqueta + papel de color del sistema.
 * Constante de módulo: se construye al IMPORTAR, antes de que i18next sepa el
 * idioma. Guarda la CLAVE; la traducción ocurre al pintar, dentro del componente.
 */
const STATUS_META: Record<
  string,
  {
    label: string;
    labelKey: string;
    tone: "warn" | "info" | "ok" | "bad" | "neutral";
  }
> = {
  pending_approval: {
    label: "Por aprobar",
    labelKey: "ui.TaskTracking.estado.pendingApproval",
    tone: "warn",
  },
  approved: {
    label: "Aprobada",
    labelKey: "ui.TaskTracking.estado.approved",
    tone: "info",
  },
  completed: {
    label: "Completada",
    labelKey: "ui.TaskTracking.estado.completed",
    tone: "ok",
  },
  rejected: {
    label: "Rechazada",
    labelKey: "ui.TaskTracking.estado.rejected",
    tone: "bad",
  },
  cancelled: {
    label: "Cancelada",
    labelKey: "ui.TaskTracking.estado.cancelled",
    tone: "neutral",
  },
};

const PRIORITY_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};
const PRIORITY_TONE: Record<string, "bad" | "warn" | "neutral"> = {
  alta: "bad",
  media: "warn",
  baja: "neutral",
};

const FILTERS: Array<{
  key: TaskStatus | "all";
  label: string;
  labelKey: string;
}> = [
  { key: "all", label: "Todas", labelKey: "ui.TaskTracking.filtro.all" },
  {
    key: "pending_approval",
    label: "Por aprobar",
    labelKey: "ui.TaskTracking.filtro.pendingApproval",
  },
  {
    key: "approved",
    label: "Aprobadas",
    labelKey: "ui.TaskTracking.filtro.approved",
  },
  {
    key: "completed",
    label: "Completadas",
    labelKey: "ui.TaskTracking.filtro.completed",
  },
  {
    key: "rejected",
    label: "Rechazadas",
    labelKey: "ui.TaskTracking.filtro.rejected",
  },
];

/* Puestos for the "new task" picker, searched on the server: the autocomplete
   returns at most 50, so a fixed list left every post after the 50th out of
   reach in a large company. A post name is NOT unique across clients (four
   identical «Caseta Principal»), so the internal nickname (P-011, P-091…)
   that the autocomplete already returns is shown next to it. */
async function searchStations(query: string): Promise<AsyncOption[]> {
  const r = await taskService.stations(query);
  const rows = (r?.rows || r || []) as Array<{
    id: string;
    label?: string;
    stationName?: string;
    nickname?: string | null;
  }>;

  return rows.map((s) => {
    const nombre = s.label || s.stationName || s.id;

    return {
      value: s.id,
      label: s.nickname && s.nickname !== nombre ? `${nombre} · ${s.nickname}` : nombre,
    };
  });
}

export default function TaskTracking() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<TaskRow[]>([]);
  // Tareas completadas sin señal: una consulta por lista.
  const marcasSinSenal = useMarcasSinSenal(rows.map((r) => r.id));
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TaskStatus | "all">("all");

  // New-task dialog
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    taskToDo: "",
    stationId: "",
    deadline: "",
    priority: "media",
  });
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
      toast.success(
        kind === "approve"
          ? t("ui.TaskTracking.tareaAprobada", "Tarea aprobada")
          : t("ui.TaskTracking.tareaRechazada", "Tarea rechazada"),
      );
      setSelected(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || t("ui.TaskTracking.error", "Error"));
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

  const openDialog = () => {
    setForm({ taskToDo: "", stationId: "", deadline: "", priority: "media" });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.taskToDo.trim() || !form.stationId || !form.deadline) {
      toast.error(t("ui.TaskTracking.completaTareaPuestoYFecha"));

      return;
    }
    setSaving(true);
    try {
      await taskService.create({
        taskToDo: form.taskToDo.trim(),
        taskBelongsToStation: form.stationId,
        // Lo que el usuario escribe en un `datetime-local` es hora de pared
        // DEL PUESTO. `new Date(valor)` la leía en la zona del dispositivo,
        // así que el mismo dato se guardaba corrido según quién lo escribiera.
        dateToDoTheTask: desdeInputFechaHora(form.deadline),
        priority: form.priority as "alta" | "media" | "baja",
      });
      toast.success(t("ui.TaskTracking.tareaCreadaYEnviadaA"));
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || t("ui.TaskTracking.error", "Error"));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<TaskRow>[] = [
    {
      key: "taskToDo",
      header: t("reports.col.task.task", "Tarea"),
      render: (_v, r) => <span className="font-semibold">{r.taskToDo}</span>,
    },
    {
      key: "station",
      header: t("comun.puesto", "Puesto"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.taskBelongsToStation?.stationName || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: t("comun.estado", "Estado"),
      render: (_v, r) => {
        const m = STATUS_META[r.status] || STATUS_META.pending_approval;

        return (
          <StatusBadge tone={m.tone}>{t(m.labelKey, m.label)}</StatusBadge>
        );
      },
    },
    {
      key: "priority",
      header: t("guards.reminders.table.priority", "Prioridad"),
      render: (_v, r) => {
        const k = r.priority || "media";

        return (
          <StatusBadge dot={false} tone={PRIORITY_TONE[k] ?? "neutral"}>
            {PRIORITY_LABEL[k] ? t(`comun.${k}`, PRIORITY_LABEL[k]) : k}
          </StatusBadge>
        );
      },
    },
    {
      key: "source",
      header: t("clients.assignGuards.table.source", "Origen"),
      render: (_v, r) => (
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          {r.source === "client"
            ? t("clients.client", "Cliente")
            : r.source === "passdown"
              ? t("ui.PassdownsPage.paseDeTurno", "Pase de turno")
              : t("ui.IntegrationsList.operacion", "Operación")}
        </span>
      ),
    },
    {
      key: "dateToDoTheTask",
      header: t("ui.TaskTracking.fechaLimite", "Fecha límite"),
      render: (_v, r) => (
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          {fmtDate(r.dateToDoTheTask)}
        </span>
      ),
    },
    {
      key: "dateCompletedTask",
      header: t("ui.TaskTracking.estado.completed", "Completada"),
      render: (_v, r) => (
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          {fmtDate(r.dateCompletedTask)}
          {/* Completada sin señal: la hora es la real; llegó después. */}
          <MarcaSinSenal className="ml-1" marca={marcasSinSenal[String(r.id)]} />
        </span>
      ),
    },
  ];

  return (
    <AppLayout>
      <div>
        <PageContainer width="wide">
          <PageHeader
            actions={
              <Button variant="brand" onClick={openDialog}>
                <Plus className="mr-2 h-4 w-4" />{" "}
                {t("ui.TaskTracking.nuevaTarea")}{" "}
              </Button>
            }
            icon={<CheckSquare />}
            subtitle={t("ui.TaskTracking.seguimientoDeTareasDeLos")}
            title={t("postSites.Details.Tasks", "Tareas")}
          />

          <Section
            action={
              /* Cinco pestañas no caben en un teléfono: el conmutador se desplaza
               dentro de su propio carril en vez de empujar la página. */
              <div className="-my-1 min-w-0 overflow-x-auto py-1">
                <Segmented<TaskStatus | "all">
                  options={FILTERS.map((f) => ({
                    value: f.key,
                    label: t(f.labelKey, f.label),
                  }))}
                  value={filter}
                  onChange={setFilter}
                />
              </div>
            }
            icon={<ListChecks />}
            title={t("postSites.Details.Tasks", "Tareas")}
          >
            {loading ? (
              <SkeletonCards count={4} />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                emptyState={
                  <EmptyState
                    description={t("ui.TaskTracking.lasTareasDeLosPuestos")}
                    icon={<ListChecks />}
                    title={t("ui.TaskTracking.noHayTareas")}
                  />
                }
                onRowClick={(r) => setSelected(r)}
              />
            )}
          </Section>
        </PageContainer>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ui.TaskTracking.nuevaTarea")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder={t("ui.TaskTracking.describeLaTarea")}
              value={form.taskToDo}
              onChange={(e) =>
                setForm((f) => ({ ...f, taskToDo: e.target.value }))
              }
            />
            <AsyncCombobox
              aria-label={t("comun.puesto")}
              placeholder={t("comun.puesto")}
              search={searchStations}
              value={form.stationId}
              onChange={(v) => setForm((f) => ({ ...f, stationId: v }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="datetime-local"
                value={form.deadline}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deadline: e.target.value }))
                }
              />
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("guards.reminders.form.priority", "Prioridad")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alta">{t("comun.alta")}</SelectItem>
                  <SelectItem value="media">{t("comun.media")}</SelectItem>
                  <SelectItem value="baja">{t("comun.baja")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={saving}
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button disabled={saving} onClick={submit}>
              {saving
                ? t("clients.creating", "Creando…")
                : t("ui.TaskTracking.crearYAsignar", "Crear y asignar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task detail */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("ui.TaskTracking.detalleDeLaTarea")}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <p className="cg-eyebrow">
                  {t("reports.col.task.task", "Tarea")}
                </p>
                <p className="glass-sunken mt-1 whitespace-pre-wrap p-3 text-sm font-medium">
                  {selected.taskToDo}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailField label={t("comun.estado")}>
                  {(() => {
                    const m =
                      STATUS_META[selected.status] ||
                      STATUS_META.pending_approval;

                    return (
                      <StatusBadge tone={m.tone}>
                        {t(m.labelKey, m.label)}
                      </StatusBadge>
                    );
                  })()}
                </DetailField>
                <DetailField
                  label={t("guards.reminders.table.priority", "Prioridad")}
                >
                  {(() => {
                    const k = selected.priority || "media";

                    return (
                      <StatusBadge
                        dot={false}
                        tone={PRIORITY_TONE[k] ?? "neutral"}
                      >
                        {PRIORITY_LABEL[k] ? t(`comun.${k}`, PRIORITY_LABEL[k]) : k}
                      </StatusBadge>
                    );
                  })()}
                </DetailField>
                <DetailField label={t("comun.puesto")}>
                  {selected.taskBelongsToStation?.stationName || "—"}
                </DetailField>
                <DetailField
                  label={t("clients.assignGuards.table.source", "Origen")}
                >
                  {selected.source === "client"
                    ? t("clients.client", "Cliente")
                    : selected.source === "passdown"
                      ? t("ui.PassdownsPage.paseDeTurno", "Pase de turno")
                      : selected.source === "staff"
                        ? t("ui.IntegrationsList.operacion", "Operación")
                        : "—"}
                </DetailField>
                <DetailField
                  label={t("ui.TaskTracking.fechaLimite", "Fecha límite")}
                >
                  {fmtDate(selected.dateToDoTheTask)}
                </DetailField>
                <DetailField label={t("reports.col.task.created", "Creada")}>
                  {fmtDate(selected.createdAt)}
                </DetailField>
                <DetailField
                  label={t("ui.TaskTracking.realizada", "¿Realizada?")}
                >
                  {selected.wasItDone
                    ? t("guards.summary.onDutyYes", "Sí")
                    : t("common.no", "No")}
                </DetailField>
                <DetailField
                  label={t("ui.TaskTracking.estado.completed", "Completada")}
                >
                  {fmtDate(selected.dateCompletedTask)}
                  <MarcaSinSenal className="ml-1" marca={marcasSinSenal[String(selected.id)]} />
                </DetailField>
              </div>
              {selected.approvalNotes && (
                <DetailField
                  label={t(
                    "ui.TaskTracking.notasDeAprobacion",
                    "Notas de aprobación",
                  )}
                >
                  <span className="whitespace-pre-wrap">
                    {selected.approvalNotes}
                  </span>
                </DetailField>
              )}
              <TaskImages
                images={selected.imageOptional}
                label={t(
                  "ui.TaskTracking.imagenDeReferencia",
                  "Imagen de referencia",
                )}
              />
              <TaskImages
                images={selected.taskCompletedImage}
                label={t(
                  "ui.TaskTracking.fotoDeFinalizacion",
                  "Foto de finalización",
                )}
              />
            </div>
          )}
          <DialogFooter>
            {selected?.status === "pending_approval" && (
              <>
                <Button
                  disabled={acting}
                  variant="destructive"
                  onClick={() => doApproval("reject")}
                >
                  {t("revision.rechazar", "Rechazar")}
                </Button>
                <Button
                  disabled={acting}
                  variant="brand"
                  onClick={() => doApproval("approve")}
                >
                  {acting
                    ? "…"
                    : t("ui.DocumentPacketPublic.approveButton", "Aprobar")}
                </Button>
              </>
            )}
            <Button
              disabled={acting}
              variant="outline"
              onClick={() => setSelected(null)}
            >
              {t("actions.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="cg-eyebrow">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function TaskImages({
  label,
  images,
}: {
  label: string;
  images?: TaskImage[] | null;
}) {
  const items = (images || [])
    .map((f) => f.downloadUrl || f.publicUrl)
    .filter(Boolean) as string[];

  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="cg-eyebrow">{label}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((src, i) => (
          <a
            key={i}
            className="glass-flat block h-24 w-24 overflow-hidden"
            href={src}
            rel="noreferrer"
            target="_blank"
          >
            <SmartImage
              alt={label}
              className="h-full w-full transition-opacity hover:opacity-80"
              fit="cover"
              src={src}
            />
          </a>
        ))}
      </div>
    </div>
  );
}
