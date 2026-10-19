import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ClipboardCheck, Inbox } from "lucide-react";

import AppLayout from "@/layouts/app-layout";
import { DataTable, type Column } from "@/components/table/DataTable";
import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader,
  Section,
  StatusBadge,
  SkeletonCards,
  EmptyState,
} from "@/components/kit";
import taskService, { type TaskRow } from "@/lib/api/taskService";
import { promptDialog } from "@/components/ui/promptDialog";
import { localeActual } from "@/lib/localeActual";
import { zonaDeLaEmpresa } from "@/lib/horaDeLaEmpresa";
function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);

  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(localeActual(), { timeZone: zonaDeLaEmpresa() });
}

const PRIORITY_META: Record<
  string,
  { label: string; labelKey: string; tone: "bad" | "warn" | "neutral" }
> = {
  alta: { label: "Alta", labelKey: "comun.alta", tone: "bad" },
  media: { label: "Media", labelKey: "comun.media", tone: "warn" },
  baja: { label: "Baja", labelKey: "comun.baja", tone: "neutral" },
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
      toast.success(t("ui.TaskApprovals.tareaAprobadaEnviadaALos"));
      load();
    } catch (e: any) {
      toast.error(e?.message || t("ui.TaskTracking.error", "Error"));
    } finally {
      setBusy(false);
    }
  };

  const reject = async (r: TaskRow) => {
    const notes = await promptDialog({
      title: t("tasks.approvals.rejectReasonTitle", "Motivo del rechazo"),
      message: t("clients.form.optional", "Opcional"),
      placeholder: t(
        "ui.TaskApprovals.ejFaltaLaFotoDeEvidencia",
        "Ej.: falta la foto de evidencia",
      ),
    });
    // null = the operator cancelled the dialog: nothing gets rejected.
    if (notes === null) return;

    setBusy(true);
    try {
      await taskService.reject(r.id, notes.trim() || undefined);
      toast.success(t("ui.TaskTracking.tareaRechazada", "Tarea rechazada"));
      load();
    } catch (e: any) {
      toast.error(e?.message || t("ui.TaskTracking.error", "Error"));
    } finally {
      setBusy(false);
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
      key: "priority",
      header: t("guards.reminders.table.priority", "Prioridad"),
      render: (_v, r) => {
        const m = PRIORITY_META[r.priority || "media"] || PRIORITY_META.media;

        return (
          <StatusBadge dot={false} tone={m.tone}>
            {t(m.labelKey, m.label)}
          </StatusBadge>
        );
      },
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
      key: "createdAt",
      header: t("ui.TaskApprovals.solicitada", "Solicitada"),
      render: (_v, r) => (
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--ink-soft)" }}
        >
          {fmtDate(r.createdAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (_v, r) => (
        <div className="flex gap-2">
          <Button disabled={busy} size="sm" onClick={() => approve(r)}>
            {t("ui.DocumentPacketPublic.approveButton", "Aprobar")}
          </Button>
          <Button
            disabled={busy}
            size="sm"
            variant="outline"
            onClick={() => reject(r)}
          >
            {t("revision.rechazar", "Rechazar")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div>
        <PageContainer width="wide">
          <PageHeader
            badges={
              !loading ? (
                <StatusBadge tone={rows.length > 0 ? "warn" : "ok"}>
                  {rows.length > 0
                    ? t("ui.TaskApprovals.nPendientes", {
                        defaultValue: "{{count}} pendientes",
                        count: rows.length,
                      })
                    : t("ui.TaskApprovals.nadaPendiente", "Nada pendiente")}
                </StatusBadge>
              ) : undefined
            }
            icon={<ClipboardCheck />}
            subtitle={t("ui.TaskApprovals.tareasCreadasPorLosClientes")}
            title={t("ui.TaskApprovals.tareasPorAprobar")}
          />

          <Section
            icon={<ClipboardCheck />}
            title={t(
              "ui.TaskApprovals.pendientesDeAprobacion",
              "Pendientes de aprobación",
            )}
          >
            {loading ? (
              <SkeletonCards count={4} />
            ) : rows.length === 0 ? (
              <EmptyState
                description={t("ui.TaskApprovals.lasTareasQueLosClientes")}
                icon={<Inbox />}
                title={t(
                  "ui.TaskApprovals.noHayTareasPendientesDe",
                  "No hay tareas pendientes de aprobación",
                )}
              />
            ) : (
              <DataTable
                columns={columns}
                data={rows}
                emptyState={
                  <EmptyState
                    description={t("ui.TaskApprovals.lasTareasQueLosClientes")}
                    icon={<Inbox />}
                    title={t(
                      "ui.TaskApprovals.noHayTareasPendientesDe2",
                      "No hay tareas pendientes de aprobación",
                    )}
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
