import { useEffect, useState, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ClipboardCheck, Inbox } from "lucide-react";
import { PageContainer, PageHeader, Section, StatusBadge, SkeletonCards, EmptyState } from "@/components/kit";
import taskService, { type TaskRow } from "@/lib/api/taskService";
import { promptDialog } from "@/components/ui/promptDialog";

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-EC");
}

const PRIORITY_META: Record<string, { label: string; tone: "bad" | "warn" | "neutral" }> = {
  alta: { label: "Alta", tone: "bad" },
  media: { label: "Media", tone: "warn" },
  baja: { label: "Baja", tone: "neutral" },
};

export default function TaskApprovals() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    taskService
      .byStatus({ status: "pending_approval", limit: 200 })
      .then((r) => setRows(r.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const approve = async (r: TaskRow) => {
    setBusy(true);
    try {
      await taskService.approve(r.id);
      toast.success(t('ui.TaskApprovals.tareaAprobadaEnviadaALos'));
      load();
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const reject = async (r: TaskRow) => {
    const notes = (await promptDialog({ title: "Motivo del rechazo", message: "Opcional", placeholder: "Ej.: falta la foto de evidencia" })) ?? undefined;
    setBusy(true);
    try {
      await taskService.reject(r.id, notes);
      toast.success("Tarea rechazada");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<TaskRow>[] = [
    { key: "taskToDo", header: "Tarea", render: (_v, r) => <span className="font-semibold">{r.taskToDo}</span> },
    { key: "station", header: "Puesto", render: (_v, r) => <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{r.taskBelongsToStation?.stationName || "—"}</span> },
    {
      key: "priority", header: "Prioridad", render: (_v, r) => {
        const m = PRIORITY_META[r.priority || "media"] || PRIORITY_META.media;
        return <StatusBadge tone={m.tone} dot={false}>{m.label}</StatusBadge>;
      },
    },
    { key: "dateToDoTheTask", header: "Fecha límite", render: (_v, r) => <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{fmtDate(r.dateToDoTheTask)}</span> },
    { key: "createdAt", header: "Solicitada", render: (_v, r) => <span className="text-xs tabular-nums" style={{ color: "var(--ink-soft)" }}>{fmtDate(r.createdAt)}</span> },
    {
      key: "actions",
      header: "",
      render: (_v, r) => (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => approve(r)}>
            Aprobar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => reject(r)}>
            Rechazar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        <PageContainer width="wide">
          <PageHeader
            icon={<ClipboardCheck />}
            title={t('ui.TaskApprovals.tareasPorAprobar')}
            subtitle={t('ui.TaskApprovals.tareasCreadasPorLosClientes')}
            badges={!loading ? <StatusBadge tone={rows.length > 0 ? "warn" : "ok"}>{rows.length > 0 ? `${rows.length} pendientes` : "Nada pendiente"}</StatusBadge> : undefined}
          />

          <Section title={t("ui.TaskApprovals.pendientesDeAprobacion", "Pendientes de aprobación")} icon={<ClipboardCheck />}>
            {loading ? (
              <SkeletonCards count={4} />
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title={t("ui.TaskApprovals.noHayTareasPendientesDe", "No hay tareas pendientes de aprobación")}
                description={t('ui.TaskApprovals.lasTareasQueLosClientes')}
              />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                emptyState={
                  <EmptyState
                    icon={<Inbox />}
                    title={t("ui.TaskApprovals.noHayTareasPendientesDe2", "No hay tareas pendientes de aprobación")}
                    description={t('ui.TaskApprovals.lasTareasQueLosClientes')}
                  />
                }
              />
            )}
          </Section>
        </PageContainer>
      </div>
    </AppLayout>
  );
}
